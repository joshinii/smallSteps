// SmallSteps NLP Parser
// Uses compromise for natural language processing of goal text
// Extracts dates, detects goal types, and provides context hints

import nlp from 'compromise';

// ============================================
// Date Extraction
// ============================================

/**
 * Extract a deadline/target date from goal text
 * Examples:
 * - "Learn Python by March" -> March 2027
 * - "Get fit before summer" -> June 2027
 * - "Read 12 books this year" -> Dec 2026
 */
export function extractDeadline(goalText: string): Date | null {
    const doc = nlp(goalText);

    // Find dates in the text
    const dates = (doc as any).dates().json();

    if (dates.length === 0) return null;

    try {
        // Get the first date found
        const dateText = dates[0].text;
        const parsed = new Date(dateText);

        // If parsed date is in the past, assume next year
        const now = new Date();
        if (parsed < now && parsed.getFullYear() === now.getFullYear()) {
            parsed.setFullYear(now.getFullYear() + 1);
        }

        return parsed;
    } catch (error) {
        console.warn('[NLPParser] Could not parse date:', error);
        return null;
    }
}

/**
 * Detect seasonal references and convert to approximate dates
 */
export function detectSeasonalDeadline(goalText: string): Date | null {
    const text = goalText.toLowerCase();
    const now = new Date();
    const year = now.getFullYear();

    // Seasonal mappings (approximate)
    const seasons: Record<string, string> = {
        'spring': `${year}-03-20`,
        'summer': `${year}-06-21`,
        'fall': `${year}-09-22`,
        'autumn': `${year}-09-22`,
        'winter': `${year + 1}-12-21`,
    };

    for (const [season, date] of Object.entries(seasons)) {
        if (text.includes(season)) {
            const seasonDate = new Date(date);
            // If season has passed this year, use next year
            if (seasonDate < now) {
                seasonDate.setFullYear(year + 1);
            }
            return seasonDate;
        }
    }

    return null;
}

// ============================================
// Goal Type Detection
// ============================================

/**
 * Detect if a goal is learning-focused
 * Helps determine appropriate task structure
 */
export function detectLearningGoal(goalText: string): boolean {
    const text = goalText.toLowerCase();

    const learningKeywords = [
        'learn', 'study', 'understand', 'master',
        'course', 'tutorial', 'practice', 'train',
        'improve', 'get better at', 'skill'
    ];

    return learningKeywords.some(keyword => text.includes(keyword));
}

/**
 * Detect if a goal is building/creation-focused
 */
export function detectBuildingGoal(goalText: string): boolean {
    const text = goalText.toLowerCase();

    const buildingKeywords = [
        'build', 'create', 'make', 'develop',
        'design', 'write', 'craft', 'produce'
    ];

    return buildingKeywords.some(keyword => text.includes(keyword));
}

/**
 * Detect if a goal involves a quantifiable target
 * e.g., "Read 12 books", "Run 5k", "Save $1000"
 */
export function extractQuantifiableTarget(goalText: string): { value: number; unit: string } | null {
    const doc = nlp(goalText);

    // Find numbers and their context
    const numbers = doc.numbers().json();

    if (numbers.length === 0) return null;

    try {
        const num = numbers[0];
        const value = parseInt(num.number) || parseFloat(num.number);

        // Detect common units
        const text = goalText.toLowerCase();
        const units = ['books', 'pages', 'hours', 'minutes', 'miles', 'km', 'pounds', 'kg', 'projects'];

        for (const unit of units) {
            if (text.includes(unit)) {
                return { value, unit };
            }
        }

        return { value, unit: 'items' };
    } catch (error) {
        return null;
    }
}

// ============================================
// Time Commitment Hints
// ============================================

/**
 * Infer time commitment from goal text
 * Used for planning context
 */
export function inferTimeCommitment(goalText: string): string | null {
    const doc = nlp(goalText);
    const text = goalText.toLowerCase();

    // Look for explicit time mentions
    const timePatterns = [
        { pattern: /(\d+)\s*(hours?|hrs?)\s*(per\s*)?(week|weekly)/i, type: 'weekly' },
        { pattern: /daily|every\s*day|per\s*day/i, type: 'daily' },
        { pattern: /weekend/i, type: 'weekends' },
    ];

    for (const { pattern, type } of timePatterns) {
        if (pattern.test(text)) {
            return type;
        }
    }

    // Infer from urgency words
    if (text.includes('quick') || text.includes('fast')) {
        return 'intensive';
    }

    if (text.includes('leisurely') || text.includes('casual')) {
        return 'relaxed';
    }

    return null;
}

// ============================================
// Priority Detection
// ============================================

/**
 * Detect priority level from goal text
 */
export function detectPriority(goalText: string): 'high' | 'medium' | 'low' | null {
    const text = goalText.toLowerCase();

    const highPriority = ['urgent', 'critical', 'asap', 'must', 'need to'];
    const lowPriority = ['someday', 'eventually', 'maybe', 'would like'];

    if (highPriority.some(word => text.includes(word))) {
        return 'high';
    }

    if (lowPriority.some(word => text.includes(word))) {
        return 'low';
    }

    return 'medium';
}
