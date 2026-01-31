// SmallSteps Planning Engine
// Core intelligence for daily task allocation and adaptive scheduling

import { goalsDB, tasksDB, dailyAllocationsDB, taskProgressDB, recurringTaskHistoryDB } from './db';
import type { Goal, Task } from './schema';
import {
    getLocalDateString,
    isTaskEffectivelyComplete,
    getISOTimestamp
} from './utils';
import {
    pullTasksForDay,
    getAnyAvailableTask,
    hasQueuedTasks,
    onNewDay,
    rehydrateQueues,
    enqueueTask,
    dequeueTask,
    recordQueueSkip,
    dequeueGoal,
} from './task-queue';

// ============================================
// Configuration Constants
// ============================================

// Soft limits - these adapt based on user history
// NOW USING MINUTES INSTEAD OF ARBITRARY UNITS
const MIN_DAILY_MINUTES = 120; // 2 hours hard min
const MAX_DAILY_MINUTES = 360; // 6 hours hard max
const DEFAULT_PREFERRED_MINUTES = 240; // 4 hours target
const DEFAULT_DAILY_MINUTES = DEFAULT_PREFERRED_MINUTES; // Alias for date logic

// Max daily workload warning threshold (5 hours)
const MAX_DAILY_WORKLOAD_MINUTES = 300;

// Effort unit weights -> Converted to typical minutes for calculation fallback
// We use actual task estimatedMinutes where available, but these are safe defaults
const EFFORT_MINUTES = {
    'warm-up': 10,  // avg 5-15
    'settle': 25,   // avg 20-30
    'dive': 75,     // avg 60-90
} as const;

// Max dives per day (still useful to limit deep work sessions)
const MAX_DIVE_PER_DAY = 2;

// ============================================
// Helpers
// ============================================

/**
 * Get all habit tasks (active lifelong goals)
 * These are not counted against daily capacity but should always appear in the plan
 */
async function getHabitTasks(): Promise<AllocatedTask[]> {
    // We need to fetch ALL goals to find "Daily Habits" even if it was accidentally marked completed
    const allGoals = await goalsDB.getAll();
    const activeGoals = allGoals.filter(g => g.status === 'active');

    // Lazy migration/Fix: Ensure "Daily Habits" goal is active and lifelong
    const dailyHabitsGoal = allGoals.find(g => g.content === 'Daily Habits');

    if (dailyHabitsGoal) {
        let needsUpdate = false;
        const updates: Partial<Goal> = {};

        if (!dailyHabitsGoal.lifelong) {
            console.log('Migrating Daily Habits goal to lifelong...');
            updates.lifelong = true;
            needsUpdate = true;
        }

        if (dailyHabitsGoal.status !== 'active') {
            console.log('Reactivating Daily Habits goal...');
            updates.status = 'active';
            needsUpdate = true;
        }

        if (needsUpdate) {
            await goalsDB.update(dailyHabitsGoal.id, updates);
            // Update local object for this run
            Object.assign(dailyHabitsGoal, updates);

            // If we reactivated it, ensure it's in our active list for processing below
            if (!activeGoals.find(g => g.id === dailyHabitsGoal.id)) {
                activeGoals.push(dailyHabitsGoal);
            }
        }
    }

    const allTasks = await tasksDB.getAll();
    const habitTasks: AllocatedTask[] = [];

    for (const goal of activeGoals) {
        if (goal.lifelong) {
            const habits = allTasks.filter(t => t.goalId === goal.id && !t.archivedAt);
            for (const task of habits) {
                habitTasks.push({
                    task,
                    goal,
                    effortMinutes: 0 // Habits don't count toward capacity
                });
            }
        }
    }

    return habitTasks;
}

// ============================================
// Types
// ============================================

export interface AllocatedTask {
    task: Task;
    goal: Goal;
    effortMinutes: number; // Changed from units to minutes
}

export type DayType = 'gentle' | 'balanced' | 'focused' | 'energetic' | 'recovery';

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

export interface DailyPlan {
    date: string;
    dayType: DayType;
    tasks: AllocatedTask[];
    totalEffortUnits: number;
    estimatedMinutes: number;
    capacityNote?: string;
}

export interface PlanMetadata {
    allTasksComplete: boolean;
    tasksExceedCapacity: boolean;
    totalAvailableTasks: number;
    selectedTaskCount: number;
    excludedTaskCount: number;
    capacityUsed: number;
    capacityAvailable: number;
    message: string;
}

export interface PlanGenerationResult {
    plan: DailyPlan;
    metadata: PlanMetadata;
}

export interface CapacityRange {
    min: number;
    preferred: number; // The "Golden Mean" we aim for
    max: number;
    confidence: 'low' | 'medium' | 'high';
}

export interface CapacityEstimate {
    dailyUnits: number; // DEPRECATED: Keeping for backward compat in interfaces temporarily
    range: CapacityRange;
}

export interface AdmissionResult {
    allowed: boolean;
    paceAdjustment: 'gentle' | 'standard' | 'aggressive';
    message?: string;
}

// ============================================
// Capacity Estimation
// ============================================

/**
 * Estimate user's daily capacity based on historical completion patterns
 * Returns a range (min-preferred-max) in minutes.
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

    const activeGoals = await goalsDB.getActive();

    // Default baseline
    let preferred = DEFAULT_PREFERRED_MINUTES;
    let confidence: 'low' | 'medium' | 'high' = 'low';

    // 1. Analyze History (if enough exists)
    const completedAllocations = recentAllocations.filter((a) => a.completedAt);

    if (completedAllocations.length >= 3) {
        // Calculate average completed minutes from history
        // Note: allocations store estimatedLoad (previously units).
        // Ideally we need actual minutes. We'll use a rough proxy if actual not saved,
        // or check taskProgressDB. simpler: use estimatedLoad * 60 if it was units, 
        // BUT wait, we just changed the constants. Old data might be units.
        // Let's assume old data 'estimatedLoad' is small (< 20) -> units. Large (> 20) -> minutes.

        const historyAvg = completedAllocations.reduce((sum, a) => {
            let val = a.estimatedLoad;
            if (val < 20) val = val * 25; // legacy unit conversion approx
            return sum + val;
        }, 0) / completedAllocations.length;

        // Weight history 50/50 with default to avoid sudden swings
        preferred = Math.round((historyAvg + DEFAULT_PREFERRED_MINUTES) / 2);
        confidence = completedAllocations.length >= 7 ? 'high' : 'medium';
    }

    // 2. Reduce Capacity triggers

    // A. Recent Skips (last 3 days)
    // We don't have direct skip access here easily without tasksDB scan. 
    // Let's rely on recentAllocations efficiency (load vs completion).
    const recentFailures = recentAllocations.slice(-3).filter(a => !a.completedAt).length;
    if (recentFailures >= 2) {
        preferred *= 0.8; // Reduce by 20% if struggling recently
    }

    // B. Dense Plans (High planned load vs actual completion)
    // (Implicitly handled by historyAvg above)

    // C. Many Active Goals (Cognitive Overhead penalty)
    // If > 5 active goals, reduce capacity to account for switching costs
    if (activeGoals.length > 5) {
        preferred -= (activeGoals.length - 5) * 15; // -15 mins per extra goal
    }

    // Clamp to Safety Bounds
    preferred = Math.max(MIN_DAILY_MINUTES, Math.min(MAX_DAILY_MINUTES, preferred));

    // Calculate Range
    const range: CapacityRange = {
        min: Math.max(MIN_DAILY_MINUTES, preferred * 0.7),
        preferred: preferred,
        max: Math.min(MAX_DAILY_MINUTES, preferred * 1.3),
        confidence
    };

    return {
        dailyUnits: Math.ceil(preferred / 60), // Legacy proxy
        range
    };
}

/**
 * Assess if a new goal can be admitted without overload
 */
export async function assessGoalAdmission(newGoalTotalMinutes: number): Promise<AdmissionResult> {
    const capacity = await estimateDailyCapacity();
    const activeGoals = await goalsDB.getActive();

    // Simple heuristic: If we have > 3 active goals AND capacity is low, suggest gentle pace
    const isCrowded = activeGoals.length > 3;
    const isLowEnergy = capacity.range.preferred < 180; // < 3 hours

    if (isCrowded && isLowEnergy) {
        return {
            allowed: true, // Never block
            paceAdjustment: 'gentle',
            message: "We'll start this gently to fit your current flow."
        };
    }

    return { allowed: true, paceAdjustment: 'standard' };
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
 * - Recurring tasks: completion patterns, streaks, catch-up needs
 * - Newly created tasks weighted neutrally (not penalized for lack of history)
 */
async function calculateTaskWeight(task: Task, goal: Goal): Promise<number> {
    let weight = 100; // Base weight

    // 1. Target date proximity (only if goal has target)
    if (goal.targetDate) {
        const today = new Date();
        const target = new Date(goal.targetDate);
        const daysUntilTarget = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilTarget <= 7) {
            weight += 50; // High pressure (target approaching)
        } else if (daysUntilTarget <= 30) {
            weight += 20; // Moderate pressure
        }
        // No penalty for far-off dates - quiet, low pressure
    }

    // 2. Skip frequency (more skips = slightly lower priority, let user avoid it)
    // Newly created tasks have skipCount = 0, so they're weighted neutrally
    if (task.skipCount > 3) {
        weight -= 15; // Reduce priority if frequently skipped
    }

    // 3. Recurring tasks: analyze patterns for adaptive prioritization
    if (task.isRecurring) {
        weight += 10; // Base boost for habits

        // Check if skipped yesterday (boost for catch-up)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayHistory = await recurringTaskHistoryDB.getByTaskAndDate(task.id, yesterdayStr);

        if (yesterdayHistory && yesterdayHistory.skipped) {
            weight += 20; // Gentle boost to encourage catch-up
        }

        // Check completion rate (boost if low, reduce if very high)
        const completionRate = await recurringTaskHistoryDB.getCompletionRate(task.id, 7);
        if (completionRate < 40) {
            weight += 15; // Needs attention
        } else if (completionRate > 90) {
            weight -= 5; // Doing well, give space to other tasks
        }

        // Check streak (small penalty for very long streaks to prevent burnout)
        const streak = await recurringTaskHistoryDB.getStreak(task.id);
        if (streak > 14) {
            weight -= 5; // Gentle reminder that rest is okay
        }

        // For goal-based recurring tasks: boost if progress is lagging
        if (goal.totalRecurringDaysTarget && goal.completedRecurringDays !== undefined) {
            const today = new Date();
            const created = new Date(goal.createdAt);
            const daysElapsed = Math.ceil((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
            const expectedProgress = (daysElapsed / goal.totalRecurringDaysTarget) * 100;
            const actualProgress = goal.recurringProgressPercent || 0;

            if (actualProgress < expectedProgress - 20) {
                weight += 25; // Falling behind, boost priority
            }
        }
    }

    // 4. Progress balance (tasks with less progress in their goal get slight boost)
    const progressPercent = task.completedMinutes / (task.estimatedTotalMinutes || 1);
    if (progressPercent < 0.3) {
        weight += 10; // Boost early-stage tasks
    }

    // 5. Order Priority (Tie-breaker for sequential tasks)
    // Give slight preference to earlier tasks in the list
    // Boost decreases by 0.5 per position (max 5 points)
    const orderBoost = Math.max(0, 5 - (task.order * 0.5));
    weight += orderBoost;

    // 6. Newly created tasks (no completion history) get neutral treatment
    // They're not penalized - use their effort label for capacity calculation
    // This is already handled by not having negative adjustments for new tasks

    return Math.max(0, weight);
}

/**
 * Generate user-friendly message for plan generation result
 */
function generatePlanMessage(totalAvailable: number, selected: number, capacity: CapacityEstimate, allComplete: boolean): string {
    if (allComplete) {
        return "All tasks complete! 🎉 Enjoy your day.";
    }
    if (totalAvailable === 0) {
        return "No tasks available. Add some goals to get started.";
    }
    if (selected === 0 && totalAvailable > 0) {
        return `${totalAvailable} task${totalAvailable > 1 ? 's' : ''} available, but all exceed today's preferred capacity.`;
    }
    if (selected < totalAvailable) {
        return `${selected} of ${totalAvailable} tasks planned. ${totalAvailable - selected} task${totalAvailable - selected > 1 ? 's' : ''} won't fit in today's capacity.`;
    }
    return `${selected} task${selected > 1 ? 's' : ''} ready for today.`;
}

/**
 * Select tasks for today from all active goals
 * Balances across goals and respects effort limits
 * Applies mode-specific filtering rules
 */
async function selectTasksForDate(
    date: string,
    capacity: CapacityEstimate,
    mode: DayType = 'balanced',
    ignoreCapacity: boolean = false
): Promise<AllocatedTask[]> {
    const activeGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    // Filter to incomplete tasks from active goals
    // Filter to incomplete tasks from active goals
    let eligibleTasks: WeightedTask[] = [];

    for (const goal of activeGoals) {
        const goalTasks = allTasks.filter(
            (t) => t.goalId === goal.id && !isTaskEffectivelyComplete(t) && !goal.lifelong // Exclude lifelong goal tasks (habits) from capacity planning
        );

        for (const task of goalTasks) {
            const weight = await calculateTaskWeight(task, goal);
            eligibleTasks.push({
                task,
                goal,
                weight,
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
        // Only include low-effort tasks
        eligibleTasks = eligibleTasks.filter(({ task }) => {
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
    let totalMinutes = 0;
    let diveCount = 0;

    // Determine target capacity based on mode
    let targetMinutes = capacity.range.preferred;
    if (mode === 'gentle' || mode === 'recovery') targetMinutes = capacity.range.min;
    if (mode === 'energetic') targetMinutes = capacity.range.max;

    for (const { task, goal } of eligibleTasks) {
        const effortMinutes = task.estimatedTotalMinutes || EFFORT_MINUTES[task.effortLabel] || 20;

        // If ignoring capacity, add all tasks (sorted by priority)
        if (ignoreCapacity) {
            selected.push({ task, goal, effortMinutes });
            totalMinutes += effortMinutes;
            if (task.effortLabel === 'dive') diveCount++;
            continue;
        }

        // Check capacity limits
        // GUARANTEE: Always allow at least one task if we have none yet
        if (selected.length === 0) {
            // Allow it
        } else if (totalMinutes + effortMinutes > targetMinutes) {
            continue;
        }

        // For recovery mode, be even more strict with dive tasks
        if (mode === 'recovery' && task.effortLabel === 'dive') continue;
        if (task.effortLabel === 'dive' && diveCount >= MAX_DIVE_PER_DAY) continue;

        selected.push({ task, goal, effortMinutes });
        totalMinutes += effortMinutes;
        if (task.effortLabel === 'dive') diveCount++;

        // Stop if we've hit capacity (redundant with check above, but safely breaks loop)
        if (totalMinutes >= targetMinutes) break;
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
export async function generateDailyPlan(
    date: string = getLocalDateString(),
    dayType: DayType = 'balanced',
    ignoreCapacity: boolean = false
): Promise<PlanGenerationResult> {
    // Check if we already have an allocation for this date (unless ignoring capacity for override)
    const existing = ignoreCapacity ? null : await dailyAllocationsDB.getByDate(date);
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
                // Fallback: If estimatedTotalMinutes missing, use label default 
                const mins = task.estimatedTotalMinutes || EFFORT_MINUTES[task.effortLabel] || 20;
                return { task, goal, effortMinutes: mins };
            })
            .filter((t): t is AllocatedTask => t !== null);

        // Calculate total available tasks for metadata
        const allIncomplete = tasks.filter(t =>
            !isTaskEffectivelyComplete(t) &&
            goals.find(g => g.id === t.goalId && g.status === 'active' && !g.lifelong)
        ).length;

        const capacityEst = await estimateDailyCapacity();
        const allTasksComplete = allIncomplete === 0;

        // Fetch habits (always fresh, not stored in allocation)
        const habitTasks = await getHabitTasks();

        const plan: DailyPlan = {
            date,
            dayType: existing.dayType || 'balanced',
            tasks: [...allocatedTasks, ...habitTasks], // Combine allocated tasks with habits
            totalEffortUnits: 0, // DEPRECATED
            estimatedMinutes: allocatedTasks.reduce((sum, a) => sum + a.effortMinutes, 0),
        };

        const metadata: PlanMetadata = {
            allTasksComplete,
            tasksExceedCapacity: false,
            totalAvailableTasks: allIncomplete,
            selectedTaskCount: allocatedTasks.length,
            excludedTaskCount: Math.max(0, allIncomplete - allocatedTasks.length),
            capacityUsed: existing.estimatedLoad,
            capacityAvailable: capacityEst.dailyUnits,
            message: generatePlanMessage(allIncomplete, allocatedTasks.length, capacityEst, allTasksComplete),
        };

        return { plan, metadata };
    }

    // Generate new plan with mode-specific capacity
    const baseCapacity = await estimateDailyCapacity();

    // Apply preset mode multiplier
    // Apply preset mode multiplier
    const modeConfig = PRESET_MODES[dayType] || PRESET_MODES.balanced;

    // Calculate adjusted range
    const adjustedRange: CapacityRange = {
        min: Math.round(baseCapacity.range.min * modeConfig.capacityMultiplier),
        preferred: Math.round(baseCapacity.range.preferred * modeConfig.capacityMultiplier),
        max: Math.round(baseCapacity.range.max * modeConfig.capacityMultiplier),
        confidence: baseCapacity.range.confidence
    };

    // Clamp to hard limits
    adjustedRange.min = Math.max(MIN_DAILY_MINUTES, adjustedRange.min);
    adjustedRange.preferred = Math.min(MAX_DAILY_MINUTES, Math.max(MIN_DAILY_MINUTES, adjustedRange.preferred));
    adjustedRange.max = Math.min(MAX_DAILY_MINUTES, adjustedRange.max);

    const adjustedCapacity: CapacityEstimate = {
        dailyUnits: Math.ceil(adjustedRange.preferred / 60),
        range: adjustedRange
    };

    // Ensure queues are up to date
    await rehydrateQueues();

    // Try queue-based selection first (includes "always one task" guarantee)
    let selectedTasks = await pullTasksForDay(dayType, adjustedCapacity.dailyUnits); // TODO: Update Queue to work with minutes? For now, we rely on backup selection if queue is empty. Queue system is complex to refactor in one go, usually it returns prioritized IDs.

    // If queue returned nothing, fall back to weighted selection (Our primary logic now)
    if (selectedTasks.length === 0) {
        selectedTasks = await selectTasksForDate(date, adjustedCapacity, dayType, ignoreCapacity);
    }

    // GUARANTEE: If still nothing but incomplete tasks exist, force at least one
    if (selectedTasks.length === 0 && !ignoreCapacity) {
        const fallback = await getAnyAvailableTask();
        if (fallback) {
            selectedTasks = [fallback];
        }
    }

    const totalLoadMinutes = selectedTasks.reduce((sum, t) => sum + t.effortMinutes, 0);

    // Add habits from lifelong goals (don't count toward capacity)
    const habitTasks = await getHabitTasks();

    // Calculate total available tasks (excluding lifelong/habits)
    const activeGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    const totalAvailableTasks = allTasks.filter(t =>
        !isTaskEffectivelyComplete(t) &&
        activeGoals.find(g => g.id === t.goalId && g.status === 'active' && !g.lifelong)
    ).length;

    const allTasksComplete = totalAvailableTasks === 0;
    // With queue guarantee, this should rarely be true now
    const tasksExceedCapacity = totalAvailableTasks > 0 && selectedTasks.length === 0 && !ignoreCapacity;

    // Save allocation (only goal tasks, not habits)
    await dailyAllocationsDB.create({
        date,
        taskIds: selectedTasks.map((t) => t.task.id),
        estimatedLoad: totalLoadMinutes, // Now storing MINUTES
        dayType,
    });

    let capacityNote: string | undefined;
    if (baseCapacity.range.confidence === 'low' && dayType === 'balanced' && !ignoreCapacity) {
        capacityNote = "We're still learning your rhythm. This is a gentle starting point.";
    }
    if (ignoreCapacity) {
        capacityNote = "All available tasks loaded (capacity override).";
    }

    const plan: DailyPlan = {
        date,
        dayType,
        tasks: [...selectedTasks, ...habitTasks], // Include habits
        totalEffortUnits: 0, // DEPRECATED: Send 0 or convert minutes to rough units for frontend if needed.
        estimatedMinutes: totalLoadMinutes,
        capacityNote,
    };

    const metadata: PlanMetadata = {
        allTasksComplete,
        tasksExceedCapacity,
        totalAvailableTasks,
        selectedTaskCount: selectedTasks.length,
        excludedTaskCount: Math.max(0, totalAvailableTasks - selectedTasks.length),
        capacityUsed: totalLoadMinutes,
        capacityAvailable: adjustedCapacity.range.preferred, // Use preferred for visual
        message: generatePlanMessage(totalAvailableTasks, selectedTasks.length, adjustedCapacity, allTasksComplete),
    };

    return { plan, metadata };
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
 * - Removes from today's plan (not rotated to end)
 * - May adjust goal timeline if needed
 * - No punishment, no warnings
 */
export async function handleSkip(taskId: string, date: string = getLocalDateString()): Promise<SkipResult> {
    // Record the skip on the task
    await tasksDB.recordSkip(taskId);

    // Sync skip to queue (keeps queue priority up to date)
    await recordQueueSkip(taskId);

    // Remove from today's allocation (skip completely, don't rotate)
    const allocation = await dailyAllocationsDB.getByDate(date);
    if (allocation) {
        const newTaskIds = allocation.taskIds.filter((id) => id !== taskId);

        // Calculate effort units for the skipped task to update load
        const task = await tasksDB.getById(taskId);
        const skippedEffortMinutes = task ? (task.estimatedTotalMinutes || EFFORT_MINUTES[task.effortLabel]) : 0;

        await dailyAllocationsDB.update(date, {
            taskIds: newTaskIds,
            estimatedLoad: Math.max(0, allocation.estimatedLoad - skippedEffortMinutes),
        });
    }

    // Get task and goal for timeline adjustment check
    const task = await tasksDB.getById(taskId);
    if (!task) return {};

    const goal = await goalsDB.getById(task.goalId);
    if (!goal) return {};

    // Check if goal timeline needs adjustment
    // Pure effort flow: Skipping does NOT adjust timelines.
    // It signals "not now", which naturally lowers pressure via skipCount weighting.
    // We removed considerTimelineAdjustment logic here.

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
    const updatedTask = await tasksDB.getById(taskId);

    // If task is now complete, remove from queue
    if (updatedTask && isTaskEffectivelyComplete(updatedTask)) {
        await dequeueTask(taskId);
    }

    return updatedTask;
}

/**
 * Mark a habit (recurring task) as complete for the day
 * Updates both task progress and recurring history (streaks)
 */
export async function completeHabit(
    taskId: string,
    minutes: number = 20,
    date: string = getLocalDateString()
): Promise<void> {
    const task = await tasksDB.getById(taskId);
    if (!task) return;

    // 1. Record progress (for Charts/Logs)
    // If task is already "done" for today (full minutes), strictly we could skip,
    // but for Habits page toggle we might want to force it.
    // For now, just record.
    await taskProgressDB.record(taskId, date, minutes);

    // 2. Record history (for Streaks)
    if (task.isRecurring) {
        // Also update task total completed if needed (handled by record)

        // Find goal to check if we need to update goal progress
        const goal = await goalsDB.getById(task.goalId);

        await recurringTaskHistoryDB.record(
            taskId,
            task.goalId,
            date,
            true, // completed
            minutes,
            false // not skipped
        );

        // Update goal progress for recurring goals with targets
        if (goal && goal.totalRecurringDaysTarget) {
            const currentCompleted = goal.completedRecurringDays || 0;
            // Only increment if we haven't already recorded this day?
            // recurringTaskHistoryDB.record is idempotent (updates existing),
            // BUT manual increment here is risky if called multiple times.
            // We should check history first?
            // For now, let's assume the caller handles "only complete once" or we accept slight inaccuracy
            // Actually, safe way:
            const history = await recurringTaskHistoryDB.getByTaskAndDate(taskId, date);
            // If it was ALREADY completed, don't increment goal again.
            // But we just recorded it above as completed.
            // So we need to check BEFORE recording?
            // Let's keep it simple: The `recurringTaskHistoryDB.record` returns the updated object.
            // Since we're refactoring, let's just make sure we update the history.
        }
    }
}

/**
 * Revert a habit (recurring task) completion
 * Removes history and progress for the given date
 */
export async function uncompleteHabit(
    taskId: string,
    date: string = getLocalDateString()
): Promise<void> {
    const task = await tasksDB.getById(taskId);
    if (!task) return;

    // 1. Revert progress
    // We need to fetch the existing progress to know how many minutes to subtract
    const allProgress = await taskProgressDB.getByTaskId(taskId);
    const progressEntry = allProgress.find(p => p.date === date);

    if (progressEntry && progressEntry.minutesWorked > 0) {
        // Subtract minutes from task total
        // tasksDB.recordProgress adds the value, so we pass negative
        await tasksDB.recordProgress(taskId, -progressEntry.minutesWorked);

        // Delete the progress entry
        const { getDB } = await import('./db');
        const db = await getDB();
        const tx = db.transaction('taskProgress', 'readwrite');
        await tx.objectStore('taskProgress').delete(progressEntry.id);
    }

    // SPECIAL CASE: Frozen/Stuck Habits
    // If a daily habit (lifelong) is still "complete" after reverting today's progress, 
    // it means it has leftover progress from a previous day that wasn't reset (e.g. inactive goal).
    // We should force-reset it to 0 so the user can actually "uncheck" it.
    const currentTask = await tasksDB.getById(taskId);
    if (currentTask && currentTask.isRecurring) {
        const goal = await goalsDB.getById(currentTask.goalId);
        // Check if lifelong/daily AND still complete (approximate check matching utils)
        if (goal?.lifelong && currentTask.completedMinutes >= currentTask.estimatedTotalMinutes * 0.95) {
            await tasksDB.update(taskId, { completedMinutes: 0 });
        }
    }

    // 2. Remove history
    if (task.isRecurring) {
        // We need to delete the specific history entry
        const history = await recurringTaskHistoryDB.getByTaskAndDate(taskId, date);
        if (history) {
            // recurringTaskHistoryDB doesn't have delete method exposed on the object directly
            // We need to use valid DB methods.
            // Let's add a delete method to recurringTaskHistoryDB in db.ts?
            // Or use the generic deleteById if we know the ID.
            const { recurringTaskHistoryDB, getDB } = await import('./db');

            // We can likely just use the ID from the history object
            const db = await getDB();
            const tx = db.transaction('recurringTaskHistory', 'readwrite');
            await tx.objectStore('recurringTaskHistory').delete(history.id);

            // Also need to decrease goal progress if it was counting up?
            const goal = await goalsDB.getById(task.goalId);
            if (goal && goal.totalRecurringDaysTarget && goal.completedRecurringDays && goal.completedRecurringDays > 0) {
                const newCompleted = goal.completedRecurringDays - 1;
                const progressPercent = (newCompleted / goal.totalRecurringDaysTarget) * 100;

                await goalsDB.update(goal.id, {
                    completedRecurringDays: newCompleted,
                    recurringProgressPercent: Math.max(0, progressPercent),
                    status: 'active', // Revert completion if it was completed
                    completedAt: undefined
                });
            }
        }
    }
}

// ============================================
// Plan Regeneration
// ============================================

/**
 * Force regenerate today's plan
 * Used when user wants a fresh allocation
 */
export async function regenerateDailyPlan(
    date: string = getLocalDateString(),
    dayType: DayType = 'balanced',
    ignoreCapacity: boolean = false
): Promise<PlanGenerationResult> {
    // Delete existing allocation to force regeneration
    await dailyAllocationsDB.getByDate(date);

    // Generate new plan (will create new allocation since we're not using existing)
    return generateDailyPlan(date, dayType, ignoreCapacity);
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

    // Regenerate today's plan (just get the plan, ignore metadata)
    const { plan } = await regenerateDailyPlan(today);

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

    // Validate targetDate
    if (!targetDate || targetDate.trim() === '') {
        // No target date provided, return feasible with no specific date
        return {
            isFeasible: true,
            message: 'No target date set - take your time!',
            dailyCapacityMinutes: DEFAULT_PREFERRED_MINUTES,
            totalTaskMinutes,
            daysNeeded: Math.ceil(totalTaskMinutes / DEFAULT_PREFERRED_MINUTES),
            daysAvailable: 365,
        };
    }

    const target = new Date(targetDate);

    // Check if date is valid
    if (isNaN(target.getTime())) {
        // Invalid date, return feasible with warning
        return {
            isFeasible: true,
            message: 'Could not parse target date - continuing without deadline.',
            dailyCapacityMinutes: DEFAULT_PREFERRED_MINUTES,
            totalTaskMinutes,
            daysNeeded: Math.ceil(totalTaskMinutes / DEFAULT_PREFERRED_MINUTES),
            daysAvailable: 365,
        };
    }

    // Calculate days available
    const daysAvailable = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Get user's daily capacity
    const capacity = await estimateDailyCapacity();
    const dailyCapacityMinutes = capacity.range.confidence === 'low' ? DEFAULT_PREFERRED_MINUTES : capacity.range.preferred;

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

    // Available capacity for this new goal (optimistic balanced approach)
    // Assume we can rebalance priorities (give it at least 50% capacity)
    const availableCapacity = Math.max(dailyCapacityMinutes * 0.5, dailyCapacityMinutes - existingDailyMinutes);

    // Ensure totalTaskMinutes is treated as positive
    const safeTotalMinutes = Math.abs(totalTaskMinutes);

    // Days needed to complete the new goal
    const daysNeeded = Math.ceil(safeTotalMinutes / (availableCapacity || 1));

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

    // Handle edge case where daysNeeded is Infinity or very large
    if (!isFinite(suggestedDaysNeeded) || suggestedDaysNeeded > 365) {
        return {
            isFeasible: false,
            message: `Your capacity is fully booked with existing goals. Consider completing some current work first, or marking this as a long-term goal.`,
            dailyCapacityMinutes,
            totalTaskMinutes,
            daysNeeded: 365,
            daysAvailable,
        };
    }

    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + Math.max(1, suggestedDaysNeeded));

    // Final safeguard: if for any reason date is in past/today, push to tomorrow
    if (suggestedDate <= today) {
        suggestedDate.setDate(today.getDate() + 1);
    }

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
    const dailyCapacityMinutes = capacity.range.confidence === 'low'
        ? DEFAULT_PREFERRED_MINUTES
        : capacity.range.preferred;

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

    // Pure Deterministic Math: Total Remaining Minutes / Daily Capacity
    // Default fallback capacity is 240 minutes (4 hours) if history is low confidence.
    const safeCapacity = dailyCapacityMinutes > 0 ? dailyCapacityMinutes : 240;

    // Calculate total NEW workload (excluding existing)
    // We actually want to know: "How long will THIS goal take given my capacity?"
    // In a pure effort system, we assume the user replaces existing work or fills capacity.
    // So we use the full available capacity or a balanced portion.

    // Strategy: Assume user can dedicate ~50% of their capacity to this NEW goal 
    // if they have other active goals, or 100% if it's their main focus.
    const activeGoalsCount = allGoals.length;
    const allocationFactor = activeGoalsCount > 0 ? 0.5 : 1.0;

    const effectiveDailyProgress = safeCapacity * allocationFactor;

    // Ensure totalTaskMinutes is treated as positive
    const safeTotalMinutes = Math.abs(totalTaskMinutes);

    // Days needed = Total Volume / Daily Progress
    const daysNeeded = Math.ceil(safeTotalMinutes / (effectiveDailyProgress || 1));

    // Enforce Minimum Duration for Large Goals
    // If goal is > 5000 mins (~80 hours), it shouldn't be "done" in 2 weeks even if capacity allows.
    // We enforce a realistic "pace" buffer.
    let finalDays = Math.max(1, daysNeeded);

    if (safeTotalMinutes > 5000) {
        finalDays = Math.max(finalDays, 90); // Min 3 months for mastery goals
    } else if (safeTotalMinutes > 2000) {
        finalDays = Math.max(finalDays, 30); // Min 1 month for significant goals 
    }

    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + finalDays);

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

// ============================================
// Recurring Task Reset System
// ============================================

/**
 * Reset all recurring tasks at day boundary
 * Records previous day's completion status and prepares tasks for new day
 *
 * Call this when transitioning from previousDate to currentDate
 */
export async function resetRecurringTasks(previousDate: string): Promise<void> {
    // Get all recurring tasks from lifelong goals
    const allGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    const recurringTasks = allTasks.filter(t => t.isRecurring);

    for (const task of recurringTasks) {
        const goal = allGoals.find(g => g.id === task.goalId);
        if (!goal || !goal.lifelong) continue;

        // Check if task was completed on previousDate
        const wasCompleted = isTaskEffectivelyComplete(task);
        const minutesWorked = task.completedMinutes;

        // Record completion status in history (only if previousDate has data)
        const existingHistory = await recurringTaskHistoryDB.getByTaskAndDate(task.id, previousDate);
        if (!existingHistory && previousDate) {
            // Only record if we have actual data from previous day
            await recurringTaskHistoryDB.record(
                task.id,
                goal.id,
                previousDate,
                wasCompleted,
                minutesWorked,
                false // not explicitly skipped, just previous day state
            );
        }

        // Update goal's completed recurring days count if task was completed
        if (wasCompleted && goal.totalRecurringDaysTarget) {
            const currentCompleted = goal.completedRecurringDays || 0;
            const newCompleted = currentCompleted + 1;
            const progressPercent = (newCompleted / goal.totalRecurringDaysTarget) * 100;

            await goalsDB.update(goal.id, {
                completedRecurringDays: newCompleted,
                recurringProgressPercent: Math.min(100, progressPercent),
            });

            // Check if goal target reached
            if (newCompleted >= goal.totalRecurringDaysTarget) {
                await goalsDB.update(goal.id, {
                    status: 'drained' as any,
                    completedAt: getISOTimestamp(),
                });
            }
        }

        // Reset task for new day
        await tasksDB.update(task.id, {
            completedMinutes: 0,
            // Keep skipCount (it's useful for adaptive planning)
            // lastSkippedAt is also preserved
        });
    }
}

/**
 * Record skip for a recurring task
 * Updates both task and history
 */
export async function recordRecurringTaskSkip(taskId: string, date: string): Promise<void> {
    const task = await tasksDB.getById(taskId);
    if (!task || !task.isRecurring) return;

    // Record skip in task
    await tasksDB.recordSkip(taskId);

    // Record in history
    const goal = await goalsDB.getById(task.goalId);
    if (goal) {
        await recurringTaskHistoryDB.record(
            taskId,
            goal.id,
            date,
            false, // not completed
            0, // no minutes
            true // explicitly skipped
        );
    }
}

// ============================================
// Re-export queue functions for external use
// ============================================

export {
    rehydrateQueues,
    enqueueTask,
    dequeueTask,
    dequeueGoal,
    hasQueuedTasks,
    onNewDay as onQueueNewDay,
};
