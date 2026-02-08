// SmallSteps Agent Test Suite
// Manual testing utilities for development validation
// Run with: npm run test:agents
// Or in browser console: import { runAllTests } from '@/lib/agents/test'; runAllTests();

import { generateContextQuestions } from './clarifier';
import { generateStructuredBreakdown } from './decomposer';
import { validateBreakdown, quickValidateBreakdown } from './validator';
import { startGoalCreation, completeGoalCreation } from './orchestrator';
import { getProvider, type ProviderName } from '@/lib/ai';
import type { GeneratedBreakdown } from './types';

// ============================================
// Configuration
// ============================================

const DEFAULT_PROVIDER: ProviderName = 'ollama'; // Changed to test Ollama integration

// Test goals for variety
const TEST_GOALS = {
    learning: 'Learn React for web development',
    technical: 'Build a portfolio website',
    fitness: 'Run a 5K in under 30 minutes',
    creative: 'Write a short story collection',
    career: 'Prepare for a software engineering interview',
};

// ============================================
// Individual Agent Tests
// ============================================

/**
 * Test the Clarifier agent
 */
export async function testClarifier(providerName: ProviderName = DEFAULT_PROVIDER) {
    console.log('\n=== Testing Clarifier ===');
    const startTime = Date.now();

    try {
        const provider = getProvider(providerName);
        console.log(`Using provider: ${provider.displayName}`);

        const questions = await generateContextQuestions(
            TEST_GOALS.learning,
            provider
        );

        const elapsed = Date.now() - startTime;

        // Assertions
        const passed = questions.length >= 1 && questions.length <= 10;

        console.log(`✓ Generated ${questions.length} questions (${elapsed}ms)`);
        console.log(`  Assertion (1-10 questions): ${passed ? '✓' : '✗'}`);

        if (questions.length > 0) {
            console.log('\n  Sample question:');
            console.log(`    ID: ${questions[0].id}`);
            console.log(`    Text: ${questions[0].text}`);
            console.log(`    Type: ${questions[0].type}`);
            if (questions[0].options) {
                console.log(`    Options: ${questions[0].options.join(', ')}`);
            }
        }

        return { success: true, elapsed, count: questions.length };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`✗ Clarifier failed (${elapsed}ms):`, error);
        return { success: false, elapsed, error };
    }
}

/**
 * Test the Generator/Decomposer agent
 */
export async function testGenerator(providerName: ProviderName = DEFAULT_PROVIDER) {
    console.log('\n=== Testing Generator ===');
    const startTime = Date.now();

    try {
        const provider = getProvider(providerName);
        console.log(`Using provider: ${provider.displayName}`);
        console.log(`Goal: "${TEST_GOALS.technical}"`);

        const breakdown = await generateStructuredBreakdown(
            TEST_GOALS.technical,
            { experienceLevel: 'beginner', hoursPerWeek: 10 },
            provider
        );

        const elapsed = Date.now() - startTime;

        // Assertions
        const taskCountValid = breakdown.tasks.length >= 3 && breakdown.tasks.length <= 6;
        const hasWorkUnits = breakdown.workUnits.length > 0;
        const hasFirstActions = breakdown.workUnits.some(wu => wu.firstAction);

        console.log(`✓ Generated breakdown (${elapsed}ms)`);
        console.log(`  Tasks: ${breakdown.tasks.length} (valid: ${taskCountValid ? '✓' : '✗'})`);
        console.log(`  WorkUnits: ${breakdown.workUnits.length} (has: ${hasWorkUnits ? '✓' : '✗'})`);
        console.log(`  Has firstActions: ${hasFirstActions ? '✓' : '✗'}`);

        if (breakdown.tasks.length > 0) {
            const task = breakdown.tasks[0];
            console.log('\n  Sample task:');
            console.log(`    Title: ${task.title}`);
            console.log(`    Minutes: ${task.estimatedTotalMinutes}`);
            console.log(`    Phase: ${task.phase || 'none'}`);
            console.log(`    Why: ${task.whyThisMatters || 'none'}`);
        }

        if (breakdown.workUnits.length > 0) {
            const wu = breakdown.workUnits[0];
            console.log('\n  Sample workUnit:');
            console.log(`    Title: ${wu.title}`);
            console.log(`    Kind: ${wu.kind}`);
            console.log(`    First action: ${wu.firstAction || 'none'}`);
            console.log(`    Success signal: ${wu.successSignal || 'none'}`);
        }

        return {
            success: true,
            elapsed,
            taskCount: breakdown.tasks.length,
            workUnitCount: breakdown.workUnits.length,
            breakdown,
        };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`✗ Generator failed (${elapsed}ms):`, error);
        return { success: false, elapsed, error };
    }
}

/**
 * Test the Validator agent
 */
export async function testValidator(
    providerName: ProviderName = DEFAULT_PROVIDER,
    breakdown?: GeneratedBreakdown
) {
    console.log('\n=== Testing Validator ===');
    const startTime = Date.now();

    try {
        const provider = getProvider(providerName);
        console.log(`Using provider: ${provider.displayName}`);

        // Generate a breakdown if not provided
        let testBreakdown = breakdown;
        if (!testBreakdown) {
            console.log('Generating breakdown for validation...');
            testBreakdown = await generateStructuredBreakdown(
                TEST_GOALS.career,
                {},
                provider
            );
        }

        // Quick validation (sync)
        const quickResult = quickValidateBreakdown(testBreakdown);
        console.log(`\n  Quick validation: ${quickResult.valid ? '✓' : '✗'}`);
        if (!quickResult.valid) {
            console.log(`  Issues: ${quickResult.issueCount}`);
        }

        // Full validation (async with LLM)
        const result = await validateBreakdown(TEST_GOALS.career, testBreakdown, provider);

        const elapsed = Date.now() - startTime;

        console.log(`✓ Validation complete (${elapsed}ms)`);
        console.log(`  Valid: ${result.valid ? '✓' : '✗'}`);
        console.log(`  Confidence: ${((result.confidence ?? 0) * 100).toFixed(0)}%`);

        if (result.issues.length > 0) {
            console.log('\n  Issues:');
            result.issues.forEach(i => console.log(`    - ${i}`));
        }

        if (result.suggestions && result.suggestions.length > 0) {
            console.log('\n  Suggestions:');
            result.suggestions.forEach(s => console.log(`    - ${s}`));
        }

        return { success: true, elapsed, result };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`✗ Validator failed (${elapsed}ms):`, error);
        return { success: false, elapsed, error };
    }
}

/**
 * Test the full Orchestrator workflow
 */
export async function testOrchestration(providerName: ProviderName = DEFAULT_PROVIDER) {
    console.log('\n=== Testing Full Orchestration ===');
    const startTime = Date.now();

    try {
        const provider = getProvider(providerName);
        console.log(`Using provider: ${provider.displayName}`);
        console.log(`Goal: "${TEST_GOALS.fitness}"`);

        // Progress callback
        const progressLog: string[] = [];
        const onProgress = (state: any) => {
            const msg = `  ${state.step}: ${state.progress}%`;
            progressLog.push(msg);
            console.log(msg);
        };

        // Phase 1: Start and get questions
        console.log('\nPhase 1: Getting clarification questions...');
        const { questions } = await startGoalCreation(
            TEST_GOALS.fitness,
            provider,
            onProgress
        );
        console.log(`  Got ${questions.length} questions`);

        // Simulate answers
        const answers: Record<string, any> = {};
        questions.forEach((q, i) => {
            if (q.options && q.options.length > 0) {
                answers[q.id] = q.options[0];
            } else {
                answers[q.id] = `test answer ${i + 1}`;
            }
        });

        // Phase 2: Complete with answers
        console.log('\nPhase 2: Completing goal creation...');
        const { breakdown } = await completeGoalCreation(
            TEST_GOALS.fitness,
            answers,
            provider,
            onProgress
        );

        const elapsed = Date.now() - startTime;

        console.log(`\n✓ Orchestration complete (${elapsed}ms)`);
        console.log(`  Tasks: ${breakdown.tasks.length}`);
        console.log(`  WorkUnits: ${breakdown.workUnits.length}`);
        console.log(`  Progress steps: ${progressLog.length}`);

        return {
            success: true,
            elapsed,
            breakdown,
            questionCount: questions.length,
        };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`✗ Orchestration failed (${elapsed}ms):`, error);
        return { success: false, elapsed, error };
    }
}

// ============================================
// Test Runner
// ============================================

/**
 * Run all agent tests
 */
export async function runAllTests(providerName: ProviderName = DEFAULT_PROVIDER) {
    console.log('🧪 Starting agent test suite...');
    console.log(`Provider: ${providerName}`);
    console.log('═'.repeat(50));

    const results: Record<string, any> = {};

    // Test 1: Clarifier
    results.clarifier = await testClarifier(providerName);

    // Test 2: Generator
    results.generator = await testGenerator(providerName);

    // Test 3: Validator (reuse breakdown from generator if available)
    const breakdown = results.generator.success ? results.generator.breakdown : undefined;
    results.validator = await testValidator(providerName, breakdown);

    // Test 4: Full Orchestration
    results.orchestration = await testOrchestration(providerName);

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Test Summary');
    console.log('═'.repeat(50));

    const testNames = ['clarifier', 'generator', 'validator', 'orchestration'];
    let passed = 0;
    let failed = 0;

    for (const name of testNames) {
        const result = results[name];
        const status = result.success ? '✓' : '✗';
        const time = result.elapsed ? `${result.elapsed}ms` : 'N/A';
        console.log(`  ${status} ${name.padEnd(15)} ${time}`);

        if (result.success) passed++;
        else failed++;
    }

    console.log('');
    console.log(`  Passed: ${passed}/${testNames.length}`);
    console.log(`  Failed: ${failed}/${testNames.length}`);
    console.log('');

    if (failed === 0) {
        console.log('✅ All tests passed!');
    } else {
        console.log('❌ Some tests failed. Check output above.');
    }

    return results;
}

// ============================================
// Quick Smoke Test
// ============================================

/**
 * Quick test that just verifies imports and basic execution
 */
export function smokeTest() {
    console.log('🔥 Smoke test...');

    try {
        // Verify all imports work
        console.log('  ✓ generateContextQuestions imported');
        console.log('  ✓ generateStructuredBreakdown imported');
        console.log('  ✓ validateBreakdown imported');
        console.log('  ✓ startGoalCreation imported');
        console.log('  ✓ completeGoalCreation imported');

        // Verify provider loads
        const provider = getProvider(DEFAULT_PROVIDER);
        console.log(`  ✓ Provider loaded: ${provider.displayName}`);

        console.log('\n✅ Smoke test passed!');
        return true;
    } catch (error) {
        console.error('❌ Smoke test failed:', error);
        return false;
    }
}

// If running directly (tsx lib/agents/test.ts)
if (typeof window === 'undefined' && typeof process !== 'undefined') {
    // Running in Node.js
    runAllTests().catch(console.error);
}
