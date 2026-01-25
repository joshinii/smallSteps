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

export default function TodayPage() {
    const [plan, setPlan] = useState<DailyPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [timerMinutes, setTimerMinutes] = useState(0);
    const [showRemainingTasks, setShowRemainingTasks] = useState(false);
    const [showDayTypePrompt, setShowDayTypePrompt] = useState(false);
    const [dayTypeInput, setDayTypeInput] = useState('');

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

    const handleStartTask = (taskId: string) => {
        setActiveTaskId(taskId);
        setTimerMinutes(0);
    };

    const handleStopTask = async () => {
        if (activeTaskId && timerMinutes > 0) {
            await recordTaskProgress(activeTaskId, timerMinutes);
            await loadPlan();
        }
        setActiveTaskId(null);
        setTimerMinutes(0);
    };

    const handleQuickProgress = async (taskId: string, minutes: number) => {
        await recordTaskProgress(taskId, minutes);
        await loadPlan();
    };

    const handleReorderTasks = (fromIndex: number, toIndex: number) => {
        if (!plan) return;
        const newTasks = [...plan.tasks];
        const [movedTask] = newTasks.splice(fromIndex, 1);
        newTasks.splice(toIndex, 0, movedTask);
        setPlan({ ...plan, tasks: newTasks });
    };

    const handleGenerateNewPlan = async () => {
        // Use AI to generate new plan based on user input
        setLoading(true);
        try {
            // For now, just regenerate with balanced type
            // TODO: Integrate AI to parse dayTypeInput and determine day type
            const dayType = dayTypeInput.toLowerCase().includes('easy') || dayTypeInput.toLowerCase().includes('gentle')
                ? 'gentle'
                : dayTypeInput.toLowerCase().includes('focus') || dayTypeInput.toLowerCase().includes('productive')
                    ? 'focused'
                    : 'balanced';

            const newPlan = await regenerateDailyPlan(today, dayType);
            setPlan(newPlan);
            setShowDayTypePrompt(false);
            setDayTypeInput('');
        } catch (error) {
            console.error('Failed to regenerate plan:', error);
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
            {!showDayTypePrompt && remainingTasks.length > 0 && (
                <button
                    onClick={() => setShowDayTypePrompt(true)}
                    className="mb-6 text-sm text-muted hover:text-foreground transition-colors flex items-center gap-2"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Adjust today's plan
                </button>
            )}

            {/* Day Type Prompt */}
            {showDayTypePrompt && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl animate-fadeIn">
                    <p className="text-sm text-blue-900 mb-3 font-medium">What kind of day does this need to be?</p>
                    <input
                        type="text"
                        value={dayTypeInput}
                        onChange={(e) => setDayTypeInput(e.target.value)}
                        placeholder="e.g., 'Easy and relaxed' or 'Productive and focused'"
                        className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:border-blue-400 focus:outline-none text-sm mb-3"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerateNewPlan}
                            disabled={!dayTypeInput.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
                        >
                            Generate new plan
                        </button>
                        <button
                            onClick={() => {
                                setShowDayTypePrompt(false);
                                setDayTypeInput('');
                            }}
                            className="px-4 py-2 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-sm"
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
                            isActive={activeTaskId === task.id}
                            onStart={() => handleStartTask(task.id)}
                            onStop={handleStopTask}
                            onSkip={() => handleSkipTask(task.id)}
                            onQuickProgress={(mins) => handleQuickProgress(task.id, mins)}
                            timerMinutes={timerMinutes}
                            setTimerMinutes={setTimerMinutes}
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
                                    isActive={activeTaskId === task.id}
                                    onStart={() => handleStartTask(task.id)}
                                    onStop={handleStopTask}
                                    onSkip={() => handleSkipTask(task.id)}
                                    onQuickProgress={(mins) => handleQuickProgress(task.id, mins)}
                                    timerMinutes={timerMinutes}
                                    setTimerMinutes={setTimerMinutes}
                                    compact
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Habits Section */}
            {habits.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-xs uppercase tracking-wider text-muted mb-3 font-medium">Daily Rhythm</h2>
                    <div className="space-y-2">
                        {habits.map(({ task, goal }) => (
                            <div
                                key={task.id}
                                className="flex items-center gap-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                                <button
                                    onClick={() => handleQuickProgress(task.id, task.estimatedTotalMinutes)}
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
    isActive: boolean;
    onStart: () => void;
    onStop: () => void;
    onSkip: () => void;
    onQuickProgress: (minutes: number) => void;
    timerMinutes: number;
    setTimerMinutes: (mins: number) => void;
    compact?: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
}

function TaskCard({
    task,
    goalName,
    isActive,
    onStart,
    onStop,
    onSkip,
    onQuickProgress,
    timerMinutes,
    setTimerMinutes,
    compact = false,
    onMoveUp,
    onMoveDown,
}: TaskCardProps) {
    const progress = getTaskProgressPercentage(task);

    return (
        <div
            className={`bg-white border rounded-xl transition-all group/card ${
                isActive ? 'border-accent shadow-md' : 'border-gray-200 hover:border-gray-300'
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
                                {task.effortLabel === 'light' && <EffortLightIcon />}
                                {task.effortLabel === 'medium' && <EffortMediumIcon />}
                                {task.effortLabel === 'heavy' && <EffortHeavyIcon />}
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
            {!compact && (
                <>
                    {isActive ? (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setTimerMinutes(Math.max(0, timerMinutes - 5))}
                                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-muted transition-colors text-sm"
                                >
                                    −
                                </button>
                                <span className="w-14 text-center font-medium text-sm">{timerMinutes} min</span>
                                <button
                                    onClick={() => setTimerMinutes(timerMinutes + 5)}
                                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-muted transition-colors text-sm"
                                >
                                    +
                                </button>
                            </div>
                            <button
                                onClick={onStop}
                                className="ml-auto px-4 py-1.5 bg-foreground text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onStart}
                                className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors text-sm font-medium"
                            >
                                Start
                            </button>
                            <button
                                onClick={() => onQuickProgress(10)}
                                className="px-3 py-1.5 text-muted hover:text-foreground hover:bg-gray-50 rounded-lg transition-all text-sm"
                            >
                                +10 min
                            </button>
                            <button
                                onClick={onSkip}
                                className="ml-auto px-3 py-1.5 text-muted/60 hover:text-muted rounded-lg transition-colors text-sm"
                            >
                                Skip
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
