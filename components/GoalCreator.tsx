'use client';

// SmallSteps Goal Creator Component
// AI-assisted goal decomposition with calm, editable task review

import React, { useState } from 'react';
import { useAI, useAIWithFallback } from '@/lib/ai/AIContext';
import { goalsDB, tasksDB } from '@/lib/db';
import { minutesToEffortLabel, generateId } from '@/lib/schema';
import type { TaskSuggestion, GoalPlan } from '@/lib/ai/ai-provider';

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
    const [tasks, setTasks] = useState<EditableTask[]>([]);
    const [rationale, setRationale] = useState('');
    const [suggestedDate, setSuggestedDate] = useState('');
    const [error, setError] = useState('');

    const { openSetupModal, isConfigured, provider } = useAI();
    const { getAIOrPrompt } = useAIWithFallback();

    const handleDecompose = async () => {
        if (!goalText.trim()) {
            setError('Please describe your goal');
            return;
        }

        setError('');
        setStep('processing');

        try {
            const { provider: aiProvider, needsSetup } = getAIOrPrompt();

            if (needsSetup && provider === 'manual') {
                // Using manual provider, continue anyway
            } else if (needsSetup) {
                openSetupModal();
                setStep('input');
                return;
            }

            const plan: GoalPlan = await aiProvider.decomposeGoal(goalText.trim(), targetDate || undefined);

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

                <div className="mt-4">
                    <label className="block text-sm text-muted mb-2">
                        Target date <span className="text-muted/50">(optional)</span>
                    </label>
                    <input
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                        className="px-4 py-2 rounded-xl border-2 border-gray-100 focus:border-accent focus:outline-none"
                    />
                </div>

                {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleDecompose}
                        disabled={!goalText.trim()}
                        className="px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
                    >
                        Break it down
                    </button>
                    {onCancel && (
                        <button
                            onClick={onCancel}
                            className="px-6 py-3 text-muted hover:text-foreground rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {!isConfigured && (
                    <p className="mt-4 text-xs text-muted">
                        <button onClick={openSetupModal} className="text-accent hover:underline">
                            Connect an AI
                        </button>
                        {' '}for smarter task suggestions.
                    </p>
                )}
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
                        <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                            <span className="text-muted text-sm mt-2">{index + 1}</span>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={task.content}
                                    onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                                    className="w-full bg-transparent focus:outline-none text-foreground"
                                    placeholder="Task description..."
                                />
                                <div className="flex items-center gap-3 mt-2">
                                    <label className="flex items-center gap-1.5 text-xs text-muted">
                                        <input
                                            type="checkbox"
                                            checked={task.isRecurring}
                                            onChange={(e) => handleUpdateTask(task.id, { isRecurring: e.target.checked })}
                                            className="rounded"
                                        />
                                        Daily
                                    </label>
                                    <span className="text-xs text-muted/60">
                                        {minutesToEffortLabel(task.estimatedMinutes)}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemoveTask(task.id)}
                                className="text-muted/40 hover:text-muted p-1"
                            >
                                ×
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
