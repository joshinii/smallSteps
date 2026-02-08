// SmallSteps Multi-Agent System Types
// Shared type definitions for orchestration, clarification, generation, and validation

// ============================================
// Import Existing Types
// ============================================

import type { Goal, Task, WorkUnit, WorkUnitKind } from '@/lib/schema';
import type {
    ClarificationQuestion as AIClarificationQuestion,
    ClarificationAnswer,
    ClarificationResult,
    TaskSuggestion,
    WorkUnitSuggestion,
    GoalPlan,
    TaskPlan,
    EffortEstimate,
    AIProvider,
} from '@/lib/ai/ai-provider';

// Re-export for convenience
export type {
    Goal,
    Task,
    WorkUnit,
    WorkUnitKind,
    AIClarificationQuestion,
    ClarificationAnswer,
    ClarificationResult,
    TaskSuggestion,
    WorkUnitSuggestion,
    GoalPlan,
    TaskPlan,
    EffortEstimate,
    AIProvider,
};

// ============================================
// Clarification Types
// ============================================

/**
 * Question - Generic question structure for clarification flow
 * Supports text input, select dropdowns, and numeric input
 */
export interface Question {
    id: string;
    text: string;
    type: 'text' | 'select' | 'number';
    options?: string[];
    placeholder?: string;
    required?: boolean;
}

/**
 * ClarificationContext - Holds goal + questions + user answers
 * Used to inform task generation with user-provided context
 */
export interface ClarificationContext {
    goalTitle: string;
    questions: Question[];
    answers: Record<string, any>;
}

// ============================================
// Generation Types
// ============================================

/**
 * GeneratedTask - Task without DB-generated fields
 * Ready to be persisted after adding id, goalId, timestamps
 */
export type GeneratedTask = Omit<Task, 'id' | 'goalId' | 'createdAt' | 'updatedAt'>;

/**
 * GeneratedWorkUnit - WorkUnit without DB-generated fields
 * Includes taskOrder to link to parent task by position
 */
export type GeneratedWorkUnit = Omit<WorkUnit, 'id' | 'taskId' | 'createdAt' | 'updatedAt'> & {
    taskOrder: number; // Which task this belongs to (0-indexed)
};

/**
 * GeneratedBreakdown - Full goal decomposition result
 * Contains tasks and their associated work units
 */
export interface GeneratedBreakdown {
    tasks: GeneratedTask[];
    workUnits: GeneratedWorkUnit[];
}

// ============================================
// Validation Types
// ============================================

/**
 * ValidationResult - Output from validation agent
 * Reports validity, issues found, and optional suggestions
 */
export interface ValidationResult {
    valid: boolean;
    issues: string[];
    suggestions?: string[];
    confidence?: number; // 0-1 scale
}

// ============================================
// Orchestration Types
// ============================================

/**
 * OrchestrationStep - Current step in the multi-agent pipeline
 * 
 * Flow: idle → clarifying → generating → validating → awaiting_approval → complete
 *       ↓                                                    ↓
 *       └──────────────────────── failed ←───────────────────┘
 */
export type OrchestrationStep =
    | 'idle'
    | 'clarifying'
    | 'generating'
    | 'validating'
    | 'awaiting_approval'
    | 'complete'
    | 'failed';

/**
 * OrchestrationState - Full state of the orchestration pipeline
 * Tracks current step, context, results, and progress
 */
export interface OrchestrationState {
    step: OrchestrationStep;
    goalTitle: string;
    context?: ClarificationContext;
    breakdown?: GeneratedBreakdown;
    validation?: ValidationResult;
    error?: string;
    progress?: number; // 0-100
}

/**
 * ProgressCallback - Function signature for progress updates
 * Called by orchestrator to notify UI of state changes
 */
export type ProgressCallback = (state: OrchestrationState) => void;

// ============================================
// Agent Interface Types
// ============================================

/**
 * ClarifierAgent - Generates clarification questions for a goal
 */
export interface ClarifierAgent {
    clarify(goalTitle: string): Promise<Question[]>;
}

/**
 * GeneratorAgent - Generates task/work unit breakdown from clarified goal
 */
export interface GeneratorAgent {
    generate(context: ClarificationContext): Promise<GeneratedBreakdown>;
}

/**
 * ValidatorAgent - Validates generated breakdown for quality
 */
export interface ValidatorAgent {
    validate(goalTitle: string, breakdown: GeneratedBreakdown): Promise<ValidationResult>;
}

/**
 * OrchestratorAgent - Coordinates the full multi-agent pipeline
 */
export interface OrchestratorAgent {
    run(
        goalTitle: string,
        onProgress?: ProgressCallback
    ): Promise<OrchestrationState>;

    submitAnswers(
        answers: Record<string, any>
    ): Promise<OrchestrationState>;

    approve(): Promise<OrchestrationState>;

    getState(): OrchestrationState;
}
