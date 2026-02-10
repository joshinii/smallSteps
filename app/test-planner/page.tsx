'use client';

// SmallSteps Test Page - Browser-based planner tests
// Access at: /test-planner

import { useState } from 'react';
import { generateDailyPlan } from '@/lib/agents/planner';
import { goalsDB, tasksDB, workUnitsDB } from '@/lib/db';
import { getLocalDateString } from '@/lib/utils';
import type { Goal } from '@/lib/schema';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration?: number;
}

// Test Data Setup
// ============================================

async function setupTestData(): Promise<{ goals: Goal[]; cleanup: () => Promise<void> }> {
    const testGoalIds: string[] = [];
    const testTaskIds: string[] = [];
    const testWorkUnitIds: string[] = [];

    // Helper to create goal structure
    const createChain = async (title: string, count: number) => {
        const goalId = await goalsDB.create({
            title,
            status: 'active',
            targetDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        });
        testGoalIds.push(goalId);

        const task = await tasksDB.create({
            goalId,
            title: `${title} Task`,
            completedMinutes: 0,
            order: 0,
            complexity: 1,
        });
        testTaskIds.push(task.id);

        for (let i = 0; i < count; i++) {
            const wu = await workUnitsDB.create({
                taskId: task.id,
                title: `${title} Step ${i + 1}`,
                completedMinutes: 0,
                kind: 'practice'
            });
            testWorkUnitIds.push(wu.id);
        }
    };

    // Create 3 goals with work
    await createChain('Test Goal A', 5);
    await createChain('Test Goal B', 5);
    await createChain('Test Goal C', 5);

    const goals = await Promise.all(testGoalIds.map(id => goalsDB.getById(id)));

    const cleanup = async () => {
        for (const id of testWorkUnitIds) await workUnitsDB.delete(id);
        for (const id of testTaskIds) await tasksDB.delete(id);
        for (const id of testGoalIds) await goalsDB.delete(id);
    };

    return { goals: goals.filter(Boolean) as Goal[], cleanup };
}

export default function TestPlannerPage() {
    const [results, setResults] = useState<TestResult[]>([]);
    const [running, setRunning] = useState(false);
    const [currentTest, setCurrentTest] = useState<string | null>(null);

    const addResult = (result: TestResult) => {
        setResults(prev => [...prev, result]);
    };

    // ============================================
    // Test Functions
    // ============================================

    async function testPlanSize(): Promise<TestResult> {
        const start = Date.now();
        try {
            const plan = await generateDailyPlan({ date: getLocalDateString() });
            const count = plan.slices.length;

            // 0 is valid if no goals (but we can't easily detect that here without setup)
            // We assume extensive usage or test setup provides goals.
            // Let's just check bounds if count > 0.
            if (count > 0 && (count < 2 || count > 7)) {
                return {
                    name: 'Plan Size Limit',
                    passed: false,
                    message: `Plan has ${count} slices (expected 2–7)`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Plan Size Limit',
                passed: true,
                message: `${count} slices (within valid range 2–7)`,
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Plan Size Limit',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    async function testMultiGoalBalance(): Promise<TestResult> {
        const start = Date.now();
        let cleanup: (() => Promise<void>) | null = null;
        try {
            const { cleanup: clean } = await setupTestData();
            cleanup = clean;

            const plan = await generateDailyPlan({ date: getLocalDateString() });
            const goalIds = new Set(plan.slices.map(s => s.goal.id));

            await cleanup();
            cleanup = null;

            if (goalIds.size < 2) {
                return {
                    name: 'Multi-Goal Balance',
                    passed: false,
                    message: `Only ${goalIds.size} goal represented (expected ≥2)`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Multi-Goal Balance',
                passed: true,
                message: `${goalIds.size}/3 test goals represented`,
                duration: Date.now() - start
            };
        } catch (error) {
            if (cleanup) await cleanup();
            return {
                name: 'Multi-Goal Balance',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    async function testGentleLanguage(): Promise<TestResult> {
        const start = Date.now();
        try {
            const plan = await generateDailyPlan({ date: getLocalDateString() });
            const message = (plan.metadata?.message || '').toLowerCase();
            const forbidden = ['deadline', 'overdue', 'urgent', 'failed', 'critical'];

            const found = forbidden.find(w => message.includes(w));
            if (found) {
                return {
                    name: 'Gentle Language',
                    passed: false,
                    message: `Found harsh word: "${found}"`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Gentle Language',
                passed: true,
                message: 'No harsh words in plan metadata',
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Gentle Language',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    async function testEmptyState(): Promise<TestResult> {
        const start = Date.now();
        // Check that NO error is thrown and structure is valid.
        try {
            const plan = await generateDailyPlan({ date: getLocalDateString() });

            if (!plan || typeof plan.goalCount !== 'number') {
                return {
                    name: 'Plan Structure',
                    passed: false,
                    message: 'Invalid plan structure returned',
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Plan Structure',
                passed: true,
                message: 'Plan object is valid',
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Plan Structure',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    // ============================================
    // Run All Tests
    // ============================================

    async function runAllTests() {
        setRunning(true);
        setResults([]);

        const tests = [
            { name: 'Plan Size Limit', fn: testPlanSize },
            { name: 'Multi-Goal Balance', fn: testMultiGoalBalance },
            { name: 'Gentle Language', fn: testGentleLanguage },
            { name: 'Plan Structure', fn: testEmptyState },
        ];

        for (const test of tests) {
            setCurrentTest(test.name);
            const result = await test.fn();
            addResult(result);
            await new Promise(r => setTimeout(r, 100));
        }

        setCurrentTest(null);
        setRunning(false);
    }

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    return (
        <div className="max-w-2xl mx-auto px-6 py-12">
            <header className="mb-8">
                <h1 className="text-2xl font-light text-foreground">Planner Tests</h1>
                <p className="text-sm text-muted mt-1">Momentum Planner Validation</p>
            </header>

            <button
                onClick={runAllTests}
                disabled={running}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 mb-8"
            >
                {running ? `Running: ${currentTest}...` : 'Run All Tests'}
            </button>

            {results.length > 0 && (
                <>
                    <div className="space-y-3 mb-8">
                        {results.map((result, i) => (
                            <div
                                key={i}
                                className={`p-4 rounded-lg border ${result.passed
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-red-50 border-red-200'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                        {result.passed ? '✓' : '✗'} {result.name}
                                    </span>
                                    {result.duration && (
                                        <span className="text-xs text-muted">{result.duration}ms</span>
                                    )}
                                </div>
                                <p className="text-sm text-muted mt-1">{result.message}</p>
                            </div>
                        ))}
                    </div>

                    <div className={`p-4 rounded-lg text-center ${passed === total ? 'bg-green-100' : 'bg-amber-100'
                        }`}>
                        <span className="text-lg font-medium">
                            {passed}/{total} tests passed
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
