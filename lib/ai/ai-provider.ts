// SmallSteps AI Provider Interface
// Pluggable adapter system for Claude, Gemini, and OpenAI
// Three-stage flow: Goal Clarification → Tasks → WorkUnits

/**
 * Clarification Question - Reduces ambiguity before decomposition
 * Each question maps to planning constraints
 */
export interface ClarificationQuestion {
    id: string;
    questionText: string;
    planningDimension: 'scope' | 'skill' | 'time' | 'rhythm' | 'priority';
    options: Array<{
        value: string;
        label: string;
        planningHint?: string;  // How this affects task generation
    }>;
}

/**
 * User's answer to a clarification question
 */
export interface ClarificationAnswer {
    questionId: string;
    selectedValue: string;
    isCustom: boolean;
    customText?: string;
}

/**
 * Result of clarification step - context for decomposition
 */
export interface ClarificationResult {
    questions: ClarificationQuestion[];
    answers: ClarificationAnswer[];
    planningContext: {
        scopeHint?: string;      // e.g., "just basics" vs "mastery"
        skillLevel?: string;     // e.g., "complete beginner" vs "some experience"
        timeCommitment?: string; // e.g., "15 min/day" vs "a few hours/week"
        preferredRhythm?: string; // e.g., "daily habit" vs "weekend blocks"
        priorityLevel?: string;  // e.g., "main focus" vs "side project"
    };
}

export interface TaskSuggestion {
    title: string;
    estimatedTotalMinutes: number;
    phase?: string; // Flexible phase name
    complexity?: 1 | 2 | 3;
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
     * Stage 0: Generate clarification questions for a goal
     * Returns exactly 3 questions to reduce ambiguity before decomposition
     */
    clarifyGoal(goalText: string, traceId?: string): Promise<ClarificationQuestion[]>;

    /**
     * Stage 1: Decompose Goal into Tasks
     * Now accepts optional clarification context for better planning
     */
    decomposeGoal(goalText: string, targetDate?: string, userFeedback?: string, isLifelong?: boolean, traceId?: string, clarificationContext?: ClarificationResult): Promise<GoalPlan>;

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
    /**
     * Optional: Generic completion for flexible prompting
     * Required for Intelligent Planning features
     */
    generateCompletion?(prompt: string, options?: { temperature?: number, maxTokens?: number, jsonMode?: boolean }): Promise<string>;
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

    async generateCompletion(prompt: string): Promise<string> {
        // Fallback for generic calls
        // In manual mode, we might just return empty JSON or a polite stub
        console.warn('ManualProvider: generateCompletion called but not fully supported. Returning empty JSON.');
        return "{}";
    }

    async clarifyGoal(goalText: string): Promise<ClarificationQuestion[]> {
        // Manual mode: return default clarification questions
        return [
            {
                id: 'scope',
                questionText: 'What would feel like success for this goal?',
                planningDimension: 'scope',
                options: [
                    { value: 'basics', label: 'Get the basics down', planningHint: 'Focus on fundamentals' },
                    { value: 'functional', label: 'Be functional / practical', planningHint: 'Focus on practical skills' },
                    { value: 'confident', label: 'Feel genuinely confident', planningHint: 'Build depth and confidence' },
                    { value: 'advanced', label: 'Reach an advanced level', planningHint: 'Include challenging material' },
                    { value: 'custom', label: 'Not sure / Custom', planningHint: 'Balanced approach' },
                ],
            },
            {
                id: 'experience',
                questionText: 'Where are you starting from?',
                planningDimension: 'skill',
                options: [
                    { value: 'zero', label: 'Complete beginner', planningHint: 'Start from scratch' },
                    { value: 'dabbled', label: 'Dabbled a bit before', planningHint: 'Quick review then progress' },
                    { value: 'some', label: 'Some real experience', planningHint: 'Skip basics, build on existing' },
                    { value: 'rusty', label: 'Know it but rusty', planningHint: 'Focus on refreshing' },
                    { value: 'custom', label: 'Not sure / Custom', planningHint: 'Start with assessment' },
                ],
            },
            {
                id: 'rhythm',
                questionText: 'What pace feels sustainable?',
                planningDimension: 'rhythm',
                options: [
                    { value: 'tiny', label: '10-15 minutes daily', planningHint: 'Very small daily chunks' },
                    { value: 'moderate', label: '30 minutes daily', planningHint: 'Moderate daily practice' },
                    { value: 'focused', label: 'A few longer sessions/week', planningHint: 'Bigger weekly blocks' },
                    { value: 'intensive', label: 'Deep dives when I can', planningHint: 'Flexible intensive sessions' },
                    { value: 'custom', label: 'Not sure / Custom', planningHint: 'Adaptable schedule' },
                ],
            },
        ];
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
