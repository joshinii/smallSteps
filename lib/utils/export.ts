// SmallSteps Data Export/Import Utilities
// Backup and restore all user data

import { goalsDB, tasksDB, workUnitsDB, habitsDB, habitLogsDB, dailyAllocationsDB, taskProgressDB, dailyMomentsDB, aiSettingsDB } from '@/lib/db';
import type { Goal, Task, WorkUnit, Habit, HabitLog, DailyAllocation, TaskProgress, DailyMoment, AISettings } from '@/lib/schema';

// ============================================
// Types
// ============================================

export interface ExportData {
    version: number;
    exportDate: string;
    appVersion: string;
    goals: Goal[];
    tasks: Task[];
    workUnits: WorkUnit[];
    habits: Habit[];
    habitLogs: HabitLog[];
    dailyAllocations: DailyAllocation[];
    taskProgress: TaskProgress[];
    dailyMoments: DailyMoment[];
    aiSettings?: AISettings;
}

export interface ImportResult {
    success: boolean;
    counts: {
        goals: number;
        tasks: number;
        workUnits: number;
        habits: number;
        habitLogs: number;
        dailyAllocations: number;
        taskProgress: number;
        dailyMoments: number;
    };
    error?: string;
}

// ============================================
// Export Functions
// ============================================

/**
 * Export all user data to JSON string
 */
export async function exportAllData(): Promise<string> {
    console.log('📤 EXPORT: Starting data export...');

    const [
        goals,
        tasks,
        workUnits,
        habits,
        habitLogs,
        dailyAllocations,
        taskProgress,
        dailyMoments,
        aiSettings,
    ] = await Promise.all([
        goalsDB.getAll(),
        tasksDB.getAll(),
        workUnitsDB.getAll(),
        habitsDB.getAll(),
        getAllHabitLogs(),
        dailyAllocationsDB.getAll(),
        taskProgressDB.getAll(),
        dailyMomentsDB.getAll(),
        aiSettingsDB.get(),
    ]);

    const data: ExportData = {
        version: 1,
        exportDate: new Date().toISOString(),
        appVersion: '1.0.0',
        goals,
        tasks,
        workUnits,
        habits,
        habitLogs,
        dailyAllocations,
        taskProgress,
        dailyMoments,
        aiSettings,
    };

    console.log(`📤 EXPORT: Exported ${goals.length} goals, ${tasks.length} tasks, ${workUnits.length} work units`);

    return JSON.stringify(data, null, 2);
}

/**
 * Helper to get all habit logs (no getAll in habitLogsDB)
 */
async function getAllHabitLogs(): Promise<HabitLog[]> {
    const habits = await habitsDB.getAll();
    const allLogs: HabitLog[] = [];

    for (const habit of habits) {
        const logs = await habitLogsDB.getByHabitId(habit.id);
        allLogs.push(...logs);
    }

    return allLogs;
}

/**
 * Download export as JSON file
 */
export function downloadExport(jsonString: string): void {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const filename = `smallsteps-backup-${date}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    console.log(`📤 EXPORT: Downloaded ${filename}`);
}

/**
 * Export and download in one call
 */
export async function exportAndDownload(): Promise<void> {
    const json = await exportAllData();
    downloadExport(json);
}

// ============================================
// Import Functions
// ============================================

/**
 * Validate import data structure
 */
function validateImportData(data: any): data is ExportData {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== 1) return false;
    if (!Array.isArray(data.goals)) return false;
    if (!Array.isArray(data.tasks)) return false;
    if (!Array.isArray(data.workUnits)) return false;
    return true;
}

/**
 * Import data from JSON string
 * WARNING: This replaces all existing data!
 */
export async function importData(jsonString: string): Promise<ImportResult> {
    console.log('📥 IMPORT: Starting data import...');

    try {
        const data = JSON.parse(jsonString);

        if (!validateImportData(data)) {
            return {
                success: false,
                counts: { goals: 0, tasks: 0, workUnits: 0, habits: 0, habitLogs: 0, dailyAllocations: 0, taskProgress: 0, dailyMoments: 0 },
                error: 'Invalid backup file format or incompatible version',
            };
        }

        // Clear existing data first
        await clearAllData();

        // Import in order: parents before children
        // Goals
        for (const goal of data.goals) {
            await goalsDB.update(goal.id, goal);
        }

        // Tasks
        for (const task of data.tasks) {
            await tasksDB.update(task.id, task);
        }

        // WorkUnits
        for (const workUnit of data.workUnits) {
            await workUnitsDB.update(workUnit.id, workUnit);
        }

        // Habits
        if (data.habits) {
            for (const habit of data.habits) {
                await habitsDB.update(habit.id, habit);
            }
        }

        // HabitLogs
        if (data.habitLogs) {
            for (const log of data.habitLogs) {
                await habitLogsDB.create(log);
            }
        }

        // DailyAllocations
        if (data.dailyAllocations) {
            for (const allocation of data.dailyAllocations) {
                await dailyAllocationsDB.create(allocation);
            }
        }

        // TaskProgress
        if (data.taskProgress) {
            for (const progress of data.taskProgress) {
                await taskProgressDB.create(progress);
            }
        }

        // DailyMoments
        if (data.dailyMoments) {
            for (const moment of data.dailyMoments) {
                await dailyMomentsDB.upsert(moment.date, moment.moment);
            }
        }

        // AI Settings
        if (data.aiSettings) {
            await aiSettingsDB.save(data.aiSettings);
        }

        const result: ImportResult = {
            success: true,
            counts: {
                goals: data.goals.length,
                tasks: data.tasks.length,
                workUnits: data.workUnits.length,
                habits: data.habits?.length || 0,
                habitLogs: data.habitLogs?.length || 0,
                dailyAllocations: data.dailyAllocations?.length || 0,
                taskProgress: data.taskProgress?.length || 0,
                dailyMoments: data.dailyMoments?.length || 0,
            },
        };

        console.log(`📥 IMPORT: Imported ${result.counts.goals} goals, ${result.counts.tasks} tasks, ${result.counts.workUnits} work units`);

        return result;

    } catch (error) {
        console.error('📥 IMPORT: Error:', error);
        return {
            success: false,
            counts: { goals: 0, tasks: 0, workUnits: 0, habits: 0, habitLogs: 0, dailyAllocations: 0, taskProgress: 0, dailyMoments: 0 },
            error: error instanceof Error ? error.message : 'Failed to parse backup file',
        };
    }
}

/**
 * Clear all data from database
 * Used before import to ensure clean state
 */
async function clearAllData(): Promise<void> {
    console.log('🗑️ CLEAR: Clearing all data...');

    // Get all IDs and delete
    const goals = await goalsDB.getAll();
    for (const goal of goals) {
        await goalsDB.delete(goal.id); // This cascades to tasks and work units
    }

    const habits = await habitsDB.getAll();
    for (const habit of habits) {
        await habitsDB.delete(habit.id); // This cascades to habit logs
    }

    const allocations = await dailyAllocationsDB.getAll();
    for (const allocation of allocations) {
        await dailyAllocationsDB.delete(allocation.date);
    }

    const moments = await dailyMomentsDB.getAll();
    for (const moment of moments) {
        await dailyMomentsDB.delete(moment.date);
    }

    console.log('🗑️ CLEAR: All data cleared');
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}
