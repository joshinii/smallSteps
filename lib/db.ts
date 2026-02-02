// SmallSteps IndexedDB Database Layer
// Effort-Flow Architecture: Goal → Task → WorkUnit → Slice

import {
    Goal,
    Task,
    WorkUnit,
    Habit,
    HabitLog,
    DailyAllocation,
    TaskProgress,
    DailyMoment,
    AISettings,
    isWorkUnitComplete,
} from './schema';
import { generateId, getISOTimestamp } from './utils';

const DB_NAME = 'smallsteps-db';
const DB_VERSION = 4; // New version for effort-flow architecture

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
            }

            // Tasks store (simplified)
            if (!db.objectStoreNames.contains('tasks')) {
                const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
                tasksStore.createIndex('goalId', 'goalId', { unique: false });
            }

            // WorkUnits store (NEW)
            if (!db.objectStoreNames.contains('workUnits')) {
                const workUnitsStore = db.createObjectStore('workUnits', { keyPath: 'id' });
                workUnitsStore.createIndex('taskId', 'taskId', { unique: false });
            }

            // Habits store (NEW - separate system)
            if (!db.objectStoreNames.contains('habits')) {
                db.createObjectStore('habits', { keyPath: 'id' });
            }

            // HabitLogs store (NEW)
            if (!db.objectStoreNames.contains('habitLogs')) {
                const logsStore = db.createObjectStore('habitLogs', { keyPath: 'id' });
                logsStore.createIndex('habitId', 'habitId', { unique: false });
                logsStore.createIndex('date', 'date', { unique: false });
                logsStore.createIndex('habitId_date', ['habitId', 'date'], { unique: true });
            }

            // Daily allocations store
            if (!db.objectStoreNames.contains('dailyAllocations')) {
                db.createObjectStore('dailyAllocations', { keyPath: 'date' });
            }

            // Task progress store
            if (!db.objectStoreNames.contains('taskProgress')) {
                const progressStore = db.createObjectStore('taskProgress', { keyPath: 'id' });
                progressStore.createIndex('workUnitId', 'workUnitId', { unique: false });
                progressStore.createIndex('date', 'date', { unique: false });
            }

            // Daily moments store
            if (!db.objectStoreNames.contains('dailyMoments')) {
                db.createObjectStore('dailyMoments', { keyPath: 'date' });
            }

            // AI settings store
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

async function getByIndex<T>(storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
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

    async checkAndCompleteGoal(goalId: string): Promise<{ completed: boolean; isDaily: boolean }> {
        const tasks = await tasksDB.getByGoalId(goalId);
        const allComplete = tasks.every(t => t.completedMinutes >= t.estimatedTotalMinutes);

        if (allComplete) {
            await this.update(goalId, { status: 'drained' });
            return { completed: true, isDaily: false };
        }
        return { completed: false, isDaily: false };
    },

    async delete(id: string): Promise<void> {
        // Delete associated tasks and work units
        const goalTasks = await tasksDB.getByGoalId(id);
        for (const task of goalTasks) {
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
        // Delete associated work units
        const workUnits = await workUnitsDB.getByTaskId(id);
        for (const unit of workUnits) {
            await workUnitsDB.delete(unit.id);
        }
        return deleteById('tasks', id);
    },
};

// ============================================
// WorkUnits CRUD (NEW)
// ============================================

export const workUnitsDB = {
    async getAll(): Promise<WorkUnit[]> {
        return getAll<WorkUnit>('workUnits');
    },

    async getById(id: string): Promise<WorkUnit | undefined> {
        return getById<WorkUnit>('workUnits', id);
    },

    async getByTaskId(taskId: string): Promise<WorkUnit[]> {
        return getByIndex<WorkUnit>('workUnits', 'taskId', taskId);
    },

    async getIncomplete(): Promise<WorkUnit[]> {
        const all = await this.getAll();
        return all.filter(u => !isWorkUnitComplete(u));
    },

    async create(data: Omit<WorkUnit, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkUnit> {
        const unit: WorkUnit = {
            ...data,
            id: generateId(),
            createdAt: getISOTimestamp(),
            updatedAt: getISOTimestamp(),
        };
        return put('workUnits', unit);
    },

    async update(id: string, data: Partial<WorkUnit>): Promise<WorkUnit | undefined> {
        const existing = await getById<WorkUnit>('workUnits', id);
        if (!existing) return undefined;
        const updated: WorkUnit = {
            ...existing,
            ...data,
            id,
            updatedAt: getISOTimestamp(),
        };
        return put('workUnits', updated);
    },

    async delete(id: string): Promise<void> {
        // Delete associated task progress
        const progress = await taskProgressDB.getByWorkUnitId(id);
        for (const p of progress) {
            await taskProgressDB.delete(p.id);
        }
        return deleteById('workUnits', id);
    },

    async recordProgress(id: string, minutes: number): Promise<WorkUnit | undefined> {
        const unit = await this.getById(id);
        if (!unit) return undefined;
        return this.update(id, {
            completedMinutes: unit.completedMinutes + minutes,
        });
    },
};

// ============================================
// Habits CRUD (Separate System)
// ============================================

export const habitsDB = {
    async getAll(): Promise<Habit[]> {
        return getAll<Habit>('habits');
    },

    async getById(id: string): Promise<Habit | undefined> {
        return getById<Habit>('habits', id);
    },

    async create(data: Omit<Habit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Habit> {
        const habit: Habit = {
            ...data,
            id: generateId(),
            createdAt: getISOTimestamp(),
            updatedAt: getISOTimestamp(),
        };
        return put('habits', habit);
    },

    async update(id: string, data: Partial<Habit>): Promise<Habit | undefined> {
        const existing = await getById<Habit>('habits', id);
        if (!existing) return undefined;
        const updated: Habit = {
            ...existing,
            ...data,
            id,
            updatedAt: getISOTimestamp(),
        };
        return put('habits', updated);
    },

    async delete(id: string): Promise<void> {
        // Delete associated logs
        const logs = await habitLogsDB.getByHabitId(id);
        for (const log of logs) {
            await habitLogsDB.delete(log.id);
        }
        return deleteById('habits', id);
    },
};

// ============================================
// HabitLogs CRUD
// ============================================

export const habitLogsDB = {
    async getByHabitId(habitId: string): Promise<HabitLog[]> {
        return getByIndex<HabitLog>('habitLogs', 'habitId', habitId);
    },

    async getByDate(date: string): Promise<HabitLog[]> {
        return getByIndex<HabitLog>('habitLogs', 'date', date);
    },

    async getByHabitAndDate(habitId: string, date: string): Promise<HabitLog | undefined> {
        const logs = await this.getByHabitId(habitId);
        return logs.find(l => l.date === date);
    },

    async create(data: Omit<HabitLog, 'id' | 'createdAt'>): Promise<HabitLog> {
        const log: HabitLog = {
            ...data,
            id: generateId(),
            createdAt: getISOTimestamp(),
        };
        return put('habitLogs', log);
    },

    async delete(id: string): Promise<void> {
        return deleteById('habitLogs', id);
    },

    async toggleCompletion(habitId: string, date: string): Promise<HabitLog> {
        const existing = await this.getByHabitAndDate(habitId, date);
        if (existing) {
            const updated = { ...existing, completed: !existing.completed };
            return put('habitLogs', updated);
        }
        return this.create({ habitId, date, completed: true });
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
        const existing = await this.getByDate(date);
        if (!existing) return undefined;
        const updated: DailyAllocation = { ...existing, ...data };
        return put('dailyAllocations', updated);
    },

    async delete(date: string): Promise<void> {
        return deleteById('dailyAllocations', date);
    },
};

// ============================================
// Task Progress CRUD
// ============================================

export const taskProgressDB = {
    async getByWorkUnitId(workUnitId: string): Promise<TaskProgress[]> {
        return getByIndex<TaskProgress>('taskProgress', 'workUnitId', workUnitId);
    },

    async getByDate(date: string): Promise<TaskProgress[]> {
        return getByIndex<TaskProgress>('taskProgress', 'date', date);
    },

    async create(data: Omit<TaskProgress, 'id' | 'createdAt'>): Promise<TaskProgress> {
        const progress: TaskProgress = {
            ...data,
            id: generateId(),
            createdAt: getISOTimestamp(),
        };
        return put('taskProgress', progress);
    },

    async getAll(): Promise<TaskProgress[]> {
        return getAll<TaskProgress>('taskProgress');
    },

    async delete(id: string): Promise<void> {
        return deleteById('taskProgress', id);
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

    async upsert(date: string, moment: string): Promise<DailyMoment> {
        const existing = await this.getByDate(date);
        const record: DailyMoment = {
            date,
            moment,
            createdAt: existing?.createdAt || getISOTimestamp(),
            updatedAt: getISOTimestamp(),
        };
        return put('dailyMoments', record);
    },

    async delete(date: string): Promise<void> {
        return deleteById('dailyMoments', date);
    },
};

// ============================================
// AI Settings CRUD
// ============================================

export const aiSettingsDB = {
    async get(): Promise<AISettings | undefined> {
        return getById<AISettings>('settings', 'ai-settings');
    },

    async save(settings: Partial<AISettings>): Promise<AISettings> {
        const existing = await this.get();
        const updated: AISettings = {
            id: 'ai-settings',
            provider: existing?.provider || null,
            hasApiKey: existing?.hasApiKey || false,
            ...settings,
        };
        return put('settings', updated);
    },
};
