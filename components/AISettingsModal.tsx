'use client';

// SmallSteps AI Settings Modal
// Calm, non-intrusive UI for configuring AI providers

import React, { useState, useEffect, useRef } from 'react';
import { useAI } from '@/lib/ai/AIContext';
import { ProviderName, PROVIDER_INFO, hasApiKey, hasStorageConsent, setStorageConsent, validateProviderKey, isLocalProvider } from '@/lib/ai';
import { getFeatures, setFeature } from '@/lib/config/features';
import { exportAndDownload, importData, readFileAsText } from '@/lib/utils/export';
import LLMSetup from './LLMSetup';

export default function AISettingsModal() {
    const { showSetupModal, closeSetupModal } = useAI();
    const [activeTab, setActiveTab] = useState<'provider' | 'features' | 'data'>('provider');

    // Feature flags state - initialize with direct call (safe due to internal window check)
    const [features, setFeatures] = useState(() => getFeatures());

    // Data management state
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [dataMessage, setDataMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showImportConfirm, setShowImportConfirm] = useState(false);
    const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync when modal opens
    useEffect(() => {
        if (showSetupModal) {
            setFeatures(getFeatures());
        }
    }, [showSetupModal]);

    if (!showSetupModal) return null;

    const toggleFeature = (key: string) => {
        const newValue = (features as any)[key] ? false : true;
        setFeature(key as any, newValue);
        setFeatures(prev => ({ ...prev, [key]: newValue }));
    };

    // Handle export
    const handleExport = async () => {
        setIsExporting(true);
        setDataMessage(null);
        try {
            await exportAndDownload();
            setDataMessage({ type: 'success', text: 'Data exported successfully!' });
        } catch (error) {
            setDataMessage({ type: 'error', text: 'Failed to export data' });
        } finally {
            setIsExporting(false);
        }
    };

    // Handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPendingImportFile(file);
            setShowImportConfirm(true);
        }
    };

    // Confirm and execute import
    const handleConfirmImport = async () => {
        if (!pendingImportFile) return;

        setIsImporting(true);
        setShowImportConfirm(false);
        setDataMessage(null);

        try {
            const jsonString = await readFileAsText(pendingImportFile);
            const result = await importData(jsonString);

            if (result.success) {
                setDataMessage({
                    type: 'success',
                    text: `Imported ${result.counts.goals} goals, ${result.counts.tasks} tasks, ${result.counts.workUnits} work units`
                });
                // Refresh page to reflect changes
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setDataMessage({ type: 'error', text: result.error || 'Import failed' });
            }
        } catch (error) {
            setDataMessage({ type: 'error', text: 'Failed to read file' });
        } finally {
            setIsImporting(false);
            setPendingImportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 overflow-hidden animate-slideUp">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-light text-slate-800">Intelligence Settings</h2>
                        <button onClick={closeSetupModal} className="text-slate-400 hover:text-slate-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex gap-4 text-sm mt-4">
                        <button
                            onClick={() => setActiveTab('provider')}
                            className={`pb-2 border-b-2 transition-colors ${activeTab === 'provider' ? 'border-accent text-accent font-medium' : 'border-transparent text-muted hover:text-foreground'}`}
                        >
                            AI Provider
                        </button>
                        <button
                            onClick={() => setActiveTab('features')}
                            className={`pb-2 border-b-2 transition-colors ${activeTab === 'features' ? 'border-accent text-accent font-medium' : 'border-transparent text-muted hover:text-foreground'}`}
                        >
                            Features
                        </button>
                        <button
                            onClick={() => setActiveTab('data')}
                            className={`pb-2 border-b-2 transition-colors ${activeTab === 'data' ? 'border-accent text-accent font-medium' : 'border-transparent text-muted hover:text-foreground'}`}
                        >
                            Data
                        </button>
                    </div>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {activeTab === 'provider' ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 border border-blue-100 mb-4">
                                <strong>Privacy First:</strong> Your API keys are stored locally on your device.
                                We never see them. Local AI runs entirely offline.
                            </div>
                            <LLMSetup />
                        </div>
                    ) : activeTab === 'features' ? (
                        <div className="space-y-6">
                            <p className="text-sm text-muted">
                                Enable enhanced capabilities. These run securely using your selected AI provider.
                            </p>

                            <div className="space-y-4">
                                <FeatureToggle
                                    label="Agent Orchestration"
                                    description="Multi-agent workflow: Clarifier → Decomposer → Validator"
                                    checked={features.agentOrchestration}
                                    onChange={() => toggleFeature('agentOrchestration')}
                                />
                                <FeatureToggle
                                    label="Intelligent Planning"
                                    description="Breaks down goals into phases and smart milestones"
                                    checked={features.smartPlanning}
                                    onChange={() => toggleFeature('smartPlanning')}
                                />
                                <FeatureToggle
                                    label="Context Gathering"
                                    description="Asks clarifying questions before generating tasks"
                                    checked={features.contextGathering}
                                    onChange={() => toggleFeature('contextGathering')}
                                />
                                <FeatureToggle
                                    label="Capacity Balancing"
                                    description="Distributes tasks based on your daily capacity (240m)"
                                    checked={features.multiGoalBalancing}
                                    onChange={() => toggleFeature('multiGoalBalancing')}
                                />
                                <FeatureToggle
                                    label="Relevance Filter"
                                    description="Uses embeddings to filter off-topic AI suggestions"
                                    checked={features.relevanceValidation}
                                    onChange={() => toggleFeature('relevanceValidation')}
                                />
                            </div>
                        </div>
                    ) : activeTab === 'data' ? (
                        <div className="space-y-6">
                            <p className="text-sm text-muted">
                                Export your data for backup or import from a previous backup.
                            </p>

                            {/* Status message */}
                            {dataMessage && (
                                <div className={`p-3 rounded-lg text-sm ${dataMessage.type === 'success'
                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                    : 'bg-red-50 text-red-700 border border-red-100'
                                    }`}>
                                    {dataMessage.text}
                                </div>
                            )}

                            {/* Export section */}
                            <div className="p-4 border border-gray-100 rounded-xl">
                                <h4 className="font-medium text-slate-700 mb-2">Export Data</h4>
                                <p className="text-xs text-muted mb-3">
                                    Download all your goals, tasks, work units, and habits as a JSON file.
                                </p>
                                <button
                                    onClick={handleExport}
                                    disabled={isExporting || isImporting}
                                    className="px-4 py-2 bg-foreground text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity text-sm font-medium"
                                >
                                    {isExporting ? 'Exporting...' : 'Download Backup'}
                                </button>
                            </div>

                            {/* Import section */}
                            <div className="p-4 border border-gray-100 rounded-xl">
                                <h4 className="font-medium text-slate-700 mb-2">Import Data</h4>
                                <p className="text-xs text-muted mb-3">
                                    Restore from a previous backup. This will replace all existing data.
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isExporting || isImporting}
                                    className="px-4 py-2 border border-gray-300 text-foreground rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm font-medium"
                                >
                                    {isImporting ? 'Importing...' : 'Choose Backup File'}
                                </button>
                            </div>

                            {/* Import confirmation dialog */}
                            {showImportConfirm && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                    <h4 className="font-medium text-amber-800 mb-2">⚠️ Confirm Import</h4>
                                    <p className="text-sm text-amber-700 mb-3">
                                        This will replace ALL your existing data with the backup. This cannot be undone.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleConfirmImport}
                                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                                        >
                                            Yes, Replace All Data
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowImportConfirm(false);
                                                setPendingImportFile(null);
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                            }}
                                            className="px-4 py-2 border border-gray-300 text-foreground rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function FeatureToggle({ label, description, checked, onChange }: any) {
    return (
        <label className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100 transition-all">
            <div className="relative inline-flex items-center cursor-pointer mt-1">
                <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </div>
            <div className="flex-1">
                <div className="font-medium text-slate-700">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{description}</div>
            </div>
        </label>
    );
}


