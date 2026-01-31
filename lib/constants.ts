
// Centralized constants for SmallSteps application

// Effort Label Mapping
export const EFFORT_MAPPING = {
    'warm-up': { minMinutes: 5, maxMinutes: 10, avgMinutes: 7, label: 'warm-up', icon: 'light' },
    'settle': { minMinutes: 20, maxMinutes: 30, avgMinutes: 25, label: 'settle', icon: 'medium' },
    'dive': { minMinutes: 60, maxMinutes: 90, avgMinutes: 75, label: 'dive', icon: 'heavy' },
} as const;

export type EffortLabel = keyof typeof EFFORT_MAPPING;

export const EFFORT_LEVELS = [
    { value: 7, label: 'Warm-up (~5-10 min)', key: 'warm-up' },
    { value: 25, label: 'Settle (~20-30 min)', key: 'settle' },
    { value: 75, label: 'Dive (~60-90 min)', key: 'dive' },
] as const;

// Task Completion
export const COMPLETION_THRESHOLD = 0.95;

// View Modes
export const VIEW_MODES = {
    GOALS: 'GOALS',
    HABITS: 'HABITS',
} as const;

export type ViewMode = keyof typeof VIEW_MODES;

// AI Providers
export const AI_PROVIDERS = {
    CLAUDE: 'claude',
    OPENAI: 'openai',
    GEMINI: 'gemini',
    MANUAL: 'manual',
} as const;

export type AIProviderId = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS];
