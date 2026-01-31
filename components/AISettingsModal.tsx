'use client';

// SmallSteps AI Settings Modal
// Calm, non-intrusive UI for configuring AI providers

import React, { useState } from 'react';
import { useAI } from '@/lib/ai/AIContext';
import { ProviderName, PROVIDER_INFO, hasApiKey, hasStorageConsent, setStorageConsent, validateProviderKey, isLocalProvider } from '@/lib/ai';

export default function AISettingsModal() {
    const { showSetupModal, closeSetupModal, configureProvider, removeKey, provider: currentProvider } = useAI();
    const [selectedProvider, setSelectedProvider] = useState<ProviderName>(
        currentProvider === 'manual' ? 'claude' : currentProvider
    );
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [rememberKey, setRememberKey] = useState(hasStorageConsent());

    if (!showSetupModal) return null;

    const providerInfo = PROVIDER_INFO[selectedProvider];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Local providers (manual, lmstudio) don't need API keys
        const needsApiKey = !isLocalProvider(selectedProvider);

        if (needsApiKey && !apiKey.trim()) {
            setError('Please enter an API key');
            return;
        }

        setIsValidating(true);
        setError('');

        try {
            // Verify key if not manual or lmstudio
            if (needsApiKey) {
                const isValid = await validateProviderKey(selectedProvider, apiKey.trim());
                if (!isValid) {
                    setError(`Invalid API key for ${PROVIDER_INFO[selectedProvider].displayName}. Please check and try again.`);
                    setIsValidating(false);
                    return;
                }
            } else if (selectedProvider === 'lmstudio') {
                // For LM Studio, just validate connection
                const isValid = await validateProviderKey(selectedProvider, '');
                if (!isValid) {
                    setError('Cannot connect to LM Studio. Make sure the server is running on localhost:1234.');
                    setIsValidating(false);
                    return;
                }
            }

            // Set storage consent before configuring
            setStorageConsent(rememberKey);
            configureProvider(selectedProvider, apiKey.trim());
            setApiKey('');
            setError('');
        } catch (err) {
            setError('Validation failed due to network error.');
        } finally {
            setIsValidating(false);
        }
    };

    const handleSkip = () => {
        configureProvider('manual', '');
        setApiKey('');
        setError('');
    };

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-8 animate-slideUp">
                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-2xl font-light text-foreground mb-2">AI Assistant</h2>
                    <p className="text-muted text-sm">
                        Connect an AI to help break down goals and suggest tasks.
                        Your API key stays on your device only.
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Provider Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-muted mb-2">
                            Choose a provider
                        </label>
                        <div className="space-y-2">
                            {(['lmstudio', 'claude', 'gemini', 'openai'] as ProviderName[]).map((name) => (
                                <label
                                    key={name}
                                    className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedProvider === name
                                        ? 'border-accent bg-accent/5'
                                        : 'border-gray-100 hover:border-gray-200'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="provider"
                                        value={name}
                                        checked={selectedProvider === name}
                                        onChange={() => {
                                            setSelectedProvider(name);
                                            setError('');
                                        }}
                                        className="sr-only"
                                    />
                                    <span className="font-medium text-foreground">
                                        {PROVIDER_INFO[name].displayName}
                                    </span>
                                    {hasApiKey(name) && selectedProvider !== name && (
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                                Active
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    if (confirm(`Remove API key for ${PROVIDER_INFO[name].displayName}?`)) {
                                                        removeKey(name);
                                                    }
                                                }}
                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="Remove API Key"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* API Key Input - Hidden for LM Studio (local) */}
                    {selectedProvider !== 'lmstudio' && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-muted mb-2">
                                API Key
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    setError('');
                                }}
                                placeholder={providerInfo.placeholder}
                                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-accent focus:outline-none transition-colors"
                            />
                            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                            <a
                                href={providerInfo.keyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block mt-2 text-sm text-accent hover:underline"
                            >
                                Get a {PROVIDER_INFO[selectedProvider].displayName} key →
                            </a>
                        </div>
                    )}

                    {/* LM Studio info */}
                    {selectedProvider === 'lmstudio' && (
                        <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-100">
                            <p className="text-sm text-green-800">
                                <strong>Local AI</strong> — No API key needed. Make sure LM Studio server is running on localhost:1234.
                            </p>
                            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                        </div>
                    )}

                    {/* Remember Key Checkbox */}
                    <div className="mb-6">
                        <label className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                            <input
                                type="checkbox"
                                checked={rememberKey}
                                onChange={(e) => setRememberKey(e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-foreground focus:ring-offset-0 focus:ring-1 focus:ring-gray-400"
                            />
                            <div className="flex-1">
                                <span className="block text-sm font-medium text-foreground">Remember API key</span>
                                <span className="block text-xs text-muted mt-0.5">
                                    Saves key securely on this device. You won't need to re-enter it.
                                </span>
                            </div>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={isValidating}
                            className="flex-1 px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isValidating ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Connect'
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleSkip}
                            className="px-6 py-3 text-muted hover:text-foreground rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-colors"
                        >
                            Skip
                        </button>
                    </div>
                </form>

                {/* Footer note */}
                <p className="mt-6 text-xs text-muted text-center">
                    You can always change this later in Settings.
                    The app works without AI too—just with less magic.
                </p>
            </div>
        </div>
    );
}
