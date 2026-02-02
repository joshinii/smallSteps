// SmallSteps Planning Engine
// Slice Generation: WorkUnits → Slices → DailyPlan
// Planner schedules effort, never invents work meaning

import { goalsDB, tasksDB, workUnitsDB, dailyAllocationsDB } from './db';
import type { Goal, Task, WorkUnit, Slice, DailyPlan, DayMode, SliceLabel } from './schema';
import { getSliceLabel, isWorkUnitComplete } from './schema';
import { getLocalDateString } from './utils';

// ============================================
// Constants
// ============================================

const DEFAULT_DAILY_CAPACITY = 60; // 1 hour conservative default
const MIN_DAILY_CAPACITY = 60;
const MAX_DAILY_CAPACITY = 300;
const COGNITIVE_LIMIT = 5; // Max slices per day to avoid overwhelm

// Slice ranges by mode (minutes)
const SLICE_RANGES: Record<DayMode, { min: number; max: number }> = {
    light: { min: 10, max: 20 },
    medium: { min: 20, max: 35 },
    focus: { min: 40, max: 60 },
};

// ============================================
// Capacity Estimation
// ============================================

/**
 * Estimate user's daily capacity based on completed history.
 * For now, returns conservative default. Can be enhanced with history analysis.
 */
export async function estimateDailyCapacity(): Promise<number> {
    const allocations = await dailyAllocationsDB.getAll();
    const completed = allocations.filter(a => a.completedAt);

    if (completed.length >= 3) {
        const avgMinutes = completed.reduce((sum, a) => sum + a.estimatedLoad, 0) / completed.length;
        return Math.max(MIN_DAILY_CAPACITY, Math.min(MAX_DAILY_CAPACITY, Math.round(avgMinutes)));
    }

    return DEFAULT_DAILY_CAPACITY;
}

// ============================================
// Slice Generation
// ============================================

/**
 * Generate a slice for a work unit.
 * Slice size depends on mode and remaining effort.
 */
export function generateSlice(
    workUnit: WorkUnit,
    task: Task,
    goal: Goal,
    mode: DayMode
): Slice | null {
    const remaining = workUnit.estimatedTotalMinutes - workUnit.completedMinutes;

    if (remaining <= 0) return null;

    const range = SLICE_RANGES[mode];
    const sliceMinutes = Math.min(remaining, range.min + Math.floor(Math.random() * (range.max - range.min)));

    return {
        workUnitId: workUnit.id,
        workUnit,
        task,
        goal,
        minutes: sliceMinutes,
        label: getSliceLabel(sliceMinutes),
    };
}

// ============================================
// Work Unit Prioritization
// ============================================

interface PrioritizedWorkUnit {
    workUnit: WorkUnit;
    task: Task;
    goal: Goal;
    priority: number;
}

/**
 * Prioritize work units based on:
 * - Goal target date proximity
 * - Staleness (not worked on recently)
 * - Balance across goals
 */
async function prioritizeWorkUnits(): Promise<PrioritizedWorkUnit[]> {
    const goals = await goalsDB.getActive();
    const allTasks = await tasksDB.getAll();
    const allWorkUnits = await workUnitsDB.getAll();

    const prioritized: PrioritizedWorkUnit[] = [];
    const today = new Date();

    for (const workUnit of allWorkUnits) {
        if (isWorkUnitComplete(workUnit)) continue;

        const task = allTasks.find(t => t.id === workUnit.taskId);
        if (!task) continue;

        const goal = goals.find(g => g.id === task.goalId);
        if (!goal) continue;

        // Calculate priority
        let priority = 50; // Base priority

        // Target date urgency (higher priority for closer dates)
        if (goal.targetDate) {
            const targetDate = new Date(goal.targetDate);
            const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 7) priority += 30;
            else if (daysUntil <= 14) priority += 20;
            else if (daysUntil <= 30) priority += 10;
        }

        // Staleness bonus (TODO: track last worked date)
        // For now, distribute evenly
        priority += Math.random() * 10;

        prioritized.push({ workUnit, task, goal, priority });
    }

    // Sort by priority descending
    return prioritized.sort((a, b) => b.priority - a.priority);
}

// ============================================
// Daily Plan Generation
// ============================================

export interface PlanGenerationResult {
    plan: DailyPlan;
    metadata: {
        totalWorkUnits: number;
        selectedSlices: number;
        capacityUsed: number;
        capacityAvailable: number;
        message: string;
    };
}

/**
 * Generate today's plan using slice-based allocation.
 * This is the main entry point for the Planning Engine.
 */
export async function generateDailyPlan(
    date: string = getLocalDateString(),
    mode: DayMode = 'medium'
): Promise<PlanGenerationResult> {
    console.log('[DEBUG][generateDailyPlan] Called with:', { date, mode });

    const capacity = await estimateDailyCapacity();
    const prioritizedUnits = await prioritizeWorkUnits();

    console.log('[DEBUG][generateDailyPlan] Capacity:', capacity, 'WorkUnits:', prioritizedUnits.length);

    const slices: Slice[] = [];
    let usedMinutes = 0;

    const usedTaskIds = new Set<string>();

    // Generate slices up to capacity and cognitive limit
    for (const { workUnit, task, goal } of prioritizedUnits) {
        if (slices.length >= COGNITIVE_LIMIT) break;
        if (usedMinutes >= capacity) break;

        // Variety Rule: One slice per task per day (unless very few tasks)
        // If we have plenty of options, skip used tasks.
        if (prioritizedUnits.length > COGNITIVE_LIMIT && usedTaskIds.has(task.id)) {
            continue;
        }

        const slice = generateSlice(workUnit, task, goal, mode);
        if (!slice) continue;

        // Check if adding this slice exceeds capacity
        if (usedMinutes + slice.minutes > capacity && slices.length > 0) {
            continue; // Skip but keep looking for smaller slices
        }

        slices.push(slice);
        usedTaskIds.add(task.id);
        usedMinutes += slice.minutes;
    }

    // Guarantee: If work exists, plan must not be empty
    if (slices.length === 0 && prioritizedUnits.length > 0) {
        const { workUnit, task, goal } = prioritizedUnits[0];
        const microSlice = generateSlice(workUnit, task, goal, 'light');
        if (microSlice) {
            slices.push(microSlice);
            usedMinutes = microSlice.minutes;
        }
    }

    console.log('[DEBUG][generateDailyPlan] Generated slices:', slices.map(s => ({
        title: s.workUnit.title?.substring(0, 25),
        minutes: s.minutes,
        label: s.label,
    })));

    const plan: DailyPlan = {
        date,
        mode,
        slices,
        totalMinutes: usedMinutes,
        capacityMinutes: capacity,
    };

    // Save allocation
    await dailyAllocationsDB.create({
        date,
        workUnitIds: slices.map(s => s.workUnitId),
        sliceMinutes: slices.map(s => s.minutes),
        estimatedLoad: usedMinutes,
        mode,
    });

    const message = slices.length === 0
        ? 'No tasks available. Create a goal to get started!'
        : `${slices.length} action${slices.length > 1 ? 's' : ''} ready for today`;

    return {
        plan,
        metadata: {
            totalWorkUnits: prioritizedUnits.length,
            selectedSlices: slices.length,
            capacityUsed: usedMinutes,
            capacityAvailable: capacity,
            message,
        },
    };
}

/**
 * Regenerate plan with a different mode.
 */
export async function regenerateDailyPlan(
    date: string,
    mode: DayMode
): Promise<PlanGenerationResult> {
    // Delete existing allocation
    await dailyAllocationsDB.delete(date);
    return generateDailyPlan(date, mode);
}

// ============================================
// Slice Completion
// ============================================

/**
 * Mark a slice as completed.
 * Updates the work unit's completed minutes.
 */
export async function completeSlice(slice: Slice): Promise<void> {
    // 1. Update WorkUnit
    await workUnitsDB.recordProgress(slice.workUnitId, slice.minutes);

    // 2. Update Parent Task
    // We fetch fresh to get current accumulator, though slice.task has snapshot
    const task = await tasksDB.getById(slice.task.id);
    if (task) {
        await tasksDB.update(task.id, {
            completedMinutes: (task.completedMinutes || 0) + slice.minutes
        });
    }

    console.log('[DEBUG][completeSlice] Recorded progress:', slice.workUnitId, 'Task:', slice.task.id, '+', slice.minutes, 'min');
}

/**
 * Skip a slice (quiet adaptation).
 * Deprioritizes the work unit slightly for tomorrow.
 */
export async function skipSlice(slice: Slice): Promise<void> {
    // For now, just log. Could track skip count for deprioritization.
    console.log('[DEBUG][skipSlice] Skipped:', slice.workUnitId);
}

// ============================================
// "I Have Time for More"
// ============================================

/**
 * Add more slices to existing plan.
 * Temporarily increases capacity and appends slices.
 */
export async function addMoreSlices(
    date: string,
    existingPlan: DailyPlan,
    extraMinutes: number = 45
): Promise<DailyPlan> {
    const existingWorkUnitIds = new Set(existingPlan.slices.map(s => s.workUnitId));
    const prioritizedUnits = await prioritizeWorkUnits();

    // Filter out already selected work units
    const available = prioritizedUnits.filter(p => !existingWorkUnitIds.has(p.workUnit.id));

    const newSlices: Slice[] = [];
    let addedMinutes = 0;

    for (const { workUnit, task, goal } of available) {
        if (addedMinutes >= extraMinutes) break;

        const slice = generateSlice(workUnit, task, goal, existingPlan.mode);
        if (!slice) continue;

        newSlices.push(slice);
        addedMinutes += slice.minutes;
    }

    // Update allocation
    const allocation = await dailyAllocationsDB.getByDate(date);
    if (allocation) {
        await dailyAllocationsDB.update(date, {
            workUnitIds: [...allocation.workUnitIds, ...newSlices.map(s => s.workUnitId)],
            sliceMinutes: [...allocation.sliceMinutes, ...newSlices.map(s => s.minutes)],
            estimatedLoad: allocation.estimatedLoad + addedMinutes,
        });
    }

    return {
        ...existingPlan,
        slices: [...existingPlan.slices, ...newSlices],
        totalMinutes: existingPlan.totalMinutes + addedMinutes,
    };
}

// ============================================
// Feasibility Assessment
// ============================================

export interface FeasibilityResult {
    isFeasible: boolean;
    suggestedDate?: string;
    message: string;
    requiredDailyMinutes: number;
    availableCapacity: number;
}

/**
 * Check if a goal's target date is feasible given current capacity.
 */
export async function assessFeasibility(
    totalEffortMinutes: number,
    targetDate?: string
): Promise<FeasibilityResult> {
    const capacity = await estimateDailyCapacity();

    if (!targetDate) {
        return {
            isFeasible: true,
            message: 'No target date set. Work at your own pace.',
            requiredDailyMinutes: 0,
            availableCapacity: capacity,
        };
    }

    const today = new Date();
    const target = new Date(targetDate);
    const daysRemaining = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    const requiredDaily = Math.ceil(totalEffortMinutes / daysRemaining);

    if (requiredDaily <= capacity) {
        return {
            isFeasible: true,
            message: 'This timeline looks achievable!',
            requiredDailyMinutes: requiredDaily,
            availableCapacity: capacity,
        };
    }

    // Suggest a more realistic date
    const suggestedDays = Math.ceil(totalEffortMinutes / capacity * 1.1);
    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + suggestedDays);

    return {
        isFeasible: false,
        suggestedDate: suggestedDate.toISOString().split('T')[0],
        message: `This pace might be tight. Consider ${suggestedDate.toLocaleDateString()} for a gentler timeline.`,
        requiredDailyMinutes: requiredDaily,
        availableCapacity: capacity,
    };
}

// ============================================
// Utility Exports
// ============================================

/**
 * Suggest a realistic target date based on total effort and current workload.
 */
export async function suggestTargetDate(totalEffortMinutes: number, excludeGoalId?: string): Promise<string> {
    const capacity = await estimateDailyCapacity();

    // Check how many active goals we already have to split capacity
    const allGoals = await goalsDB.getAll();
    const activeGoals = allGoals.filter(g => g.status === 'active' && g.id !== excludeGoalId);
    const concurrentGoals = activeGoals.length + 1; // +1 for the new goal

    // Allocate capacity: fair split, but minimum 20 mins/day per goal to be viable
    // e.g. 120 capacity / 3 goals = 40 mins/day each
    let dailyAllocation = Math.floor(capacity / concurrentGoals);
    if (dailyAllocation < 20) dailyAllocation = 20;

    const daysNeeded = Math.ceil((totalEffortMinutes / dailyAllocation) * 1.25); // 25% buffer for life events

    const date = new Date();
    date.setDate(date.getDate() + daysNeeded);
    return date.toISOString().split('T')[0];
}

/**
 * Check if a target date is feasible (Alias for assessFeasibility with extra options)
 */
export async function assessTargetDateFeasibility(
    totalMinutes: number,
    targetDate: string,
    excludeGoalId?: string,
    traceId?: string
): Promise<FeasibilityResult> {
    return assessFeasibility(totalMinutes, targetDate);
}

/**
 * Assess if adding a new goal is advisable given current load.
 */
export async function assessGoalAdmission(totalMinutes: number): Promise<{ paceAdjustment: 'standard' | 'gentle'; message?: string }> {
    const capacity = await estimateDailyCapacity();
    // Simple check: if goal is huge (> 20 hours), suggest gentle pace
    if (totalMinutes > 1200) {
        return { paceAdjustment: 'gentle', message: 'This is a large goal. We will break it down into small daily steps.' };
    }
    return { paceAdjustment: 'standard' };
}

/**
 * Alias for regenerateDailyPlan but for all users/contexts (placeholder for future expansion).
 */
export async function reassessDailyPlans(): Promise<void> {
    // For single user app, just regenerate today
    await regenerateDailyPlan(getLocalDateString(), 'medium');
}

/**
 * Assess impact of new workload (stub for now).
 */
export async function assessTotalWorkload(newMinutes: number): Promise<string> {
    return 'moderate';
}

export { getLocalDateString };
