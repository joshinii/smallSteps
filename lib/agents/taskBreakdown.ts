import { z } from 'zod';
import type { AIProvider } from '@/lib/ai/ai-provider';
import type { WorkUnit, Task } from '@/lib/schema';

// Zod schema for validation (reusing patterns from decomposer.ts)
const WorkUnitKindSchema = z.enum(['study', 'practice', 'build', 'review', 'explore']);

const GeneratedWorkUnitSchema = z.object({
    title: z.string().min(1),
    kind: WorkUnitKindSchema,
    firstAction: z.string().optional(),
    successSignal: z.string().optional(),
});

const BreakdownResponseSchema = z.object({
    workUnits: z.array(GeneratedWorkUnitSchema).min(1).max(8),
});

export type GeneratedWorkUnit = z.infer<typeof GeneratedWorkUnitSchema>;

/**
 * Break down a task into more granular work units using AI.
 * 
 * @param task - The parent task to break down
 * @param existingWorkUnits - Current work units (to avoid duplicates)
 * @param aiProvider - AI provider instance
 * @returns Promise<GeneratedWorkUnit[]> - List of suggested work units
 */
export async function breakdownTaskFurther(
    task: Task,
    existingWorkUnits: WorkUnit[],
    aiProvider: AIProvider
): Promise<GeneratedWorkUnit[]> {
    console.log('🤖 TASK BREAKDOWN: Breaking down', task.title);

    // 1. Build Prompt
    const prompt = `Break down this task into 3-5 smaller, actionable work units.
  
Task: "${task.title}"
Why it matters: ${task.whyThisMatters || 'To make progress'}

Current work units (for context - DO NOT DUPLICATE):
${existingWorkUnits.map(wu => `- ${wu.title}`).join('\n')}

Generate ADDITIONAL work units that:
- Are concrete and specific
- Can be done in one sitting (15-60 mins)
- Have a clear first action (how to start)
- Have a clear success signal (how to know you're done)
- Fill gaps or add depth to this task

NO time estimates needed.

Return JSON matching this schema:
{
  "workUnits": [
    {
      "title": "specific action",
      "kind": "study|practice|build|review|explore",
      "firstAction": "tiny first step",
      "successSignal": "completion indicator"
    }
  ]
}

Return ONLY valid JSON, no markdown.`;

    // 2. Call AI
    let responseText: string;
    try {
        // Use generateCompletion if available (preferred)
        if ('generateCompletion' in aiProvider && typeof aiProvider.generateCompletion === 'function') {
            responseText = await aiProvider.generateCompletion(prompt, {
                temperature: 0.7,
                jsonMode: true
            });
        } else {
            // Fallback for providers without generic completion (unlikely given our validation)
            // But purely as a safeguard, we could try to hijack another method or fail
            throw new Error('Provider does not support generic completion');
        }
    } catch (error) {
        console.error('❌ TASK BREAKDOWN: AI call failed', error);
        throw error;
    }

    // 3. Parse and Validate
    try {
        // Clean up potential markdown formatting
        let jsonCode = responseText.trim();
        if (jsonCode.includes('```json')) {
            jsonCode = jsonCode.split('```json')[1].split('```')[0].trim();
        } else if (jsonCode.includes('```')) {
            jsonCode = jsonCode.split('```')[1].split('```')[0].trim();
        }

        const parsed = JSON.parse(jsonCode);
        const validated = BreakdownResponseSchema.parse(parsed);

        console.log(`✅ TASK BREAKDOWN: Generated ${validated.workUnits.length} units`);
        return validated.workUnits;

    } catch (error) {
        console.error('❌ TASK BREAKDOWN: Parsing failed', error);
        // Fallback: Return empty array rather than crashing, let UI handle no results
        return [];
    }
}
