import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET: Fetch logs for a specific month (YYYY-MM)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // "2024-01"

        if (!month) {
            return NextResponse.json({ error: 'Month parameter required' }, { status: 400 });
        }

        // Fetch daily logs (moments)
        const dailyLogs = await prisma.dailyLog.findMany({
            where: {
                date: {
                    startsWith: month,
                },
            },
        });

        // Fetch habit logs
        const habitLogs = await prisma.habitLog.findMany({
            where: {
                date: {
                    startsWith: month,
                },
            },
        });

        return NextResponse.json({ dailyLogs, habitLogs });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}

// POST: Save a day's log (moment + habits)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, moment, habits } = body; // habits: { [habitId]: status }

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        // 1. Upsert Daily Log (Moment)
        // Even if moment is empty, we might just be saving habit logs, but if moment is provided:
        let loggedMoment = null;
        if (moment !== undefined) {
            loggedMoment = await prisma.dailyLog.upsert({
                where: { date },
                update: { moment },
                create: { date, moment },
            });
        }

        // 2. Upsert Habit Logs
        const logPromises = Object.entries(habits).map(([habitId, status]) => {
            return prisma.habitLog.upsert({
                where: {
                    habitId_date: {
                        habitId,
                        date,
                    },
                },
                update: { status: status as string },
                create: {
                    habitId,
                    date,
                    status: status as string,
                },
            });
        });

        await Promise.all(logPromises);

        return NextResponse.json({ success: true, dailyLog: loggedMoment });
    } catch (error) {
        console.error('Error saving daily log:', error);
        return NextResponse.json({ error: 'Failed to save daily log' }, { status: 500 });
    }
}
