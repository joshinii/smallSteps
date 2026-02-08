'use client';

// SmallSteps Test Page - Browser-based planner tests
// Access at: /test-planner

import { useState, useEffect } from 'react';
import { generateDailyPlan } from '@/lib/agents/planner';
import { goalsDB, tasksDB, workUnitsDB } from '@/lib/db';
import { getLocalDateString, generateId } from '@/lib/utils';
import type { Slice, Goal, Task, WorkUnit } from '@/lib/schema';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration?: number;
}

// Test Data Setup - Creates varied work units
// ============================================

async function setupTestData(): Promise<{ goals: Goal[]; cleanup: () => Promise<void> }> {
    const testGoalIds: string[] = [];
    const testTaskIds: string[] = [];
    const testWorkUnitIds: string[] = [];

    // Goal 1: High Priority - Learn React (sooner target date)
    const goal1Id = await goalsDB.create({
        title: 'Learn React Fundamentals',
        status: 'active',
        targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    testGoalIds.push(goal1Id);

    // Task 1 for Goal 1
    const task1 = await tasksDB.create({
        goalId: goal1Id,
        title: 'React Basics',
        estimatedTotalMinutes: 300,
        completedMinutes: 0,
        order: 0,
        complexity: 2,
    });
    testTaskIds.push(task1.id);

    // Work Units for Task 1 - varied sizes (Light/Medium/Heavy)
    const wu1a = await workUnitsDB.create({ taskId: task1.id, title: 'Read React intro', estimatedTotalMinutes: 30, completedMinutes: 0, kind: 'study' });
    const wu1b = await workUnitsDB.create({ taskId: task1.id, title: 'Set up environment', estimatedTotalMinutes: 30, completedMinutes: 0, kind: 'build' });
    const wu1c = await workUnitsDB.create({ taskId: task1.id, title: 'Build first component', estimatedTotalMinutes: 60, completedMinutes: 0, kind: 'practice' });
    const wu1d = await workUnitsDB.create({ taskId: task1.id, title: 'Practice hooks', estimatedTotalMinutes: 60, completedMinutes: 0, kind: 'practice' });
    const wu1e = await workUnitsDB.create({ taskId: task1.id, title: 'Build mini project', estimatedTotalMinutes: 120, completedMinutes: 0, kind: 'build' });
    testWorkUnitIds.push(wu1a.id, wu1b.id, wu1c.id, wu1d.id, wu1e.id);

    // Goal 2: Medium Priority - Healthy Cooking (later target date)
    const goal2Id = await goalsDB.create({
        title: 'Learn Healthy Cooking',
        status: 'active',
        targetDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    testGoalIds.push(goal2Id);

    // Task 2 for Goal 2
    const task2 = await tasksDB.create({
        goalId: goal2Id,
        title: 'Cooking Basics',
        estimatedTotalMinutes: 240,
        completedMinutes: 0,
        order: 0,
        complexity: 2,
    });
    testTaskIds.push(task2.id);

    // Work Units for Task 2 - varied sizes
    const wu2a = await workUnitsDB.create({ taskId: task2.id, title: 'Research meal prep', estimatedTotalMinutes: 30, completedMinutes: 0, kind: 'study' });
    const wu2b = await workUnitsDB.create({ taskId: task2.id, title: 'Plan weekly menu', estimatedTotalMinutes: 30, completedMinutes: 0, kind: 'explore' });
    const wu2c = await workUnitsDB.create({ taskId: task2.id, title: 'Get ingredients', estimatedTotalMinutes: 30, completedMinutes: 0, kind: 'explore' });
    const wu2d = await workUnitsDB.create({ taskId: task2.id, title: 'Practice basic recipes', estimatedTotalMinutes: 60, completedMinutes: 0, kind: 'practice' });
    const wu2e = await workUnitsDB.create({ taskId: task2.id, title: 'Cook full meal', estimatedTotalMinutes: 90, completedMinutes: 0, kind: 'build' });
    testWorkUnitIds.push(wu2a.id, wu2b.id, wu2c.id, wu2d.id, wu2e.id);

    // Goal 3: Low Priority - Exercise Routine (latest target date)
    const goal3Id = await goalsDB.create({
        title: 'Start Exercise Routine',
        status: 'active',
        targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    testGoalIds.push(goal3Id);

    // Task 3 for Goal 3
    const task3 = await tasksDB.create({
        goalId: goal3Id,
        title: 'Exercise Basics',
        estimatedTotalMinutes: 155,
        completedMinutes: 0,
        order: 0,
        complexity: 1,
    });
    testTaskIds.push(task3.id);

    // Work Units for Task 3 - varied sizes
    const wu3a = await workUnitsDB.create({ taskId: task3.id, title: 'Research workout plans', estimatedTotalMinutes: 20, completedMinutes: 0, kind: 'study' });
    const wu3b = await workUnitsDB.create({ taskId: task3.id, title: 'Buy workout gear', estimatedTotalMinutes: 30, completedMinutes: 0, kind: 'explore' });
    const wu3c = await workUnitsDB.create({ taskId: task3.id, title: 'First workout session', estimatedTotalMinutes: 45, completedMinutes: 0, kind: 'practice' });
    const wu3d = await workUnitsDB.create({ taskId: task3.id, title: 'Full week of workouts', estimatedTotalMinutes: 60, completedMinutes: 0, kind: 'practice' });
    testWorkUnitIds.push(wu3a.id, wu3b.id, wu3c.id, wu3d.id);

    // Get all created goals for return
    const goals = await Promise.all(testGoalIds.map(id => goalsDB.getById(id)));

    // Cleanup function
    const cleanup = async () => {
        for (const id of testWorkUnitIds) {
            await workUnitsDB.delete(id);
        }
        for (const id of testTaskIds) {
            await tasksDB.delete(id);
        }
        for (const id of testGoalIds) {
            await goalsDB.delete(id);
        }
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

    async function testSimplePlanSize(): Promise<TestResult> {
        const start = Date.now();
        try {
            const plan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240
            });

            // Check heavy work units based on slice minutes (what user actually does today)
            const heavyCount = plan.slices.filter(
                s => s.minutes > 90
            ).length;

            if (plan.slices.length > 6) {
                return {
                    name: 'Plan Size Limit',
                    passed: false,
                    message: `Too many slices: ${plan.slices.length} (max 6)`,
                    duration: Date.now() - start
                };
            }

            if (heavyCount > 1) {
                return {
                    name: 'Plan Size Limit',
                    passed: false,
                    message: `Too many heavy workunits: ${heavyCount} (max 1)`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Plan Size Limit',
                passed: true,
                message: `${plan.slices.length} slices, ${heavyCount} heavy (manageable)`,
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
            // Set up test data with varied work unit sizes
            const testData = await setupTestData();
            cleanup = testData.cleanup;

            const plan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240
            });

            const represented = new Set(plan.slices.map(s => s.goal?.id).filter(Boolean));

            // Clean up test data before returning
            await cleanup();
            cleanup = null;

            if (represented.size < 2 && plan.slices.length > 1) {
                return {
                    name: 'Multi-Goal Balance',
                    passed: false,
                    message: `Only ${represented.size} goals represented (expected ≥2)`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Multi-Goal Balance',
                passed: true,
                message: `${represented.size}/3 goals represented`,
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

    async function testGentleProgression(): Promise<TestResult> {
        const start = Date.now();
        try {
            const plan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240
            });

            if (plan.slices.length === 0) {
                return {
                    name: 'Gentle Progression',
                    passed: true,
                    message: 'Skipped: No slices',
                    duration: Date.now() - start
                };
            }

            // Check first slice minutes (what user actually does, not total remaining)
            const firstSliceMinutes = plan.slices[0].minutes;

            if (firstSliceMinutes > 60) {
                return {
                    name: 'Gentle Progression',
                    passed: false,
                    message: `First slice too heavy: ${firstSliceMinutes}min (max 60)`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Gentle Progression',
                passed: true,
                message: `First slice: ${firstSliceMinutes}min (gentle start)`,
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Gentle Progression',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    async function testEmptyState(): Promise<TestResult> {
        const start = Date.now();
        try {
            const plan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240
            });

            // Should always return a valid plan object
            if (!plan) {
                return {
                    name: 'Empty State Handling',
                    passed: false,
                    message: 'Plan is null/undefined',
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Empty State Handling',
                passed: true,
                message: plan.slices.length === 0
                    ? `Empty plan with message: "${plan.metadata?.message || 'OK'}"`
                    : `Has ${plan.slices.length} slices`,
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Empty State Handling',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    async function testGentleLanguage(): Promise<TestResult> {
        const start = Date.now();
        try {
            const plan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240
            });

            if (plan.slices.length === 0) {
                return {
                    name: 'Gentle Language',
                    passed: true,
                    message: 'Skipped: No slices to check',
                    duration: Date.now() - start
                };
            }

            const harshWords = ['deadline', 'urgent', 'overdue', 'failed', 'critical'];
            const issues: string[] = [];

            for (const slice of plan.slices) {
                const title = slice.workUnit.title.toLowerCase();
                for (const word of harshWords) {
                    if (title.includes(word)) {
                        issues.push(`"${word}" in "${slice.workUnit.title}"`);
                    }
                }
            }

            if (issues.length > 0) {
                return {
                    name: 'Gentle Language',
                    passed: false,
                    message: `Found harsh words: ${issues.join(', ')}`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Gentle Language',
                passed: true,
                message: `Checked ${plan.slices.length} work units - all gentle`,
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

    async function testCapacityAdjustments(): Promise<TestResult> {
        const start = Date.now();
        try {
            const lowEnergyPlan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240,
                energyLevel: 1
            });

            const normalPlan = await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240,
                energyLevel: 3
            });

            if (lowEnergyPlan.totalMinutes > normalPlan.totalMinutes && normalPlan.totalMinutes > 0) {
                return {
                    name: 'Capacity Adjustments',
                    passed: false,
                    message: `Low energy (${lowEnergyPlan.totalMinutes}min) > Normal (${normalPlan.totalMinutes}min)`,
                    duration: Date.now() - start
                };
            }

            return {
                name: 'Capacity Adjustments',
                passed: true,
                message: `Low: ${lowEnergyPlan.totalMinutes}min, Normal: ${normalPlan.totalMinutes}min`,
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Capacity Adjustments',
                passed: false,
                message: `Error: ${error}`,
                duration: Date.now() - start
            };
        }
    }

    async function testNoThrow(): Promise<TestResult> {
        const start = Date.now();
        try {
            // Should never throw
            await generateDailyPlan({
                date: getLocalDateString(),
                userCapacity: 240
            });

            return {
                name: 'Silent Failure',
                passed: true,
                message: 'No exceptions thrown',
                duration: Date.now() - start
            };
        } catch (error) {
            return {
                name: 'Silent Failure',
                passed: false,
                message: `Threw exception: ${error}`,
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
            { name: 'Plan Size Limit', fn: testSimplePlanSize },
            { name: 'Multi-Goal Balance', fn: testMultiGoalBalance },
            { name: 'Gentle Progression', fn: testGentleProgression },
            { name: 'Empty State Handling', fn: testEmptyState },
            { name: 'Gentle Language', fn: testGentleLanguage },
            { name: 'Capacity Adjustments', fn: testCapacityAdjustments },
            { name: 'Silent Failure', fn: testNoThrow },
        ];

        for (const test of tests) {
            setCurrentTest(test.name);
            const result = await test.fn();
            addResult(result);
            // Small delay for visual feedback
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
                <p className="text-sm text-muted mt-1">Calm UX Validation</p>
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
