// SmallSteps Claude API Route
// Server-side proxy for Claude API calls to avoid exposing API keys in browser

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
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

        const prompt = `You are a helper breaking a goal into ACTUAL WORK.

Goal: "${goalText}"${context}

**PROCESS:**
1. **Identify**: List major steps/habits.
2. **Refine**: If a step > 60 mins -> Break down OR Make Recurring.
3. **Finalize**: Output only actionable small tasks.

**STRICT RULES:**
- **MAX DURATION**: No non-recurring task > 60 mins.
- **NO FLUFF**: No "Track progress", "Celebrate".
- **QUANTITY**: "Read 5 books" -> "Read Book 1", "Read Book 2" (Recur).
- **TOTAL EFFORT**: Estimate *entire* volume (e.g. 50 hours).

**Output Format (JSON only):**
{
  "rationale": "Breaking into daily sessions...",
  "totalEstimatedMinutes": 3000, 
  "tasks": [
    { 
      "content": "Read Book 1", 
      "category": "reading", 
      "estimatedMinutes": 45, 
      "isRecurring": true 
    }
  ]
}

For Finite Goals: set isRecurring: false unless it's a daily habit.
For Lifelong: set isRecurring: true.

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
