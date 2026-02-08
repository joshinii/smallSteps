// SmallSteps Relevance Filter
// Uses sentence embeddings to ensure generated tasks are semantically relevant to the goal
// Prevents AI from generating irrelevant tasks (e.g., music tasks for coding goals)

// NOTE: @xenova/transformers is server-side only, imported dynamically to prevent client-side errors

// ============================================
// Types
// ============================================

interface TaskWithRelevance {
    title: string;
    estimatedTotalMinutes: number;
    whyThisMatters?: string;
    relevanceScore?: number;
}

// ============================================
// Model State
// ============================================

export let embeddingModel: any = null;
let isInitializing = false;
let transformersModule: any = null;
let embeddingUnavailable = false; // True if embeddings can't be loaded (browser env or error)

/**
 * Initialize the embedding model (lazy loading)
 * Downloads ~80MB on first use, cached locally after
 */
export async function initEmbeddingModel(): Promise<void> {
    if (embeddingModel) return;

    if (isInitializing) {
        // Wait for ongoing initialization
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (embeddingModel || !isInitializing) {
                    clearInterval(checkInterval);
                    resolve(undefined);
                }
            }, 100);
        });
        return;
    }

    // Check if we're in a browser environment - Xenova only works server-side
    if (typeof window !== 'undefined') {
        console.warn('[RelevanceFilter] Embedding model not available in browser. Relevance validation will be skipped.');
        embeddingUnavailable = true;
        return;
    }

    try {
        isInitializing = true;
        console.log('[RelevanceFilter] Loading embedding model (first use may take a moment)...');

        // Dynamic import to avoid client-side bundling issues
        if (!transformersModule) {
            transformersModule = await import('@xenova/transformers');
        }

        // Use Xenova's all-MiniLM-L6-v2 - fast and lightweight
        embeddingModel = await transformersModule.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        console.log('[RelevanceFilter] Model loaded successfully');
    } catch (error) {
        console.error('[RelevanceFilter] Failed to load model:', error);
        console.warn('[RelevanceFilter] Relevance validation will be skipped.');
        embeddingUnavailable = true;
    } finally {
        isInitializing = false;
    }
}

/**
 * Generate embedding for a text
 */
async function getEmbedding(text: string): Promise<number[]> {
    if (embeddingUnavailable) {
        throw new Error('Embeddings unavailable');
    }

    if (!embeddingModel) {
        await initEmbeddingModel();
    }

    if (embeddingUnavailable || !embeddingModel) {
        throw new Error('Embeddings unavailable');
    }

    const output = await embeddingModel(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================
// Public API
// ============================================

/**
 * Validate task relevance to a goal using semantic similarity
 * Filters out tasks with similarity < threshold
 * 
 * @param goalTitle - The goal description
 * @param tasks - Array of tasks to validate
 * @param threshold - Minimum similarity score (0-1), default 0.6
 * @returns Filtered tasks with relevanceScore added
 */
export async function validateTaskRelevance(
    goalTitle: string,
    tasks: TaskWithRelevance[],
    threshold: number = 0.10 // Lowered to 0.10 to allow valid sub-domain tasks (e.g. "Arrays" vs "DSA")
): Promise<TaskWithRelevance[]> {
    if (tasks.length === 0) return [];

    // Skip validation if embeddings aren't available (browser env)
    if (embeddingUnavailable) {
        console.log('[RelevanceFilter] Skipping validation (embeddings unavailable)');
        return tasks.map(t => ({ ...t, relevanceScore: 1.0 }));
    }

    try {
        // Ensure model is loaded
        await initEmbeddingModel();

        console.log(`[RelevanceFilter] Validating ${tasks.length} tasks for goal: "${goalTitle}"`);

        // Get goal embedding
        const goalEmbedding = await getEmbedding(goalTitle);

        // Calculate similarity for each task
        const tasksWithScores = await Promise.all(
            tasks.map(async (task) => {
                // Enrich text with rationale if available to improve semantic matching
                const textToEmbed = task.whyThisMatters
                    ? `${task.title} ${task.whyThisMatters}`
                    : task.title;

                const taskEmbedding = await getEmbedding(textToEmbed);
                const similarity = cosineSimilarity(goalEmbedding, taskEmbedding);

                return {
                    ...task,
                    relevanceScore: similarity,
                };
            })
        );

        // Filter by threshold
        const validTasks = tasksWithScores.filter(task => task.relevanceScore! >= threshold);
        const filteredCount = tasks.length - validTasks.length;

        if (filteredCount > 0) {
            console.log(`[RelevanceFilter] Filtered ${filteredCount} irrelevant task(s):`);
            tasksWithScores
                .filter(t => t.relevanceScore! < threshold)
                .forEach(t => console.log(`  - "${t.title}" (score: ${t.relevanceScore!.toFixed(2)})`));
        }

        console.log(`[RelevanceFilter] ${validTasks.length} relevant tasks passed filter`);

        return validTasks;
    } catch (error) {
        console.error('[RelevanceFilter] Validation error:', error);
        // On error, return original tasks (fail gracefully)
        console.warn('[RelevanceFilter] Returning unfiltered tasks due to error');
        return tasks;
    }
}

/**
 * Check if a single task is relevant to a goal
 * Useful for manual validation or testing
 */
export async function checkTaskRelevance(
    goalTitle: string,
    taskTitle: string
): Promise<{ isRelevant: boolean; score: number }> {
    try {
        await initEmbeddingModel();

        const goalEmbedding = await getEmbedding(goalTitle);
        const taskEmbedding = await getEmbedding(taskTitle);
        const score = cosineSimilarity(goalEmbedding, taskEmbedding);

        return {
            isRelevant: score >= 0.6,
            score,
        };
    } catch (error) {
        console.error('[RelevanceFilter] Check error:', error);
        return { isRelevant: true, score: 1.0 }; // Fail gracefully
    }
}
