import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';

// Lazy initialization to allow build to succeed without API key
let _anthropic: Anthropic | null = null;

function getClient(): Anthropic {
    if (!_anthropic) {
        if (!process.env.CLAUDE_API_KEY) {
            throw new Error('CLAUDE_API_KEY is not set in environment variables');
        }
        _anthropic = new Anthropic({
            apiKey: process.env.CLAUDE_API_KEY,
        });
    }
    return _anthropic;
}

export const anthropic = {
    messages: {
        create: async (params: MessageCreateParamsNonStreaming): Promise<Message> => {
            return getClient().messages.create(params) as Promise<Message>;
        }
    }
};

// Default model and settings for task generation
// Valid models: claude-sonnet-4-5-20250929, claude-3-opus-20240229, claude-3-haiku-20240307
export const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TEMPERATURE = 0.7;
