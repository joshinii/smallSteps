// SmallSteps AI Provider Interface
// Pluggable adapter system for Claude, Gemini, and OpenAI
// Two-stage decomposition: Goal → Tasks → WorkUnits

export interface TaskSuggestion {
    title: string;
    estimatedTotalMinutes: number;
    whyThisMatters?: string; // Encouragement about what this milestone unlocks
    // Legacy support (will be phased out or handled in enforcement)
    content?: string;
}

export interface WorkUnitSuggestion {
    title: string;
    kind: 'study' | 'practice' | 'build' | 'review' | 'explore';
    estimatedTotalMinutes: number;
    capabilityId?: string;
    firstAction?: string;  // Tiny first step (startable in <2 min)
    successSignal?: string; // How user knows they're done
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
 * Generates simple, encouraging defaults following Gentle Architect philosophy
 */
export class ManualProvider implements AIProvider {
    readonly name = 'manual';
    readonly displayName = 'Continue Manually';

    async validateApiKey(): Promise<boolean> {
        return true;
    }

    async decomposeGoal(goalText: string): Promise<GoalPlan> {
        return {
            rationale: 'Simple starting structure - you can edit these milestones.',
            tasks: [
                {
                    title: 'Get started with first steps',
                    estimatedTotalMinutes: 120,
                    whyThisMatters: 'Building momentum with early wins'
                },
                {
                    title: 'Build on your progress',
                    estimatedTotalMinutes: 180,
                    whyThisMatters: 'Taking what you learned further'
                },
            ],
        };
    }

    async decomposeTask(taskTitle: string, taskTotalMinutes: number, otherTasks?: string[], priorCapabilities?: string[]): Promise<TaskPlan> {
        // Simple heuristic fallback with quality fields
        const firstHalf = Math.floor(taskTotalMinutes * 0.4);
        const secondHalf = taskTotalMinutes - firstHalf;

        return {
            workUnits: [
                {
                    title: `Begin ${taskTitle}`,
                    kind: 'explore',
                    estimatedTotalMinutes: firstHalf,
                    firstAction: 'Gather your materials and find a comfortable spot',
                    successSignal: 'You have a clear picture of what to do next'
                },
                {
                    title: `Complete ${taskTitle}`,
                    kind: 'build',
                    estimatedTotalMinutes: secondHalf,
                    firstAction: 'Pick up where you left off',
                    successSignal: 'You can see tangible progress from your effort'
                },
            ]
        };
    }

    async estimateGoalEffort(goalText: string): Promise<EffortEstimate> {
        return {
            estimatedTotalMinutes: 600,
            confidence: 'low',
            rationale: 'A reasonable starting estimate - adjust based on your experience'
        };
    }
}

export const manualProvider = new ManualProvider();
