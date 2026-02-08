// SmallSteps Template Engine
// Manages domain templates for structured goal decomposition

import programmingTemplate from '../templates/domains/programming.json';
import fitnessTemplate from '../templates/domains/fitness.json';
import learningTemplate from '../templates/domains/learning.json';
import creativeTemplate from '../templates/domains/creative.json';
import businessTemplate from '../templates/domains/business.json';

// ============================================
// Types
// ============================================

export interface DomainTemplate {
    domain: string;
    displayName: string;
    description: string;
    phases: string[];
    keywords: string[];
}

// ============================================
// Template Registry
// ============================================

const templates: Record<string, DomainTemplate> = {
    programming: programmingTemplate as DomainTemplate,
    fitness: fitnessTemplate as DomainTemplate,
    learning: learningTemplate as DomainTemplate,
    creative: creativeTemplate as DomainTemplate,
    business: businessTemplate as DomainTemplate,
};

// Default template for unclassified goals
const defaultTemplate: DomainTemplate = {
    domain: 'general',
    displayName: 'General',
    description: 'General goal with flexible structure',
    phases: [
        'Getting Started',
        'Building Momentum',
        'Deepening Practice',
        'Completion',
    ],
    keywords: [],
};

// ============================================
// Public API
// ============================================

/**
 * Get all available domain names
 */
export function getAllDomains(): string[] {
    return Object.keys(templates);
}

/**
 * Get a domain template by name
 * Returns default template if domain not found
 */
export function getDomainTemplate(domain: string): DomainTemplate {
    return templates[domain.toLowerCase()] || defaultTemplate;
}

/**
 * Classify a goal into a domain using keyword matching
 * This is a fast, local classification that doesn't require AI
 */
export function classifyDomainLocal(goalTitle: string): string {
    const normalizedGoal = goalTitle.toLowerCase();

    let bestMatch = { domain: 'general', score: 0 };

    for (const [domain, template] of Object.entries(templates)) {
        let score = 0;
        for (const keyword of template.keywords) {
            if (normalizedGoal.includes(keyword.toLowerCase())) {
                // Longer keywords get higher scores (more specific)
                score += keyword.length;
            }
        }
        if (score > bestMatch.score) {
            bestMatch = { domain, score };
        }
    }

    return bestMatch.domain;
}

/**
 * Get the current phase for a goal based on task completion
 * @param completedTasks Number of completed tasks
 * @param totalTasks Total number of tasks
 * @param domain The goal's domain
 */
export function getCurrentPhase(
    completedTasks: number,
    totalTasks: number,
    domain: string
): string {
    const template = getDomainTemplate(domain);
    const phases = template.phases;

    if (totalTasks === 0) return phases[0];

    const progress = completedTasks / totalTasks;
    const phaseIndex = Math.min(
        Math.floor(progress * phases.length),
        phases.length - 1
    );

    return phases[phaseIndex];
}

/**
 * Get the next phase after the current one
 */
export function getNextPhase(currentPhase: string, domain: string): string | null {
    const template = getDomainTemplate(domain);
    const currentIndex = template.phases.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex >= template.phases.length - 1) {
        return null;
    }

    return template.phases[currentIndex + 1];
}
