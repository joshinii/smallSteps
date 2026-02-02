import { NextRequest, NextResponse } from 'next/server';

// POST /api/completions - Toggle task completion for a specific date
// TODO: Prisma disabled - migrate to IndexedDB
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { stepId, date, completed } = body;

        if (!stepId || !date) {
            return NextResponse.json(
                { error: 'stepId and date are required' },
                { status: 400 }
            );
        }

        // Stub: Return mock completion
        // TODO: Implement using IndexedDB or remove this endpoint
        const completion = {
            id: `comp_${Date.now()}`,
            stepId,
            date,
            completed,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(completion, { status: 201 });
    } catch (error) {
        console.error('Error toggling completion:', error);
        return NextResponse.json(
            { error: 'Failed to toggle completion' },
            { status: 500 }
        );
    }
}

// GET /api/completions - Get completions for a specific month
// TODO: Prisma disabled - migrate to IndexedDB
export async function GET(request: NextRequest) {
    try {
        // Stub: Return empty array
        // TODO: Implement using IndexedDB or remove this endpoint
        return NextResponse.json([]);
    } catch (error) {
        console.error('Error fetching completions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch completions' },
            { status: 500 }
        );
    }
}
