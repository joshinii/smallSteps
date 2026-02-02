// SmallSteps Schema Types
// Effort-Flow Architecture: Goal → Task → WorkUnit → Slice

// ============================================
// Core Domain Types
// ============================================

/**
 * Goal - User intention with optional time horizon
 * Goals define WHAT the user wants to achieve
 */
export interface Goal {
    id: string;
    title: string;
    targetDate?: string; // Optional soft constraint (not a deadline)
    estimatedTargetDate?: string; // AI suggestion
    lifelong?: boolean;
    status: 'active' | 'paused' | 'drained';
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Task - Effort Container
 * A finite body of work under a goal.
 * Tasks are NOT scheduled, NOT shown daily.
 */
export interface Task {
    id: string;
    goalId: string;
    title: string;
    estimatedTotalMinutes: number;
    completedMinutes: number;
    order: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * WorkUnit - Action Structure
 * Defines how work happens inside a task.
 * WorkUnits are reusable and sliceable.
 * Progress is tracked here.
 */
export type WorkUnitKind = 'study' | 'practice' | 'build' | 'review' | 'explore';

export interface WorkUnit {
    id: string;
    taskId: string;
    title: string;
    estimatedTotalMinutes: number;
    completedMinutes: number;
    kind: WorkUnitKind;
    capabilityId?: string; // Canonical identifier for deduplication
    createdAt: string;
    updatedAt: string;
}

/**
 * Slice - Daily Action (Ephemeral)
 * Generated fresh every day, NOT stored long-term.
 * Shown to user in Today view.
 */
export type SliceLabel = 'warm-up' | 'settle' | 'dive';

export interface Slice {
    workUnitId: string;
    workUnit: WorkUnit; // Populated for display
    task: Task;         // Populated for context
    goal: Goal;         // Populated for context
    minutes: number;
    label: SliceLabel;
}

/**
 * Habit - Reflection-only recurring action
 * Habits do NOT consume capacity, do NOT affect planning.
 * Separate from the effort-flow system.
 */
export interface Habit {
    id: string;
    title: string;
    cadence: 'daily';
    createdAt: string;
    updatedAt: string;
}

export interface HabitLog {
    id: string;
    habitId: string;
    date: string; // YYYY-MM-DD
    completed: boolean;
    createdAt: string;
}

// ============================================
// Planning Types
// ============================================

export type DayMode = 'light' | 'medium' | 'focus';

export interface DailyPlan {
    date: string;
    mode: DayMode;
    slices: Slice[];
    totalMinutes: number;
    capacityMinutes: number;
}

// ============================================
// Internal/Legacy Types
// ============================================

export interface DailyAllocation {
    date: string; // YYYY-MM-DD
    workUnitIds: string[];
    sliceMinutes: number[]; // Parallel array with minutes per work unit
    estimatedLoad: number;
    mode?: DayMode;
    completedAt?: string;
    createdAt: string;
}

export interface TaskProgress {
    id: string;
    workUnitId: string;
    date: string;
    minutesWorked: number;
    createdAt: string;
}

export interface DailyMoment {
    date: string;
    moment: string;
    createdAt: string;
    updatedAt: string;
}

export interface AISettings {
    id: 'ai-settings';
    provider: 'claude' | 'gemini' | 'openai' | 'lmstudio' | null;
    hasApiKey: boolean;
    lastProvider?: string;
}

// ============================================
// Helpers
// ============================================

/**
 * Get slice label from minutes
 */
export function getSliceLabel(minutes: number): SliceLabel {
    if (minutes <= 20) return 'warm-up';
    if (minutes <= 45) return 'settle';
    return 'dive';
}

/**
 * Check if a WorkUnit is effectively complete (85%+ done)
 */
export function isWorkUnitComplete(unit: WorkUnit): boolean {
    return unit.completedMinutes >= unit.estimatedTotalMinutes * 0.85;
}
