'use client';

import { useState, useEffect } from 'react';
import { dailyMomentsDB, tasksDB, taskProgressDB } from '@/lib/db';
import type { Task, TaskProgress } from '@/lib/schema';
import { getLocalDateString } from '@/lib/schema';

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
    const [habits, setHabits] = useState<Task[]>([]);
    const [dailyMoments, setDailyMoments] = useState<Record<string, string>>({}); // date -> moment
    const [habitLogs, setHabitLogs] = useState<Record<string, string>>({}); // "date-taskId" -> status
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [currentMonth]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch recurring tasks (Habits)
            const recurring = await tasksDB.getRecurring();
            setHabits(recurring);

            // 2. Fetch data for all days in month
            const days = getDaysInMonth(currentMonth);

            const momentsMap: Record<string, string> = {};
            const logsMap: Record<string, string> = {};

            // Fetch in parallel
            const promises = days.map(async (date) => {
                const [momentEntry, progressEntries] = await Promise.all([
                    dailyMomentsDB.getByDate(date),
                    taskProgressDB.getByDate(date)
                ]);

                if (momentEntry) {
                    momentsMap[date] = momentEntry.moment;
                }

                if (progressEntries) {
                    progressEntries.forEach(p => {
                        // If minutes > 0 -> DONE
                        if (p.minutesWorked > 0) {
                            logsMap[`${date}-${p.taskId}`] = 'DONE';
                        }
                    });
                }
            });

            await Promise.all(promises);

            setDailyMoments(momentsMap);
            setHabitLogs(logsMap);

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
    const getMoment = (date: string) => dailyMoments[date] || '';

    const getHabitStatus = (date: string, taskId: string) => {
        const status = habitLogs[`${date}-${taskId}`];
        if (status) return status;

        // Infer default status
        // If date is in future: PENDING
        // If date is past: NOT_DONE (or SKIPPED if we tracked it, but we don't for now)
        const dateObj = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // compare dates only
        // Correct date comparison (offset issues? use string comparison for local dates if possible)
        // Simple string compare YYYY-MM-DD works if ISO
        const todayStr = getLocalDateString();

        if (date > todayStr) return 'PENDING';
        if (date === todayStr) return 'PENDING'; // Or NOT_DONE if end of day? Keep pending for today.

        return 'NOT_DONE';
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
                            <th key={h.id} className="py-2 px-3 text-center font-normal w-12 bg-white" title={h.content}>
                                {h.content.slice(0, 8)}...
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-foreground">
                    {days.map(date => {
                        const dayNum = date.split('-')[2];
                        const dateObj = new Date(date);
                        const isToday = date === getLocalDateString();
                        const isFuture = date > getLocalDateString();

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
                                    if (status === 'PENDING') color = 'text-gray-300';

                                    return (
                                        <td key={h.id} className={`py-3 px-3 text-center ${color}`}>
                                            {STATE_ICONS[status as keyof typeof STATE_ICONS] || status}
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
                    No recurring habits yet.
                </div>
            )}
        </div>
    );
}
