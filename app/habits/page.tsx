'use client';

import { useState } from 'react';
import Link from 'next/link';
import HabitMatrix from '@/components/Habits/HabitMatrix';
import { getLocalDate } from '@/lib/utils';
import HabitManager from '@/components/Habits/HabitManager';

export default function HabitsPage() {
    const [currentMonth, setCurrentMonth] = useState(getLocalDate().substring(0, 7)); // YYYY-MM
    const [showHabitManager, setShowHabitManager] = useState(false);

    const changeMonth = (increment: number) => {
        const [year, month] = currentMonth.split('-').map(Number);
        const date = new Date(year, month - 1 + increment, 1);
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        setCurrentMonth(`${y}-${m < 10 ? '0' + m : m}`);
    };

    const getMonthLabel = (isoMonth: string) => {
        const [year, month] = isoMonth.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    return (
        <div className="w-full max-w-[95%] mx-auto px-4 py-8 animate-fadeIn">
            <header className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4 relative">

                {/* Centered Month Navigation */}
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => changeMonth(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full text-muted hover:text-foreground transition-colors"
                        aria-label="Previous Month"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>

                    <h1 className="text-2xl font-light text-foreground min-w-[200px] text-center select-none">
                        {getMonthLabel(currentMonth)}
                    </h1>

                    <button
                        onClick={() => changeMonth(1)}
                        className="p-2 hover:bg-gray-100 rounded-full text-muted hover:text-foreground transition-colors"
                        aria-label="Next Month"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                </div>

                <div className="md:absolute md:right-0">
                    <button
                        onClick={() => setShowHabitManager(true)}
                        className="px-4 py-2 bg-white border border-border hover:border-accent hover:text-accent text-muted rounded-xl text-sm font-medium transition-colors shadow-sm"
                    >
                        Manage Habits
                    </button>
                </div>
            </header>

            <HabitMatrix month={currentMonth} />

            {showHabitManager && (
                <HabitManager
                    onClose={() => setShowHabitManager(false)}
                    onUpdate={() => {
                        setShowHabitManager(false);
                        // Force refresh? The matrix fetches on mount/update of month. 
                        // We might need a refresh trigger but usually managing habits just adds rows which will appear on re-fetch.
                        // Setting state key or similar can force re-render.
                        // Ideally pass a refresh signal to Matrix.
                        window.location.reload(); // Brute force simple refresh for now or use context
                    }}
                />
            )}
        </div>
    );
}
