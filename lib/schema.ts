// SmallSteps IndexedDB Schema Types
// Local-first data architecture for cognitive offloading

// ============================================
// Core Domain Types
// ============================================

export interface Goal {
    id: string;
    content: string;
    clarifiedContent?: string;
    targetDate?: string; // Internal pressure weight only. NOT a deadline.
    estimatedTargetDate?: string; // AI-suggested for internal calculations
    lifelong?: boolean; // true for ongoing goals (daily habits)
    status: 'active' | 'paused' | 'drained'; // 'drained' replaces 'completed' for effort flow
    completedAt?: string; // When all effort was drained

    // Recurring goal progress tracking
    totalRecurringDaysTarget?: number; // For recurring goals: how many days to complete (e.g., "30 days of exercise")
    completedRecurringDays?: number; // How many days have been completed
    recurringProgressPercent?: number; // Calculated: completedDays / targetDays * 100

    createdAt: string;
    updatedAt: string;
}

export interface Task {
    id: string;
    goalId: string;
    content: string;
    category?: string; // exercise, nutrition, learning, etc.
    frequency?: 'daily' | 'weekdays' | 'weekends' | 'weekly' | string;

    // Effort Reservoir Model
    // Task is a bucket of time. It is "done" when empty.
    estimatedTotalMinutes: number; // Total volume of the reservoir
    completedMinutes: number; // Amount drained so far

    // User-facing effort label
    effortLabel: 'warm-up' | 'settle' | 'dive';

    isRecurring: boolean;
    order: number;

    // Skip tracking for adaptation
    skipCount: number;
    lastSkippedAt?: string;

    // Soft delete
    archivedAt?: string;

    createdAt: string;
    updatedAt: string;
}

export interface DailyAllocation {
    date: string; // YYYY-MM-DD
    taskIds: string[];
    estimatedLoad: number; // Total effort units for the day
    dayType?: 'gentle' | 'balanced' | 'focused' | 'energetic' | 'recovery';
    completedAt?: string;
    createdAt: string;
}

export interface TaskProgress {
    id: string;
    taskId: string;
    date: string; // YYYY-MM-DD
    minutesWorked: number;
    createdAt: string;
}

export interface DailyMoment {
    date: string; // YYYY-MM-DD (primary key)
    moment: string; // "One small moment worth noting"
    createdAt: string;
    updatedAt: string;
}

export interface RecurringTaskHistory {
    id: string;
    taskId: string;
    goalId: string;
    date: string; // YYYY-MM-DD
    completed: boolean; // true if task was completed that day
    completedMinutes: number; // how much time was spent
    skipped: boolean; // true if explicitly skipped
    createdAt: string;
}

export interface AISettings {
    id: 'ai-settings'; // Singleton
    provider: 'claude' | 'gemini' | 'openai' | null;
    // API keys stored in memory only during session
    // We store a flag indicating if key was set, not the key itself
    hasApiKey: boolean;
    lastProvider?: string;
}

// ============================================
// Task Queue System (Internal)
// ============================================

/**
 * Effort level for queue categorization
 * Maps from effortLabel: warm-up → light, settle → medium, dive → heavy
 */
export type EffortLevel = 'light' | 'medium' | 'heavy';

/**
 * Entry in the task queue system
 * Used internally for scheduling, not exposed to user
 */
export interface TaskQueueEntry {
    taskId: string;          // Primary key, references Task.id
    goalId: string;          // For quick filtering when goal is edited/deleted
    effortLevel: EffortLevel;

    // Priority factors (all internal, not shown to user)
    goalTargetDate?: string; // Earlier deadline = higher priority
    skipCount: number;       // Tracks how often this task was skipped
    lastSkippedAt?: string;  // When it was last skipped
    queuedAt: string;        // When added to queue (ISO timestamp)
    waitingDays: number;     // Days in queue - increases priority over time

    createdAt: string;
    updatedAt: string;
}

/**
 * Maps effortLabel to queue effort level
 */
export function effortLabelToLevel(label: Task['effortLabel']): EffortLevel {
    switch (label) {
        case 'warm-up': return 'light';
        case 'settle': return 'medium';
        case 'dive': return 'heavy';
        default: return 'medium';
    }
}
