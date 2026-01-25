'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { AIContextProvider } from '@/lib/ai/AIContext';
import AISettingsModal from './AISettingsModal';
import ErrorBoundary from './ErrorBoundary';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [isOnline, setIsOnline] = useState(true);

    // Enable keyboard shortcuts
    useKeyboardShortcuts();

    // Handle window resize to determine mobile state
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 1024) {
                setIsCollapsed(true);
            }
        };

        // Initial check
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Handle online/offline status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        // Initial check
        setIsOnline(navigator.onLine);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const toggleSidebar = () => {
        setIsCollapsed(!isCollapsed);
    };

    return (
        <ErrorBoundary>
            <AIContextProvider>
                <div className="flex min-h-screen">
                    {/* Sidebar with props */}
                    <Sidebar isCollapsed={isCollapsed} toggleSidebar={toggleSidebar} isMobile={isMobile} />

                    {/* Main Content Area */}
                    <main
                        className={`flex-1 w-full transition-all duration-300 ease-in-out ${isMobile ? 'ml-0' : (isCollapsed ? 'ml-20' : 'ml-64')
                            }`}
                    >
                        {/* Offline Indicator */}
                        {!isOnline && (
                            <div className="bg-yellow-50 border-b border-yellow-100 px-6 py-3 flex items-center gap-3 text-sm text-yellow-800">
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="flex-shrink-0"
                                >
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                <span>Offline mode. AI features unavailable until you reconnect.</span>
                            </div>
                        )}

                        <ErrorBoundary>
                            {children}
                        </ErrorBoundary>
                    </main>
                </div>

                {/* Global AI Settings Modal */}
                <AISettingsModal />
            </AIContextProvider>
        </ErrorBoundary>
    );
}

