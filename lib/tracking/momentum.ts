// SmallSteps Goal Momentum Tracker
// Backend-only priority signal derived from existing DB data.
// No user-visible scores — purely feeds the daily planner.

import { isWorkUnitComplete } from '../schema';
import type { WorkUnit } from '../schema';
import { goalsDB, tasksDB, workUnitsDB } from '../db';

// ============================================
// Types
// ============================================

export interface GoalMomentum {
    goalId: string;
    lastWorkedDate: Date | null;
    completionsLast7Days: number;
    totalCompleted: number;
    totalWorkUnits: number;
    completionPercentage: number;
    daysSinceLastWork: number;
    momentumScore: number;
}

// ============================================
// Momentum Score Formula
// ============================================

function calculateMomentumScore(data: Omit<GoalMomentum, 'momentumScore'>): number {
    let score = 50; // base

    // Hot streak boost (worked today or yesterday)
    if (data.daysSinceLastWork === 0) {
        score += 30;
    } else if (data.daysSinceLastWork === 1) {
        score += 20;
    }

    // Recent activity (last 7 days)
    score += data.completionsLast7Days * 5;

    // Near completion boost (80%+)
    if (data.completionPercentage >= 0.8) {
        score += 20;
    }

    // Neglect penalty (not worked in 3+ days)
    if (data.daysSinceLastWork >= 3) {
        score -= 15;
    }

    return Math.max(0, score);
}

// ============================================
// Data Gathering
// ============================================

/**
 * Collect all work units across tasks for a given goal.
 */
async function getWorkUnitsForGoal(goalId: string): Promise<WorkUnit[]> {
    const tasks = await tasksDB.getByGoalId(goalId);
    const allWorkUnits: WorkUnit[] = [];

    for (const task of tasks) {
        const wus = await workUnitsDB.getByTaskId(task.id);
        allWorkUnits.push(...wus);
    }

    return allWorkUnits;
}

/**
 * Calculate days between a date and today.
 * Returns Infinity if date is null.
 */
function daysSince(date: Date | null): number {
    if (!date) return Infinity;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// ============================================
// Core API
// ============================================

/**
 * Calculate momentum for a single goal.
 * Derives everything from existing WorkUnit data.
 */
export async function calculateGoalMomentum(goalId: string): Promise<GoalMomentum> {
    const workUnits = await getWorkUnitsForGoal(goalId);

    const totalWorkUnits = workUnits.length;
    const completed = workUnits.filter(wu => isWorkUnitComplete(wu));
    const totalCompleted = completed.length;
    const completionPercentage = totalWorkUnits > 0 ? totalCompleted / totalWorkUnits : 0;

    // Find last worked date from completed units' updatedAt
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let lastWorkedDate: Date | null = null;
    let completionsLast7Days = 0;

    for (const wu of completed) {
        const updated = new Date(wu.updatedAt);

        // Track most recent completion
        if (!lastWorkedDate || updated > lastWorkedDate) {
            lastWorkedDate = updated;
        }

        // Count completions in last 7 days
        if (updated >= sevenDaysAgo) {
            completionsLast7Days++;
        }
    }

    const daysSinceLastWork = daysSince(lastWorkedDate);

    // Cap daysSinceLastWork for scoring (avoid Infinity)
    const cappedDays = daysSinceLastWork === Infinity ? 999 : daysSinceLastWork;

    const baseData = {
        goalId,
        lastWorkedDate,
        completionsLast7Days,
        totalCompleted,
        totalWorkUnits,
        completionPercentage,
        daysSinceLastWork: cappedDays,
    };

    return {
        ...baseData,
        momentumScore: calculateMomentumScore(baseData),
    };
}

/**
 * Calculate momentum for all active goals.
 * Primary entry point for the daily planner.
 */
export async function getAllGoalMomentum(): Promise<GoalMomentum[]> {
    const activeGoals = await goalsDB.getActive();
    const results: GoalMomentum[] = [];

    for (const goal of activeGoals) {
        results.push(await calculateGoalMomentum(goal.id));
    }

    return results;
}

// ============================================
// Helpers
// ============================================

/**
 * Sort goals by momentum score (highest first).
 * Goals the user is actively working on float to the top.
 */
export function sortByMomentum(goals: GoalMomentum[]): GoalMomentum[] {
    return [...goals].sort((a, b) => b.momentumScore - a.momentumScore);
}

/**
 * Check if a goal needs gentle attention.
 * True when idle 3+ days and not near completion.
 */
export function needsAttention(momentum: GoalMomentum): boolean {
    return momentum.daysSinceLastWork >= 3
        && momentum.completionPercentage < 0.8;
}
