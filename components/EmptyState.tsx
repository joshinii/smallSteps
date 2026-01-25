// SmallSteps Empty State Component
// Encouraging, calm messaging for empty views

import React from 'react';

interface EmptyStateProps {
    icon?: 'tasks' | 'goals' | 'journey' | 'habits' | 'search';
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

const icons = {
    tasks: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M2 12h20"/>
        </svg>
    ),
    goals: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v8m-4-4h8"/>
        </svg>
    ),
    journey: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
    ),
    habits: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
    ),
    search: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
        </svg>
    ),
};

export default function EmptyState({ icon = 'tasks', title, description, action }: EmptyStateProps) {
    return (
        <div className="text-center py-16 px-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 animate-fadeIn">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="text-gray-400">
                    {icons[icon]}
                </div>
            </div>

            <h3 className="text-lg font-light text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted max-w-md mx-auto">{description}</p>

            {action && (
                <button
                    onClick={action.onClick}
                    className="mt-6 px-6 py-2.5 bg-foreground text-white rounded-xl hover:opacity-90 transition-opacity font-medium text-sm"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}
