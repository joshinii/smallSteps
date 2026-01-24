'use client';

// SmallSteps Goals Page
// View and manage goals with their tasks

import { useState, useEffect, useCallback } from 'react';
import { goalsDB, tasksDB } from '@/lib/db';
import type { Goal, Task } from '@/lib/schema';
import { isTaskEffectivelyComplete, getTaskProgressPercentage } from '@/lib/schema';
import GoalCreator from '@/components/GoalCreator';

interface GoalWithTasks extends Goal {
    tasks: Task[];
}

// Effort label display
const EFFORT_LABELS: Record<Task['effortLabel'], { label: string; color: string }> = {
    light: { label: 'Light', color: 'text-emerald-600' },
    medium: { label: 'Medium', color: 'text-amber-600' },
    heavy: { label: 'Focused', color: 'text-violet-600' },
};

export default function GoalsPage() {
    const [goals, setGoals] = useState<GoalWithTasks[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreator, setShowCreator] = useState(false);
    const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

    const loadGoals = useCallback(async () => {
        try {
            const allGoals = await goalsDB.getAll();
            const allTasks = await tasksDB.getAll();

            const goalsWithTasks: GoalWithTasks[] = allGoals.map((goal) => ({
                ...goal,
                tasks: allTasks
                    .filter((t) => t.goalId === goal.id)
                    .sort((a, b) => a.order - b.order),
            }));

            // Sort: active first, then by creation date
            goalsWithTasks.sort((a, b) => {
                if (a.status !== b.status) {
                    return a.status === 'active' ? -1 : 1;
                }
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            setGoals(goalsWithTasks);
        } catch (error) {
            console.error('Failed to load goals:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGoals();
    }, [loadGoals]);

    const toggleGoal = (id: string) => {
        setExpandedGoals((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleCreatorComplete = () => {
        setShowCreator(false);
        loadGoals();
    };

    const calculateGoalProgress = (goal: GoalWithTasks): number => {
        if (goal.tasks.length === 0) return 0;
        const totalMinutes = goal.tasks.reduce((sum, t) => sum + t.estimatedTotalMinutes, 0);
        const completedMinutes = goal.tasks.reduce((sum, t) => sum + t.completedMinutes, 0);
        if (totalMinutes === 0) return 0;
        return Math.min(100, (completedMinutes / totalMinutes) * 100);
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-100 rounded-xl w-1/3"></div>
                    <div className="space-y-3 mt-8">
                        {[1, 2].map((i) => (
                            <div key={i} className="h-32 bg-gray-50 rounded-2xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-12 animate-fadeIn">
            {/* Header */}
            <header className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-light text-foreground">Goals</h1>
                    <p className="text-muted mt-1">Things you're working toward</p>
                </div>
                {!showCreator && (
                    <button
                        onClick={() => setShowCreator(true)}
                        className="px-4 py-2 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium text-sm"
                    >
                        + New Goal
                    </button>
                )}
            </header>

            {/* Goal Creator */}
            {showCreator && (
                <div className="mb-8">
                    <GoalCreator
                        onComplete={handleCreatorComplete}
                        onCancel={() => setShowCreator(false)}
                    />
                </div>
            )}

            {/* Goals List */}
            <div className="space-y-4">
                {goals.map((goal) => {
                    const isExpanded = expandedGoals.has(goal.id);
                    const progress = calculateGoalProgress(goal);
                    const completedTasks = goal.tasks.filter((t) => isTaskEffectivelyComplete(t)).length;

                    return (
                        <div
                            key={goal.id}
                            className={`bg-white border-2 rounded-2xl transition-all ${goal.status === 'active' ? 'border-gray-100' : 'border-gray-50 opacity-70'
                                }`}
                        >
                            {/* Goal Header */}
                            <div
                                className="p-5 cursor-pointer"
                                onClick={() => toggleGoal(goal.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium text-foreground">{goal.content}</h3>
                                        <p className="text-xs text-muted mt-1">
                                            {completedTasks} of {goal.tasks.length} tasks
                                            {goal.targetDate && (
                                                <span className="ml-2">
                                                    · Target: {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <button
                                        className="text-muted hover:text-foreground p-1 transition-transform duration-200"
                                        style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                                    >
                                        ▼
                                    </button>
                                </div>

                                {/* Progress Bar */}
                                {progress > 0 && (
                                    <div className="mt-3">
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-accent rounded-full transition-all duration-500"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Expanded Tasks */}
                            {isExpanded && (
                                <div className="px-5 pb-5 border-t border-gray-50">
                                    <div className="space-y-2 mt-4">
                                        {goal.tasks.map((task) => {
                                            const isComplete = isTaskEffectivelyComplete(task);
                                            const taskProgress = getTaskProgressPercentage(task);
                                            const effortInfo = EFFORT_LABELS[task.effortLabel];

                                            return (
                                                <div
                                                    key={task.id}
                                                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${isComplete ? 'bg-gray-50/50' : 'bg-gray-50'
                                                        }`}
                                                >
                                                    <div
                                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isComplete
                                                                ? 'bg-green-500 border-green-500 text-white'
                                                                : 'border-gray-300'
                                                            }`}
                                                    >
                                                        {isComplete && (
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                <path
                                                                    fillRule="evenodd"
                                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                    clipRule="evenodd"
                                                                />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p
                                                            className={`text-sm ${isComplete ? 'text-muted line-through' : 'text-foreground'
                                                                }`}
                                                        >
                                                            {task.content}
                                                        </p>
                                                        {taskProgress > 0 && taskProgress < 100 && (
                                                            <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden w-24">
                                                                <div
                                                                    className="h-full bg-accent/60 rounded-full"
                                                                    style={{ width: `${taskProgress}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs ${effortInfo.color}`}>
                                                        {effortInfo.label}
                                                    </span>
                                                    {task.isRecurring && (
                                                        <span className="text-xs text-muted bg-gray-100 px-1.5 py-0.5 rounded">
                                                            Daily
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Empty State */}
            {goals.length === 0 && !showCreator && (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-3xl">
                    <p className="text-xl text-muted font-light">No goals yet</p>
                    <p className="text-sm text-muted mt-2 mb-6">
                        Start by adding something you'd like to work toward.
                    </p>
                    <button
                        onClick={() => setShowCreator(true)}
                        className="px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium"
                    >
                        Add Your First Goal
                    </button>
                </div>
            )}
        </div>
    );
}
