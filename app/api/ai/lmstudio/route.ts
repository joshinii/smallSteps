// SmallSteps LM Studio API Route
// Server-side proxy for LM Studio (local OpenAI-compatible server)

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// LM Studio runs on localhost:1234 by default
const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';

export async function POST(request: NextRequest) {
    try {
        const { action, payload } = await request.json();

        // Connect to local LM Studio server (no API key needed)
        const client = new OpenAI({
            baseURL: LM_STUDIO_BASE_URL,
            apiKey: 'lm-studio', // LM Studio ignores this but OpenAI SDK requires it
        });

        // Get the loaded model name from LM Studio
        let modelName = 'local-model';
        try {
            const models = await client.models.list();
            if (models.data && models.data.length > 0) {
                modelName = models.data[0].id;
            }
        } catch {
            // Use default if model list fails
        }

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
  ]
}

Return ONLY valid JSON.`;

                const response = await client.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 2048,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
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

                const response = await client.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 256,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
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

                const response = await client.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 512,
                });

                const text = response.choices[0]?.message?.content?.trim() || '';
                return NextResponse.json({ result: text });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('LM Studio API error:', error);

        // Provide helpful error messages
        if (error.code === 'ECONNREFUSED') {
            return NextResponse.json(
                { error: 'Cannot connect to LM Studio. Make sure the server is running on localhost:1234.' },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'LM Studio error' },
            { status: 500 }
        );
    }
}
