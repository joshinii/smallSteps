'use client';

// SmallSteps Breakdown Approval Component
// Review and edit AI-generated breakdown before saving

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GeneratedBreakdown, GeneratedTask, GeneratedWorkUnit } from '@/lib/agents/types';

// ============================================
// Types
// ============================================

interface Props {
    goalTitle: string;
    breakdown: GeneratedBreakdown;
    onApprove: (edited?: GeneratedBreakdown) => void;
    onRegenerate: () => void;
    onCancel: () => void;
    isRegenerating?: boolean;
}

// ============================================
// Main Component
// ============================================

export default function BreakdownApproval({
    goalTitle,
    breakdown,
    onApprove,
    onRegenerate,
    onCancel,
    isRegenerating = false,
}: Props) {
    const [edited, setEdited] = useState<GeneratedBreakdown>(breakdown);
    const [expandedTask, setExpandedTask] = useState<number | null>(0); // First task expanded by default
    const [editingTaskTitle, setEditingTaskTitle] = useState<number | null>(null);
    const [editingWorkUnit, setEditingWorkUnit] = useState<{ taskOrder: number; index: number } | null>(null);

    // Calculate summary stats
    const stats = useMemo(() => {
        const totalTasks = edited.tasks.length;
        const totalWorkUnits = edited.workUnits.length;
        const totalMinutes = edited.tasks.reduce((sum, t) => sum + (t.estimatedTotalMinutes ?? 0), 0);

        // Estimate completion: assume 60 min/day average
        const daysNeeded = Math.ceil(totalMinutes / 60);
        const completionDate = new Date();
        completionDate.setDate(completionDate.getDate() + daysNeeded);

        return {
            totalTasks,
            totalWorkUnits,
            totalMinutes,
            daysNeeded,
            completionDate: completionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            weeksNeeded: Math.ceil(daysNeeded / 7),
        };
    }, [edited]);

    // Get work units for a specific task
    const getWorkUnitsForTask = (taskOrder: number) => {
        return edited.workUnits.filter(wu => wu.taskOrder === taskOrder);
    };

    // Handle task title edit
    const handleTaskTitleEdit = (taskIndex: number, newTitle: string) => {
        const newTasks = [...edited.tasks];
        newTasks[taskIndex] = { ...newTasks[taskIndex], title: newTitle };
        setEdited({ ...edited, tasks: newTasks });
        setEditingTaskTitle(null);
    };

    // Handle work unit title edit
    const handleWorkUnitTitleEdit = (taskOrder: number, wuIndex: number, newTitle: string) => {
        const workUnitsForTask = getWorkUnitsForTask(taskOrder);
        const actualWu = workUnitsForTask[wuIndex];
        if (!actualWu) return;

        const newWorkUnits = edited.workUnits.map(wu => {
            if (wu === actualWu) {
                return { ...wu, title: newTitle };
            }
            return wu;
        });
        setEdited({ ...edited, workUnits: newWorkUnits });
        setEditingWorkUnit(null);
    };

    // Handle work unit time edit
    const handleTimeEdit = (taskOrder: number, wuIndex: number, newMinutes: number) => {
        const workUnitsForTask = getWorkUnitsForTask(taskOrder);
        const actualWu = workUnitsForTask[wuIndex];
        if (!actualWu) return;

        const oldMinutes = actualWu.estimatedTotalMinutes ?? 0;
        const diff = newMinutes - oldMinutes;

        // Update work unit
        const newWorkUnits = edited.workUnits.map(wu => {
            if (wu === actualWu) {
                return { ...wu, estimatedTotalMinutes: newMinutes };
            }
            return wu;
        });

        // Update parent task total
        const newTasks = edited.tasks.map((t, i) => {
            if (i === taskOrder) {
                return { ...t, estimatedTotalMinutes: (t.estimatedTotalMinutes ?? 0) + diff };
            }
            return t;
        });

        setEdited({ tasks: newTasks, workUnits: newWorkUnits });
    };

    // Remove work unit
    const handleRemoveWorkUnit = (taskOrder: number, wuIndex: number) => {
        const workUnitsForTask = getWorkUnitsForTask(taskOrder);
        if (workUnitsForTask.length <= 1) return; // Keep at least one

        const actualWu = workUnitsForTask[wuIndex];
        if (!actualWu) return;

        const minutes = actualWu.estimatedTotalMinutes ?? 0;

        // Remove work unit
        const newWorkUnits = edited.workUnits.filter(wu => wu !== actualWu);

        // Update parent task total
        const newTasks = edited.tasks.map((t, i) => {
            if (i === taskOrder) {
                return { ...t, estimatedTotalMinutes: (t.estimatedTotalMinutes ?? 0) - minutes };
            }
            return t;
        });

        setEdited({ tasks: newTasks, workUnits: newWorkUnits });
    };

    // Validate before approval
    const validateBreakdown = (): string[] => {
        const issues: string[] = [];

        for (const task of edited.tasks) {
            const taskWUs = getWorkUnitsForTask(task.order);
            if (taskWUs.length === 0) {
                issues.push(`"${task.title}" has no actions`);
            }
        }

        if (edited.tasks.length < 2) {
            issues.push('Need at least 2 milestones for a complete plan');
        }

        return issues;
    };

    const validationIssues = validateBreakdown();

    // Format minutes to human readable
    const formatTime = (minutes: number) => {
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground mb-1">
                    Your Plan
                </h2>
                <p className="text-muted text-sm">
                    {goalTitle}
                </p>
            </div>

            {/* Summary Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-4"
            >
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-2xl font-bold text-foreground">{stats.totalTasks}</div>
                        <div className="text-xs text-muted">Milestones</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-foreground">{stats.totalWorkUnits}</div>
                        <div className="text-xs text-muted">Actions</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-foreground">~{stats.weeksNeeded}</div>
                        <div className="text-xs text-muted">Week{stats.weeksNeeded !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 text-center">
                    <span className="text-sm text-muted">
                        Target completion around <span className="font-medium text-foreground">{stats.completionDate}</span>
                    </span>
                </div>
            </motion.div>

            {/* Tasks List */}
            <div className="space-y-3">
                {edited.tasks.map((task, taskIndex) => {
                    const isExpanded = expandedTask === taskIndex;
                    const taskWorkUnits = getWorkUnitsForTask(taskIndex);

                    return (
                        <motion.div
                            key={taskIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: taskIndex * 0.05 }}
                            className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                        >
                            {/* Task Header */}
                            <button
                                onClick={() => setExpandedTask(isExpanded ? null : taskIndex)}
                                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className="text-slate-400 text-lg">
                                        {isExpanded ? '▼' : '▶'}
                                    </span>

                                    {editingTaskTitle === taskIndex ? (
                                        <input
                                            type="text"
                                            defaultValue={task.title}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                            onBlur={(e) => handleTaskTitleEdit(taskIndex, e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleTaskTitleEdit(taskIndex, e.currentTarget.value);
                                                }
                                                if (e.key === 'Escape') {
                                                    setEditingTaskTitle(null);
                                                }
                                            }}
                                            className="flex-1 px-2 py-1 border border-accent rounded text-sm font-medium"
                                        />
                                    ) : (
                                        <span
                                            className="font-medium text-foreground truncate cursor-text"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingTaskTitle(taskIndex);
                                            }}
                                        >
                                            {task.title}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 text-sm text-muted">
                                    <span>{taskWorkUnits.length} actions</span>
                                    <span className="text-slate-300">•</span>
                                    <span>{formatTime(task.estimatedTotalMinutes ?? 0)}</span>
                                </div>
                            </button>

                            {/* Work Units (Expandable) */}
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="border-t border-slate-100"
                                    >
                                        <div className="p-3 space-y-2 bg-slate-50">
                                            {taskWorkUnits.map((wu, wuIndex) => (
                                                <div
                                                    key={wuIndex}
                                                    className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 group"
                                                >
                                                    <span className="text-slate-300">→</span>

                                                    {editingWorkUnit?.taskOrder === taskIndex && editingWorkUnit?.index === wuIndex ? (
                                                        <input
                                                            type="text"
                                                            defaultValue={wu.title}
                                                            autoFocus
                                                            onBlur={(e) => handleWorkUnitTitleEdit(taskIndex, wuIndex, e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    handleWorkUnitTitleEdit(taskIndex, wuIndex, e.currentTarget.value);
                                                                }
                                                                if (e.key === 'Escape') {
                                                                    setEditingWorkUnit(null);
                                                                }
                                                            }}
                                                            className="flex-1 px-2 py-1 border border-accent rounded text-sm"
                                                        />
                                                    ) : (
                                                        <span
                                                            className="flex-1 text-sm text-foreground cursor-text"
                                                            onClick={() => setEditingWorkUnit({ taskOrder: taskIndex, index: wuIndex })}
                                                        >
                                                            {wu.title}
                                                        </span>
                                                    )}

                                                    {/* Time Selector */}
                                                    <select
                                                        value={wu.estimatedTotalMinutes}
                                                        onChange={(e) => handleTimeEdit(taskIndex, wuIndex, parseInt(e.target.value))}
                                                        className="text-xs text-muted bg-slate-100 border-0 rounded px-2 py-1 cursor-pointer hover:bg-slate-200 transition-colors"
                                                    >
                                                        <option value={15}>15 min</option>
                                                        <option value={20}>20 min</option>
                                                        <option value={30}>30 min</option>
                                                        <option value={45}>45 min</option>
                                                        <option value={60}>1 hour</option>
                                                        <option value={90}>1.5 hours</option>
                                                        <option value={120}>2 hours</option>
                                                    </select>

                                                    {/* Remove Button */}
                                                    {taskWorkUnits.length > 1 && (
                                                        <button
                                                            onClick={() => handleRemoveWorkUnit(taskIndex, wuIndex)}
                                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-all"
                                                            title="Remove action"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}

                                            {/* Task motivation */}
                                            {task.whyThisMatters && (
                                                <div className="text-xs text-muted italic pl-6 pt-2">
                                                    💡 {task.whyThisMatters}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {/* Validation Warning */}
            {validationIssues.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <span className="font-medium">Heads up:</span> {validationIssues.join('. ')}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={onCancel}
                    className="flex-1 py-3 border border-slate-200 text-muted rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                    Cancel
                </button>

                <button
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    className="flex-1 py-3 border border-slate-200 text-muted rounded-xl font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                    {isRegenerating ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin">⟳</span> Regenerating...
                        </span>
                    ) : (
                        '⟳ Try Again'
                    )}
                </button>

                <button
                    onClick={() => onApprove(edited)}
                    disabled={validationIssues.length > 0}
                    className="flex-1 py-3 bg-foreground text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ✓ Looks Good
                </button>
            </div>

            {/* Help Text */}
            <p className="text-center text-xs text-muted">
                Click any title to edit • Adjust times as needed • You can always change this later
            </p>
        </div>
    );
}
