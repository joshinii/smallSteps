import { EFFORT_MAPPING, COMPLETION_THRESHOLD } from './constants';
import type { Task } from './schema';

/**
 * Returns the current date in YYYY-MM-DD format based on local time.
 */
export function formatDisplayDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
}

/**
 * Returns the current date in YYYY-MM-DD format based on local time.
 */
export function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Returns the current date in YYYY-MM-DD format based on local time.
 * Alias for getLocalDateString.
 */
export function getLocalDate(): string {
    return getLocalDateString();
}

/**
 * Parses a YYYY-MM-DD string into a Date object in local time (midnight).
 * Solves the issue where new Date("YYYY-MM-DD") uses UTC.
 */
export function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function getISOTimestamp(): string {
    return new Date().toISOString();
}

export function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export function minutesToEffortLabel(minutes: number): Task['effortLabel'] {
    if (minutes <= 15) return 'warm-up';
    if (minutes <= 45) return 'settle';
    return 'dive';
}

export function effortLabelToMinutes(label: Task['effortLabel']): number {
    return EFFORT_MAPPING[label].avgMinutes;
}

export function isTaskEffectivelyComplete(task: Task): boolean {
    if (task.estimatedTotalMinutes === 0) return false;
    return task.completedMinutes >= task.estimatedTotalMinutes * COMPLETION_THRESHOLD;
}

export function getTaskProgressPercentage(task: Task): number {
    if (task.estimatedTotalMinutes === 0) return 0;
    return Math.min(100, (task.completedMinutes / task.estimatedTotalMinutes) * 100);
}
