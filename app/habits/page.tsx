'use client';

import { useState } from 'react';
import Link from 'next/link';
import HabitMatrix from '@/components/Habits/HabitMatrix';
import { getLocalDate } from '@/lib/utils';
import HabitManager from '@/components/Habits/HabitManager';

export default function HabitsPage() {
    const [currentMonth] = useState(getLocalDate().substring(0, 7)); // YYYY-MM
    const [showHabitManager, setShowHabitManager] = useState(false);

    return (
        <div className="w-full max-w-[95%] mx-auto px-4 py-8 animate-fadeIn">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    {/* Back link */}
                    <Link href="/" className="mb-2 inline-block text-sm text-muted hover:text-accent transition-colors">
                        ← Back to Goals
                    </Link>
                    <h1 className="text-3xl font-light text-foreground">
                        Daily Habits
                    </h1>
                </div>
                <button
                    onClick={() => setShowHabitManager(true)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground rounded-xl text-sm font-medium transition-colors"
                >
                    Manage Habits
                </button>
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
