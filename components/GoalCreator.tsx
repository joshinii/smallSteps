'use client';

// SmallSteps Goal Creator Component
// AI-assisted goal decomposition with calm, editable task review

import React, { useState, useEffect } from 'react';
import { useAI, useAIWithFallback } from '@/lib/ai/AIContext';
import { useToast } from '@/lib/ToastContext';
import { goalsDB, tasksDB } from '@/lib/db';
import { minutesToEffortLabel, generateId, formatDisplayDate } from '@/lib/utils';
import type { TaskSuggestion, GoalPlan } from '@/lib/ai/ai-provider';
import { DragHandleIcon, CloseIcon, SparklesIcon } from '@/components/icons';
import { assessTargetDateFeasibility, suggestTargetDate, reassessDailyPlans, assessTotalWorkload, assessGoalAdmission, type FeasibilityResult } from '@/lib/planning-engine';

interface GoalCreatorProps {
    onComplete?: () => void;
    onCancel?: () => void;
    onDelete?: () => void;
    existingGoal?: {
        id: string;
        content: string;
        targetDate?: string;
        lifelong?: boolean;
        tasks: Array<{
            id: string;
            content: string;
            estimatedMinutes: number;
            isRecurring: boolean;
        }>;
    };
}

type Step = 'input' | 'processing' | 'review' | 'saving';

interface EditableTask extends TaskSuggestion {
    id: string;
}

export default function GoalCreator({ onComplete, onCancel, onDelete, existingGoal }: GoalCreatorProps) {
    const isEditMode = !!existingGoal;

    const [step, setStep] = useState<Step>(isEditMode ? 'review' : 'input');
    const [goalText, setGoalText] = useState(existingGoal?.content || '');
    const [targetDate, setTargetDate] = useState(existingGoal?.targetDate || '');
    const [isLifelong, setIsLifelong] = useState(existingGoal?.lifelong || false);
    const [tasks, setTasks] = useState<EditableTask[]>(
        existingGoal?.tasks.map(t => ({
            id: t.id,
            content: t.content,
            estimatedMinutes: t.estimatedMinutes,
            isRecurring: t.isRecurring,
        })) || []
    );
    const [rationale, setRationale] = useState('');
    const [suggestedDate, setSuggestedDate] = useState('');
    const [error, setError] = useState('');
    const [regenerationComment, setRegenerationComment] = useState('');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [feasibility, setFeasibility] = useState<FeasibilityResult | null>(null);
    const [showFeasibilityWarning, setShowFeasibilityWarning] = useState(false);
    const [workloadWarning, setWorkloadWarning] = useState<string | null>(null);
    const [aiTotalEstimate, setAiTotalEstimate] = useState<number | null>(null);

    const { openSetupModal, isConfigured, provider } = useAI();
    const { getAIOrPrompt } = useAIWithFallback();
    const { showToast } = useToast();

    const handleDecompose = async (userFeedback?: string) => {
        if (!goalText.trim()) {
            setError('Please describe your goal');
            return;
        }

        setError('');
        setStep('processing');
        if (userFeedback) {
            setIsRegenerating(true);
        }

        try {
            const { provider: aiProvider, needsSetup } = getAIOrPrompt();

            if (needsSetup && provider === 'manual') {
                // Using manual provider
                showToast("Using offline templates. Connect AI for better results.", "info");
            } else if (needsSetup) {
                openSetupModal();
                setStep('input');
                return;
            }

            let plan: GoalPlan;

            try {
                plan = await aiProvider.decomposeGoal(
                    goalText.trim(),
                    targetDate || undefined,
                    userFeedback,
                    isLifelong
                );
            } catch (aiError) {
                console.warn('AI failed, falling back to manual', aiError);
                showToast("AI connection failed. Switched to offline mode.", "calm-alert");

                // Fallback to manual
                const { manualProvider } = await import('@/lib/ai/ai-provider');
                plan = await manualProvider.decomposeGoal(
                    goalText.trim(),
                    targetDate || undefined,
                    userFeedback,
                    isLifelong
                );
            }

            setRationale(plan.rationale);
            setAiTotalEstimate(plan.totalEstimatedMinutes || null);
            setTasks(
                plan.tasks.map((t) => ({
                    ...t,
                    id: generateId(),
                }))
            );



            setStep('review');
        } catch (err) {
            console.error('Final decomposition error:', err);
            setError('Something went wrong. Please try again.');
            setStep('input');
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleUpdateTask = (id: string, updates: Partial<EditableTask>) => {
        setTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
        );
    };

    const handleRemoveTask = (id: string) => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
    };

    const handleAddTask = () => {
        setTasks((prev) => [
            ...prev,
            {
                id: generateId(),
                content: '',
                estimatedMinutes: 20,
                isRecurring: isLifelong, // Only default to true if it's a habit goal
            },
        ]);
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain');

        if (sourceId === targetId) return;

        setTasks((prev) => {
            const sourceIndex = prev.findIndex((t) => t.id === sourceId);
            const targetIndex = prev.findIndex((t) => t.id === targetId);

            if (sourceIndex === -1 || targetIndex === -1) return prev;

            const newTasks = [...prev];
            const [movedTask] = newTasks.splice(sourceIndex, 1);
            newTasks.splice(targetIndex, 0, movedTask);

            return newTasks;
        });
    };

    const handleRegenerate = () => {
        if (regenerationComment.trim()) {
            handleDecompose(regenerationComment.trim());
            setRegenerationComment('');
        } else {
            handleDecompose();
        }
    };

    const handleTargetDateChange = async (newDate: string) => {
        setTargetDate(newDate);
        if (suggestedDate) {
            setSuggestedDate(''); // Clear suggestion if user manually picks a date
        }

        // Run feasibility check if we have tasks
        if (tasks.length > 0 && newDate) {
            const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
            const result = await assessTargetDateFeasibility(
                totalMinutes,
                newDate,
                existingGoal?.id
            );
            setFeasibility(result);
            setShowFeasibilityWarning(!result.isFeasible);
        }
    };

    // Auto-suggest target date when tasks change
    useEffect(() => {
        const autoSuggestDate = async () => {
            if (tasks.length > 0 && !targetDate && !suggestedDate && step === 'review' && !isLifelong) {
                const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
                const suggested = await suggestTargetDate(totalMinutes, existingGoal?.id);
                setSuggestedDate(suggested);
                setTargetDate(suggested); // Auto-populate field
            }
        };
        autoSuggestDate();
    }, [tasks, targetDate, suggestedDate, step, existingGoal, isLifelong]);

    const handleSave = async (overrideDate?: string | React.MouseEvent) => {
        const effectiveDate = typeof overrideDate === 'string' ? overrideDate : (targetDate || suggestedDate);

        if (tasks.length === 0) {
            setError('Add at least one task');
            return;
        }

        // Feasibility check removed to allow gentle, non-blocking flow
        // The date is just a target, not a hard deadline.

        // ADMISSION CHECK (Hybrid)
        const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
        const admission = await assessGoalAdmission(totalMinutes);

        if (admission.paceAdjustment === 'gentle') {
            showToast(admission.message || "High workload detected. We'll start this goal gently.", "info");
        }

        setStep('saving');

        try {
            let goalId: string;

            if (isEditMode && existingGoal) {
                // Update existing goal
                await goalsDB.update(existingGoal.id, {
                    content: goalText.trim(),
                    targetDate: effectiveDate || undefined,
                    estimatedTargetDate: suggestedDate || undefined, // Keep track if it was AI suggested
                    lifelong: isLifelong,
                });
                goalId = existingGoal.id;

                // Delete all existing tasks for this goal
                const existingTasks = await tasksDB.getByGoalId(goalId);
                for (const task of existingTasks) {
                    await tasksDB.delete(task.id);
                }
            } else {
                // Create new goal
                const goal = await goalsDB.create({
                    content: goalText.trim(),
                    targetDate: effectiveDate || undefined,
                    estimatedTargetDate: suggestedDate || undefined,
                    lifelong: isLifelong,
                    status: 'active',
                });
                goalId = goal.id;
            }

            // Create tasks (for both new and edited goals)
            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i];
                if (!t.content.trim()) continue;

                await tasksDB.create({
                    goalId: goalId,
                    content: t.content.trim(),
                    category: t.category,
                    estimatedTotalMinutes: t.estimatedMinutes,
                    completedMinutes: 0,
                    effortLabel: minutesToEffortLabel(t.estimatedMinutes),
                    isRecurring: t.isRecurring,
                    frequency: t.frequency,
                    order: i,
                    skipCount: 0,
                });
            }

            // Trigger daily plan reassessment
            await reassessDailyPlans();

            // Check for workload overload
            const workload = await assessTotalWorkload();
            if (workload.isOverloaded && workload.message) {
                setWorkloadWarning(workload.message);
                // Don't block save, just show warning
                setTimeout(() => {
                    setWorkloadWarning(null);
                }, 8000); // Clear after 8 seconds
            }

            onComplete?.();
        } catch (err) {
            console.error('Save error:', err);
            setError('Failed to save. Please try again.');
            setStep('review');
        }
    };

    // ============================================
    // Render Steps
    // ============================================

    if (step === 'input') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-xl font-light text-foreground mb-4">What would you like to work on?</h2>

                <textarea
                    value={goalText}
                    onChange={(e) => {
                        setGoalText(e.target.value);
                        setError('');
                    }}
                    placeholder="Describe your goal... (e.g., 'Learn to play guitar', 'Get healthier', 'Organize my home')"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-accent focus:outline-none resize-none h-24 transition-colors"
                />

                <div className="mt-4 flex flex-col gap-4">
                    <label className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                            type="checkbox"
                            checked={isLifelong}
                            onChange={(e) => {
                                setIsLifelong(e.target.checked);
                                if (e.target.checked) setTargetDate('');
                            }}
                            className="w-5 h-5 rounded border-gray-300 text-foreground focus:ring-offset-0 focus:ring-1 focus:ring-gray-400"
                        />
                        <div className="flex-1">
                            <span className="block text-sm font-medium text-foreground">This is a lifelong goal</span>
                            <span className="block text-xs text-muted">Ongoing habits, not a one-time project</span>
                        </div>
                    </label>

                    {!isLifelong && (
                        <div>
                            <label className="block text-sm text-muted mb-2">
                                Target date <span className="text-muted/50">(optional)</span>
                            </label>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border-2 border-gray-100 focus:border-accent focus:outline-none"
                            />
                        </div>
                    )}
                </div>

                {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

                <div className="flex flex-col gap-3 mt-6">
                    {isConfigured ? (
                        <button
                            onClick={() => handleDecompose()}
                            disabled={!goalText.trim()}
                            className="w-full px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity font-medium flex items-center justify-center gap-2"
                        >
                            <SparklesIcon size={16} />
                            Break it down with AI
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <button
                                onClick={openSetupModal}
                                className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="16" />
                                    <line x1="8" y1="12" x2="16" y2="12" />
                                </svg>
                                Connect to AI
                            </button>
                            <button
                                onClick={() => {
                                    // Skip AI and create default tasks
                                    setRationale('Creating default tasks for you to customize.');
                                    setTasks([
                                        {
                                            id: generateId(),
                                            content: '',
                                            estimatedMinutes: 25,
                                            isRecurring: isLifelong,
                                        }
                                    ]);
                                    setStep('review');
                                }}
                                disabled={!goalText.trim()}
                                className="w-full px-6 py-3 text-foreground border-2 border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium"
                            >
                                Continue without AI
                            </button>
                            <p className="text-xs text-muted text-center">
                                Without AI, you'll manually create and estimate effort for each task.
                            </p>
                        </div>
                    )}

                    {onCancel && (
                        <button
                            onClick={onCancel}
                            className="px-6 py-3 text-muted hover:text-foreground rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (step === 'processing') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-8 text-center animate-fadeIn">
                <div className="animate-pulse">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent/20"></div>
                    <p className="text-muted">Thinking about your goal...</p>
                </div>
            </div>
        );
    }

    if (step === 'review') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-xl font-light text-foreground mb-2">{goalText}</h2>
                {rationale && <p className="text-sm text-muted mb-6">{rationale}</p>}

                {suggestedDate && !targetDate && (
                    <div className="mb-6 p-3 bg-gray-50 rounded-xl text-sm text-muted">
                        Suggested timeline: {formatDisplayDate(suggestedDate)}
                        <button
                            onClick={() => setTargetDate(suggestedDate)}
                            className="ml-2 text-accent hover:underline"
                        >
                            Accept
                        </button>
                    </div>
                )}

                <div className="space-y-3 mb-6">
                    {tasks.map((task, index) => (
                        <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, task.id)}
                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-move hover:bg-gray-100 transition-colors group"
                        >
                            <div className="flex items-center gap-2 text-muted/40 group-hover:text-muted transition-colors">
                                <DragHandleIcon className="flex-shrink-0" />
                                <span className="text-sm">{index + 1}</span>
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={task.content}
                                    onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                                    className="w-full bg-transparent focus:outline-none text-foreground"
                                    placeholder="Task description..."
                                />
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                    {isLifelong && (
                                        <label className="flex items-center gap-1.5 text-xs text-muted">
                                            <input
                                                type="checkbox"
                                                checked={task.isRecurring}
                                                onChange={(e) => handleUpdateTask(task.id, { isRecurring: e.target.checked })}
                                                className="rounded"
                                            />
                                            Daily Habit
                                        </label>
                                    )}

                                    {/* Effort Level Selector */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-muted">Effort:</span>
                                        <select
                                            value={task.estimatedMinutes}
                                            onChange={(e) => handleUpdateTask(task.id, { estimatedMinutes: parseInt(e.target.value) })}
                                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
                                        >
                                            <option value={7}>Warm-up (~5-10 min)</option>
                                            <option value={25}>Settle (~20-30 min)</option>
                                            <option value={75}>Dive (~60-90 min)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemoveTask(task.id)}
                                className="text-muted/40 hover:text-red-500 p-1 transition-colors"
                                title="Remove task"
                            >
                                <CloseIcon size={16} />
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    onClick={handleAddTask}
                    className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-muted hover:border-gray-300 hover:text-foreground transition-colors text-sm"
                >
                    + Add task
                </button>

                {/* AI Regeneration Section */}
                <div className="mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                    <label className="block text-sm text-muted mb-2">
                        Want to adjust the tasks? Add a comment for AI:
                    </label>
                    <textarea
                        value={regenerationComment}
                        onChange={(e) => setRegenerationComment(e.target.value)}
                        placeholder="e.g., 'Make tasks smaller' or 'Focus more on practice'"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none resize-none text-sm"
                        rows={2}
                    />
                    <button
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                        {isRegenerating ? (
                            'Regenerating...'
                        ) : (
                            <>
                                <SparklesIcon size={14} />
                                Regenerate Tasks
                            </>
                        )}
                    </button>
                </div>

                {/* Target Date Editor */}
                {(targetDate || suggestedDate) && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                        <label className="block text-xs text-muted mb-2">Target date (optional)</label>
                        <input
                            type="date"
                            value={targetDate || suggestedDate}
                            onChange={(e) => handleTargetDateChange(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
                        />
                    </div>
                )}

                {/* Feasibility Warning */}
                {showFeasibilityWarning && feasibility && !feasibility.isFeasible && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                        <p className="text-sm text-foreground font-medium">Wait, that might be too soon!</p>
                        <p className="text-sm text-foreground">{feasibility.message}</p>

                        {feasibility.suggestedDate && (
                            <p className="text-xs text-muted">
                                A more realistic date based on your pace would be <strong>{formatDisplayDate(feasibility.suggestedDate)}</strong>.
                            </p>
                        )}

                        <div className="mt-2 text-sm font-medium text-foreground">
                            Please adjust the target date above or reduce your tasks.
                        </div>
                    </div>
                )}


                {/* Workload Warning */}
                {
                    workloadWarning && (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <p className="text-sm text-foreground">{workloadWarning}</p>
                        </div>
                    )
                }

                {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

                <div className="flex gap-3 mt-6 justify-between">
                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            className="px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium"
                        >
                            {isEditMode ? 'Update Goal' : 'Save Goal'}
                        </button>
                        <button
                            onClick={() => setStep('input')}
                            className="px-6 py-3 text-muted hover:text-foreground rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-colors"
                        >
                            Back
                        </button>
                    </div>
                    {isEditMode && onDelete && (
                        <button
                            onClick={onDelete}
                            className="px-6 py-3 text-red-500 hover:text-white hover:bg-red-500 rounded-xl border-2 border-red-200 hover:border-red-500 transition-colors font-medium"
                            title="Delete this goal"
                        >
                            Delete Goal
                        </button>
                    )}
                </div>
            </div >
        );
    }

    if (step === 'saving') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-8 text-center animate-fadeIn">
                <div className="animate-pulse">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100"></div>
                    <p className="text-muted">Saving your goal...</p>
                </div>
            </div>
        );
    }

    return null;
}
