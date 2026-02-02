// SmallSteps AI Provider Interface
// Pluggable adapter system for Claude, Gemini, and OpenAI
// Two-stage decomposition: Goal → Tasks → WorkUnits

export interface TaskSuggestion {
    title: string;
    estimatedTotalMinutes: number;
    // Legacy support (will be phased out or handled in enforcement)
    content?: string;
}

export interface WorkUnitSuggestion {
    title: string;
    kind: 'study' | 'practice' | 'build' | 'review' | 'explore';
    estimatedTotalMinutes: number;
    capabilityId?: string;
}

export interface GoalPlan {
    rationale?: string;
    tasks: TaskSuggestion[];
    totalEstimatedMinutes?: number;
}

export interface TaskPlan {
    workUnits: WorkUnitSuggestion[];
}

export interface EffortEstimate {
    estimatedTotalMinutes: number;
    confidence: 'low' | 'medium' | 'high';
    rationale?: string;
}

/**
 * Provider-agnostic AI interface for SmallSteps
 */
export interface AIProvider {
    readonly name: string;
    readonly displayName: string;

    /**
     * Stage 1: Decompose Goal into Tasks
     */
    decomposeGoal(goalText: string, targetDate?: string, userFeedback?: string, isLifelong?: boolean, traceId?: string): Promise<GoalPlan>;

    /**
     * Stage 2: Decompose Task into WorkUnits
     */
    decomposeTask(taskTitle: string, taskTotalMinutes: number, otherTasks?: string[], priorCapabilities?: string[]): Promise<TaskPlan>;

    /**
     * Estimate total effort for a goal/task
     */
    estimateGoalEffort(goalText: string): Promise<EffortEstimate>;

    /**
     * Validate the API key (check connection/auth)
     */
    validateApiKey(): Promise<boolean>;
}

/**
 * Fallback provider when no AI is available
 */
export class ManualProvider implements AIProvider {
    readonly name = 'manual';
    readonly displayName = 'Continue Manually';

    async validateApiKey(): Promise<boolean> {
        return true;
    }

    async decomposeGoal(goalText: string): Promise<GoalPlan> {
        return {
            rationale: 'Manual fallback.',
            tasks: [
                { title: 'Task 1', estimatedTotalMinutes: 120 },
                { title: 'Task 2', estimatedTotalMinutes: 180 },
            ],
        };
    }

    async decomposeTask(taskTitle: string, taskTotalMinutes: number, otherTasks?: string[], priorCapabilities?: string[]): Promise<TaskPlan> {
        // Simple heuristic fallback
        return {
            workUnits: [
                { title: `Start ${taskTitle}`, kind: 'practice', estimatedTotalMinutes: Math.floor(taskTotalMinutes * 0.4) },
                { title: `Continue ${taskTitle}`, kind: 'build', estimatedTotalMinutes: Math.floor(taskTotalMinutes * 0.6) },
            ]
        };
    }

    async estimateGoalEffort(goalText: string): Promise<EffortEstimate> {
        return {
            estimatedTotalMinutes: 600,
            confidence: 'low',
            rationale: 'Manual fallback'
        };
    }
}

export const manualProvider = new ManualProvider();
