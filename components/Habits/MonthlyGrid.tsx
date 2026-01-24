'use client';

import { useState, useEffect } from 'react';

const STATE_ICONS = {
    DONE: '✓',
    NOT_DONE: '✖',
    SKIPPED: '○',
    PENDING: '·'
};

interface MonthlyGridProps {
    currentMonth: string; // YYYY-MM
}

export default function MonthlyGrid({ currentMonth }: MonthlyGridProps) {
    const [habits, setHabits] = useState<any[]>([]);
    const [dailyLogs, setDailyLogs] = useState<any[]>([]);
    const [habitLogs, setHabitLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [currentMonth]);



    const fetchData = async () => {
        setLoading(true);
        try {
            const [habitsRes, logsRes] = await Promise.all([
                fetch('/api/habits'),
                fetch(`/api/daily-logs?month=${currentMonth}`)
            ]);

            const activeHabits = await habitsRes.json();
            const logsData = await logsRes.json();

            setHabits(activeHabits);
            setDailyLogs(logsData.dailyLogs);
            setHabitLogs(logsData.habitLogs);
        } catch (e) {
            console.error('Failed to load monthly grid', e);
        } finally {
            setLoading(false);
        }
    };

    // Generate days for the month
    const getDaysInMonth = (yearMonth: string) => {
        const [year, month] = yearMonth.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        const days = [];
        while (date.getMonth() === month - 1) {
            days.push(new Date(date).toISOString().split('T')[0]);
            date.setDate(date.getDate() + 1);
        }
        return days;
    };

    const days = getDaysInMonth(currentMonth);

    // Helpers to access data safely
    const getMoment = (date: string) => dailyLogs.find(l => l.date === date)?.moment || '';
    const getHabitStatus = (date: string, habitId: string) => {
        const log = habitLogs.find(l => l.date === date && l.habitId === habitId);
        return log ? log.status : 'PENDING';
    };

    if (loading) return <div className="py-12 text-center text-muted">Loading grid...</div>;

    return (
        <div className="overflow-x-auto overflow-y-auto max-h-[600px] pb-4 border rounded-xl relative">
            <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    <tr className="border-b border-border text-muted">
                        <th className="py-2 px-3 text-left font-normal w-12 bg-white">Date</th>
                        <th className="py-2 px-3 text-left font-normal max-w-[200px] bg-white">Small Moment</th>
                        {habits.map(h => (
                            <th key={h.id} className="py-2 px-3 text-center font-normal w-12 bg-white" title={h.name}>
                                {h.name.slice(0, 8)}...
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-foreground">
                    {days.map(date => {
                        const dayNum = date.split('-')[2];
                        const dateObj = new Date(date);
                        const isToday = date === new Date().toLocaleDateString('en-CA');
                        const isFuture = dateObj > new Date();

                        // Skip rendering future days completely or just dim them? 
                        // Let's render but dim.
                        const rowClass = isFuture ? 'opacity-30' : 'hover:bg-gray-50';
                        const todayClass = isToday ? 'bg-accent/5 ring-1 ring-accent/20' : '';

                        return (
                            <tr
                                key={date}
                                className={`border-b border-gray-100 transition-colors ${rowClass} ${todayClass}`}
                            >
                                <td className="py-3 px-3 text-muted">{dayNum}</td>
                                <td className="py-3 px-3 text-gray-600 truncate max-w-[200px]" title={getMoment(date)}>
                                    {getMoment(date)}
                                </td>
                                {habits.map(h => {
                                    const status = getHabitStatus(date, h.id);
                                    let color = 'text-gray-300';
                                    if (status === 'DONE') color = 'text-green-500 font-bold';
                                    if (status === 'NOT_DONE') color = 'text-red-300';
                                    if (status === 'SKIPPED') color = 'text-gray-400';

                                    return (
                                        <td key={h.id} className={`py-3 px-3 text-center ${color}`}>
                                            {STATE_ICONS[status as keyof typeof STATE_ICONS]}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {habits.length === 0 && (
                <div className="text-center py-6 text-muted text-sm italic">
                    No habits set up yet. Use "Manage Habits" to start tracking.
                </div>
            )}
        </div>
    );
}
