// SmallSteps Daily Planner Agent
// Intelligent daily WorkUnit selection with multi-goal balancing

import { goalsDB, tasksDB, workUnitsDB } from '../db';
import type { Goal, Task, WorkUnit, Slice, DayMode } from '../schema';
import { getSliceLabel, isWorkUnitComplete } from '../schema';
import { getLocalDateString } from '../utils';

// ============================================
// Configuration
// ============================================

const PLANNER_CONFIG = {
    defaultCapacity: 240, // 4 hours default
    minSlices: 3,
    maxSlices: 6,
    maxHeavyWorkUnits: 1, // Max work units > 90 min per day
    heavyThreshold: 90,
    priorityWeights: {
        goalUrgency: 0.4,
        progression: 0.3,
        rotationFairness: 0.3,
    },
};

// ============================================
// Types
// ============================================

export interface DailyPlanInput {
    date?: string; // YYYY-MM-DD, defaults to today
    userCapacity?: number; // default 240
    energyLevel?: 1 | 2 | 3 | 4; // 1=surviving, 2=low, 3=normal, 4=energized
    mode?: 'light' | 'medium' | 'focus';
}

export interface DailyPlan {
    date: string;
    slices: Slice[];
    totalMinutes: number;
    capacityUsed: number;
    goalsIncluded: string[];
    metadata?: {
        adjustedCapacity: number;
        workUnitsEvaluated: number;
        message: string;
    };
}

interface PrioritizedWorkUnit {
    workUnit: WorkUnit;
    task: Task;
    goal: Goal;
    priority: number;
    effortValue: number; // priority / effort ratio
}

// ============================================
// Main Planning Function
// ============================================

/**
 * Generate an intelligent daily plan selecting WorkUnits across multiple goals
 * 
 * Uses priority scoring based on:
 * - Goal urgency (40%): Days until target date
 * - Progression order (30%): How much is remaining
 * - Rotation fairness (30%): Time since goal was worked on
 * 
 * @param input - Planning parameters
 * @returns DailyPlan with selected slices
 */
export async function generateDailyPlan(
    input: DailyPlanInput = {}
): Promise<DailyPlan> {
    const date = input.date || getLocalDateString();
    console.log('📅 PLANNER: Generating daily plan for:', date);

    // 1. Get all active goals
    const activeGoals = await goalsDB.getActive();

    if (activeGoals.length === 0) {
        console.log('📅 PLANNER: No active goals');
        return createEmptyPlan(date, 'No active goals. Create a goal to get started!');
    }

    // 2. Get all incomplete work units across all goals
    const allTasks = await tasksDB.getAll();
    const allWorkUnits = await workUnitsDB.getAll();

    const incompleteUnits = allWorkUnits.filter(wu => !isWorkUnitComplete(wu));

    if (incompleteUnits.length === 0) {
        console.log('📅 PLANNER: No incomplete work units');
        return createEmptyPlan(date, 'All work units complete. Great progress!');
    }

    // 3. Filter to only unlocked work units (dependencies met)
    const unlockedUnits = filterUnlockedWorkUnits(incompleteUnits, allTasks, activeGoals);

    if (unlockedUnits.length === 0) {
        console.log('📅 PLANNER: No unlocked work units available');
        return createEmptyPlan(date, 'Check your progress - some work units may be blocked.');
    }

    // 4. Calculate adjusted capacity
    const baseCapacity = input.userCapacity || PLANNER_CONFIG.defaultCapacity;
    const adjustedCapacity = applyCapacityAdjustments(baseCapacity, input.energyLevel, input.mode);

    console.log(`📅 PLANNER: Capacity - Base: ${baseCapacity}, Adjusted: ${adjustedCapacity}`);

    // 5. Calculate priority score for each work unit
    const prioritized = calculatePriorities(unlockedUnits, allTasks, activeGoals);

    // 6. Select work units using knapsack algorithm
    let selected = selectWorkUnits(prioritized, adjustedCapacity);

    // 7. Ensure multi-goal representation
    selected = ensureGoalBalance(selected, prioritized, activeGoals, adjustedCapacity);

    // 8. Convert to Slices and sort (light first for gentle progression)
    const slices = convertToSlices(selected, input.mode || 'medium')
        .sort((a, b) => a.minutes - b.minutes);

    // 9. Calculate totals
    const totalMinutes = slices.reduce((sum, s) => sum + s.minutes, 0);
    const goalsIncluded = [...new Set(slices.map(s => s.goal.id))];

    console.log(`📅 PLANNER: Generated ${slices.length} slices, ${totalMinutes} min across ${goalsIncluded.length} goals`);

    return {
        date,
        slices,
        totalMinutes,
        capacityUsed: totalMinutes,
        goalsIncluded,
        metadata: {
            adjustedCapacity,
            workUnitsEvaluated: unlockedUnits.length,
            message: `${slices.length} action${slices.length > 1 ? 's' : ''} planned across ${goalsIncluded.length} goal${goalsIncluded.length > 1 ? 's' : ''}`,
        },
    };
}

// ============================================
// Filter: Unlocked Work Units
// ============================================

/**
 * Filter to work units that can be worked on (dependencies met)
 * For now, checks order within task - earlier work units should be done first
 */
function filterUnlockedWorkUnits(
    workUnits: WorkUnit[],
    allTasks: Task[],
    activeGoals: Goal[]
): { workUnit: WorkUnit; task: Task; goal: Goal }[] {
    const activeGoalIds = new Set(activeGoals.map(g => g.id));
    const result: { workUnit: WorkUnit; task: Task; goal: Goal }[] = [];

    // Group work units by task
    const byTask = new Map<string, WorkUnit[]>();
    for (const wu of workUnits) {
        const existing = byTask.get(wu.taskId) || [];
        existing.push(wu);
        byTask.set(wu.taskId, existing);
    }

    for (const task of allTasks) {
        if (!activeGoalIds.has(task.goalId)) continue;

        const goal = activeGoals.find(g => g.id === task.goalId);
        if (!goal) continue;

        const taskUnits = byTask.get(task.id) || [];
        if (taskUnits.length === 0) continue;

        // For simplicity, allow all incomplete work units in active tasks
        // More complex dependency logic could be added here
        for (const wu of taskUnits) {
            result.push({ workUnit: wu, task, goal });
        }
    }

    return result;
}

// ============================================
// Priority Scoring
// ============================================

/**
 * Calculate priority scores for all work units
 */
function calculatePriorities(
    units: { workUnit: WorkUnit; task: Task; goal: Goal }[],
    allTasks: Task[],
    allGoals: Goal[]
): PrioritizedWorkUnit[] {
    const result: PrioritizedWorkUnit[] = [];

    for (const { workUnit, task, goal } of units) {
        const priority = calculatePriority(workUnit, task, goal, allGoals);
        const remaining = workUnit.estimatedTotalMinutes - workUnit.completedMinutes;
        const effortValue = remaining > 0 ? priority / remaining : priority;

        result.push({
            workUnit,
            task,
            goal,
            priority,
            effortValue,
        });
    }

    // Sort by:
    // 1. Light tasks first (for gentle ease-in)
    // 2. Then by effort value (priority per minute)
    return result.sort((a, b) => {
        const aRemaining = a.workUnit.estimatedTotalMinutes - a.workUnit.completedMinutes;
        const bRemaining = b.workUnit.estimatedTotalMinutes - b.workUnit.completedMinutes;

        const aIsHeavy = aRemaining > PLANNER_CONFIG.heavyThreshold;
        const bIsHeavy = bRemaining > PLANNER_CONFIG.heavyThreshold;

        // Light tasks come before heavy tasks
        if (aIsHeavy !== bIsHeavy) {
            return aIsHeavy ? 1 : -1; // light first
        }

        // Within same category, sort by effort value
        return b.effortValue - a.effortValue;
    });
}

/**
 * Calculate priority score for a single work unit
 */
function calculatePriority(
    workUnit: WorkUnit,
    task: Task,
    goal: Goal,
    allGoals: Goal[]
): number {
    const weights = PLANNER_CONFIG.priorityWeights;

    // Goal urgency (40%): How close to target date
    const goalUrgency = calculateGoalUrgency(goal);

    // Progression order (30%): Favor work units with more progress remaining
    // Earlier in progression = higher priority
    const progressionScore = calculateProgressionScore(workUnit);

    // Rotation fairness (30%): Time since goal was worked on
    const rotationScore = calculateRotationScore(goal);

    const totalPriority =
        (goalUrgency * weights.goalUrgency) +
        (progressionScore * weights.progression) +
        (rotationScore * weights.rotationFairness);

    return Math.round(totalPriority * 100);
}

/**
 * Calculate urgency based on goal target date
 * Returns 0-1, higher = more urgent
 */
function calculateGoalUrgency(goal: Goal): number {
    if (!goal.targetDate) {
        return 0.5; // Neutral if no target date
    }

    const today = new Date();
    const target = new Date(goal.targetDate);
    const daysUntil = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 0) return 1.0; // Overdue
    if (daysUntil <= 7) return 0.9; // This week
    if (daysUntil <= 14) return 0.7; // Next 2 weeks
    if (daysUntil <= 30) return 0.5; // This month

    return 0.3; // Far future
}

/**
 * Calculate progression score
 * Work units with more work remaining get higher priority
 */
function calculateProgressionScore(workUnit: WorkUnit): number {
    const remaining = workUnit.estimatedTotalMinutes - workUnit.completedMinutes;
    const total = workUnit.estimatedTotalMinutes;

    if (total <= 0) return 0;

    // More remaining = higher score (start incomplete items)
    return remaining / total;
}

/**
 * Calculate rotation score based on time since goal was worked on
 * Returns 0-1, higher = longer since worked
 */
function calculateRotationScore(goal: Goal): number {
    // For now, use updatedAt as proxy for last activity
    // In future, track explicit lastWorkedDate
    const lastUpdate = new Date(goal.updatedAt);
    const today = new Date();
    const daysSince = Math.floor((today.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

    // Cap at 7 days
    return Math.min(daysSince / 7, 1);
}

// ============================================
// Capacity Adjustments
// ============================================

/**
 * Apply adjustments based on energy level and mode
 */
function applyCapacityAdjustments(
    baseCapacity: number,
    energyLevel?: 1 | 2 | 3 | 4,
    mode?: 'light' | 'medium' | 'focus'
): number {
    let adjusted = baseCapacity;

    // Energy level multipliers
    if (energyLevel === 1) adjusted *= 0.5;  // Surviving - 50%
    else if (energyLevel === 2) adjusted *= 0.7;  // Low energy - 70%
    else if (energyLevel === 3) adjusted *= 1.0;  // Normal - 100%
    else if (energyLevel === 4) adjusted *= 1.2;  // Energized - 120%

    // Mode multipliers
    if (mode === 'light') adjusted *= 0.6;
    else if (mode === 'focus') adjusted *= 1.0;
    // medium is default, no change

    return Math.round(adjusted);
}

// ============================================
// Knapsack Selection
// ============================================

/**
 * Select work units using greedy knapsack approach
 * - Sort by priority/effort ratio
 * - Greedily select until capacity filled
 * - Max 1 heavy work unit per day
 */
function selectWorkUnits(
    prioritized: PrioritizedWorkUnit[],
    capacity: number
): PrioritizedWorkUnit[] {
    const selected: PrioritizedWorkUnit[] = [];
    let usedMinutes = 0;
    let heavyCount = 0;

    for (const item of prioritized) {
        const remaining = item.workUnit.estimatedTotalMinutes - item.workUnit.completedMinutes;

        // Skip if we've hit slice limit
        if (selected.length >= PLANNER_CONFIG.maxSlices) break;

        // Skip if would exceed capacity
        if (usedMinutes + remaining > capacity) continue;

        // Check heavy limit
        const isHeavy = remaining > PLANNER_CONFIG.heavyThreshold;
        if (isHeavy && heavyCount >= PLANNER_CONFIG.maxHeavyWorkUnits) continue;

        selected.push(item);
        usedMinutes += remaining;
        if (isHeavy) heavyCount++;
    }

    return selected;
}

// ============================================
// Multi-Goal Balancing
// ============================================

/**
 * Ensure at least one work unit from each active goal if possible
 */
function ensureGoalBalance(
    selected: PrioritizedWorkUnit[],
    allPrioritized: PrioritizedWorkUnit[],
    activeGoals: Goal[],
    capacity: number
): PrioritizedWorkUnit[] {
    const represented = new Set(selected.map(s => s.goal.id));
    const usedMinutes = selected.reduce((sum, s) =>
        sum + (s.workUnit.estimatedTotalMinutes - s.workUnit.completedMinutes), 0);

    // Track current heavy count
    let heavyCount = selected.filter(s => {
        const remaining = s.workUnit.estimatedTotalMinutes - s.workUnit.completedMinutes;
        return remaining > PLANNER_CONFIG.heavyThreshold;
    }).length;

    let remainingCapacity = capacity - usedMinutes;

    for (const goal of activeGoals) {
        if (represented.has(goal.id)) continue;

        // Find smallest work unit for this goal that respects heavy limit
        const candidates = allPrioritized
            .filter(p => {
                if (p.goal.id !== goal.id) return false;
                if (selected.includes(p)) return false;

                // Check heavy limit
                const remaining = p.workUnit.estimatedTotalMinutes - p.workUnit.completedMinutes;
                const isHeavy = remaining > PLANNER_CONFIG.heavyThreshold;
                if (isHeavy && heavyCount >= PLANNER_CONFIG.maxHeavyWorkUnits) return false;

                return true;
            })
            .sort((a, b) => {
                const aRemaining = a.workUnit.estimatedTotalMinutes - a.workUnit.completedMinutes;
                const bRemaining = b.workUnit.estimatedTotalMinutes - b.workUnit.completedMinutes;
                return aRemaining - bRemaining;
            });

        if (candidates.length > 0) {
            const smallest = candidates[0];
            const smallestRemaining = smallest.workUnit.estimatedTotalMinutes - smallest.workUnit.completedMinutes;

            // Add if fits or if we have less than minimum slices
            if (smallestRemaining <= remainingCapacity || selected.length < PLANNER_CONFIG.minSlices) {
                selected.push(smallest);
                remainingCapacity -= smallestRemaining;
                represented.add(goal.id);

                // Update heavy count
                if (smallestRemaining > PLANNER_CONFIG.heavyThreshold) {
                    heavyCount++;
                }
            }
        }
    }

    return selected;
}

// ============================================
// Slice Conversion
// ============================================

/**
 * Convert selected work units to Slices
 */
function convertToSlices(
    selected: PrioritizedWorkUnit[],
    mode: 'light' | 'medium' | 'focus'
): Slice[] {
    const slices: Slice[] = [];

    for (const item of selected) {
        const remaining = item.workUnit.estimatedTotalMinutes - item.workUnit.completedMinutes;

        // Determine slice size based on mode
        let sliceMinutes: number;
        switch (mode) {
            case 'light':
                sliceMinutes = Math.min(remaining, 20);
                break;
            case 'focus':
                sliceMinutes = Math.min(remaining, 60);
                break;
            default: // medium
                sliceMinutes = Math.min(remaining, 35);
        }

        // Determine reason for this slice
        let reason: 'quick-win' | 'due-soon' | 'momentum' | undefined;

        if (item.task.complexity === 1) {
            reason = 'quick-win';
        } else if (item.goal.targetDate) {
            const daysUntil = Math.ceil(
                (new Date(item.goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            if (daysUntil <= 7) reason = 'due-soon';
        }

        slices.push({
            workUnitId: item.workUnit.id,
            workUnit: item.workUnit,
            task: item.task,
            goal: item.goal,
            minutes: sliceMinutes,
            label: getSliceLabel(sliceMinutes),
            reason,
        });
    }

    return slices;
}

// ============================================
// Helpers
// ============================================

/**
 * Create an empty plan with a message
 */
function createEmptyPlan(date: string, message: string): DailyPlan {
    return {
        date,
        slices: [],
        totalMinutes: 0,
        capacityUsed: 0,
        goalsIncluded: [],
        metadata: {
            adjustedCapacity: 0,
            workUnitsEvaluated: 0,
            message,
        },
    };
}

// ============================================
// Exports
// ============================================

export { applyCapacityAdjustments, calculatePriority };
