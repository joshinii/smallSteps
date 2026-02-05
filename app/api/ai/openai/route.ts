// SmallSteps OpenAI API Route
// Server-side proxy for OpenAI API calls to avoid exposing API keys in browser

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
    getClarifyGoalPrompt,
    getDecomposeGoalPrompt,
    getDecomposeTaskPrompt,
    getEstimateGoalEffortPrompt
} from '@/lib/ai/prompts';
import {
    processGoalDecomposition,
    processTaskDecomposition
} from '@/lib/ai/enforcement';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'; // Use efficient model

export async function POST(request: NextRequest) {
    try {
        const { apiKey, action, payload } = await request.json();

        // Use provided API key or fall back to environment variable for local development
        const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY;

        if (!effectiveApiKey) {
            return NextResponse.json({ error: 'API key required' }, { status: 400 });
        }

        const client = new OpenAI({ apiKey: effectiveApiKey });

        switch (action) {
            case 'clarifyGoal': {
                const { goalText, traceId } = payload;
                const prompt = getClarifyGoalPrompt(goalText);

                const response = await client.chat.completions.create({
                    model: DEFAULT_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.4,
                    max_tokens: 4096,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';

                let parsed;
                try {
                    const jsonText = text.includes('```json')
                        ? text.split('```json')[1].split('```')[0].trim()
                        : text.includes('```')
                            ? text.split('```')[1].split('```')[0].trim()
                            : text;
                    parsed = JSON.parse(jsonText);
                } catch {
                    parsed = { questions: [] };
                }

                let questions = (parsed.questions || []).slice(0, 3);

                // Validate that each question has valid options array with labels
                const hasInvalidQuestions = questions.some((q: any) =>
                    !q.options || !Array.isArray(q.options) || q.options.length === 0 ||
                    q.options.some((opt: any) => !opt.label || typeof opt.label !== 'string' || opt.label.trim() === '')
                );

                if (hasInvalidQuestions || questions.length === 0) {
                    console.warn('[clarifyGoal] AI returned invalid questions (missing labels), using fallback defaults');
                    const { manualProvider } = await import('@/lib/ai/ai-provider');
                    questions = await manualProvider.clarifyGoal(goalText);
                }

                console.log('[clarifyGoal] Generated', questions.length, 'questions with',
                    questions.map((q: any) => q.options?.length || 0).join('/'), 'options for goal:',
                    goalText.substring(0, 50), traceId ? `(trace: ${traceId})` : '');
                return NextResponse.json({ result: JSON.stringify({ questions }) });
            }

            case 'decomposeGoal': {
                const { goalText, targetDate, clarificationContext } = payload;
                const prompt = getDecomposeGoalPrompt(goalText, targetDate, clarificationContext);

                const response = await client.chat.completions.create({
                    model: DEFAULT_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 4096,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                const result = processGoalDecomposition(text);

                // Log generated tasks for debugging
                try {
                    const parsed = JSON.parse(result);
                    const taskTitles = (parsed.tasks || []).map((t: any) => t.title || t.content);
                    console.log('[decomposeGoal] Goal:', goalText.substring(0, 50));
                    console.log('[decomposeGoal] Generated tasks:', taskTitles);

                    // Basic relevance check: warn if tasks seem off-topic
                    const goalKeywords = goalText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
                    const possiblyIrrelevant = taskTitles.filter((title: string) => {
                        const titleLower = title.toLowerCase();
                        return !goalKeywords.some((keyword: string) => titleLower.includes(keyword));
                    });

                    if (possiblyIrrelevant.length > 0) {
                        console.warn('[decomposeGoal] ⚠️  Possibly irrelevant tasks detected:', possiblyIrrelevant);
                    }
                } catch (e) {
                    // Ignore parsing errors for logging
                }

                return NextResponse.json({ result });
            }

            case 'decomposeTask': {
                const { taskTitle, taskTotalMinutes } = payload;
                const prompt = getDecomposeTaskPrompt(taskTitle, taskTotalMinutes);

                const response = await client.chat.completions.create({
                    model: DEFAULT_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 4096,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                const result = processTaskDecomposition(text);
                return NextResponse.json({ result });
            }

            case 'estimateGoalEffort': {
                const { goalText } = payload;
                const prompt = getEstimateGoalEffortPrompt(goalText);

                const response = await client.chat.completions.create({
                    model: DEFAULT_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 256,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                return NextResponse.json({ result: text });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('OpenAI API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to communicate with OpenAI' },
            { status: 500 }
        );
    }
}
