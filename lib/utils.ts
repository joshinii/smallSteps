import { COMPLETION_THRESHOLD } from './constants';
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

/**
 * Convert minutes to effort label for internal planning use.
 * Thresholds: LIGHT <= 60 min, MEDIUM 61-360 min, HEAVY > 360 min
 */
import type { SliceLabel } from './schema';

export function minutesToEffortLabel(minutes: number): SliceLabel {
    if (minutes <= 60) return 'warm-up';
    if (minutes <= 360) return 'settle';
    return 'dive';
}

// TIME ESTIMATION REMOVED - use defaults for optional time fields
export function isTaskEffectivelyComplete(task: Task): boolean {
    const estimated = task.estimatedTotalMinutes ?? 60;
    if (estimated === 0) return false;
    return task.completedMinutes >= estimated * COMPLETION_THRESHOLD;
}

export function getTaskProgressPercentage(task: Task): number {
    const estimated = task.estimatedTotalMinutes ?? 60;
    if (estimated === 0) return 0;
    return Math.min(100, (task.completedMinutes / estimated) * 100);
}

/**
 * Format effort in a calm, human-readable way.
 * Examples: "~30 min", "~2 hrs", "~10 hrs"
 */
export function formatEffortDisplay(minutes: number): string {
    if (minutes < 60) return `~${minutes} min`;
    const hours = Math.round(minutes / 60);
    return `~${hours} hr${hours > 1 ? 's' : ''}`;
}
