import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/ideas - Fetch all ideas with their steps
export async function GET() {
    try {
        // Ensure Prisma client is connected
        await prisma.$connect();

        const ideas = await prisma.idea.findMany({
            include: {
                steps: {
                    orderBy: { order: 'asc' },
                    include: {
                        reflection: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(ideas);
    } catch (error) {
        console.error('Error fetching ideas:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json(
            { error: 'Failed to fetch ideas', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// POST /api/ideas - Create a new idea
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { content, priority = 'MEDIUM', targetDate } = body;

        if (!content || content.trim().length === 0) {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        const idea = await prisma.idea.create({
            data: {
                content: content.trim(),
                priority,
                targetDate: targetDate ? new Date(targetDate) : null,
            },
        });

        return NextResponse.json(idea, { status: 201 });
    } catch (error) {
        console.error('Error creating idea:', error);
        return NextResponse.json(
            { error: 'Failed to create idea' },
            { status: 500 }
        );
    }
}
