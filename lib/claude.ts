import Anthropic from '@anthropic-ai/sdk';

if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not set in environment variables');
}

export const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
});

// Default model and settings for task generation
// Valid models: claude-sonnet-4-5-20250929, claude-3-opus-20240229, claude-3-haiku-20240307
export const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TEMPERATURE = 0.7;
