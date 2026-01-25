'use client';

import { useState } from 'react';
import Link from 'next/link';
import HabitMatrix from '@/components/Habits/HabitMatrix';
import { getLocalDate } from '@/lib/schema';
import HabitManager from '@/components/Habits/HabitManager';

// Helper: Get start of week (Sunday) for a given date
const getWeekStart = (dateStr: string): string => {
    const date = new Date(dateStr);
    const day = date.getDay(); // 0 = Sunday
    const diff = day; // Days since Sunday
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - diff);
    return weekStart.toISOString().split('T')[0];
};

// Helper: Get week range (7 days from start)
const getWeekRange = (weekStart: string): { start: string; end: string } => {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
        start: weekStart,
        end: end.toISOString().split('T')[0]
    };
};

// Helper: Format week label
const getWeekLabel = (weekStart: string): string => {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();

    if (startMonth === endMonth) {
        return `${startMonth} ${startDay}-${endDay}`;
    } else {
        return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
};

export default function HabitsPage() {
    const today = getLocalDate();
    const [weekStart, setWeekStart] = useState(getWeekStart(today));
    const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
    const [showHabitManager, setShowHabitManager] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const changeWeek = (direction: number) => {
        const current = new Date(weekStart);
        current.setDate(current.getDate() + (direction * 7));
        setWeekStart(current.toISOString().split('T')[0]);
    };

    const goToToday = () => {
        setWeekStart(getWeekStart(today));
    };

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1);
        setShowHabitManager(false);
    };

    const weekRange = getWeekRange(weekStart);
    const currentMonth = new Date(weekStart).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <div className="flex-shrink-0 w-full max-w-[95%] mx-auto px-4 pt-8 pb-4">
                <header className="flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Week/Month Navigation */}
                    <div className="flex items-center gap-4">
                        {viewMode === 'week' ? (
                            <>
                                <button
                                    onClick={() => changeWeek(-1)}
                                    className="p-2 hover:bg-gray-100 rounded-full text-muted hover:text-foreground transition-colors"
                                    aria-label="Previous Week"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                                </button>

                                <div className="text-center min-w-[180px]">
                                    <h1 className="text-xl font-light text-foreground select-none">
                                        {getWeekLabel(weekStart)}
                                    </h1>
                                    <p className="text-xs text-muted mt-0.5">{currentMonth}</p>
                                </div>

                                <button
                                    onClick={() => changeWeek(1)}
                                    className="p-2 hover:bg-gray-100 rounded-full text-muted hover:text-foreground transition-colors"
                                    aria-label="Next Week"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                                </button>
                            </>
                        ) : (
                            <h1 className="text-xl font-light text-foreground">{currentMonth}</h1>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {viewMode === 'week' && weekStart !== getWeekStart(today) && (
                            <button
                                onClick={goToToday}
                                className="px-3 py-1.5 text-xs text-accent hover:bg-accent/10 rounded-lg transition-colors font-medium"
                            >
                                This Week
                            </button>
                        )}

                        <button
                            onClick={() => setViewMode(viewMode === 'week' ? 'month' : 'week')}
                            className="px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-gray-100 rounded-lg transition-colors font-medium"
                        >
                            {viewMode === 'week' ? 'Show Month' : 'Show Week'}
                        </button>

                        <button
                            onClick={() => setShowHabitManager(true)}
                            className="px-4 py-2 bg-white border border-border hover:border-accent hover:text-accent text-muted rounded-xl text-sm font-medium transition-colors shadow-sm"
                        >
                            Manage Habits
                        </button>
                    </div>
                </header>
            </div>

            <div className="flex-1 w-full max-w-[95%] mx-auto px-4 pb-8 overflow-hidden">
                <HabitMatrix
                    key={refreshKey}
                    viewMode={viewMode}
                    weekStart={viewMode === 'week' ? weekStart : undefined}
                />
            </div>

            {showHabitManager && (
                <HabitManager
                    onClose={() => setShowHabitManager(false)}
                    onUpdate={handleRefresh}
                />
            )}
        </div>
    );
}
