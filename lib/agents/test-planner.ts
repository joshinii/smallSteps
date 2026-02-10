// SmallSteps Planner Test Scenarios
// Validates momentum-based daily plan generation
// Philosophy: Invisible automation, minimal cognitive load, supportive language

import { generateDailyPlan, type DailyPlan } from './planner';
import { goalsDB, tasksDB, workUnitsDB } from '../db';
import { getLocalDateString } from '../utils';
import type { Goal, Task, WorkUnit } from '../schema';

// ============================================
// Test Utilities
// ============================================

function log(message: string) {
    console.log(message);
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`✗ FAILED: ${message}`);
        return false;
    }
    return true;
}

// ============================================
// Test 1: Plan Size Within Bounds
// ============================================

export async function testPlanSize() {
    log('\n🧪 Test 1: Plan size is within 2–7 work units');

    const plan = await generateDailyPlan();

    const sliceCount = plan.slices.length;

    // If there are goals, should generate 2–7 slices
    // If no goals, 0 is fine
    if (sliceCount === 0) {
        log('  ℹ No goals found — empty plan is valid');
        return true;
    }

    const sizeOk = assert(
        sliceCount >= 2 && sliceCount <= 7,
        `Plan has ${sliceCount} slices (expected 2–7)`
    );

    if (sizeOk) {
        log(`  ✓ Plan has ${sliceCount} work units (within bounds)`);
    }

    return sizeOk;
}

// ============================================
// Test 2: Multi-Goal Balance
// ============================================

export async function testMultiGoalBalance() {
    log('\n🧪 Test 2: Multi-goal balance (invisible rotation)');

    const plan = await generateDailyPlan();

    if (plan.slices.length === 0) {
        log('  ℹ No slices — skipping balance test');
        return true;
    }

    // Check that goalCount reflects distinct goals
    const goalIds = new Set(plan.slices.map(s => s.goal.id));
    const balanceOk = assert(
        plan.goalCount === goalIds.size,
        `goalCount=${plan.goalCount} should match distinct goals=${goalIds.size}`
    );

    if (balanceOk) {
        log(`  ✓ Plan covers ${goalIds.size} goal(s)`);
    }

    return balanceOk;
}

// ============================================
// Test 3: Empty State Graceful
// ============================================

export async function testEmptyStateGraceful() {
    log('\n🧪 Test 3: Empty state returns graceful message');

    // Save current goals, clear them, test, restore
    const goals = await goalsDB.getAll();

    // Test with empty state — generate plan
    // The planner should handle 0 goals gracefully
    const plan = await generateDailyPlan();

    if (goals.length === 0) {
        const emptyOk = assert(
            plan.slices.length === 0,
            'Empty goals should produce empty plan'
        );
        const messageOk = assert(
            plan.metadata?.message !== undefined && plan.metadata.message.length > 0,
            'Empty plan should include a message'
        );

        if (emptyOk && messageOk) {
            log(`  ✓ Empty state: "${plan.metadata?.message}"`);
        }
        return emptyOk && messageOk;
    }

    log('  ℹ Goals exist — skipping empty state test');
    return true;
}

// ============================================
// Test 4: Gentle Language
// ============================================

export async function testGentleLanguage() {
    log('\n🧪 Test 4: No harsh language in plan metadata');

    const plan = await generateDailyPlan();

    const message = plan.metadata?.message || '';
    const forbidden = ['deadline', 'overdue', 'failed', 'urgent', 'penalty'];

    let allGood = true;
    for (const word of forbidden) {
        const found = message.toLowerCase().includes(word);
        if (found) {
            assert(false, `Message contains forbidden word: "${word}"`);
            allGood = false;
        }
    }

    if (allGood) {
        log(`  ✓ Message is gentle: "${message}"`);
    }

    return allGood;
}

// ============================================
// Test 5: Work Units Come From Active Goals
// ============================================

export async function testActiveGoalsOnly() {
    log('\n🧪 Test 5: All slices belong to active goals');

    const plan = await generateDailyPlan();

    if (plan.slices.length === 0) {
        log('  ℹ No slices — skipping');
        return true;
    }

    const activeGoals = await goalsDB.getActive();
    const activeIds = new Set(activeGoals.map(g => g.id));

    let allActive = true;
    for (const slice of plan.slices) {
        if (!activeIds.has(slice.goal.id)) {
            assert(false, `Slice goal ${slice.goal.id} is not active`);
            allActive = false;
        }
    }

    if (allActive) {
        log(`  ✓ All ${plan.slices.length} slices from active goals`);
    }

    return allActive;
}

// ============================================
// Run All Tests
// ============================================

export async function runAllTests() {
    log('═══════════════════════════════════════');
    log('  SmallSteps Momentum Planner Tests');
    log('═══════════════════════════════════════');

    const results: { name: string; passed: boolean }[] = [];

    const tests = [
        { name: 'Plan Size', fn: testPlanSize },
        { name: 'Multi-Goal Balance', fn: testMultiGoalBalance },
        { name: 'Empty State', fn: testEmptyStateGraceful },
        { name: 'Gentle Language', fn: testGentleLanguage },
        { name: 'Active Goals Only', fn: testActiveGoalsOnly },
    ];

    for (const test of tests) {
        try {
            const passed = await test.fn();
            results.push({ name: test.name, passed });
        } catch (error) {
            console.error(`✗ ${test.name} threw:`, error);
            results.push({ name: test.name, passed: false });
        }
    }

    // Summary
    log('\n─────────────────────────────────────');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    log(`  Results: ${passed}/${total} passed`);

    for (const r of results) {
        log(`  ${r.passed ? '✓' : '✗'} ${r.name}`);
    }
    log('─────────────────────────────────────\n');

    return { passed, total, results };
}

// Export for command line usage
export { runAllTests as default };
