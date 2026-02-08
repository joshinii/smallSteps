import { NextRequest, NextResponse } from 'next/server';
import { validateTaskRelevance } from '@/lib/engine/relevanceFilter';

// POST /api/ai/validate-tasks
// Validates task relevance using semantic embeddings (server-side only)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { goalTitle, tasks, threshold } = body;

        if (!goalTitle || !tasks || !Array.isArray(tasks)) {
            return NextResponse.json(
                { error: 'goalTitle and tasks array are required' },
                { status: 400 }
            );
        }

        console.log(`[API] Validating ${tasks.length} tasks for goal: "${goalTitle}"`);

        // Run validation on server side where @xenova/transformers works
        const validatedTasks = await validateTaskRelevance(
            goalTitle,
            tasks,
            threshold || 0.6
        );

        return NextResponse.json({
            validatedTasks,
            originalCount: tasks.length,
            filteredCount: tasks.length - validatedTasks.length,
        });
    } catch (error) {
        console.error('[API] Error validating tasks:', error);
        return NextResponse.json(
            {
                error: 'Failed to validate tasks',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
