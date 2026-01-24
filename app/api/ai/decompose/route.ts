import { NextRequest, NextResponse } from 'next/server';
import { decomposeIdea } from '@/lib/agents/decomposer';

// POST /api/ai/decompose - Decompose an idea into daily tasks using AI
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clarifiedIdea, targetDate } = body;

        if (!clarifiedIdea || clarifiedIdea.trim().length === 0) {
            return NextResponse.json(
                { error: 'Clarified idea is required' },
                { status: 400 }
            );
        }

        const result = await decomposeIdea(clarifiedIdea, targetDate);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error decomposing idea:', error);
        return NextResponse.json(
            { error: 'Failed to decompose idea' },
            { status: 500 }
        );
    }
}
