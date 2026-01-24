import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../claude';

/**
 * Clarifier Agent
 * 
 * Purpose: Transforms vague ideas into clear, actionable intents
 * Output: 1-2 sentence clarified version
 * Principles: Casual tone, removes overwhelm, focuses on user's true intent
 */
export async function clarifyIdea(rawIdea: string): Promise<string> {
    console.log('🤖 CLARIFIER: Starting for idea:', rawIdea);

    const prompt = `You are a supportive assistant helping someone clarify a vague idea into a clear, actionable goal.

Original idea: "${rawIdea}"

Transform this into a clear, casual 1-2 sentence goal that:
- States what they want to achieve
- Is specific and actionable
- Uses friendly, non-technical language
- Removes overwhelm and focuses on the core intent

Examples:
- "clean my room" → "Sort through your room and organize items so it feels tidy and calm"
- "get fit" → "Build a sustainable exercise routine to feel stronger and healthier"
- "learn coding" → "Learn the basics of programming through daily practice and small projects"

Return ONLY the clarified goal, nothing else.`;

    try {
        console.log('🤖 CLARIFIER: Calling Claude API...');

        const message = await anthropic.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: DEFAULT_TEMPERATURE,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const clarified = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
        console.log('✅ CLARIFIER: Got response:', clarified);

        return clarified || rawIdea;
    } catch (error) {
        console.error('❌ CLARIFIER ERROR:', error);
        console.error('Error type:', error instanceof Error ? error.name : typeof error);
        console.error('Error message:', error instanceof Error ? error.message : error);

        // Fallback: return original idea
        console.warn('⚠️ CLARIFIER: Using original idea due to error');
        return rawIdea;
    }
}
