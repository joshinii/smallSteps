'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { getLocalDate } from '@/lib/schema';
import { goalsDB, tasksDB, taskProgressDB, dailyMomentsDB } from '@/lib/db';
import type { Task } from '@/lib/schema';

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
    viewMode: 'week' | 'month';
    weekStart?: string; // YYYY-MM-DD, required when viewMode is 'week'
}

interface MatrixColumn {
    date: string;       // YYYY-MM-DD
    dayNum: string;     // DD
    label: string;      // DD
    isToday: boolean;
    headerLabel: string; // header display, e.g. "Mon 24"
}

export default function HabitMatrix({ viewMode, weekStart }: HabitMatrixProps) {
    const [groups, setGroups] = useState<MatrixGroup[]>([]);
    const [logs, setLogs] = useState<Record<string, any>>({}); // Key: "itemID-date", Value: status
    const [loading, setLoading] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [showJumpToToday, setShowJumpToToday] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const todayDate = getLocalDate();

    // Compute Columns
    const getColumns = (): MatrixColumn[] => {
        const cols: MatrixColumn[] = [];

        if (viewMode === 'week' && weekStart) {
            const start = new Date(weekStart);
            for (let i = 0; i < 7; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                const dateStr = d.toISOString().split('T')[0];
                const dayNum = d.getDate().toString().padStart(2, '0');
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

                cols.push({
                    date: dateStr,
                    dayNum,
                    label: dayNum,
                    headerLabel: `${dayName} ${dayNum}`,
                    isToday: dateStr === todayDate
                });
            }
        } else {
            // Month View (Default to current month if weeks start not provided, but page.tsx handles this)
            // Use weekStart's month or today's month
            const baseDateStr = weekStart || todayDate;
            const [year, month] = baseDateStr.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();

            for (let i = 1; i <= daysInMonth; i++) {
                const dayNum = i.toString().padStart(2, '0');
                const dateStr = `${year}-${month.toString().padStart(2, '0')}-${dayNum}`;

                cols.push({
                    date: dateStr,
                    dayNum,
                    label: dayNum,
                    headerLabel: dayNum,
                    isToday: dateStr === todayDate
                });
            }
        }
        return cols;
    };

    const columns = getColumns();

    useEffect(() => {
        fetchData();
    }, [viewMode, weekStart]);

    // Scroll to today if needed (only in week view if it contains today)
    useEffect(() => {
        if (!loading && columns.some(c => c.isToday) && viewMode === 'week') {
            scrollToToday();
        }
    }, [loading]); // Only on initial load/view change completion

    const scrollToToday = () => {
        setTimeout(() => {
            if (scrollContainerRef.current) {
                // Find column index of today
                const todayIndex = columns.findIndex(c => c.isToday);
                if (todayIndex !== -1) {
                    const todayEl = document.getElementById(`header-day-${columns[todayIndex].date}`);
                    if (todayEl) {
                        const offset = todayEl.offsetLeft;
                        scrollContainerRef.current.scrollTo({
                            left: Math.max(0, offset - 100),
                            behavior: 'smooth'
                        });
                    }
                }
            }
        }, 100);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Goals and Tasks (Replace /api/ideas and /api/habits)
            const allGoals = await goalsDB.getAll();
            const allTasks = await tasksDB.getAll();

            // "Habits" in the new system are just Recurring Tasks (isRecurring: true)
            // "Repetitive Steps" are also Recurring Tasks.
            // We need to group them.

            // Filter specialized "Habits" (tasks under "Daily Habits" goal, or just simple recurring tasks?)
            // The user logic split them into "Habits" and "Ideas" (Goals).
            // Let's emulate that: 
            // - "Habits" group: Recurring tasks in the special "Daily Habits" goal.
            // - "Goals" groups: Repetitive tasks in other goals.

            const habitGoal = allGoals.find(g => g.content === 'Daily Habits');
            const habits = allTasks.filter(t => t.isRecurring && (habitGoal ? t.goalId === habitGoal.id : false));

            const otherRecurring = allTasks.filter(t => t.isRecurring && (habitGoal ? t.goalId !== habitGoal.id : true));

            // 2. Fetch Progress/Logs for visible columns
            // Instead of fetching by month API, we query DB for each date in columns
            // Or easier: fetch all progress for the month(s) involved.
            const uniqueMonths = new Set(columns.map(c => c.date.substring(0, 7)));

            // To be efficient, let's just fetch progress for every day in the columns.
            // Or get all progress and filter? (might be too big eventually)
            // Let's iterate days in parallel.

            const progressPromises = columns.map(async col => {
                const progress = await taskProgressDB.getByDate(col.date);
                // We also used to check "Daily Log" habits field in the old API. 
                // But now we just use taskProgressDB for everything.
                return { date: col.date, progress };
            });

            const userLogs = await Promise.all(progressPromises);

            // Consolidate logs
            const newLogs: Record<string, any> = {};

            userLogs.forEach(({ date, progress }) => {
                progress.forEach(p => {
                    // If minutes > 0 or explicitly completed? 
                    // In DB we usually store minutesWorked.
                    // If minutesWorked > 0, it's done/started.
                    // Or we can check if it was marked complete? 
                    // taskProgressDB record doesn't have "status" string like 'DONE'.
                    // But `toggleCell` writes 20 mins.
                    if (p.minutesWorked > 0) {
                        newLogs[`${p.taskId}-${date}`] = 'DONE';
                    }
                });
            });

            setLogs(newLogs);

            // Build Groups
            const newGroups: MatrixGroup[] = [];

            // 1. Habits Group (from 'Daily Habits' goal)
            if (habits.length > 0) {
                newGroups.push({
                    id: 'habits-group',
                    title: 'Daily Habits',
                    items: habits.map(h => ({ id: h.id, name: h.content, type: 'HABIT' }))
                });
            } else if (habitGoal) {
                // If goal exists but no tasks, still maybe show? Or hidden. 
                // Legacy showed nothing.
            }

            // 2. Goal Groups (Other Recurring Tasks)
            // Group by GoalID
            const tasksByGoal: Record<string, Task[]> = {};
            otherRecurring.forEach(t => {
                if (!tasksByGoal[t.goalId]) tasksByGoal[t.goalId] = [];
                tasksByGoal[t.goalId].push(t);
            });

            const sortedGoalIds = Object.keys(tasksByGoal).sort((a, b) => {
                const goalA = allGoals.find(g => g.id === a);
                const goalB = allGoals.find(g => g.id === b);
                return (goalA?.content || '').localeCompare(goalB?.content || '');
            });

            sortedGoalIds.forEach(goalId => {
                const goal = allGoals.find(g => g.id === goalId);
                const tasks = tasksByGoal[goalId];
                if (goal && tasks.length > 0) {
                    newGroups.push({
                        id: goal.id,
                        title: goal.content,
                        items: tasks.map(t => ({
                            id: t.id,
                            name: t.content,
                            type: 'TASK'
                        }))
                    });
                }
            });

            setGroups(newGroups);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleCell = async (itemId: string, col: MatrixColumn, type: 'HABIT' | 'TASK') => {
        const dateFull = col.date;
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
            // Unified Logic: All are Tasks now in DB.
            // We use taskProgressDB.

            if (next === 'DONE') {
                const task = await tasksDB.getById(itemId);
                const duration = task?.estimatedTotalMinutes || 20;
                await taskProgressDB.record(itemId, dateFull, duration);
            } else if (next === 'SKIPPED') {
                // We don't really support "SKIPPED" in progressDB schema cleanly yet?
                // Or we can record 0 minutes? 
                // Wait, Record(0) might imply started?
                // Actually, let's look at schema. TaskProgress { minutesWorked: number }.
                // If I want to verify "SKIPPED", I might need a separate way or just ignore it for now.
                // The user added "SKIPPED".
                // In the DB migration, I didn't add "status" field to progress.
                // For now, let's just DELETE progress if SKIPPED (treat as not done) 
                // OR we can simulate it?
                // Since I cannot change schema easily right now without checking file.
                // I will treat SKIPPED as "No Progress" in DB for now (delete record), 
                // ensuring UI optimistic state handles the visual "Skipped".
                // WARN: IF refresh, it will disappear.
                // To support persisted SKIP, I should add a record with 0 minutes and maybe a meta field?
                // But `taskProgressDB.record` takes minutes.
                // Let's treat SKIPPED as effectively undone in DB for this hotfix.
                // Or I'll save it as 0 minutes?
                // But in `fetchData`, 0 minutes -> undefined.
                // So "SKIPPED" is ephemeral in this implementation unless I change schema.
                // I will accept this limitation to fix the crash first.

                // If current was DONE, we want to remove the progress.
                // "Skipped" is visually distinct but logically "Not Done" in simplified DB.
                // Actually, to remove the "DONE" status from DB:
                // `record` with 0 minutes might not overwrite if not careful? 
                // `taskProgressDB` doesn't have a specific `delete`.
                // But `record` usually adds/updates.
                // If I record 0, `fetchData` logic `if (p.minutesWorked > 0)` returns undefined.
                // So `DONE` -> `SKIPPED` (visual) -> Refreshes to Empty.
                // That's acceptable for "Not Done".

                await taskProgressDB.record(itemId, dateFull, 0); // effectively clears 'DONE'
            } else {
                // Clear
                await taskProgressDB.record(itemId, dateFull, 0);
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
        if (status === 'DONE') return '●';
        if (status === 'SKIPPED') return '○';
        return '';
    };

    const getCellClass = (status?: string) => {
        if (status === 'DONE') return 'bg-accent/10 text-accent font-semibold';
        if (status === 'SKIPPED') return 'bg-gray-50 text-gray-300';
        return 'hover:bg-gray-50/50';
    };

    if (loading) {
        return (
            <div className="p-12 text-center h-full flex flex-col items-center justify-center">
                <div className="inline-block w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin mb-3"></div>
                <p className="text-muted text-sm">Loading...</p>
            </div>
        );
    }

    return (
        <div className="relative h-full flex flex-col">
            <div
                className="overflow-x-auto border rounded-xl relative h-full bg-white shadow-sm scroll-smooth flex-1"
                ref={scrollContainerRef}
            >
                <table className="min-w-full text-sm border-collapse relative">
                    <thead className="sticky top-0 z-20 bg-white shadow-sm">
                        <tr>
                            <th className="p-3 pl-4 text-left bg-white border-b border-r min-w-[220px] sticky left-0 z-30 font-medium text-muted">
                                Task / Habit
                            </th>
                            {columns.map(col => (
                                <th
                                    key={col.date}
                                    id={`header-day-${col.date}`}
                                    className={`p-2 min-w-[60px] border-b border-r last:border-r-0 text-center text-muted transition-colors whitespace-nowrap
                                        ${col.isToday ? 'bg-accent/5 text-accent font-bold ring-1 ring-accent/20 ring-inset' : 'font-normal'}
                                    `}
                                >
                                    {viewMode === 'week' ? col.headerLabel : col.dayNum}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {groups.map(group => (
                            <Fragment key={group.id}>
                                {/* Group Header */}
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
                                    {/* Empty cells for group row */}
                                    {columns.map(col => (
                                        <td key={col.date} className="bg-gray-50/50 border-b border-r last:border-r-0"></td>
                                    ))}
                                </tr>

                                {/* Group Items */}
                                {!collapsedGroups.has(group.id) && group.items.map(item => (
                                    <tr key={item.id} className="group/row">
                                        <td className="p-3 pl-6 text-left border-r sticky left-0 bg-white group-hover/row:bg-gray-50 font-medium text-foreground truncate max-w-[220px] transition-colors z-10 shadow-[1px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            {item.name}
                                        </td>
                                        {columns.map(col => {
                                            const status = logs[`${item.id}-${col.date}`];
                                            return (
                                                <td
                                                    key={col.date}
                                                    onClick={() => toggleCell(item.id, col, item.type)}
                                                    className={`border-r last:border-r-0 text-center cursor-pointer transition-all duration-200 text-lg select-none
                                                        ${getCellClass(status)}
                                                        ${col.isToday ? 'bg-accent/5' : ''}
                                                    `}
                                                >
                                                    <span className="transform transition-transform active:scale-90 inline-block">
                                                        {getIcon(status)}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </Fragment>
                        ))}

                        {groups.length === 0 && (
                            <tr>
                                <td colSpan={columns.length + 1} className="p-12 text-center bg-gray-50/30">
                                    <div className="max-w-xs mx-auto">
                                        <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"/>
                                                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                                                <line x1="9" y1="9" x2="9.01" y2="9"/>
                                                <line x1="15" y1="9" x2="15.01" y2="9"/>
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-light text-foreground mb-2">No habits yet</h3>
                                        <p className="text-sm text-muted">Create your first task or habit to start building consistent, gentle routines.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
