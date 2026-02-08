'use client';

import React, { useState } from 'react';
import { useAI } from '@/lib/ai/AIContext';
import { ProviderName, PROVIDER_INFO, hasApiKey, isLocalProvider } from '@/lib/ai';
import { detectLocalLLM } from '@/lib/ai/llm-service';

export default function LLMSetup() {
    const { provider: currentProvider, configureProvider, removeKey } = useAI();
    const [selectedProvider, setSelectedProvider] = useState<ProviderName>(
        currentProvider === 'manual' ? 'local' : currentProvider as any
    );
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const providerInfo = PROVIDER_INFO[selectedProvider] || PROVIDER_INFO['lmstudio'];
    const isLocal = isLocalProvider(selectedProvider);

    const handleConnect = async () => {
        setIsValidating(true);
        setError('');
        setStatusMessage('');

        try {
            if (isLocal) {
                setStatusMessage('Detecting local server...');
                const isRunning = await detectLocalLLM();

                if (isRunning) {
                    configureProvider(selectedProvider, ''); // No key needed
                    setStatusMessage('Connected successfully!');
                    setTimeout(() => setStatusMessage(''), 2000);
                } else {
                    setError('Could not connect to LM Studio at localhost:1234. Is it running?');
                }
            } else {
                if (!apiKey.trim()) {
                    setError('Please enter an API key');
                    setIsValidating(false);
                    return;
                }

                // For cloud providers, we should validate logic here (or rely on AIContext wrapper validation)
                // For now, assume simple configuration is identifying "setup complete"
                // The AIContext handles validation internally usually? 
                // In AISettingsModal it called validateProviderKey.
                // We should probably rely on AIContext or import validateProviderKey.
                // Let's import validateProviderKey from lib/ai like AISettingsModal did.

                const { validateProviderKey } = await import('@/lib/ai');
                const isValid = await validateProviderKey(selectedProvider, apiKey.trim());

                if (isValid) {
                    configureProvider(selectedProvider, apiKey.trim());
                    setApiKey('');
                    setStatusMessage('Verified and connected!');
                } else {
                    setError('Invalid API key. Please check and try again.');
                }
            }
        } catch (e) {
            setError('Connection failed. Please check your network.');
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Provider Selection Cards */}
            <div className="grid grid-cols-1 gap-3">
                {(['lmstudio', 'ollama', 'claude', 'gemini', 'openai'] as ProviderName[]).map((name) => (
                    <label
                        key={name}
                        onClick={() => {
                            setSelectedProvider(name);
                            setError('');
                            setStatusMessage('');
                        }}
                        className={`
                            relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all
                            ${selectedProvider === name
                                ? 'border-accent bg-accent/5 shadow-sm'
                                : 'border-gray-100 hover:border-gray-200'
                            }
                        `}
                    >
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                    {PROVIDER_INFO[name].displayName}
                                </span>
                                {hasApiKey(name) && (
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                        Active
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted mt-1">
                                {isLocalProvider(name) ? 'Free, private, runs on device' : 'High quality, paid API'}
                            </p>
                        </div>

                        <div className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center
                            ${selectedProvider === name ? 'border-accent' : 'border-gray-300'}
                        `}>
                            {selectedProvider === name && (
                                <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                            )}
                        </div>
                    </label>
                ))}
            </div>

            {/* Configuration Area */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 animate-fadeIn">
                <h3 className="text-sm font-medium text-foreground mb-3">
                    Configure {providerInfo.displayName}
                </h3>

                {isLocal ? (
                    <div className="space-y-4">
                        <div className="text-sm text-muted bg-white p-3 rounded-lg border border-slate-100">
                            {selectedProvider === 'ollama' ? (
                                <>
                                    1. Install <strong>Ollama</strong> from ollama.com<br />
                                    2. Run command: <code>ollama run qwen2.5-coder:7b</code><br />
                                    3. Ensure it's listening on port <code>11434</code>
                                </>
                            ) : (
                                <>
                                    1. Open <strong>LM Studio</strong><br />
                                    2. Load <strong>Phi-3</strong> or <strong>Llama 3</strong><br />
                                    3. Start Server on port <code>1234</code>
                                </>
                            )}
                        </div>
                        <button
                            onClick={async () => {
                                setIsValidating(true);
                                setError('');
                                setStatusMessage('');
                                try {
                                    setStatusMessage('Detecting local server...');
                                    // Use specific endpoint for Ollama
                                    const endpoint = selectedProvider === 'ollama'
                                        ? 'http://localhost:11434'
                                        : undefined; // default to LM Studio's

                                    const isRunning = await detectLocalLLM(endpoint);

                                    if (isRunning) {
                                        configureProvider(selectedProvider, ''); // No key needed
                                        setStatusMessage('Connected successfully!');
                                        setTimeout(() => setStatusMessage(''), 2000);
                                    } else {
                                        const port = selectedProvider === 'ollama' ? '11434' : '1234';
                                        setError(`Could not connect to ${PROVIDER_INFO[selectedProvider].displayName} at localhost:${port}. Is it running?`);
                                    }
                                } catch (e) {
                                    setError('Connection failed. Please check your network.');
                                } finally {
                                    setIsValidating(false);
                                }
                            }}
                            disabled={isValidating}
                            className="w-full py-2.5 bg-foreground text-white rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50"
                        >
                            {isValidating ? 'Detecting...' : 'Detect Local Server'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={`Enter ${providerInfo.displayName} API Key`}
                                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-accent focus:ring-1 focus:ring-accent outline-none bg-white"
                            />
                            <p className="mt-2 text-xs text-right">
                                <a href={providerInfo.keyUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                                    Get Key &rarr;
                                </a>
                            </p>
                        </div>
                        <button
                            onClick={handleConnect}
                            disabled={isValidating || !apiKey.trim()}
                            className="w-full py-2.5 bg-foreground text-white rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50"
                        >
                            {isValidating ? 'Verifying...' : 'Save & Connect'}
                        </button>
                    </div>
                )}

                {/* Feedback Messages */}
                {error && (
                    <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                        <span className="text-lg">!</span> {error}
                    </div>
                )}
                {statusMessage && !error && (
                    <div className="mt-3 p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                        {statusMessage}
                    </div>
                )}
            </div>
        </div>
    );
}
