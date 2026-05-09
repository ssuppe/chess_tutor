'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Header from '@/components/Header';
import FamilySelector from '@/components/OpeningTrainer/FamilySelector';
import { useTranslation } from "@/lib/i18n/useTranslation";
import { TopUtilityLinks } from "@/components/TopUtilityLinks";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { getEcoRootOpenings } from '@/lib/openingTrainer/openingLoader';
import { groupOpeningsByFamily } from '@/lib/openingTrainer/openingFamilies';

export default function OpeningsPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedLang = localStorage.getItem('chess_tutor_language');
    if (storedLang) setLanguage(storedLang as SupportedLanguage);
    setMounted(true);
  }, []);

  const t = useTranslation(language);

  // Get ECO root openings for display
  const allOpenings = useMemo(() => {
    return getEcoRootOpenings();
  }, []);

  // Group openings by family
  const openingFamilies = useMemo(() => {
    return groupOpeningsByFamily(allOpenings);
  }, [allOpenings]);

  if (!mounted) return null;

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Slim Navigation Row */}
            <div className="w-full px-4 pt-2">
                <div className="max-w-6xl mx-auto flex justify-between items-center py-1">
                    <button
                        onClick={() => router.push('/learning')}
                        className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
                        aria-label={t.learning.backToMenu}
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">{t.learning.backToMenu}</span>
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                            Opening Training
                        </div>
                        <TopUtilityLinks language={language} />
                    </div>
                </div>
            </div>

            <main className="flex-grow w-full flex justify-center px-4 py-4 md:py-8">
                <div className="w-full max-w-6xl space-y-4 md:space-y-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                            Opening Training
                        </h1>
                        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                            Select an opening family to train. You can play any variation within the family,
                            and your AI coach will guide you through the different lines.
                        </p>
                    </div>

                    <FamilySelector families={openingFamilies} />
                </div>
            </main>
        </div>
    );
}
