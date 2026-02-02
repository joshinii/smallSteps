// SmallSteps OpenAI API Route
// Server-side proxy for OpenAI API calls to avoid exposing API keys in browser

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
            case 'decomposeGoal': {
                const { goalText, targetDate } = payload;
                const prompt = getDecomposeGoalPrompt(goalText, targetDate);

                const response = await client.chat.completions.create({
                    model: DEFAULT_MODEL,
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
