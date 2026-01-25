'use client';

import { useState, useEffect } from 'react';
import { goalsDB, tasksDB, dailyAllocationsDB } from '@/lib/db';
import { generateId, minutesToEffortLabel } from '@/lib/schema';
import type { Task, Goal } from '@/lib/schema';

interface HabitManagerProps {
    onClose: () => void;
    onUpdate: () => void;
}

export default function HabitManager({ onClose, onUpdate }: HabitManagerProps) {
    const [habits, setHabits] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('ENERGY_GIVING'); // Map to category
    // Frequency is always DAILY for now in this manager
    const [error, setError] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        fetchHabits();
    }, []);

    const fetchHabits = async () => {
        try {
            const recurring = await tasksDB.getRecurring();
            setHabits(recurring);
        } catch (e) {
            console.error('Failed to fetch habits', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!newName.trim()) return;

        try {
            // 1. Find or Create "Daily Habits" Goal
            const allGoals = await goalsDB.getAll();
            let habitGoal = allGoals.find(g => g.content === 'Daily Habits');

            if (!habitGoal) {
                habitGoal = await goalsDB.create({
                    content: 'Daily Habits',
                    status: 'active',
                    // No target date for general habits
                });
            }

            // 2. Create Task
            await tasksDB.create({
                goalId: habitGoal.id,
                content: newName.trim(),
                category: newType, // Store type in category
                estimatedTotalMinutes: 20, // Default duration
                completedMinutes: 0,
                effortLabel: 'medium', // Default
                isRecurring: true,
                order: habits.length,
                skipCount: 0
            });

            setNewName('');
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
            fetchHabits();
            onUpdate();
        } catch (e) {
            console.error('Failed to add habit', e);
            setError('Failed to add habit');
        }
    };

    const handlePause = async (id: string) => {
        if (!confirm('Stop this habit? (This converts it to a regular task or deletes it if you prefer. For now we will delete it to keep it simple.)')) return;
        try {
            // Option: Toggle isRecurring=false? Or Delete?
            // "Pause" in old system meant archive.
            // Here, let's just delete the task or toggle recurring off.
            // If I toggle recurring off, it disappears from Matrix. That's effectively pausing.
            // But it stays in the Goal list as a one-off task.
            // Let's toggle recurring off.
            await tasksDB.update(id, { isRecurring: false });
            fetchHabits();
            onUpdate();
        } catch (e) {
            console.error('Failed to pause habit', e);
        }
    };

    const getTypeIcon = (category?: string) => {
        switch (category) {
            case 'ENERGY_GIVING': return '⚡';
            case 'EFFORTFUL': return '💪';
            case 'RESTORATIVE': return '🌿';
            default: return '●';
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 animate-fadeIn"
                onClick={onClose}
            />

            <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 animate-slideInRight overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-light text-foreground">Your Habits</h2>
                            <p className="text-xs text-muted mt-1">
                                Managing {habits.length} recurring tasks
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-muted hover:text-foreground transition-colors"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>

                    {showSuccess && (
                        <div className="mb-4 p-3 bg-accent/10 text-accent rounded-xl text-sm flex items-center gap-2 animate-fadeIn">
                            <span>✓</span>
                            <span>Habit added successfully!</span>
                        </div>
                    )}

                    <div className="space-y-3 mb-4">
                        {loading ? (
                            <div className="text-center py-8">
                                <div className="inline-block w-6 h-6 border-3 border-accent/20 border-t-accent rounded-full animate-spin"></div>
                            </div>
                        ) : habits.length === 0 ? (
                            <div className="text-center py-12 px-4">
                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
                                    ✨
                                </div>
                                <p className="text-muted text-sm">No recurring habits yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {habits.map((habit) => (
                                    <div
                                        key={habit.id}
                                        className="group flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-transparent hover:border-gray-200 transition-all"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <span className="text-2xl flex-shrink-0">{getTypeIcon(habit.category)}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-foreground truncate">{habit.content}</p>
                                                <p className="text-xs text-muted capitalize">
                                                    {habit.category?.toLowerCase().replace('_', ' ') || 'General'}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handlePause(habit.id)}
                                            className="text-xs text-muted hover:text-orange-500 px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            Stop
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleAdd} className="space-y-4 border-t border-gray-200 pt-6">
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">
                                New Habit
                            </label>
                            <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g., Morning meditation, Daily walk..."
                                className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-accent focus:outline-none transition-colors"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-muted mb-1.5">Type</label>
                            <select
                                value={newType}
                                onChange={e => setNewType(e.target.value)}
                                className="w-full px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm focus:border-accent focus:outline-none transition-colors"
                            >
                                <option value="ENERGY_GIVING">⚡ Energy Giving</option>
                                <option value="EFFORTFUL">💪 Effortful</option>
                                <option value="RESTORATIVE">🌿 Restorative</option>
                            </select>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!newName.trim()}
                            className="w-full py-3 bg-accent text-white rounded-xl hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md active:scale-[0.98]"
                        >
                            Add Habit
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
