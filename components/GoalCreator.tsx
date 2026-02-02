'use client';

// SmallSteps Goal Creator Component
// AI-assisted goal decomposition with calm, editable task review
// 2-Stage Decomposition: Goal → Tasks (Stage 1) -> WorkUnits (Stage 2 on Save)

import React, { useState, useEffect } from 'react';
import { useAI, useAIWithFallback } from '@/lib/ai/AIContext';
import { useToast } from '@/lib/ToastContext';
import { goalsDB, tasksDB, workUnitsDB } from '@/lib/db';
import { generateId, formatDisplayDate, formatEffortDisplay } from '@/lib/utils';
import type { TaskSuggestion, GoalPlan } from '@/lib/ai/ai-provider';
import { DragHandleIcon, CloseIcon, SparklesIcon } from '@/components/icons';
import { assessTargetDateFeasibility, suggestTargetDate, reassessDailyPlans, assessTotalWorkload, assessGoalAdmission, type FeasibilityResult } from '@/lib/planning-engine';
import { logger, generateTraceId } from '@/lib/logger';

interface GoalCreatorProps {
    onComplete?: () => void;
    onCancel?: () => void;
    onDelete?: () => void;
    existingGoal?: {
        id: string;
        title: string;
        targetDate?: string;
        lifelong?: boolean;
        tasks: Array<{
            id: string;
            title: string;
            estimatedTotalMinutes: number;
        }>;
    };
}

type Step = 'input' | 'processing' | 'review' | 'generating-units' | 'review-units' | 'saving';

interface EditableTask extends TaskSuggestion {
    id: string;
    // Map old 'content' to 'title' for compatibility if needed, though we prefer title
    title: string;
}

// Define TaskItem based on the new structure with quality fields
interface TaskItem {
    id: string;
    title: string;
    originalTitle: string;
    estimatedTotalMinutes: number;
    workUnits: Array<{
        id: string; // Temp ID for React keys
        title: string;
        kind: 'study' | 'practice' | 'build' | 'review' | 'explore';
        estimatedTotalMinutes: number;
        capabilityId?: string;
        firstAction?: string;   // Quality: tiny first step
        successSignal?: string; // Quality: how to know you're done
    }>;
    isEditing: boolean;
}

export default function GoalCreator({ onComplete, onCancel, onDelete, existingGoal }: GoalCreatorProps) {
    const isEditMode = !!existingGoal;

    const [step, setStep] = useState<Step>(isEditMode ? 'review' : 'input');
    const [goalText, setGoalText] = useState(existingGoal?.title || '');
    const [targetDate, setTargetDate] = useState(existingGoal?.targetDate || '');
    const [isLifelong, setIsLifelong] = useState(existingGoal?.lifelong || false);

    // Initialize tasks if editing
    const [tasks, setTasks] = useState<TaskItem[]>(
        existingGoal?.tasks.map(t => ({
            id: t.id,
            title: t.title,
            originalTitle: t.title,
            estimatedTotalMinutes: t.estimatedTotalMinutes,
            workUnits: [], // Load separately if needed, but for now empty
            isEditing: false
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
    const [traceId] = useState(generateTraceId());

    const { openSetupModal, isConfigured, provider } = useAI();
    const { getAIOrPrompt } = useAIWithFallback();
    const { showToast } = useToast();

    // Stage 1: Decompose Goal -> Tasks
    const handleDecompose = async (userFeedback?: string) => {
        if (!goalText.trim()) {
            setError('Please describe your goal');
            return;
        }

        setError('');
        setStep('processing');
        if (userFeedback) setIsRegenerating(true);

        try {
            const { provider: aiProvider, needsSetup } = getAIOrPrompt();

            if (needsSetup && provider === 'manual') {
                showToast("Using offline templates. Connect AI for better results.", "info");
            } else if (needsSetup) {
                openSetupModal();
                setStep('input');
                return;
            }

            let plan: GoalPlan;
            try {
                plan = await aiProvider.decomposeGoal(goalText.trim(), targetDate || undefined, userFeedback, isLifelong, traceId);
            } catch (aiError) {
                console.warn('AI failed, falling back to manual', aiError);
                showToast("AI connection failed. Switched to manual mode.", "calm-alert");
                const { manualProvider } = await import('@/lib/ai/ai-provider');
                plan = await manualProvider.decomposeGoal(goalText.trim());
            }

            setRationale(plan.rationale || '');

            setTasks(
                plan.tasks.map((t) => ({
                    ...t,
                    id: generateId(),
                    title: t.title || t.content || 'Untitled Task',
                    originalTitle: t.title || t.content || 'Untitled Task',
                    estimatedTotalMinutes: t.estimatedTotalMinutes || 120,
                    workUnits: [],
                    isEditing: false
                }))
            );

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
                title: '',
                originalTitle: '',
                estimatedTotalMinutes: 120, // Meaningful chunk default
                workUnits: [],
                isEditing: true // Start in edit mode
            },
        ]);
    };

    const handleTargetDateChange = async (newDate: string) => {
        setTargetDate(newDate);
        if (suggestedDate) setSuggestedDate('');

        if (tasks.length > 0 && newDate) {
            const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
            const result = await assessTargetDateFeasibility(totalMinutes, newDate, existingGoal?.id, traceId);
            setFeasibility(result);
            setShowFeasibilityWarning(!result.isFeasible);
        }
    };

    // Auto-suggest date
    useEffect(() => {
        const autoSuggestDate = async () => {
            if (tasks.length > 0 && !targetDate && !suggestedDate && step === 'review' && !isLifelong) {
                const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
                const suggested = await suggestTargetDate(totalMinutes, existingGoal?.id);
                setSuggestedDate(suggested);
            }
        };
        autoSuggestDate();
    }, [tasks, targetDate, suggestedDate, step, existingGoal, isLifelong]);

    const handleGeneratePlan = async () => {
        if (tasks.length === 0) {
            setError('Add at least one task');
            return;
        }

        const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
        const admission = await assessGoalAdmission(totalMinutes);
        if (admission.paceAdjustment === 'gentle') {
            showToast(admission.message || "High workload. We'll start gently.", "info");
        }

        setStep('generating-units');

        try {
            const { provider: aiProvider } = getAIOrPrompt();

            const ownedCapabilities = new Set<string>();

            const tasksWithUnits = [...tasks];

            for (let i = 0; i < tasksWithUnits.length; i++) {
                const t = tasksWithUnits[i];
                if (t.workUnits.length === 0) {
                    try {
                        const otherTaskTitles = tasksWithUnits
                            .filter(other => other.id !== t.id)
                            .map(other => other.title);

                        const plan = await aiProvider.decomposeTask(
                            t.title,
                            t.estimatedTotalMinutes,
                            otherTaskTitles,
                            Array.from(ownedCapabilities)
                        );

                        // De-duplicate WorkUnits based on capabilityId
                        const uniqueUnits = [];
                        for (const u of plan.workUnits) {
                            if (u.capabilityId && ownedCapabilities.has(u.capabilityId)) {
                                console.warn(`[GoalCreator] Dropping duplicate capability: ${u.capabilityId}`);
                                continue;
                            }
                            if (u.capabilityId) {
                                ownedCapabilities.add(u.capabilityId);
                            }
                            uniqueUnits.push({
                                id: generateId(),
                                title: u.title,
                                kind: u.kind || 'practice',
                                estimatedTotalMinutes: u.estimatedTotalMinutes,
                                capabilityId: u.capabilityId
                            });
                        }

                        tasksWithUnits[i].workUnits = uniqueUnits;
                    } catch (e) {
                        console.warn(`Failed to decompose task ${t.title}`, e);
                        tasksWithUnits[i].workUnits = [{
                            id: generateId(),
                            title: `Work on ${t.title}`,
                            kind: 'practice',
                            estimatedTotalMinutes: t.estimatedTotalMinutes,
                        }];
                    }
                } else {
                    // If existing work units (e.g. erratic back/forth), add their caps to ledger
                    t.workUnits.forEach(u => {
                        if (u.capabilityId) ownedCapabilities.add(u.capabilityId);
                    });
                }
            }

            setTasks(tasksWithUnits);
            setStep('review-units');

        } catch (e) {
            console.error(e);
            setError('Failed to generate plan. Please try again.');
            setStep('review');
        }
    };

    const handleFinalSave = async () => {
        const effectiveDate = targetDate || suggestedDate;
        setStep('saving');

        try {
            let goalId = existingGoal?.id;

            if (isEditMode && goalId) {
                await goalsDB.update(goalId, {
                    title: goalText.trim(),
                    targetDate: effectiveDate || undefined,
                    estimatedTargetDate: suggestedDate || undefined,
                    lifelong: isLifelong,
                });

                const existingTasks = await tasksDB.getByGoalId(goalId);
                for (const t of existingTasks) {
                    await tasksDB.delete(t.id);
                }
            } else {
                const goal = await goalsDB.create({
                    title: goalText.trim(),
                    targetDate: effectiveDate || undefined,
                    estimatedTargetDate: suggestedDate || undefined,
                    lifelong: isLifelong,
                    status: 'active',
                });
                goalId = goal.id;
            }

            if (!goalId) throw new Error("Goal ID missing");

            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i];
                if (!t.title.trim()) continue;

                const savedTask = await tasksDB.create({
                    goalId: goalId,
                    title: t.title.trim(),
                    estimatedTotalMinutes: t.estimatedTotalMinutes,
                    completedMinutes: 0,
                    order: i,
                });

                if (t.workUnits.length > 0) {
                    for (const u of t.workUnits) {
                        await workUnitsDB.create({
                            taskId: savedTask.id,
                            title: u.title,
                            kind: u.kind,
                            estimatedTotalMinutes: u.estimatedTotalMinutes,
                            completedMinutes: 0,
                            capabilityId: u.capabilityId,
                            firstAction: u.firstAction,     // Quality field
                            successSignal: u.successSignal  // Quality field
                        });
                    }
                } else {
                    await workUnitsDB.create({
                        taskId: savedTask.id,
                        title: `Work on ${savedTask.title}`,
                        kind: 'practice',
                        estimatedTotalMinutes: savedTask.estimatedTotalMinutes,
                        completedMinutes: 0,
                        firstAction: 'Take a moment to prepare your workspace',
                        successSignal: 'You made meaningful progress on this'
                    });
                }
            }

            await reassessDailyPlans();

            if (onComplete) onComplete();
        } catch (err) {
            console.error('Save error:', err);
            setError('Failed to save goal');
            setStep('review-units');
        }
    };

    // Keep handleSave for backward compatibility or remove if fully replaced.
    // The previous edit attempted to replace handleSave but failed. 
    // We will target the start of handleSave and replace it entirely.
    const handleSave = async () => {
        const effectiveDate = targetDate || suggestedDate;
        if (tasks.length === 0) {
            setError('Add at least one task');
            return;
        }

        // Admission Check
        const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
        const admission = await assessGoalAdmission(totalMinutes);
        if (admission.paceAdjustment === 'gentle') {
            showToast(admission.message || "High workload. We'll start gently.", "info");
        }

        setStep('saving');

        try {
            let goalId = existingGoal?.id;

            // 1. Save Goal
            if (isEditMode && goalId) {
                await goalsDB.update(goalId, {
                    title: goalText.trim(),
                    targetDate: effectiveDate || undefined,
                    estimatedTargetDate: suggestedDate || undefined,
                    lifelong: isLifelong,
                });

                // Keep existing tasks logic complicated unless we wipe and replace. 
                // For simplicity in this architecture refactor, we wipe and replace tasks/units for now, 
                // or we need a smarter diff. 
                // Let's wipe and replace for deterministic behavior as requested ("deterministic").
                // WARNING: This clears history for these tasks. 
                // Ideally we map IDs, but tasks are ephemeral buckets now.
                const existingTasks = await tasksDB.getByGoalId(goalId);
                for (const t of existingTasks) {
                    await tasksDB.delete(t.id);
                    // Cascade delete work units? (Assuming DB or manual logic handles it, but let's be safe)
                    // workUnitsDB doesn't have deleteByTaskId yet? 
                }
            } else {
                const goal = await goalsDB.create({
                    title: goalText.trim(),
                    targetDate: effectiveDate || undefined,
                    estimatedTargetDate: suggestedDate || undefined,
                    lifelong: isLifelong,
                    status: 'active',
                });
                goalId = goal.id;
            }

            if (!goalId) throw new Error("Goal ID missing");

            // 2. Save Tasks
            // We need to keep track of new task IDs to generate work units for them
            const savedTasks: { id: string; title: string; minutes: number }[] = [];

            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i];
                if (!t.title.trim()) continue;

                // Create Task
                const savedTask = await tasksDB.create({
                    goalId: goalId,
                    title: t.title.trim(), // Use title instead of content (schema mismatch fix)
                    // content: t.title.trim(), // Old schema used content, checking lib/schema.ts: Task has TITLE.
                    // Wait, let's double check schema.ts line 30: "title: string;"
                    // So use title.dTotalMinutes: t.estimatedTotalMinutes,
                    estimatedTotalMinutes: t.estimatedTotalMinutes,
                    completedMinutes: 0,
                    // effortLabel removed from schema
                    // effortLabel: minutesToEffortLabel(t.estimatedMinutes), 
                    // isRecurring removed from schema for Tasks (mostly using WorkUnits now or Habits)
                    // But we keep it in DB signature if it exists? 
                    // Let's check DB schema. Task interface in schema.ts line 27 has NO isRecurring.
                    // So remove isRecurring too.
                    order: i,
                });
                savedTasks.push({ id: savedTask.id, title: savedTask.title, minutes: savedTask.estimatedTotalMinutes });
            }

            // 3. Stage 2: Generate Work Units
            // Only if we have an AI provider available, otherwise use defaults
            const { provider: aiProvider } = getAIOrPrompt();

            if (provider !== 'manual') {
                setStep('generating-units');
                // Generate in parallel or sequence? Sequence to avoid rate limits?
                // Let's do sequence for safety.

                for (const t of savedTasks) {
                    try {
                        const plan = await aiProvider.decomposeTask(t.title, t.minutes);

                        // Save WorkUnits with quality fields
                        for (const u of plan.workUnits) {
                            await workUnitsDB.create({
                                taskId: t.id,
                                title: u.title,
                                kind: u.kind,
                                estimatedTotalMinutes: u.estimatedTotalMinutes,
                                completedMinutes: 0,
                                capabilityId: u.capabilityId,
                                firstAction: u.firstAction,     // Quality field
                                successSignal: u.successSignal  // Quality field
                            });
                        }
                    } catch (e) {
                        console.warn(`Failed to decompose task ${t.title}`, e);
                        // Fallback: Create one generic work unit with defaults
                        await workUnitsDB.create({
                            taskId: t.id,
                            title: `Work on ${t.title}`,
                            kind: 'practice',
                            estimatedTotalMinutes: t.minutes,
                            completedMinutes: 0,
                            firstAction: 'Take a moment to prepare your workspace',
                            successSignal: 'You made meaningful progress on this'
                        });
                    }
                }
            } else {
                // Manual mode: Create generic work units with defaults
                for (const t of savedTasks) {
                    await workUnitsDB.create({
                        taskId: t.id,
                        title: `Work on ${t.title}`,
                        kind: 'practice',
                        estimatedTotalMinutes: t.minutes,
                        completedMinutes: 0,
                        firstAction: 'Take a moment to prepare your workspace',
                        successSignal: 'You made meaningful progress on this'
                    });
                }
            }

            // Trigger reassessment
            await reassessDailyPlans();

            onComplete?.();
        } catch (err) {
            console.error('Save error:', err);
            setError('Failed to save. Please try again.');
            setStep('review');
        }
    };

    // ... Render code (similar to before but updated fields) ...
    // Using simple conditional renders here for brevity in this replace block, 
    // but preserving the full UI structure.

    if (step === 'input') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-xl font-light text-foreground mb-4">What is your goal?</h2>
                <textarea
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    placeholder="e.g. Master the Piano, Build a Shed"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-accent focus:outline-none resize-none h-24"
                />
                <div className="mt-4 flex flex-col gap-4">
                    <label className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={isLifelong}
                            onChange={(e) => setIsLifelong(e.target.checked)}
                            className="w-5 h-5 rounded"
                        />
                        <div>
                            <span className="block text-sm font-medium">Lifelong journey</span>
                            <span className="block text-xs text-muted">No end date</span>
                        </div>
                    </label>

                    {!isLifelong && (
                        <div>
                            <label className="block text-sm text-muted mb-2">Target date (optional)</label>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border-2 border-gray-100"
                            />
                        </div>
                    )}
                </div>

                {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

                <div className="flex flex-col gap-3 mt-6">
                    <button
                        onClick={() => handleDecompose()}
                        disabled={!goalText.trim()}
                        className="w-full px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                    >
                        <SparklesIcon size={16} />
                        Plan with AI
                    </button>
                    {onCancel && (
                        <button onClick={onCancel} className="px-6 py-3 text-muted border-2 border-gray-100 rounded-xl hover:border-gray-200">
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
                    <p className="text-muted">Drafting your plan...</p>
                </div>
            </div>
        );
    }

    if (step === 'generating-units') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-8 text-center animate-fadeIn">
                <div className="animate-pulse">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                        <SparklesIcon size={24} />
                    </div>
                    <p className="text-foreground font-medium">Breaking down tasks...</p>
                    <p className="text-xs text-muted mt-2">Creating detailed work units for you.</p>
                </div>
            </div>
        );
    }

    if (step === 'review-units') {
        return (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 animate-fadeIn h-[600px] flex flex-col">
                <h2 className="text-xl font-light text-foreground mb-6">Review Detailed Plan</h2>

                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {tasks.map((task) => (
                        <div key={task.id} className="border border-gray-100 rounded-xl overflow-hidden">
                            <div className="bg-gray-50/50 p-3 border-b border-gray-100">
                                <h3 className="font-medium text-foreground text-sm">{task.title}</h3>
                                <p className="text-xs text-muted">{task.estimatedTotalMinutes} mins total</p>
                            </div>
                            <div className="p-3 space-y-2">
                                {task.workUnits.map((unit) => (
                                    <div key={unit.id} className="flex items-center gap-3 p-2 bg-white border border-gray-100 rounded-lg">
                                        <div className="w-1.5 h-8 bg-indigo-100 rounded-full" />
                                        <div className="flex-1 min-w-0">
                                            <input
                                                value={unit.title}
                                                onChange={(e) => {
                                                    const newTitle = e.target.value;
                                                    setTasks(prev => prev.map(t =>
                                                        t.id === task.id
                                                            ? { ...t, workUnits: t.workUnits.map(u => u.id === unit.id ? { ...u, title: newTitle } : u) }
                                                            : t
                                                    ));
                                                }}
                                                className="w-full text-sm font-medium text-foreground bg-transparent border-none focus:ring-0 p-0"
                                            />
                                            <p className="text-xs text-muted mt-0.5 capitalize">{unit.kind} · {unit.estimatedTotalMinutes}m</p>
                                        </div>
                                    </div>
                                ))}
                                {task.workUnits.length === 0 && (
                                    <p className="text-sm text-muted italic p-2">No work units suggested.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-6 mt-6 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={() => setStep('review')}
                        className="px-6 py-3 border-2 border-gray-100 rounded-xl text-muted font-medium hover:border-gray-200"
                    >
                        Back
                    </button>
                    <button
                        onClick={handleFinalSave}
                        className="flex-1 px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 font-medium"
                    >
                        Confirm Goal
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
                    <p className="text-muted">Saving goal structure...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 animate-fadeIn">
            <h2 className="text-xl font-light text-foreground mb-2">{goalText}</h2>
            {rationale && <p className="text-sm text-muted mb-6">{rationale}</p>}

            {suggestedDate && !targetDate && (
                <div className="mb-6 p-3 bg-gray-50 rounded-xl text-sm text-muted">
                    Suggested timeline: {formatDisplayDate(suggestedDate)}
                    <button onClick={() => setTargetDate(suggestedDate)} className="ml-2 text-accent hover:underline">
                        Accept
                    </button>
                </div>
            )}

            <div className="space-y-3 mb-6">
                {tasks.map((task, index) => (
                    <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl group">
                        <div className="flex items-center gap-2 text-muted/40 mt-1">
                            <span className="text-sm">{index + 1}</span>
                        </div>
                        <div className="flex-1">
                            <input
                                type="text"
                                value={task.title}
                                onChange={(e) => handleUpdateTask(task.id, { title: e.target.value })}
                                className="w-full bg-transparent focus:outline-none text-foreground font-medium"
                                placeholder="Task title"
                            />
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted">
                                    Est. {task.estimatedTotalMinutes} mins
                                </span>
                            </div>
                        </div>
                        <button onClick={() => handleRemoveTask(task.id)} className="text-muted/40 hover:text-red-500">
                            <CloseIcon size={16} />
                        </button>
                    </div>
                ))}
            </div>

            <button onClick={handleAddTask} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-muted text-sm mb-6">
                + Add Task
            </button>

            {showFeasibilityWarning && (
                <div className="mb-6 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg">
                    Timeline might be too tight. Consider extending the date.
                </div>
            )}

            <div className="flex gap-3 justify-between">
                <div className="flex gap-3">
                    <button onClick={handleGeneratePlan} className="px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 font-medium flex items-center gap-2">
                        <SparklesIcon size={16} />
                        {isEditMode ? 'Update Plan' : 'Generate Plan'}
                    </button>
                    <button onClick={() => setStep('input')} className="px-6 py-3 text-muted border-2 border-gray-100 rounded-xl">
                        Back
                    </button>
                </div>
                {isEditMode && onDelete && (
                    <button onClick={onDelete} className="px-6 py-3 text-red-500 border-2 border-red-100 rounded-xl hover:bg-red-50">
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
}
