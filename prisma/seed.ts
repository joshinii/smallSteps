import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database with example ideas...');

    // Clear existing data
    await prisma.reflection.deleteMany();
    await prisma.step.deleteMany();
    await prisma.idea.deleteMany();

    // Create seed ideas
    const ideas = [
        {
            content: 'organize my closet',
            priority: 'MEDIUM',
            targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        },
        {
            content: 'start learning guitar',
            priority: 'LOW',
            targetDate: null,
        },
        {
            content: 'fix leaky kitchen faucet',
            priority: 'HIGH',
            targetDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        },
        {
            content: 'write a blog post about productivity',
            priority: 'MEDIUM',
            targetDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        },
        {
            content: 'plan a weekend trip',
            priority: 'LOW',
            targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        },
    ];

    for (const ideaData of ideas) {
        await prisma.idea.create({
            data: ideaData,
        });
    }

    console.log('✅ Seed data created successfully!');
    console.log('📝 Created 5 example ideas');
    console.log('\nNext steps:');
    console.log('1. Start the dev server: npm run dev');
    console.log('2. Open http://localhost:3000');
    console.log('3. Click "Break it down" on any idea to see AI in action!');
}

main()
    .catch((e) => {
        console.error('Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
