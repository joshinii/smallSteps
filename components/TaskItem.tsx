import { useState, useCallback, useEffect } from 'react';
import type { Task, WorkUnit } from '@/lib/schema';
import { isTaskEffectivelyComplete } from '@/lib/utils';
import { CheckIcon, SparklesIcon } from '@/components/icons'; // Added SparklesIcon for WhyThisMatters
import WorkUnitItem from './WorkUnitItem';
import TaskBreakdownPanel from './TaskBreakdownPanel';
import InlineEdit from './InlineEdit';
import { workUnitsDB, tasksDB } from '@/lib/db';

interface TaskItemProps {
    task: Task;
    goalId: string;
    onComplete: () => void;
}

export default function TaskItem({ task, goalId, onComplete }: TaskItemProps) {
    const [localTask, setLocalTask] = useState(task);

    // Sync with props
    useEffect(() => {
        setLocalTask(task);
    }, [task]);

    const isComplete = isTaskEffectivelyComplete(localTask);
    const hasProgress = localTask.completedMinutes > 0;
    const [isExpanded, setIsExpanded] = useState(false);
    const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
    const [loadingUnits, setLoadingUnits] = useState(false);

    // Fetch work units when expanded
    const loadWorkUnits = useCallback(async () => {
        if (!localTask.id) return;
        setLoadingUnits(true);
        try {
            const units = await workUnitsDB.getByTaskId(localTask.id);
            setWorkUnits(units);
        } catch (error) {
            console.error('Failed to load work units', error);
        } finally {
            setLoadingUnits(false);
        }
    }, [localTask.id]);

    const handleToggle = () => {
        if (!isExpanded) {
            loadWorkUnits();
        }
        setIsExpanded(!isExpanded);
    };

    const handleTaskUpdate = async (updates: Partial<Task>) => {
        setLocalTask(prev => ({ ...prev, ...updates }));
        try {
            await tasksDB.update(localTask.id, updates);
        } catch (error) {
            console.error('Failed to update task', error);
            setLocalTask(task); // Revert
        }
    };

    const handleToggleUnit = async (unit: WorkUnit) => {
        try {
            const newCompleted = unit.completedMinutes > 0 ? 0 : 1;
            await workUnitsDB.update(unit.id, { completedMinutes: newCompleted });
            loadWorkUnits(); // Refresh list to get updated state
            // Optionally update parent task progress if needed? 
            // Task progress is usually aggregate. 
        } catch (error) {
            console.error('Failed to toggle unit', error);
        }
    };

    // Pass update handler to WorkUnitItem
    const handleUnitUpdate = async (unitId: string, updates: Partial<WorkUnit>) => {
        try {
            await workUnitsDB.update(unitId, updates);
            // Update local list state optimistically
            setWorkUnits(prev => prev.map(u => u.id === unitId ? { ...u, ...updates } : u));
        } catch (error) {
            console.error('Failed to update work unit', error);
            loadWorkUnits(); // Revert/Refresh
        }
    };

    return (
        <div className={`rounded-lg border bg-white transition-all duration-200 ${isComplete ? 'border-gray-200 opacity-60' : 'border-gray-200 shadow-sm hover:shadow-md'
            }`}>
            {/* Header / Main Row */}
            <div
                className="p-3 flex items-start justify-between gap-4"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                        {/* Task Completion Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onComplete();
                            }}
                            className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isComplete
                                ? 'bg-green-500 border-green-500 text-white'
                                : 'border-gray-300 hover:border-green-500 text-transparent hover:text-green-500'
                                }`}
                        >
                            <CheckIcon size={12} />
                        </button>

                        <div className="flex-1 min-w-0">
                            {/* Inline Edit Title */}
                            <div onClick={(e) => !isExpanded && handleToggle()} className="cursor-pointer">
                                <InlineEdit
                                    value={localTask.title}
                                    onSave={(val) => handleTaskUpdate({ title: val })}
                                    className={`font-medium ${isComplete ? 'text-muted line-through' : 'text-foreground'}`}
                                    minLength={3}
                                />
                            </div>

                            {/* Metadata Row */}
                            <div
                                className="flex items-center gap-3 mt-1 text-xs text-muted-foreground cursor-pointer"
                                onClick={handleToggle}
                            >
                                <span>{isComplete ? 'Complete' : hasProgress ? 'In progress' : 'Not started'}</span>
                                {workUnits.length > 0 && <span>• {workUnits.length} steps</span>}
                                {localTask.complexity && <span>• Complexity: {localTask.complexity}</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && !isComplete && (
                <div className="px-3 pb-3 pt-0 animate-in slide-in-from-top-1 fade-in duration-200">
                    <div className="pl-8 space-y-4 border-l-2 border-gray-100 ml-2.5 mt-1">

                        {/* Why This Matters Section */}
                        <div className="bg-amber-50/50 p-2 rounded-md border border-amber-100/50">
                            <div className="flex items-center gap-1.5 mb-1 text-amber-600/80">
                                <SparklesIcon size={10} />
                                <span className="text-[10px] uppercase tracking-wider font-semibold">Why this matters</span>
                            </div>
                            <InlineEdit
                                value={localTask.whyThisMatters || ''}
                                onSave={(val) => handleTaskUpdate({ whyThisMatters: val })}
                                placeholder="Add a reason why this task is important..."
                                className="text-xs text-muted-foreground"
                                multiline={true}
                            />
                        </div>

                        {/* Work Units List */}
                        {loadingUnits ? (
                            <p className="text-xs text-muted-foreground py-2 pl-2">Loading steps...</p>
                        ) : (
                            <>
                                {workUnits.length > 0 ? (
                                    <div className="space-y-1">
                                        {workUnits.map(wu => (
                                            <WorkUnitItem
                                                key={wu.id}
                                                workUnit={wu}
                                                isComplete={wu.completedMinutes > 0}
                                                onToggle={() => handleToggleUnit(wu)}
                                                onUpdate={(updates) => handleUnitUpdate(wu.id, updates)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground py-2 pl-2 italic">
                                        No specific steps defined yet.
                                    </p>
                                )}

                                {/* Breakdown Panel */}
                                <div className="pl-1">
                                    <TaskBreakdownPanel
                                        task={localTask}
                                        existingWorkUnits={workUnits}
                                        onUnitsAdded={loadWorkUnits}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
