import { completionRecordsDB, plannerSettingsDB } from '@/lib/db';
import type { DailyCompletion } from '@/lib/schema';
import { getLocalDateString } from '@/lib/utils';

// ============================================
// Recording
// ============================================

export async function recordDailyCompletion(
    date: string,
    planned: number,
    completed: number
): Promise<void> {
    const record: DailyCompletion = {
        date,
        planned,
        completed,
        completionRate: planned > 0 ? completed / planned : 0,
    };
    await completionRecordsDB.save(record);

    // Check for adaptation immediately after recording
    await adjustAdaptiveCount();
}

// ============================================
// Analysis
// ============================================

export async function getRecentCompletionRate(days: number = 7): Promise<number> {
    const records = await completionRecordsDB.getAll();
    if (records.length === 0) return 0.8; // Assume good standing for new users (not 1.0 to avoid instant jump)

    // Filter for recent records
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() - days);

    const recent = records
        .filter(r => new Date(r.date) >= cutoff);

    if (recent.length === 0) return 0.8;

    const totalPlanned = recent.reduce((sum, r) => sum + r.planned, 0);
    const totalCompleted = recent.reduce((sum, r) => sum + r.completed, 0);

    return totalPlanned > 0 ? totalCompleted / totalPlanned : 0;
}

// ============================================
// Adaptive Logic
// ============================================

export async function getCurrentTargetCount(): Promise<number> {
    const settings = await plannerSettingsDB.get();
    return settings?.targetWorkUnits || 3; // Default start
}

export async function saveTargetCount(count: number): Promise<void> {
    await plannerSettingsDB.save(count);
}

/**
 * Calculates and potentially updates the adaptive work unit count.
 * Should be called when completion is recorded or when generating a plan.
 */
export async function adjustAdaptiveCount(): Promise<number> {
    const currentCount = await getCurrentTargetCount();
    const rate = await getRecentCompletionRate(7);

    let newCount = currentCount;

    // Increase if consistent high performance
    // (Rate >= 90% and we aren't at max)
    if (rate >= 0.9 && currentCount < 7) {
        newCount = currentCount + 1;
    }
    // Decrease if struggling
    // (Rate < 50% and we aren't at min)
    else if (rate < 0.5 && currentCount > 2) {
        newCount = currentCount - 1;
    }

    // Only save if changed
    if (newCount !== currentCount) {
        await saveTargetCount(newCount);
        console.log(`[Adaptive] Adjusted count from ${currentCount} to ${newCount} (Rate: ${rate.toFixed(2)})`);
    }

    return newCount;
}

/**
 * Get the count to use for today's plan.
 * Does not trigger adjustment, just reads current state.
 */
export async function getAdaptiveCountForToday(): Promise<number> {
    return getCurrentTargetCount();
}
