// SmallSteps Gemini API Route
// Server-side proxy for Gemini API calls to avoid exposing API keys in browser

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

export async function POST(request: NextRequest) {
    try {
        const { apiKey, action, payload } = await request.json();

        // Use provided API key or fall back to environment variable for local development
        const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

        if (!effectiveApiKey) {
            return NextResponse.json({ error: 'API key required' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(effectiveApiKey);
        const model = genAI.getGenerativeModel({
            model: DEFAULT_MODEL,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
            },
        });

        switch (action) {
            case 'decomposeGoal': {
                const { goalText } = payload;

                const prompt = `You are an expert planner breaking a goal into PHASED EFFORT RESERVOIRS.

Goal: "${goalText}"

**PHILOSOPHY:**
We do NOT use daily habits or small tasks.
We use "Reservoirs" - huge buckets of effort (e.g. 50 hours) that the user drains over months.

**PROCESS:**
1. **Analyze Scale**: If this is a big goal (e.g. "Learn Language", "Get Fit"), it needs HUGE reservoirs.
2. **Create Phases**: Break it into 3-5 distinct phases (e.g. "Phase 1: Foundations", "Phase 2: Practice").
3. **Estimate Volume**: Assign realistic time blocks based on goal difficulty (e.g. 500 mins for simple, 5000+ mins for mastery).

**STRICT RULES:**
- **NO FREQUENCY**: Forbidden words: "daily", "weekly", "habit", "every day".
- **NO SMALL TASKS**: Minimum reservoir size is 300 minutes.
- **NO DATES**: Do not suggest target dates.
- **PHASED NAMES**: Use names like "Phase 1: [Topic]", "Deep Dive: [Topic]".

**Output Format (JSON only):**
{
  "rationale": "Breaking this into 4 major effort phases...",
  "suggestedTargetDate": null, 
  "tasks": [
    { "content": "Phase 1: Core Concepts", "estimatedMinutes": 4500, "isRecurring": false, "category": "learning" },
    { "content": "Phase 2: Advanced Application", "estimatedMinutes": 6000, "isRecurring": false, "category": "practice" }
  ]
}

Return ONLY valid JSON.`;

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();
                return NextResponse.json({ result: text });
            }

            case 'estimateTaskEffort': {
                const { taskContent } = payload;
                const prompt = `Estimate how long this task realistically takes for an average person:

Task: "${taskContent}"

Respond with JSON only:
{
  "estimatedMinutes": <number 5-120>,
  "confidence": "low" | "medium" | "high",
  "rationale": "brief explanation"
}`;

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();
                return NextResponse.json({ result: text });
            }

            case 'identifyRecurringTasks': {
                const { tasks } = payload;
                const prompt = `For each task below, determine if it should be a recurring daily habit or a one-time action.

Tasks:
${tasks.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}

Respond with JSON only:
{
  "suggestions": [
    { "index": 0, "shouldBeRecurring": true, "frequency": "daily", "reason": "..." },
    { "index": 1, "shouldBeRecurring": false }
  ]
}`;

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();
                return NextResponse.json({ result: text });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('Gemini API error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
