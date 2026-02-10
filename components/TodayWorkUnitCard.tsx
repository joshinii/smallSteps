import { useState } from 'react';
import type { Slice, WorkUnit } from '@/lib/schema';
import InlineEdit from './InlineEdit';
import { workUnitsDB } from '@/lib/db';
import { CheckIcon } from '@/components/icons';

interface TodayWorkUnitCardProps {
    slice: Slice;
    onComplete: () => void;
}

export default function TodayWorkUnitCard({ slice, onComplete }: TodayWorkUnitCardProps) {
    const [workUnit, setWorkUnit] = useState(slice.workUnit);
    const [isCompleting, setIsCompleting] = useState(false);

    const handleUpdate = async (updates: Partial<WorkUnit>) => {
        setWorkUnit(prev => ({ ...prev, ...updates }));
        try {
            await workUnitsDB.update(workUnit.id, updates);
        } catch (error) {
            console.error('Failed to update work unit', error);
            // Revert on error
        }
    };

    const handleComplete = async () => {
        setIsCompleting(true);
        // Small delay for visual satisfaction
        setTimeout(() => {
            onComplete();
        }, 300);
    };

    return (
        <div className={`group flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-300 ${isCompleting ? 'opacity-0 scale-95' : 'opacity-100'
            }`}>
            {/* Large Tappable Checkbox */}
            <button
                onClick={handleComplete}
                className="mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center transition-all group-hover:scale-105"
                title="Mark complete"
            >
                <span className="opacity-0 hover:opacity-100 text-green-600 transition-opacity">
                    <CheckIcon size={14} />
                </span>
            </button>

            <div className="flex-1 min-w-0 space-y-1">
                {/* Title */}
                <div className="font-medium text-slate-800 text-base">
                    <InlineEdit
                        value={workUnit.title}
                        onSave={(val) => handleUpdate({ title: val })}
                        className=""
                        minLength={3}
                    />
                </div>

                {/* Goal Context */}
                <div className="text-xs text-slate-400 font-medium tracking-wide uppercase">
                    {slice.goal.title}
                </div>

                {/* First Action */}
                {(workUnit.firstAction || workUnit.kind === 'study' || workUnit.kind === 'explore') && (
                    <div className="mt-2 text-sm text-slate-500 flex items-start gap-2">
                        <span className="text-slate-300 shrink-0 mt-[3px]">👉</span>
                        <InlineEdit
                            value={workUnit.firstAction || (workUnit.kind === 'study' ? 'Start reading...' : 'Start here...')}
                            onSave={(val) => handleUpdate({ firstAction: val })}
                            placeholder="Add gentle first step..."
                            className="flex-1 italic"
                            label="first action"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
