'use client';

import { useState, useEffect } from 'react';
import { getLocalDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { Idea } from '@/types';
import DailyLog from '@/components/Habits/DailyLog';
import MonthlyGrid from '@/components/Habits/MonthlyGrid';

// --- TaskItem Component (Calm Design) ---
const TaskItem = ({ task, ideaId, compact, onComplete, onToggleRepetitive, onDrop, onEdit }: {
    task: Task,
    ideaId: string,
    compact?: boolean,
    onComplete: () => void,
    onToggleRepetitive: () => void,
    onDrop: () => void,
    onEdit: (newContent: string) => void
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(task.content);

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

    // Focus input on edit
    // (Manual focus ref or simple autoFocus attribute works mostly)

    // Update local state if prop changes
    useEffect(() => {
        setEditContent(task.content);
    }, [task.content]);

    return (
        <div className={`flex items-start gap-3 p-3 rounded-xl border bg-white hover:shadow-sm transition-all group/task border-border`}>
            <button
                onClick={onComplete}
                className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 border-accent text-white hover:bg-accent/10 flex items-center justify-center transition-colors`}
                title="Mark done"
            >
                {/* Empty circle */}
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
                                <p className={`text-foreground font-medium break-words whitespace-normal`}>
                                    {task.content}
                                </p>
                                {task.targetDate && (
                                    <span className="text-xs text-muted flex-shrink-0 mt-1">
                                        {new Date(task.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                                {task.isRepetitive && (
                                    <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 rounded flex-shrink-0 mt-1" title="Daily recurring">
                                        🔁
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity self-start">
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className="p-1.5 text-gray-400 hover:text-accent hover:bg-gray-50 rounded-lg transition-colors"
                            title="Edit text"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        <button
                            onClick={onToggleRepetitive}
                            className={`p-1.5 rounded-lg transition-colors ${task.isRepetitive ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-500 hover:bg-gray-50'}`}
                            title={task.isRepetitive ? "Stop repeating" : "Make daily habit"}
                        >
                            <span className="text-xs">🔁</span>
                        </button>
                        <button
                            onClick={onDrop}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Drop task"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


interface Task {
    id: string;
    content: string;
    type: string;
    completed: boolean;
    isRepetitive: boolean; // NEW
    order: number;
    priority?: 'NOW' | 'SOON' | 'SOMEDAY';
    targetDate?: string;
}

interface IdeaWithTasks extends Idea {
    tasks?: Task[];
    rationale?: string;
}

export default function HomePage() {
    const router = useRouter();
    const [ideas, setIdeas] = useState<IdeaWithTasks[]>([]);
    const [newIdea, setNewIdea] = useState('');
    const [targetDate, setTargetDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [breakingDown, setBreakingDown] = useState(false);

    // Habit Tracker State
    const [view, setView] = useState<'GOALS' | 'HABITS'>('GOALS');

    const [today] = useState(getLocalDate());
    const [currentMonth] = useState(getLocalDate().substring(0, 7));


    const [skippedTaskIds, setSkippedTaskIds] = useState<Set<string>>(new Set());
    const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchIdeas();
    }, []);

    const toggleGoalCollapse = (ideaId: string) => {
        setCollapsedGoals(prev => {
            const next = new Set(prev);
            if (next.has(ideaId)) {
                next.delete(ideaId);
            } else {
                next.add(ideaId);
            }
            return next;
        });
    };

    const fetchIdeas = async () => {
        try {
            const res = await fetch('/api/ideas');
            if (!res.ok) {
                const text = await res.text();
                console.error('API error:', res.status, text);
                throw new Error(`Failed to fetch ideas: ${res.status}`);
            }
            const data = await res.json();
            setIdeas(data);

            // Auto collapse all initially to keep it calm
            const ids = new Set(data.map((i: any) => i.id));
            setCollapsedGoals(ids as Set<string>);
        } catch (error) {
            console.error('Error fetching ideas:', error);
            setIdeas([]);
        }
    };

    const handleAddIdea = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newIdea.trim()) return;

        setLoading(true);
        try {
            const res = await fetch('/api/ideas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newIdea,
                    // Defaults for Calm Mode
                    priority: 'MEDIUM',
                    targetDate: null
                }),
            });

            if (res.ok) {
                const idea = await res.json();
                setIdeas([idea, ...ideas]);
                setNewIdea('');
            }
        } catch (error) {
            console.error('Error adding idea:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBreakDownAll = async () => {
        setBreakingDown(true);
        try {
            for (const idea of ideas) {
                if (!idea.steps || idea.steps.length === 0) {
                    await processIdea(idea);
                }
            }
            await fetchIdeas();
        } catch (error) {
            console.error('Error breaking down ideas:', error);
        } finally {
            setBreakingDown(false);
        }
    };

    const processIdea = async (idea: Idea) => {
        try {
            const clarifyRes = await fetch('/api/ai/clarify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idea: idea.content }),
            });
            const { clarified } = await clarifyRes.json();

            await fetch(`/api/ideas/${idea.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clarifiedContent: clarified }),
            });

            const decomposeRes = await fetch('/api/ai/decompose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clarifiedIdea: clarified,
                    targetDate: idea.targetDate,
                }),
            });
            const { tasks } = await decomposeRes.json();

            await fetch('/api/steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ideaId: idea.id,
                    tasks,
                }),
            });
        } catch (error) {
            console.error('Error processing idea:', idea.id, error);
        }
    };

    const handleToggleRepetitive = async (ideaId: string, taskId: string, currentStatus: boolean) => {
        try {
            const newStatus = !currentStatus;
            await fetch(`/api/steps/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isRepetitive: newStatus }),
            });

            setIdeas(prevIdeas =>
                prevIdeas.map(idea => {
                    if (idea.steps) {
                        return {
                            ...idea,
                            steps: idea.steps.map(step =>
                                step.id === taskId ? { ...step, isRepetitive: newStatus } : step
                            ),
                        };
                    }
                    return idea;
                })
            );
        } catch (error) {
            console.error('Error toggling repetitive:', error);
        }
    };

    const handleCompleteTask = async (ideaId: string, taskId: string) => {
        try {
            // Optimistic update
            setIdeas(prevIdeas =>
                prevIdeas.map(idea => {
                    if (idea.id === ideaId && idea.steps) {
                        return {
                            ...idea,
                            steps: idea.steps.map(step =>
                                step.id === taskId
                                    ? { ...step, completed: true }
                                    : step
                            ),
                        };
                    }
                    return idea;
                })
            );

            await fetch(`/api/steps/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true }),
            });
        } catch (error) {
            console.error('Error completing task:', error);
            await fetchIdeas(); // Revert on error
        }
    };

    const handleUncompleteTask = async (ideaId: string, taskId: string) => {
        try {
            // Optimistic update
            setIdeas(prevIdeas =>
                prevIdeas.map(idea => {
                    if (idea.id === ideaId && idea.steps) {
                        return {
                            ...idea,
                            steps: idea.steps.map(step =>
                                step.id === taskId
                                    ? { ...step, completed: false }
                                    : step
                            ),
                        };
                    }
                    return idea;
                })
            );

            await fetch(`/api/steps/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: false }),
            });
        } catch (error) {
            console.error('Error uncompleting task:', error);
            await fetchIdeas();
        }
    };

    const handleToggleGoalRepetitive = async (ideaId: string) => {
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea || !idea.steps) return;

        const allRepetitive = idea.steps.every(s => s.isRepetitive);
        const newStatus = !allRepetitive;

        // Optimistic
        setIdeas(prevIdeas =>
            prevIdeas.map(i => {
                if (i.id === ideaId && i.steps) {
                    return {
                        ...i,
                        steps: i.steps.map(s => ({ ...s, isRepetitive: newStatus }))
                    };
                }
                return i;
            })
        );

        // API calls (parallel)
        try {
            await Promise.all(
                idea.steps.map(s =>
                    fetch(`/api/steps/${s.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isRepetitive: newStatus })
                    })
                )
            );
        } catch (e) {
            console.error("Error toggling goal repetitive", e);
        }
    };

    const handleDropTask = async (ideaId: string, taskId: string, taskContent: string) => {
        if (!confirm(`Drop "${taskContent}"? This is okay.`)) {
            return;
        }

        try {
            await fetch(`/api/steps/${taskId}`, {
                method: 'DELETE',
            });

            setIdeas(prevIdeas =>
                prevIdeas.map(idea => {
                    if (idea.id === ideaId && idea.steps) {
                        return {
                            ...idea,
                            steps: idea.steps.filter(step => step.id !== taskId),
                        };
                    }
                    return idea;
                })
            );
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    const handleEditTask = async (ideaId: string, taskId: string, newContent: string) => {
        try {
            // Optimistic
            setIdeas(prevIdeas =>
                prevIdeas.map(idea => {
                    if (idea.id === ideaId && idea.steps) {
                        return {
                            ...idea,
                            steps: idea.steps.map(step =>
                                step.id === taskId ? { ...step, content: newContent } : step
                            ),
                        };
                    }
                    return idea;
                })
            );

            await fetch(`/api/steps/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent }),
            });
        } catch (error) {
            console.error('Error editing task:', error);
            await fetchIdeas();
        }
    };

    const handleDeleteIdea = async (ideaId: string, ideaContent: string) => {
        if (!confirm(`Delete "${ideaContent}" and all its tasks?`)) {
            return;
        }

        try {
            await fetch(`/api/ideas/${ideaId}`, {
                method: 'DELETE',
            });
            setIdeas(prevIdeas => prevIdeas.filter(idea => idea.id !== ideaId));
        } catch (error) {
            console.error('Error deleting idea:', error);
        }
    };

    // Helper: Get the single focus task for Collapsed View
    const getHeaderTask = (tasks: Task[]) => {
        const incomplete = tasks.filter(t => !t.completed && !skippedTaskIds.has(t.id));
        if (incomplete.length === 0) return null;

        // 1. Highest Priority (NOW)
        const nowTasks = incomplete.filter(t => t.priority === 'NOW');
        if (nowTasks.length > 0) return nowTasks[0]; // Top NOW task

        // 2. Fallback to SOON
        const soonTasks = incomplete.filter(t => t.priority === 'SOON');
        if (soonTasks.length > 0) return soonTasks[0];

        // 3. Fallback to anything left
        return incomplete[0];
    };

    const hasUnprocessedIdeas = ideas.some(idea => !idea.steps || idea.steps.length === 0);

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
                    {/* Idea Input Form */}
                    <form onSubmit={handleAddIdea} className="mb-12 max-w-2xl mx-auto">
                        <div className="relative group">
                            <textarea
                                value={newIdea}
                                onChange={(e) => setNewIdea(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddIdea(e);
                                    }
                                }}
                                placeholder="What's on your mind? (e.g., 'I want to write a book' or 'Get fit')"
                                className="w-full px-6 py-4 pr-32 text-lg bg-white border-2 border-border/60 hover:border-accent/40 focus:border-accent rounded-2xl focus:outline-none resize-none shadow-sm transition-all placeholder:text-muted/60"
                                rows={1}
                                style={{ minHeight: '64px' }}
                            />
                            <div className="absolute right-2 top-2 bottom-2 flex items-center">
                                <button
                                    type="submit"
                                    disabled={loading || !newIdea.trim()}
                                    className="h-full px-6 bg-foreground text-white rounded-xl disabled:opacity-30 disabled:cursor-not-allowed font-medium transition-all flex items-center justify-center"
                                >
                                    {loading ? (
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <span>Add Goal ✨</span>
                                    )}
                                </button>
                            </div>
                        </div>
                        <p className="text-center text-xs text-muted mt-3">
                            Just type your goal. I'll break it down for you.
                        </p>
                    </form>

                    {/* Break Down All Button */}
                    {hasUnprocessedIdeas && ideas.length > 0 && (
                        <div className="mb-8 text-center animate-fadeIn">
                            <button
                                onClick={handleBreakDownAll}
                                disabled={breakingDown}
                                className="px-8 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 font-medium text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                            >
                                {breakingDown ? '🤖 AI Breaking Down Goals...' : '✨ Break Down Goals into Tasks'}
                            </button>
                            <p className="text-sm text-muted mt-2">
                                AI will create smart daily tasks for each goal
                            </p>
                        </div>
                    )}

                    {/* Ideas & Tasks List */}
                    <div className="space-y-6">
                        {ideas.length === 0 ? (
                            <div className="text-center py-12 text-muted border-2 border-dashed border-border rounded-2xl">
                                <p className="text-lg">No goals yet. Start by adding one above! ✨</p>
                            </div>
                        ) : (
                            <>
                                {/* Active Ideas List */}
                                {ideas
                                    .filter(idea =>
                                        !idea.steps ||
                                        idea.steps.length === 0 ||
                                        idea.steps.some(s => !s.completed)
                                    )
                                    .map((idea) => {
                                        const allTasks = idea.steps ? (idea.steps as Task[]) : [];
                                        const isGoalCollapsed = collapsedGoals.has(idea.id);
                                        const isGoalRepetitive = allTasks.length > 0 && allTasks.every(t => t.isRepetitive);

                                        const headerTask = getHeaderTask(allTasks);
                                        const completedCount = allTasks.filter(t => t.completed).length;

                                        return (
                                            <div
                                                key={idea.id}
                                                className="bg-white border-2 border-border rounded-2xl overflow-hidden hover:shadow-md transition-shadow group mb-6"
                                            >
                                                {/* Idea Header (Always Visible) */}
                                                <div
                                                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                                                    onClick={() => toggleGoalCollapse(idea.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <h2 className="text-2xl font-light text-foreground">
                                                                    {idea.content}
                                                                </h2>
                                                                {isGoalRepetitive && (
                                                                    <span className="text-indigo-500 bg-indigo-50 px-2 py-1 rounded text-xs" title="Daily Goal">
                                                                        🔁
                                                                    </span>
                                                                )}
                                                                <button
                                                                    className="text-muted hover:text-accent p-1 transition-transform duration-200"
                                                                    style={{ transform: isGoalCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                                                >
                                                                    ▼
                                                                </button>
                                                            </div>

                                                            {/* Collapsed Summary: Show Header Task if exists */}
                                                            {isGoalCollapsed && headerTask ? (
                                                                <div className="mt-2 flex items-center gap-3 animate-fadeIn">
                                                                    <div className="flex-1 bg-accent/5 border border-accent/20 rounded-lg p-3 flex items-center justify-between gap-4">
                                                                        <span className="text-foreground font-medium truncate">{headerTask.content}</span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleCompleteTask(idea.id, headerTask.id);
                                                                            }}
                                                                            className="px-3 py-1 bg-accent/10 hover:bg-accent text-accent hover:text-white rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
                                                                        >
                                                                            Done
                                                                        </button>
                                                                    </div>
                                                                    {completedCount > 0 && (
                                                                        <span className="text-xs text-muted whitespace-nowrap">
                                                                            {completedCount} done
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : isGoalCollapsed ? (
                                                                <p className="text-sm text-muted">No pending tasks.</p>
                                                            ) : null}
                                                        </div>

                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleGoalRepetitive(idea.id);
                                                                }}
                                                                className={`p-2 rounded transition-colors ${isGoalRepetitive ? 'text-indigo-600 bg-indigo-50' : 'text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                                                title="Make all tasks daily habits"
                                                            >
                                                                🔁
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteIdea(idea.id, idea.content);
                                                                }}
                                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded transition-colors text-sm font-medium"
                                                                title="Delete goal"
                                                            >
                                                                Drop
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Content: Tasks */}
                                                {!isGoalCollapsed && (
                                                    <div className="p-6 pt-0 animate-slideDown space-y-4">

                                                        {/* Incomplete Tasks (Flat List) */}
                                                        <div className="space-y-3">
                                                            {allTasks.filter(t => !t.completed).map(task => (
                                                                <TaskItem
                                                                    key={task.id}
                                                                    task={task}
                                                                    ideaId={idea.id}
                                                                    onComplete={() => handleCompleteTask(idea.id, task.id)}
                                                                    onToggleRepetitive={() => handleToggleRepetitive(idea.id, task.id, task.isRepetitive)}
                                                                    onDrop={() => handleDropTask(idea.id, task.id, task.content)}
                                                                    onEdit={(newContent) => handleEditTask(idea.id, task.id, newContent)}
                                                                />
                                                            ))}
                                                        </div>

                                                        {/* Incomplete Placeholder */}
                                                        {allTasks.filter(t => !t.completed).length === 0 && allTasks.length > 0 && (
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
                                                                    {allTasks.filter(t => t.completed).map(task => (
                                                                        <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg opacity-50 hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                onClick={() => handleUncompleteTask(idea.id, task.id)}
                                                                                className="w-4 h-4 rounded border-2 border-green-500 bg-green-500 text-white flex items-center justify-center"
                                                                                title="Mark incomplete"
                                                                            >
                                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
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

                                {/* Done For Today (Recurring) */}
                                {ideas.filter(i => {
                                    const all = i.steps || [];
                                    return all.length > 0 && all.every(t => t.completed) && all.every(t => t.isRepetitive);
                                }).length > 0 && (
                                        <div className="mt-12 pt-8 border-t border-border/50">
                                            <h3 className="text-center text-muted font-normal uppercase tracking-widest text-sm mb-6">✅ Done for Today</h3>
                                            <div className="opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                                                {ideas.filter(i => {
                                                    const all = i.steps || [];
                                                    return all.length > 0 && all.every(t => t.completed) && all.every(t => t.isRepetitive);
                                                }).map(idea => (
                                                    <div key={idea.id} className="bg-gray-50 border border-border/50 rounded-xl p-4 mb-4 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-indigo-300">🔁</span>
                                                            <span className="text-muted line-through decoration-muted/50">{idea.content}</span>
                                                        </div>
                                                        <span className="text-xs text-muted/50 font-medium">Resetting tomorrow</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}