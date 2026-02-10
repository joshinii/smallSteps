'use client';

import { useState, useEffect } from 'react';
import { useAI } from '@/lib/ai/AIContext';
import { getRecentCompletionRate, getCurrentTargetCount } from '@/lib/tracking/completionRate';

export default function SettingsPage() {
    const { openSetupModal } = useAI();
    const [targetCount, setTargetCount] = useState<number | null>(null);
    const [completionRate, setCompletionRate] = useState<number | null>(null);

    useEffect(() => {
        async function loadStats() {
            const count = await getCurrentTargetCount();
            const rate = await getRecentCompletionRate(7);
            setTargetCount(count);
            setCompletionRate(rate);
        }
        loadStats();
    }, []);

    return (
        <div className="max-w-xl mx-auto px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
            <p className="text-muted-foreground mb-8">Adjust your experience.</p>

            <section className="bg-card/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm mb-6">
                <h2 className="text-xl font-semibold mb-4 text-foreground/90 flex items-center gap-2">
                    <span className="text-accent">●</span> Your Pattern
                </h2>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background/50 rounded-xl p-4 border border-border/30">
                        <div className="text-sm text-muted-foreground mb-1">Daily Capacity</div>
                        <div className="text-2xl font-bold text-foreground">
                            {targetCount !== null ? targetCount : '-'}
                            <span className="text-base font-normal text-muted-foreground ml-1">units</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            Adjusted based on your completion rate.
                        </div>
                    </div>

                    <div className="bg-background/50 rounded-xl p-4 border border-border/30">
                        <div className="text-sm text-muted-foreground mb-1">Last 7 Days</div>
                        <div className="text-2xl font-bold text-foreground">
                            {completionRate !== null ? Math.round(completionRate * 100) : '-'}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            Completion rate. Keep it steady!
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-card/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-xl font-semibold mb-4 text-foreground/90">AI Configuration</h2>
                <p className="text-muted-foreground mb-4 text-sm">
                    Configure your AI provider (Claude, OpenAI, Ollama) and manage API keys.
                </p>
                <button
                    onClick={openSetupModal}
                    className="w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-gray-100 transition-colors border border-gray-200 shadow-sm"
                >
                    Manage AI Settings
                </button>
            </section>
        </div>
    );
}
