'use client';

// SmallSteps Today Page
// Core daily view - calm, focused, single ordered list

import { useState, useEffect, useCallback } from 'react';
import { generateDailyPlan, handleSkip, recordTaskProgress } from '@/lib/planning-engine';
import { getLocalDateString, getTaskProgressPercentage, isTaskEffectivelyComplete } from '@/lib/schema';
import type { Task, Goal } from '@/lib/schema';

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
    capacityNote?: string;
}

// Effort label display
const EFFORT_LABELS: Record<Task['effortLabel'], { label: string; color: string }> = {
    light: { label: 'Light', color: 'bg-emerald-50 text-emerald-700' },
    medium: { label: 'Medium', color: 'bg-amber-50 text-amber-700' },
    heavy: { label: 'Focused', color: 'bg-violet-50 text-violet-700' },
};

export default function TodayPage() {
    const [plan, setPlan] = useState<DailyPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [timerMinutes, setTimerMinutes] = useState(0);

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

    return (
        <div className="max-w-2xl mx-auto px-6 py-12 animate-fadeIn">
            {/* Header */}
            <header className="mb-10">
                <h1 className="text-3xl font-light text-foreground">{displayDate}</h1>
                <p className="text-muted mt-2">
                    {remainingTasks.length === 0
                        ? "You've done beautifully today. Rest well."
                        : "Here's what to work on today."}
                </p>
                {plan?.capacityNote && (
                    <p className="text-sm text-muted/70 mt-2 italic">{plan.capacityNote}</p>
                )}
            </header>

            {/* Task List */}
            <div className="space-y-4">
                {remainingTasks.map(({ task, goal }, index) => (
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
                    />
                ))}
            </div>

            {/* Completed Section (collapsed) */}
            {completedCount > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-100">
                    <p className="text-sm text-muted">
                        <span className="text-green-600">✓</span> {completedCount} task{completedCount > 1 ? 's' : ''} completed today
                    </p>
                </div>
            )}

            {/* Empty State */}
            {remainingTasks.length === 0 && completedCount === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-3xl">
                    <p className="text-xl text-muted font-light">No tasks for today</p>
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
}: TaskCardProps) {
    const effortInfo = EFFORT_LABELS[task.effortLabel];
    const progress = getTaskProgressPercentage(task);

    return (
        <div
            className={`bg-white border-2 rounded-2xl p-5 transition-all ${isActive ? 'border-accent shadow-lg' : 'border-gray-100 hover:border-gray-200'
                }`}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <p className="text-foreground font-medium leading-relaxed">{task.content}</p>
                    <p className="text-xs text-muted mt-1">{goalName}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${effortInfo.color}`}>
                    {effortInfo.label}
                </span>
            </div>

            {/* Progress Bar */}
            {progress > 0 && (
                <div className="mb-4">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-accent rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, progress)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Actions */}
            {isActive ? (
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setTimerMinutes(Math.max(0, timerMinutes - 5))}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-muted transition-colors"
                        >
                            −
                        </button>
                        <span className="w-16 text-center font-medium">{timerMinutes} min</span>
                        <button
                            onClick={() => setTimerMinutes(timerMinutes + 5)}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-muted transition-colors"
                        >
                            +
                        </button>
                    </div>
                    <button
                        onClick={onStop}
                        className="ml-auto px-4 py-2 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        Done
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <button
                        onClick={onStart}
                        className="px-4 py-2 bg-accent/10 text-accent rounded-xl hover:bg-accent/20 transition-colors text-sm font-medium"
                    >
                        Start
                    </button>
                    <button
                        onClick={() => onQuickProgress(10)}
                        className="px-3 py-2 text-muted hover:text-foreground hover:bg-gray-50 rounded-xl transition-all text-sm"
                    >
                        +10 min
                    </button>
                    <button
                        onClick={onSkip}
                        className="ml-auto px-3 py-2 text-muted/60 hover:text-muted rounded-xl transition-colors text-sm"
                    >
                        Not today
                    </button>
                </div>
            )}
        </div>
    );
}
