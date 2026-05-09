"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Target, BookOpen } from "lucide-react";
import Header from "@/components/Header";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { Personality, PERSONALITIES } from "@/lib/personalities";

const TACTICAL_PATTERNS = [
    { id: 'PIN', icon: '📌' },
    { id: 'SKEWER', icon: '🎯' },
    { id: 'FORK', icon: '🍴' },
    { id: 'DISCOVERED_CHECK', icon: '🔍' },
    { id: 'DOUBLE_ATTACK', icon: '⚔️' },
    { id: 'OVERLOADING', icon: '⚖️' },
    { id: 'BACK_RANK_WEAKNESS', icon: '🏰' },
    { id: 'TRAPPED_PIECE', icon: '🪤' },
] as const;

export default function LearningAreaPage() {
    const router = useRouter();
    const [language, setLanguage] = useState<SupportedLanguage>('en');
    const [mounted, setMounted] = useState(false);
    const [selectedPersonality, setSelectedPersonality] = useState<Personality>(PERSONALITIES[0]);

    useEffect(() => {
        const storedLang = localStorage.getItem("chess_tutor_language");
        if (storedLang) setLanguage(storedLang as SupportedLanguage);

        const storedPersonalityId = localStorage.getItem("chess_tutor_personality");
        if (storedPersonalityId) {
            const personality = PERSONALITIES.find(p => p.id === storedPersonalityId);
            if (personality) setSelectedPersonality(personality);
        }

        setMounted(true);
    }, []);

    const t = useTranslation(language);

    if (!mounted) return null;

    const getPatternName = (patternId: string): string => {
        const key = patternId.toLowerCase().replace(/_/g, '') as keyof typeof t.learning.patterns;
        // Map pattern IDs to translation keys
        const mapping: Record<string, keyof typeof t.learning.patterns> = {
            'PIN': 'pin',
            'SKEWER': 'skewer',
            'FORK': 'fork',
            'DISCOVERED_CHECK': 'discoveredCheck',
            'DOUBLE_ATTACK': 'doubleAttack',
            'OVERLOADING': 'overloading',
            'BACK_RANK_WEAKNESS': 'backRankWeakness',
            'TRAPPED_PIECE': 'trappedPiece',
        };
        return t.learning.patterns[mapping[patternId]];
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Slim Navigation Row */}
            <div className="w-full px-4 pt-2">
                <div className="max-w-6xl mx-auto flex justify-between items-center py-1">
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
                        aria-label={t.learning.backToMenu}
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">{t.learning.backToMenu}</span>
                    </button>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                        {t.learning.title}
                    </div>
                </div>
            </div>

            <main className="flex-grow w-full flex justify-center px-4 py-4 md:py-8">
                <div className="w-full max-w-6xl space-y-4 md:space-y-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                            {t.learning.title}
                        </h1>
                        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                            {t.learning.subtitle}
                        </p>
                    </div>

                    {/* Coach Selection */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 md:p-4">
                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-3">
                            {t.analysis.chooseCoach}
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {PERSONALITIES.map((personality) => (
                                <button
                                    key={personality.id}
                                    onClick={() => {
                                        setSelectedPersonality(personality);
                                        localStorage.setItem("chess_tutor_personality", personality.id);
                                    }}
                                    className={`p-2 md:p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                                        selectedPersonality.id === personality.id
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    <div className="text-xl">{personality.image}</div>
                                    <div className="text-xs md:text-sm font-medium text-gray-900 dark:text-white">
                                        {personality.name}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tactical Patterns Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Target className="text-blue-600 dark:text-blue-400" size={20} />
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white uppercase tracking-tight">
                                {t.learning.tacticalPatterns}
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {TACTICAL_PATTERNS.map((pattern) => (
                                <button
                                    key={pattern.id}
                                    onClick={() => router.push(`/learning/tactics/${pattern.id.toLowerCase()}`)}
                                    className="group bg-white dark:bg-gray-800 p-4 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-700 transition-all border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 shadow-sm text-left flex items-center gap-3"
                                >
                                    <div className="text-2xl group-hover:scale-110 transition-transform">
                                        {pattern.icon}
                                    </div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                                        {getPatternName(pattern.id)}
                                    </h3>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Openings Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="text-purple-600 dark:text-purple-400" size={20} />
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white uppercase tracking-tight">
                                {t.learning.openings}
                            </h2>
                        </div>

                        <button
                            onClick={() => router.push('/learning/openings')}
                            className="w-full group bg-white dark:bg-gray-800 p-4 md:p-6 rounded-xl hover:bg-purple-50 dark:hover:bg-gray-700 transition-all border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 shadow-sm text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="text-3xl md:text-4xl group-hover:scale-110 transition-transform">
                                    📖
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-base md:text-lg mb-0.5">
                                        Opening Training
                                    </h3>
                                    <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                                        Practice opening repertoire with engine-backed feedback and AI explanations
                                    </p>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

