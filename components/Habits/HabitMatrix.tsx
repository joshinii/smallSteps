'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { getLocalDate } from '@/lib/utils';

interface MatrixItem {
    id: string;
    name: string;
    type: 'HABIT' | 'TASK';
}

interface MatrixGroup {
    id: string;
    title: string;
    items: MatrixItem[];
}

interface HabitMatrixProps {
    month: string; // YYYY-MM
}

export default function HabitMatrix({ month }: HabitMatrixProps) {
    const [groups, setGroups] = useState<MatrixGroup[]>([]);
    const [logs, setLogs] = useState<Record<string, any>>({}); // Key: "itemID-date", Value: status
    const [loading, setLoading] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const todayDate = getLocalDate();
    const currentDay = parseInt(todayDate.split('-')[2]);
    const isCurrentMonth = month === todayDate.substring(0, 7);

    const daysInMonth = new Date(
        parseInt(month.split('-')[0]),
        parseInt(month.split('-')[1]),
        0
    ).getDate();

    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        return d < 10 ? `0${d}` : `${d}`;
    });

    useEffect(() => {
        fetchData();
        // Scroll to today on initial load (if current month)
        if (isCurrentMonth) {
            scrollToToday();
        }
    }, [month]);

    const scrollToToday = () => {
        // Needs a slight delay for render
        setTimeout(() => {
            if (scrollContainerRef.current) {
                // Assuming col width ~45px.
                // We want today (column index `currentDay`) to be the FIRST visible column.
                // Header width (sticky left) is ~220px. 
                // So scrollLeft should be at position of Today - HeaderWidth.
                // Actually, sticky header doesn't affect scrollLeft position logic of the *container*
                // But visually it overlays.
                // It is simpler: Each day column is ~45px padded. 
                // scrollLeft = (currentDay - 1) * 45 (roughly). 
                // Let's use `element.offsetLeft` if possible, but simplest is math.
                // Or better: find ID.
                const todayEl = document.getElementById(`header-day-${currentDay}`);
                if (todayEl && scrollContainerRef.current) {
                    const offset = todayEl.offsetLeft;
                    // Provide some context or align to left edge (minus sticky header width which visually covers left)
                    // The sticky header is `left-0`. So scrolling 0 puts first col under it? No, sticky is overlay.
                    // Actually, sticky takes space in flow? No provided it is `sticky`.
                    // Sticky `th` takes space.
                    // So `offset` of a day will be relative to start of scrollable area.
                    // We simply scroll to that offset. But since left column is sticky, it will cover it if we scroll exactly there?
                    // No, sticky column stays. We want today to be to the right of sticky column.
                    // Sticky col width is ~220px. 
                    // So we want `todayEl` to be at `220px` visible position.
                    // Container Scroll Left = `todayEl.offsetLeft` - `220px` (sticky width).
                    scrollContainerRef.current.scrollTo({
                        left: offset - 220,
                        behavior: 'smooth'
                    });
                }
            }
        }, 500);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [habitsRes, ideasRes, habitLogsRes, taskLogsRes] = await Promise.all([
                fetch('/api/habits'),
                fetch('/api/ideas'),
                fetch(`/api/daily-logs?month=${month}`),
                fetch(`/api/task-completions?month=${month}`)
            ]);

            const habits = await habitsRes.json();
            const ideas = await ideasRes.json();
            const habitLogsData = await habitLogsRes.json();
            const taskLogsData = await taskLogsRes.json();

            // Build Groups
            const newGroups: MatrixGroup[] = [];

            // 1. Habits Group
            if (habits.length > 0) {
                newGroups.push({
                    id: 'habits-group',
                    title: 'Habits',
                    items: habits.map((h: any) => ({ id: h.id, name: h.name, type: 'HABIT' }))
                });
            }

            // 2. Goal Groups
            if (Array.isArray(ideas)) {
                ideas.forEach((idea: any) => {
                    const repetitiveSteps: MatrixItem[] = [];
                    if (idea.steps) {
                        idea.steps.forEach((step: any) => {
                            if (step.isRepetitive) {
                                repetitiveSteps.push({ id: step.id, name: step.content, type: 'TASK' });
                            }
                        });
                    }

                    if (repetitiveSteps.length > 0) {
                        newGroups.push({
                            id: idea.id,
                            title: idea.content, // Group by Goal Name
                            items: repetitiveSteps
                        });
                    }
                });
            }

            setGroups(newGroups);

            // Process Logs
            const newLogs: Record<string, any> = {};

            if (habitLogsData.habitLogs) {
                habitLogsData.habitLogs.forEach((l: any) => {
                    newLogs[`${l.habitId}-${l.date}`] = l.status; // DONE, NOT_DONE, SKIPPED
                });
            }

            if (Array.isArray(taskLogsData)) {
                taskLogsData.forEach((l: any) => {
                    newLogs[`${l.stepId}-${l.date}`] = l.completed ? 'DONE' : 'SKIPPED';
                });
            }

            setLogs(newLogs);
        } catch (error) {
            console.error('Error fetching matrix:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleCell = async (itemId: string, dateFull: string, type: 'HABIT' | 'TASK') => {
        const key = `${itemId}-${dateFull}`;
        const current = logs[key];

        let next: string | undefined = 'DONE';
        if (current === 'DONE') next = 'SKIPPED';
        else if (current === 'SKIPPED') next = undefined; // clear
        else if (!current) next = 'DONE';

        // Optimistic update
        const nextLogs = { ...logs };
        if (next) nextLogs[key] = next;
        else delete nextLogs[key];
        setLogs(nextLogs);

        try {
            if (type === 'HABIT') {
                await fetch('/api/daily-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: dateFull,
                        habits: { [itemId]: next || 'PENDING' }
                    }),
                });
            } else {
                // TASK - Using Boolean schema limitation for now
                if (next) {
                    await fetch('/api/task-completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            stepId: itemId,
                            date: dateFull,
                            completed: next === 'DONE' // True=Done, False=Skipped (record present)
                        }),
                    });
                } else {
                    await fetch(`/api/task-completions?stepId=${itemId}&date=${dateFull}`, {
                        method: 'DELETE'
                    });
                }
            }
        } catch (error) {
            console.error('Toggle failed', error);
        }
    };

    const toggleGroup = (groupId: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const getIcon = (status?: string) => {
        if (status === 'DONE') return '✓';
        if (status === 'SKIPPED') return '○';
        return '';
    };

    const getCellClass = (status?: string) => {
        if (status === 'DONE') return 'bg-green-100 text-green-700 font-bold';
        if (status === 'SKIPPED') return 'bg-gray-100 text-gray-400';
        return 'hover:bg-gray-50';
    };

    if (loading) return <div className="p-8 text-center text-muted animate-pulse">Loading matrix...</div>;

    return (
        <div
            className="overflow-x-auto border rounded-xl relative max-h-[75vh] bg-white shadow-sm scroll-smooth"
            ref={scrollContainerRef}
        >
            <table className="min-w-full text-sm border-collapse relative">
                <thead className="sticky top-0 z-20 bg-white shadow-sm">
                    <tr>
                        <th className="p-3 pl-4 text-left bg-white border-b border-r min-w-[220px] sticky left-0 z-30 font-medium text-muted">
                            Task / Habit
                        </th>
                        {days.map(d => {
                            const isToday = isCurrentMonth && parseInt(d) === currentDay;
                            return (
                                <th
                                    key={d}
                                    id={`header-day-${parseInt(d)}`}
                                    className={`p-2 min-w-[45px] border-b border-r last:border-r-0 text-center font-normal text-muted transition-colors ${isToday ? 'bg-accent/5 text-accent font-bold ring-1 ring-accent/20 ring-inset' : ''}`}
                                >
                                    {d}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {groups.map(group => (
                        <Fragment key={group.id}>
                            {/* Group Header Row */}
                            <tr
                                className="bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer group/header sticky left-0 z-10"
                                onClick={() => toggleGroup(group.id)}
                            >
                                <td className="p-2 pl-4 text-left border-r sticky left-0 bg-gray-50/80 group-hover/header:bg-gray-100 font-semibold text-foreground flex items-center justify-between min-w-[220px] border-b border-t">
                                    <span className="truncate pr-2">{group.title}</span>
                                    <span className="text-muted text-[10px] mr-1 transition-transform duration-200" style={{ transform: collapsedGroups.has(group.id) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                                        ▼
                                    </span>
                                </td>
                                {/* Filler for group row */}
                                <td colSpan={days.length} className="bg-gray-50/50 border-b border-t pointer-events-none"></td>
                            </tr>

                            {/* Group Items */}
                            {!collapsedGroups.has(group.id) && group.items.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50/30 transition-colors group/row">
                                    <td className="p-3 pl-8 text-left border-r font-normal text-muted sticky left-0 bg-white z-10 truncate max-w-[220px] group-hover/row:text-foreground transition-colors border-b">
                                        {item.name}
                                    </td>
                                    {days.map(d => {
                                        const dateFull = `${month}-${d}`;
                                        const status = logs[`${item.id}-${dateFull}`];
                                        const isToday = isCurrentMonth && parseInt(d) === currentDay;
                                        return (
                                            <td
                                                key={d}
                                                className={`border-r last:border-r-0 border-b p-0 text-center cursor-pointer transition-colors ${getCellClass(status)} ${isToday ? 'ring-1 ring-inset ring-accent/10' : ''}`}
                                                onClick={() => toggleCell(item.id, dateFull, item.type)}
                                            >
                                                <div className="w-full h-10 flex items-center justify-center select-none text-lg">
                                                    {getIcon(status)}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </Fragment>
                    ))}
                </tbody>
            </table>

            {groups.length === 0 && (
                <div className="p-12 text-center text-muted">
                    <p>No habits or repetitive tasks found.</p>
                    <p className="text-sm mt-2">Manage habits or add a goal to get started.</p>
                </div>
            )}
        </div>
    );
}
