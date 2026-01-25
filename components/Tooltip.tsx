// SmallSteps Tooltip Component
// Minimal, accessible tooltips for contextual help

'use client';

import React, { useState } from 'react';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    className?: string;
}

export default function Tooltip({ content, children, className = '' }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className="relative inline-block">
            <div
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                className={className}
            >
                {children}
            </div>
            {isVisible && (
                <div className="absolute z-50 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap bottom-full left-1/2 -translate-x-1/2 mb-2 animate-fadeIn pointer-events-none">
                    {content}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-gray-900"></div>
                    </div>
                </div>
            )}
        </div>
    );
}
