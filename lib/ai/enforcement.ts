// SmallSteps AI Response Enforcement
// Centralized enforcement logic for all AI providers

export interface AITask {
    title: string;
    estimatedTotalMinutes: number;
}

export interface AIWorkUnit {
    title: string;
    kind: string;
    estimatedTotalMinutes: number;
}

export interface DecomposeGoalResult {
    tasks: AITask[];
}

export interface DecomposeTaskResult {
    workUnits: AIWorkUnit[];
}

/**
 * Parse AI response text, handling markdown code blocks
 */
export function parseAIResponse(text: string): any {
    const jsonText = text.includes('```json')
        ? text.split('```json')[1].split('```')[0].trim()
        : text.includes('```')
            ? text.split('```')[1].split('```')[0].trim()
            : text;

    return JSON.parse(jsonText);
}

/**
 * Enforce minimum task minutes (Stage 1)
 */
export function enforceTaskMinimums(tasks: AITask[]): AITask[] {
    return tasks.map(task => {
        let minutes = task.estimatedTotalMinutes || 120;
        // Enforce meaningful chunks (minimum 120 min)
        if (minutes < 120) minutes = 120;

        return {
            ...task,
            title: task.title || 'Untitled Task',
            estimatedTotalMinutes: minutes
        };
    });
}

/**
 * Process Goal Decomposition (Stage 1)
 */
export function processGoalDecomposition(rawText: string): string {
    try {
        const parsed = parseAIResponse(rawText);
        const tasks = enforceTaskMinimums(parsed.tasks || []);

        return JSON.stringify({ tasks });
    } catch (e) {
        console.error('Failed to parse goal decomposition', e);
        return JSON.stringify({ tasks: [] });
    }
}

/**
 * Process Task Decomposition (Stage 2)
 * Normalizes work unit times to match the expected task total length.
 */
export function processTaskDecomposition(rawText: string, expectedTotal?: number): string {
    try {
        const parsed = parseAIResponse(rawText);
        let workUnits = (parsed.workUnits || []).map((u: any) => ({
            title: u.title || 'Activity',
            kind: u.kind || 'practice', // Default kind
            estimatedTotalMinutes: u.estimatedTotalMinutes || 60,
            capabilityId: u.capabilityId
        }));

        // Normalize if expectedTotal is provided
        if (expectedTotal && workUnits.length > 0) {
            const sum = workUnits.reduce((acc: number, u: any) => acc + u.estimatedTotalMinutes, 0);

            // Allow small deviation (e.g. 10%) but correct large errors
            if (Math.abs(sum - expectedTotal) > expectedTotal * 0.1) {
                console.log(`[Enforcement] Normalizing AI work units. Sum: ${sum}, Expected: ${expectedTotal}`);
                const ratio = expectedTotal / sum;

                workUnits = workUnits.map((u: any) => ({
                    ...u,
                    estimatedTotalMinutes: Math.round(u.estimatedTotalMinutes * ratio)
                }));

                // Fix rounding errors to match exactly
                const newSum = workUnits.reduce((acc: number, u: any) => acc + u.estimatedTotalMinutes, 0);
                const diff = expectedTotal - newSum;
                if (diff !== 0) {
                    // Add/subtract diff from largest unit
                    workUnits.sort((a: any, b: any) => b.estimatedTotalMinutes - a.estimatedTotalMinutes);
                    workUnits[0].estimatedTotalMinutes += diff;
                }
            } else if (sum !== expectedTotal) {
                // Even if close, force exact match on the largest unit
                const diff = expectedTotal - sum;
                workUnits.sort((a: any, b: any) => b.estimatedTotalMinutes - a.estimatedTotalMinutes);
                workUnits[0].estimatedTotalMinutes += diff;
            }
        }

        if (expectedTotal && workUnits.length > 0) {
            // ... (normalization logic) ...
        }

        // Enforce Hard Cap of 120 mins per unit
        const cappedWorkUnits: any[] = [];
        for (const unit of workUnits) {
            if (unit.estimatedTotalMinutes > 120) {
                const parts = Math.ceil(unit.estimatedTotalMinutes / 120);
                const minutesPerPart = Math.floor(unit.estimatedTotalMinutes / parts);
                let remainder = unit.estimatedTotalMinutes % parts;

                for (let i = 1; i <= parts; i++) {
                    const mins = minutesPerPart + (remainder > 0 ? 1 : 0);
                    remainder--;
                    cappedWorkUnits.push({
                        ...unit,
                        title: `${unit.title} (Part ${i})`,
                        estimatedTotalMinutes: mins,
                        capabilityId: unit.capabilityId ? `${unit.capabilityId}.part${i}` : undefined
                    });
                }
            } else {
                cappedWorkUnits.push(unit);
            }
        }
        workUnits = cappedWorkUnits;

        return JSON.stringify({ workUnits });
    } catch (e) {
        console.error('Failed to parse task decomposition', e);
        return JSON.stringify({ workUnits: [] });
    }
}
