"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Languages, Sparkles, Cpu, Loader2, RefreshCw } from "lucide-react";
import Header from "@/components/Header";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { TopUtilityLinks } from "@/components/TopUtilityLinks";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { getAvailableModels, DEFAULT_MODEL_ID } from "@/lib/gemini";

const STEPS = 4;

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [language, setLanguage] = useState<SupportedLanguage>("en");
    const [apiKey, setApiKey] = useState("");
    const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [error, setError] = useState("");
    const [consentGiven, setConsentGiven] = useState(false);

    const fetchModels = async () => {
        setIsModelsLoading(true);
        try {
            const effectiveKey = apiKey && apiKey.length >= 20 ? apiKey : undefined;
            const models = await getAvailableModels(effectiveKey);
            setAvailableModels(models);
        } catch (error) {
            console.error("Failed to fetch models:", error);
        } finally {
            setIsModelsLoading(false);
        }
    };

    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        const storedLang = localStorage.getItem("chess_tutor_language");
        const storedModel = localStorage.getItem("gemini_model_id");

        if (storedLang) {
            setLanguage(storedLang as SupportedLanguage);
        }

        if (storedModel) {
            setModelId(storedModel);
        }

        if (storedKey) {
            router.push("/");
            return;
        }

        getAvailableModels().then(setAvailableModels);

        setMounted(true);
    }, [router]);

    useEffect(() => {
        if (!mounted) return;

        const timer = setTimeout(fetchModels, 800);
        return () => clearTimeout(timer);
    }, [apiKey, mounted]);

    const t = useTranslation(language);

    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem("chess_tutor_language", language);
    }, [language, mounted]);

    const progress = useMemo(() => ((step + 1) / STEPS) * 100, [step]);

    const handleNext = () => {
        setError("");
        if (step < STEPS - 1) {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        setError("");
        if (step > 0) {
            setStep(step - 1);
        }
    };

    const handleFinish = () => {
        const trimmed = apiKey.trim();
        if (!trimmed) {
            setError(t.start.apiKeyRequired);
            return;
        }

        if (!consentGiven) {
            setError(t.onboarding.api.consentRequired);
            return;
        }

        localStorage.setItem("gemini_api_key", trimmed);
        localStorage.setItem("gemini_model_id", modelId);
        localStorage.setItem("chess_tutor_language", language);
        router.push("/");
    };

    if (!mounted) return null;

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Slim Utility Row */}
            <div className="w-full px-4 pt-2">
                <div className="max-w-4xl mx-auto flex justify-end items-center py-1">
                    <TopUtilityLinks language={language} />
                </div>
            </div>

            <div className="flex-grow max-w-4xl mx-auto w-full px-3 md:px-4 py-4 md:py-10 flex flex-col justify-center">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
                    <div className="h-1 bg-gray-200 dark:bg-gray-700">
                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>

                    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold">
                                    {t.onboarding.stepIndicator(step + 1, STEPS)}
                                </p>
                                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                                    {step === 0 && t.onboarding.welcome.title}
                                    {step === 1 && t.onboarding.language.title}
                                    {step === 2 && t.onboarding.value.title}
                                    {step === 3 && t.onboarding.api.title}
                                </h1>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {Array.from({ length: STEPS }).map((_, index) => (
                                    <div
                                        key={index}
                                        className={`w-2 h-2 rounded-full transition-all duration-200 ${index <= step ? 'bg-blue-600 scale-110' : 'bg-gray-200 dark:bg-gray-700'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {step === 0 && (
                            <div className="space-y-4">
                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <div className="flex-1 space-y-3">
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-[11px] font-bold uppercase tracking-wider">
                                            <Sparkles size={12} />
                                            {t.onboarding.welcome.subtitle}
                                        </div>
                                        <p className="text-lg text-gray-700 dark:text-gray-200 leading-snug">
                                            {t.onboarding.welcome.claim}
                                        </p>
                                    </div>
                                    <div className="flex-1 w-full">
                                        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg">
                                            <div className="p-5 space-y-2">
                                                <p className="text-4xl">♟️</p>
                                                <p className="text-base font-bold">{t.start.title}</p>
                                                <p className="text-xs text-blue-100/80 font-medium">Gemini • Stockfish • Tactics</p>
                                            </div>
                                            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 1 && (
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">{t.onboarding.language.description}</p>
                                <div className="flex flex-wrap gap-2">
                                    {["en", "de", "fr", "it", "pl"].map((lang) => (
                                        <button
                                            key={lang}
                                            onClick={() => setLanguage(lang as SupportedLanguage)}
                                            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all ${language === lang
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                                : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400'}
                                            `}
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                <Languages size={14} />
                                                {lang.toUpperCase()}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="grid md:grid-cols-2 gap-3">
                                {t.onboarding.value.bullets.map((bullet, index) => (
                                    <div key={index} className="flex items-start gap-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                                        <CheckCircle2 className="text-blue-600 shrink-0" size={16} />
                                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{bullet}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {step === 3 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">{t.onboarding.api.description}</p>
                                    <ul className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                                        <li className="flex gap-2 items-start">
                                            <KeyRound className="mt-0.5 text-blue-600 shrink-0" size={14} />
                                            <span>{t.onboarding.api.storage}</span>
                                        </li>
                                        <li className="flex gap-2 items-start">
                                            <KeyRound className="mt-0.5 text-blue-600 shrink-0" size={14} />
                                            <span>{t.onboarding.api.serverUse}</span>
                                        </li>
                                        <li className="flex gap-2 items-start">
                                            <KeyRound className="mt-0.5 text-blue-600 shrink-0" size={14} />
                                            <span>{t.onboarding.api.costNote}</span>
                                        </li>
                                        <li className="flex gap-2 items-start">
                                            <KeyRound className="mt-0.5 text-blue-600 shrink-0" size={14} />
                                            <span>{t.onboarding.api.privacy}</span>
                                        </li>
                                    </ul>
                                    <a
                                        href="https://aistudio.google.com/app/apikey"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-blue-600 hover:underline font-bold text-xs"
                                    >
                                        <ArrowRight size={14} /> {t.onboarding.api.getKey}
                                    </a>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 border border-gray-100 dark:border-gray-700 space-y-3">
                                    <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                                        {t.onboarding.api.inputLabel}
                                    </label>
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={t.onboarding.api.placeholder}
                                        className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />

                                    <div className="space-y-1.5 pt-1">
                                        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                                            <Cpu size={12} className="text-blue-600" />
                                            {t.start.geminiModel}
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-grow">
                                                <select
                                                    value={modelId}
                                                    onChange={(e) => setModelId(e.target.value)}
                                                    disabled={isModelsLoading}
                                                    className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-xs disabled:opacity-50"
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
                                                {isModelsLoading && (
                                                    <div className="absolute right-7 top-1/2 -translate-y-1/2">
                                                        <Loader2 size={14} className="animate-spin text-blue-600" />
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={(e) => { e.preventDefault(); fetchModels(); }}
                                                disabled={isModelsLoading}
                                                title="Refresh models"
                                                className="p-1.5 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all disabled:opacity-50 border border-gray-200 dark:border-gray-600 shadow-sm"
                                            >
                                                <RefreshCw size={14} className={isModelsLoading ? "animate-spin" : ""} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Consent Checkbox */}
                                    <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                        <input
                                            type="checkbox"
                                            id="consent-checkbox"
                                            checked={consentGiven}
                                            onChange={(e) => setConsentGiven(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                                        />
                                        <label htmlFor="consent-checkbox" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer leading-snug">
                                            {t.onboarding.api.consentLabel}
                                        </label>
                                    </div>

                                    {error && <p className="text-xs text-red-600 dark:text-red-400 font-bold tracking-tight">{error}</p>}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={handleBack}
                                disabled={step === 0}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${step === 0
                                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}`}
                            >
                                <ArrowLeft size={16} /> {t.onboarding.actions.back}
                            </button>
                            <div className="flex items-center gap-2">
                                {step < STEPS - 1 && (
                                    <button
                                        onClick={handleNext}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider shadow-md hover:bg-blue-700 transition active:scale-95"
                                    >
                                        {t.onboarding.actions.next} <ArrowRight size={16} />
                                    </button>
                                )}
                                {step === STEPS - 1 && (
                                    <button
                                        onClick={handleFinish}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider shadow-md hover:bg-green-700 transition active:scale-95"
                                    >
                                        {t.onboarding.actions.finish}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
