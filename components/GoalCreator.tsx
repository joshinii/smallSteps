'use client';

// SmallSteps Goal Creator Component
// AI-assisted goal decomposition with calm, editable task review

import React, { useState } from 'react';
import { useAI, useAIWithFallback } from '@/lib/ai/AIContext';
import { goalsDB, tasksDB } from '@/lib/db';
import { minutesToEffortLabel, generateId } from '@/lib/schema';
import type { TaskSuggestion, GoalPlan } from '@/lib/ai/ai-provider';
import { DragHandleIcon, CloseIcon, SparklesIcon } from '@/components/icons';

interface GoalCreatorProps {
    onComplete?: () => void;
    onCancel?: () => void;
}

type Step = 'input' | 'processing' | 'review' | 'saving';

interface EditableTask extends TaskSuggestion {
    id: string;
}

export default function GoalCreator({ onComplete, onCancel }: GoalCreatorProps) {
    const [step, setStep] = useState<Step>('input');
    const [goalText, setGoalText] = useState('');
    const [targetDate, setTargetDate] = useState('');
    const [isLifelong, setIsLifelong] = useState(false);
    const [tasks, setTasks] = useState<EditableTask[]>([]);
    const [rationale, setRationale] = useState('');
    const [suggestedDate, setSuggestedDate] = useState('');
    const [error, setError] = useState('');
    const [regenerationComment, setRegenerationComment] = useState('');
    const [isRegenerating, setIsRegenerating] = useState(false);

    const { openSetupModal, isConfigured, provider } = useAI();
    const { getAIOrPrompt } = useAIWithFallback();

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
                // Using manual provider, continue anyway
            } else if (needsSetup) {
                openSetupModal();
                setStep('input');
                return;
            }

            const plan: GoalPlan = await aiProvider.decomposeGoal(
                goalText.trim(),
                targetDate || undefined,
                userFeedback,
                isLifelong
            );

            setRationale(plan.rationale);
            setTasks(
                plan.tasks.map((t) => ({
                    ...t,
                    id: generateId(),
                }))
            );

            if (plan.suggestedTargetDate && !targetDate) {
                setSuggestedDate(plan.suggestedTargetDate);
            }

            setStep('review');
        } catch (err) {
            console.error('Decomposition error:', err);
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
                isRecurring: false,
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

    const handleTargetDateChange = (newDate: string) => {
        setTargetDate(newDate);
        if (suggestedDate) {
            setSuggestedDate(''); // Clear suggestion if user manually picks a date
        }
    };

    const handleSave = async () => {
        if (tasks.length === 0) {
            setError('Add at least one task');
            return;
        }

        setStep('saving');

        try {
            // Create goal
            const goal = await goalsDB.create({
                content: goalText.trim(),
                targetDate: targetDate || suggestedDate || undefined,
                estimatedTargetDate: suggestedDate || undefined,
                lifelong: isLifelong,
                status: 'active',
            });

            // Create tasks
            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i];
                if (!t.content.trim()) continue;

                await tasksDB.create({
                    goalId: goal.id,
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
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="16"/>
                                    <line x1="8" y1="12" x2="16" y2="12"/>
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
                        Suggested timeline: {new Date(suggestedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
                                    <label className="flex items-center gap-1.5 text-xs text-muted">
                                        <input
                                            type="checkbox"
                                            checked={task.isRecurring}
                                            onChange={(e) => handleUpdateTask(task.id, { isRecurring: e.target.checked })}
                                            className="rounded"
                                        />
                                        Daily
                                    </label>

                                    {/* Effort Level Selector */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-muted">Effort:</span>
                                        <select
                                            value={task.estimatedMinutes}
                                            onChange={(e) => handleUpdateTask(task.id, { estimatedMinutes: parseInt(e.target.value) })}
                                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
                                        >
                                            <option value={7}>Light (~5-10 min)</option>
                                            <option value={25}>Medium (~20-30 min)</option>
                                            <option value={75}>Heavy (~60-90 min)</option>
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

                {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleSave}
                        className="px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium"
                    >
                        Save Goal
                    </button>
                    <button
                        onClick={() => setStep('input')}
                        className="px-6 py-3 text-muted hover:text-foreground rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-colors"
                    >
                        Back
                    </button>
                </div>
            </div>
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
