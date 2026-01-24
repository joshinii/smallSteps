'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Idea } from '@/types';

// Extended type for Journey
interface JourneyIdea extends Omit<Idea, 'steps'> {
    steps: {
        id: string;
        content: string;
        completedAt: string;
    }[];
}

export default function JourneyPage() {
    const [journey, setJourney] = useState<JourneyIdea[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    useEffect(() => {
        const fetchJourney = async () => {
            try {
                const res = await fetch('/api/journey');
                const data = await res.json();
                setJourney(data);
            } catch (error) {
                console.error('Failed to load journey:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchJourney();
    }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-12 text-center text-muted animate-pulse">
                Loading your journey...
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-12 animate-fadeIn">
            <header className="mb-12">
                <Link href="/" className="mb-4 inline-flex items-center text-sm text-muted hover:text-accent transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                    Back to Goals
                </Link>
                <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-light text-foreground">
                        Your Journey
                    </h1>
                    <span className="text-2xl">🏔️</span>
                </div>
                <p className="text-muted text-lg mt-3">
                    Reflect on the small steps you've taken.
                </p>
            </header>

            {journey.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-border rounded-3xl bg-gray-50/50">
                    <p className="text-xl text-muted font-light">The journey of a thousand miles begins with a small step.</p>
                    <p className="mt-2 text-sm text-muted">Complete tasks to see them appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {journey.map((idea) => {
                        const isExpanded = expandedCards.has(idea.id);
                        return (
                            <div key={idea.id} className="bg-white border-2 border-border rounded-2xl p-6 hover:shadow-md transition-shadow">
                                <div
                                    className="flex items-start justify-between cursor-pointer"
                                    onClick={() => toggleCard(idea.id)}
                                >
                                    <div>
                                        <h2 className="text-xl font-medium text-foreground mb-1">{idea.content}</h2>
                                        <p className="text-xs text-muted mb-6 uppercase tracking-wider font-bold">
                                            {idea.steps.length} Steps Completed
                                        </p>
                                    </div>
                                    <button
                                        className="text-muted hover:text-accent p-1 transition-transform duration-200"
                                        style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                                    >
                                        ▼
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="space-y-6 relative pl-4 border-l-2 border-border/40 ml-2 animate-slideDown">
                                        {idea.steps.map((step, idx) => (
                                            <div key={step.id} className="relative">
                                                {/* Dot */}
                                                <div className="absolute -left-[21px] top-1.5 w-3 h-3 bg-accent rounded-full border-2 border-white ring-1 ring-accent/20"></div>

                                                <div className="flex flex-col">
                                                    <span className="text-foreground text-base leading-relaxed">
                                                        {step.content}
                                                    </span>
                                                    <span className="text-xs text-muted mt-1">
                                                        {new Date(step.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
