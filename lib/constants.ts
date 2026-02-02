
// Centralized constants for SmallSteps application

// Effort Label Mapping (for internal planning engine use)
// Thresholds: LIGHT <= 60 min, MEDIUM 61-360 min, HEAVY > 360 min
export const EFFORT_MAPPING = {
    'warm-up': { minMinutes: 30, maxMinutes: 60, avgMinutes: 45, label: 'warm-up' },
    'settle': { minMinutes: 61, maxMinutes: 360, avgMinutes: 180, label: 'settle' },
    'dive': { minMinutes: 361, maxMinutes: 1800, avgMinutes: 600, label: 'dive' },
} as const;

export type EffortLabel = keyof typeof EFFORT_MAPPING;

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
