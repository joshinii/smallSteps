'use client';

import { useState, useEffect } from 'react';
import { parseLocalDate } from '@/lib/utils';



interface DailyLogProps {
    date: string; // YYYY-MM-DD
    onSave?: () => void;
}

export default function DailyLog({ date, onSave }: DailyLogProps) {

    const [moment, setMoment] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [reflection, setReflection] = useState('');
    const [showReflection, setShowReflection] = useState(false);

    useEffect(() => {
        loadData();
    }, [date]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch habits removed


            // 2. Fetch existing log for today (using month API or separate GET)
            // For simplicity, we can use the GET daily logs API with a month param, 
            // or just rely on the user to save. Better: Check if we have data for this day.
            // Actually, my GET /api/daily-logs fetches a whole month.
            // Let's fetch the month and filter for today.
            const month = date.substring(0, 7);
            const logsRes = await fetch(`/api/daily-logs?month=${month}`);
            const logsData = await logsRes.json();

            // Find today's data
            const todayLog = logsData.dailyLogs.find((l: any) => l.date === date);


            if (todayLog) setMoment(todayLog.moment || '');



        } catch (e) {
            console.error('Failed to load daily log', e);
        } finally {
            setLoading(false);
        }
    };



    const handleSave = async () => {
        setSaving(true);
        try {
            // Save log
            await fetch('/api/daily-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date,
                    moment,

                }),
            });

            // Trigger AI reflection if we have some data
            if (moment.length > 5 && !reflection) {
                const aiRes = await fetch('/api/ai/reflect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date }),
                });
                const aiData = await aiRes.json();
                if (aiData.reflection) {
                    setReflection(aiData.reflection);
                    setShowReflection(true);
                }
            }

            if (onSave) onSave();
        } catch (e) {
            console.error('Failed to save', e);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-6 text-center text-muted">Loading today...</div>;

    const displayDate = parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className="bg-white border-2 border-border rounded-2xl p-6 md:p-8 hover:shadow-sm transition-shadow">
            <h3 className="text-xl font-light text-foreground mb-6 flex justify-between items-center">
                <span>{displayDate} <span className="text-muted text-sm ml-2 font-normal">Daily Log</span></span>
                {moment ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">Started</span>
                ) : null}
            </h3>

            {/* Small Moment Input */}
            <div className="mb-8">
                <label className="block text-sm text-muted mb-2 font-medium">
                    One small moment worth noting
                </label>
                <input
                    type="text"
                    value={moment}
                    onChange={(e) => setMoment(e.target.value)}
                    placeholder="e.g., The sun felt warm, or I drank tea slowly..."
                    className="w-full px-4 py-3 bg-gray-50 border-gray-100 hover:bg-white focus:bg-white border-2 rounded-xl focus:border-accent focus:outline-none transition-all"
                />
            </div>



            {/* Reflection Reveal */}
            {showReflection && (
                <div className="mb-6 p-4 bg-indigo-50 text-indigo-800 rounded-xl border border-indigo-100 text-sm animate-fadeIn">
                    <p className="italic">"{reflection}"</p>
                </div>
            )}

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2 bg-foreground text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity font-medium text-sm"
                >
                    {saving ? 'Saving...' : 'Save Day'}
                </button>
            </div>
        </div>
    );
}
