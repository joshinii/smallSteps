// SmallSteps Claude API Route
// Server-side proxy for Claude API calls to avoid exposing API keys in browser

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;

export async function POST(request: NextRequest) {
    try {
        const { apiKey, action, payload } = await request.json();

        // Use provided API key or fall back to environment variable for local development
        const effectiveApiKey = apiKey || process.env.CLAUDE_API_KEY;

        if (!effectiveApiKey) {
            return NextResponse.json({ error: 'API key required' }, { status: 400 });
        }

        const client = new Anthropic({ apiKey: effectiveApiKey });

        switch (action) {
            case 'decomposeGoal': {
                const { goalText, targetDate, isLifelong } = payload;

                let context = '';
                if (isLifelong) {
                    context = '\nThis is a "Lifelong Goal" - meant to be a permanent, sustainable lifestyle change.';
                } else if (targetDate) {
                    context = `\nTarget completion: ${new Date(targetDate).toLocaleDateString()}`;
                }

                const prompt = `You are a calm, thoughtful planner helping someone achieve their goal gently.

Goal: "${goalText}"${context}

Break this into small, manageable tasks. For each task:
1. Keep it specific but achievable
2. Estimate time honestly (10-30 mins ideal)
3. Suggest a frequency for recurring items (daily, weekdays, weekends, weekly)
4. Mark purely one-time setup tasks as non-recurring
5. Include a brief rationale

**Guidelines:**
- For lifelong goals, focus on sustainable habits
- For finite goals, focus on progress steps
- Keep it to 4-8 tasks maximum
- Be realistic about time limits

**Output Format (JSON only):**
{
  "rationale": "Brief, encouraging explanation",
  "tasks": [
    { 
      "content": "Specific action", 
      "category": "category", 
      "estimatedMinutes": 15, 
      "isRecurring": false 
    },
    { 
      "content": "Daily habit", 
      "category": "health", 
      "estimatedMinutes": 10, 
      "isRecurring": true,
      "frequency": "daily" // or "weekdays", "weekends", "weekly"
    }
  ],
  "suggestedTargetDate": "YYYY-MM-DD" // Required for finite goals if user didn't provide one. Omit for lifelong goals.
}

Return ONLY valid JSON.`;

                const message = await client.messages.create({
                    model: DEFAULT_MODEL,
                    max_tokens: DEFAULT_MAX_TOKENS,
                    temperature: DEFAULT_TEMPERATURE,
                    messages: [{ role: 'user', content: prompt }],
                });

                const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
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

                const message = await client.messages.create({
                    model: DEFAULT_MODEL,
                    max_tokens: 256,
                    temperature: 0.3,
                    messages: [{ role: 'user', content: prompt }],
                });

                const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
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

                const message = await client.messages.create({
                    model: DEFAULT_MODEL,
                    max_tokens: 512,
                    temperature: 0.3,
                    messages: [{ role: 'user', content: prompt }],
                });

                const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
                return NextResponse.json({ result: text });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('Claude API error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
