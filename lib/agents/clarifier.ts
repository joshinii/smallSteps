import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../claude';
import { z } from 'zod';
import type { AIProvider } from '@/lib/ai/ai-provider';
import type { Question } from './types';

// ============================================
// Zod Schemas for Validation
// ============================================

const QuestionSchema = z.object({
    id: z.string(),
    text: z.string(),
    type: z.enum(['text', 'select', 'number']),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
});

const QuestionsArraySchema = z.array(QuestionSchema).min(1).max(10);

// ============================================
// Default Fallback Questions
// ============================================

const DEFAULT_QUESTIONS: Question[] = [
    {
        id: 'q_experience',
        text: "What's your current experience with this?",
        type: 'select',
        options: ['Complete beginner', 'Some experience', 'Intermediate', 'Advanced'],
        required: true,
    },
    {
        id: 'q_time',
        text: 'How many hours per week can you dedicate?',
        type: 'number',
        placeholder: 'e.g., 5-10 hours',
        required: true,
    },
    {
        id: 'q_anything_else',
        text: 'Is there anything else we should know?',
        type: 'text',
        placeholder: 'Any preferences, constraints, or context...',
        required: false,
    },
];

// ============================================
// Legacy Clarifier (Backward Compatibility)
// ============================================

/**
 * Clarifier Agent (Legacy)
 * 
 * Purpose: Transforms vague ideas into clear, actionable intents
 * Output: 1-2 sentence clarified version
 * Principles: Casual tone, removes overwhelm, focuses on user's true intent
 * 
 * @deprecated Consider using generateContextQuestions for richer context
 */
export async function clarifyIdea(rawIdea: string): Promise<string> {
    console.log('🤖 CLARIFIER: Starting for idea:', rawIdea);

    const prompt = `You are a supportive assistant helping someone clarify a vague idea into a clear, actionable goal.

Original idea: "${rawIdea}"

Transform this into a clear, casual 1-2 sentence goal that:
- States what they want to achieve
- Is specific and actionable
- Uses friendly, non-technical language
- Removes overwhelm and focuses on the core intent

Examples:
- "clean my room" → "Sort through your room and organize items so it feels tidy and calm"
- "get fit" → "Build a sustainable exercise routine to feel stronger and healthier"
- "learn coding" → "Learn the basics of programming through daily practice and small projects"

Return ONLY the clarified goal, nothing else.`;

    try {
        console.log('🤖 CLARIFIER: Calling Claude API...');

        const message = await anthropic.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: DEFAULT_TEMPERATURE,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const clarified = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
        console.log('✅ CLARIFIER: Got response:', clarified);

        return clarified || rawIdea;
    } catch (error) {
        console.error('❌ CLARIFIER ERROR:', error);
        console.error('Error type:', error instanceof Error ? error.name : typeof error);
        console.error('Error message:', error instanceof Error ? error.message : error);

        // Fallback: return original idea
        console.warn('⚠️ CLARIFIER: Using original idea due to error');
        return rawIdea;
    }
}

// ============================================
// Context Questions Generator (New)
// ============================================

/**
 * Generate contextual clarification questions for a goal
 * 
 * Uses AIProvider to generate 1-10 adaptive questions based on goal domain.
 * Questions are designed to be shown one at a time to avoid overwhelming the user.
 * 
 * @param goalTitle - The user's goal text
 * @param aiProvider - AIProvider instance (from AIContext.getAI())
 * @returns Promise<Question[]> - Array of 1-10 questions
 */
export async function generateContextQuestions(
    goalTitle: string,
    aiProvider: AIProvider
): Promise<Question[]> {
    console.log('🤖 CLARIFIER: Generating context questions for:', goalTitle);

    const prompt = buildContextQuestionsPrompt(goalTitle);

    // Try up to 2 times (initial + 1 retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            console.log(`🤖 CLARIFIER: Attempt ${attempt} - calling AI provider...`);

            let response: string;

            // Use generateCompletion if available, otherwise fall back to clarifyGoal
            if ('generateCompletion' in aiProvider && typeof aiProvider.generateCompletion === 'function') {
                response = await aiProvider.generateCompletion(prompt, {
                    temperature: 0.7,
                    maxTokens: 1500,
                    jsonMode: true,
                });
            } else {
                // Fallback: Use existing clarifyGoal and map to questions
                console.log('🤖 CLARIFIER: Provider lacks generateCompletion, using fallback');
                return DEFAULT_QUESTIONS;
            }

            // Parse and validate response
            const questions = parseAndValidateQuestions(response);
            console.log(`✅ CLARIFIER: Generated ${questions.length} questions`);
            return questions;

        } catch (error) {
            console.error(`❌ CLARIFIER: Attempt ${attempt} failed:`, error);

            if (attempt === 2) {
                console.warn('⚠️ CLARIFIER: All attempts failed, using default questions');
                return DEFAULT_QUESTIONS;
            }
        }
    }

    // Should never reach here, but TypeScript needs it
    return DEFAULT_QUESTIONS;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build the prompt for generating context questions
 */
function buildContextQuestionsPrompt(goalTitle: string): string {
    return `Goal: "${goalTitle}"

Generate 1-10 contextual questions to understand this goal deeply.
Questions will be shown ONE AT A TIME to avoid overwhelming the user.

Guidelines:
- Start with most important questions (experience level, timeline, scope)
- Each question should feel conversational and supportive, not interrogative
- Use 'select' type for common scenarios (experience levels, timeframes)
- Use 'number' type for quantities (hours per week, budget)
- Use 'text' type for open-ended input
- Last question should always be: "Is there anything else we should know?"
- Adapt question count to goal complexity (simple goals: 3-4, complex: 6-10)

Return ONLY valid JSON array matching this schema:
[
  {
    "id": "q1",
    "text": "What's your current experience with this?",
    "type": "select",
    "options": ["Complete beginner", "Some experience", "Intermediate", "Advanced"],
    "required": true
  },
  {
    "id": "q2",
    "text": "How many hours per week can you dedicate?",
    "type": "number",
    "placeholder": "e.g., 5-10 hours",
    "required": true
  },
  {
    "id": "q3",
    "text": "Is there anything else we should know?",
    "type": "text",
    "placeholder": "Any preferences, constraints, or context...",
    "required": false
  }
]

Return ONLY the JSON array, no markdown, no explanation.`;
}

/**
 * Parse AI response and validate against Question schema
 */
function parseAndValidateQuestions(response: string): Question[] {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = response.trim();

    if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }

    // Parse JSON
    const parsed = JSON.parse(jsonText);

    // Validate with Zod
    const validated = QuestionsArraySchema.parse(parsed);

    // Ensure last question is "anything else" type
    const lastQuestion = validated[validated.length - 1];
    if (!lastQuestion.text.toLowerCase().includes('anything else')) {
        validated.push({
            id: `q${validated.length + 1}`,
            text: 'Is there anything else we should know?',
            type: 'text',
            placeholder: 'Any preferences, constraints, or context...',
            required: false,
        });
    }

    return validated as Question[];
}
