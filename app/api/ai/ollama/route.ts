// SmallSteps Ollama API Route
// Server-side proxy for local Ollama LLMs

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

// Default Ollama URL (can be overridden by env var)
const DEFAULT_URL = process.env.OLLAMA_URL || 'http://localhost:11434/v1';

// Configure Next.js route to allow longer execution for slow local LLMs
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    try {
        const { action, payload, modelName = 'qwen2.5-coder:7b' } = await request.json();
        console.log(`[Ollama API] Routing action: ${action} at ${new Date().toISOString()}`);

        const client = new OpenAI({
            baseURL: DEFAULT_URL,
            apiKey: 'ollama', // Not needed for Ollama but required by SDK
            timeout: 300000, // 5 minutes timeout for slow local models
            maxRetries: 0, // Don't retry, just wait
        });

        console.log(`[Ollama API] Action: ${action}, Goal:`, payload.goalText?.substring(0, 50));

        switch (action) {
            case 'clarifyGoal': {
                const { goalText, traceId } = payload;
                const prompt = getClarifyGoalPrompt(goalText);

                console.log('[Ollama API] Requesting clarification questions...');
                const clientStart = Date.now();
                const response = await client.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.4,
                    max_tokens: 1024,
                });
                console.log(`[Ollama API] Client returned in ${Date.now() - clientStart}ms`);

                const text = response.choices[0]?.message?.content?.trim() || '';

                let parsed;
                try {
                    const jsonText = text.includes('```json')
                        ? text.split('```json')[1].split('```')[0].trim()
                        : text.includes('```')
                            ? text.split('```')[1].split('```')[0].trim()
                            : text;
                    parsed = JSON.parse(jsonText);
                } catch (parseError) {
                    console.warn('[clarifyGoal] ⚠️ Ollama returned invalid/incomplete JSON:', text.substring(0, 200));
                    parsed = { questions: [] };
                }

                let questions = (parsed.questions || []).slice(0, 3);

                // Basic validation
                const hasInvalidQuestions = questions.some((q: any) =>
                    !q.options || !Array.isArray(q.options) || q.options.length === 0
                );

                if (hasInvalidQuestions || questions.length === 0) {
                    console.warn('[clarifyGoal] ⚠️ Invalid questions, falling back to manual provider');
                    const { manualProvider } = await import('@/lib/ai/ai-provider');
                    questions = await manualProvider.clarifyGoal(goalText);
                }

                return NextResponse.json({ result: JSON.stringify({ questions }) });
            }

            case 'decomposeGoal': {
                const { goalText, targetDate, clarificationContext } = payload;
                const prompt = getDecomposeGoalPrompt(goalText, targetDate, clarificationContext);

                const response = await client.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 4096,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                const result = processGoalDecomposition(text);
                return NextResponse.json({ result });
            }

            case 'decomposeTask': {
                const { taskTitle, taskTotalMinutes } = payload;
                const prompt = getDecomposeTaskPrompt(taskTitle, taskTotalMinutes);

                const response = await client.chat.completions.create({
                    model: modelName,
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
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 256,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                return NextResponse.json({ result: text });
            }

            case 'generateCompletion': {
                const { prompt, temperature, maxTokens } = payload;

                const response = await client.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: temperature || 0.7,
                    max_tokens: maxTokens || 1024,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                return NextResponse.json({ result: text });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Ollama API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to communicate with Ollama' },
            { status: 500 }
        );
    }
}
