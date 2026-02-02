// SmallSteps Gemini API Route
// Server-side proxy for Gemini API calls

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    getDecomposeGoalPrompt,
    getDecomposeTaskPrompt,
    getEstimateGoalEffortPrompt
} from '@/lib/ai/prompts';
import {
    processGoalDecomposition,
    processTaskDecomposition
} from '@/lib/ai/enforcement';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

export async function POST(request: NextRequest) {
    try {
        const { apiKey, action, payload } = await request.json();

        const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

        if (!effectiveApiKey) {
            return NextResponse.json({ error: 'API key required' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(effectiveApiKey);
        const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

        switch (action) {
            case 'decomposeGoal': {
                const { goalText, targetDate } = payload;
                const prompt = getDecomposeGoalPrompt(goalText, targetDate);

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();
                const processed = processGoalDecomposition(text);

                return NextResponse.json({ result: processed });
            }

            case 'decomposeTask': {
                const { taskTitle, taskTotalMinutes } = payload;
                const prompt = getDecomposeTaskPrompt(taskTitle, taskTotalMinutes);

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();
                const processed = processTaskDecomposition(text);

                return NextResponse.json({ result: processed });
            }

            case 'estimateGoalEffort': {
                const { goalText } = payload;
                const prompt = getEstimateGoalEffortPrompt(goalText);

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();

                return NextResponse.json({ result: text });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Gemini API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to communicate with Gemini' },
            { status: 500 }
        );
    }
}
