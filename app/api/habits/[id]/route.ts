import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        // Soft delete (archive)
        const habit = await prisma.habit.update({
            where: { id },
            data: { archived: true },
        });

        return NextResponse.json(habit);
    } catch (error) {
        console.error('Error archiving habit:', error);
        return NextResponse.json({ error: 'Failed to archive habit' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, type, frequency } = body;

        const habit = await prisma.habit.update({
            where: { id },
            data: { name, type, frequency },
        });

        return NextResponse.json(habit);
    } catch (error) {
        console.error('Error updating habit:', error);
        return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 });
    }
}
