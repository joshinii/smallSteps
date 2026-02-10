// SmallSteps Daily Planner — Momentum-Based Selection
// Selects work units using goal momentum scores + fair rotation.
// No time/capacity logic — purely count-based (2–7 work units).

import { goalsDB, tasksDB, workUnitsDB } from '../db';
import type { Goal, Task, WorkUnit, Slice } from '../schema';
import { isWorkUnitComplete } from '../schema';
import { getLocalDateString } from '../utils';
import {
    getAllGoalMomentum,
    sortByMomentum,
    needsAttention,
} from '../tracking/momentum';
import type { GoalMomentum } from '../tracking/momentum';
import { getAdaptiveCountForToday } from '../tracking/completionRate';

// ============================================
// Types
// ============================================

export interface DailyPlanInput {
    date?: string;
    completionRate?: number; // 0–1, from tracking
}

export interface DailyPlan {
    date: string;
    slices: Slice[];
    goalCount: number;
    metadata?: {
        targetCount: number;
        goalsEvaluated: number;
        message: string;
    };
}

// ============================================
// Main Planning Function
// ============================================

/**
 * Generate a daily plan using momentum-based priority.
 *
 * Algorithm:
 * 1. Get all active goals with momentum scores
 * 2. Determine adaptive work unit count (2–7)
 * 3. Allocate slots by momentum (top goal ~60%, rest 1 each)
 * 4. Select incomplete work units by task order
 */
export async function generateDailyPlan(
    input: DailyPlanInput = {}
): Promise<DailyPlan> {
    const date = input.date || getLocalDateString();

    // 1. Get all active goals with momentum
    const goalMomentums = await getAllGoalMomentum();

    if (goalMomentums.length === 0) {
        return createEmptyPlan(date, 'No active goals yet — take your time.');
    }

    const sorted = sortByMomentum(goalMomentums);


    // 2. Determine target work unit count (adaptive)
    const targetCount = await getAdaptiveCountForToday();

    // 3. Allocate slots across goals by momentum
    const allocation = allocateSlots(sorted, targetCount);

    // 4. Select work units from each allocated goal
    const slices = await selectWorkUnits(allocation);

    if (slices.length === 0) {
        return createEmptyPlan(date, 'All caught up! Enjoy the moment.');
    }

    return {
        date,
        slices,
        goalCount: allocation.length,
        metadata: {
            targetCount,
            goalsEvaluated: sorted.length,
            message: buildMessage(slices.length, allocation.length),
        },
    };
}

/**
 * Selects one additional work unit to add to the current plan.
 * Logic:
 * 1. Iterates through goals sorted by momentum.
 * 2. Finds the first work unit that is NOT complete and NOT already in the plan.
 */
export async function getNextRecommendedSlice(
    existingSlices: Slice[]
): Promise<Slice | null> {
    // 1. Get all active goals with momentum
    const goalMomentums = await getAllGoalMomentum();
    const sorted = sortByMomentum(goalMomentums);

    // Set of existing IDs to exclude
    const existingIds = new Set(existingSlices.map(s => s.workUnitId));

    for (const gm of sorted) {
        const goal = await goalsDB.getById(gm.goalId);
        if (!goal) continue;

        const tasks = await tasksDB.getByGoalId(gm.goalId);
        const sortedTasks = tasks.sort((a, b) => a.order - b.order);

        for (const task of sortedTasks) {
            const wus = await workUnitsDB.getByTaskId(task.id);
            // Assuming array order is correct for now, or could sort if order existed

            for (const wu of wus) {
                if (!isWorkUnitComplete(wu) && !existingIds.has(wu.id)) {
                    // Found a candidate
                    return {
                        workUnitId: wu.id,
                        workUnit: wu,
                        task,
                        goal
                    };
                }
            }
        }
    }

    return null;
}

// ============================================
// Adaptive Count
// ============================================

/**
 * Determine how many work units to show based on recent completion rate.
 * Starts conservative (3), grows if completing well, shrinks if struggling.
 */
function calculateAdaptiveCount(completionRate?: number): number {
    const DEFAULT_COUNT = 3;

    if (!completionRate || completionRate <= 0) return DEFAULT_COUNT;

    // High completion → can handle more
    if (completionRate >= 0.9) return Math.min(DEFAULT_COUNT + 2, 7);
    if (completionRate >= 0.7) return Math.min(DEFAULT_COUNT + 1, 5);

    // Low completion → reduce to avoid overwhelm
    if (completionRate < 0.5) return Math.max(DEFAULT_COUNT - 1, 2);

    return DEFAULT_COUNT;
}

// ============================================
// Slot Allocation
// ============================================

interface SlotAllocation {
    goalId: string;
    slots: number;
}

/**
 * Distribute slots across goals by momentum.
 * Top goal gets ~60% of slots (min 2).
 * Neglected goals always get 1 slot.
 * Remaining goals fill remaining slots.
 */
function allocateSlots(
    sortedGoals: GoalMomentum[],
    totalSlots: number
): SlotAllocation[] {
    if (sortedGoals.length === 0) return [];

    // Single goal: give it everything
    if (sortedGoals.length === 1) {
        return [{ goalId: sortedGoals[0].goalId, slots: totalSlots }];
    }

    const allocation: SlotAllocation[] = [];

    // Top momentum goal gets majority of slots
    const topSlots = Math.max(2, Math.floor(totalSlots * 0.6));
    allocation.push({ goalId: sortedGoals[0].goalId, slots: topSlots });

    let remaining = totalSlots - topSlots;

    // Distribute remaining slots
    for (let i = 1; i < sortedGoals.length && remaining > 0; i++) {
        const goal = sortedGoals[i];

        // Neglected goals always get a slot (gentle nudge)
        if (needsAttention(goal) || remaining > 0) {
            allocation.push({ goalId: goal.goalId, slots: 1 });
            remaining--;
        }
    }

    return allocation;
}

// ============================================
// Work Unit Selection
// ============================================

/**
 * Select incomplete work units for each allocated goal.
 * Picks by task order (Task 1 before Task 6).
 */
async function selectWorkUnits(
    allocation: SlotAllocation[]
): Promise<Slice[]> {
    const slices: Slice[] = [];

    for (const alloc of allocation) {
        const goal = await goalsDB.getById(alloc.goalId);
        if (!goal) continue;

        // Get all tasks for this goal, sorted by order
        const tasks = await tasksDB.getByGoalId(alloc.goalId);
        const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

        // Collect incomplete work units in task order
        const candidates: { workUnit: WorkUnit; task: Task }[] = [];

        for (const task of sortedTasks) {
            const wus = await workUnitsDB.getByTaskId(task.id);
            const incomplete = wus.filter(wu => !isWorkUnitComplete(wu));

            for (const wu of incomplete) {
                candidates.push({ workUnit: wu, task });
            }
        }

        // Take first N by task order
        const selected = candidates.slice(0, alloc.slots);

        for (const { workUnit, task } of selected) {
            slices.push({
                workUnitId: workUnit.id,
                workUnit,
                task,
                goal,
            });
        }
    }

    return slices;
}

// ============================================
// Helpers
// ============================================

function createEmptyPlan(date: string, message: string): DailyPlan {
    return {
        date,
        slices: [],
        goalCount: 0,
        metadata: {
            targetCount: 0,
            goalsEvaluated: 0,
            message,
        },
    };
}

function buildMessage(sliceCount: number, goalCount: number): string {
    if (goalCount === 1) {
        return `${sliceCount} step${sliceCount > 1 ? 's' : ''} for your goal today.`;
    }
    return `${sliceCount} step${sliceCount > 1 ? 's' : ''} across ${goalCount} goal${goalCount > 1 ? 's' : ''}.`;
}
