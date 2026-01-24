// SmallSteps AI Manager
// Manages provider selection and API key storage

import type { AIProvider } from './ai-provider';
import { manualProvider } from './ai-provider';
import { ClaudeAdapter } from './claude-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { OpenAIAdapter } from './openai-adapter';

export type ProviderName = 'claude' | 'gemini' | 'openai' | 'manual';

// In-memory API key storage (never persisted)
const apiKeys: Record<string, string> = {};

/**
 * Store an API key in memory (session only)
 */
export function setApiKey(provider: ProviderName, key: string): void {
    if (provider !== 'manual') {
        apiKeys[provider] = key;
    }
}

/**
 * Check if an API key is available for a provider
 */
export function hasApiKey(provider: ProviderName): boolean {
    if (provider === 'manual') return true;
    return !!apiKeys[provider];
}

/**
 * Clear an API key from memory
 */
export function clearApiKey(provider: ProviderName): void {
    delete apiKeys[provider];
}

/**
 * Clear all API keys from memory
 */
export function clearAllApiKeys(): void {
    Object.keys(apiKeys).forEach((key) => delete apiKeys[key]);
}

/**
 * Get a provider instance for the given provider name
 * Returns manual provider if no API key is set
 */
export function getProvider(providerName: ProviderName): AIProvider {
    if (providerName === 'manual') {
        return manualProvider;
    }

    const key = apiKeys[providerName];
    if (!key) {
        console.warn(`No API key for ${providerName}, falling back to manual provider`);
        return manualProvider;
    }

    switch (providerName) {
        case 'claude':
            return new ClaudeAdapter(key);
        case 'gemini':
            return new GeminiAdapter(key);
        case 'openai':
            return new OpenAIAdapter(key);
        default:
            return manualProvider;
    }
}

/**
 * Provider metadata for UI
 */
export const PROVIDER_INFO: Record<ProviderName, { displayName: string; keyUrl: string; placeholder: string }> = {
    claude: {
        displayName: 'Claude (Anthropic)',
        keyUrl: 'https://console.anthropic.com/settings/keys',
        placeholder: 'sk-ant-...',
    },
    gemini: {
        displayName: 'Gemini (Google)',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        placeholder: 'AIza...',
    },
    openai: {
        displayName: 'GPT-4 (OpenAI)',
        keyUrl: 'https://platform.openai.com/api-keys',
        placeholder: 'sk-...',
    },
    manual: {
        displayName: 'Continue Manually',
        keyUrl: '',
        placeholder: '',
    },
};
