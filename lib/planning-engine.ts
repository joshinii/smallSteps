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
const MAX_DIVE_PER_DAY = 1;

// Default daily capacity if no history (240 minutes = 4 hours)
const DEFAULT_DAILY_MINUTES = 240;

// Max daily workload warning threshold (5 hours)
const MAX_DAILY_WORKLOAD_MINUTES = 300;

// Effort unit weights for capacity calculation
const EFFORT_WEIGHTS = {
    'warm-up': 1,
    'settle': 2,
    'dive': 4,
} as const;

// ============================================
// Types
// ============================================

interface AllocatedTask {
    task: Task;
    goal: Goal;
    effortUnits: number;
}

type DayType = 'gentle' | 'balanced' | 'focused' | 'energetic' | 'recovery';

// Preset mode configuration
const PRESET_MODES = {
    gentle: {
        capacityMultiplier: 0.6,
        description: 'Only high-priority + low-effort tasks',
    },
    focused: {
        capacityMultiplier: 1.0,
        description: 'Normal priority-based selection',
    },
    energetic: {
        capacityMultiplier: 1.2,
        description: 'Allow stretch tasks + pull from upcoming',
    },
    recovery: {
        capacityMultiplier: 0.4,
        description: 'Maintenance + essentials only',
    },
    balanced: {
        capacityMultiplier: 1.0,
        description: 'Balanced day (default)',
    },
} as const;

interface DailyPlan {
    date: string;
    dayType: DayType;
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

    // Analyze trend: are completion rates improving or declining?
    const recentHalf = completedAllocations.slice(-Math.ceil(completedAllocations.length / 2));
    const olderHalf = completedAllocations.slice(0, Math.floor(completedAllocations.length / 2));

    const recentAvg = recentHalf.reduce((sum, a) => sum + a.estimatedLoad, 0) / (recentHalf.length || 1);
    const olderAvg = olderHalf.reduce((sum, a) => sum + a.estimatedLoad, 0) / (olderHalf.length || 1);

    let adjustedLoad = avgLoad;

    // Prefer reducing load over increasing - be conservative
    if (recentAvg < olderAvg * 0.8) {
        // Declining trend - reduce capacity proactively
        adjustedLoad = Math.max(MIN_DAILY_UNITS, Math.floor(avgLoad - 0.5));
    } else if (recentAvg > olderAvg * 1.2 && completedAllocations.length >= 7) {
        // Strong positive trend for a week+ - cautiously increase
        adjustedLoad = Math.min(MAX_DAILY_UNITS, Math.ceil(avgLoad + 0.5));
    }

    // Clamp to reasonable range
    const dailyUnits = Math.max(MIN_DAILY_UNITS, Math.min(MAX_DAILY_UNITS, Math.round(adjustedLoad)));

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
 * - Newly created tasks weighted neutrally (not penalized for lack of history)
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
    // Newly created tasks have skipCount = 0, so they're weighted neutrally
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

    // 5. Newly created tasks (no completion history) get neutral treatment
    // They're not penalized - use their effort label for capacity calculation
    // This is already handled by not having negative adjustments for new tasks

    return Math.max(0, weight);
}

/**
 * Select tasks for today from all active goals
 * Balances across goals and respects effort limits
 * Applies mode-specific filtering rules
 */
async function selectTasksForDate(date: string, capacity: CapacityEstimate, mode: DayType = 'balanced'): Promise<AllocatedTask[]> {
    const activeGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    // Filter to incomplete tasks from active goals
    // Filter to incomplete tasks from active goals
    let eligibleTasks: WeightedTask[] = [];

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

    // Filter by frequency
    const dayOfWeek = new Date(date).getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    eligibleTasks = eligibleTasks.filter(({ task }) => {
        if (!task.frequency) return true; // Default to daily/anytime
        if (task.frequency === 'daily') return true;
        if (task.frequency === 'weekdays') return !isWeekend;
        if (task.frequency === 'weekends') return isWeekend;
        // For 'weekly', we rely on weight/priority, or we could check if done this week
        // For now, treat 'weekly' as available anytime until valid
        return true;
    });

    // Apply mode-specific filtering
    if (mode === 'gentle' || mode === 'recovery') {
        // Only include high-priority AND low-effort tasks
        eligibleTasks = eligibleTasks.filter(({ task }) => {
            // High priority = top 50% of weights
            const isHighPriority = true; // Already sorted, so top tasks are high priority
            // Low effort = warm-up or settle only (no dive)
            const isLowEffort = task.effortLabel === 'warm-up' || task.effortLabel === 'settle';
            return isLowEffort;
        });
    } else if (mode === 'energetic') {
        // Allow all tasks including stretch tasks (no filtering)
        // Energetic mode uses higher capacity multiplier to pull more tasks
    }

    // Sort by weight (descending)
    eligibleTasks.sort((a, b) => b.weight - a.weight);

    // Select tasks up to capacity
    const selected: AllocatedTask[] = [];
    let totalUnits = 0;
    let diveCount = 0;

    for (const { task, goal } of eligibleTasks) {
        const effortUnits = EFFORT_WEIGHTS[task.effortLabel];

        // Check limits
        if (totalUnits + effortUnits > capacity.dailyUnits) continue;

        // For recovery mode, be even more strict with dive tasks
        if (mode === 'recovery' && task.effortLabel === 'dive') continue;
        if (task.effortLabel === 'dive' && diveCount >= MAX_DIVE_PER_DAY) continue;

        selected.push({ task, goal, effortUnits });
        totalUnits += effortUnits;
        if (task.effortLabel === 'dive') diveCount++;

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
export async function generateDailyPlan(date: string = getLocalDateString(), dayType: DayType = 'balanced'): Promise<DailyPlan> {
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
            dayType: existing.dayType || 'balanced',
            tasks: allocatedTasks,
            totalEffortUnits: existing.estimatedLoad,
            estimatedMinutes: allocatedTasks.reduce((sum, a) => sum + a.task.estimatedTotalMinutes, 0),
        };
    }

    // Generate new plan with mode-specific capacity
    const baseCapacity = await estimateDailyCapacity();

    // Apply preset mode multiplier
    const modeConfig = PRESET_MODES[dayType] || PRESET_MODES.balanced;
    const adjustedCapacity = {
        ...baseCapacity,
        dailyUnits: Math.max(MIN_DAILY_UNITS, Math.min(MAX_DAILY_UNITS, Math.round(baseCapacity.dailyUnits * modeConfig.capacityMultiplier))),
    };

    const selectedTasks = await selectTasksForDate(date, adjustedCapacity, dayType);

    const totalUnits = selectedTasks.reduce((sum, t) => sum + t.effortUnits, 0);
    const totalMinutes = selectedTasks.reduce((sum, t) => sum + t.task.estimatedTotalMinutes, 0);

    // Save allocation
    await dailyAllocationsDB.create({
        date,
        taskIds: selectedTasks.map((t) => t.task.id),
        estimatedLoad: totalUnits,
        dayType,
    });

    let capacityNote: string | undefined;
    if (baseCapacity.confidence === 'low' && dayType === 'balanced') {
        capacityNote = "We're still learning your rhythm. This is a gentle starting point.";
    }

    return {
        date,
        dayType,
        tasks: selectedTasks,
        totalEffortUnits: totalUnits,
        estimatedMinutes: totalMinutes,
        capacityNote,
    };
}

// ============================================
// Skip Handling
// ============================================

interface SkipResult {
    timelineAdjusted?: boolean;
    message?: string;
}

/**
 * Consider if a goal's timeline needs adjustment based on skip patterns
 */
async function considerTimelineAdjustment(goal: Goal, task: Task): Promise<{
    shouldAdjust: boolean;
    newDate?: string;
    reason?: string;
}> {
    if (!goal.targetDate) {
        return { shouldAdjust: false };
    }

    // Get all tasks for this goal
    const allTasks = await tasksDB.getByGoalId(goal.id);
    const incompleteTasks = allTasks.filter((t) => !isTaskEffectivelyComplete(t));

    // Calculate average skip count
    const avgSkips = incompleteTasks.reduce((sum, t) => sum + t.skipCount, 0) / (incompleteTasks.length || 1);

    // If this task has been skipped 3+ times and average skips is high, extend timeline
    if (task.skipCount >= 3 && avgSkips >= 2) {
        const currentTarget = new Date(goal.targetDate);
        const today = new Date();
        const daysRemaining = Math.ceil((currentTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Extend by 2 weeks if less than a month remains, otherwise 1 month
        const extensionDays = daysRemaining < 30 ? 14 : 30;
        const newTarget = new Date(currentTarget);
        newTarget.setDate(newTarget.getDate() + extensionDays);

        return {
            shouldAdjust: true,
            newDate: newTarget.toISOString().split('T')[0],
            reason: 'to keep this manageable'
        };
    }

    return { shouldAdjust: false };
}

/**
 * Handle a skipped task gracefully
 * - Records skip for adaptation
 * - Potentially reallocates to a future day
 * - May adjust goal timeline if needed
 * - No punishment, no warnings
 */
export async function handleSkip(taskId: string, date: string = getLocalDateString()): Promise<SkipResult> {
    // Record the skip on the task
    await tasksDB.recordSkip(taskId);

    // Move to end of today's allocation (rotate)
    const allocation = await dailyAllocationsDB.getByDate(date);
    if (allocation) {
        const newTaskIds = allocation.taskIds.filter((id) => id !== taskId);
        newTaskIds.push(taskId); // Add to end

        await dailyAllocationsDB.update(date, {
            taskIds: newTaskIds,
            // Load remains the same
        });
    }

    // Get task and goal for timeline adjustment check
    const task = await tasksDB.getById(taskId);
    if (!task) return {};

    const goal = await goalsDB.getById(task.goalId);
    if (!goal) return {};

    // Check if goal timeline needs adjustment
    if (goal.targetDate && task.skipCount >= 3) {
        const adjustment = await considerTimelineAdjustment(goal, task);
        if (adjustment.shouldAdjust && adjustment.newDate) {
            await goalsDB.update(goal.id, {
                targetDate: adjustment.newDate,
                estimatedTargetDate: adjustment.newDate
            });
            return {
                timelineAdjusted: true,
                message: `We've adjusted the timeline ${adjustment.reason}.`
            };
        }
    }

    // If task has been skipped many times, consider reducing effort estimate
    if (task.skipCount >= 5 && task.effortLabel !== 'warm-up') {
        // Reduce perceived effort - make it feel more doable
        const newLabel = task.effortLabel === 'dive' ? 'settle' : 'warm-up';
        await tasksDB.update(taskId, { effortLabel: newLabel });
    }

    return {};
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
export async function regenerateDailyPlan(date: string = getLocalDateString(), dayType: DayType = 'balanced'): Promise<DailyPlan> {
    // Delete existing allocation
    const existing = await dailyAllocationsDB.getByDate(date);
    if (existing) {
        // Apply preset mode multiplier
        const baseCapacity = await estimateDailyCapacity();
        const modeConfig = PRESET_MODES[dayType] || PRESET_MODES.balanced;
        const adjustedCapacity = {
            ...baseCapacity,
            dailyUnits: Math.max(MIN_DAILY_UNITS, Math.min(MAX_DAILY_UNITS, Math.round(baseCapacity.dailyUnits * modeConfig.capacityMultiplier))),
        };

        const selectedTasks = await selectTasksForDate(date, adjustedCapacity, dayType);

        const totalUnits = selectedTasks.reduce((sum, t) => sum + t.effortUnits, 0);

        await dailyAllocationsDB.update(date, {
            taskIds: selectedTasks.map((t) => t.task.id),
            estimatedLoad: totalUnits,
            dayType,
            completedAt: undefined,
        });

        return {
            date,
            dayType,
            tasks: selectedTasks,
            totalEffortUnits: totalUnits,
            estimatedMinutes: selectedTasks.reduce((sum, t) => sum + t.task.estimatedTotalMinutes, 0),
        };
    }

    return generateDailyPlan(date, dayType);
}

// ============================================
// Auto-Reassessment
// ============================================

/**
 * Trigger reassessment of daily plans when goals change
 * Regenerates today + future dates, but preserves manual reordering for today
 */
export async function reassessDailyPlans(): Promise<void> {
    const today = getLocalDateString();
    const todayAllocation = await dailyAllocationsDB.getByDate(today);

    // Get today's current task order (preserve manual reordering)
    const todayTaskOrder = todayAllocation?.taskIds || [];

    // Regenerate today's plan
    await regenerateDailyPlan(today);

    // If user had manually reordered tasks today, restore that order
    if (todayTaskOrder.length > 0 && todayAllocation) {
        const newAllocation = await dailyAllocationsDB.getByDate(today);
        if (newAllocation) {
            // Merge: keep manually ordered tasks at their positions, add new tasks at end
            const newTaskIds = newAllocation.taskIds;
            const orderedIds: string[] = [];
            const usedIds = new Set<string>();

            // First, add tasks that were in the old order (if they still exist)
            for (const id of todayTaskOrder) {
                if (newTaskIds.includes(id)) {
                    orderedIds.push(id);
                    usedIds.add(id);
                }
            }

            // Then add any new tasks that weren't in the old order
            for (const id of newTaskIds) {
                if (!usedIds.has(id)) {
                    orderedIds.push(id);
                }
            }

            await dailyAllocationsDB.update(today, { taskIds: orderedIds });
        }
    }

    // For future dates, just clear allocations so they regenerate naturally
    // (Don't pre-generate future dates, let them generate on-demand)
}

// ============================================
// Target Date Feasibility Assessment
// ============================================

export interface FeasibilityResult {
    isFeasible: boolean;
    suggestedDate?: string;
    message?: string;
    dailyCapacityMinutes: number;
    totalTaskMinutes: number;
    daysNeeded: number;
    daysAvailable: number;
}

/**
 * Assess if a target date is realistic given:
 * - Total task time estimate
 * - User's daily capacity (from history or default)
 * - Existing goals and habits
 */
export async function assessTargetDateFeasibility(
    totalTaskMinutes: number,
    targetDate: string,
    excludeGoalId?: string // When editing, exclude the goal being edited
): Promise<FeasibilityResult> {
    const today = new Date();
    const target = new Date(targetDate);

    // Calculate days available
    const daysAvailable = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Get user's daily capacity
    const capacity = await estimateDailyCapacity();
    const dailyCapacityMinutes = capacity.confidence === 'low'
        ? DEFAULT_DAILY_MINUTES
        : capacity.averageMinutes;

    // Calculate existing workload from other active goals
    const allGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    let existingDailyMinutes = 0;
    for (const goal of allGoals) {
        if (excludeGoalId && goal.id === excludeGoalId) continue;

        const goalTasks = allTasks.filter(t =>
            t.goalId === goal.id && !isTaskEffectivelyComplete(t)
        );

        // Estimate daily allocation for this goal
        const totalGoalMinutes = goalTasks.reduce((sum, t) =>
            sum + (t.estimatedTotalMinutes - t.completedMinutes), 0
        );

        if (goal.targetDate) {
            const goalTarget = new Date(goal.targetDate);
            const goalDaysAvailable = Math.max(1, Math.ceil((goalTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
            existingDailyMinutes += totalGoalMinutes / goalDaysAvailable;
        } else {
            // No target date, assume spread across 30 days
            existingDailyMinutes += totalGoalMinutes / 30;
        }
    }

    // Available capacity for this new goal
    const availableCapacity = Math.max(0, dailyCapacityMinutes - existingDailyMinutes);

    // Days needed to complete the new goal
    const daysNeeded = availableCapacity > 0
        ? Math.ceil(totalTaskMinutes / availableCapacity)
        : Infinity;

    // Check feasibility
    if (daysNeeded <= daysAvailable) {
        return {
            isFeasible: true,
            dailyCapacityMinutes,
            totalTaskMinutes,
            daysNeeded,
            daysAvailable,
        };
    }

    // Not feasible - suggest a realistic date
    const suggestedDaysNeeded = Math.ceil(daysNeeded * 1.1); // Add 10% buffer
    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + suggestedDaysNeeded);

    return {
        isFeasible: false,
        suggestedDate: suggestedDate.toISOString().split('T')[0],
        message: `Given your current pace and existing goals, this timeline may be too tight. We can stretch it to make this sustainable.`,
        dailyCapacityMinutes,
        totalTaskMinutes,
        daysNeeded,
        daysAvailable,
    };
}

/**
 * Suggest a realistic target date based on task estimates and capacity
 */
export async function suggestTargetDate(
    totalTaskMinutes: number,
    excludeGoalId?: string
): Promise<string> {
    const today = new Date();

    // Get capacity
    const capacity = await estimateDailyCapacity();
    const dailyCapacityMinutes = capacity.confidence === 'low'
        ? DEFAULT_DAILY_MINUTES
        : capacity.averageMinutes;

    // Calculate existing workload
    const allGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    let existingDailyMinutes = 0;
    for (const goal of allGoals) {
        if (excludeGoalId && goal.id === excludeGoalId) continue;

        const goalTasks = allTasks.filter(t =>
            t.goalId === goal.id && !isTaskEffectivelyComplete(t)
        );

        const totalGoalMinutes = goalTasks.reduce((sum, t) =>
            sum + (t.estimatedTotalMinutes - t.completedMinutes), 0
        );

        if (goal.targetDate) {
            const goalTarget = new Date(goal.targetDate);
            const goalDaysAvailable = Math.max(1, Math.ceil((goalTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
            existingDailyMinutes += totalGoalMinutes / goalDaysAvailable;
        } else {
            existingDailyMinutes += totalGoalMinutes / 30;
        }
    }

    const availableCapacity = Math.max(dailyCapacityMinutes * 0.5, dailyCapacityMinutes - existingDailyMinutes);
    const daysNeeded = Math.ceil(totalTaskMinutes / availableCapacity);

    // Add 20% buffer for realism
    const bufferedDays = Math.ceil(daysNeeded * 1.2);

    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + bufferedDays);

    return suggestedDate.toISOString().split('T')[0];
}

/**
 * Check if total daily workload across all goals exceeds healthy limit
 */
export async function assessTotalWorkload(): Promise<{
    isOverloaded: boolean;
    totalDailyMinutes: number;
    message?: string;
}> {
    const allGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();
    const today = new Date();

    let totalDailyMinutes = 0;

    for (const goal of allGoals) {
        const goalTasks = allTasks.filter(t =>
            t.goalId === goal.id && !isTaskEffectivelyComplete(t)
        );

        const totalGoalMinutes = goalTasks.reduce((sum, t) =>
            sum + (t.estimatedTotalMinutes - t.completedMinutes), 0
        );

        if (goal.targetDate) {
            const goalTarget = new Date(goal.targetDate);
            const daysAvailable = Math.max(1, Math.ceil((goalTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
            totalDailyMinutes += totalGoalMinutes / daysAvailable;
        } else {
            // Lifelong/no date goals - estimate as spread across 30 days
            totalDailyMinutes += totalGoalMinutes / 30;
        }
    }

    if (totalDailyMinutes > MAX_DAILY_WORKLOAD_MINUTES) {
        return {
            isOverloaded: true,
            totalDailyMinutes,
            message: `Your current goals add up to about ${Math.round(totalDailyMinutes / 60)} hours of work per day. Consider extending some timelines or reducing scope to keep things sustainable.`,
        };
    }

    return {
        isOverloaded: false,
        totalDailyMinutes,
    };
}
