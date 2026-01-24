// SmallSteps IndexedDB Schema Types
// Local-first data architecture for cognitive offloading

// ============================================
// Core Domain Types
// ============================================

export interface Goal {
    id: string;
    content: string;
    clarifiedContent?: string;
    targetDate?: string; // YYYY-MM-DD, optional
    estimatedTargetDate?: string; // AI-suggested if user doesn't provide
    status: 'active' | 'paused' | 'completed';
    createdAt: string;
    updatedAt: string;
}

export interface Task {
    id: string;
    goalId: string;
    content: string;
    category?: string; // exercise, nutrition, learning, etc.

    // Time-based progress model (internal)
    estimatedTotalMinutes: number;
    completedMinutes: number;

    // User-facing effort label
    effortLabel: 'light' | 'medium' | 'heavy';

    isRecurring: boolean;
    order: number;

    // Skip tracking for adaptation
    skipCount: number;
    lastSkippedAt?: string;

    createdAt: string;
    updatedAt: string;
}

export interface DailyAllocation {
    date: string; // YYYY-MM-DD
    taskIds: string[];
    estimatedLoad: number; // Total effort units for the day
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

export interface AISettings {
    id: 'ai-settings'; // Singleton
    provider: 'claude' | 'gemini' | 'openai' | null;
    // API keys stored in memory only during session
    // We store a flag indicating if key was set, not the key itself
    hasApiKey: boolean;
    lastProvider?: string;
}

// ============================================
// Effort Label Mapping (Internal Use)
// ============================================

export const EFFORT_MAPPING = {
    light: { minMinutes: 5, maxMinutes: 10, avgMinutes: 7 },
    medium: { minMinutes: 20, maxMinutes: 30, avgMinutes: 25 },
    heavy: { minMinutes: 60, maxMinutes: 90, avgMinutes: 75 },
} as const;

export function minutesToEffortLabel(minutes: number): Task['effortLabel'] {
    if (minutes <= 15) return 'light';
    if (minutes <= 45) return 'medium';
    return 'heavy';
}

export function effortLabelToMinutes(label: Task['effortLabel']): number {
    return EFFORT_MAPPING[label].avgMinutes;
}

// ============================================
// Task Completion Logic
// ============================================

// Task is considered "complete" at ~85-90% of estimated time
export const COMPLETION_THRESHOLD = 0.85;

export function isTaskEffectivelyComplete(task: Task): boolean {
    if (task.estimatedTotalMinutes === 0) return false;
    return task.completedMinutes >= task.estimatedTotalMinutes * COMPLETION_THRESHOLD;
}

export function getTaskProgressPercentage(task: Task): number {
    if (task.estimatedTotalMinutes === 0) return 0;
    return Math.min(100, (task.completedMinutes / task.estimatedTotalMinutes) * 100);
}

// ============================================
// ID Generation
// ============================================

export function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// Date Utilities
// ============================================

export function getLocalDateString(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
}

export function getISOTimestamp(): string {
    return new Date().toISOString();
}
