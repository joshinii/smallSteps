// SmallSteps Validator Agent
// Validates breakdown quality using hard rules, semantic relevance, and optional LLM checks

import { z } from 'zod';
import type { AIProvider } from '@/lib/ai/ai-provider';
import type { GeneratedBreakdown, ValidationResult } from './types';
import { checkTaskRelevance } from '@/lib/engine/relevanceFilter';

// ============================================
// Configuration
// ============================================

const VALIDATION_CONFIG = {
    tasks: {
        min: 3,
        max: 6,
    },
    workUnitsPerTask: {
        min: 1,  // Relaxed from 4 to allow simpler goals
        max: 8,
    },
    workUnitMinutes: {
        min: 15,
        max: 120,
    },
    relevanceThreshold: 0.6,
};

// ============================================
// LLM Quality Response Schema
// ============================================

const LLMQualityResponseSchema = z.object({
    quality: z.enum(['good', 'needs_work']),
    suggestions: z.array(z.string()).optional(),
});

// ============================================
// Main Validator Function
// ============================================

/**
 * Validate a generated breakdown for quality and completeness
 * 
 * Three-stage validation:
 * 1. Hard rules - structural requirements (always checked)
 * 2. Semantic relevance - task-goal alignment (uses relevanceFilter)
 * 3. LLM quality check - overwhelm/specificity review (optional)
 * 
 * @param goalTitle - The goal being validated against
 * @param breakdown - GeneratedBreakdown from decomposer
 * @param aiProvider - Optional AIProvider for LLM quality checks
 * @returns ValidationResult with issues and suggestions
 */
export async function validateBreakdown(
    goalTitle: string,
    breakdown: GeneratedBreakdown,
    aiProvider?: AIProvider
): Promise<ValidationResult> {
    console.log('🔍 VALIDATOR: Starting validation for:', goalTitle);

    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    // Stage 1: Hard rule checks (always run)
    const hardRuleIssues = validateHardRules(breakdown);
    issues.push(...hardRuleIssues);

    if (hardRuleIssues.length > 0) {
        confidence -= 0.1 * hardRuleIssues.length;
    }

    // Stage 2: Semantic relevance checks (may fail gracefully)
    try {
        const relevanceIssues = await validateSemanticRelevance(goalTitle, breakdown);
        issues.push(...relevanceIssues);

        if (relevanceIssues.length > 0) {
            confidence -= 0.15 * relevanceIssues.length;
        }
    } catch (error) {
        console.warn('🔍 VALIDATOR: Semantic validation skipped:', error);
        // Don't fail validation if semantic check fails
    }

    // Stage 3: LLM quality check (optional, only if no issues so far)
    if (aiProvider && issues.length === 0) {
        try {
            const llmResult = await validateWithLLM(goalTitle, breakdown, aiProvider);
            if (llmResult.suggestions) {
                suggestions.push(...llmResult.suggestions);
            }
            if (llmResult.quality === 'needs_work') {
                confidence -= 0.2;
            }
        } catch (error) {
            console.warn('🔍 VALIDATOR: LLM validation skipped:', error);
            // LLM check is optional, don't fail validation
        }
    }

    // Clamp confidence to valid range
    confidence = Math.max(0, Math.min(1, confidence));

    const result: ValidationResult = {
        valid: issues.length === 0,
        issues,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        confidence,
    };

    console.log(`🔍 VALIDATOR: Done. Valid: ${result.valid}, Issues: ${issues.length}, Confidence: ${confidence.toFixed(2)}`);
    return result;
}

// ============================================
// Stage 1: Hard Rule Validation
// ============================================

/**
 * Validate structural rules that must be met
 */
function validateHardRules(breakdown: GeneratedBreakdown): string[] {
    const issues: string[] = [];

    // Task count validation
    if (breakdown.tasks.length < VALIDATION_CONFIG.tasks.min) {
        issues.push(`Need at least ${VALIDATION_CONFIG.tasks.min} tasks for proper progression (got ${breakdown.tasks.length})`);
    }
    if (breakdown.tasks.length > VALIDATION_CONFIG.tasks.max) {
        issues.push(`Too many tasks - may overwhelm user (max ${VALIDATION_CONFIG.tasks.max}, got ${breakdown.tasks.length})`);
    }

    // Per-task validation
    for (const task of breakdown.tasks) {
        const units = breakdown.workUnits.filter(wu => wu.taskOrder === task.order);

        // WorkUnit count per task
        if (units.length < VALIDATION_CONFIG.workUnitsPerTask.min) {
            issues.push(`Task "${truncate(task.title)}" needs more work units (min ${VALIDATION_CONFIG.workUnitsPerTask.min})`);
        }
        if (units.length > VALIDATION_CONFIG.workUnitsPerTask.max) {
            issues.push(`Task "${truncate(task.title)}" has too many work units (max ${VALIDATION_CONFIG.workUnitsPerTask.max})`);
        }

        // Required motivation field
        if (!task.whyThisMatters) {
            issues.push(`Task "${truncate(task.title)}" missing motivation (whyThisMatters)`);
        }
    }

    // Individual WorkUnit validation
    for (const wu of breakdown.workUnits) {
        // TIME ESTIMATION REMOVED - No time bounds validation

        // Required quality fields
        if (!wu.firstAction) {
            issues.push(`Missing firstAction for: "${truncate(wu.title)}"`);
        }
        if (!wu.successSignal) {
            issues.push(`Missing successSignal for: "${truncate(wu.title)}"`);
        }
    }

    return issues;
}

// ============================================
// Stage 2: Semantic Relevance Validation
// ============================================

/**
 * Check if tasks are semantically relevant to the goal
 * Uses the embedding-based relevanceFilter from lib/engine
 */
async function validateSemanticRelevance(
    goalTitle: string,
    breakdown: GeneratedBreakdown
): Promise<string[]> {
    const issues: string[] = [];

    for (const task of breakdown.tasks) {
        try {
            const relevance = await checkTaskRelevance(goalTitle, task.title);

            if (relevance.score < VALIDATION_CONFIG.relevanceThreshold) {
                issues.push(
                    `Task "${truncate(task.title)}" may not be relevant to goal (score: ${relevance.score.toFixed(2)})`
                );
            }
        } catch (error) {
            // Individual task check failure is not critical
            console.warn(`🔍 VALIDATOR: Failed to check relevance for "${task.title}":`, error);
        }
    }

    return issues;
}

// ============================================
// Stage 3: LLM Quality Validation
// ============================================

interface LLMQualityResult {
    quality: 'good' | 'needs_work';
    suggestions?: string[];
}

/**
 * Use LLM to assess overall quality and identify potential issues
 */
async function validateWithLLM(
    goalTitle: string,
    breakdown: GeneratedBreakdown,
    aiProvider: AIProvider
): Promise<LLMQualityResult> {
    // Check if provider supports generateCompletion
    if (!('generateCompletion' in aiProvider) || typeof aiProvider.generateCompletion !== 'function') {
        console.log('🔍 VALIDATOR: Provider lacks generateCompletion, skipping LLM validation');
        return { quality: 'good' };
    }

    // TIME ESTIMATION REMOVED - Show structure only
    const taskSummary = breakdown.tasks
        .map(t => `- ${t.title} (Phase: ${t.phase || 'General'})`)
        .join('\n');

    const workUnitSummary = breakdown.workUnits
        .map(wu => `- ${wu.title} (${wu.kind})`)
        .join('\n');

    const prompt = `Review this goal breakdown for quality. The user may be burnt-out or overwhelmed.

Goal: "${goalTitle}"

Tasks (${breakdown.tasks.length}):
${taskSummary}

WorkUnits (${breakdown.workUnits.length}):
${workUnitSummary}

Evaluate:
1. Would this breakdown overwhelm a burnt-out user?
2. Are the actions concrete and specific enough to start immediately?
3. Are any critical steps missing?
4. Do the firstAction steps feel trivially easy to begin?

Return ONLY valid JSON:
{
  "quality": "good" or "needs_work",
  "suggestions": ["suggestion 1", "suggestion 2"] // only if needs_work
}`;

    const response = await aiProvider.generateCompletion(prompt, {
        temperature: 0.3,
        maxTokens: 500,
        jsonMode: true,
    });

    // Parse and validate response
    let jsonText = response.trim();

    if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonText);
    const validated = LLMQualityResponseSchema.parse(parsed);

    return {
        quality: validated.quality,
        suggestions: validated.suggestions,
    };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Truncate long strings for readable error messages
 */
function truncate(str: string, maxLength: number = 40): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

// ============================================
// Quick Validation Helper
// ============================================

/**
 * Quick structural validation (no async operations)
 * Useful for immediate UI feedback before full validation
 */
export function quickValidateBreakdown(breakdown: GeneratedBreakdown): {
    valid: boolean;
    issueCount: number;
} {
    const issues = validateHardRules(breakdown);
    return {
        valid: issues.length === 0,
        issueCount: issues.length,
    };
}

// ============================================
// Goal Clarity Validation
// ============================================

interface GoalClarityResult {
    isClear: boolean;
    issues: string[];
    suggestion?: string;
}

/**
 * Check if a goal title is clear enough to proceed
 * Rejects vague goals like "do stuff" or "be productive"
 * 
 * @param goalTitle - The goal to check
 * @param aiProvider - Optional AIProvider for LLM-based checking
 * @returns GoalClarityResult with clarity assessment
 */
export async function validateGoalClarity(
    goalTitle: string,
    aiProvider?: AIProvider
): Promise<GoalClarityResult> {
    console.log('🔍 VALIDATOR: Checking goal clarity for:', goalTitle);

    const issues: string[] = [];

    // Rule 1: Too short (less than 3 words)
    const wordCount = goalTitle.trim().split(/\s+/).length;
    if (wordCount < 3) {
        issues.push('Goal is too short - please describe what you want to achieve');
    }

    // Rule 2: Known vague patterns
    const vaguePatterns = [
        /^do\s+(stuff|things?|something|it)$/i,
        /^be\s+(better|productive|successful|good)$/i,
        /^improve\s*(myself|things?)?$/i,
        /^get\s+(stuff|things?)\s+done$/i,
        /^work\s+on\s+(stuff|things?)$/i,
        /^figure\s+(it\s+)?out$/i,
        /^fix\s+(stuff|things?|everything)$/i,
        /^(just\s+)?start$/i,
        /^make\s+progress$/i,
    ];

    for (const pattern of vaguePatterns) {
        if (pattern.test(goalTitle.trim())) {
            issues.push('Goal is too vague - what specifically do you want to achieve?');
            break;
        }
    }

    // Rule 3: Contains only generic words
    const genericWords = ['stuff', 'things', 'something', 'everything', 'it'];
    const words = goalTitle.toLowerCase().split(/\s+/);
    const meaningfulWords = words.filter(w =>
        w.length > 2 && !genericWords.includes(w) && !['the', 'and', 'for', 'with', 'some'].includes(w)
    );

    if (meaningfulWords.length < 2) {
        issues.push('Goal needs more specific details about what you want to accomplish');
    }

    // If no issues from basic rules, try LLM check (optional)
    if (issues.length === 0 && aiProvider && 'generateCompletion' in aiProvider) {
        try {
            const result = await checkClarityWithLLM(goalTitle, aiProvider);
            if (!result.isClear) {
                issues.push(...result.issues);
            }
        } catch (error) {
            // LLM check is optional, don't fail
            console.warn('🔍 VALIDATOR: LLM clarity check skipped:', error);
        }
    }

    const isClear = issues.length === 0;
    console.log(`🔍 VALIDATOR: Goal clarity - Clear: ${isClear}, Issues: ${issues.length}`);

    return {
        isClear,
        issues,
        suggestion: issues.length > 0
            ? 'Try describing a specific outcome, like "Learn Python basics for web development" or "Organize my desk and create a filing system"'
            : undefined,
    };
}

/**
 * Use LLM to assess goal clarity
 */
async function checkClarityWithLLM(
    goalTitle: string,
    aiProvider: AIProvider
): Promise<GoalClarityResult> {
    if (!('generateCompletion' in aiProvider) || typeof (aiProvider as any).generateCompletion !== 'function') {
        return { isClear: true, issues: [] };
    }

    const prompt = `Assess if this goal is specific enough to create actionable tasks:

Goal: "${goalTitle}"

A goal is UNCLEAR if:
- It's too vague (e.g., "do stuff", "be productive")
- It has no measurable outcome
- It could mean almost anything
- A helper wouldn't know where to start

A goal is CLEAR if:
- It describes a specific outcome or skill
- It's focused on one main thing
- Someone could create concrete steps for it

Return ONLY valid JSON:
{
  "isClear": true or false,
  "reason": "brief explanation if unclear"
}`;

    const response = await (aiProvider as any).generateCompletion(prompt, {
        temperature: 0.2,
        maxTokens: 200,
        jsonMode: true,
    });

    let jsonText = response.trim();
    if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonText);

    return {
        isClear: parsed.isClear === true,
        issues: parsed.isClear ? [] : [parsed.reason || 'Goal is not specific enough'],
    };
}
