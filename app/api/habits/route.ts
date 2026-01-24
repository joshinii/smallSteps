import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET: Fetch all active habits
export async function GET() {
    try {
        const habits = await prisma.habit.findMany({
            where: { archived: false },
            orderBy: { createdAt: 'asc' },
        });
        return NextResponse.json(habits);
    } catch (error) {
        console.error('Error fetching habits:', error);
        return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
    }
}

// POST: Create a new habit
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, type, frequency } = body;

        // Check limit of 5 active habits
        const count = await prisma.habit.count({
            where: { archived: false },
        });

        if (count >= 5) {
            return NextResponse.json(
                { error: 'Max 5 active habits allowed. Please archive one first.' },
                { status: 400 }
            );
        }

        const habit = await prisma.habit.create({
            data: {
                name,
                type,
                frequency,
            },
        });

        return NextResponse.json(habit);
    } catch (error) {
        console.error('Error creating habit:', error);
        return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
    }
}
