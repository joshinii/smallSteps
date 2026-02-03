// SmallSteps OpenAI Adapter
// Implements AIProvider interface using server-side API route

import type { AIProvider, GoalPlan, TaskPlan, EffortEstimate, ClarificationQuestion, ClarificationResult } from './ai-provider';

export class OpenAIAdapter implements AIProvider {
    readonly name = 'openai';
    readonly displayName = 'GPT-4 (OpenAI)';
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async validateApiKey(): Promise<boolean> {
        try {
            await this.callAPI('estimateGoalEffort', { goalText: 'test' });
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

    async clarifyGoal(goalText: string, traceId?: string): Promise<ClarificationQuestion[]> {
        try {
            const resultString = await this.callAPI('clarifyGoal', { goalText, traceId });
            const parsed = JSON.parse(resultString);

            const questions = parsed.questions || [];
            return questions.slice(0, 3).map((q: any) => ({
                id: q.id || `q_${Math.random().toString(36).slice(2)}`,
                questionText: q.questionText,
                planningDimension: q.planningDimension || 'scope',
                options: (q.options || []).map((o: any) => ({
                    value: o.value,
                    label: o.label,
                    planningHint: o.planningHint
                }))
            }));
        } catch (error) {
            console.error('OpenAI clarifyGoal error:', error);
            throw error;
        }
    }

    async decomposeGoal(goalText: string, targetDate?: string, userFeedback?: string, isLifelong?: boolean, traceId?: string, clarificationContext?: ClarificationResult): Promise<GoalPlan> {
        try {
            const clarificationPayload = clarificationContext?.planningContext || undefined;
            const resultString = await this.callAPI('decomposeGoal', { goalText, targetDate, clarificationContext: clarificationPayload });
            const parsed = JSON.parse(resultString);

            return {
                rationale: parsed.rationale,
                tasks: (parsed.tasks || []).map((t: any) => ({
                    title: t.title || t.content,
                    estimatedTotalMinutes: t.estimatedTotalMinutes || t.estimatedMinutes || 120,
                    whyThisMatters: t.whyThisMatters // Pass through quality field
                }))
            };
        } catch (error) {
            console.error('OpenAI decomposeGoal error:', error);
            throw error;
        }
    }

    async decomposeTask(taskTitle: string, taskTotalMinutes: number, otherTasks?: string[], priorCapabilities?: string[]): Promise<TaskPlan> {
        try {
            const resultString = await this.callAPI('decomposeTask', { taskTitle, taskTotalMinutes, otherTasks, priorCapabilities });
            const parsed = JSON.parse(resultString);

            return {
                workUnits: (parsed.workUnits || []).map((u: any) => ({
                    title: u.title,
                    kind: u.kind || 'practice',
                    estimatedTotalMinutes: u.estimatedTotalMinutes || 60,
                    capabilityId: u.capabilityId,
                    firstAction: u.firstAction,   // Pass through quality field
                    successSignal: u.successSignal // Pass through quality field
                }))
            };
        } catch (error) {
            console.error('OpenAI decomposeTask error:', error);
            throw error;
        }
    }

    async estimateGoalEffort(goalText: string): Promise<EffortEstimate> {
        try {
            const resultString = await this.callAPI('estimateGoalEffort', { goalText });
            const jsonText = resultString.includes('```json')
                ? resultString.split('```json')[1].split('```')[0].trim()
                : resultString.includes('```')
                    ? resultString.split('```')[1].split('```')[0].trim()
                    : resultString;

            const parsed = JSON.parse(jsonText);

            return {
                estimatedTotalMinutes: parsed.estimatedTotalMinutes || 600,
                confidence: parsed.confidence || 'low',
                rationale: parsed.rationale,
            };
        } catch (error) {
            console.error('OpenAI estimateGoalEffort error:', error);
            return { estimatedTotalMinutes: 600, confidence: 'low' };
        }
    }
}
