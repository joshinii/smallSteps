import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM

    if (!month) {
        return NextResponse.json({ error: 'Month is required' }, { status: 400 });
    }

    try {
        const completions = await prisma.taskCompletion.findMany({
            where: {
                date: {
                    startsWith: month
                }
            }
        });

        return NextResponse.json(completions);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch completions' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { stepId, date, completed } = body;

        // Upsert completion record
        // Note: Our schema has `completed` Boolean.
        // If user wants 'Skipped', we might need to update schema or imply it.
        // For now, let's stick to boolean. 
        // Wait, user asked for "completed, not done or skipped".
        // Boolean `completed` is not enough.
        // I should check if I can change schema or overlay logic.
        // The existing `TaskCompletion` model has `completed Boolean`.
        // I will assume for now: True=Done, False=Not Done (or maybe create record = done, no record = not done).
        // But to track "Skipped", we need state.
        // I'll stick to Boolean for now to match schema. 
        // If I need 'Skipped', I'll treat it as 'False' but maybe 'completed=false' means skipped explicitly if record exists?
        // Let's interpret: Record Exists + Completed=True -> Done.
        // Record Exists + Completed=False -> Skipped/Not Done explicitly?

        const completion = await prisma.taskCompletion.upsert({
            where: {
                stepId_date: {
                    stepId,
                    date
                }
            },
            update: {
                completed
            },
            create: {
                stepId,
                date,
                completed
            }
        });

        return NextResponse.json(completion);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save completion' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const stepId = searchParams.get('stepId');
    const date = searchParams.get('date');

    if (!stepId || !date) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    try {
        await prisma.taskCompletion.delete({
            where: {
                stepId_date: { stepId, date }
            }
        });
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Failed delete' }, { status: 500 });
    }
}
