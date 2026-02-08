export interface FeatureFlags {
    smartPlanning: boolean;
    contextGathering: boolean;
    priorityCalculation: boolean;
    multiGoalBalancing: boolean;
    relevanceValidation: boolean;
    agentOrchestration: boolean; // New multi-agent goal creation (clarifier → decomposer → validator)
}

export const defaultFeatureFlags: FeatureFlags = {
    smartPlanning: true,
    contextGathering: true,
    priorityCalculation: true,
    multiGoalBalancing: true,
    relevanceValidation: true,
    agentOrchestration: false, // Opt-in: use new multi-agent workflow
};

export function getFeatures(): FeatureFlags {
    if (typeof window === 'undefined') return defaultFeatureFlags;

    const saved = localStorage.getItem('smallsteps-features');
    return saved ? { ...defaultFeatureFlags, ...JSON.parse(saved) } : defaultFeatureFlags;
}

export function setFeature(key: keyof FeatureFlags, value: boolean) {
    if (typeof window === 'undefined') return;

    const flags = getFeatures();
    flags[key] = value;
    localStorage.setItem('smallsteps-features', JSON.stringify(flags));

    // Dispatch event for reactive updates in UI
    window.dispatchEvent(new Event('feature-flags-changed'));
}
