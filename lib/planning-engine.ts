// SmallSteps Planning Engine
// Core intelligence for daily task allocation and adaptive scheduling

import { goalsDB, tasksDB, dailyAllocationsDB, taskProgressDB } from './db';
import type { Goal, Task, DailyAllocation } from './schema';
import {
    getLocalDateString,
    isTaskEffectivelyComplete,
    minutesToEffortLabel,
    EFFORT_MAPPING
} from './schema';

// ============================================
// Configuration Constants
// ============================================

// Soft limits - these adapt based on user history
const DEFAULT_DAILY_UNITS = 3;
const MIN_DAILY_UNITS = 2;
const MAX_DAILY_UNITS = 5;
const MAX_HEAVY_PER_DAY = 1;

// Effort unit weights for capacity calculation
const EFFORT_WEIGHTS = {
    light: 1,
    medium: 2,
    heavy: 4,
} as const;

// ============================================
// Types
// ============================================

interface AllocatedTask {
    task: Task;
    goal: Goal;
    effortUnits: number;
}

interface DailyPlan {
    date: string;
    tasks: AllocatedTask[];
    totalEffortUnits: number;
    estimatedMinutes: number;
    capacityNote?: string;
}

interface CapacityEstimate {
    dailyUnits: number;
    averageMinutes: number;
    confidence: 'low' | 'medium' | 'high';
    basedOnDays: number;
}

// ============================================
// Capacity Estimation
// ============================================

/**
 * Estimate user's daily capacity based on historical completion patterns
 * Uses last 14 days of data to infer sustainable workload
 */
export async function estimateDailyCapacity(): Promise<CapacityEstimate> {
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Get recent allocations
    const allAllocations = await dailyAllocationsDB.getAll();
    const recentAllocations = allAllocations.filter((a) => {
        const allocDate = new Date(a.date);
        return allocDate >= twoWeeksAgo && allocDate < today;
    });

    if (recentAllocations.length < 3) {
        // Not enough history, return defaults
        return {
            dailyUnits: DEFAULT_DAILY_UNITS,
            averageMinutes: 60,
            confidence: 'low',
            basedOnDays: recentAllocations.length,
        };
    }

    // Calculate average completed effort
    const completedAllocations = recentAllocations.filter((a) => a.completedAt);
    const avgLoad = completedAllocations.reduce((sum, a) => sum + a.estimatedLoad, 0) /
        (completedAllocations.length || 1);

    // Clamp to reasonable range
    const dailyUnits = Math.max(MIN_DAILY_UNITS, Math.min(MAX_DAILY_UNITS, Math.round(avgLoad)));

    return {
        dailyUnits,
        averageMinutes: dailyUnits * 20, // Rough estimate: 1 unit ≈ 20 min average
        confidence: completedAllocations.length >= 7 ? 'high' : 'medium',
        basedOnDays: completedAllocations.length,
    };
}

// ============================================
// Task Selection & Prioritization
// ============================================

interface WeightedTask {
    task: Task;
    goal: Goal;
    weight: number;
}

/**
 * Calculate implicit priority weight for a task
 * Higher weight = more likely to be selected today
 * 
 * Factors:
 * - Goal target date proximity
 * - Task skip frequency (less skips = lower urgency)
 * - Goal progress (balance across goals)
 * - Recurring tasks get slight boost
 */
function calculateTaskWeight(task: Task, goal: Goal): number {
    let weight = 100; // Base weight

    // 1. Target date proximity (only if goal has target)
    if (goal.targetDate) {
        const today = new Date();
        const target = new Date(goal.targetDate);
        const daysUntilTarget = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilTarget <= 7) {
            weight += 50; // Boost for tasks due soon
        } else if (daysUntilTarget <= 30) {
            weight += 20;
        }
        // No penalty for far-off dates - quiet, not urgent
    }

    // 2. Skip frequency (more skips = slightly lower priority, let user avoid it)
    if (task.skipCount > 3) {
        weight -= 15; // Reduce priority if frequently skipped
    }

    // 3. Recurring tasks get a small boost (daily habits should appear)
    if (task.isRecurring) {
        weight += 10;
    }

    // 4. Progress balance (tasks with less progress in their goal get slight boost)
    const progressPercent = task.completedMinutes / (task.estimatedTotalMinutes || 1);
    if (progressPercent < 0.3) {
        weight += 10; // Boost early-stage tasks
    }

    return Math.max(0, weight);
}

/**
 * Select tasks for today from all active goals
 * Balances across goals and respects effort limits
 */
async function selectTasksForDate(date: string, capacity: CapacityEstimate): Promise<AllocatedTask[]> {
    const activeGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    // Filter to incomplete tasks from active goals
    const eligibleTasks: WeightedTask[] = [];

    for (const goal of activeGoals) {
        const goalTasks = allTasks.filter(
            (t) => t.goalId === goal.id && !isTaskEffectivelyComplete(t)
        );

        for (const task of goalTasks) {
            eligibleTasks.push({
                task,
                goal,
                weight: calculateTaskWeight(task, goal),
            });
        }
    }

    // Sort by weight (descending)
    eligibleTasks.sort((a, b) => b.weight - a.weight);

    // Select tasks up to capacity
    const selected: AllocatedTask[] = [];
    let totalUnits = 0;
    let heavyCount = 0;

    for (const { task, goal } of eligibleTasks) {
        const effortUnits = EFFORT_WEIGHTS[task.effortLabel];

        // Check limits
        if (totalUnits + effortUnits > capacity.dailyUnits) continue;
        if (task.effortLabel === 'heavy' && heavyCount >= MAX_HEAVY_PER_DAY) continue;

        selected.push({ task, goal, effortUnits });
        totalUnits += effortUnits;
        if (task.effortLabel === 'heavy') heavyCount++;

        // Stop if we've hit capacity
        if (totalUnits >= capacity.dailyUnits) break;
    }

    return selected;
}

// ============================================
// Daily Plan Generation
// ============================================

/**
 * Generate today's plan
 * This is the main entry point for the Planning Engine
 */
export async function generateDailyPlan(date: string = getLocalDateString()): Promise<DailyPlan> {
    // Check if we already have an allocation for this date
    const existing = await dailyAllocationsDB.getByDate(date);
    if (existing) {
        // Return existing plan with current task data
        const tasks = await tasksDB.getAll();
        const goals = await goalsDB.getAll();

        const allocatedTasks: AllocatedTask[] = existing.taskIds
            .map((id) => {
                const task = tasks.find((t) => t.id === id);
                if (!task) return null;
                const goal = goals.find((g) => g.id === task.goalId);
                if (!goal) return null;
                return { task, goal, effortUnits: EFFORT_WEIGHTS[task.effortLabel] as number };
            })
            .filter((t): t is AllocatedTask => t !== null);

        return {
            date,
            tasks: allocatedTasks,
            totalEffortUnits: existing.estimatedLoad,
            estimatedMinutes: allocatedTasks.reduce((sum, a) => sum + a.task.estimatedTotalMinutes, 0),
        };
    }

    // Generate new plan
    const capacity = await estimateDailyCapacity();
    const selectedTasks = await selectTasksForDate(date, capacity);

    const totalUnits = selectedTasks.reduce((sum, t) => sum + t.effortUnits, 0);
    const totalMinutes = selectedTasks.reduce((sum, t) => sum + t.task.estimatedTotalMinutes, 0);

    // Save allocation
    await dailyAllocationsDB.create({
        date,
        taskIds: selectedTasks.map((t) => t.task.id),
        estimatedLoad: totalUnits,
    });

    let capacityNote: string | undefined;
    if (capacity.confidence === 'low') {
        capacityNote = "We're still learning your rhythm. This is a gentle starting point.";
    }

    return {
        date,
        tasks: selectedTasks,
        totalEffortUnits: totalUnits,
        estimatedMinutes: totalMinutes,
        capacityNote,
    };
}

// ============================================
// Skip Handling
// ============================================

/**
 * Handle a skipped task gracefully
 * - Records skip for adaptation
 * - Potentially reallocates to a future day
 * - No punishment, no warnings
 */
export async function handleSkip(taskId: string, date: string = getLocalDateString()): Promise<void> {
    // Record the skip on the task
    await tasksDB.recordSkip(taskId);

    // Remove from today's allocation
    const allocation = await dailyAllocationsDB.getByDate(date);
    if (allocation) {
        const newTaskIds = allocation.taskIds.filter((id) => id !== taskId);
        const task = await tasksDB.getById(taskId);
        const newLoad = allocation.estimatedLoad - (task ? EFFORT_WEIGHTS[task.effortLabel] : 0);

        await dailyAllocationsDB.update(date, {
            taskIds: newTaskIds,
            estimatedLoad: Math.max(0, newLoad),
        });
    }

    // If task has been skipped many times, consider reducing effort estimate
    const task = await tasksDB.getById(taskId);
    if (task && task.skipCount >= 5 && task.effortLabel !== 'light') {
        // Reduce perceived effort - make it feel more doable
        const newLabel = task.effortLabel === 'heavy' ? 'medium' : 'light';
        await tasksDB.update(taskId, { effortLabel: newLabel });
    }
}

// ============================================
// Progress Recording
// ============================================

/**
 * Record time spent on a task
 * Updates task progress and daily stats
 */
export async function recordTaskProgress(
    taskId: string,
    minutes: number,
    date: string = getLocalDateString()
): Promise<Task | undefined> {
    // Record progress entry
    await taskProgressDB.record(taskId, date, minutes);

    // Get updated task
    return tasksDB.getById(taskId);
}

// ============================================
// Plan Regeneration
// ============================================

/**
 * Force regenerate today's plan
 * Used when user wants a fresh allocation
 */
export async function regenerateDailyPlan(date: string = getLocalDateString()): Promise<DailyPlan> {
    // Delete existing allocation
    const existing = await dailyAllocationsDB.getByDate(date);
    if (existing) {
        // We can't delete from IndexedDB easily, so we'll just overwrite
        const capacity = await estimateDailyCapacity();
        const selectedTasks = await selectTasksForDate(date, capacity);

        const totalUnits = selectedTasks.reduce((sum, t) => sum + t.effortUnits, 0);

        await dailyAllocationsDB.update(date, {
            taskIds: selectedTasks.map((t) => t.task.id),
            estimatedLoad: totalUnits,
            completedAt: undefined,
        });

        return {
            date,
            tasks: selectedTasks,
            totalEffortUnits: totalUnits,
            estimatedMinutes: selectedTasks.reduce((sum, t) => sum + t.task.estimatedTotalMinutes, 0),
        };
    }

    return generateDailyPlan(date);
}
