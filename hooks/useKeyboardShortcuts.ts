// SmallSteps Keyboard Shortcuts Hook
// Global keyboard shortcuts for power users

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ShortcutConfig {
    enabled?: boolean;
}

export function useKeyboardShortcuts(config: ShortcutConfig = {}) {
    const router = useRouter();
    const { enabled = true } = config;

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore shortcuts when typing in input/textarea
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            // Navigation shortcuts (with modifier key for safety)
            if (e.metaKey || e.ctrlKey) {
                switch (e.key) {
                    case 'h':
                        e.preventDefault();
                        router.push('/');
                        break;
                    case 't':
                        e.preventDefault();
                        router.push('/today');
                        break;
                    case 'j':
                        e.preventDefault();
                        router.push('/journey');
                        break;
                    case 'r':
                        e.preventDefault();
                        router.push('/habits');
                        break;
                }
            }

            // Single-key shortcuts (no modifier)
            switch (e.key) {
                case '?':
                    e.preventDefault();
                    showShortcutsHelp();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled, router]);
}

function showShortcutsHelp() {
    // Create modal with shortcuts
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 animate-slideUp">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-light text-foreground">Keyboard Shortcuts</h2>
                <button onclick="this.closest('.fixed').remove()" class="text-muted hover:text-foreground p-1 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div class="space-y-3 text-sm">
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <span class="text-foreground">Go to Home</span>
                    <kbd class="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+H</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <span class="text-foreground">Go to Today</span>
                    <kbd class="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+T</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <span class="text-foreground">Go to Journey</span>
                    <kbd class="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+J</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <span class="text-foreground">Go to Habits</span>
                    <kbd class="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+R</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <span class="text-foreground">Show this help</span>
                    <kbd class="px-2 py-1 bg-gray-100 rounded text-xs font-mono">?</kbd>
                </div>
            </div>

            <p class="mt-4 text-xs text-muted">
                On Mac, use Cmd instead of Ctrl
            </p>
        </div>
    `;

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Close on Escape
    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            modal.remove();
            window.removeEventListener('keydown', handleEscape);
        }
    };
    window.addEventListener('keydown', handleEscape);

    document.body.appendChild(modal);
}
