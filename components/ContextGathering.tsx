'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Question } from '@/lib/agents/types';

interface ContextGatheringProps {
    questions: Question[];
    onComplete: (answers: Record<string, any>) => void;
    onBack?: () => void;
    onSkip?: () => void;
    isProcessing?: boolean;
}

/**
 * ContextGathering - Progressive question UI
 * 
 * Shows questions one at a time with gentle animations and progress tracking.
 * Designed for burnt-out users who get overwhelmed by long forms.
 */
export default function ContextGathering({
    questions,
    onComplete,
    onBack,
    onSkip,
    isProcessing = false,
}: ContextGatheringProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [textValue, setTextValue] = useState('');
    const [numberValue, setNumberValue] = useState('');
    const [isTransitioning, setIsTransitioning] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentQuestion = questions[currentIndex];
    const progress = ((currentIndex + 1) / questions.length) * 100;
    const isLastQuestion = currentIndex === questions.length - 1;

    // Focus input on mount and question change
    useEffect(() => {
        if (inputRef.current && !isTransitioning) {
            inputRef.current.focus();
        }
    }, [currentIndex, isTransitioning]);

    // Handle answer submission
    const handleAnswer = useCallback((value: any) => {
        if (isTransitioning || isProcessing) return;

        const newAnswers = { ...answers, [currentQuestion.id]: value };
        setAnswers(newAnswers);

        if (isLastQuestion) {
            onComplete(newAnswers);
        } else {
            // Animate transition
            setIsTransitioning(true);
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setTextValue('');
                setNumberValue('');
                setIsTransitioning(false);
            }, 200);
        }
    }, [answers, currentQuestion?.id, isLastQuestion, isTransitioning, isProcessing, onComplete]);

    // Handle text/number submit
    const handleTextSubmit = useCallback(() => {
        const value = currentQuestion?.type === 'number'
            ? parseInt(numberValue) || 0
            : textValue.trim();

        // Allow empty for optional questions
        if (currentQuestion?.required && !value) return;

        handleAnswer(value || '(skipped)');
    }, [currentQuestion, textValue, numberValue, handleAnswer]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && currentQuestion?.type !== 'select') {
            e.preventDefault();
            handleTextSubmit();
        }
        if (e.key === 'Escape' && onSkip) {
            onSkip();
        }
    }, [currentQuestion?.type, handleTextSubmit, onSkip]);

    // Navigate back
    const goBack = useCallback(() => {
        if (currentIndex > 0) {
            setIsTransitioning(true);
            setTimeout(() => {
                setCurrentIndex(prev => prev - 1);
                setIsTransitioning(false);
            }, 200);
        } else if (onBack) {
            onBack();
        }
    }, [currentIndex, onBack]);

    if (!currentQuestion) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            className="space-y-6"
            onKeyDown={handleKeyDown}
        >
            {/* Progress Section */}
            <div className="space-y-2">
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-slate-400 to-slate-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Progress text */}
                <p className="text-xs text-muted text-center">
                    Question {currentIndex + 1} of {questions.length}
                </p>
            </div>

            {/* Question Container */}
            <div
                className={`transition-all duration-200 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
                    }`}
            >
                {/* Question text */}
                <h3 className="text-lg font-medium text-foreground mb-4 leading-relaxed">
                    {currentQuestion.text}
                    {!currentQuestion.required && (
                        <span className="text-sm text-muted ml-2 font-normal">(optional)</span>
                    )}
                </h3>

                {/* Text input */}
                {currentQuestion.type === 'text' && (
                    <div className="space-y-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            placeholder={currentQuestion.placeholder || 'Type your answer...'}
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-shadow"
                            disabled={isProcessing}
                            aria-label={currentQuestion.text}
                        />
                        <button
                            onClick={handleTextSubmit}
                            disabled={isProcessing}
                            className="w-full px-4 py-3 bg-foreground text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
                        >
                            {isLastQuestion ? 'Finish' : 'Continue'}
                        </button>
                    </div>
                )}

                {/* Number input */}
                {currentQuestion.type === 'number' && (
                    <div className="space-y-3">
                        <input
                            ref={inputRef}
                            type="number"
                            value={numberValue}
                            onChange={(e) => setNumberValue(e.target.value)}
                            placeholder={currentQuestion.placeholder || 'Enter a number...'}
                            min="0"
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-shadow"
                            disabled={isProcessing}
                            aria-label={currentQuestion.text}
                        />
                        <button
                            onClick={handleTextSubmit}
                            disabled={isProcessing}
                            className="w-full px-4 py-3 bg-foreground text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
                        >
                            {isLastQuestion ? 'Finish' : 'Continue'}
                        </button>
                    </div>
                )}

                {/* Select options */}
                {currentQuestion.type === 'select' && currentQuestion.options && (
                    <div className="grid gap-2" role="listbox" aria-label={currentQuestion.text}>
                        {currentQuestion.options.map((option, index) => (
                            <button
                                key={option}
                                onClick={() => handleAnswer(option)}
                                disabled={isProcessing}
                                className="w-full px-4 py-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all disabled:opacity-50"
                                role="option"
                            >
                                <span className="flex items-center gap-3">
                                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-xs text-muted font-medium">
                                        {index + 1}
                                    </span>
                                    <span className="text-foreground">{option}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                    onClick={goBack}
                    disabled={isProcessing}
                    className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                    ← {currentIndex > 0 ? 'Previous' : 'Back'}
                </button>

                {onSkip && (
                    <button
                        onClick={onSkip}
                        disabled={isProcessing}
                        className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-50"
                        title="Skip all remaining questions (Esc)"
                    >
                        Skip all →
                    </button>
                )}
            </div>

            {/* Keyboard hints */}
            <p className="text-xs text-center text-muted">
                {currentQuestion.type === 'select'
                    ? 'Click an option to continue'
                    : 'Press Enter to continue'}
            </p>
        </div>
    );
}
