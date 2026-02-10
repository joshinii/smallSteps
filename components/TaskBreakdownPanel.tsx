'use client';

import { useState } from 'react';
import { useAI } from '@/lib/ai/AIContext';
import { breakdownTaskFurther } from '@/lib/agents/taskBreakdown';
import type { Task, WorkUnit } from '@/lib/schema';
import { PlusIcon, RefreshIcon, CheckIcon, CloseIcon } from '@/components/icons';
import { GeneratedWorkUnit } from '@/lib/agents/taskBreakdown';
import { workUnitsDB } from '@/lib/db';
import { generateId } from '@/lib/utils'; // Assuming this utility exists

interface TaskBreakdownPanelProps {
    task: Task;
    existingWorkUnits: WorkUnit[];
    onUnitsAdded: () => void;
}

export default function TaskBreakdownPanel({ task, existingWorkUnits, onUnitsAdded }: TaskBreakdownPanelProps) {
    const { getAI } = useAI();
    const [status, setStatus] = useState<'idle' | 'loading' | 'preview' | 'saving'>('idle');
    const [suggestions, setSuggestions] = useState<GeneratedWorkUnit[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleBreakdown = async () => {
        setStatus('loading');
        setError(null);
        try {
            const ai = getAI();
            const units = await breakdownTaskFurther(task, existingWorkUnits, ai);

            if (units.length === 0) {
                setError("Couldn't generate suggestions. Try again.");
                setStatus('idle');
                return;
            }

            setSuggestions(units);
            setStatus('preview');
        } catch (err) {
            console.error('Breakdown failed:', err);
            setError('AI generation failed. Please check your connection.');
            setStatus('idle');
        }
    };

    const handleAdd = async () => {
        setStatus('saving');
        try {
            // Save all suggestions
            for (const suggestion of suggestions) {
                await workUnitsDB.create({
                    taskId: task.id,
                    title: suggestion.title,
                    kind: suggestion.kind,
                    // Use optional mapping if GenerateWorkUnit doesn't match WorkUnit exactly
                    // But schema says they match mostly.
                    completedMinutes: 0,
                    firstAction: suggestion.firstAction,
                    successSignal: suggestion.successSignal,
                    // taskOrder matching parent task
                });
            }

            onUnitsAdded(); // Refresh parent
            setStatus('idle');
            setSuggestions([]);
        } catch (err) {
            console.error('Failed to save units:', err);
            setError('Failed to save work units.');
            setStatus('preview'); // Go back to preview
        }
    };

    if (status === 'idle') {
        return (
            <div className="mt-4">
                {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
                <button
                    onClick={handleBreakdown}
                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-accent/50"
                >
                    <PlusIcon size={12} />
                    Break this down more
                </button>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="mt-4 p-4 border border-dashed rounded-lg bg-accent/20 flex flex-col items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground animate-pulse">Thinking...</p>
            </div>
        );
    }

    if (status === 'preview' || status === 'saving') {
        return (
            <div className="mt-4 p-3 border rounded-lg bg-card/50 space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Suggested Steps
                    </h4>
                    <button
                        onClick={() => {
                            setStatus('idle');
                            setSuggestions([]);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <CloseIcon size={14} />
                    </button>
                </div>

                <div className="space-y-2">
                    {suggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-background/50 border border-border/50">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/40 block" />
                            <div>
                                <p className="text-foreground">{s.title}</p>
                                {s.firstAction && <p className="text-xs text-muted-foreground mt-0.5">Start: {s.firstAction}</p>}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                    <button
                        onClick={handleAdd}
                        disabled={status === 'saving'}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-medium py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {status === 'saving' ? 'Adding...' : 'Add All'}
                    </button>
                    <button
                        onClick={handleBreakdown} // Regenerate
                        disabled={status === 'saving'}
                        className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground text-xs font-medium py-2 px-3 rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        title="Try again"
                    >
                        <RefreshIcon size={14} />
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
