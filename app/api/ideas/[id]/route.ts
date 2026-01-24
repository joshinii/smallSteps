import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/ideas/[id] - Update an idea
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { clarifiedContent, priority, targetDate, status } = body;

        const updateData: any = {};
        if (clarifiedContent !== undefined) updateData.clarifiedContent = clarifiedContent;
        if (priority !== undefined) updateData.priority = priority;
        if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null;
        if (status !== undefined) updateData.status = status;

        const idea = await prisma.idea.update({
            where: { id },
            data: updateData,
            include: {
                steps: {
                    orderBy: { order: 'asc' },
                },
            },
        });

        return NextResponse.json(idea);
    } catch (error) {
        console.error('Error updating idea:', error);
        return NextResponse.json(
            { error: 'Failed to update idea' },
            { status: 500 }
        );
    }
}

// DELETE /api/ideas/[id] - Delete an idea
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        await prisma.idea.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting idea:', error);
        return NextResponse.json(
            { error: 'Failed to delete idea' },
            { status: 500 }
        );
    }
}
