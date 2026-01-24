// SmallSteps IndexedDB Database Layer
// Local-first storage for cognitive offloading

import {
    Goal,
    Task,
    DailyAllocation,
    TaskProgress,
    DailyMoment,
    AISettings,
    generateId,
    getISOTimestamp,
} from './schema';

const DB_NAME = 'smallsteps-db';
const DB_VERSION = 1;

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
        const tasks = await tasksDB.getByGoalId(id);
        for (const task of tasks) {
            await tasksDB.delete(task.id);
        }
        return deleteById('goals', id);
    },
};

// ============================================
// Tasks CRUD
// ============================================

export const tasksDB = {
    async getAll(): Promise<Task[]> {
        return getAll<Task>('tasks');
    },

    async getById(id: string): Promise<Task | undefined> {
        return getById<Task>('tasks', id);
    },

    async getByGoalId(goalId: string): Promise<Task[]> {
        const tasks = await getByIndex<Task>('tasks', 'goalId', goalId);
        return tasks.sort((a, b) => a.order - b.order);
    },

    async getRecurring(): Promise<Task[]> {
        const all = await getAll<Task>('tasks');
        return all.filter((t) => t.isRecurring);
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
// Utility: Clear All Data (Dev Only)
// ============================================

export async function clearAllData(): Promise<void> {
    const db = await getDB();
    const storeNames = ['goals', 'tasks', 'dailyAllocations', 'taskProgress', 'dailyMoments', 'settings'];

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
