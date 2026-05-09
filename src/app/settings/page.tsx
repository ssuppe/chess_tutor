"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { ArrowLeft, Save, Trash2, RefreshCw, Loader2, Cpu } from "lucide-react";
import { useHasHydrated } from "@/lib/useHasHydrated";
import { clearWikipediaLocalStorage } from "@/lib/openingTrainer/wikipediaService";
import { getAvailableModels, DEFAULT_MODEL_ID } from "@/lib/gemini";
import { useEffect } from "react";

export default function SettingsPage() {
    const router = useRouter();
    const [apiKey, setApiKey] = useState(() => typeof window === "undefined" ? "" : localStorage.getItem("gemini_api_key") || "");
    const [modelId, setModelId] = useState(() => typeof window === "undefined" ? DEFAULT_MODEL_ID : localStorage.getItem("gemini_model_id") || DEFAULT_MODEL_ID);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [language, setLanguage] = useState<SupportedLanguage>(() => {
        if (typeof window === "undefined") {
            return "en";
        }

        return (localStorage.getItem("chess_tutor_language") as SupportedLanguage) || "en";
    });
    const [chesscomUsername, setChesscomUsername] = useState(() => typeof window === "undefined" ? "" : localStorage.getItem("chesscom_username") || "");
    const [lichessUsername, setLichessUsername] = useState(() => typeof window === "undefined" ? "" : localStorage.getItem("lichess_username") || "");
    const [consentGiven, setConsentGiven] = useState(false);
    const [showConsentError, setShowConsentError] = useState(false);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const hasHydrated = useHasHydrated();

    useEffect(() => {
        getAvailableModels().then(setAvailableModels);
    }, []);

    const t = useTranslation(language);

    // Check if rebuild is in progress on mount
    useEffect(() => {
        if (hasHydrated) {
            checkRebuildStatus();
        }
    }, [hasHydrated]);

    const checkRebuildStatus = async () => {
        try {
            const response = await fetch("/api/v1/cache/wikipedia");
            const data = await response.json();
            setIsRebuilding(data.isRebuilding);
        } catch (error) {
            console.error("Failed to check rebuild status:", error);
        }
    };

    // Poll if rebuilding
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRebuilding) {
            interval = setInterval(checkRebuildStatus, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRebuilding]);

    const handleSave = () => {
        // Check consent if API key is being set
        if (apiKey.trim() && !consentGiven) {
            setShowConsentError(true);
            return;
        }

        setShowConsentError(false);

        if (apiKey.trim()) {
            localStorage.setItem("gemini_api_key", apiKey.trim());
        } else {
            localStorage.removeItem("gemini_api_key");
        }

        localStorage.setItem("gemini_model_id", modelId);
        localStorage.setItem("chess_tutor_language", language);

        // Save online platform usernames
        if (chesscomUsername.trim()) {
            localStorage.setItem("chesscom_username", chesscomUsername.trim());
        } else {
            localStorage.removeItem("chesscom_username");
        }

        if (lichessUsername.trim()) {
            localStorage.setItem("lichess_username", lichessUsername.trim());
        } else {
            localStorage.removeItem("lichess_username");
        }

        // Go back to home
        router.push("/");
    };

    const handleClearAllData = async () => {
        if (window.confirm(t.common.clearAllDataConfirm)) {
            try {
                // Clear server-side cache
                await fetch("/api/v1/cache/wikipedia", {
                    method: "DELETE",
                });
            } catch (error) {
                console.error("Failed to clear server-side cache during full wipe:", error);
            }
            
            localStorage.clear();
            router.push("/onboarding");
        }
    };

    const handleClearWikipediaCache = async () => {
        if (window.confirm(t.common.clearWikipediaCacheConfirm)) {
            try {
                const response = await fetch("/api/v1/cache/wikipedia", {
                    method: "DELETE",
                });
                const data = await response.json();
                if (data.success) {
                    clearWikipediaLocalStorage();
                    alert(t.common.clearWikipediaCacheSuccess);
                } else {
                    alert(t.common.error + ": " + data.error);
                }
            } catch (error) {
                alert(t.common.error);
            }
        }
    };

    const handleRebuildWikipediaCache = async () => {
        if (window.confirm(t.common.rebuildWikipediaCacheConfirm)) {
            try {
                const response = await fetch("/api/v1/cache/wikipedia", {
                    method: "POST",
                });
                const data = await response.json();
                if (data.success) {
                    setIsRebuilding(true);
                    alert(t.common.rebuildWikipediaCacheStarted);
                } else {
                    alert(t.common.error + ": " + data.error);
                }
            } catch (error) {
                alert(t.common.error);
            }
        }
    };

    if (!hasHydrated) return null;

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Slim Navigation Row */}
            <div className="w-full px-4 pt-2">
                <div className="max-w-2xl mx-auto flex justify-between items-center py-1">
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
                        aria-label={t.game.backToMenu}
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">{t.game.backToMenu}</span>
                    </button>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                        {t.start.settings}
                    </div>
                </div>
            </div>

            <main className="flex-grow w-full flex justify-center px-4 py-4 md:py-8">
                <div className="w-full max-w-2xl">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 md:p-8 space-y-6 md:space-y-8">
                        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 pb-4">
                            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                                {t.start.settings}
                            </h1>
                        </div>

                        <div className="space-y-6">
                            {/* Language Selection */}
                            <div>
                                <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">
                                    {t.start.language}
                                </label>
                                <div className="flex gap-2">
                                    {(['en', 'de', 'fr', 'it', 'pl'] as SupportedLanguage[]).map((lang) => (
                                        <button
                                            key={lang}
                                            onClick={() => setLanguage(lang)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${language === lang
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                                                }`}
                                        >
                                            {lang.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* API Key Input */}
                            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">
                                    {t.start.apiKey}
                                </label>
                                <div className="space-y-3">
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={t.start.apiKeyPlaceholder}
                                        className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                                    />

                                    {/* Consent Checkbox */}
                                    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                        <input
                                            type="checkbox"
                                            id="settings-consent-checkbox"
                                            checked={consentGiven}
                                            onChange={(e) => setConsentGiven(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                                        />
                                        <label htmlFor="settings-consent-checkbox" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer leading-snug">
                                            {t.onboarding.api.consentLabel}
                                        </label>
                                    </div>

                                    {showConsentError && (
                                        <p className="text-xs text-red-600 dark:text-red-400 font-bold uppercase tracking-tight">
                                            {t.onboarding.api.consentRequired}
                                        </p>
                                    )}

                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tight">
                                        {t.start.apiKeyRequired} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{t.start.getApiKey}</a>
                                    </p>
                                </div>
                            </div>

                            {/* Gemini Model Selection */}
                            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">
                                    {t.start.geminiModel}
                                </label>
                                <div className="space-y-2">
                                    <select
                                        value={modelId}
                                        onChange={(e) => setModelId(e.target.value)}
                                        className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                                    >
                                        {availableModels.map((m) => (
                                            <option key={m} value={m}>
                                                {m} {m === DEFAULT_MODEL_ID ? `(${t.common.loading === 'Loading...' ? 'Recommended' : 'Empfohlen'})` : ''}
                                            </option>
                                        ))}
                                        {!availableModels.includes(modelId) && (
                                            <option value={modelId}>{modelId}</option>
                                        )}
                                    </select>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tight">
                                        {t.start.geminiModelDescription}
                                    </p>
                                </div>
                            </div>

                            {/* Online Platform Usernames */}
                            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                <h2 className="text-xs font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">
                                    Online Platform Integration
                                </h2>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4 leading-snug">
                                    Save your usernames to quickly import games from Chess.com and Lichess in the Analysis page.
                                </p>

                                <div className="space-y-4">
                                    {/* Chess.com Username */}
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-1.5">
                                            Chess.com Username
                                        </label>
                                        <input
                                            type="text"
                                            value={chesscomUsername}
                                            onChange={(e) => setChesscomUsername(e.target.value)}
                                            placeholder="Enter your Chess.com username"
                                            className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none text-sm transition-all"
                                        />
                                    </div>

                                    {/* Lichess Username */}
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-1.5">
                                            Lichess Username
                                        </label>
                                        <input
                                            type="text"
                                            value={lichessUsername}
                                            onChange={(e) => setLichessUsername(e.target.value)}
                                            placeholder="Enter your Lichess username"
                                            className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Data Management */}
                            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                                <h2 className="text-xs font-bold text-gray-900 dark:text-white mb-1 uppercase tracking-wider">
                                    Data Management
                                </h2>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 leading-snug">
                                    {t.common.clearWikipediaCacheDescription}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={handleClearWikipediaCache}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium text-xs transition-all"
                                    >
                                        <Trash2 size={14} />
                                        {t.common.clearWikipediaCache}
                                    </button>
                                    <button
                                        onClick={handleRebuildWikipediaCache}
                                        disabled={isRebuilding}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all border ${isRebuilding 
                                            ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-gray-700 cursor-not-allowed'
                                            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/50 border-blue-100 dark:border-blue-800'}`}
                                    >
                                        {isRebuilding ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <RefreshCw size={14} />
                                        )}
                                        {t.common.rebuildWikipediaCache}
                                    </button>
                                </div>
                            </div>

                            {/* Danger Zone - Clear All Data */}
                            <div className="pt-6 border-t border-red-100 dark:border-red-900/50">
                                <h2 className="text-xs font-bold text-red-600 dark:text-red-400 mb-1 uppercase tracking-wider">
                                    Danger Zone
                                </h2>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 leading-snug">
                                    {t.common.clearAllDataDescription}
                                </p>
                                <button
                                    onClick={handleClearAllData}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-xs shadow-sm transition-all"
                                >
                                    <Trash2 size={14} />
                                    {t.common.clearAllData}
                                </button>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md transition-all active:scale-95"
                            >
                                <Save size={18} />
                                {t.common?.save || "Save Settings"}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
