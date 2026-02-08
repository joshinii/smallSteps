// SmallSteps Ollama Adapter
// Implements AIProvider interface using server-side API proxy

import type { AIProvider, GoalPlan, TaskPlan, EffortEstimate, ClarificationQuestion, ClarificationResult } from './ai-provider';

export class OllamaAdapter implements AIProvider {
    readonly name = 'ollama';
    readonly displayName = 'Ollama (Local)';

    async validateApiKey(): Promise<boolean> {
        try {
            await this.callAPI('estimateGoalEffort', { goalText: 'test' });
            return true;
        } catch (error) {
            console.warn('Ollama validation failed:', error);
            return false;
        }
    }

    private async callAPI(action: string, payload: any): Promise<string> {
        const startTime = Date.now();
        console.log(`[OllamaAdapter] Starting API call: ${action} at ${new Date().toISOString()}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn(`[OllamaAdapter] Aborting request due to 5m timeout`);
            controller.abort();
        }, 300000); // 5 minutes

        try {
            const response = await fetch('/api/ai/ollama', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.json();
                console.error(`[OllamaAdapter] API Error (${Date.now() - startTime}ms):`, error);
                throw new Error(error.error || 'API call failed');
            }

            const data = await response.json();
            console.log(`[OllamaAdapter] Success (${Date.now() - startTime}ms):`, data.result?.substring(0, 50) + '...');
            return data.result;
        } catch (error) {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            console.error(`[OllamaAdapter] Request failed after ${duration}ms:`, error);

            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Request timed out after 5 minutes. Local LLM may be too slow.');
            }
            throw error;
        }
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
            console.error('Ollama clarifyGoal error:', error);
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
                    whyThisMatters: t.whyThisMatters
                }))
            };
        } catch (error) {
            console.error('Ollama decomposeGoal error:', error);
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
                    firstAction: u.firstAction,
                    successSignal: u.successSignal
                }))
            };
        } catch (error) {
            console.error('Ollama decomposeTask error:', error);
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
            console.error('Ollama estimateGoalEffort error:', error);
            return { estimatedTotalMinutes: 600, confidence: 'low' };
        }
    }

    async generateCompletion(prompt: string, options?: { temperature?: number, maxTokens?: number, jsonMode?: boolean }): Promise<string> {
        try {
            return await this.callAPI('generateCompletion', { prompt, ...options });
        } catch (error) {
            console.error('Ollama generateCompletion error:', error);
            throw error;
        }
    }
}
