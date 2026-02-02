export interface LogContext {
    traceId: string;
    goalId?: string;
    phase: string;
    timestamp?: string; // Auto-generated if not provided
}

export type LogEvent =
    | 'LOG.GOAL_INPUT'
    | 'LOG.AI_DECOMPOSITION_REQUEST'
    | 'LOG.AI_DECOMPOSITION_RESULT'
    | 'LOG.WARNING.AI_TASK_COLLAPSE'
    | 'LOG.TASK_EFFORT_CLASSIFICATION'
    | 'LOG.TASK_REFINEMENT'
    | 'LOG.QUEUE_ALLOCATION'
    | 'LOG.QUEUE_DEFERRED'
    | 'LOG.TARGET_DATE_CALCULATION'
    | 'LOG.UI_GOAL_SUMMARY'
    | 'LOG.daily_plan_generation' // Lowercase to distinguish from system events? No, keep consistent.
    | 'LOG.DAILY_PLAN_GENERATION'
    | 'LOG.QUEUE_REHYDRATION'
    | 'LOG.TASK_COMPLETION';

export const logger = {
    info: (event: LogEvent, payload: Record<string, any>, context: LogContext) => {
        const logEntry = {
            event,
            ...context,
            timestamp: context.timestamp || new Date().toISOString(),
            payload
        };
        console.log(JSON.stringify(logEntry));
    },

    warn: (event: LogEvent | string, payload: Record<string, any>, context: LogContext) => {
        const logEntry = {
            level: 'WARN',
            event,
            ...context,
            timestamp: context.timestamp || new Date().toISOString(),
            payload
        };
        console.warn(JSON.stringify(logEntry));
    },

    error: (event: LogEvent | string, payload: Record<string, any>, context: LogContext) => {
        const logEntry = {
            level: 'ERROR',
            event,
            ...context,
            timestamp: context.timestamp || new Date().toISOString(),
            payload
        };
        console.error(JSON.stringify(logEntry));
    }
};

export function generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
