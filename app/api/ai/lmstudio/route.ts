// SmallSteps LM Studio API Route
// Server-side proxy for local LLMs

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

const DEFAULT_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';

export async function POST(request: NextRequest) {
    try {
        const { action, payload, modelName = 'local-model' } = await request.json();

        const client = new OpenAI({
            baseURL: DEFAULT_URL,
            apiKey: 'lm-studio', // Not needed for local but required by SDK
        });

        switch (action) {
            case 'clarifyGoal': {
                const { goalText, traceId } = payload;
                const prompt = getClarifyGoalPrompt(goalText);

                const response = await client.chat.completions.create({
                    model: modelName,
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

                const questions = (parsed.questions || []).slice(0, 3);
                console.log('[clarifyGoal] Generated', questions.length, 'questions for goal:', goalText.substring(0, 50), traceId ? `(trace: ${traceId})` : '');
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

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('LM Studio API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to communicate with LM Studio' },
            { status: 500 }
        );
    }
}
