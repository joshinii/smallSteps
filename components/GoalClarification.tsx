'use client';

import React, { useState } from 'react';
import type { ClarificationQuestion } from '@/lib/ai/ai-provider';

interface GoalClarificationProps {
    questions: ClarificationQuestion[];
    onComplete: (answers: Record<string, string>) => void;
    onBack: () => void;
    isProcessing: boolean;
}

export default function GoalClarification({
    questions,
    onComplete,
    onBack,
    isProcessing
}: GoalClarificationProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({});

    const handleOptionSelect = (questionId: string, value: string) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const isComplete = questions.every(q => answers[q.id]);

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="text-center space-y-2">
                <h3 className="text-xl font-light text-foreground">Let's clarify your path</h3>
                <p className="text-muted text-sm max-w-md mx-auto">
                    A few quick questions to help tailor the plan to your specific needs and pace.
                </p>
            </div>

            <div className="space-y-8">
                {questions.map((question, index) => (
                    <div key={question.id} className="space-y-4 animate-slideUp" style={{ animationDelay: `${index * 100}ms` }}>
                        <h4 className="font-medium text-foreground text-lg">
                            {index + 1}. {question.questionText}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {question.options.map((option) => {
                                const isSelected = answers[question.id] === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        onClick={() => handleOptionSelect(question.id, option.value)}
                                        className={`
                                            group text-left p-4 rounded-xl border-2 transition-all duration-200
                                            ${isSelected
                                                ? 'border-accent bg-accent/5 shadow-sm scale-[1.01]'
                                                : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`
                                                w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                                                ${isSelected ? 'border-accent' : 'border-gray-300 group-hover:border-gray-400'}
                                            `}>
                                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
                                            </div>
                                            <div>
                                                <div className={`font-medium ${isSelected ? 'text-accent' : 'text-foreground'}`}>
                                                    {option.label}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-3 pt-6 border-t border-gray-100">
                <button
                    onClick={onBack}
                    disabled={isProcessing}
                    className="px-6 py-3 border-2 border-gray-100 text-muted hover:text-foreground hover:border-gray-200 rounded-xl transition-colors font-medium disabled:opacity-50"
                >
                    Back
                </button>

                <button
                    onClick={() => onComplete(answers)}
                    disabled={!isComplete || isProcessing}
                    className="flex-1 px-6 py-3 bg-foreground text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg active:scale-[0.99]"
                >
                    {isProcessing ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Generating Plan...
                        </span>
                    ) : (
                        'Generate Personalized Plan →'
                    )}
                </button>
            </div>
        </div>
    );
}
