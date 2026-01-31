// SmallSteps AI Provider Interface
// Pluggable adapter system for Claude, Gemini, and OpenAI

export interface TaskSuggestion {
    content: string;
    category?: string;
    estimatedMinutes: number;
    isRecurring: boolean;
    frequency?: 'daily' | 'weekdays' | 'weekends' | 'weekly' | string;
}

export interface GoalPlan {
    rationale: string;
    tasks: TaskSuggestion[];
    totalEstimatedMinutes?: number; // Total effort for the entire goal (e.g. 1800 for reading 3 books)
}

export interface EffortEstimate {
    estimatedMinutes: number;
    confidence: 'low' | 'medium' | 'high';
    rationale?: string;
}

export interface RecurringSuggestion {
    taskContent: string;
    shouldBeRecurring: boolean;
    frequency?: 'daily' | 'most_days' | 'occasionally';
    reason?: string;
}

/**
 * Provider-agnostic AI interface for SmallSteps
 * Each provider implements these methods with their specific API
 */
export interface AIProvider {
    readonly name: string;
    readonly displayName: string;

    /**
     * Decompose a goal into actionable tasks
     * Returns tasks with estimated effort (hidden from user)
     * @param userFeedback - Optional feedback for AI regeneration (e.g., "Make tasks smaller")
     */
    decomposeGoal(goalText: string, targetDate?: string, userFeedback?: string, isLifelong?: boolean): Promise<GoalPlan>;

    /**
     * Estimate effort for a single task
     */
    estimateTaskEffort(taskContent: string): Promise<EffortEstimate>;

    /**
     * Identify which tasks should be recurring (daily habits)
     */
    identifyRecurringTasks(tasks: string[]): Promise<RecurringSuggestion[]>;

    /**
     * Validate the API key (check connection/auth)
     */
    validateApiKey(): Promise<boolean>;
}

/**
 * Fallback provider when no AI is available
 * Creates basic tasks without AI intelligence
 */
export class ManualProvider implements AIProvider {
    readonly name = 'manual';
    readonly displayName = 'Continue Manually';

    async validateApiKey(): Promise<boolean> {
        return true;
    }

    async decomposeGoal(goalText: string, targetDate?: string, userFeedback?: string, isLifelong?: boolean): Promise<GoalPlan> {
        return {
            rationale: 'Breaking this down into manageable steps.',
            tasks: [
                {
                    content: `Start working on: ${goalText}`,
                    estimatedMinutes: 30,
                    isRecurring: !!isLifelong,
                },
                {
                    content: 'Make incremental progress',
                    estimatedMinutes: 25,
                    isRecurring: !!isLifelong,
                },
                {
                    content: 'Review and adjust approach',
                    estimatedMinutes: 15,
                    isRecurring: !!isLifelong,
                },
            ],
        };
    }

    async estimateTaskEffort(taskContent: string): Promise<EffortEstimate> {
        // Default to medium effort
        return {
            estimatedMinutes: 25,
            confidence: 'low',
            rationale: 'Default estimate without AI analysis',
        };
    }

    async identifyRecurringTasks(tasks: string[]): Promise<RecurringSuggestion[]> {
        // Without AI, we can't intelligently identify recurring tasks
        return tasks.map((content) => ({
            taskContent: content,
            shouldBeRecurring: false,
        }));
    }
}

// Singleton manual provider
export const manualProvider = new ManualProvider();
