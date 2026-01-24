'use client';

import { useState, useEffect } from 'react';

interface Habit {
    id: string;
    name: string;
    type: string;
    frequency: string;
}

interface HabitManagerProps {
    onClose: () => void;
    onUpdate: () => void; // Trigger refresh of parent data
}

export default function HabitManager({ onClose, onUpdate }: HabitManagerProps) {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('ENERGY_GIVING');
    const [newFrequency, setNewFrequency] = useState('DAILY');
    const [error, setError] = useState('');

    useEffect(() => {
        fetchHabits();
    }, []);

    const fetchHabits = async () => {
        try {
            const res = await fetch('/api/habits');
            const data = await res.json();
            setHabits(data);
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
            const res = await fetch('/api/habits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    type: newType,
                    frequency: newFrequency,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                setError(err.error || 'Failed to add habit');
                return;
            }

            setNewName('');
            fetchHabits();
            onUpdate();
        } catch (e) {
            setError('Failed to add habit');
        }
    };

    const handleArchive = async (id: string) => {
        if (!confirm('Archive this habit?')) return;
        try {
            await fetch(`/api/habits/${id}`, { method: 'DELETE' });
            fetchHabits();
            onUpdate();
        } catch (e) {
            console.error('Failed to archive', e);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl m-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-light text-foreground">Manage Habits</h2>
                    <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
                </div>

                <div className="space-y-4 mb-8">
                    {habits.map(habit => (
                        <div key={habit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-border">
                            <div>
                                <p className="font-medium text-foreground">{habit.name}</p>
                                <p className="text-xs text-muted">{habit.type} • {habit.frequency}</p>
                            </div>
                            <button
                                onClick={() => handleArchive(habit.id)}
                                className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                            >
                                Archive
                            </button>
                        </div>
                    ))}
                    {habits.length === 0 && !loading && (
                        <p className="text-center text-muted italic">No active habits yet.</p>
                    )}
                </div>

                {habits.length < 5 ? (
                    <form onSubmit={handleAdd} className="space-y-3 border-t border-dashed border-border pt-4">
                        <p className="text-sm text-muted font-medium mb-2">Add New Habit</p>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Habit name (e.g., maintain hydration)"
                            className="w-full px-4 py-2 bg-white border border-border rounded-xl focus:border-accent focus:outline-none"
                        />
                        <div className="flex gap-2">
                            <select
                                value={newType}
                                onChange={e => setNewType(e.target.value)}
                                className="flex-1 px-3 py-2 bg-white border border-border rounded-xl text-sm"
                            >
                                <option value="ENERGY_GIVING">Energy Giving</option>
                                <option value="EFFORTFUL">Effortful</option>
                                <option value="RESTORATIVE">Restorative</option>
                            </select>
                            <select
                                value={newFrequency}
                                onChange={e => setNewFrequency(e.target.value)}
                                className="flex-1 px-3 py-2 bg-white border border-border rounded-xl text-sm"
                            >
                                <option value="DAILY">Daily</option>
                                <option value="MOST_DAYS">Most Days</option>
                                <option value="OCCASIONALLY">Occasionally</option>
                            </select>
                        </div>
                        {error && <p className="text-xs text-red-500">{error}</p>}
                        <button
                            type="submit"
                            disabled={!newName.trim()}
                            className="w-full py-2 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 transition-colors"
                        >
                            Add Habit
                        </button>
                    </form>
                ) : (
                    <p className="text-center text-sm text-yellow-600 bg-yellow-50 p-3 rounded-xl">
                        You've reached the limit of 5 habits. Focusing on less enhances calm.
                    </p>
                )}
            </div>
        </div>
    );
}
