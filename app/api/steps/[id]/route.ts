import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/steps/[id] - Update a step
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { completed, isRepetitive } = body;

        const updateData: any = {};

        if (completed !== undefined) {
            updateData.completed = completed;
            updateData.completedAt = completed ? new Date() : null;
        }

        if (isRepetitive !== undefined) {
            updateData.isRepetitive = isRepetitive;
        }

        const step = await prisma.step.update({
            where: { id },
            data: updateData,
            include: {
                reflection: true,
            },
        });

        // --- History Sync for Repetitive Tasks ---
        if (step.isRepetitive && completed !== undefined) {
            const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            if (completed === true) {
                // Record completion
                // @ts-ignore: Client stale
                const existing = await prisma.taskCompletion.findFirst({
                    where: {
                        stepId: id,
                        date: todayStr
                    }
                });

                if (!existing) {
                    // @ts-ignore: Client stale
                    await prisma.taskCompletion.create({
                        data: {
                            stepId: id,
                            date: todayStr,
                            completed: true
                        }
                    });
                }
            } else {
                // Remove completion for today (Undo)
                // @ts-ignore: Client stale
                await prisma.taskCompletion.deleteMany({
                    where: {
                        stepId: id,
                        date: todayStr
                    }
                });
            }
        }

        return NextResponse.json(step);
    } catch (error) {
        console.error('Error updating step:', error);
        return NextResponse.json(
            { error: 'Failed to update step' },
            { status: 500 }
        );
    }
}

// DELETE /api/steps/[id] - Delete a step
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        await prisma.step.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting step:', error);
        return NextResponse.json(
            { error: 'Failed to delete step' },
            { status: 500 }
        );
    }
}
