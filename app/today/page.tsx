'use client';

// SmallSteps Today Page - Redesigned
// Ultra-clean focus view with minimal cognitive load

import { useState, useEffect, useCallback } from 'react';
import { generateDailyPlan, regenerateDailyPlan, handleSkip, recordTaskProgress } from '@/lib/planning-engine';
import { getLocalDateString, getTaskProgressPercentage, isTaskEffectivelyComplete } from '@/lib/schema';
import type { Task, Goal } from '@/lib/schema';
import { EffortLightIcon, EffortMediumIcon, EffortHeavyIcon } from '@/components/icons';
import Tooltip from '@/components/Tooltip';

interface AllocatedTask {
    task: Task;
    goal: Goal;
    effortUnits: number;
}

interface DailyPlan {
    date: string;
    tasks: AllocatedTask[];
    totalEffortUnits: number;
    estimatedMinutes: number;
    dayType?: 'gentle' | 'balanced' | 'focused';
    capacityNote?: string;
}

type PresetMode = 'gentle' | 'focused' | 'energetic' | 'recovery';

export default function TodayPage() {
    const [plan, setPlan] = useState<DailyPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [showRemainingTasks, setShowRemainingTasks] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [selectedMode, setSelectedMode] = useState<PresetMode>('focused');

    const today = getLocalDateString();
    const displayDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });

    const loadPlan = useCallback(async () => {
        setLoading(true);
        try {
            const dailyPlan = await generateDailyPlan(today);
            setPlan(dailyPlan);
        } catch (error) {
            console.error('Failed to load daily plan:', error);
        } finally {
            setLoading(false);
        }
    }, [today]);

    useEffect(() => {
        loadPlan();
    }, [loadPlan]);

    const handleSkipTask = async (taskId: string) => {
        await handleSkip(taskId, today);
        await loadPlan();
    };

    const handleCompleteTask = async (taskId: string) => {
        const task = plan?.tasks.find(t => t.task.id === taskId)?.task;
        if (!task) return;

        // Mark task as complete by setting completed minutes to total
        await recordTaskProgress(taskId, task.estimatedTotalMinutes - task.completedMinutes);
        await loadPlan();
    };

    const handleReorderTasks = (fromIndex: number, toIndex: number) => {
        if (!plan) return;
        const newTasks = [...plan.tasks];
        const [movedTask] = newTasks.splice(fromIndex, 1);
        newTasks.splice(toIndex, 0, movedTask);
        setPlan({ ...plan, tasks: newTasks });
    };

    const handleRegenerateWithMode = async () => {
        setLoading(true);
        try {
            const newPlan = await regenerateDailyPlan(today, selectedMode);
            setPlan(newPlan);
            setShowPresetModal(false);
        } catch (error) {
            console.error('Failed to regenerate plan:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePullMoreTasks = async () => {
        // Pull additional tasks from upcoming by regenerating with energetic mode
        setLoading(true);
        try {
            const newPlan = await regenerateDailyPlan(today, 'energetic');
            setPlan(newPlan);
        } catch (error) {
            console.error('Failed to pull more tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-12">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-100 rounded-xl w-1/3"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                    <div className="space-y-3 mt-8">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 bg-gray-50 rounded-2xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const completedCount = plan?.tasks.filter((t) => isTaskEffectivelyComplete(t.task)).length || 0;
    const remainingTasks = plan?.tasks.filter((t) => !isTaskEffectivelyComplete(t.task)) || [];
    const focusTasks = remainingTasks.filter(({ task }) => !task.isRecurring).slice(0, 3);
    const otherTasks = remainingTasks.filter(({ task }) => !task.isRecurring).slice(3);
    const habits = remainingTasks.filter(({ task }) => task.isRecurring);

    // Check if all visible goal tasks are done (excluding habits)
    const goalTasks = plan?.tasks.filter((t) => !t.task.isRecurring) || [];
    const allGoalTasksDone = goalTasks.length > 0 && goalTasks.every((t) => isTaskEffectivelyComplete(t.task));
    const canPullMore = allGoalTasksDone && goalTasks.length < 10; // Don't pull if already have many tasks

    return (
        <div className="max-w-2xl mx-auto px-6 py-8 animate-fadeIn">
            {/* Minimal Header */}
            <header className="mb-8">
                <h1 className="text-2xl font-light text-foreground mb-1">{displayDate}</h1>
                <p className="text-sm text-muted">
                    {remainingTasks.length === 0
                        ? "You've finished everything. Rest well."
                        : `${remainingTasks.length} ${remainingTasks.length === 1 ? 'task' : 'tasks'} planned`}
                </p>
            </header>

            {/* Regenerate Plan Button */}
            {!showPresetModal && remainingTasks.length > 0 && (
                <button
                    onClick={() => setShowPresetModal(true)}
                    className="mb-6 text-sm text-muted hover:text-foreground transition-colors flex items-center gap-2"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Adjust today's plan
                </button>
            )}

            {/* Preset Mode Selection */}
            {showPresetModal && (
                <div className="mb-6 p-5 bg-gray-50 border border-gray-200 rounded-xl animate-fadeIn space-y-4">
                    <p className="text-sm text-foreground font-medium">Choose your day mode</p>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setSelectedMode('gentle')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${selectedMode === 'gentle'
                                ? 'border-accent bg-accent/5'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                        >
                            <div className="text-base mb-1">🌱 Gentle</div>
                            <div className="text-xs text-muted">Light tasks only</div>
                        </button>

                        <button
                            onClick={() => setSelectedMode('focused')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${selectedMode === 'focused'
                                ? 'border-accent bg-accent/5'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                        >
                            <div className="text-base mb-1">🎯 Focused</div>
                            <div className="text-xs text-muted">Balanced flow</div>
                        </button>

                        <button
                            onClick={() => setSelectedMode('energetic')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${selectedMode === 'energetic'
                                ? 'border-accent bg-accent/5'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                        >
                            <div className="text-base mb-1">🔥 Energetic</div>
                            <div className="text-xs text-muted">Extra capacity</div>
                        </button>

                        <button
                            onClick={() => setSelectedMode('recovery')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${selectedMode === 'recovery'
                                ? 'border-accent bg-accent/5'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                        >
                            <div className="text-base mb-1">🧘 Recovery</div>
                            <div className="text-xs text-muted">Essentials only</div>
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleRegenerateWithMode}
                            className="px-5 py-2.5 bg-foreground text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                        >
                            Regenerate today's plan
                        </button>
                        <button
                            onClick={() => {
                                setShowPresetModal(false);
                                setSelectedMode('focused');
                            }}
                            className="px-4 py-2 text-muted hover:text-foreground rounded-lg transition-colors text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Focus Tasks (Top 3) */}
            {focusTasks.length > 0 && (
                <div className="space-y-3 mb-6">
                    {focusTasks.map(({ task, goal }, index) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            goalName={goal.content}
                            onComplete={() => handleCompleteTask(task.id)}
                            onSkip={() => handleSkipTask(task.id)}
                            onMoveUp={index > 0 ? () => handleReorderTasks(index, index - 1) : undefined}
                            onMoveDown={index < focusTasks.length - 1 ? () => handleReorderTasks(index, index + 1) : undefined}
                        />
                    ))}
                </div>
            )}

            {/* Remaining Tasks (Collapsed) */}
            {otherTasks.length > 0 && (
                <div className="mb-6">
                    <button
                        onClick={() => setShowRemainingTasks(!showRemainingTasks)}
                        className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-muted hover:text-foreground transition-colors flex items-center justify-between"
                    >
                        <span>{otherTasks.length} more task{otherTasks.length > 1 ? 's' : ''} planned</span>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-transform"
                            style={{ transform: showRemainingTasks ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {showRemainingTasks && (
                        <div className="mt-3 space-y-2 opacity-70">
                            {otherTasks.map(({ task, goal }, index) => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    goalName={goal.content}
                                    onComplete={() => handleCompleteTask(task.id)}
                                    onSkip={() => handleSkipTask(task.id)}
                                    compact
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* "I have time for more" feature */}
            {canPullMore && !loading && (
                <div className="mb-6 p-5 bg-green-50 border border-green-200 rounded-xl text-center animate-fadeIn">
                    <p className="text-sm text-foreground mb-3">All tasks complete! 🎉</p>
                    <button
                        onClick={handlePullMoreTasks}
                        className="px-5 py-2.5 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        I have time for more
                    </button>
                    <p className="text-xs text-muted mt-2">Pull next tasks if capacity allows</p>
                </div>
            )}

            {/* Habits Section */}
            {habits.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-xs uppercase tracking-wider text-muted mb-3 font-medium">Habits</h2>
                    <div className="space-y-2">
                        {habits.map(({ task, goal }) => (
                            <div
                                key={task.id}
                                className="flex items-center gap-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                                <button
                                    onClick={() => handleCompleteTask(task.id)}
                                    className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-indigo-400 hover:bg-indigo-100 flex items-center justify-center transition-colors"
                                    title="Mark complete"
                                >
                                    {/* Empty circle */}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground">{task.content}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Section */}
            {completedCount > 0 && (
                <div className="pt-6 border-t border-gray-100">
                    <p className="text-sm text-green-600 font-medium">
                        You've made progress today. Well done.
                    </p>
                </div>
            )}

            {/* Empty State */}
            {remainingTasks.length === 0 && completedCount === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
                    <p className="text-lg text-muted font-light">No tasks for today</p>
                    <p className="text-sm text-muted mt-2">
                        Add some goals to get started, or simply enjoy the quiet.
                    </p>
                </div>
            )}
        </div>
    );
}

// ============================================
// Task Card Component
// ============================================

interface TaskCardProps {
    task: Task;
    goalName: string;
    onComplete: () => void;
    onSkip: () => void;
    compact?: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
}

function TaskCard({
    task,
    goalName,
    onComplete,
    onSkip,
    compact = false,
    onMoveUp,
    onMoveDown,
}: TaskCardProps) {
    const progress = getTaskProgressPercentage(task);

    const isComplete = isTaskEffectivelyComplete(task);

    return (
        <div
            className={`bg-white border rounded-xl transition-all group/card ${isComplete ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-gray-300'
                } ${compact ? 'p-3' : 'p-4'}`}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                    <div className="flex items-start gap-2">
                        <p className={`text-foreground font-medium leading-snug flex-1 ${compact ? 'text-sm' : ''}`}>
                            {task.content}
                        </p>
                        <Tooltip content={`${task.effortLabel} effort (~${task.estimatedTotalMinutes} min)`}>
                            <span className="text-muted/60 inline-flex items-center mt-0.5">
                                {task.effortLabel === 'warm-up' && <EffortLightIcon />}
                                {task.effortLabel === 'settle' && <EffortMediumIcon />}
                                {task.effortLabel === 'dive' && <EffortHeavyIcon />}
                            </span>
                        </Tooltip>
                    </div>
                    <p className="text-xs text-muted mt-1">{goalName}</p>
                </div>

                {/* Reorder buttons */}
                {!compact && (onMoveUp || onMoveDown) && (
                    <div className="flex flex-col gap-0.5 ml-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
                        {onMoveUp && (
                            <button
                                onClick={onMoveUp}
                                className="p-1 text-muted/40 hover:text-foreground hover:bg-gray-100 rounded transition-colors"
                                title="Move up"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="18 15 12 9 6 15" />
                                </svg>
                            </button>
                        )}
                        {onMoveDown && (
                            <button
                                onClick={onMoveDown}
                                className="p-1 text-muted/40 hover:text-foreground hover:bg-gray-100 rounded transition-colors"
                                title="Move down"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            {progress > 0 && (
                <div className="mb-3">
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-accent rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, progress)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Actions */}
            {!compact && !isComplete && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={onComplete}
                        className="px-4 py-1.5 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        Done
                    </button>
                    <button
                        onClick={onSkip}
                        className="ml-auto px-3 py-1.5 text-muted/60 hover:text-muted rounded-lg transition-colors text-sm"
                    >
                        Skip Today
                    </button>
                </div>
            )}

            {isComplete && (
                <div className="text-xs text-muted/60 flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Completed
                </div>
            )}
        </div>
    );
}
