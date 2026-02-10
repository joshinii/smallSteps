import { useState, useEffect } from 'react';
import { WorkUnit } from '@/lib/schema';
import {
    StudyIcon,
    PracticeIcon,
    BuildIcon,
    ReviewIcon,
    ExploreIcon,
    CheckIcon,
    SparklesIcon
} from '@/components/icons';
import InlineEdit from './InlineEdit';

interface WorkUnitItemProps {
    workUnit: WorkUnit;
    isComplete: boolean;
    onToggle: () => void;
    onUpdate?: (updates: Partial<WorkUnit>) => Promise<void> | void;
}

const kindIcons = {
    study: StudyIcon,
    practice: PracticeIcon,
    build: BuildIcon,
    review: ReviewIcon,
    explore: ExploreIcon,
};

const kindColors = {
    study: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    practice: 'text-green-400 bg-green-400/10 border-green-400/20',
    build: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    review: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    explore: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
};

export default function WorkUnitItem({ workUnit, isComplete, onToggle, onUpdate }: WorkUnitItemProps) {
    const KindIcon = kindIcons[workUnit.kind] || ExploreIcon;
    const colorClass = kindColors[workUnit.kind] || kindColors.explore;

    const [localUnit, setLocalUnit] = useState(workUnit);

    useEffect(() => {
        setLocalUnit(workUnit);
    }, [workUnit]);

    const handleUpdate = async (updates: Partial<WorkUnit>) => {
        setLocalUnit(prev => ({ ...prev, ...updates }));
        if (onUpdate) {
            await onUpdate(updates);
        }
    };

    return (
        <div className={`group flex items-start gap-3 p-2 rounded-md transition-all ${isComplete ? 'opacity-50' : 'hover:bg-accent/40'
            }`}>
            {/* Checkbox */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${isComplete
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/30 hover:border-primary text-transparent'
                    }`}
            >
                <CheckIcon size={10} />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>
                        {localUnit.kind}
                    </span>

                    {/* Inline Edit Title */}
                    <div className="flex-1 min-w-0">
                        <InlineEdit
                            value={localUnit.title}
                            onSave={(val) => handleUpdate({ title: val })}
                            className={`text-sm font-medium ${isComplete ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                            minLength={3}
                        />
                    </div>
                </div>

                {/* First Action & Success Signal */}
                {!isComplete && (
                    <div className="space-y-0.5 mt-1">
                        {/* First Action */}
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground/80 group/action">
                            <span className="shrink-0 mt-0.5">👉</span>
                            <InlineEdit
                                value={localUnit.firstAction || ''}
                                onSave={(val) => handleUpdate({ firstAction: val })}
                                placeholder="Add first step..."
                                className="flex-1"
                                label="first action"
                            />
                        </div>

                        {/* Success Signal (shown if exists or on hover of container) */}
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground/80 group/signal">
                            <span className="shrink-0 mt-0.5">🏁</span>
                            <InlineEdit
                                value={localUnit.successSignal || ''}
                                onSave={(val) => handleUpdate({ successSignal: val })}
                                placeholder="Add completion sign..."
                                className="flex-1"
                                label="success signal"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
