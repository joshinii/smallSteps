import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@/lib/claude';

const prisma = new PrismaClient();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date } = body; // Current date context

        // Fetch last 14 days of logs
        const endDate = new Date(date);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 14);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const logs = await prisma.habitLog.findMany({
            where: {
                date: {
                    gte: startDateStr,
                    lte: endDateStr,
                },
            },
            include: {
                habit: true,
            },
            orderBy: {
                date: 'asc',
            },
        });

        const dailyLogs = await prisma.dailyLog.findMany({
            where: {
                date: {
                    gte: startDateStr,
                    lte: endDateStr,
                },
            },
            orderBy: {
                date: 'asc',
            },
        });

        // Format data for AI
        const history = logs.map(l => `${l.date}: ${l.habit.name} (${l.status})`).join('\n');
        const moments = dailyLogs.map(l => `${l.date}: ${l.moment || '(no moment)'}`).join('\n');

        const prompt = `
    You are a calm, non-judgmental observer helping someone notice patterns in their life.
    
    Here is their habit history for the last 2 weeks:
    ${history}

    Here are their daily "small moments":
    ${moments}

    Current Date: ${date}

    Your goal is to offer ONE short reflection (max 2 sentences).
    
    RULES:
    - NO streak language (don't say "streak", "broken", "maintained").
    - NO evaluation (don't say "good job", "keep it up", "you failed").
    - NO advice unless patterns are very clear and helpful.
    - Be gentle and observational.
    - Focus on the relationship between habits and rest/energy if possible.
    - Example: "It seems you found more time for reading on potential quiet days."
    - Example: "Movement has been consistent, even when detailed notes weren't recorded."
    
    Reflection:
    `;

        const message = await anthropic.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: 100, // Keep short
            temperature: DEFAULT_TEMPERATURE,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const reflection = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

        return NextResponse.json({ reflection });
    } catch (error) {
        console.error('Error generating reflection:', error);
        return NextResponse.json({ error: 'Failed to generate reflection' }, { status: 500 });
    }
}
