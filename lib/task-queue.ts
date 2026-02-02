// SmallSteps Task Queue System
// Persistent scheduling layer that ensures tasks are always available
// 
// Core principles:
// - Never show "no tasks today" if work exists
// - Implicit priority (no user-facing controls)
// - Calm adaptation over time

import { goalsDB, tasksDB, taskQueueDB } from './db';
import type { Task, Goal, TaskQueueEntry, EffortLevel } from './schema';
import { effortLabelToLevel } from './schema';
import { getISOTimestamp, isTaskEffectivelyComplete } from './utils';
import type { DayType, AllocatedTask } from './planning-engine';
import { logger, generateTraceId } from './logger';

// ============================================
// Mode-based effort weights for selection
// ============================================

// How much of each effort level to pull based on day mode
// Values represent relative weights (higher = more likely to pull)
const MODE_WEIGHTS: Record<DayType, Record<EffortLevel, number>> = {
    gentle: { light: 70, medium: 30, heavy: 0 },
    recovery: { light: 100, medium: 0, heavy: 0 },
    balanced: { light: 40, medium: 40, heavy: 20 },
    focused: { light: 20, medium: 40, heavy: 40 },
    energetic: { light: 30, medium: 35, heavy: 35 },
};

// Max heavy tasks per day (cognitive limit)
const MAX_HEAVY_PER_DAY = 1;

// ============================================
// Queue Rehydration
// ============================================

/**
 * Rebuild queues from current tasks table
 * Called on app load to ensure queue reflects actual task state
 */
export async function rehydrateQueues(): Promise<void> {
    // Clear existing queue to rebuild fresh
    await taskQueueDB.clear();

    const allGoals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();

    for (const goal of allGoals) {
        // Skip lifelong/habit goals - they're handled separately
        if (goal.lifelong) continue;

        const goalTasks = allTasks.filter(t =>
            t.goalId === goal.id &&
            !isTaskEffectivelyComplete(t) &&
            !t.archivedAt
        );

        for (const task of goalTasks) {
            await enqueueTask(task, goal);
        }
    }

    logger.info('LOG.QUEUE_REHYDRATION', {
        goalCount: allGoals.length,
        taskCount: allTasks.length,
        timestamp: new Date().toISOString()
    }, { traceId: generateTraceId(), phase: 'TaskQueue.Rehydrate' });
}

// ============================================
// Queue Operations
// ============================================

/**
 * Add a task to the appropriate queue
 */
export async function enqueueTask(task: Task, goal: Goal): Promise<void> {
    const now = getISOTimestamp();

    const entry: TaskQueueEntry = {
        taskId: task.id,
        goalId: goal.id,
        effortLevel: effortLabelToLevel(task.effortLabel),
        goalTargetDate: goal.targetDate,
        skipCount: task.skipCount || 0,
        lastSkippedAt: task.lastSkippedAt,
        queuedAt: now,
        waitingDays: 0,
        createdAt: now,
        updatedAt: now,
    };

    await taskQueueDB.upsert(entry);

    // Context is usually ephemeral here, so we generate a short trace
    logger.info('LOG.QUEUE_ALLOCATION', {
        taskId: task.id,
        goalId: goal.id,
        effortLevel: entry.effortLevel,
        priorityFactors: {
            goalTargetDate: goal.targetDate,
            skipCount: task.skipCount
        }
    }, { traceId: generateTraceId(), phase: 'TaskQueue.Enqueue' });
}

/**
 * Remove a task from the queue (on completion or deletion)
 */
export async function dequeueTask(taskId: string): Promise<void> {
    await taskQueueDB.remove(taskId);
}

/**
 * Update queue entry when task is skipped
 */
export async function recordQueueSkip(taskId: string): Promise<void> {
    const entry = await taskQueueDB.getByTaskId(taskId);
    if (!entry) return;

    await taskQueueDB.upsert({
        ...entry,
        skipCount: entry.skipCount + 1,
        lastSkippedAt: getISOTimestamp(),
    });
}

/**
 * Remove all queue entries for a goal (when goal is deleted)
 */
export async function dequeueGoal(goalId: string): Promise<void> {
    await taskQueueDB.removeByGoalId(goalId);
}

// ============================================
// Priority Calculation
// ============================================

/**
 * Calculate priority score for a queue entry
 * Higher score = higher priority for today's plan
 * 
 * Factors:
 * - Days until deadline (closer = higher)
 * - Skip count (fewer skips = slightly higher)
 * - Waiting days (longer wait = higher priority over time)
 */
function calculatePriorityScore(entry: TaskQueueEntry): number {
    let score = 100; // Base score

    // Deadline proximity: closer deadlines get higher priority
    if (entry.goalTargetDate) {
        const today = new Date();
        const target = new Date(entry.goalTargetDate);
        const daysUntil = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

        // Inverse relationship: fewer days = higher score (max +100)
        score += Math.min(100, 100 / daysUntil);
    }

    // Skip count: fewer skips = slightly higher priority
    // But we don't penalize heavily - SmallSteps is gentle
    score -= entry.skipCount * 2; // Small penalty, max -20ish

    // Waiting days: tasks waiting longer get priority boost
    // This ensures nothing sits in queue forever
    score += entry.waitingDays * 1.5; // Gradual increase

    // Recent skip penalty: if skipped today, reduce priority temporarily
    if (entry.lastSkippedAt) {
        const lastSkip = new Date(entry.lastSkippedAt);
        const today = new Date();
        const isSameDay = lastSkip.toDateString() === today.toDateString();
        if (isSameDay) {
            score -= 50; // Significant temporary penalty
        }
    }

    return Math.max(0, score);
}

// ============================================
// Daily Selection from Queues
// ============================================

/**
 * Pull tasks from queues for today's plan
 * 
 * Core guarantee: Always returns at least one task if queues are non-empty
 */
export async function pullTasksForDay(
    mode: DayType,
    capacityUnits: number
): Promise<AllocatedTask[]> {
    const weights = MODE_WEIGHTS[mode] || MODE_WEIGHTS.balanced;

    // Get all queue entries
    const lightQueue = await taskQueueDB.getByEffortLevel('light');
    const mediumQueue = await taskQueueDB.getByEffortLevel('medium');
    const heavyQueue = await taskQueueDB.getByEffortLevel('heavy');

    // Sort each queue by priority
    lightQueue.sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));
    mediumQueue.sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));
    heavyQueue.sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));

    // Calculate how many of each to pull based on mode weights
    const totalWeight = weights.light + weights.medium + weights.heavy;

    // Get actual tasks and goals for selected entries
    const allTasks = await tasksDB.getAll();
    const allGoals = await goalsDB.getActive();
    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    const goalMap = new Map(allGoals.map(g => [g.id, g]));

    const selected: AllocatedTask[] = [];
    let usedUnits = 0;
    let heavyCount = 0;

    // Effort unit mapping (matches planning-engine)
    // Effort unit mapping (matches planning-engine)
    const EFFORT_MINUTES: Record<EffortLevel, number> = {
        light: 15,   // warm-up
        medium: 30,  // settle
        heavy: 90,   // dive
    };

    /**
     * Try to add a task from a queue
     */
    const tryAddFromQueue = (queue: TaskQueueEntry[], level: EffortLevel): boolean => {
        const minutes = EFFORT_MINUTES[level];

        for (const entry of queue) {
            // Skip if already selected
            if (selected.some(s => s.task.id === entry.taskId)) continue;

            // Check capacity
            if (usedUnits + minutes > capacityUnits && selected.length > 0) continue;

            // Check heavy limit
            if (level === 'heavy' && heavyCount >= MAX_HEAVY_PER_DAY) continue;

            const task = taskMap.get(entry.taskId);
            const goal = goalMap.get(entry.goalId);

            if (!task || !goal) continue;
            if (isTaskEffectivelyComplete(task)) continue;

            selected.push({
                task,
                goal,
                effortMinutes: minutes, // Consistent with AllocatedTask
            });

            usedUnits += minutes;
            if (level === 'heavy') heavyCount++;

            return true;
        }
        return false;
    };

    // Pull tasks using weighted selection
    // Iterate through queues based on mode weights
    const pullOrder: EffortLevel[] = [];

    // Build pull order based on weights (higher weight = more attempts)
    if (weights.light > 0) {
        for (let i = 0; i < Math.ceil(weights.light / 10); i++) pullOrder.push('light');
    }
    if (weights.medium > 0) {
        for (let i = 0; i < Math.ceil(weights.medium / 10); i++) pullOrder.push('medium');
    }
    if (weights.heavy > 0) {
        for (let i = 0; i < Math.ceil(weights.heavy / 10); i++) pullOrder.push('heavy');
    }

    // Shuffle to mix up the selection
    for (let i = pullOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pullOrder[i], pullOrder[j]] = [pullOrder[j], pullOrder[i]];
    }

    // Pull until capacity full or no more tasks
    for (const level of pullOrder) {
        if (usedUnits >= capacityUnits && selected.length > 0) break;

        const queue = level === 'light' ? lightQueue : level === 'medium' ? mediumQueue : heavyQueue;
        tryAddFromQueue(queue, level);
    }

    // GUARANTEE: If nothing selected but queues have tasks, force at least one
    if (selected.length === 0) {
        // Try light first (gentlest option)
        if (lightQueue.length > 0) {
            tryAddFromQueue(lightQueue, 'light');
        } else if (mediumQueue.length > 0) {
            tryAddFromQueue(mediumQueue, 'medium');
        } else if (heavyQueue.length > 0) {
            tryAddFromQueue(heavyQueue, 'heavy');
        }
    }

    return selected;
}

/**
 * Get any available task (fallback when all else fails)
 */
export async function getAnyAvailableTask(): Promise<AllocatedTask | null> {
    const allQueue = await taskQueueDB.getAll();
    if (allQueue.length === 0) return null;

    // Sort by priority and get highest
    allQueue.sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));
    const best = allQueue[0];

    const task = await tasksDB.getById(best.taskId);
    const goal = await goalsDB.getById(best.goalId);

    if (!task || !goal) return null;

    const EFFORT_MINUTES: Record<EffortLevel, number> = { light: 15, medium: 30, heavy: 90 };

    return {
        task,
        goal,
        effortMinutes: EFFORT_MINUTES[best.effortLevel],
    };
}

/**
 * Check if queues have any tasks
 */
export async function hasQueuedTasks(): Promise<boolean> {
    const all = await taskQueueDB.getAll();
    return all.length > 0;
}

/**
 * Called at start of each day to increment waiting counters
 */
export async function onNewDay(): Promise<void> {
    await taskQueueDB.incrementWaitingDays();
}
