import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Cast query to any to bypass stale Prisma Client types if generation failed
        const ideas = await prisma.idea.findMany({
            where: {
                steps: {
                    some: {
                        completed: true,
                        // @ts-ignore: Property might not exist on stale client
                        isRepetitive: false
                    }
                }
            },
            include: {
                steps: {
                    where: {
                        completed: true,
                        // @ts-ignore: Property might not exist on stale client
                        isRepetitive: false
                    },
                    orderBy: {
                        completedAt: 'asc'
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        // Add default completedAt if missing (for legacy data)
        const sanitized = ideas.map((idea: any) => ({
            ...idea,
            steps: idea.steps.map((step: any) => ({
                ...step,
                completedAt: step.completedAt || step.createdAt
            }))
        }));

        return NextResponse.json(sanitized);
    } catch (error) {
        console.error('Error fetching journey:', error);
        return NextResponse.json({ error: 'Error fetching journey' }, { status: 500 });
    }
}
