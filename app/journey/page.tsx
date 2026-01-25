'use client';

// SmallSteps Journey Page - Redesigned
// Celebrate achievements with timeline visualization

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { goalsDB, tasksDB } from '@/lib/db';
import type { Goal, Task } from '@/lib/schema';
import { isTaskEffectivelyComplete } from '@/lib/schema';
import { CheckIcon } from '@/components/icons';

interface JourneyGoal extends Goal {
    completedTasks: Task[];
    totalTasks: number;
    isFullyCompleted: boolean;
}

export default function JourneyPage() {
    const [journey, setJourney] = useState<JourneyGoal[]>([]);
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
                const allGoals = await goalsDB.getAll();
                const allTasks = await tasksDB.getAll();

                const journeyGoals: JourneyGoal[] = [];

                allGoals.forEach(goal => {
                    const goalTasks = allTasks.filter(t => t.goalId === goal.id);
                    const completedTasks = goalTasks.filter(t => isTaskEffectivelyComplete(t));

                    // Include goals with completed tasks OR fully completed goals
                    if (completedTasks.length > 0 || goal.status === 'completed') {
                        journeyGoals.push({
                            ...goal,
                            completedTasks: completedTasks.sort((a, b) =>
                                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                            ),
                            totalTasks: goalTasks.length,
                            isFullyCompleted: goal.status === 'completed'
                        });
                    }
                });

                // Sort: Fully completed goals first, then by most recent activity
                journeyGoals.sort((a, b) => {
                    // Fully completed goals come first
                    if (a.isFullyCompleted !== b.isFullyCompleted) {
                        return a.isFullyCompleted ? -1 : 1;
                    }
                    // Then sort by most recent completion
                    const lastA = a.completedAt || a.completedTasks[0]?.updatedAt || '';
                    const lastB = b.completedAt || b.completedTasks[0]?.updatedAt || '';
                    return new Date(lastB).getTime() - new Date(lastA).getTime();
                });

                setJourney(journeyGoals);
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
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="animate-pulse space-y-6">
                    <div className="h-10 bg-gray-100 rounded-xl w-1/2"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                    <div className="space-y-4 mt-8">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 bg-gray-50 rounded-xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const totalSteps = journey.reduce((sum, g) => sum + g.completedTasks.length, 0);
    const completedGoals = journey.filter(g => g.isFullyCompleted).length;

    return (
        <div className="max-w-3xl mx-auto px-6 py-8 animate-fadeIn">
            {/* Header */}
            <header className="mb-8">
                <Link href="/" className="inline-flex items-center text-sm text-muted hover:text-foreground transition-colors mb-4">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                    </svg>
                    Back to Goals
                </Link>
                <h1 className="text-3xl font-light text-foreground mb-2">Your Journey</h1>
                <p className="text-sm text-muted">
                    {totalSteps > 0
                        ? `${totalSteps} step${totalSteps !== 1 ? 's' : ''} taken${completedGoals > 0 ? `, ${completedGoals} goal${completedGoals !== 1 ? 's' : ''} completed` : ''}`
                        : 'Small steps add up'}
                </p>
            </header>

            {/* Empty State */}
            {journey.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                            <line x1="12" y1="22.08" x2="12" y2="12"/>
                        </svg>
                    </div>
                    <p className="text-lg text-muted font-light mb-2">Your journey starts here</p>
                    <p className="text-sm text-muted">
                        Complete tasks to see your progress reflected here.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {journey.map((goal) => {
                        const isExpanded = expandedCards.has(goal.id);
                        const completionDate = goal.completedAt
                            ? new Date(goal.completedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })
                            : null;

                        return (
                            <div
                                key={goal.id}
                                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition-all"
                            >
                                {/* Card Header */}
                                <div
                                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => toggleCard(goal.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                {goal.isFullyCompleted && (
                                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                                        <CheckIcon size={12} className="text-white" />
                                                    </div>
                                                )}
                                                <h2 className="text-lg font-medium text-foreground">
                                                    {goal.content}
                                                </h2>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted">
                                                <span>
                                                    {goal.completedTasks.length} of {goal.totalTasks} task{goal.totalTasks !== 1 ? 's' : ''}
                                                </span>
                                                {completionDate && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Completed {completionDate}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            className="flex-shrink-0 text-muted/60 hover:text-foreground transition-transform duration-200 p-1"
                                            style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Task Timeline */}
                                {isExpanded && goal.completedTasks.length > 0 && (
                                    <div className="px-4 pb-4 animate-slideDown">
                                        <div className="relative pl-6 border-l-2 border-gray-200 ml-2 space-y-4">
                                            {goal.completedTasks.map((task, idx) => (
                                                <div key={task.id} className="relative">
                                                    {/* Timeline Dot */}
                                                    <div className="absolute -left-[27px] top-1 w-3 h-3 bg-accent rounded-full border-2 border-white"></div>

                                                    <div>
                                                        <p className="text-sm text-foreground leading-relaxed">
                                                            {task.content}
                                                        </p>
                                                        <p className="text-xs text-muted mt-0.5">
                                                            {new Date(task.updatedAt).toLocaleDateString('en-US', {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                year: 'numeric'
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Empty expanded state */}
                                {isExpanded && goal.completedTasks.length === 0 && (
                                    <div className="px-4 pb-4">
                                        <p className="text-sm text-muted italic">No tasks completed yet for this goal.</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Encouraging Footer */}
            {journey.length > 0 && (
                <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <p className="text-sm text-blue-900">
                        {completedGoals > 0
                            ? `You've completed ${completedGoals} goal${completedGoals !== 1 ? 's' : ''}. Each step forward matters.`
                            : 'Every step you take is progress. Keep going.'}
                    </p>
                </div>
            )}
        </div>
    );
}
