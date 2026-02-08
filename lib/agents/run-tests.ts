// Test runner for SmallSteps planner tests
// Run with: npx tsx lib/agents/run-tests.ts

import { runAllTests } from './test-planner';

async function main() {
    console.log('Starting SmallSteps Planner Tests...\n');

    try {
        const success = await runAllTests();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Test runner failed:', error);
        process.exit(1);
    }
}

main();
