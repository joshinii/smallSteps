'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Step } from '@/types';

export default function DoModePage() {
    const router = useRouter();
    const params = useParams();
    const stepId = params.id as string;

    const [step, setStep] = useState<Step | null>(null);
    const [loading, setLoading] = useState(true);
    const [showReflection, setShowReflection] = useState(false);
    const [feeling, setFeeling] = useState<'LIGHTER' | 'NEUTRAL' | 'HARD' | null>(null);
    const [note, setNote] = useState('');

    useEffect(() => {
        fetchStep();
    }, [stepId]);

    const fetchStep = async () => {
        try {
            const res = await fetch(`/api/steps?ideaId=${stepId}`);
            const allSteps = await res.json();
            const foundStep = allSteps.find((s: Step) => s.id === stepId);

            if (!foundStep) {
                // Try fetching all steps
                const allRes = await fetch('/api/steps');
                const allData = await allRes.json();
                const found = allData.find((s: Step) => s.id === stepId);
                setStep(found || null);
            } else {
                setStep(foundStep);
            }
        } catch (error) {
            console.error('Error fetching step:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDone = async () => {
        if (!step) return;

        try {
            // Mark step as complete
            await fetch(`/api/steps/${step.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true }),
            });

            // Show reflection modal
            setShowReflection(true);
        } catch (error) {
            console.error('Error completing step:', error);
        }
    };

    const handleReflectionSubmit = async () => {
        if (!step || !feeling) return;

        try {
            // Save reflection
            await fetch('/api/reflections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stepId: step.id,
                    feeling,
                    note: note || null,
                }),
            });

            // Find next step or go back to ideas
            const res = await fetch('/api/steps');
            const allSteps = await res.json();
            const ideaSteps = allSteps.filter((s: Step) => s.ideaId === step.ideaId && !s.completed);

            if (ideaSteps.length > 0) {
                // Go to next step
                router.push(`/do/${ideaSteps[0].id}`);
            } else {
                // All done, go back to ideas
                router.push('/');
            }
        } catch (error) {
            console.error('Error saving reflection:', error);
        }
    };

    const handlePause = () => {
        router.push('/');
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-12 text-center">
                <p className="text-muted">Loading...</p>
            </div>
        );
    }

    if (!step) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-12 text-center">
                <p className="text-muted mb-4">Step not found</p>
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
        <div className="min-h-screen flex items-center justify-center px-6 py-12">
            <div className="max-w-xl w-full animate-fadeIn">
                {!showReflection ? (
                    <>
                        {/* Do Mode - Single Step Focus */}
                        <div className="text-center mb-12">
                            <h1 className="text-4xl font-light text-foreground mb-8 leading-relaxed">
                                {step.content}
                            </h1>

                            <p className="text-muted mb-12">
                                Take your time. This is just one small step.
                            </p>

                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={handleDone}
                                    className="px-12 py-4 bg-accent text-white rounded-2xl hover:bg-accent-hover font-medium text-lg"
                                >
                                    Done ✓
                                </button>

                                <button
                                    onClick={handlePause}
                                    className="px-12 py-4 bg-white border-2 border-border text-foreground rounded-2xl hover:border-accent font-medium text-lg"
                                >
                                    Pause
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Reflection Modal */}
                        <div className="bg-white border-2 border-border rounded-2xl p-8">
                            <h2 className="text-2xl font-light text-foreground mb-6 text-center">
                                How did it feel?
                            </h2>

                            <div className="space-y-3 mb-6">
                                <button
                                    onClick={() => setFeeling('LIGHTER')}
                                    className={`w-full px-6 py-4 rounded-xl border-2 text-left transition-all ${feeling === 'LIGHTER'
                                            ? 'border-accent bg-accent/5'
                                            : 'border-border hover:border-accent/50'
                                        }`}
                                >
                                    <span className="text-2xl mr-3">✨</span>
                                    <span className="text-lg">Lighter</span>
                                </button>

                                <button
                                    onClick={() => setFeeling('NEUTRAL')}
                                    className={`w-full px-6 py-4 rounded-xl border-2 text-left transition-all ${feeling === 'NEUTRAL'
                                            ? 'border-accent bg-accent/5'
                                            : 'border-border hover:border-accent/50'
                                        }`}
                                >
                                    <span className="text-2xl mr-3">😌</span>
                                    <span className="text-lg">Neutral</span>
                                </button>

                                <button
                                    onClick={() => setFeeling('HARD')}
                                    className={`w-full px-6 py-4 rounded-xl border-2 text-left transition-all ${feeling === 'HARD'
                                            ? 'border-accent bg-accent/5'
                                            : 'border-border hover:border-accent/50'
                                        }`}
                                >
                                    <span className="text-2xl mr-3">💪</span>
                                    <span className="text-lg">Hard but done</span>
                                </button>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm text-muted mb-2">
                                    Any notes? (optional)
                                </label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Jot down a quick thought..."
                                    className="w-full px-4 py-3 border-2 border-border rounded-xl focus:border-accent focus:outline-none resize-none"
                                    rows={3}
                                />
                            </div>

                            <button
                                onClick={handleReflectionSubmit}
                                disabled={!feeling}
                                className="w-full px-8 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                Continue
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
