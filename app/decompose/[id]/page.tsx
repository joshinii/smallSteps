'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Idea, Step } from '@/types';

export default function DecomposePage() {
    const router = useRouter();
    const params = useParams();
    const ideaId = params.id as string;

    const [idea, setIdea] = useState<Idea | null>(null);
    const [steps, setSteps] = useState<Step[]>([]);
    const [showLaterSteps, setShowLaterSteps] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchIdea();
    }, [ideaId]);

    const fetchIdea = async () => {
        try {
            const res = await fetch('/api/ideas');
            const ideas = await res.json();
            const foundIdea = ideas.find((i: Idea) => i.id === ideaId);

            if (foundIdea) {
                setIdea(foundIdea);
                setSteps(foundIdea.steps || []);
            }
        } catch (error) {
            console.error('Error fetching idea:', error);
        } finally {
            setLoading(false);
        }
    };

    const todayStep = steps.find(s => s.type === 'TODAY');
    const laterSteps = steps.filter(s => s.type === 'LATER');

    const handleStartNow = () => {
        if (todayStep) {
            router.push(`/do/${todayStep.id}`);
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-12 text-center">
                <p className="text-muted">Loading...</p>
            </div>
        );
    }

    if (!idea) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-12 text-center">
                <p className="text-muted mb-4">Idea not found</p>
                <button
                    onClick={() => router.push('/')}
                    className="text-accent hover:underline"
                >
                    ← Back to ideas
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-6 py-12 animate-fadeIn">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={() => router.push('/')}
                    className="text-accent hover:underline mb-4 inline-block"
                >
                    ← Back to ideas
                </button>

                <h1 className="text-3xl font-light text-foreground mb-3">
                    Your Plan
                </h1>

                {idea.clarifiedContent && (
                    <p className="text-lg text-muted">
                        {idea.clarifiedContent}
                    </p>
                )}
            </div>

            {/* Today Step - Prominent */}
            {todayStep && (
                <div className="mb-8">
                    <h2 className="text-sm uppercase tracking-wide text-muted mb-3">
                        Today's Step
                    </h2>
                    <div className="bg-gradient-to-br from-accent/5 to-accent/10 border-2 border-accent/30 rounded-2xl p-8">
                        <p className="text-2xl font-light text-foreground mb-6">
                            {todayStep.content}
                        </p>

                        {todayStep.completed ? (
                            <div className="flex items-center gap-2 text-green-600">
                                <span className="text-2xl">✓</span>
                                <span className="font-medium">Completed!</span>
                            </div>
                        ) : (
                            <button
                                onClick={handleStartNow}
                                className="px-8 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover font-medium text-lg"
                            >
                                Start Now
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Later Steps - Collapsible */}
            {laterSteps.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowLaterSteps(!showLaterSteps)}
                        className="flex items-center gap-2 text-muted hover:text-foreground mb-3 w-full"
                    >
                        <span className="text-sm uppercase tracking-wide">
                            Later Steps ({laterSteps.length})
                        </span>
                        <span className="text-xl">
                            {showLaterSteps ? '−' : '+'}
                        </span>
                    </button>

                    {showLaterSteps && (
                        <div className="space-y-3">
                            {laterSteps.map((step, index) => (
                                <div
                                    key={step.id}
                                    className="bg-white border-2 border-border rounded-xl p-4 flex items-start gap-3"
                                >
                                    <span className="text-muted font-medium min-w-[2rem]">
                                        {index + 2}.
                                    </span>
                                    <p className="text-foreground flex-1">
                                        {step.content}
                                    </p>
                                    {step.completed && (
                                        <span className="text-green-600 text-xl">✓</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
