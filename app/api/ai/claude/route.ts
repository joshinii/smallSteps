// SmallSteps Claude API Route
// Server-side proxy for Claude API calls to avoid exposing API keys in browser

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
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

const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
const DEFAULT_MAX_TOKENS = 4096;

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
      case 'clarifyGoal': {
        const { goalText, traceId } = payload;
        const prompt = getClarifyGoalPrompt(goalText);

        const message = await client.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0.4,  // Slightly higher for variety in questions
          messages: [{ role: 'user', content: prompt }],
        });

        const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

        // Parse and validate - ensure exactly 3 questions
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

        // Ensure exactly 3 questions
        const questions = (parsed.questions || []).slice(0, 3);
        if (questions.length < 3) {
          console.warn('[clarifyGoal] AI returned fewer than 3 questions, using defaults');
        }

        console.log('[clarifyGoal] Generated', questions.length, 'questions for goal:', goalText.substring(0, 50), traceId ? `(trace: ${traceId})` : '');
        return NextResponse.json({ result: JSON.stringify({ questions }) });
      }

      case 'decomposeGoal': {
        const { goalText, targetDate, clarificationContext } = payload;
        const prompt = getDecomposeGoalPrompt(goalText, targetDate, clarificationContext);

        const message = await client.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
        const result = processGoalDecomposition(text);
        return NextResponse.json({ result });
      }

      case 'decomposeTask': {
        const { taskTitle, taskTotalMinutes, otherTasks, priorCapabilities } = payload;
        const prompt = getDecomposeTaskPrompt(taskTitle, taskTotalMinutes, otherTasks, priorCapabilities);

        const message = await client.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
        const result = processTaskDecomposition(text, taskTotalMinutes);
        return NextResponse.json({ result });
      }

      case 'estimateGoalEffort': {
        const { goalText } = payload;
        const prompt = getEstimateGoalEffortPrompt(goalText);

        const message = await client.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: 256,
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
    console.error('Claude API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to communicate with Claude' },
      { status: 500 }
    );
  }
}
