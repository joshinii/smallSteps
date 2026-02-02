import { NextRequest, NextResponse } from 'next/server';

// POST /api/reflections - Create a reflection
// TODO: Prisma disabled - migrate to IndexedDB
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { stepId, feeling, note } = body;

        if (!stepId || !feeling) {
            return NextResponse.json(
                { error: 'stepId and feeling are required' },
                { status: 400 }
            );
        }

        // Stub: Return mock reflection
        // TODO: Implement using IndexedDB or remove this endpoint
        const reflection = {
            id: `ref_${Date.now()}`,
            stepId,
            feeling,
            note: note || null,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(reflection, { status: 201 });
    } catch (error) {
        console.error('Error creating reflection:', error);
        return NextResponse.json(
            { error: 'Failed to create reflection' },
            { status: 500 }
        );
    }
}
