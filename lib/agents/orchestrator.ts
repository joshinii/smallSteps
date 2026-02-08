// SmallSteps Orchestrator Agent
// Coordinates the multi-agent workflow: Clarifier → Generator → Validator

import { generateContextQuestions } from './clarifier';
import { generateStructuredBreakdown } from './decomposer';
import { validateBreakdown, validateGoalClarity } from './validator';
import type {
    OrchestrationState,
    ProgressCallback,
    GeneratedBreakdown,
    Question,
    ClarificationContext,
    ValidationResult,
} from './types';
import type { AIProvider } from '@/lib/ai/ai-provider';

// ============================================
// Configuration
// ============================================

const ORCHESTRATION_CONFIG = {
    maxGenerationAttempts: 2,
    progress: {
        clarifying: { start: 5, end: 15 },
        generating: { start: 20, attempt2: 45, end: 65 },
        validating: { start: 70, end: 85 },
        awaitingApproval: 90,
        complete: 100,
    },
};

// ============================================
// Custom Error for User Input Required
// ============================================

export class AwaitingUserInputError extends Error {
    public readonly questions: Question[];
    public readonly context: ClarificationContext;

    constructor(questions: Question[], goalTitle: string) {
        super('AWAITING_USER_INPUT');
        this.name = 'AwaitingUserInputError';
        this.questions = questions;
        this.context = {
            goalTitle,
            questions,
            answers: {},
        };
    }
}

/**
 * Error thrown when goal is too vague to proceed
 */
export class VagueGoalError extends Error {
    public readonly issues: string[];
    public readonly suggestion?: string;

    constructor(issues: string[], suggestion?: string) {
        super('VAGUE_GOAL');
        this.name = 'VagueGoalError';
        this.issues = issues;
        this.suggestion = suggestion;
    }
}

// ============================================
// Result Types
// ============================================

export interface StartResult {
    questions: Question[];
    context: ClarificationContext;
}

export interface CompleteResult {
    breakdown: GeneratedBreakdown;
    validation: ValidationResult;
}

// ============================================
// Two-Phase Orchestration API
// ============================================

/**
 * Phase 1: Start goal creation by generating clarification questions
 * 
 * Returns questions that UI should display to user.
 * Once user answers, call completeGoalCreation with the answers.
 * 
 * @param goalTitle - The user's goal text
 * @param aiProvider - AIProvider instance
 * @param onProgress - Progress callback for UI updates
 * @returns Promise<StartResult> with questions to display
 */
export async function startGoalCreation(
    goalTitle: string,
    aiProvider: AIProvider,
    onProgress?: ProgressCallback
): Promise<StartResult> {
    console.log('🎭 ORCHESTRATOR: Starting goal creation for:', goalTitle);

    const state: OrchestrationState = {
        step: 'clarifying',
        goalTitle,
        progress: ORCHESTRATION_CONFIG.progress.clarifying.start,
    };

    onProgress?.(state);

    try {
        // First, check if goal is clear enough
        const clarityCheck = await validateGoalClarity(goalTitle, aiProvider);

        if (!clarityCheck.isClear) {
            console.log('🎭 ORCHESTRATOR: Goal too vague:', clarityCheck.issues);
            throw new VagueGoalError(clarityCheck.issues, clarityCheck.suggestion);
        }

        // Generate clarification questions
        const questions = await generateContextQuestions(goalTitle, aiProvider);

        const context: ClarificationContext = {
            goalTitle,
            questions,
            answers: {},
        };

        // Update progress
        state.context = context;
        state.progress = ORCHESTRATION_CONFIG.progress.clarifying.end;
        onProgress?.(state);

        console.log(`🎭 ORCHESTRATOR: Generated ${questions.length} questions`);

        return { questions, context };

    } catch (error) {
        state.step = 'failed';
        state.error = error instanceof Error ? error.message : 'Failed to generate questions';
        state.progress = 0;
        onProgress?.(state);

        console.error('🎭 ORCHESTRATOR: Failed to start:', error);
        throw error;
    }
}

/**
 * Phase 2: Complete goal creation with user's answers
 * 
 * Takes the user's answers from Phase 1 and generates/validates the breakdown.
 * 
 * @param goalTitle - The user's goal text
 * @param answers - User's answers to clarification questions
 * @param aiProvider - AIProvider instance
 * @param onProgress - Progress callback for UI updates
 * @returns Promise<CompleteResult> with breakdown and validation
 */
export async function completeGoalCreation(
    goalTitle: string,
    answers: Record<string, any>,
    aiProvider: AIProvider,
    onProgress?: ProgressCallback
): Promise<CompleteResult> {
    console.log('🎭 ORCHESTRATOR: Completing goal creation for:', goalTitle);
    console.log('🎭 ORCHESTRATOR: Answers:', JSON.stringify(answers));

    const state: OrchestrationState = {
        step: 'generating',
        goalTitle,
        progress: ORCHESTRATION_CONFIG.progress.generating.start,
    };

    let attempt = 0;
    let lastValidation: ValidationResult | undefined;
    let lastBreakdown: GeneratedBreakdown | undefined;

    try {
        // Generation loop with retry
        while (attempt < ORCHESTRATION_CONFIG.maxGenerationAttempts) {
            attempt++;
            console.log(`🎭 ORCHESTRATOR: Generation attempt ${attempt}/${ORCHESTRATION_CONFIG.maxGenerationAttempts}`);

            // Update progress for this attempt
            state.step = 'generating';
            state.progress = attempt === 1
                ? ORCHESTRATION_CONFIG.progress.generating.start
                : ORCHESTRATION_CONFIG.progress.generating.attempt2;
            onProgress?.(state);

            // Generate breakdown
            const breakdown = await generateStructuredBreakdown(goalTitle, answers, aiProvider);
            lastBreakdown = breakdown;

            // Update state with breakdown
            state.breakdown = breakdown;
            state.progress = ORCHESTRATION_CONFIG.progress.generating.end;
            onProgress?.(state);

            console.log(`🎭 ORCHESTRATOR: Generated ${breakdown.tasks.length} tasks, ${breakdown.workUnits.length} work units`);

            // Validate
            state.step = 'validating';
            state.progress = ORCHESTRATION_CONFIG.progress.validating.start;
            onProgress?.(state);

            const validation = await validateBreakdown(goalTitle, breakdown, aiProvider);
            lastValidation = validation;

            state.validation = validation;
            state.progress = ORCHESTRATION_CONFIG.progress.validating.end;
            onProgress?.(state);

            if (validation.valid) {
                // Success! Move to awaiting approval
                state.step = 'awaiting_approval';
                state.progress = ORCHESTRATION_CONFIG.progress.awaitingApproval;
                onProgress?.(state);

                console.log('🎭 ORCHESTRATOR: Breakdown validated successfully');

                return { breakdown, validation };
            }

            // Validation failed
            console.warn(`🎭 ORCHESTRATOR: Validation failed (attempt ${attempt}):`, validation.issues);

            if (attempt >= ORCHESTRATION_CONFIG.maxGenerationAttempts) {
                // Out of retries - return with issues
                console.warn('🎭 ORCHESTRATOR: Max attempts reached, returning with issues');

                // Still return the breakdown, let UI decide what to do
                state.step = 'awaiting_approval';
                state.progress = ORCHESTRATION_CONFIG.progress.awaitingApproval;
                onProgress?.(state);

                return { breakdown, validation };
            }

            // Will retry
            console.log('🎭 ORCHESTRATOR: Retrying with validation feedback');
        }

        // Should never reach here, but TypeScript needs it
        throw new Error('Orchestration loop exited unexpectedly');

    } catch (error) {
        state.step = 'failed';
        state.error = error instanceof Error ? error.message : 'Unknown error during goal creation';
        state.progress = 0;

        // Preserve any partial results
        if (lastBreakdown) state.breakdown = lastBreakdown;
        if (lastValidation) state.validation = lastValidation;

        onProgress?.(state);

        console.error('🎭 ORCHESTRATOR: Failed to complete:', error);
        throw error;
    }
}

// ============================================
// Single-Call Orchestration API
// ============================================

/**
 * Full orchestration in one call
 * 
 * If contextAnswers is not provided, throws AwaitingUserInputError with questions.
 * Otherwise, runs full generation and validation.
 * 
 * @param goalTitle - The user's goal text
 * @param aiProvider - AIProvider instance
 * @param onProgress - Progress callback for UI updates
 * @param contextAnswers - Optional pre-collected answers
 * @returns Promise<GeneratedBreakdown>
 * @throws AwaitingUserInputError if contextAnswers not provided
 */
export async function orchestrateGoalCreation(
    goalTitle: string,
    aiProvider: AIProvider,
    onProgress: ProgressCallback,
    contextAnswers?: Record<string, any>
): Promise<GeneratedBreakdown> {
    console.log('🎭 ORCHESTRATOR: Full orchestration for:', goalTitle);

    // If no answers provided, generate questions and throw special error
    if (!contextAnswers) {
        const { questions, context } = await startGoalCreation(goalTitle, aiProvider, onProgress);
        throw new AwaitingUserInputError(questions, goalTitle);
    }

    // Have answers, complete the flow
    const { breakdown } = await completeGoalCreation(goalTitle, contextAnswers, aiProvider, onProgress);

    // Mark as complete
    onProgress({
        step: 'complete',
        goalTitle,
        breakdown,
        progress: ORCHESTRATION_CONFIG.progress.complete,
    });

    return breakdown;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if an error is an AwaitingUserInputError
 */
export function isAwaitingUserInput(error: unknown): error is AwaitingUserInputError {
    return error instanceof AwaitingUserInputError;
}

/**
 * Create initial orchestration state
 */
export function createInitialState(goalTitle: string): OrchestrationState {
    return {
        step: 'idle',
        goalTitle,
        progress: 0,
    };
}

/**
 * Mark orchestration as complete (for persistence)
 */
export function markComplete(
    state: OrchestrationState,
    onProgress?: ProgressCallback
): OrchestrationState {
    const completeState: OrchestrationState = {
        ...state,
        step: 'complete',
        progress: ORCHESTRATION_CONFIG.progress.complete,
    };

    onProgress?.(completeState);
    return completeState;
}
