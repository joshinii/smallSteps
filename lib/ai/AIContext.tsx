'use client';

// SmallSteps AI Context
// React context for managing AI provider state across the app

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { ProviderName, setApiKey, hasApiKey, clearApiKey, getProvider, PROVIDER_INFO, loadPersistedKeys, CLOUD_PROVIDERS, isLocalProvider } from '@/lib/ai';
import type { AIProvider } from '@/lib/ai/ai-provider';
import { manualProvider } from '@/lib/ai/ai-provider';

interface AIContextType {
    provider: ProviderName;
    setProvider: (name: ProviderName) => void;
    isConfigured: boolean;
    configureProvider: (name: ProviderName, apiKey: string) => void;
    clearConfiguration: () => void;
    getAI: () => AIProvider;
    showSetupModal: boolean;
    openSetupModal: () => void;
    closeSetupModal: () => void;
    removeKey: (name: ProviderName) => void;
}

const AIContext = createContext<AIContextType | null>(null);

export function AIContextProvider({ children }: { children: ReactNode }) {
    const [provider, setProviderState] = useState<ProviderName>('manual');
    const [isConfigured, setIsConfigured] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);

    // Load persisted API keys on mount
    useEffect(() => {
        loadPersistedKeys();
        // Check if any provider has a key after loading (lmstudio stores 'local' marker)
        const providers: ProviderName[] = ['lmstudio', 'claude', 'gemini', 'openai'];
        for (const p of providers) {
            if (hasApiKey(p)) {
                setProviderState(p);
                setIsConfigured(true);
                break;
            }
        }
    }, []);

    const setProvider = useCallback((name: ProviderName) => {
        setProviderState(name);
        setIsConfigured(hasApiKey(name));
    }, []);

    const configureProvider = useCallback((name: ProviderName, apiKey: string) => {
        setApiKey(name, apiKey);
        setProviderState(name);
        setIsConfigured(true);
        setShowSetupModal(false);
    }, []);

    const clearConfiguration = useCallback(() => {
        clearApiKey(provider);
        setIsConfigured(false);
    }, [provider]);

    const getAI = useCallback((): AIProvider => {
        return getProvider(provider);
    }, [provider]);

    const openSetupModal = useCallback(() => setShowSetupModal(true), []);
    const closeSetupModal = useCallback(() => setShowSetupModal(false), []);

    return (
        <AIContext.Provider
            value={{
                provider,
                setProvider,
                isConfigured,
                configureProvider,
                clearConfiguration,
                getAI,
                showSetupModal,
                openSetupModal,
                closeSetupModal,
                removeKey: (name: ProviderName) => {
                    clearApiKey(name);
                    // If removing current provider, fallback to manual or another
                    if (name === provider) {
                        const remaining = [...CLOUD_PROVIDERS, 'lmstudio' as ProviderName].filter(p => p !== name && hasApiKey(p));
                        if (remaining.length > 0) {
                            setProvider(remaining[0]);
                        } else {
                            setProvider('manual');
                        }
                    } else {
                        // Force re-render of configured state
                        setProvider(provider);
                    }
                },
            }}
        >
            {children}
        </AIContext.Provider>
    );
}

export function useAI() {
    const context = useContext(AIContext);
    if (!context) {
        throw new Error('useAI must be used within AIContextProvider');
    }
    return context;
}

// Hook to get AI provider with automatic modal trigger if not configured
export function useAIWithFallback() {
    const { provider, isConfigured, getAI, openSetupModal } = useAI();

    const getAIOrPrompt = useCallback((): { provider: AIProvider; needsSetup: boolean } => {
        if (provider === 'manual' || !isConfigured) {
            return { provider: manualProvider, needsSetup: true };
        }
        return { provider: getAI(), needsSetup: false };
    }, [provider, isConfigured, getAI]);

    const promptForAI = useCallback((): AIProvider | null => {
        if (provider === 'manual' || !isConfigured) {
            openSetupModal();
            return null;
        }
        return getAI();
    }, [provider, isConfigured, getAI, openSetupModal]);

    return { getAIOrPrompt, promptForAI };
}
