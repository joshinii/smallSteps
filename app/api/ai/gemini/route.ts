// SmallSteps Gemini API Route
// Server-side proxy for Gemini API calls to avoid exposing API keys in browser

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

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
                const { goalText, targetDate } = payload;
                const targetDateContext = targetDate
                    ? `\nTarget completion: ${new Date(targetDate).toLocaleDateString()}`
                    : '';

                const prompt = `You are a calm, thoughtful planner helping someone achieve their goal gently.

Goal: "${goalText}"${targetDateContext}

Break this down into small, manageable tasks. For each task:
1. Keep it specific but achievable
2. Estimate time honestly (most tasks should be 10-30 minutes)  
3. Mark daily habits as recurring
4. Include a brief rationale for your approach

**Guidelines:**
- Think holistically about what's needed
- Prefer small steps over overwhelming chunks
- Create 4-8 tasks, not more
- Be realistic about time estimates

**Output Format (JSON only):**
{
  "rationale": "Brief, encouraging explanation",
  "tasks": [
    { "content": "Specific action", "category": "category", "estimatedMinutes": 15, "isRecurring": false },
    { "content": "Daily habit", "category": "health", "estimatedMinutes": 10, "isRecurring": true }
  ],
  "suggestedTargetDate": "YYYY-MM-DD"
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
