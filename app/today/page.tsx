'use client';

// SmallSteps Today Page - Redesigned
// Ultra-clean focus view with minimal cognitive load
// Architecture: Slices (Work) + Habits (Action)

import { useState, useEffect, useCallback } from 'react';
import {
    generateDailyPlan,
    regenerateDailyPlan,
    completeSlice,
    skipSlice,
    addMoreSlices
} from '@/lib/planning-engine';
import type { DailyPlan, DayMode, Slice, Habit, HabitLog } from '@/lib/schema';
import { getLocalDateString, formatEffortDisplay } from '@/lib/utils';
import { habitsDB, habitLogsDB } from '@/lib/db';

export default function TodayPage() {
    const [plan, setPlan] = useState<DailyPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
    const [selectedMode, setSelectedMode] = useState<DayMode>('medium');
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const [completedSlices, setCompletedSlices] = useState<Slice[]>([]);

    const today = getLocalDateString();
    const displayDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });

    const loadData = useCallback(async () => {
        console.log('[DEBUG] loadData started, today:', today);
        setLoading(true);
        try {
            // 1. Load Daily Plan (Slices)
            const result = await generateDailyPlan(today);
            setPlan(result.plan);

            // 2. Load Habits (Separate System)
            const allHabits = await habitsDB.getAll();
            setHabits(allHabits);

            const logs = await habitLogsDB.getByDate(today);
            setHabitLogs(logs);

        } catch (error) {
            console.error('[DEBUG] Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    }, [today]);

    // Initial load
    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCompleteSlice = async (slice: Slice) => {
        // Optimistic update
        if (plan) {
            setPlan({
                ...plan,
                slices: plan.slices.filter(s => s.workUnitId !== slice.workUnitId)
            });
            setCompletedSlices([...completedSlices, slice]);
        }

        await completeSlice(slice);
        await loadData(); // Reload to sync state
    };

    const handleSkipSlice = async (slice: Slice) => {
        if (plan) {
            setPlan({
                ...plan,
                slices: plan.slices.filter(s => s.workUnitId !== slice.workUnitId)
            });
        }
        await skipSlice(slice);
    };

    const handleToggleHabit = async (habitId: string) => {
        await habitLogsDB.toggleCompletion(habitId, today);
        const logs = await habitLogsDB.getByDate(today);
        setHabitLogs(logs);
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
        if (!plan) return;
        setLoading(true);
        try {
            const result = await addMoreSlices(today, plan, 45); // Add ~45 mins
            setPlan(result);
        } catch (error) {
            console.error('Failed to pull more tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !plan) {
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

    const uncompletedSlices = plan?.slices || [];
    const focusSlices = uncompletedSlices.slice(0, 3);
    const queuedSlices = uncompletedSlices.slice(3);

    return (
        <div className="max-w-2xl mx-auto px-6 py-8 animate-fadeIn">
            {/* Header */}
            <header className="mb-10">
                <h1 className="text-2xl font-light text-foreground mb-1">{displayDate}</h1>
                <p className="text-sm text-muted">
                    {uncompletedSlices.length === 0
                        ? "You've done enough for today. Rest well."
                        : `Here is a ${plan?.mode || 'gentle'} plan for today`}
                </p>
            </header>

            {/* Adjust Plan Button */}
            {!showPresetModal && uncompletedSlices.length > 0 && (
                <button
                    onClick={() => setShowPresetModal(true)}
                    className="mb-6 text-sm text-muted hover:text-foreground transition-colors flex items-center gap-2"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Adjust mode
                </button>
            )}

            {/* Mode Selection Modal */}
            {showPresetModal && (
                <div className="mb-6 p-5 bg-gray-50 border border-gray-200 rounded-xl animate-fadeIn space-y-4">
                    <p className="text-sm text-foreground font-medium">Choose your day mode</p>
                    <div className="grid grid-cols-3 gap-3">
                        {(['light', 'medium', 'focus'] as DayMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setSelectedMode(mode)}
                                className={`p-4 rounded-lg border-2 text-left capitalize transition-all ${selectedMode === mode
                                        ? 'border-accent bg-accent/5'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                    }`}
                            >
                                <div className="text-base mb-1">{mode}</div>
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleRegenerateWithMode}
                            className="px-5 py-2.5 bg-foreground text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                        >
                            Regenerate
                        </button>
                        <button
                            onClick={() => setShowPresetModal(false)}
                            className="px-4 py-2 text-muted hover:text-foreground rounded-lg transition-colors text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* 1️⃣ TODAY'S FOCUS (Slices) */}
            {(focusSlices.length > 0 || queuedSlices.length > 0) && (
                <div className="mb-12">
                    <div className="mb-4">
                        <h2 className="text-lg font-medium text-foreground">Today's Focus</h2>
                        <p className="text-xs text-muted mt-1">Actions for today</p>
                    </div>

                    <div className="space-y-3">
                        {focusSlices.map((slice) => (
                            <SliceCard
                                key={slice.workUnitId}
                                slice={slice}
                                onComplete={() => handleCompleteSlice(slice)}
                                onSkip={() => handleSkipSlice(slice)}
                            />
                        ))}
                    </div>

                    {queuedSlices.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-xs text-muted mb-2">Up next</p>
                            <div className="space-y-2 opacity-60">
                                {queuedSlices.map((slice) => (
                                    <SliceCard
                                        key={slice.workUnitId}
                                        slice={slice}
                                        onComplete={() => handleCompleteSlice(slice)}
                                        onSkip={() => handleSkipSlice(slice)}
                                        compact
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* "I have time for more" */}
            {uncompletedSlices.length === 0 && !loading && (
                <div className="mb-8 p-5 bg-green-50 border border-green-200 rounded-xl text-center">
                    <p className="text-sm text-foreground mb-3">All scheduled actions complete!</p>
                    <button
                        onClick={handlePullMoreTasks}
                        className="px-5 py-2.5 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        I have time for more
                    </button>
                </div>
            )}

            {/* 2️⃣ DAILY HABITS (Separate System) */}
            {habits.length > 0 && (
                <div className="mb-12">
                    <div className="mb-3">
                        <h2 className="text-base font-medium text-foreground">Daily Habits</h2>
                        <p className="text-xs text-muted mt-1">Small consistencies</p>
                    </div>
                    <div className="space-y-2">
                        {habits.map((habit) => {
                            const isDone = habitLogs.some(l => l.habitId === habit.id && l.completed);
                            return (
                                <button
                                    key={habit.id}
                                    onClick={() => handleToggleHabit(habit.id)}
                                    className={`flex items-center gap-3 py-2 w-full text-left transition-all ${isDone ? 'opacity-50' : 'hover:bg-gray-50 rounded-lg -ml-2 px-2'
                                        }`}
                                >
                                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isDone ? 'bg-accent border-accent text-white' : 'border-gray-300'
                                        }`}>
                                        {isDone && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className={isDone ? 'line-through text-muted' : ''}>{habit.title}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Completed Slices History */}
            {completedSlices.length > 0 && (
                <div className="pt-8 border-t border-gray-100">
                    <button
                        onClick={() => setShowCompleted(!showCompleted)}
                        className="text-sm text-muted/60 hover:text-muted transition-colors flex items-center gap-2"
                    >
                        {completedSlices.length} completed actions
                    </button>
                    {showCompleted && (
                        <div className="mt-3 space-y-2">
                            {completedSlices.map((s, i) => (
                                <div key={i} className="text-sm text-muted flex justify-between">
                                    <span className="line-through opacity-70">{s.workUnit.title}</span>
                                    <span className="text-xs">{s.minutes}m</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {uncompletedSlices.length === 0 && habits.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
                    <p className="text-lg text-muted font-light">Your day is open.</p>
                    <p className="text-sm text-muted mt-2">Create a goal to get started.</p>
                </div>
            )}
        </div>
    );
}

// ============================================
// Slice Card Component
// ============================================

interface SliceCardProps {
    slice: Slice;
    onComplete: () => void;
    onSkip: () => void;
    compact?: boolean;
}

function SliceCard({ slice, onComplete, onSkip, compact }: SliceCardProps) {
    return (
        <div className={`bg-white border border-gray-200 rounded-xl transition-all ${compact ? 'p-3' : 'p-4'
            }`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className={`font-medium ${compact ? 'text-sm' : 'text-base'}`}>
                        {slice.workUnit.title}
                    </p>
                    <p className="text-xs text-muted mt-1">
                        {slice.label} · {slice.minutes} min · {slice.task.title}
                    </p>
                </div>
            </div>

            {!compact && (
                <div className="flex items-center gap-2 mt-3">
                    <button
                        onClick={onComplete}
                        className="px-4 py-1.5 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        Complete
                    </button>
                    <button
                        onClick={onSkip}
                        className="ml-auto px-3 py-1.5 text-muted/60 hover:text-muted rounded-lg transition-colors text-sm"
                    >
                        Defer
                    </button>
                </div>
            )}
        </div>
    );
}
