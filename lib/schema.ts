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
    constraints?: {
        hoursPerWeek?: number;
        experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
        targetDate?: Date;
        scopeHint?: string;
        timeCommitment?: string;
    };
    // NEW: Intelligent Planning Fields
    ambiguityStatus?: 'clear' | 'needs_clarification' | 'clarified';
    category?: 'health' | 'career' | 'learning' | 'financial' | 'creative' | 'other';
    domain?: string; // Classified domain (e.g., 'programming', 'fitness')
}


/**
 * Task - Effort Container (Milestone)
 * A finite body of work under a goal representing an achievable milestone.
 * Tasks are NOT scheduled, NOT shown daily.
 *
 * Quality Fields:
 * - whyThisMatters: Brief encouragement about what completing this unlocks
 */
export interface Task {
    id: string;
    goalId: string;
    title: string;
    estimatedTotalMinutes?: number; // Optional - time estimation removed
    completedMinutes: number;
    order: number;
    // NEW: Intelligent Planning Fields
    phase?: string; // Flexible phase name (e.g., 'Research', 'Coding', 'Marketing')
    complexity?: 1 | 2 | 3;
    whyThisMatters?: string; // Encouragement/motivation for this milestone
    createdAt: string;
    updatedAt: string;
}

/**
 * WorkUnit - Action Structure
 * Defines how work happens inside a task.
 * WorkUnits are reusable and sliceable.
 * Progress is tracked here.
 *
 * Quality Fields (for Gentle Architect philosophy):
 * - firstAction: Tiny immediate step to reduce activation energy
 * - successSignal: Observable sign that this unit is complete
 */
export type WorkUnitKind = 'study' | 'practice' | 'build' | 'review' | 'explore';

export interface WorkUnit {
    id: string;
    taskId: string;
    title: string;
    estimatedTotalMinutes?: number; // Optional - time estimation removed
    completedMinutes: number;
    kind: WorkUnitKind;
    capabilityId?: string; // Canonical identifier for deduplication
    firstAction?: string;  // Tiny first step (startable in <2 min)
    successSignal?: string; // How user knows they're done
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
    minutes?: number;   // Optional — momentum planner doesn't set this
    label?: SliceLabel; // Optional — kept for legacy compat
    reason?: 'quick-win' | 'due-soon' | 'momentum'; // Optional
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


export interface DailyCompletion {
    date: string;
    planned: number;
    completed: number;
    completionRate: number; // 0-1
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
 * Check if a WorkUnit is complete
 * Without time estimates, completion is marked explicitly
 */
export function isWorkUnitComplete(unit: WorkUnit): boolean {
    // If no estimate, check if any work was logged (user marks complete)
    if (!unit.estimatedTotalMinutes) {
        return unit.completedMinutes > 0;
    }
    // Legacy: 85%+ of estimate = complete
    return unit.completedMinutes >= unit.estimatedTotalMinutes * 0.85;
}
