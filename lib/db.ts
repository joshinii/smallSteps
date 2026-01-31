// SmallSteps IndexedDB Database Layer
// Local-first storage for cognitive offloading

import {
    Goal,
    Task,
    DailyAllocation,
    TaskProgress,
    DailyMoment,
    RecurringTaskHistory,
    AISettings,
    TaskQueueEntry,
    EffortLevel,
} from './schema';
import {
    generateId,
    getISOTimestamp,
} from './utils';

const DB_NAME = 'smallsteps-db';
const DB_VERSION = 3; // Incremented for taskQueue store

// ============================================
// Database Initialization
// ============================================

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Goals store
            if (!db.objectStoreNames.contains('goals')) {
                const goalsStore = db.createObjectStore('goals', { keyPath: 'id' });
                goalsStore.createIndex('status', 'status', { unique: false });
                goalsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Tasks store
            if (!db.objectStoreNames.contains('tasks')) {
                const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
                tasksStore.createIndex('goalId', 'goalId', { unique: false });
                tasksStore.createIndex('isRecurring', 'isRecurring', { unique: false });
                tasksStore.createIndex('effortLabel', 'effortLabel', { unique: false });
            }

            // Daily allocations store
            if (!db.objectStoreNames.contains('dailyAllocations')) {
                db.createObjectStore('dailyAllocations', { keyPath: 'date' });
            }

            // Task progress store
            if (!db.objectStoreNames.contains('taskProgress')) {
                const progressStore = db.createObjectStore('taskProgress', { keyPath: 'id' });
                progressStore.createIndex('taskId', 'taskId', { unique: false });
                progressStore.createIndex('date', 'date', { unique: false });
                progressStore.createIndex('taskId_date', ['taskId', 'date'], { unique: true });
            }

            // Daily moments store
            if (!db.objectStoreNames.contains('dailyMoments')) {
                db.createObjectStore('dailyMoments', { keyPath: 'date' });
            }

            // AI settings store (singleton)
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }

            // Recurring task history store
            if (!db.objectStoreNames.contains('recurringTaskHistory')) {
                const historyStore = db.createObjectStore('recurringTaskHistory', { keyPath: 'id' });
                historyStore.createIndex('taskId', 'taskId', { unique: false });
                historyStore.createIndex('goalId', 'goalId', { unique: false });
                historyStore.createIndex('date', 'date', { unique: false });
                historyStore.createIndex('taskId_date', ['taskId', 'date'], { unique: true });
            }

            // Task queue store (for persistent scheduling)
            if (!db.objectStoreNames.contains('taskQueue')) {
                const queueStore = db.createObjectStore('taskQueue', { keyPath: 'taskId' });
                queueStore.createIndex('goalId', 'goalId', { unique: false });
                queueStore.createIndex('effortLevel', 'effortLevel', { unique: false });
            }
        };
    });
}

// ============================================
// Generic CRUD Helpers
// ============================================

async function getAll<T>(storeName: string): Promise<T[]> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function put<T>(storeName: string, item: T): Promise<T> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve(item);
        request.onerror = () => reject(request.error);
    });
}

async function deleteById(storeName: string, id: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getByIndex<T>(
    storeName: string,
    indexName: string,
    value: IDBValidKey
): Promise<T[]> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ============================================
// Goals CRUD
// ============================================

export const goalsDB = {
    async getAll(): Promise<Goal[]> {
        return getAll<Goal>('goals');
    },

    async getById(id: string): Promise<Goal | undefined> {
        return getById<Goal>('goals', id);
    },

    async getActive(): Promise<Goal[]> {
        return getByIndex<Goal>('goals', 'status', 'active');
    },

    async create(data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Goal> {
        const goal: Goal = {
            ...data,
            id: generateId(),
            createdAt: getISOTimestamp(),
            updatedAt: getISOTimestamp(),
        };
        return put('goals', goal);
    },

    async update(id: string, data: Partial<Goal>): Promise<Goal | undefined> {
        const existing = await getById<Goal>('goals', id);
        if (!existing) return undefined;
        const updated: Goal = {
            ...existing,
            ...data,
            id,
            updatedAt: getISOTimestamp(),
        };
        return put('goals', updated);
    },

    async delete(id: string): Promise<void> {
        // Also delete associated tasks
        const goalTasks = await tasksDB.getByGoalId(id);
        for (const task of goalTasks) {
            await tasksDB.delete(task.id);
        }
        return deleteById('goals', id);
    },

    /**
     * Check if all tasks are complete and mark goal as completed
     * For daily goals (lifelong), this resets tasks for next day
     */
    async checkAndCompleteGoal(goalId: string): Promise<{ completed: boolean; isDaily: boolean }> {
        const goal = await this.getById(goalId);
        if (!goal) return { completed: false, isDaily: false };

        const allTasks = await tasksDB.getByGoalId(goalId);
        const allTasksComplete = allTasks.length > 0 && allTasks.every(t =>
            t.completedMinutes >= t.estimatedTotalMinutes * 0.85 // 85% threshold
        );

        if (!allTasksComplete) return { completed: false, isDaily: !!goal.lifelong };

        if (goal.lifelong) {
            // Daily goal: Reset all tasks for tomorrow
            for (const task of allTasks) {
                await tasksDB.update(task.id, {
                    completedMinutes: 0,
                    skipCount: 0,
                    lastSkippedAt: undefined,
                });
            }
            return { completed: true, isDaily: true };
        } else {
            // One-time goal: Mark as drained (formerly completed)
            // In pure effort flow, we don't "finish", we "drain".
            await this.update(goalId, {
                status: 'drained' as any, // Cast to any to allow new status if TS complains, or update Schema type above
                completedAt: getISOTimestamp(),
            });
            return { completed: true, isDaily: false };
        }
    },
};

// ============================================
// Tasks CRUD
// ============================================

export const tasksDB = {
    async getAll(): Promise<Task[]> {
        const all = await getAll<Task>('tasks');
        return all.filter((t) => !t.archivedAt);
    },

    async getById(id: string): Promise<Task | undefined> {
        return getById<Task>('tasks', id);
    },

    async getByGoalId(goalId: string): Promise<Task[]> {
        const tasks = await getByIndex<Task>('tasks', 'goalId', goalId);
        return tasks.filter((t) => !t.archivedAt).sort((a, b) => a.order - b.order);
    },

    async getRecurring(): Promise<Task[]> {
        const all = await getAll<Task>('tasks');
        return all.filter((t) => t.isRecurring && !t.archivedAt);
    },

    async getArchived(): Promise<Task[]> {
        const all = await getAll<Task>('tasks');
        return all.filter((t) => t.archivedAt);
    },

    async create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
        const task: Task = {
            ...data,
            id: generateId(),
            createdAt: getISOTimestamp(),
            updatedAt: getISOTimestamp(),
        };
        return put('tasks', task);
    },

    async update(id: string, data: Partial<Task>): Promise<Task | undefined> {
        const existing = await getById<Task>('tasks', id);
        if (!existing) return undefined;
        const updated: Task = {
            ...existing,
            ...data,
            id,
            updatedAt: getISOTimestamp(),
        };
        return put('tasks', updated);
    },

    async delete(id: string): Promise<void> {
        return deleteById('tasks', id);
    },

    async archive(id: string): Promise<Task | undefined> {
        return this.update(id, { archivedAt: getISOTimestamp() });
    },

    async unarchive(id: string): Promise<Task | undefined> {
        return this.update(id, { archivedAt: undefined });
    },

    async recordProgress(id: string, minutes: number): Promise<Task | undefined> {
        const task = await getById<Task>('tasks', id);
        if (!task) return undefined;
        return this.update(id, {
            completedMinutes: task.completedMinutes + minutes,
        });
    },

    async recordSkip(id: string): Promise<Task | undefined> {
        const task = await getById<Task>('tasks', id);
        if (!task) return undefined;
        return this.update(id, {
            skipCount: task.skipCount + 1,
            lastSkippedAt: getISOTimestamp(),
        });
    },
};

// ============================================
// Daily Allocations CRUD
// ============================================

export const dailyAllocationsDB = {
    async getByDate(date: string): Promise<DailyAllocation | undefined> {
        return getById<DailyAllocation>('dailyAllocations', date);
    },

    async getAll(): Promise<DailyAllocation[]> {
        return getAll<DailyAllocation>('dailyAllocations');
    },

    async create(data: Omit<DailyAllocation, 'createdAt'>): Promise<DailyAllocation> {
        const allocation: DailyAllocation = {
            ...data,
            createdAt: getISOTimestamp(),
        };
        return put('dailyAllocations', allocation);
    },

    async update(date: string, data: Partial<DailyAllocation>): Promise<DailyAllocation | undefined> {
        const existing = await getById<DailyAllocation>('dailyAllocations', date);
        if (!existing) return undefined;
        const updated: DailyAllocation = {
            ...existing,
            ...data,
        };
        return put('dailyAllocations', updated);
    },

    async markComplete(date: string): Promise<DailyAllocation | undefined> {
        return this.update(date, { completedAt: getISOTimestamp() });
    },
};

// ============================================
// Task Progress CRUD
// ============================================

export const taskProgressDB = {
    async getByTaskId(taskId: string): Promise<TaskProgress[]> {
        return getByIndex<TaskProgress>('taskProgress', 'taskId', taskId);
    },

    async getByDate(date: string): Promise<TaskProgress[]> {
        return getByIndex<TaskProgress>('taskProgress', 'date', date);
    },

    async record(taskId: string, date: string, minutes: number): Promise<TaskProgress> {
        // Check if progress already exists for this task+date
        const db = await getDB();
        const existing = await new Promise<TaskProgress | undefined>((resolve, reject) => {
            const tx = db.transaction('taskProgress', 'readonly');
            const store = tx.objectStore('taskProgress');
            const index = store.index('taskId_date');
            const request = index.get([taskId, date]);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (existing) {
            // Update existing progress
            const updated: TaskProgress = {
                ...existing,
                minutesWorked: existing.minutesWorked + minutes,
            };

            // Update total on task
            await tasksDB.recordProgress(taskId, minutes);

            return put('taskProgress', updated);
        }

        // Create new progress entry
        const progress: TaskProgress = {
            id: generateId(),
            taskId,
            date,
            minutesWorked: minutes,
            createdAt: getISOTimestamp(),
        };

        // Also update total on task
        await tasksDB.recordProgress(taskId, minutes);

        return put('taskProgress', progress);
    },
};

// ============================================
// Daily Moments CRUD
// ============================================

export const dailyMomentsDB = {
    async getByDate(date: string): Promise<DailyMoment | undefined> {
        return getById<DailyMoment>('dailyMoments', date);
    },

    async getAll(): Promise<DailyMoment[]> {
        return getAll<DailyMoment>('dailyMoments');
    },

    async save(date: string, moment: string): Promise<DailyMoment> {
        const existing = await this.getByDate(date);
        if (existing) {
            const updated: DailyMoment = {
                ...existing,
                moment,
                updatedAt: getISOTimestamp(),
            };
            return put('dailyMoments', updated);
        }
        const newMoment: DailyMoment = {
            date,
            moment,
            createdAt: getISOTimestamp(),
            updatedAt: getISOTimestamp(),
        };
        return put('dailyMoments', newMoment);
    },
};

// ============================================
// AI Settings CRUD
// ============================================

export const aiSettingsDB = {
    async get(): Promise<AISettings> {
        const settings = await getById<AISettings>('settings', 'ai-settings');
        if (!settings) {
            return {
                id: 'ai-settings',
                provider: null,
                hasApiKey: false,
            };
        }
        return settings;
    },

    async save(data: Partial<Omit<AISettings, 'id'>>): Promise<AISettings> {
        const existing = await this.get();
        const updated: AISettings = {
            ...existing,
            ...data,
            id: 'ai-settings',
        };
        return put('settings', updated);
    },
};

// ============================================
// Recurring Task History CRUD
// ============================================

export const recurringTaskHistoryDB = {
    async getByTaskId(taskId: string): Promise<RecurringTaskHistory[]> {
        return getByIndex<RecurringTaskHistory>('recurringTaskHistory', 'taskId', taskId);
    },

    async getByGoalId(goalId: string): Promise<RecurringTaskHistory[]> {
        return getByIndex<RecurringTaskHistory>('recurringTaskHistory', 'goalId', goalId);
    },

    async getByDate(date: string): Promise<RecurringTaskHistory[]> {
        return getByIndex<RecurringTaskHistory>('recurringTaskHistory', 'date', date);
    },

    async getByTaskAndDate(taskId: string, date: string): Promise<RecurringTaskHistory | undefined> {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('recurringTaskHistory', 'readonly');
            const store = tx.objectStore('recurringTaskHistory');
            const index = store.index('taskId_date');
            const request = index.get([taskId, date]);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async record(
        taskId: string,
        goalId: string,
        date: string,
        completed: boolean,
        minutes: number,
        skipped: boolean = false
    ): Promise<RecurringTaskHistory> {
        // Check if history already exists for this task+date
        const existing = await this.getByTaskAndDate(taskId, date);

        if (existing) {
            // Update existing history
            const updated: RecurringTaskHistory = {
                ...existing,
                completed,
                completedMinutes: minutes,
                skipped,
            };
            return put('recurringTaskHistory', updated);
        }

        // Create new history entry
        const history: RecurringTaskHistory = {
            id: generateId(),
            taskId,
            goalId,
            date,
            completed,
            completedMinutes: minutes,
            skipped,
            createdAt: getISOTimestamp(),
        };

        return put('recurringTaskHistory', history);
    },

    /**
     * Get current streak for a task (consecutive days completed)
     */
    async getStreak(taskId: string): Promise<number> {
        const allHistory = await this.getByTaskId(taskId);
        if (allHistory.length === 0) return 0;

        // Sort by date descending
        const sorted = allHistory.sort((a, b) => b.date.localeCompare(a.date));

        let streak = 0;
        const currentDate = new Date();

        for (const entry of sorted) {
            // Check if this is the expected date (today or previous consecutive day)
            const expectedDate = new Date(currentDate);
            expectedDate.setDate(expectedDate.getDate() - streak);

            const expectedDateStr = expectedDate.toISOString().split('T')[0];

            if (entry.date !== expectedDateStr) break;
            if (!entry.completed) break;

            streak++;
        }

        return streak;
    },

    /**
     * Get completion rate for last N days
     */
    async getCompletionRate(taskId: string, days: number = 7): Promise<number> {
        const allHistory = await this.getByTaskId(taskId);
        if (allHistory.length === 0) return 0;

        const today = new Date();
        const cutoffDate = new Date(today);
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const recentHistory = allHistory.filter(h => {
            const entryDate = new Date(h.date);
            return entryDate >= cutoffDate && entryDate <= today;
        });

        if (recentHistory.length === 0) return 0;

        const completedCount = recentHistory.filter(h => h.completed).length;
        return (completedCount / recentHistory.length) * 100;
    },
};

// ============================================
// Task Queue CRUD (Internal Scheduling)
// ============================================

export const taskQueueDB = {
    /**
     * Get all queue entries
     */
    async getAll(): Promise<TaskQueueEntry[]> {
        return getAll<TaskQueueEntry>('taskQueue');
    },

    /**
     * Get a queue entry by task ID
     */
    async getByTaskId(taskId: string): Promise<TaskQueueEntry | undefined> {
        return getById<TaskQueueEntry>('taskQueue', taskId);
    },

    /**
     * Get all queue entries for a goal
     */
    async getByGoalId(goalId: string): Promise<TaskQueueEntry[]> {
        return getByIndex<TaskQueueEntry>('taskQueue', 'goalId', goalId);
    },

    /**
     * Get all queue entries by effort level
     */
    async getByEffortLevel(level: EffortLevel): Promise<TaskQueueEntry[]> {
        return getByIndex<TaskQueueEntry>('taskQueue', 'effortLevel', level);
    },

    /**
     * Add or update a queue entry
     */
    async upsert(entry: TaskQueueEntry): Promise<TaskQueueEntry> {
        const now = getISOTimestamp();
        const existing = await this.getByTaskId(entry.taskId);

        if (existing) {
            const updated: TaskQueueEntry = {
                ...existing,
                ...entry,
                updatedAt: now,
            };
            return put<TaskQueueEntry>('taskQueue', updated);
        }

        const newEntry: TaskQueueEntry = {
            ...entry,
            createdAt: now,
            updatedAt: now,
        };
        return put<TaskQueueEntry>('taskQueue', newEntry);
    },

    /**
     * Remove a task from the queue
     */
    async remove(taskId: string): Promise<void> {
        return deleteById('taskQueue', taskId);
    },

    /**
     * Remove all queue entries for a goal
     */
    async removeByGoalId(goalId: string): Promise<void> {
        const entries = await this.getByGoalId(goalId);
        for (const entry of entries) {
            await this.remove(entry.taskId);
        }
    },

    /**
     * Clear entire queue (for rehydration)
     */
    async clear(): Promise<void> {
        const db = await getDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('taskQueue', 'readwrite');
            const store = tx.objectStore('taskQueue');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Increment waiting days for all queued tasks (call once per day)
     */
    async incrementWaitingDays(): Promise<void> {
        const all = await this.getAll();
        const now = getISOTimestamp();

        for (const entry of all) {
            await put<TaskQueueEntry>('taskQueue', {
                ...entry,
                waitingDays: entry.waitingDays + 1,
                updatedAt: now,
            });
        }
    },
};

// ============================================
// Utility: Clear All Data (Dev Only)
// ============================================

export async function clearAllData(): Promise<void> {
    const db = await getDB();
    const storeNames = ['goals', 'tasks', 'dailyAllocations', 'taskProgress', 'dailyMoments', 'settings', 'recurringTaskHistory', 'taskQueue'];

    for (const storeName of storeNames) {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
