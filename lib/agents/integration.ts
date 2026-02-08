// SmallSteps Integration Helper
// Converts agent outputs (GeneratedBreakdown) to database entities (Goal, Task, WorkUnit)

import { goalsDB, tasksDB, workUnitsDB } from '@/lib/db';
import type { Goal, Task, WorkUnit } from '@/lib/schema';
import type { GeneratedBreakdown } from './types';

// ============================================
// Types
// ============================================

export interface CreateGoalResult {
    goal: Goal;
    tasks: Task[];
    workUnits: WorkUnit[];
}

export interface CreateGoalOptions {
    /** Additional goal data to merge */
    goalData?: Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>;
    /** Total estimated minutes for the goal (auto-calculated if not provided) */
    totalEstimatedMinutes?: number;
}

// ============================================
// Main Integration Function
// ============================================

/**
 * Create a Goal with all its Tasks and WorkUnits from a GeneratedBreakdown
 * 
 * This is the primary integration point between the agent system and the database.
 * It converts the agent's output format to persisted entities.
 * 
 * @param goalTitle - The goal title
 * @param breakdown - Output from generateStructuredBreakdown
 * @param options - Additional options for goal creation
 * @returns Promise<CreateGoalResult> with all created entities
 */
export async function createGoalFromBreakdown(
    goalTitle: string,
    breakdown: GeneratedBreakdown,
    options: CreateGoalOptions = {}
): Promise<CreateGoalResult> {
    console.log('💾 INTEGRATION: Creating goal from breakdown:', goalTitle);

    // Calculate total estimated minutes (for reference, goal doesn't store this)
    const totalEstimatedMinutes = breakdown.tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
    console.log(`💾 INTEGRATION: Total estimated minutes: ${totalEstimatedMinutes}`);

    // 1. Create Goal (only use fields that exist in Goal schema)
    const goalId = await goalsDB.create({
        title: goalTitle,
        status: 'active',
        ...options.goalData,
    });

    const goal = await goalsDB.getById(goalId);
    if (!goal) {
        throw new Error('Failed to retrieve created goal');
    }

    console.log(`💾 INTEGRATION: Created goal ${goalId}`);

    // 2. Create Tasks
    const createdTasks: Task[] = [];

    for (const taskData of breakdown.tasks) {
        const task = await tasksDB.create({
            goalId: goal.id,
            title: taskData.title,
            estimatedTotalMinutes: taskData.estimatedTotalMinutes,
            completedMinutes: 0,
            order: taskData.order,
            phase: taskData.phase,
            complexity: taskData.complexity ?? estimateComplexity(taskData.estimatedTotalMinutes),
            whyThisMatters: taskData.whyThisMatters,
        });

        createdTasks.push(task);
    }

    console.log(`💾 INTEGRATION: Created ${createdTasks.length} tasks`);

    // 3. Create WorkUnits
    const createdWorkUnits: WorkUnit[] = [];

    for (const wuData of breakdown.workUnits) {
        // Find parent task by order
        const parentTask = createdTasks.find(t => t.order === wuData.taskOrder);

        if (!parentTask) {
            console.warn(`💾 INTEGRATION: No parent task found for workUnit "${wuData.title}" (taskOrder: ${wuData.taskOrder})`);
            continue;
        }

        const workUnit = await workUnitsDB.create({
            taskId: parentTask.id,
            title: wuData.title,
            estimatedTotalMinutes: wuData.estimatedTotalMinutes,
            completedMinutes: 0,
            kind: wuData.kind,
            capabilityId: wuData.capabilityId,
            firstAction: wuData.firstAction,
            successSignal: wuData.successSignal,
        });

        createdWorkUnits.push(workUnit);
    }

    console.log(`💾 INTEGRATION: Created ${createdWorkUnits.length} work units`);

    return {
        goal,
        tasks: createdTasks,
        workUnits: createdWorkUnits,
    };
}

// ============================================
// Rollback Function (Error Recovery)
// ============================================

/**
 * Delete a goal and all associated tasks/work units
 * 
 * Use this for error recovery if goal creation partially fails.
 * Note: goalsDB.delete() already handles cascading deletes.
 * 
 * @param goalId - The goal ID to delete
 */
export async function rollbackGoalCreation(goalId: string): Promise<void> {
    console.log('💾 INTEGRATION: Rolling back goal creation:', goalId);

    try {
        await goalsDB.delete(goalId);
        console.log('💾 INTEGRATION: Rollback complete');
    } catch (error) {
        console.error('💾 INTEGRATION: Rollback failed:', error);
        throw error;
    }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Estimate complexity based on time
 */
function estimateComplexity(minutes: number): 1 | 2 | 3 {
    if (minutes <= 120) return 1;
    if (minutes <= 300) return 2;
    return 3;
}

/**
 * Estimate effort level based on total goal time
 */
function estimateEffortLevel(totalMinutes: number): 'light' | 'medium' | 'heavy' {
    if (totalMinutes <= 240) return 'light';      // Up to 4 hours
    if (totalMinutes <= 600) return 'medium';     // Up to 10 hours
    return 'heavy';                                // More than 10 hours
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Verify that a breakdown can be saved (basic checks)
 */
export function validateBreakdownForSave(breakdown: GeneratedBreakdown): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (breakdown.tasks.length === 0) {
        errors.push('No tasks in breakdown');
    }

    if (breakdown.workUnits.length === 0) {
        errors.push('No work units in breakdown');
    }

    // Check that all work units have valid parent task references
    const taskOrders = new Set(breakdown.tasks.map(t => t.order));
    for (const wu of breakdown.workUnits) {
        if (!taskOrders.has(wu.taskOrder)) {
            errors.push(`WorkUnit "${wu.title}" references non-existent task order ${wu.taskOrder}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============================================
// Query Helpers
// ============================================

/**
 * Load a goal with all its tasks and work units
 */
export async function loadGoalWithBreakdown(goalId: string): Promise<CreateGoalResult | null> {
    const goal = await goalsDB.getById(goalId);
    if (!goal) return null;

    const tasks = await tasksDB.getByGoalId(goalId);

    const workUnits: WorkUnit[] = [];
    for (const task of tasks) {
        const units = await workUnitsDB.getByTaskId(task.id);
        workUnits.push(...units);
    }

    return { goal, tasks, workUnits };
}
