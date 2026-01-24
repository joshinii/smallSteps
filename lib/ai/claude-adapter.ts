// SmallSteps Claude Adapter
// Implements AIProvider interface using Anthropic's Claude API

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, GoalPlan, EffortEstimate, RecurringSuggestion } from './ai-provider';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;

export class ClaudeAdapter implements AIProvider {
    readonly name = 'claude';
    readonly displayName = 'Claude (Anthropic)';
    private client: Anthropic;

    constructor(apiKey: string) {
        this.client = new Anthropic({ apiKey });
    }

    async decomposeGoal(goalText: string, targetDate?: string): Promise<GoalPlan> {
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
  "suggestedTargetDate": "YYYY-MM-DD" // Optional, only if user didn't provide one
}

Return ONLY valid JSON.`;

        try {
            const message = await this.client.messages.create({
                model: DEFAULT_MODEL,
                max_tokens: DEFAULT_MAX_TOKENS,
                temperature: DEFAULT_TEMPERATURE,
                messages: [{ role: 'user', content: prompt }],
            });

            const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
            const jsonText = this.extractJson(text);
            const parsed = JSON.parse(jsonText);

            return {
                rationale: parsed.rationale || 'Breaking this into manageable steps.',
                tasks: (parsed.tasks || []).map((t: any) => ({
                    content: t.content || t.task,
                    category: t.category || 'action',
                    estimatedMinutes: t.estimatedMinutes || t.timeEstimate || 25,
                    isRecurring: t.isRecurring || false,
                })),
                suggestedTargetDate: parsed.suggestedTargetDate,
            };
        } catch (error) {
            console.error('Claude decomposeGoal error:', error);
            throw error;
        }
    }

    async estimateTaskEffort(taskContent: string): Promise<EffortEstimate> {
        const prompt = `Estimate how long this task realistically takes for an average person:

Task: "${taskContent}"

Respond with JSON only:
{
  "estimatedMinutes": <number 5-120>,
  "confidence": "low" | "medium" | "high",
  "rationale": "brief explanation"
}`;

        try {
            const message = await this.client.messages.create({
                model: DEFAULT_MODEL,
                max_tokens: 256,
                temperature: 0.3,
                messages: [{ role: 'user', content: prompt }],
            });

            const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
            const parsed = JSON.parse(this.extractJson(text));

            return {
                estimatedMinutes: parsed.estimatedMinutes || 25,
                confidence: parsed.confidence || 'medium',
                rationale: parsed.rationale,
            };
        } catch (error) {
            console.error('Claude estimateTaskEffort error:', error);
            return { estimatedMinutes: 25, confidence: 'low' };
        }
    }

    async identifyRecurringTasks(tasks: string[]): Promise<RecurringSuggestion[]> {
        const prompt = `For each task below, determine if it should be a recurring daily habit or a one-time action.

Tasks:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Respond with JSON only:
{
  "suggestions": [
    { "index": 0, "shouldBeRecurring": true, "frequency": "daily", "reason": "..." },
    { "index": 1, "shouldBeRecurring": false }
  ]
}`;

        try {
            const message = await this.client.messages.create({
                model: DEFAULT_MODEL,
                max_tokens: 512,
                temperature: 0.3,
                messages: [{ role: 'user', content: prompt }],
            });

            const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
            const parsed = JSON.parse(this.extractJson(text));

            return tasks.map((taskContent, i) => {
                const suggestion = parsed.suggestions?.find((s: any) => s.index === i);
                return {
                    taskContent,
                    shouldBeRecurring: suggestion?.shouldBeRecurring || false,
                    frequency: suggestion?.frequency,
                    reason: suggestion?.reason,
                };
            });
        } catch (error) {
            console.error('Claude identifyRecurringTasks error:', error);
            return tasks.map((taskContent) => ({ taskContent, shouldBeRecurring: false }));
        }
    }

    private extractJson(text: string): string {
        if (text.includes('```json')) {
            return text.split('```json')[1].split('```')[0].trim();
        } else if (text.includes('```')) {
            return text.split('```')[1].split('```')[0].trim();
        }
        return text;
    }
}
