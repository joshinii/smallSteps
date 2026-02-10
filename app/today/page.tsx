'use client';

// SmallSteps Today Page - Calm Design
// Ultra-minimal focus view with invisible intelligence
// Philosophy: "Here's what matters today. That's all."

import { useState, useEffect } from 'react';
import { useDailyPlan, usePrefetchTomorrow } from '@/lib/hooks/useDailyPlan';
import { getLocalDateString } from '@/lib/utils';
import { habitsDB, habitLogsDB } from '@/lib/db';
import type { Goal, Slice, Habit, HabitLog } from '@/lib/schema';
import TodayWorkUnitCard from '@/components/TodayWorkUnitCard';
import { PlusIcon } from '@/components/icons';

export default function TodayPage() {
    // Invisible plan management
    const { slices, ready, completeWork, getOneMoreThing } = useDailyPlan();

    // Prefetch tomorrow in background
    usePrefetchTomorrow();

    const [habits, setHabits] = useState<Habit[]>([]);
    const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
    const [noMoreWork, setNoMoreWork] = useState(false);
    const [addingMore, setAddingMore] = useState(false);

    const today = getLocalDateString();

    // Load habits
    useEffect(() => {
        async function loadHabits() {
            const allHabits = await habitsDB.getAll();
            setHabits(allHabits);
            const logs = await habitLogsDB.getByDate(today);
            setHabitLogs(logs);
        }
        loadHabits();
    }, [today]);

    const handleOneMoreThing = async () => {
        setAddingMore(true);
        const newSlice = await getOneMoreThing();
        setAddingMore(false);
        if (!newSlice) {
            setNoMoreWork(true);
        }
    };

    // Group slices by goal
    const groupedSlices = slices.reduce((acc, slice) => {
        const goalId = slice.goal.id;
        if (!acc[goalId]) {
            acc[goalId] = { goal: slice.goal, slices: [] };
        }
        acc[goalId].slices.push(slice);
        return acc;
    }, {} as Record<string, { goal: Goal, slices: Slice[] }>);

    // Sort groups by... usually momentum, but slices are already likely sorted by priority
    // We can respect the order of the first slice in each group
    const sortedGroupKeys = Object.keys(groupedSlices).sort((a, b) => {
        const indexA = slices.findIndex(s => s.goal.id === a);
        const indexB = slices.findIndex(s => s.goal.id === b);
        return indexA - indexB;
    });

    if (!ready) {
        return (
            <div className="max-w-xl mx-auto px-6 py-16 animate-pulse">
                <div className="h-8 bg-slate-100 rounded w-24 mb-8"></div>
                <div className="space-y-4">
                    <div className="h-24 bg-slate-50 rounded-xl"></div>
                    <div className="h-24 bg-slate-50 rounded-xl"></div>
                </div>
            </div>
        );
    }

    const hasWork = slices.length > 0;
    const hasHabits = habits.length > 0;
    const allDone = !hasWork && (hasHabits || Object.keys(groupedSlices).length === 0);

    return (
        <div className="max-w-xl mx-auto px-6 py-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-light text-slate-800 tracking-tight">Today</h1>
                <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </header>

            {/* Work List */}
            {hasWork ? (
                <div className="space-y-10 mb-16">
                    {sortedGroupKeys.map(goalId => {
                        const group = groupedSlices[goalId];
                        return (
                            <div key={goalId} className="space-y-3">
                                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider pl-1">
                                    {group.goal.title}
                                </h2>
                                <div className="space-y-3">
                                    {group.slices.map(slice => (
                                        <TodayWorkUnitCard
                                            key={slice.workUnitId}
                                            slice={slice}
                                            onComplete={() => completeWork(slice)}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="py-12 text-center">
                    <p className="text-xl font-light text-slate-600 mb-2">All set for now.</p>
                    {noMoreWork ? (
                        <p className="text-sm text-slate-400">Rest is productive too.</p>
                    ) : (
                        <button
                            onClick={handleOneMoreThing}
                            disabled={addingMore}
                            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors text-sm font-medium disabled:opacity-50"
                        >
                            {addingMore ? (
                                <span className="animate-pulse">Finding next step...</span>
                            ) : (
                                <>
                                    <PlusIcon size={14} />
                                    <span>One more thing?</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
