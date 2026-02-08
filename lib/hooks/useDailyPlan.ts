// SmallSteps Daily Plan Hook
// Invisible, automatic plan management - zero user friction
// Philosophy: User opens app → work is there. That's all.

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateDailyPlan as generateAgentPlan } from '@/lib/agents/planner';
import {
    generateDailyPlan as generateLegacyPlan,
    completeSlice,
    skipSlice,
    addMoreSlices,
} from '@/lib/planning-engine';
import type { Slice } from '@/lib/schema';
import { getLocalDateString } from '@/lib/utils';
import { getFeatures } from '@/lib/config/features';

// ============================================
// Types
// ============================================

interface DailyPlanState {
    slices: Slice[];
    ready: boolean;
    date: string;
}

interface UseDailyPlanReturn {
    slices: Slice[];
    ready: boolean;
    completeWork: (slice: Slice) => Promise<void>;
    skipWork: (slice: Slice) => Promise<void>;
    getOneMoreThing: () => Promise<Slice | null>;
}

// Cache key for localStorage
const PLAN_CACHE_KEY = 'smallsteps-daily-plan-cache';
const LAST_DATE_KEY = 'smallsteps-last-plan-date';

// ============================================
// Cache Utilities
// ============================================

interface CachedPlan {
    date: string;
    slices: Slice[];
    timestamp: number;
}

function getCachedPlan(date: string): CachedPlan | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(PLAN_CACHE_KEY);
        if (!cached) return null;

        const parsed = JSON.parse(cached) as CachedPlan;

        // Only use cache if same date and less than 1 hour old
        const isValidDate = parsed.date === date;
        const isRecent = Date.now() - parsed.timestamp < 60 * 60 * 1000;

        if (isValidDate && isRecent) {
            return parsed;
        }

        return null;
    } catch {
        return null;
    }
}

function cachePlan(date: string, slices: Slice[]): void {
    if (typeof window === 'undefined') return;

    try {
        const cache: CachedPlan = {
            date,
            slices,
            timestamp: Date.now(),
        };
        localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(cache));
        localStorage.setItem(LAST_DATE_KEY, date);
    } catch {
        // Silent fail
    }
}

function getLastPlanDate(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LAST_DATE_KEY);
}

function clearCache(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(PLAN_CACHE_KEY);
}

// ============================================
// Main Hook
// ============================================

export function useDailyPlan(): UseDailyPlanReturn {
    const [state, setState] = useState<DailyPlanState>({
        slices: [],
        ready: false,
        date: getLocalDateString(),
    });

    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const dateCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Silent plan loading - no spinners, no indicators
    const loadPlanSilently = useCallback(async () => {
        const today = getLocalDateString();

        try {
            // Check cache first (instant)
            const cached = getCachedPlan(today);
            if (cached) {
                setState({
                    slices: cached.slices,
                    ready: true,
                    date: today,
                });

                // Still regenerate in background for freshness
                regenerateInBackground(today);
                return;
            }

            // Generate plan
            const slices = await generatePlan(today);
            cachePlan(today, slices);

            setState({
                slices,
                ready: true,
                date: today,
            });

        } catch (error) {
            // Silent fallback - user never knows
            console.error('[DailyPlan] Generation failed:', error);

            // Try last cached plan as fallback
            const cached = getCachedPlan(today);
            if (cached) {
                setState({
                    slices: cached.slices,
                    ready: true,
                    date: today,
                });
            } else {
                // Empty state - still ready, just no slices
                setState({
                    slices: [],
                    ready: true,
                    date: today,
                });
            }
        }
    }, []);

    // Generate plan using agent or legacy
    async function generatePlan(date: string): Promise<Slice[]> {
        const features = getFeatures();

        if (features.agentOrchestration) {
            try {
                const plan = await generateAgentPlan({
                    date,
                    userCapacity: 240,
                });
                console.log('[DailyPlan] Agent generated', plan.slices.length, 'slices');
                return plan.slices;
            } catch (agentError) {
                console.log('[DailyPlan] Agent unavailable, using legacy');
                // Fall through to legacy
            }
        }

        // Legacy fallback
        const result = await generateLegacyPlan(date);
        return result.plan.slices;
    }

    // Background regeneration (no loading state change)
    async function regenerateInBackground(date: string) {
        try {
            const slices = await generatePlan(date);
            cachePlan(date, slices);

            setState(prev => ({
                ...prev,
                slices,
            }));
        } catch {
            // Silent - we already have cached data showing
        }
    }

    // Quiet update after work completion (debounced)
    const updatePlanQuietly = useCallback(async () => {
        // Cancel pending updates
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }

        // Wait 2 seconds before updating (batch completions)
        updateTimeoutRef.current = setTimeout(async () => {
            const today = getLocalDateString();
            try {
                const slices = await generatePlan(today);
                cachePlan(today, slices);

                setState(prev => ({
                    ...prev,
                    slices,
                }));
            } catch {
                // Silent - keep current state
            }
        }, 2000);
    }, []);

    // Complete work item
    const completeWork = useCallback(async (slice: Slice) => {
        // Optimistic update
        setState(prev => ({
            ...prev,
            slices: prev.slices.filter(s => s.workUnitId !== slice.workUnitId),
        }));

        // Persist
        await completeSlice(slice);

        // Update plan quietly after delay
        updatePlanQuietly();
    }, [updatePlanQuietly]);

    // Skip work item
    const skipWork = useCallback(async (slice: Slice) => {
        // Optimistic update
        setState(prev => ({
            ...prev,
            slices: prev.slices.filter(s => s.workUnitId !== slice.workUnitId),
        }));

        // Persist
        await skipSlice(slice);

        // Update plan quietly
        updatePlanQuietly();
    }, [updatePlanQuietly]);

    // Initial load
    useEffect(() => {
        loadPlanSilently();

        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [loadPlanSilently]);

    // Date transition detection (check every 60 seconds)
    useEffect(() => {
        dateCheckIntervalRef.current = setInterval(() => {
            const today = getLocalDateString();
            const lastDate = getLastPlanDate();

            if (lastDate && today !== lastDate) {
                console.log('[DailyPlan] Date changed, regenerating');
                clearCache();
                loadPlanSilently();
            }
        }, 60000);

        return () => {
            if (dateCheckIntervalRef.current) {
                clearInterval(dateCheckIntervalRef.current);
            }
        };
    }, [loadPlanSilently]);

    // Get one more work unit (for "one more thing" feature)
    // Prefers: light effort, different goal than recently worked
    const getOneMoreThing = useCallback(async (): Promise<Slice | null> => {
        try {
            const today = getLocalDateString();

            // Get recently worked goal IDs to exclude
            const recentGoalIds = state.slices
                .slice(0, 3)
                .map(s => s.goal?.id)
                .filter(Boolean) as string[];

            // Try to add one more slice using legacy engine
            // (It handles goal exclusion and prefers light work)
            const currentPlan = {
                date: today,
                slices: state.slices,
                totalMinutes: state.slices.reduce((sum, s) => sum + s.minutes, 0),
                capacityMinutes: 240,
                mode: 'light' as const,
            };

            const updatedPlan = await addMoreSlices(today, currentPlan, 30);

            // Find the new slice (not in current list)
            const currentIds = new Set(state.slices.map(s => s.workUnitId));
            const newSlice = updatedPlan.slices.find(s => !currentIds.has(s.workUnitId));

            if (newSlice) {
                // Add to state smoothly
                setState(prev => ({
                    ...prev,
                    slices: [...prev.slices, newSlice],
                }));

                // Update cache
                cachePlan(today, [...state.slices, newSlice]);

                return newSlice;
            }

            return null; // No more work available
        } catch {
            return null; // Silent fail
        }
    }, [state.slices]);

    return {
        slices: state.slices,
        ready: state.ready,
        completeWork,
        skipWork,
        getOneMoreThing,
    };
}

// ============================================
// Prefetch Hook (Optional - for tomorrow's plan)
// ============================================

export function usePrefetchTomorrow(): void {
    useEffect(() => {
        // Wait 30 seconds after page load, then prefetch tomorrow
        const timeout = setTimeout(async () => {
            try {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];

                // Check if already cached
                const cached = getCachedPlan(tomorrowStr);
                if (cached) return;

                // Generate and cache
                const features = getFeatures();
                if (features.agentOrchestration) {
                    const plan = await generateAgentPlan({
                        date: tomorrowStr,
                        userCapacity: 240,
                    });
                    cachePlan(tomorrowStr, plan.slices);
                    console.log('[DailyPlan] Prefetched tomorrow');
                }
            } catch {
                // Silent - prefetch is optional
            }
        }, 30000);

        return () => clearTimeout(timeout);
    }, []);
}
