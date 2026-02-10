'use client';

import { useState, useRef, useEffect } from 'react';
import { EditIcon, CheckIcon, CloseIcon } from '@/components/icons';

interface InlineEditProps {
    value: string;
    onSave: (value: string) => Promise<void> | void;
    placeholder?: string;
    className?: string;
    multiline?: boolean;
    minLength?: number;
    maxLength?: number;
    label?: string; // For accessibility / empty state
}

export default function InlineEdit({
    value,
    onSave,
    placeholder = 'Click to edit',
    className = '',
    multiline = false,
    minLength = 3,
    maxLength = 200,
    label
}: InlineEditProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Sync external value changes
    useEffect(() => {
        setTempValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            // Select all text on focus for easy replacement? Or just cursor at end?
            // Standard UX is cursor at end or select all. Select all is often better for quick title edits.
            if (inputRef.current instanceof HTMLInputElement) {
                inputRef.current.select();
            }
        }
    }, [isEditing]);

    const handleSave = async () => {
        const trimmed = tempValue.trim();

        // Validation
        if (trimmed.length < minLength) {
            setError(`Min ${minLength} chars`);
            return;
        }
        if (trimmed.length > maxLength) {
            setError(`Max ${maxLength} chars`);
            return;
        }

        // Optimistic check
        if (trimmed === value) {
            setIsEditing(false);
            setError(null);
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            await onSave(trimmed);
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to save inline edit', err);
            setError('Failed to save');
            // Keep editing mode open so user can retry
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setTempValue(value);
        setIsEditing(false);
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (!multiline || (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSave();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    if (isEditing) {
        return (
            <div className={`relative group ${className}`}>
                {multiline ? (
                    <textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        value={tempValue}
                        onChange={(e) => {
                            setTempValue(e.target.value);
                            setError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        // Save on blur if no error? 
                        // UX debate: Blur save is good for quick edits. 
                        // But if error exists, we shouldn't save.
                        onBlur={() => {
                            if (!error) handleSave();
                        }}
                        className="w-full min-h-[80px] p-2 text-sm border rounded shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-background resize-y"
                        maxLength={maxLength}
                    />
                ) : (
                    <input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        value={tempValue}
                        onChange={(e) => {
                            setTempValue(e.target.value);
                            setError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        onBlur={() => {
                            if (!error) handleSave();
                        }}
                        className="w-full px-1 py-0.5 border-b border-primary/50 bg-transparent outline-none focus:border-primary transition-colors"
                        maxLength={maxLength}
                    />
                )}

                {/* Status / Controls */}
                <div className="absolute right-0 top-full mt-1 flex items-center gap-2 z-10">
                    {error && <span className="text-[10px] text-red-500 bg-background/90 px-1 rounded border border-red-200">{error}</span>}
                    {isSaving && <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>}
                    {/* Explicit visual cues for mouse users */}
                    <button onClick={handleSave} className="p-0.5 hover:bg-green-100 rounded text-green-600" title="Save (Enter)">
                        <CheckIcon size={12} />
                    </button>
                    <button onClick={handleCancel} className="p-0.5 hover:bg-red-100 rounded text-red-600" title="Cancel (Esc)">
                        <CloseIcon size={12} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`group relative cursor-text hover:bg-black/5 rounded px-1 -mx-1 transition-colors ${className}`}
            onClick={() => setIsEditing(true)}
        >
            {value || <span className="text-muted-foreground italic">{placeholder}</span>}

            <button
                className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-primary"
                title={`Edit ${label || 'field'}`}
            >
                <EditIcon size={12} />
            </button>
        </div>
    );
}
