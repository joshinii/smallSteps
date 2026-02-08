'use client';

import { useState } from 'react';
import { goalsDB, tasksDB, workUnitsDB } from '@/lib/db';
import { getProvider, type ProviderName } from '@/lib/ai';
import type { ClarificationQuestion } from '@/lib/ai/ai-provider';
import { classifyDomainLocal, getDomainTemplate } from '@/lib/engine/templateEngine';
import { suggestTargetDate } from '@/lib/planning-engine';
import { getFeatures } from '@/lib/config/features';
import { startGoalCreation, completeGoalCreation, VagueGoalError } from '@/lib/agents/orchestrator';
import { createGoalFromBreakdown } from '@/lib/agents/integration';
import type { Question, GeneratedBreakdown, OrchestrationState } from '@/lib/agents/types';
import GoalClarification from './GoalClarification';
import ContextGathering from './ContextGathering';

interface GoalCreatorProps {
    onComplete: () => void;
    onCancel: () => void;
    onDelete?: () => void;
    existingGoal?: {
        id: string;
        title: string;
        targetDate?: string;
        estimatedTargetDate?: string;
        lifelong?: boolean;
        tasks: Array<{
            id: string;
            title: string;
            estimatedTotalMinutes: number;
        }>;
    };
}

type FlowStep = 'input' | 'clarifying' | 'preview' | 'creating';

export default function GoalCreator({
    onComplete,
    onCancel,
    onDelete,
    existingGoal
}: GoalCreatorProps) {
    const [step, setStep] = useState<FlowStep>('input');
    const [goalTitle, setGoalTitle] = useState(existingGoal?.title || '');
    const [isLifelong, setIsLifelong] = useState(existingGoal?.lifelong || false);
    const [targetDate, setTargetDate] = useState(existingGoal?.targetDate || '');
    const [estimatedTargetDate, setEstimatedTargetDate] = useState(existingGoal?.estimatedTargetDate || '');

    const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});

    const [generatedTasks, setGeneratedTasks] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // New: Agent orchestration state
    const [orchestratorQuestions, setOrchestratorQuestions] = useState<Question[]>([]);
    const [orchestratorBreakdown, setOrchestratorBreakdown] = useState<GeneratedBreakdown | null>(null);
    const [orchestratorProgress, setOrchestratorProgress] = useState(0);

    // Get currently configured provider
    const getCurrentProvider = (): ProviderName => {
        if (typeof window === 'undefined') return 'manual';
        const stored = localStorage.getItem('smallsteps-ai-provider');
        return (stored as ProviderName) || 'manual';
    };

    const handleNext = async () => {
        if (step === 'input') {
            if (!goalTitle.trim()) return;

            setError(null);
            setIsProcessing(true);

            try {
                const features = getFeatures();
                const providerName = getCurrentProvider();
                console.log(`[GoalCreator] Using provider: ${providerName}`);
                const provider = getProvider(providerName);

                // NEW: Use agent orchestration if enabled
                if (features.agentOrchestration) {
                    console.log('[GoalCreator] Using new agent orchestration');
                    try {
                        const { questions } = await startGoalCreation(
                            goalTitle,
                            provider,
                            handleOrchestratorProgress
                        );

                        if (questions && questions.length > 0) {
                            setOrchestratorQuestions(questions);
                            // Map to legacy format for existing UI
                            setClarificationQuestions(questions.map(q => ({
                                id: q.id,
                                questionText: q.text,
                                planningDimension: 'scope' as const,
                                options: (q.options || []).map(opt => ({
                                    value: opt,
                                    label: opt,
                                })),
                            })));
                            setStep('clarifying');
                        } else {
                            // No questions, go straight to generation
                            await handleOrchestratorGenerate({});
                        }
                    } catch (orchError) {
                        // Check if it's a vague goal error
                        if (orchError instanceof VagueGoalError) {
                            console.log('[GoalCreator] Goal too vague:', orchError.issues);
                            const errorMsg = orchError.issues.join(' ') +
                                (orchError.suggestion ? `\n\n💡 ${orchError.suggestion}` : '');
                            setError(errorMsg);
                            setIsProcessing(false);
                            return; // Stay on input step
                        }

                        console.error('[GoalCreator] Orchestrator failed, falling back:', orchError);
                        // Fall through to legacy flow
                        await useLegacyFlow(provider);
                    }
                } else {
                    // LEGACY: Use existing provider-based flow
                    await useLegacyFlow(provider);
                }
            } catch (err) {
                console.error('Error getting clarification questions:', err);
                setError('Failed to generate questions. Try again or proceed manually.');
            } finally {
                setIsProcessing(false);
            }
        } else if (step === 'clarifying') {
            // Check if using orchestrator
            const features = getFeatures();
            if (features.agentOrchestration && orchestratorQuestions.length > 0) {
                await handleOrchestratorGenerate(answers);
            } else {
                // Generate tasks with clarification context
                await generateTasks(answers);
            }
        }
    };

    // NEW: Handle orchestrator progress updates
    const handleOrchestratorProgress = (state: OrchestrationState) => {
        console.log('[GoalCreator] Orchestrator progress:', state.step, state.progress);
        setOrchestratorProgress(state.progress || 0);
        if (state.breakdown) {
            setOrchestratorBreakdown(state.breakdown);
        }
    };

    // NEW: Complete orchestration with user answers
    const handleOrchestratorGenerate = async (clarificationAnswers: Record<string, string>) => {
        setError(null);
        setIsProcessing(true);
        setStep('creating');

        try {
            const providerName = getCurrentProvider();
            const provider = getProvider(providerName);

            const { breakdown } = await completeGoalCreation(
                goalTitle,
                clarificationAnswers,
                provider,
                handleOrchestratorProgress
            );

            setOrchestratorBreakdown(breakdown);
            // Map to legacy format for existing preview UI
            setGeneratedTasks(breakdown.tasks.map((t, i) => ({
                title: t.title,
                estimatedTotalMinutes: t.estimatedTotalMinutes,
                phase: t.phase,
                whyThisMatters: t.whyThisMatters,
                order: t.order,
            })));

            // Calculate estimated completion date
            const totalMinutes = breakdown.tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
            const suggested = await suggestTargetDate(totalMinutes);
            setEstimatedTargetDate(suggested);

            setStep('preview');
        } catch (err) {
            console.error('[GoalCreator] Orchestrator generation failed:', err);
            setError(err instanceof Error ? err.message : 'Failed to generate breakdown');
            setStep('input');
        } finally {
            setIsProcessing(false);
        }
    };

    // LEGACY: Original clarification flow
    const useLegacyFlow = async (provider: ReturnType<typeof getProvider>) => {
        const questions = await provider.clarifyGoal(goalTitle);

        if (questions && questions.length > 0) {
            setClarificationQuestions(questions);
            setStep('clarifying');
        } else {
            // Skip clarification, go straight to decomposition
            await generateTasks({});
        }
    };

    const generateTasks = async (clarificationContext: Record<string, string>) => {
        setError(null);
        setIsProcessing(true);
        setStep('creating');

        try {
            const providerName = getCurrentProvider();
            const provider = getProvider(providerName);

            // Classify domain for template-based prompting
            const domain = classifyDomainLocal(goalTitle);
            const template = getDomainTemplate(domain);

            console.log(`[GoalCreator] Domain: ${domain}, Template phases:`, template.phases);

            // Build clarification context from answers
            const contextHints = Object.entries(clarificationContext).reduce((acc, [questionId, answerId]) => {
                const question = clarificationQuestions.find(q => q.id === questionId);
                if (question) {
                    const option = question.options.find(o => o.value === answerId);
                    if (option && option.planningHint) {
                        acc[question.planningDimension] = option.planningHint;
                    }
                }
                return acc;
            }, {} as Record<string, string>);

            // Decompose goal into tasks (clarification context currently not used by provider)
            const goalPlan = await provider.decomposeGoal(
                goalTitle,
                targetDate || undefined
            );

            // Validate task relevance using server-side semantic filter API
            console.log(`[GoalCreator] Validating ${goalPlan.tasks.length} tasks via API...`);

            try {
                const validationResponse = await fetch('/api/ai/validate-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        goalTitle,
                        tasks: goalPlan.tasks,
                        threshold: 0.10 // Tuned for all-MiniLM-L6-v2 (allows specific sub-tasks)
                    })
                });

                if (validationResponse.ok) {
                    const { validatedTasks, filteredCount } = await validationResponse.json();
                    console.log(`[GoalCreator] Filtered ${filteredCount} irrelevant task(s)`);

                    if (validatedTasks.length === 0) {
                        throw new Error('No relevant tasks could be generated. Please try rephrasing your goal.');
                    }

                    setGeneratedTasks(validatedTasks);

                    // Calculate estimated completion date
                    const totalMinutes = validatedTasks.reduce((sum: number, t: any) => sum + t.estimatedTotalMinutes, 0);
                    const suggested = await suggestTargetDate(totalMinutes);
                    setEstimatedTargetDate(suggested);
                } else {
                    console.warn('[GoalCreator] Validation failed, using unfiltered tasks');
                    setGeneratedTasks(goalPlan.tasks);

                    const totalMinutes = goalPlan.tasks.reduce((sum: number, t: any) => sum + t.estimatedTotalMinutes, 0);
                    const suggested = await suggestTargetDate(totalMinutes);
                    setEstimatedTargetDate(suggested);
                }
            } catch (validationError) {
                console.warn('[GoalCreator] Validation error, using unfiltered tasks:', validationError);
                setGeneratedTasks(goalPlan.tasks);

                const totalMinutes = goalPlan.tasks.reduce((sum: number, t: any) => sum + t.estimatedTotalMinutes, 0);
                const suggested = await suggestTargetDate(totalMinutes);
                setEstimatedTargetDate(suggested);
            }

            setStep('preview');

        } catch (err) {
            console.error('Error generating tasks:', err);
            setError(err instanceof Error ? err.message : 'Failed to generate tasks. Please try again.');
            setStep('input');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCreate = async () => {
        setIsProcessing(true);
        setError(null);

        try {
            const features = getFeatures();

            // NEW: Use integration layer if orchestrator was used
            if (features.agentOrchestration && orchestratorBreakdown) {
                console.log('[GoalCreator] Saving via integration layer');
                const domain = classifyDomainLocal(goalTitle);

                await createGoalFromBreakdown(goalTitle, orchestratorBreakdown, {
                    goalData: {
                        targetDate: targetDate || undefined,
                        estimatedTargetDate: estimatedTargetDate || undefined,
                        lifelong: isLifelong,
                        domain,
                    },
                });

                console.log(`[GoalCreator] Created goal via orchestrator with ${orchestratorBreakdown.tasks.length} tasks and ${orchestratorBreakdown.workUnits.length} work units`);
                onComplete();
                return;
            }

            // LEGACY: Original save logic
            const domain = classifyDomainLocal(goalTitle);
            let goalId: string;

            if (existingGoal) {
                goalId = existingGoal.id;
                await goalsDB.update(goalId, {
                    title: goalTitle,
                    targetDate: targetDate || undefined,
                    estimatedTargetDate: estimatedTargetDate || undefined,
                    lifelong: isLifelong,
                    domain,
                });
            } else {
                // Create returns the generated ID - use it for tasks!
                goalId = await goalsDB.create({
                    title: goalTitle,
                    targetDate: targetDate || undefined,
                    estimatedTargetDate: estimatedTargetDate || undefined,
                    lifelong: isLifelong,
                    status: 'active',
                    domain,
                });
            }

            // Create tasks (only for new goals) with matching goalId
            if (!existingGoal) {
                let order = 0;
                for (const taskData of generatedTasks) {
                    const task = await tasksDB.create({
                        goalId, // Use the ID returned from goalsDB.create()
                        title: taskData.title,
                        estimatedTotalMinutes: taskData.estimatedTotalMinutes,
                        completedMinutes: 0,
                        order: order++, // Required by schema
                    });

                    // Create a default WorkUnit for this task so it appears in the planner
                    // (Future optimization: Trigger Stage 2 decomposition here for granular units)
                    await workUnitsDB.create({
                        taskId: task.id,
                        title: taskData.title, // Initially 1:1 mapping
                        estimatedTotalMinutes: taskData.estimatedTotalMinutes,
                        completedMinutes: 0,
                        kind: 'build', // Default kind
                        firstAction: 'Start working on this task',
                        successSignal: 'Task is complete',
                    });
                }
            }

            console.log(`[GoalCreator] Created goal ${goalId} with ${generatedTasks.length} tasks`);

            onComplete();
        } catch (err) {
            console.error('Error saving goal:', err);
            setError('Failed to save goal. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const renderInput = () => (
        <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-6">
            <div>
                <label htmlFor="goalTitle" className="block text-sm font-medium text-foreground mb-2">
                    What do you want to achieve?
                </label>
                <input
                    id="goalTitle"
                    type="text"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="e.g., Learn Python, Get fit, Read 12 books"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    autoFocus
                    disabled={isProcessing}
                />
            </div>

            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isLifelong}
                        onChange={(e) => setIsLifelong(e.target.checked)}
                        className="rounded border-gray-300 text-accent focus:ring-accent"
                        disabled={isProcessing}
                    />
                    <span className="text-sm text-foreground">Lifelong goal (daily practice)</span>
                </label>
            </div>

            {!isLifelong && (
                <div>
                    <label htmlFor="targetDate" className="block text-sm font-medium text-foreground mb-2">
                        Target date (optional)
                    </label>
                    <input
                        id="targetDate"
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        disabled={isProcessing}
                    />
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex items-center gap-3 pt-4">
                <button
                    type="submit"
                    disabled={!goalTitle.trim() || isProcessing}
                    className="flex-1 px-6 py-3 bg-foreground text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity font-medium"
                >
                    {isProcessing ? 'Processing...' : 'Next'}
                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isProcessing}
                    className="px-6 py-3 border border-gray-300 text-foreground rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </form>
    );

    const renderClarifying = () => {
        const features = getFeatures();

        // Use progressive UI for agent orchestration
        if (features.agentOrchestration && orchestratorQuestions.length > 0) {
            return (
                <ContextGathering
                    questions={orchestratorQuestions}
                    onComplete={(answers) => {
                        setAnswers(answers);
                        handleOrchestratorGenerate(answers);
                    }}
                    onBack={() => setStep('input')}
                    onSkip={() => handleOrchestratorGenerate({})}
                    isProcessing={isProcessing}
                />
            );
        }

        // Legacy UI for standard flow
        return (
            <GoalClarification
                questions={clarificationQuestions}
                onComplete={generateTasks}
                onBack={() => setStep('input')}
                isProcessing={isProcessing}
            />
        );
    };

    const renderPreview = () => (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-foreground mb-2">Your Goal</h3>
                <p className="text-muted">{goalTitle}</p>
                {estimatedTargetDate && !isLifelong && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm border border-green-100">
                        <span className="font-medium">Estimated completion:</span>
                        <span>{new Date(estimatedTargetDate).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        })}</span>
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-lg font-medium text-foreground mb-3">
                    Generated Tasks ({generatedTasks.length})
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {generatedTasks.map((task, index) => (
                        <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-foreground text-sm">{task.title}</h4>
                                        {task.phase && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-accent/10 text-accent rounded-full border border-accent/20 uppercase tracking-wide">
                                                {task.phase}
                                            </span>
                                        )}
                                    </div>
                                    {task.whyThisMatters && (
                                        <p className="text-xs text-muted leading-relaxed">{task.whyThisMatters}</p>
                                    )}
                                </div>
                                <span className="text-xs text-muted whitespace-nowrap font-medium bg-white px-2 py-1 rounded border border-gray-100 shadow-sm">
                                    {Math.round(task.estimatedTotalMinutes / 60)}h {task.estimatedTotalMinutes % 60 > 0 ? `${task.estimatedTotalMinutes % 60}m` : ''}
                                </span>
                            </div>
                            {task.relevanceScore && (
                                <div className="mt-2 text-xs text-muted">
                                    Relevance: {(task.relevanceScore * 100).toFixed(0)}%
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex items-center gap-3 pt-4">
                <button
                    onClick={handleCreate}
                    disabled={isProcessing}
                    className="flex-1 px-6 py-3 bg-foreground text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity font-medium"
                >
                    {isProcessing ? 'Creating...' : 'Create Goal'}
                </button>

                <button
                    onClick={() => setStep('clarifying')}
                    disabled={isProcessing}
                    className="px-6 py-3 border border-gray-300 text-foreground rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                >
                    Back
                </button>
            </div>
        </div>
    );

    const renderCreating = () => (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
            <p className="text-foreground">Generating your personalized plan...</p>
            <p className="text-sm text-muted">This may take a moment</p>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-light text-foreground">
                    {existingGoal ? 'Edit Goal' :
                        step === 'input' ? 'Create New Goal' :
                            step === 'clarifying' ? 'Tell Us More' :
                                step === 'preview' ? 'Review Your Plan' :
                                    'Creating...'}
                </h2>
                <button
                    onClick={onCancel}
                    disabled={isProcessing}
                    className="text-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            {step === 'input' && renderInput()}
            {step === 'clarifying' && renderClarifying()}
            {step === 'preview' && renderPreview()}
            {step === 'creating' && renderCreating()}
        </div>
    );
}
