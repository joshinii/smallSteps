import { model } from '../gemini';

export interface FollowUpSuggestion {
    message: string;
    suggestedStepId?: string;
}

/**
 * Follow-through Agent
 * 
 * Purpose: Gentle reminders and prioritization
 * Principles: Soft nudges, respect autonomy, no hard deadlines
 */
export async function generateFollowUp(
    incompleteSteps: Array<{
        id: string;
        content: string;
        priority: string;
        targetDate?: Date | null;
        ideaContent: string;
    }>
): Promise<FollowUpSuggestion> {
    if (incompleteSteps.length === 0) {
        return {
            message: "You're all caught up! 🌟 Ready to add a new idea?",
        };
    }

    // Sort by priority and target date
    const sorted = incompleteSteps.sort((a, b) => {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;

        if (aPriority !== bPriority) return aPriority - bPriority;

        // If same priority, sort by target date
        if (a.targetDate && b.targetDate) {
            return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
        }
        if (a.targetDate) return -1;
        if (b.targetDate) return 1;

        return 0;
    });

    const topStep = sorted[0];
    const targetDateInfo = topStep.targetDate
        ? `\nTarget date: ${new Date(topStep.targetDate).toLocaleDateString()}`
        : '';

    const prompt = `You are a gentle, supportive assistant helping someone follow through on their goals.

They have this incomplete step:
"${topStep.content}"

Related to: "${topStep.ideaContent}"
Priority: ${topStep.priority}${targetDateInfo}

Create a warm, encouraging reminder message (1-2 sentences) that:
- Feels supportive, not pressuring
- Acknowledges their autonomy
- Gently suggests they could work on this
- Uses casual, friendly language
- Avoids guilt or obligation

Examples:
"Ready to tackle that closet? Just 10 minutes could make a difference ✨"
"When you have a moment, that guitar tutorial is waiting for you 🎸"
"No pressure, but fixing that faucet might feel good to check off 💧"

Return ONLY the message, nothing else.`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text().trim();

        return {
            message: text,
            suggestedStepId: topStep.id,
        };
    } catch (error) {
        console.error('Error generating follow-up:', error);
        return {
            message: `Ready to continue with: ${topStep.content}?`,
            suggestedStepId: topStep.id,
        };
    }
}
