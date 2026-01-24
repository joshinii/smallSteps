import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/reflections - Create a reflection
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

        if (!['LIGHTER', 'NEUTRAL', 'HARD'].includes(feeling)) {
            return NextResponse.json(
                { error: 'Invalid feeling value' },
                { status: 400 }
            );
        }

        const reflection = await prisma.reflection.create({
            data: {
                stepId,
                feeling,
                note: note || null,
            },
        });

        return NextResponse.json(reflection, { status: 201 });
    } catch (error) {
        console.error('Error creating reflection:', error);
        return NextResponse.json(
            { error: 'Failed to create reflection' },
            { status: 500 }
        );
    }
}
