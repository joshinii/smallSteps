'use client';

// SmallSteps Today Page - Redesigned
// Ultra-clean focus view with minimal cognitive load

import { useState, useEffect, useCallback } from 'react';
import { generateDailyPlan, regenerateDailyPlan, handleSkip, recordTaskProgress, resetRecurringTasks, recordRecurringTaskSkip } from '@/lib/planning-engine';
import type { DailyPlan, DayType } from '@/lib/planning-engine';
import { getLocalDateString, getTaskProgressPercentage, isTaskEffectivelyComplete } from '@/lib/utils';
import type { Task, Goal } from '@/lib/schema';
import { goalsDB, recurringTaskHistoryDB } from '@/lib/db';
import { EffortLightIcon, EffortMediumIcon, EffortHeavyIcon } from '@/components/icons';
import Tooltip from '@/components/Tooltip';


export default function TodayPage() {
    const [plan, setPlan] = useState<DailyPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [showRemainingTasks, setShowRemainingTasks] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [selectedMode, setSelectedMode] = useState<DayType>('focused');
    const [showCompleted, setShowCompleted] = useState(false);
    const [taskStreaks, setTaskStreaks] = useState<Map<string, number>>(new Map());

    const today = getLocalDateString();
    const displayDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });

    const loadPlan = useCallback(async () => {
        setLoading(true);
        try {
            const result = await generateDailyPlan(today);
            setPlan(result.plan);

            // Load streaks for recurring tasks
            const streaksMap = new Map<string, number>();
            for (const { task } of result.plan.tasks) {
                if (task.isRecurring) {
                    const streak = await recurringTaskHistoryDB.getStreak(task.id);
                    streaksMap.set(task.id, streak);
                }
            }
            setTaskStreaks(streaksMap);
        } catch (error) {
            console.error('Failed to load daily plan:', error);
        } finally {
            setLoading(false);
        }
    }, [today]);

    // Check for daily reset on mount
    useEffect(() => {
        const checkDailyReset = async () => {
            const lastResetDate = localStorage.getItem('lastResetDate');
            const today = getLocalDateString();

            if (lastResetDate && lastResetDate !== today) {
                // New day detected, reset recurring tasks
                await resetRecurringTasks(lastResetDate);
                localStorage.setItem('lastResetDate', today);
            } else if (!lastResetDate) {
                // First time loading, just set the date
                localStorage.setItem('lastResetDate', today);
            }
        };

        checkDailyReset().then(() => loadPlan());
    }, [loadPlan]);

    const handleSkipTask = async (taskId: string) => {
        const task = plan?.tasks.find(t => t.task.id === taskId)?.task;

        if (task?.isRecurring) {
            // For recurring tasks, record skip in history
            await recordRecurringTaskSkip(taskId, today);
        } else {
            // For one-time tasks, use existing skip logic
            await handleSkip(taskId, today);
        }

        await loadPlan();
    };

    const handleCompleteTask = async (taskId: string) => {
        const allocatedTask = plan?.tasks.find(t => t.task.id === taskId);
        if (!allocatedTask) return;

        const { task, goal } = allocatedTask;

        // Mark task as complete by setting completed minutes to total
        const minutesToAdd = task.estimatedTotalMinutes - task.completedMinutes;
        await recordTaskProgress(taskId, minutesToAdd);

        // For recurring tasks, record completion in history
        if (task.isRecurring) {
            await recurringTaskHistoryDB.record(
                taskId,
                goal.id,
                today,
                true, // completed
                task.estimatedTotalMinutes,
                false // not skipped
            );

            // Update goal progress for recurring goals with targets
            if (goal.totalRecurringDaysTarget) {
                const currentCompleted = goal.completedRecurringDays || 0;
                const newCompleted = currentCompleted + 1;
                const progressPercent = (newCompleted / goal.totalRecurringDaysTarget) * 100;

                await goalsDB.update(goal.id, {
                    completedRecurringDays: newCompleted,
                    recurringProgressPercent: Math.min(100, progressPercent),
                });

                // Check if goal target reached
                if (newCompleted >= goal.totalRecurringDaysTarget) {
                    await goalsDB.update(goal.id, {
                        status: 'drained' as any,
                        completedAt: new Date().toISOString(),
                    });
                }
            }
        }

        await loadPlan();
    };

    const handleToggleHabit = async (taskId: string, isCurrentlyComplete: boolean) => {
        // Dynamically import to ensure we get the latest logic and avoid circular deps if any
        const { completeHabit, uncompleteHabit } = await import('@/lib/planning-engine');

        if (isCurrentlyComplete) {
            await uncompleteHabit(taskId, today);
        } else {
            await completeHabit(taskId, 20, today);
        }

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
            const result = await regenerateDailyPlan(today, selectedMode);
            setPlan(result.plan);
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
            const result = await regenerateDailyPlan(today, 'energetic');
            setPlan(result.plan);
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

    // Separate tasks from habits
    // Habits are tasks with a goal that has lifelong=true (daily habits from Habits page)
    const allTasks = plan?.tasks || [];
    const habitTasks = allTasks.filter(t => t.goal.lifelong === true);
    const goalTasks = allTasks.filter(t => t.goal.lifelong !== true);

    const completedCount = goalTasks.filter((t) => isTaskEffectivelyComplete(t.task)).length;
    const remainingGoalTasks = goalTasks.filter((t) => !isTaskEffectivelyComplete(t.task));
    const focusTasks = remainingGoalTasks.slice(0, 3);
    const otherTasks = remainingGoalTasks.slice(3);

    // Habits section
    const habits = habitTasks;

    // Total remaining for header
    const remainingTasks = [...remainingGoalTasks, ...habitTasks.filter(h => !isTaskEffectivelyComplete(h.task))];

    // Check if all visible goal tasks are done (excluding habits)
    const allGoalTasksDone = goalTasks.length > 0 && goalTasks.every((t) => isTaskEffectivelyComplete(t.task));
    const canPullMore = allGoalTasksDone && goalTasks.length < 10; // Don't pull if already have many tasks

    // Completed tasks for "Completed Today" section
    const completedTasks = allTasks.filter((t) => isTaskEffectivelyComplete(t.task) && !t.goal.lifelong);

    return (
        <div className="max-w-2xl mx-auto px-6 py-8 animate-fadeIn">
            {/* Minimal Header */}
            <header className="mb-10">
                <h1 className="text-2xl font-light text-foreground mb-1">{displayDate}</h1>
                <p className="text-sm text-muted">
                    {remainingTasks.length === 0
                        ? "You've done enough for today. Rest well."
                        : "Here is a gentle plan for today"}
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

            {/* 1️⃣ TODAY'S FOCUS ZONE */}
            {(focusTasks.length > 0 || otherTasks.length > 0) && (
                <div className="mb-12">
                    <div className="mb-4">
                        <h2 className="text-lg font-medium text-foreground">Today's Focus</h2>
                        <p className="text-xs text-muted mt-1">A few meaningful things</p>
                    </div>

                    {/* Top Tasks */}
                    {focusTasks.length > 0 && (
                        <div className="space-y-3 mb-4">
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

                    {/* Collapsed Queue */}
                    {otherTasks.length > 0 && (
                        <div className="mt-3">
                            <button
                                onClick={() => setShowRemainingTasks(!showRemainingTasks)}
                                className="text-sm text-muted hover:text-foreground transition-colors"
                            >
                                +{otherTasks.length} more planned
                            </button>

                            {showRemainingTasks && (
                                <div className="mt-3 space-y-2 opacity-60">
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

            {/* 2️⃣ DAILY HABITS ZONE */}
            {habits.length > 0 && (
                <div className="mb-12">
                    <div className="mb-3">
                        <h2 className="text-base font-medium text-foreground">Daily Habits</h2>
                        <p className="text-xs text-muted mt-1">Small things that support you</p>
                    </div>

                    {/* Ambient Checklist (No cards, soft visuals) */}
                    <div className="space-y-2">
                        {habits.map(({ task, goal }) => {
                            const isComplete = isTaskEffectivelyComplete(task);
                            const streak = taskStreaks.get(task.id) || 0;
                            return (
                                <button
                                    key={task.id}
                                    onClick={() => handleToggleHabit(task.id, isComplete)}
                                    className={`flex items-center gap-3 py-2 w-full text-left transition-all group ${isComplete ? 'opacity-60 hover:opacity-100' : 'hover:bg-gray-50 rounded-lg px-2 -ml-2'
                                        }`}
                                >
                                    {/* Soft Toggle */}
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all ${isComplete
                                        ? 'bg-accent/20 text-accent'
                                        : 'bg-gray-100 text-transparent group-hover:bg-gray-200'
                                        }`}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={isComplete ? 'opacity-100' : 'opacity-0'}>
                                            <circle cx="12" cy="12" r="10" fill="currentColor" />
                                        </svg>
                                    </span>

                                    <span className={`text-sm flex-1 font-light ${isComplete ? 'text-muted' : 'text-foreground'}`}>
                                        {task.content}
                                    </span>

                                    {/* Streak indicator - Subtle and soft */}
                                    {streak > 0 && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${isComplete
                                            ? 'bg-orange-50 text-orange-400'
                                            : 'text-muted/40'
                                            }`}>
                                            {streak} day{streak !== 1 && 's'}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 3️⃣ PROGRESS RECORDED (Collapsed by default) */}
            {completedTasks.length > 0 && (
                <div className="pt-8 border-t border-gray-100">
                    <button
                        onClick={() => setShowCompleted(!showCompleted)}
                        className="text-sm text-muted/60 hover:text-muted transition-colors flex items-center gap-2"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {completedTasks.length} effort unit{completedTasks.length > 1 ? 's' : ''} recorded
                    </button>

                    {showCompleted && (
                        <div className="mt-3 space-y-1 opacity-50">
                            {completedTasks.map(({ task, goal }) => (
                                <div key={task.id} className="text-sm text-muted py-1 flex justify-between">
                                    <span>{task.content}</span>
                                    <span className="text-xs">+{task.estimatedTotalMinutes}m</span>
                                </div>
                            ))}
                        </div>
                    )}
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
                        Done for now
                    </button>
                    <button
                        onClick={onSkip}
                        className="ml-auto px-3 py-1.5 text-muted/60 hover:text-muted rounded-lg transition-colors text-sm"
                    >
                        Not today
                    </button>
                </div>
            )}

            {isComplete && (
                <div className="text-xs text-muted/60 flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Drained
                </div>
            )}
        </div>
    );
}
