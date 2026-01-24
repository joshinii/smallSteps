import { NextRequest, NextResponse } from 'next/server';
import { clarifyIdea } from '@/lib/agents/clarifier';

// POST /api/ai/clarify - Clarify an idea using AI
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { idea } = body;

        if (!idea || idea.trim().length === 0) {
            return NextResponse.json(
                { error: 'Idea content is required' },
                { status: 400 }
            );
        }

        const clarified = await clarifyIdea(idea);

        return NextResponse.json({ clarified });
    } catch (error) {
        console.error('Error clarifying idea:', error);
        return NextResponse.json(
            { error: 'Failed to clarify idea' },
            { status: 500 }
        );
    }
}
