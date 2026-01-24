import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/completions - Toggle task completion for a specific date
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

        // Check if completion already exists for this date
        const existing = await prisma.taskCompletion.findUnique({
            where: {
                stepId_date: {
                    stepId,
                    date,
                },
            },
        });

        if (existing) {
            // Update existing
            const updated = await prisma.taskCompletion.update({
                where: {
                    stepId_date: {
                        stepId,
                        date,
                    },
                },
                data: { completed },
            });
            return NextResponse.json(updated);
        } else {
            // Create new
            const created = await prisma.taskCompletion.create({
                data: {
                    stepId,
                    date,
                    completed,
                },
            });
            return NextResponse.json(created, { status: 201 });
        }
    } catch (error) {
        console.error('Error toggling completion:', error);
        return NextResponse.json(
            { error: 'Failed to toggle completion' },
            { status: 500 }
        );
    }
}

// GET /api/completions - Get completions for a specific month
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const stepId = searchParams.get('stepId');
        const month = searchParams.get('month'); // YYYY-MM format
        const year = searchParams.get('year');

        const where: any = {};

        if (stepId) {
            where.stepId = stepId;
        }

        if (month && year) {
            // Filter by month
            where.date = {
                startsWith: `${year}-${month.padStart(2, '0')}`,
            };
        } else if (month) {
            // Just month filter (assuming current year)
            const currentYear = new Date().getFullYear();
            where.date = {
                startsWith: `${currentYear}-${month.padStart(2, '0')}`,
            };
        }

        const completions = await prisma.taskCompletion.findMany({
            where,
            include: {
                step: {
                    include: {
                        idea: true,
                    },
                },
            },
        });

        return NextResponse.json(completions);
    } catch (error) {
        console.error('Error fetching completions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch completions' },
            { status: 500 }
        );
    }
}
