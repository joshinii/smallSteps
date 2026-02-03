// SmallSteps Gemini API Route
// Server-side proxy for Gemini API calls

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
            case 'clarifyGoal': {
                const { goalText, traceId } = payload;
                const prompt = getClarifyGoalPrompt(goalText);

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();

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
