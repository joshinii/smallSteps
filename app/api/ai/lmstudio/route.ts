// SmallSteps LM Studio API Route
// Server-side proxy for local LLMs

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
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
            case 'decomposeGoal': {
                const { goalText, targetDate } = payload;
                const prompt = getDecomposeGoalPrompt(goalText, targetDate);

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
