'use client';

// SmallSteps Today Page - Calm Design
// Ultra-minimal focus view with invisible intelligence
// Philosophy: "Here's what matters today. That's all."

import { useState, useEffect } from 'react';
import { useDailyPlan, usePrefetchTomorrow } from '@/lib/hooks/useDailyPlan';
import type { Slice, Habit, HabitLog } from '@/lib/schema';
import { getLocalDateString } from '@/lib/utils';
import { habitsDB, habitLogsDB } from '@/lib/db';

export default function TodayPage() {
    // Invisible plan management - caching, silent updates, auto-regeneration
    const { slices, ready, completeWork, skipWork, getOneMoreThing } = useDailyPlan();

    // Prefetch tomorrow's plan in background (30s after load)
    usePrefetchTomorrow();

    const [habits, setHabits] = useState<Habit[]>([]);
    const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
    const [noMoreWork, setNoMoreWork] = useState(false);
    const [addingMore, setAddingMore] = useState(false);

    const today = getLocalDateString();

    // Load habits (separate system)
    useEffect(() => {
        async function loadHabits() {
            const allHabits = await habitsDB.getAll();
            setHabits(allHabits);

            const logs = await habitLogsDB.getByDate(today);
            setHabitLogs(logs);
        }
        loadHabits();
    }, [today]);

    const handleToggleHabit = async (habitId: string) => {
        await habitLogsDB.toggleCompletion(habitId, today);
        const logs = await habitLogsDB.getByDate(today);
        setHabitLogs(logs);
    };

    // Gentle "one more thing" handler
    const handleOneMoreThing = async () => {
        setAddingMore(true);
        const newSlice = await getOneMoreThing();
        setAddingMore(false);

        if (!newSlice) {
            setNoMoreWork(true);
        }
    };

    // Loading state - calm skeleton (but avoid spinners per philosophy)
    if (!ready) {
        return (
            <div className="max-w-xl mx-auto px-6 py-16">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-slate-100 rounded w-24"></div>
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-20 bg-slate-50 rounded-2xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const hasWork = slices.length > 0;
    const hasHabits = habits.length > 0;
    const isEmpty = !hasWork && !hasHabits;

    return (
        <div className="max-w-xl mx-auto px-6 py-12">
            {/* Simple Header - Just "Today" */}
            <header className="mb-10">
                <h1 className="text-2xl font-light text-foreground">Today</h1>
            </header>

            {/* Work Items - Calm, breathable list */}
            {hasWork && (
                <div className="space-y-4 mb-12">
                    {slices.map((slice) => (
                        <WorkCard
                            key={slice.workUnitId}
                            slice={slice}
                            onComplete={() => completeWork(slice)}
                            onSkip={() => skipWork(slice)}
                        />
                    ))}
                </div>
            )}

            {/* All done state - Gentle completion with optional continuation */}
            {!hasWork && (hasHabits || !isEmpty) && (
                <div className="mb-12 py-10 text-center">
                    <p className="text-foreground font-light text-lg">
                        All done for today
                    </p>
                    <p className="text-muted text-sm mt-1">
                        {noMoreWork ? "That's all for now. Great work." : "Well done."}
                    </p>

                    {/* Optional, subtle invitation - only if more work available */}
                    {!noMoreWork && (
                        <button
                            onClick={handleOneMoreThing}
                            disabled={addingMore}
                            className="mt-6 text-sm text-muted/70 hover:text-muted transition-colors disabled:opacity-50"
                        >
                            {addingMore ? '...' : 'One more thing?'}
                        </button>
                    )}
                </div>
            )}

            {/* Daily Habits - Subtle section */}
            {hasHabits && (
                <div className="pt-8 border-t border-slate-100">
                    <h2 className="text-sm font-medium text-muted mb-4">Habits</h2>
                    <div className="space-y-3">
                        {habits.map((habit) => {
                            const isDone = habitLogs.some(l => l.habitId === habit.id && l.completed);
                            return (
                                <button
                                    key={habit.id}
                                    onClick={() => handleToggleHabit(habit.id)}
                                    className={`flex items-center gap-3 w-full text-left py-2 px-3 -mx-3 rounded-lg transition-colors ${isDone ? 'opacity-50' : 'hover:bg-slate-50'
                                        }`}
                                >
                                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isDone
                                        ? 'bg-slate-400 border-slate-400 text-white'
                                        : 'border-slate-300'
                                        }`}>
                                        {isDone && (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className={isDone ? 'line-through text-muted' : 'text-foreground'}>
                                        {habit.title}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty State - Calm, encouraging */}
            {isEmpty && (
                <div className="py-16 text-center">
                    <p className="text-lg text-muted font-light">Your day is open.</p>
                    <p className="text-sm text-muted/70 mt-2">Create a goal to get started.</p>
                </div>
            )}
        </div>
    );
}

// ============================================
// Work Card - Minimal, calm presentation
// ============================================

interface WorkCardProps {
    slice: Slice;
    onComplete: () => void;
    onSkip: () => void;
}

function WorkCard({ slice, onComplete, onSkip }: WorkCardProps) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 transition-all hover:border-slate-300">
            {/* Title */}
            <p className="font-medium text-foreground leading-snug">
                {slice.workUnit.title}
            </p>

            {/* Goal context - Subtle */}
            <p className="text-xs text-muted mt-1.5">
                {slice.goal.title}
            </p>

            {/* First action - Reduce activation energy */}
            {slice.workUnit.firstAction && (
                <p className="text-sm text-slate-600 mt-4 flex items-start gap-2">
                    <span className="text-slate-400 flex-shrink-0">→</span>
                    <span>{slice.workUnit.firstAction}</span>
                </p>
            )}

            {/* Simple actions */}
            <div className="flex items-center gap-3 mt-5">
                <button
                    onClick={onComplete}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Done
                </button>
                <button
                    onClick={onSkip}
                    className="px-3 py-2 text-muted hover:text-foreground transition-colors text-sm"
                >
                    Not today
                </button>
            </div>
        </div>
    );
}
