// Type definitions for SmallSteps

export interface Idea {
    id: string;
    content: string;
    clarifiedContent: string | null;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    targetDate: Date | null;
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    createdAt: Date;
    updatedAt: Date;
    steps?: Step[];
}

export interface Step {
    id: string;
    ideaId: string;
    content: string;
    type: string;
    order: number;
    completed: boolean;
    isRepetitive: boolean; // NEW: Daily habit flag
    completedAt: Date | null;
    createdAt: Date;
    reflection?: Reflection;
    completions?: TaskCompletion[]; // NEW: Daily completion records
}

export interface Reflection {
    id: string;
    stepId: string;
    feeling: 'LIGHTER' | 'NEUTRAL' | 'HARD';
    note: string | null;
    createdAt: Date;
}

// NEW: Daily completion tracking for repetitive tasks
export interface TaskCompletion {
    id: string;
    stepId: string;
    date: string; // YYYY-MM-DD format
    completed: boolean;
    createdAt: Date;
}

export interface CreateIdeaInput {
    content: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    targetDate?: Date | string;
}

export interface CreateReflectionInput {
    stepId: string;
    feeling: 'LIGHTER' | 'NEUTRAL' | 'HARD';
    note?: string;
}
