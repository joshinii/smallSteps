import { tasksDB, workUnitsDB } from './db';
import { generateId, getISOTimestamp } from './utils';
import { isTaskEffectivelyComplete } from './utils';

export async function repairWorkUnits(): Promise<number> {
    console.log('[Migration] Starting WorkUnit repair...');
    const allTasks = await tasksDB.getAll();
    const allWorkUnits = await workUnitsDB.getAll();

    const existingWorkUnitTaskIds = new Set(allWorkUnits.map(u => u.taskId));
    let fixedCount = 0;

    for (const task of allTasks) {
        if (!existingWorkUnitTaskIds.has(task.id)) {
            // Task has no WorkUnit - create default
            console.log(`[Migration] Fixing task: ${task.title} (${task.id})`);

            await workUnitsDB.create({
                taskId: task.id,
                title: task.title,
                estimatedTotalMinutes: task.estimatedTotalMinutes || 60,
                completedMinutes: task.completedMinutes || 0,
                kind: 'build',
                firstAction: 'Start working on this task',
                successSignal: 'Task is complete',
            });
            fixedCount++;
        }
    }

    if (fixedCount > 0) {
        console.log(`[Migration] Repaired ${fixedCount} tasks with missing WorkUnits.`);
    } else {
        console.log('[Migration] All tasks have WorkUnits. No repair needed.');
    }

    return fixedCount;
}
