// SmallSteps AI Response Enforcement
// Centralized enforcement logic for all AI providers
// Includes quality validation for Gentle Architect philosophy

export interface AITask {
    title: string;
    estimatedTotalMinutes: number;
    whyThisMatters?: string;
}

export interface AIWorkUnit {
    title: string;
    kind: string;
    estimatedTotalMinutes: number;
    capabilityId?: string;
    firstAction?: string;
    successSignal?: string;
}

export interface DecomposeGoalResult {
    tasks: AITask[];
}

export interface DecomposeTaskResult {
    workUnits: AIWorkUnit[];
}

// Words that indicate vague, non-actionable tasks
const VAGUE_WORDS = ['basics', 'fundamentals', 'introduction', 'overview', 'general', 'misc', 'various'];

// Quality assessment helpers
function isVagueTitle(title: string): boolean {
    const lower = title.toLowerCase();
    return VAGUE_WORDS.some(word => lower.includes(word));
}

function generateDefaultFirstAction(title: string, kind: string): string {
    const actions: Record<string, string> = {
        'explore': `Search for resources about "${title.substring(0, 30)}..."`,
        'study': `Open your learning material and read for 5 minutes`,
        'practice': `Set a timer for 10 minutes and begin`,
        'build': `Create a new file or workspace for this`,
        'review': `Open your notes from the previous session`,
    };
    return actions[kind] || 'Take 2 minutes to gather what you need to start';
}

function generateDefaultSuccessSignal(title: string, kind: string): string {
    const signals: Record<string, string> = {
        'explore': 'You have found and saved useful resources',
        'study': 'You can explain the main concept in your own words',
        'practice': 'You can do it without looking at instructions',
        'build': 'You have a working version you can show',
        'review': 'You feel confident about what you learned',
    };
    return signals[kind] || 'You feel ready to move on to the next step';
}

/**
 * Parse AI response text, handling markdown code blocks
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
/**
 * Parse AI response text, robustly handling markdown code blocks and function call hallucinations
 * Phi-3 often hallucinates function calls like save_content(title="foo"...) instead of pure JSON
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function parseAIResponse(text: string): any {
    // 1. Extract JSON block if present
    let cleanText = text.trim();
    if (cleanText.includes('```json')) {
        cleanText = cleanText.split('```json')[1].split('```')[0].trim();
    } else if (cleanText.includes('```')) {
        cleanText = cleanText.split('```')[1].split('```')[0].trim();
    }

    // 2. Fix common Phi-3 hallucinations (Function calls inside arrays)
    // Converts: { "tasks": [ ..., save_content(title="X", ...), ... ] }
    // To: Valid JSON objects
    if (cleanText.includes('save_content(')) {
        console.log('[Enforcement] Detected function call hallucination, attempting to fix...');

        // Regex to match save_content(key="val", key=123) pattern
        // This is a rough heuristic to convert python-style kwargs to JSON
        cleanText = cleanText.replace(/save_content\((.*?)\)/g, (match, args) => {
            try {
                // Convert kwargs to JSON object string
                // 1. Quote keys: title= -> "title":
                // 2. Wrap in braces
                let props = args
                    .replace(/([a-zA-Z0-9_]+)=/g, '"$1":') // Quote keys
                    .replace(/'/g, '"'); // Normalize quotes

                return `{${props}}`;
            } catch (e) {
                return '{}'; // Fallback
            }
        });
    }

    // 3. Attempt parse
    try {
        return JSON.parse(cleanText);
    } catch (e) {
        console.warn('[Enforcement] JSON parse failed, attempting scavenger mode', e);
        return { __scavenged: true }; // Marker to trigger scavenger in caller
    }
}

/**
 * Scavenge for valid task objects in raw text when main JSON parse fails.
 * Uses stack-based brace matching to find all { ... } blocks (including nested ones)
 * and checks if they look like task objects.
 */
function scavengeTasks(text: string): AITask[] {
    const validTasks: AITask[] = [];
    const openBraces: number[] = [];
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (escape) {
                escape = false;
            } else if (char === '\\') {
                escape = true;
            } else if (char === '"') {
                inString = false;
            }
        } else {
            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                openBraces.push(i);
            } else if (char === '}') {
                if (openBraces.length > 0) {
                    const start = openBraces.pop()!;
                    const block = text.substring(start, i + 1);
                    try {
                        const parsed = JSON.parse(block);
                        if (parsed.title && typeof parsed.title === 'string') {
                            // It looks like a task!
                            validTasks.push({
                                title: parsed.title,
                                estimatedTotalMinutes: parsed.estimatedTotalMinutes || parsed.estimatedMinutes || 60,
                                whyThisMatters: parsed.whyThisMatters
                            });
                        }
                    } catch (ignore) {
                        // Not a valid JSON object, keep scanning
                    }
                }
            }
        }
    }

    return validTasks;
}

/**
 * Enforce minimum task minutes and quality (Stage 1)
 * - Ensures minimum effort per task (now 60 min for flexibility)
 * - Improves vague titles with suggestions
 * - Preserves whyThisMatters field
 */
export function enforceTaskMinimums(tasks: AITask[]): AITask[] {
    return tasks.map((task) => {
        let minutes = task.estimatedTotalMinutes || 120;
        // Enforce meaningful chunks (minimum 60 min for smaller goals)
        if (minutes < 60) minutes = 60;

        const title = task.title || 'Untitled Task';

        // Quality: Flag vague titles (log for monitoring, but keep AI's title)
        if (isVagueTitle(title)) {
            console.log(`[Quality] Task "${title}" may be vague - consider more specific wording`);
        }

        return {
            ...task,
            title,
            estimatedTotalMinutes: minutes,
            whyThisMatters: task.whyThisMatters || undefined
        };
    });
}

/**
 * Process Goal Decomposition (Stage 1)
 */
export function processGoalDecomposition(rawText: string): string {
    try {
        const parsed = parseAIResponse(rawText);
        let tasks: AITask[] = [];

        if (parsed.__scavenged) {
            console.log('[Enforcement] Main parse failed, scavenging for tasks...');
            tasks = scavengeTasks(rawText);
            console.log(`[Enforcement] Scavenged ${tasks.length} valid tasks`);
        } else {
            tasks = parsed.tasks || [];
        }

        // Final safety check: if still empty, try scavenging anyway if rawText is long
        if (tasks.length === 0 && rawText.length > 100) {
            const fallbackScavenge = scavengeTasks(rawText);
            if (fallbackScavenge.length > 0) {
                console.log('[Enforcement] Parsed result was empty, but scavenger found tasks. Using scavenged results.');
                tasks = fallbackScavenge;
            }
        }

        const enforced = enforceTaskMinimums(tasks);
        return JSON.stringify({ tasks: enforced });
    } catch (e) {
        console.error('Failed to parse goal decomposition', e);
        return JSON.stringify({ tasks: [] });
    }
}

/**
 * Process Task Decomposition (Stage 2)
 * Normalizes work unit times to match the expected task total length.
 * Enhances quality by ensuring firstAction and successSignal are present.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function processTaskDecomposition(rawText: string, expectedTotal?: number): string {
    try {
        const parsed = parseAIResponse(rawText);
        let workUnits = ((parsed.workUnits as unknown[]) || []).map((u: any) => {
            const kind = u.kind || 'practice';
            const title = u.title || 'Activity';

            // Quality: Ensure firstAction exists (generate default if missing)
            const firstAction = u.firstAction || generateDefaultFirstAction(title, kind);

            // Quality: Ensure successSignal exists (generate default if missing)
            const successSignal = u.successSignal || generateDefaultSuccessSignal(title, kind);

            // Quality: Log vague titles for monitoring
            if (isVagueTitle(title)) {
                console.log(`[Quality] WorkUnit "${title}" may be vague - consider more specific wording`);
            }

            return {
                title,
                kind,
                estimatedTotalMinutes: u.estimatedTotalMinutes || 60,
                capabilityId: u.capabilityId,
                firstAction,
                successSignal
            };
        });

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
/* eslint-enable @typescript-eslint/no-explicit-any */
