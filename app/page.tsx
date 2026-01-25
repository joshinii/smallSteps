'use client';

import { useState, useEffect, useCallback } from 'react';
import { getLocalDate, getLocalDateString, isTaskEffectivelyComplete } from '@/lib/schema';
import DailyLog from '@/components/Habits/DailyLog';
import MonthlyGrid from '@/components/Habits/MonthlyGrid';
import { goalsDB, tasksDB } from '@/lib/db';
import type { Goal, Task } from '@/lib/schema';
import GoalCreator from '@/components/GoalCreator';
import { RecurringIcon, CheckIcon, EditIcon, CloseIcon, PlusIcon, EffortLightIcon, EffortMediumIcon, EffortHeavyIcon } from '@/components/icons';
import Tooltip from '@/components/Tooltip';
import EmptyState from '@/components/EmptyState';

// --- TaskItem Component (Calm Design) ---
// Updated to use new Task schema
const TaskItem = ({
    task,
    goalId,
    onComplete,
    onToggleRepetitive,
    onDrop,
    onEdit
}: {
    task: Task,
    goalId: string,
    onComplete: () => void,
    onToggleRepetitive: () => void,
    onDrop: () => void,
    onEdit: (newContent: string) => void
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(task.content);

    const isComplete = isTaskEffectivelyComplete(task);

    const handleSave = () => {
        if (editContent.trim() && editContent !== task.content) {
            onEdit(editContent);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setEditContent(task.content);
            setIsEditing(false);
        }
    };

    useEffect(() => {
        setEditContent(task.content);
    }, [task.content]);

    return (
        <div className={`flex items-start gap-3 p-3 rounded-lg border bg-white hover:shadow-sm hover:border-gray-300 transition-all duration-200 group/task ${isComplete ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
            <button
                onClick={onComplete}
                className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-colors ${isComplete
                    ? 'bg-accent border-accent text-white'
                    : 'border-accent text-transparent hover:bg-accent/10'
                    }`}
                title={isComplete ? "Mark incomplete" : "Mark done"}
            >
                {isComplete && <CheckIcon />}
            </button>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        {isEditing ? (
                            <input
                                autoFocus
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onBlur={handleSave}
                                onKeyDown={handleKeyDown}
                                className="w-full text-foreground font-medium bg-gray-50 border border-accent/20 rounded px-1 -ml-1 focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                        ) : (
                            <div className="flex items-start gap-2">
                                <p className={`text-foreground font-medium break-words whitespace-normal ${isComplete ? 'line-through text-muted' : ''}`}>
                                    {task.content}
                                </p>
                                <div className="flex items-center gap-1 flex-shrink-0 mt-1">
                                    {/* Effort Indicator */}
                                    <Tooltip content={`${task.effortLabel} effort (~${task.estimatedTotalMinutes} min)`}>
                                        <span className="text-muted/60 inline-flex items-center">
                                            {task.effortLabel === 'light' && <EffortLightIcon />}
                                            {task.effortLabel === 'medium' && <EffortMediumIcon />}
                                            {task.effortLabel === 'heavy' && <EffortHeavyIcon />}
                                        </span>
                                    </Tooltip>
                                    {/* Target Date removed from TaskItem as it belongs to Goal now */}
                                    {task.isRecurring && (
                                        <span className="text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center" title="Daily recurring">
                                            <RecurringIcon size={11} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity self-start">
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className="p-1.5 text-gray-400 hover:text-accent hover:bg-gray-50 rounded-lg transition-colors"
                            title="Edit text"
                        >
                            <EditIcon />
                        </button>
                        <button
                            onClick={onToggleRepetitive}
                            className={`p-1.5 rounded-lg transition-colors ${task.isRecurring ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-500 hover:bg-gray-50'}`}
                            title={task.isRecurring ? "Stop repeating" : "Make daily habit"}
                        >
                            <RecurringIcon size={13} />
                        </button>
                        <button
                            onClick={onDrop}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Drop task"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface GoalWithTasks extends Goal {
    tasks: Task[];
}

export default function HomePage() {
    const [goals, setGoals] = useState<GoalWithTasks[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreator, setShowCreator] = useState(false);

    // Habit Tracker State
    const [view, setView] = useState<'GOALS' | 'HABITS'>('GOALS');
    const [today] = useState(getLocalDate());
    const [currentMonth] = useState(getLocalDate().substring(0, 7));

    const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(new Set());

    // Initialize all goals as collapsed on first load
    useEffect(() => {
        if (goals.length > 0 && collapsedGoals.size === 0) {
            const allGoalIds = new Set(goals.map(g => g.id));
            setCollapsedGoals(allGoalIds);
        }
    }, [goals]);

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

    const toggleGoalCollapse = (goalId: string) => {
        setCollapsedGoals(prev => {
            const next = new Set(prev);
            if (next.has(goalId)) {
                next.delete(goalId);
            } else {
                next.add(goalId);
            }
            return next;
        });
    };

    const handleGoalCreatorComplete = () => {
        setShowCreator(false);
        loadGoals();
    };

    // Task Actions
    const handleCompleteTask = async (taskId: string, currentStatus: boolean, totalMinutes: number) => {
        try {
            const task = await tasksDB.getById(taskId);
            if (!task) return;

            await tasksDB.update(taskId, {
                completedMinutes: currentStatus ? 0 : totalMinutes // Toggle completion
            });

            // Check if goal is now complete
            const result = await goalsDB.checkAndCompleteGoal(task.goalId);
            if (result.completed && result.isDaily) {
                // Daily goal completed - will be hidden from home page for today
                console.log('Daily goal completed and reset for tomorrow');
            }

            await loadGoals();
        } catch (error) {
            console.error('Error completing task:', error);
        }
    };

    const handleToggleRepetitive = async (taskId: string, currentStatus: boolean) => {
        try {
            await tasksDB.update(taskId, { isRecurring: !currentStatus });
            await loadGoals();
        } catch (error) {
            console.error('Error toggling repetitive:', error);
        }
    };

    const handleDropTask = async (taskId: string, taskContent: string) => {
        if (!confirm(`Archive "${taskContent}"? You can restore it later if needed.`)) return;
        try {
            await tasksDB.archive(taskId);
            await loadGoals();
        } catch (error) {
            console.error('Error archiving task:', error);
        }
    };

    const handleEditTask = async (taskId: string, newContent: string) => {
        try {
            await tasksDB.update(taskId, { content: newContent });
            await loadGoals();
        } catch (error) {
            console.error('Error editing task:', error);
        }
    };

    const handleDeleteGoal = async (goalId: string, goalContent: string) => {
        if (!confirm(`Delete "${goalContent}" and all its tasks?`)) return;
        try {
            // Delete all tasks for this goal
            const goalTasks = await tasksDB.getByGoalId(goalId);
            await Promise.all(goalTasks.map(t => tasksDB.delete(t.id)));
            // Delete goal
            await goalsDB.delete(goalId);
            await loadGoals();
        } catch (error) {
            console.error('Error deleting goal:', error);
        }
    };

    const handleToggleGoalRepetitive = async (goal: GoalWithTasks) => {
        const allRepetitive = goal.tasks.every(s => s.isRecurring);
        const newStatus = !allRepetitive;

        try {
            await Promise.all(
                goal.tasks.map(s => tasksDB.update(s.id, { isRecurring: newStatus }))
            );
            await loadGoals();
        } catch (e) {
            console.error("Error toggling goal repetitive", e);
        }
    };

    // Helper: Get the single focus task for Collapsed View
    const getHeaderTask = (tasks: Task[]) => {
        // Filter incomplete tasks
        const incomplete = tasks.filter(t => !isTaskEffectivelyComplete(t));
        if (incomplete.length === 0) return null;

        // Simple heuristic: return first incomplete task
        return incomplete[0];
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-12 animate-fadeIn">
            {/* Header */}
            <header className="mb-10 text-center">
                <h1 className="text-4xl font-light text-foreground mb-3">
                    Small Steps
                </h1>
                <p className="text-muted text-lg">
                    Minimize overwhelm. One thing at a time.
                </p>

                {/* View Switcher */}
                <div className="flex justify-center mt-8 gap-4">
                    <button
                        onClick={() => setView('GOALS')}
                        className={`pb-2 px-4 text-sm font-medium transition-colors border-b-2 ${view === 'GOALS'
                            ? 'border-accent text-accent'
                            : 'border-transparent text-muted hover:text-foreground'
                            }`}
                    >
                        Goals & Tasks
                    </button>
                    <button
                        onClick={() => setView('HABITS')}
                        className={`pb-2 px-4 text-sm font-medium transition-colors border-b-2 ${view === 'HABITS'
                            ? 'border-accent text-accent'
                            : 'border-transparent text-muted hover:text-foreground'
                            }`}
                    >
                        Daily Rhythm
                    </button>
                </div>
            </header>

            {/* HABIT TRACKER VIEW */}
            {view === 'HABITS' && (
                <div className="space-y-12 animate-fadeIn">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-light text-foreground"></h2>
                    </div>

                    <DailyLog date={today} />

                    <div className="pt-8 border-t border-dashed border-border">
                        <h3 className="text-lg font-normal mb-6 text-muted">This Month</h3>
                        <MonthlyGrid currentMonth={currentMonth} />
                    </div>
                </div>
            )}

            {/* GOALS VIEW */}
            {view === 'GOALS' && (
                <>
                    {/* Goal Creator */}
                    {!showCreator && (
                        <div className="text-center mb-8">
                            <button
                                onClick={() => setShowCreator(true)}
                                className="px-8 py-3 bg-foreground text-white rounded-xl hover:opacity-90 hover:scale-105 active:scale-95 transition-all font-medium flex items-center gap-2 mx-auto shadow-sm"
                            >
                                <PlusIcon size={18} />
                                Add New Goal
                            </button>
                            <p className="text-sm text-muted mt-3">
                                Start something new. We'll help you break it down.
                            </p>
                        </div>
                    )}

                    {showCreator && (
                        <div className="mb-12 max-w-2xl mx-auto">
                            <GoalCreator
                                onComplete={handleGoalCreatorComplete}
                                onCancel={() => setShowCreator(false)}
                            />
                        </div>
                    )}

                    {/* Ideas & Tasks List */}
                    <div className="space-y-3">
                        {goals.length === 0 && !showCreator ? (
                            <EmptyState
                                icon="goals"
                                title="No goals yet"
                                description="Start by adding your first goal above. We'll help you break it down into manageable steps."
                            />
                        ) : (
                            <>
                                {/* Active Ideas List */}
                                {goals
                                    .filter(goal => {
                                        // Hide completed one-time goals (they move to Journey)
                                        if (goal.status === 'completed') return false;

                                        // For daily goals (lifelong), hide if all tasks are complete today
                                        if (goal.lifelong) {
                                            const allTasksComplete = goal.tasks.length > 0 && goal.tasks.every(t =>
                                                isTaskEffectivelyComplete(t)
                                            );
                                            if (allTasksComplete) return false;
                                        }

                                        return true;
                                    })
                                    .map((goal) => {
                                        const allTasks = goal.tasks;
                                        const isGoalCollapsed = collapsedGoals.has(goal.id);
                                        const isGoalRepetitive = allTasks.length > 0 && allTasks.every(t => t.isRecurring);

                                        const headerTask = getHeaderTask(allTasks);
                                        const completedCount = allTasks.filter(t => isTaskEffectivelyComplete(t)).length;

                                        // Auto-collapse if all tasks done or explicitly collapsed
                                        // Default behavior: expanded unless collapsed. 
                                        // But old page auto-collapsed initially.
                                        // Let's rely on `collapsedGoals` state, which we didn't init with all IDs, so they start expanded?
                                        // Old page init: `setCollapsedGoals(ids as Set<string>);`
                                        // I removed that init, so they start expanded. That's fine, or I can init it. 
                                        // Let's default to expanded, cleaner.

                                        const goalProgress = allTasks.length > 0
                                            ? (completedCount / allTasks.length) * 100
                                            : 0;

                                        return (
                                            <div
                                                key={goal.id}
                                                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm hover:border-gray-300 transition-all duration-200 group mb-3 animate-fadeIn"
                                                style={{ animationDelay: `${goals.indexOf(goal) * 50}ms` }}
                                            >
                                                {/* Goal Header */}
                                                <div
                                                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                                    onClick={() => toggleGoalCollapse(goal.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <h2 className="text-lg font-medium text-foreground">
                                                                    {goal.content}
                                                                </h2>
                                                                {isGoalRepetitive && (
                                                                    <span className="text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 font-medium" title="Daily Goal">
                                                                        <RecurringIcon size={10} />
                                                                        Daily
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Progress bar for collapsed view */}
                                                            {isGoalCollapsed && allTasks.length > 0 && (
                                                                <div className="flex items-center gap-3 text-xs text-muted">
                                                                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-accent rounded-full transition-all"
                                                                            style={{ width: `${goalProgress}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="whitespace-nowrap">
                                                                        {completedCount} of {allTasks.length}
                                                                    </span>
                                                                </div>
                                                            )}

                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                className="text-muted/60 hover:text-foreground transition-transform duration-200 p-1"
                                                                style={{ transform: isGoalCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                                                title={isGoalCollapsed ? 'Expand' : 'Collapse'}
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="6 9 12 15 18 9" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleGoalRepetitive(goal);
                                                            }}
                                                            className={`p-2 rounded transition-colors ${isGoalRepetitive ? 'text-indigo-600 bg-indigo-50' : 'text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                                            title="Make all tasks daily habits"
                                                        >
                                                            <RecurringIcon size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteGoal(goal.id, goal.content);
                                                            }}
                                                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded transition-colors text-sm font-medium"
                                                            title="Delete goal"
                                                        >
                                                            Drop
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Content: Tasks */}
                                                {!isGoalCollapsed && (
                                                    <div className="px-4 pb-4 pt-0 animate-slideDown space-y-3">

                                                        {/* Incomplete Tasks (Flat List) */}
                                                        <div className="space-y-3">
                                                            {allTasks.filter(t => !isTaskEffectivelyComplete(t)).map(task => (
                                                                <TaskItem
                                                                    key={task.id}
                                                                    task={task}
                                                                    goalId={goal.id}
                                                                    onComplete={() => handleCompleteTask(task.id, false, task.estimatedTotalMinutes)}
                                                                    onToggleRepetitive={() => handleToggleRepetitive(task.id, task.isRecurring)}
                                                                    onDrop={() => handleDropTask(task.id, task.content)}
                                                                    onEdit={(newContent) => handleEditTask(task.id, newContent)}
                                                                />
                                                            ))}
                                                        </div>

                                                        {/* Incomplete Placeholder */}
                                                        {allTasks.filter(t => !isTaskEffectivelyComplete(t)).length === 0 && allTasks.length > 0 && (
                                                            <div className="text-center py-8 text-muted/60 italic">
                                                                All tasks done! Enjoy the moment.
                                                            </div>
                                                        )}

                                                        {/* Completed Tasks (Collapsed) */}
                                                        {completedCount > 0 && (
                                                            <details className="group/details mt-6 border-t border-dashed border-border pt-4">
                                                                <summary className="cursor-pointer text-xs text-muted hover:text-foreground font-medium select-none flex items-center gap-2 mb-3">
                                                                    <span className="transform group-open/details:rotate-90 transition-transform">▶</span>
                                                                    Completed ({completedCount})
                                                                </summary>
                                                                <div className="space-y-2 pl-2">
                                                                    {allTasks.filter(t => isTaskEffectivelyComplete(t)).map(task => (
                                                                        <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg opacity-50 hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                onClick={() => handleCompleteTask(task.id, true, task.estimatedTotalMinutes)}
                                                                                className="w-4 h-4 rounded border-2 border-green-500 bg-green-500 text-white flex items-center justify-center"
                                                                                title="Mark incomplete"
                                                                            >
                                                                                <CheckIcon size={10} />
                                                                            </button>
                                                                            <span className="text-sm line-through text-muted">{task.content}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                }
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}