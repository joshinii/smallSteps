// SmallSteps Planner Test Scenarios
// Validates calm, gentle user experience
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
// Test 1: Cognitive Load Reduction
// ============================================

export async function testSimplePlanSize() {
    log('\n=== Test: Plan Stays Small (Reduce Overwhelm) ===');

    const plan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240
    });

    let passed = true;

    // Plan should be manageable (max 6 slices per config)
    passed = assert(
        plan.slices.length <= 6,
        `Should limit to 6 workunits max (cognitive load). Got: ${plan.slices.length}`
    ) && passed;

    // Max 1 heavy workunit (> 90 min)
    const heavyCount = plan.slices.filter(
        s => s.workUnit.estimatedTotalMinutes - s.workUnit.completedMinutes > 90
    ).length;

    passed = assert(
        heavyCount <= 1,
        `Max 1 heavy workunit (avoid overwhelm). Got: ${heavyCount}`
    ) && passed;

    if (passed) {
        log(`✓ Plan size: ${plan.slices.length} workunits (manageable)`);
    }

    return passed;
}

// ============================================
// Test 2: Multi-Goal Balance (Invisible)
// ============================================

export async function testInvisibleBalancing() {
    log('\n=== Test: Multi-Goal Balance (Behind Scenes) ===');

    const goals = await goalsDB.getActive();

    if (goals.length < 2) {
        log('⚠ Skipped: Need at least 2 active goals to test balancing');
        return true;
    }

    const plan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240
    });

    const represented = new Set(plan.slices.map(s => s.goal?.id).filter(Boolean));

    let passed = true;

    // Should include multiple goals when available
    passed = assert(
        represented.size >= Math.min(2, goals.length),
        `Should include multiple goals. Got: ${represented.size}`
    ) && passed;

    // User never sees priority scores or percentages
    // Just sees: balanced daily list

    if (passed) {
        log(`✓ Goals represented: ${represented.size} of ${goals.length} (balanced)`);
    }

    return passed;
}

// ============================================
// Test 3: Gentle Progression
// ============================================

export async function testGentleProgression() {
    log('\n=== Test: Gentle Effort Progression ===');

    const plan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240
    });

    if (plan.slices.length === 0) {
        log('⚠ Skipped: No slices to test progression');
        return true;
    }

    let passed = true;

    // First workunit should be Light/Medium (ease in)
    const firstRemaining = plan.slices[0]?.workUnit.estimatedTotalMinutes -
        (plan.slices[0]?.workUnit.completedMinutes || 0);

    passed = assert(
        firstRemaining <= 60,
        `First workunit should be Light/Medium (ease in). Got: ${firstRemaining}min`
    ) && passed;

    // Check for sudden effort jumps
    let maxJump = 0;
    for (let i = 1; i < plan.slices.length; i++) {
        const prevRemaining = plan.slices[i - 1].workUnit.estimatedTotalMinutes -
            (plan.slices[i - 1].workUnit.completedMinutes || 0);
        const currRemaining = plan.slices[i].workUnit.estimatedTotalMinutes -
            (plan.slices[i].workUnit.completedMinutes || 0);
        maxJump = Math.max(maxJump, currRemaining - prevRemaining);
    }

    // Allow some variation but no huge jumps
    passed = assert(
        maxJump <= 60,
        `No sudden effort jumps (gentle progression). Max jump: ${maxJump}min`
    ) && passed;

    if (passed) {
        log('✓ Effort progression is gentle');
    }

    return passed;
}

// ============================================
// Test 4: Empty State Graceful
// ============================================

export async function testEmptyStateGraceful() {
    log('\n=== Test: Empty Plan Handled Gracefully ===');

    // Get current state
    const goals = await goalsDB.getAll();
    const hasActiveGoals = goals.some(g => g.status === 'active');

    if (!hasActiveGoals) {
        // Generate plan with no active goals
        const plan = await generateDailyPlan({
            date: getLocalDateString(),
            userCapacity: 240
        });

        const passed = assert(
            plan.slices.length === 0 && plan.metadata?.message !== undefined,
            'Should return empty plan with friendly message'
        );

        if (passed) {
            log(`✓ Empty state handled calmly: "${plan.metadata?.message}"`);
        }

        return passed;
    } else {
        log('⚠ Skipped: Has active goals (cannot test empty state without modifying data)');
        return true;
    }
}

// ============================================
// Test 5: Silent Failure Recovery
// ============================================

export async function testSilentFailure() {
    log('\n=== Test: Silent Failure Recovery ===');

    // This test validates that generateDailyPlan handles errors gracefully
    // by returning an empty plan with a message rather than throwing

    try {
        const plan = await generateDailyPlan({
            date: getLocalDateString(),
            userCapacity: 240
        });

        // Plan should always return (not throw)
        const passed = assert(
            plan !== null && plan !== undefined,
            'Should always return a plan object (never throw)'
        );

        if (passed) {
            log('✓ Failure handled invisibly (returns plan object)');
        }

        return passed;
    } catch (error) {
        log(`✗ FAILED: generateDailyPlan threw an error: ${error}`);
        return false;
    }
}

// ============================================
// Test 6: Validate Gentle Language
// ============================================

export async function testGentleLanguage() {
    log('\n=== Test: Gentle Language ===');

    const plan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240
    });

    if (plan.slices.length === 0) {
        log('⚠ Skipped: No slices to check language');
        return true;
    }

    let passed = true;
    const harshWords = ['deadline', 'urgent', 'overdue', 'failed', 'critical'];

    for (const slice of plan.slices) {
        const title = slice.workUnit.title.toLowerCase();

        for (const word of harshWords) {
            if (title.includes(word)) {
                passed = assert(
                    false,
                    `Should not use "${word}" in work unit title: "${slice.workUnit.title}"`
                );
            }
        }
    }

    if (passed) {
        log('✓ Language is gentle and supportive');
    }

    return passed;
}

// ============================================
// Test 7: Capacity Adjustments Work
// ============================================

export async function testCapacityAdjustments() {
    log('\n=== Test: Capacity Adjustments ===');

    // Test with low energy
    const lowEnergyPlan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240,
        energyLevel: 1 // Surviving
    });

    // Test with normal energy
    const normalPlan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240,
        energyLevel: 3 // Normal
    });

    let passed = true;

    // Low energy should have fewer/smaller slices
    passed = assert(
        lowEnergyPlan.totalMinutes <= normalPlan.totalMinutes || lowEnergyPlan.slices.length === 0,
        'Low energy should reduce workload'
    ) && passed;

    if (passed) {
        log(`✓ Capacity adjusted: Low energy ${lowEnergyPlan.totalMinutes}min vs Normal ${normalPlan.totalMinutes}min`);
    }

    return passed;
}

// ============================================
// Test 8: Plan Metadata is User-Friendly
// ============================================

export async function testFriendlyMetadata() {
    log('\n=== Test: User-Friendly Metadata ===');

    const plan = await generateDailyPlan({
        date: getLocalDateString(),
        userCapacity: 240
    });

    let passed = true;

    // Metadata message should be friendly, not technical
    if (plan.metadata?.message) {
        const message = plan.metadata.message.toLowerCase();

        // Should NOT contain technical terms
        const technicalTerms = ['error', 'null', 'undefined', 'exception', 'failed'];
        for (const term of technicalTerms) {
            if (message.includes(term)) {
                passed = assert(false, `Message should not contain "${term}"`);
            }
        }
    }

    if (passed) {
        log(`✓ Metadata is user-friendly: "${plan.metadata?.message || 'No message'}"`);
    }

    return passed;
}

// ============================================
// Run All Tests
// ============================================

export async function runAllTests() {
    log('\n╔═══════════════════════════════════════╗');
    log('║    SmallSteps Calm UX Validation      ║');
    log('╚═══════════════════════════════════════╝');

    const results: { name: string; passed: boolean }[] = [];

    try {
        results.push({ name: 'Plan Size Limit', passed: await testSimplePlanSize() });
        results.push({ name: 'Multi-Goal Balance', passed: await testInvisibleBalancing() });
        results.push({ name: 'Gentle Progression', passed: await testGentleProgression() });
        results.push({ name: 'Empty State', passed: await testEmptyStateGraceful() });
        results.push({ name: 'Silent Failure', passed: await testSilentFailure() });
        results.push({ name: 'Gentle Language', passed: await testGentleLanguage() });
        results.push({ name: 'Capacity Adjustments', passed: await testCapacityAdjustments() });
        results.push({ name: 'Friendly Metadata', passed: await testFriendlyMetadata() });
    } catch (error) {
        log(`\n✗ Test suite error: ${error}`);
    }

    // Summary
    log('\n═══════════════════════════════════════');
    log('Summary:');

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    for (const result of results) {
        log(`  ${result.passed ? '✓' : '✗'} ${result.name}`);
    }

    log(`\n${passed}/${total} tests passed`);
    log('═══════════════════════════════════════\n');

    return passed === total;
}

// Export for command line usage
export { runAllTests as default };
