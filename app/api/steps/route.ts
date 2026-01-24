import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/steps - Fetch steps (with optional filters)
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type');
        const completed = searchParams.get('completed');
        const ideaId = searchParams.get('ideaId');

        const where: any = {};
        if (type) where.type = type;
        if (completed !== null && completed !== undefined) where.completed = completed === 'true';
        if (ideaId) where.ideaId = ideaId;

        const steps = await prisma.step.findMany({
            where,
            include: {
                idea: true,
                reflection: true,
            },
            orderBy: [
                { completed: 'asc' },
                { order: 'asc' },
            ],
        });

        return NextResponse.json(steps);
    } catch (error) {
        console.error('Error fetching steps:', error);
        return NextResponse.json(
            { error: 'Failed to fetch steps' },
            { status: 500 }
        );
    }
}

// POST /api/steps - Create daily tasks for an idea
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { ideaId, tasks } = body;

        if (!ideaId || !tasks || !Array.isArray(tasks)) {
            return NextResponse.json(
                { error: 'ideaId and tasks array are required' },
                { status: 400 }
            );
        }

        // Create all tasks
        const createdSteps = await prisma.$transaction(async (tx) => {
            const steps = [];

            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const step = await tx.step.create({
                    data: {
                        ideaId,
                        content: task.task,
                        type: task.category || 'action', // Use category as type
                        order: i,
                    },
                });
                steps.push(step);
            }

            return steps;
        });

        return NextResponse.json(createdSteps, { status: 201 });
    } catch (error) {
        console.error('Error creating steps:', error);
        return NextResponse.json(
            { error: 'Failed to create steps' },
            { status: 500 }
        );
    }
}
