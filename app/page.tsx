'use client';

import { useState, useEffect } from 'react';
import { getLocalDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { Idea } from '@/types';
import DailyLog from '@/components/Habits/DailyLog';
import MonthlyGrid from '@/components/Habits/MonthlyGrid';

// --- TaskItem Component (Calm Design) ---
const TaskItem = ({ task, ideaId, compact, onComplete, onUpdatePriority }: {
    task: Task,
    ideaId: string,
    compact?: boolean,
    onComplete: () => void,
    onUpdatePriority: (p: 'NOW' | 'SOON' | 'SOMEDAY') => void
}) => {
    return (
        <div className={`flex items-start gap-3 p-3 rounded-xl border bg-white hover:shadow-sm transition-all group/task ${compact ? 'border-transparent bg-transparent hover:bg-white hover:border-border' : 'border-border'}`}>
            <button
                onClick={onComplete}
                className={`mt-1 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${compact ? 'border-gray-300' : 'border-accent text-white hover:bg-accent/10'}`}
                title="Mark done"
            >
                {/* Empty circle/square */}
            </button>

            <div className="flex-1 min-w-0">
                <p className={`text-foreground ${compact ? 'text-sm text-muted line-clamp-1' : 'font-medium'}`}>
                    {task.content}
                </p>

                {/* Meta Row: Date & Priority Switcher */}
                {!compact && (
                    <div className="flex items-center gap-3 mt-2 opacity-0 group-hover/task:opacity-100 transition-opacity">
                        {/* Soft Date Display */}
                        {task.targetDate && (
                            <span className="text-xs text-muted flex items-center gap-1">
                                ⏳ {new Date(task.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                        )}

                        {/* Priority Switcher */}
                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                            {(['NOW', 'SOON', 'SOMEDAY'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => onUpdatePriority(p)}
                                    className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${task.priority === p ? 'bg-white shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
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
    const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
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
                    priority,
                    targetDate: targetDate || null,
                }),
            });

            if (res.ok) {
                setNewIdea('');
                setPriority('MEDIUM');
                setTargetDate('');
                await fetchIdeas();
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

    const handleUpdatePriority = async (ideaId: string, taskId: string, newPriority: 'NOW' | 'SOON' | 'SOMEDAY') => {
        // Limit Check for NOW
        if (newPriority === 'NOW') {
            let currentNowCount = 0;
            ideas.forEach(i => {
                if (i.steps) {
                    i.steps.forEach((s: any) => {
                        if (s.priority === 'NOW' && !s.completed && s.id !== taskId) currentNowCount++;
                    });
                }
            });

            if (currentNowCount >= 3) {
                alert("Gentle pause: You already have 3 items in NOW.\n\nTry moving one to SOON first. We keep it small to keep it doable.");
                return;
            }
        }

        try {
            await fetch(`/api/steps/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priority: newPriority }),
            });

            setIdeas(prevIdeas =>
                prevIdeas.map(idea => {
                    if (idea.steps) {
                        return {
                            ...idea,
                            steps: idea.steps.map(step =>
                                step.id === taskId ? { ...step, priority: newPriority } : step
                            ),
                        };
                    }
                    return idea;
                })
            );
        } catch (error) {
            console.error('Error updating priority:', error);
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

    const handleNotToday = (taskId: string) => {
        setSkippedTaskIds(prev => new Set(prev).add(taskId));
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

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'HIGH': return 'bg-red-50 text-red-700 border-red-100';
            case 'LOW': return 'bg-blue-50 text-blue-700 border-blue-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    // Helper to find the best next tasks (up to 2)
    const getNextTasks = (tasks: Task[]) => {
        const incomplete = tasks.filter(t => !t.completed);
        if (incomplete.length === 0) return [];

        // Filter out skipped tasks for this session
        const available = incomplete.filter(t => !skippedTaskIds.has(t.id));

        // If all tasks are skipped, return the first ones from incomplete
        if (available.length === 0) {
            return incomplete.sort((a, b) => a.order - b.order).slice(0, 2);
        }

        // Return up to 2 available tasks
        return available.sort((a, b) => a.order - b.order).slice(0, 2);
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
                        {/* Manage Habits button removed */}
                    </div>

                    <DailyLog date={today} />

                    <div className="pt-8 border-t border-dashed border-border">
                        <h3 className="text-lg font-normal mb-6 text-muted">This Month</h3>
                        <MonthlyGrid currentMonth={currentMonth} />
                    </div>


                </div>
            )}

            {/* GOALS VIEW (Original Content) */}
            {view === 'GOALS' && (
                <>
                    {/* Idea Input Form */}
                    <form onSubmit={handleAddIdea} className="mb-8 space-y-4">
                        <div>
                            <textarea
                                value={newIdea}
                                onChange={(e) => setNewIdea(e.target.value)}
                                placeholder="Got an idea or goal? Jot it down… (e.g., 'I want to build 6 packs')"
                                className="w-full px-6 py-4 text-lg bg-white border-2 border-border rounded-2xl focus:border-accent focus:outline-none resize-none shadow-sm hover:shadow-md transition-shadow"
                                rows={2}
                                suppressHydrationWarning
                            />
                        </div>

                        <div className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="block text-sm text-muted mb-2">
                                    Priority
                                </label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as any)}
                                    className="w-full px-4 py-2 bg-white border-2 border-border rounded-xl focus:border-accent focus:outline-none"
                                    suppressHydrationWarning
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                </select>
                            </div>

                            <div className="flex-1 w-full">
                                <label className="block text-sm text-muted mb-2">
                                    Target Date (optional)
                                </label>
                                <input
                                    type="date"
                                    value={targetDate}
                                    onChange={(e) => setTargetDate(e.target.value)}
                                    className="w-full px-4 py-2 bg-white border-2 border-border rounded-xl focus:border-accent focus:outline-none"
                                    suppressHydrationWarning
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !newIdea.trim()}
                                className="w-full md:w-auto px-8 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
                            >
                                Add Goal
                            </button>
                        </div>
                    </form>

                    {/* Break Down All Button */}
                    {hasUnprocessedIdeas && ideas.length > 0 && (
                        <div className="mb-8 text-center animate-fadeIn">
                            <button
                                onClick={handleBreakDownAll}
                                disabled={breakingDown}
                                className="px-8 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 font-medium text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                            >
                                {breakingDown ? '🤖 AI Breaking Down Goals...' : '✨ Break Down All Goals into Tasks'}
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
                            ideas.map((idea) => {
                                const allTasks = idea.steps ? (idea.steps as Task[]) : [];
                                const isGoalCollapsed = collapsedGoals.has(idea.id);
                                const nextTasks = getNextTasks(allTasks);
                                const incompleteTasks = allTasks.filter(t => !t.completed);
                                const nextTaskIds = new Set(nextTasks.map(t => t.id));
                                const otherTasks = incompleteTasks.filter(t => !nextTaskIds.has(t.id));

                                return (
                                    <div
                                        key={idea.id}
                                        className="bg-white border-2 border-border rounded-2xl overflow-hidden hover:shadow-md transition-shadow group"
                                    >
                                        {/* Idea Header */}
                                        <div
                                            className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                                            onClick={() => toggleGoalCollapse(idea.id)}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h2 className="text-2xl font-light text-foreground">
                                                            {idea.content}
                                                        </h2>
                                                        <button
                                                            className="text-muted hover:text-accent p-1 transition-transform duration-200"
                                                            style={{ transform: isGoalCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                                        >
                                                            ▼
                                                        </button>
                                                    </div>

                                                    <div className="flex gap-2 items-center flex-wrap">
                                                        <span className={`text-xs px-3 py-1 rounded-full border ${getPriorityColor(idea.priority)}`}>
                                                            {idea.priority}
                                                        </span>
                                                        {idea.targetDate && (
                                                            <span className="text-xs text-muted">
                                                                📅 {new Date(idea.targetDate).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                        {/* REMOVED: Completion counts */}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteIdea(idea.id, idea.content);
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-sm"
                                                    title="Delete goal"
                                                >
                                                    ✕
                                                </button>
                                            </div>

                                            {!isGoalCollapsed && idea.clarifiedContent && (
                                                <p className="text-sm text-muted italic mt-3 border-t border-dashed pt-3">
                                                    "{idea.clarifiedContent}"
                                                </p>
                                            )}
                                        </div>

                                        {/* Collapsible Tasks Container */}
                                        {!isGoalCollapsed && (
                                            <div className="p-6 pt-0 animate-slideDown">

                                                {/* NEXT STEPS CARDS */}
                                                {nextTasks.length > 0 ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                                        {nextTasks.map((task, index) => (
                                                            <div key={task.id} className="bg-accent/5 border border-accent/20 rounded-xl p-5 flex flex-col h-full">
                                                                <p className="text-xs font-bold text-accent tracking-wider uppercase mb-2">
                                                                    {index === 0 ? 'Next Step' : 'Option B'}
                                                                </p>
                                                                <p className="text-xl font-medium text-foreground mb-4 flex-1">
                                                                    {task.content}
                                                                </p>

                                                                <div className="flex gap-2 flex-wrap">
                                                                    <button
                                                                        onClick={() => handleCompleteTask(idea.id, task.id)}
                                                                        className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium shadow-sm hover:shadow text-sm"
                                                                    >
                                                                        Do this now
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleNotToday(task.id)}
                                                                        className="px-3 py-2 text-muted hover:text-foreground transition-colors text-sm bg-white border border-border rounded-lg"
                                                                    >
                                                                        Skip
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    allTasks.length > 0 && incompleteTasks.length === 0 && (
                                                        <div className="p-4 bg-green-50 text-green-800 rounded-xl border border-green-100 mb-6 text-center">
                                                            <p>All steps complete! 🎉</p>
                                                        </div>
                                                    )
                                                )}

                                                {/* LATER SECTION */}
                                                {otherTasks.length > 0 && (
                                                    <details className="group/details text-sm">
                                                        <summary className="cursor-pointer text-muted hover:text-foreground font-medium mb-2 flex items-center gap-2 select-none">
                                                            <span className="transform group-open/details:rotate-90 transition-transform">▶</span>
                                                            Later ({otherTasks.length})
                                                        </summary>
                                                        <div className="pl-4 space-y-2 border-l-2 border-border/50 my-2">
                                                            {otherTasks.map(task => (
                                                                <div key={task.id} className="flex justify-between items-start group/item py-1">
                                                                    <span className="text-muted-foreground">{task.content}</span>

                                                                    <div className="opacity-0 group-hover/item:opacity-100 flex gap-2">
                                                                        <button
                                                                            onClick={() => handleDropTask(idea.id, task.id, task.content)}
                                                                            className="text-xs text-red-400 hover:text-red-600 px-2 leading-tight"
                                                                            title="Drop this step"
                                                                        >
                                                                            Drop
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}

                                                {allTasks.length === 0 && (
                                                    <div className="text-center py-6 text-muted border-2 border-dashed border-border rounded-xl">
                                                        <p className="text-sm">Ready to break this down?</p>
                                                        <p className="text-xs mt-1">Click the magic button above!</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </>
            )}
        </div>
    );
}