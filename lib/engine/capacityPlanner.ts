// SmallSteps Capacity Planner
// Selects daily tasks based on user capacity and effort distribution
// Prevents overload while maintaining progress

import type { Task } from '../schema';
import { isTaskEffectivelyComplete } from '../utils';

// ============================================
// Types
// ============================================

interface DailyTaskSelection {
    selectedTasks: Task[];
    totalMinutes: number;
    effortDistribution: {
        light: number;
        medium: number;
        heavy: number;
    };
    message: string;
}

// ============================================
// Effort Mapping
// ============================================

// Map slice labels to effort categories for capacity planning
function getEffortCategory(estimatedMinutes: number): 'light' | 'medium' | 'heavy' {
    if (estimatedMinutes <= 60) return 'light';
    if (estimatedMinutes <= 180) return 'medium';
    return 'heavy';
}

// ============================================
// Capacity Calculation
// ============================================

/**
 * Calculate user's daily capacity from completion history
 * Returns average daily capacity in minutes
 * @param completionHistory - Array of completed task records
 * @returns Estimated daily capacity (default 240 if no history)
 */
export function calculateCapacity(completionHistory: any[]): number {
    if (!completionHistory || completionHistory.length === 0) {
        // Default to 4 hours (240 minutes) for new users
        return 240;
    }

    // Group completions by date
    const dailyTotals: Record<string, number> = {};

    for (const record of completionHistory) {
        const date = record.date || record.completedAt?.split('T')[0];
        if (!date) continue;

        const minutes = record.minutesWorked || record.completedMinutes || 0;
        dailyTotals[date] = (dailyTotals[date] || 0) + minutes;
    }

    // Calculate average from last 7 days
    const dates = Object.keys(dailyTotals).sort().slice(-7);

    if (dates.length === 0) return 240;

    const totalMinutes = dates.reduce((sum, date) => sum + dailyTotals[date], 0);
    const avgMinutes = totalMinutes / dates.length;

    // Conservative estimate: use 80% of observed capacity
    // This accounts for variation and prevents burnout
    return Math.floor(avgMinutes * 0.8);
}

// ============================================
// Task Selection
// ============================================

/**
 * Select daily tasks using capacity-based allocation
 * 
 * Strategy:
 * 1. Prioritize incomplete tasks
 * 2. Max 1 heavy task per day
 * 3. Fill remaining capacity with medium/light tasks
 * 4. Return 3-5 tasks minimum
 * 
 * @param availableTasks - All incomplete tasks across goals
 * @param userCapacity - Daily capacity in minutes (default 240)
 * @returns Selected tasks and metadata
 */
export function selectDailyTasks(
    availableTasks: Task[],
    userCapacity: number = 240
): DailyTaskSelection {
    // Filter to incomplete tasks only
    const incompleteTasks = availableTasks.filter(task => !isTaskEffectivelyComplete(task));

    if (incompleteTasks.length === 0) {
        return {
            selectedTasks: [],
            totalMinutes: 0,
            effortDistribution: { light: 0, medium: 0, heavy: 0 },
            message: 'All tasks complete! Time to set new goals or enjoy the moment.',
        };
    }

    // Sort by priority (incomplete tasks with least progress first)
    const sortedTasks = [...incompleteTasks].sort((a, b) => {
        const progressA = a.completedMinutes / a.estimatedTotalMinutes;
        const progressB = b.completedMinutes / b.estimatedTotalMinutes;
        return progressA - progressB;
    });

    // Categorize tasks by effort
    const heavy = sortedTasks.filter(t => getEffortCategory(t.estimatedTotalMinutes - t.completedMinutes) === 'heavy');
    const medium = sortedTasks.filter(t => getEffortCategory(t.estimatedTotalMinutes - t.completedMinutes) === 'medium');
    const light = sortedTasks.filter(t => getEffortCategory(t.estimatedTotalMinutes - t.completedMinutes) === 'light');

    // Selection algorithm
    const selected: Task[] = [];
    let remainingCapacity = userCapacity;
    const distribution = { light: 0, medium: 0, heavy: 0 };

    // 1. Add at most 1 heavy task
    if (heavy.length > 0 && remainingCapacity >= 180) {
        const task = heavy[0];
        selected.push(task);
        const effort = Math.min(task.estimatedTotalMinutes - task.completedMinutes, remainingCapacity);
        remainingCapacity -= effort;
        distribution.heavy++;
    }

    // 2. Fill with medium tasks (up to 2-3)
    for (const task of medium) {
        if (selected.length >= 5) break;
        const effortNeeded = task.estimatedTotalMinutes - task.completedMinutes;
        if (effortNeeded <= remainingCapacity) {
            selected.push(task);
            remainingCapacity -= effortNeeded;
            distribution.medium++;
        }
    }

    // 3. Fill with light tasks (up to 3-4)
    for (const task of light) {
        if (selected.length >= 6) break;
        const effortNeeded = task.estimatedTotalMinutes - task.completedMinutes;
        if (effortNeeded <= remainingCapacity) {
            selected.push(task);
            remainingCapacity -= effortNeeded;
            distribution.light++;
        }
    }

    // Ensure minimum of 3 tasks if available
    if (selected.length < 3 && incompleteTasks.length >= 3) {
        for (const task of sortedTasks) {
            if (selected.includes(task)) continue;
            selected.push(task);
            if (selected.length >= 3) break;
        }
    }

    const totalMinutes = selected.reduce((sum, task) => {
        return sum + Math.min(task.estimatedTotalMinutes - task.completedMinutes, userCapacity);
    }, 0);

    // Generate encouraging message
    let message = `Planned ${selected.length} task${selected.length > 1 ? 's' : ''} `;
    if (distribution.heavy > 0) {
        message += 'with a focus session';
    } else if (distribution.medium > 1) {
        message += 'for steady progress';
    } else {
        message += 'to build momentum';
    }

    return {
        selectedTasks: selected,
        totalMinutes,
        effortDistribution: distribution,
        message,
    };
}

/**
 * Suggest optimal capacity for a new user based on goal complexity
 */
export function suggestInitialCapacity(goalCount: number, avgTaskMinutes: number): number {
    // More goals = potentially more complexity, suggest lower capacity
    if (goalCount > 3) return 180; // 3 hours
    if (goalCount > 1) return 210; // 3.5 hours

    // Simpler goals with lighter tasks = can handle more
    if (avgTaskMinutes < 120) return 270; // 4.5 hours

    return 240; // Default 4 hours
}
