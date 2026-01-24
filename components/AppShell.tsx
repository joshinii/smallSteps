'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Handle window resize to determine mobile state
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 1024) {
                setIsCollapsed(true);
            } else {
                setIsCollapsed(false);
            }
        };

        // Initial check
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleSidebar = () => {
        setIsCollapsed(!isCollapsed);
    };

    return (
        <div className="flex min-h-screen">
            {/* Sidebar with props */}
            <Sidebar isCollapsed={isCollapsed} toggleSidebar={toggleSidebar} isMobile={isMobile} />

            {/* Main Content Area */}
            <main
                className={`flex-1 w-full transition-all duration-300 ease-in-out ${isMobile ? 'ml-0' : (isCollapsed ? 'ml-20' : 'ml-64')
                    }`}
            >
                {children}
            </main>
        </div>
    );
}
