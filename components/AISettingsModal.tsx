'use client';

// SmallSteps AI Settings Modal
// Calm, non-intrusive UI for configuring AI providers

import React, { useState } from 'react';
import { useAI } from '@/lib/ai/AIContext';
import { ProviderName, PROVIDER_INFO, hasApiKey } from '@/lib/ai';

export default function AISettingsModal() {
    const { showSetupModal, closeSetupModal, configureProvider, provider: currentProvider } = useAI();
    const [selectedProvider, setSelectedProvider] = useState<ProviderName>(
        currentProvider === 'manual' ? 'claude' : currentProvider
    );
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');

    if (!showSetupModal) return null;

    const providerInfo = PROVIDER_INFO[selectedProvider];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedProvider !== 'manual' && !apiKey.trim()) {
            setError('Please enter an API key');
            return;
        }
        configureProvider(selectedProvider, apiKey.trim());
        setApiKey('');
        setError('');
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
                            {(['claude', 'gemini', 'openai'] as ProviderName[]).map((name) => (
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
                                    {hasApiKey(name) && (
                                        <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                            Configured
                                        </span>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* API Key Input */}
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

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            type="submit"
                            className="flex-1 px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium"
                        >
                            Connect
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
