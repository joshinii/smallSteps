import { getProvider } from './index';

// Helper to get current provider from storage (client-side only)
function getCurrentProvider(): any {
    if (typeof window === 'undefined') return 'manual';
    return (localStorage.getItem('smallsteps-ai-provider') as any) || 'manual';
}

/**
 * Unified LLM Service Layer
 * 
 * Acts as a facade over the existing AI Provider system (AIContext/adapters).
 * This replaces direct API calls in UI components with a clean, typed interface.
 */

export type LLMConfig =
    | { provider: 'local', endpoint: string, modelName?: string }
    | { provider: 'claude', apiKey: string }
    | { provider: 'openai', apiKey: string }
    | { provider: 'gemini', apiKey: string };

export interface LLMRequestOptions {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    jsonMode?: boolean;
}

/**
 * Call the currently active LLM provider.
 * Delegates to the existing adapter system in AIContext/adapters.
 */
export async function callLLM(
    prompt: string,
    options?: LLMRequestOptions
): Promise<string> {
    const providerName = getCurrentProvider();
    const provider = getProvider(providerName);

    if (!provider) {
        throw new Error(`Provider ${providerName} not configured or unavailable`);
    }

    // Map options to adapter-specific format if needed
    // For now, we assume standard prompt structure.
    // Adapters like LMStudioAdapter handle their own defaults.

    try {
        // We reuse the existing decomposeGoal or clarifyGoal methods?
        // Actually, the new intelligent system needs a GENERIC "generate" method.
        // The existing adapters (lmstudio-adapter.ts) have specific methods:
        // decomposeGoal, clarifyGoal.
        // We should probably ADD a generic `generate(prompt)` method to the BaseAIProvider interface
        // OR just use one of the existing methods as a proxy if appropriate, 
        // but for "Intelligent Planning", we likely need flexible generation.

        // For Phase 1, we will mock this or shim it using the existing decomposeGoal
        // until we extend the adapters to support raw prompts.
        // BUT wait, decomposeGoal expects specific JSON output.
        // CLARIFICATION: The prompt implies a generic callLLM.
        // The existing adapters might need a `generateCompletion(prompt: string)` method.

        // Let's assume for now we will extend the adapters in Task 2.
        // For this file, we define the interface.

        // TEMPORARY: Use decomposeGoal as a proxy since it returns string/JSON usually?
        // No, decomposeGoal returns `{ tasks: ... }`.

        // We need to extend the IAIProvider interface. 
        // I will write this file assuming IAIProvider will have `generateCompletion`.
        // I will explicitly cast for now or update the interface in the next step.

        if ('generateCompletion' in provider) {
            // @ts-ignore
            return await provider.generateCompletion(prompt, options);
        } else {
            // Fallback for current adapters: Use their internal callAPI if exposed, or wrap
            // For now, throw not implemented to signal we need to update adapters.
            console.warn('Provider does not support generic completion yet. Using decomposeGoal as fallback shim.');
            // This is a hack for the immediate step; we will fix adapters next.
            // Actually, LMStudioAdapter HAS `callAPI`. We can access it if we cast constraints.

            // Let's rely on extending the adapters.
            throw new Error('Provider does not implement generateCompletion');
        }

    } catch (error) {
        console.error('LLM Service Call Failed:', error);
        throw error;
    }
}

/**
 * Detect if Local LLM (LM Studio) is running.
 */
export async function detectLocalLLM(endpoint = 'http://localhost:1234/v1/models'): Promise<boolean> {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1000);
        const response = await fetch(endpoint, {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(id);
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Get current configuration for display/settings
 */
export function getLLMConfig(): LLMConfig {
    if (typeof window === 'undefined') return { provider: 'local', endpoint: 'http://localhost:1234' };

    const savedProvider = localStorage.getItem('smallsteps-ai-provider') || 'local';
    // Note: We don't return API keys here for security/consistency with AIContext
    // This is mainly for UI state.

    return {
        provider: savedProvider as any,
        endpoint: 'http://localhost:1234', // default
    };
}
