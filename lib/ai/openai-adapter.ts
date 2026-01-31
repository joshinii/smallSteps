// SmallSteps OpenAI Adapter
// Implements AIProvider interface using server-side API route

import type { AIProvider, GoalPlan, EffortEstimate, RecurringSuggestion } from './ai-provider';

export class OpenAIAdapter implements AIProvider {
    readonly name = 'openai';
    readonly displayName = 'GPT-4 (OpenAI)';
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async validateApiKey(): Promise<boolean> {
        try {
            await this.callAPI('estimateTaskEffort', { taskContent: 'test' });
            return true;
        } catch (error) {
            console.warn('OpenAI API key validation failed:', error);
            return false;
        }
    }

    private async callAPI(action: string, payload: any): Promise<string> {
        const response = await fetch('/api/ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: this.apiKey, action, payload }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API call failed');
        }

        const data = await response.json();
        return data.result;
    }

    async decomposeGoal(goalText: string, targetDate?: string, userFeedback?: string): Promise<GoalPlan> {
        try {
            const text = await this.callAPI('decomposeGoal', { goalText, targetDate, userFeedback });
            const jsonText = this.extractJson(text);
            const parsed = JSON.parse(jsonText);

            return {
                rationale: parsed.rationale || 'Breaking this into manageable steps.',
                tasks: (parsed.tasks || []).map((t: any) => ({
                    content: t.content || t.task,
                    category: t.category || 'action',
                    estimatedMinutes: t.estimatedMinutes || 25,
                    isRecurring: t.isRecurring || false,
                })),
                suggestedTargetDate: parsed.suggestedTargetDate,
            };
        } catch (error) {
            console.error('OpenAI decomposeGoal error:', error);
            throw error;
        }
    }

    async estimateTaskEffort(taskContent: string): Promise<EffortEstimate> {
        try {
            const text = await this.callAPI('estimateTaskEffort', { taskContent });
            const parsed = JSON.parse(this.extractJson(text));

            return {
                estimatedMinutes: parsed.estimatedMinutes || 25,
                confidence: parsed.confidence || 'medium',
                rationale: parsed.rationale,
            };
        } catch (error) {
            console.error('OpenAI estimateTaskEffort error:', error);
            return { estimatedMinutes: 25, confidence: 'low' };
        }
    }

    async identifyRecurringTasks(tasks: string[]): Promise<RecurringSuggestion[]> {
        try {
            const text = await this.callAPI('identifyRecurringTasks', { tasks });
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
            console.error('OpenAI identifyRecurringTasks error:', error);
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
