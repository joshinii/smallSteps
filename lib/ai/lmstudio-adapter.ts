// SmallSteps LM Studio Adapter
// Implements AIProvider interface using server-side API proxy

import type { AIProvider, GoalPlan, TaskPlan, EffortEstimate } from './ai-provider';

export class LMStudioAdapter implements AIProvider {
    readonly name = 'lmstudio';
    readonly displayName = 'LM Studio (Local)';

    async validateApiKey(): Promise<boolean> {
        try {
            await this.callAPI('estimateGoalEffort', { goalText: 'test' });
            return true;
        } catch (error) {
            console.warn('LM Studio validation failed:', error);
            return false;
        }
    }

    private async callAPI(action: string, payload: any): Promise<string> {
        const response = await fetch('/api/ai/lmstudio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API call failed');
        }

        const data = await response.json();
        return data.result;
    }

    async decomposeGoal(goalText: string, targetDate?: string): Promise<GoalPlan> {
        try {
            const resultString = await this.callAPI('decomposeGoal', { goalText, targetDate });
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
            console.error('LM Studio decomposeGoal error:', error);
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
            console.error('LM Studio decomposeTask error:', error);
            throw error;
        }
    }

    async estimateGoalEffort(goalText: string): Promise<EffortEstimate> {
        try {
            const resultString = await this.callAPI('estimateGoalEffort', { goalText });
            const jsonText = resultString.includes('```json')
                ? resultString.split('```json')[1].split('```')[0].trim()
                : resultString;

            const parsed = JSON.parse(jsonText);

            return {
                estimatedTotalMinutes: parsed.estimatedTotalMinutes || 600,
                confidence: parsed.confidence || 'low',
                rationale: parsed.rationale,
            };
        } catch (error) {
            console.error('LM Studio estimateGoalEffort error:', error);
            return { estimatedTotalMinutes: 600, confidence: 'low' };
        }
    }
}
