// SmallSteps AI Manager
// Manages provider selection and API key storage

import type { AIProvider } from './ai-provider';
import { manualProvider } from './ai-provider';
import { ClaudeAdapter } from './claude-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { OpenAIAdapter } from './openai-adapter';

export type ProviderName = 'claude' | 'gemini' | 'openai' | 'manual';

// In-memory API key storage (session only by default)
const apiKeys: Record<string, string> = {};

// Storage key for encrypted API keys
const STORAGE_KEY = 'smallsteps-api-keys';
const STORAGE_CONSENT_KEY = 'smallsteps-persist-consent';

/**
 * Simple XOR-based obfuscation (NOT cryptographic encryption)
 * Just prevents casual viewing in localStorage inspector
 */
function obfuscate(text: string): string {
    const key = 'SmallSteps2025'; // Simple obfuscation key
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 encode
}

function deobfuscate(encoded: string): string {
    try {
        const text = atob(encoded); // Base64 decode
        const key = 'SmallSteps2025';
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    } catch {
        return '';
    }
}

/**
 * Check if user has consented to persistent storage
 */
export function hasStorageConsent(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_CONSENT_KEY) === 'true';
}

/**
 * Set storage consent preference
 */
export function setStorageConsent(consent: boolean): void {
    if (typeof window === 'undefined') return;
    if (consent) {
        localStorage.setItem(STORAGE_CONSENT_KEY, 'true');
    } else {
        localStorage.removeItem(STORAGE_CONSENT_KEY);
        clearPersistedKeys();
    }
}

/**
 * Load API keys from localStorage if consent given
 */
export function loadPersistedKeys(): void {
    if (!hasStorageConsent()) return;
    if (typeof window === 'undefined') return;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const decrypted = deobfuscate(stored);
            const keys = JSON.parse(decrypted) as Record<string, string>;
            Object.assign(apiKeys, keys);
        }
    } catch (error) {
        console.error('Failed to load persisted API keys:', error);
    }
}

/**
 * Save API keys to localStorage if consent given
 */
function persistKeys(): void {
    if (!hasStorageConsent()) return;
    if (typeof window === 'undefined') return;

    try {
        const encrypted = obfuscate(JSON.stringify(apiKeys));
        localStorage.setItem(STORAGE_KEY, encrypted);
    } catch (error) {
        console.error('Failed to persist API keys:', error);
    }
}

/**
 * Clear persisted API keys from localStorage
 */
export function clearPersistedKeys(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Store an API key in memory (and optionally persist if consent given)
 */
export function setApiKey(provider: ProviderName, key: string): void {
    if (provider !== 'manual') {
        apiKeys[provider] = key;
        persistKeys(); // Persist if consent given
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
 * Clear an API key from memory (and persisted storage)
 */
export function clearApiKey(provider: ProviderName): void {
    delete apiKeys[provider];
    persistKeys(); // Update persisted storage
}

/**
 * Clear all API keys from memory (and persisted storage)
 */
export function clearAllApiKeys(): void {
    Object.keys(apiKeys).forEach((key) => delete apiKeys[key]);
    clearPersistedKeys();
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
