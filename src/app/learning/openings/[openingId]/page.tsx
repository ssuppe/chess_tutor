'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Header from '@/components/Header';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SupportedLanguage } from '@/lib/i18n/translations';
import { OpeningMetadata } from '@/lib/openings';
import { OpeningTrainingProvider } from '@/contexts/OpeningTrainingContext';
import OpeningTrainer from '@/components/OpeningTrainer/OpeningTrainer';
import { OpeningTrainerErrorBoundary } from '@/components/OpeningTrainer/ErrorBoundary';
import { getOpeningByEco } from '@/lib/openingTrainer/openingLoader';
import { Personality, PERSONALITIES } from '@/lib/personalities';
import { getApiKeyInfo } from '@/lib/apiKeyHelper';

export default function OpeningTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const openingId = params.openingId as string;

  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('chess_tutor_language') as SupportedLanguage) || 'en';
    }
    return 'en';
  });
  const [mounted, setMounted] = useState(false);
  const [opening, setOpening] = useState<OpeningMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPersonality, setSelectedPersonality] = useState<Personality>(() => {
    if (typeof window !== 'undefined') {
      const storedId = localStorage.getItem('chess_tutor_personality');
      return PERSONALITIES.find(p => p.id === storedId) || PERSONALITIES[0];
    }
    return PERSONALITIES[0];
  });
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getApiKeyInfo().key || '';
    }
    return '';
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const t = useTranslation(language);

  const loadOpening = useCallback(() => {
    // Find opening by ECO code
    const foundOpening = getOpeningByEco(openingId);

    if (!foundOpening) {
      // Opening not found - redirect back to selection
      router.push('/learning/openings');
      return;
    }

    setOpening(foundOpening);
    setIsLoading(false);
  }, [openingId, router]);

  useEffect(() => {
    if (mounted) {
      loadOpening();
    }
  }, [mounted, loadOpening]);

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
        <main className="flex-grow w-full flex items-center justify-center px-4">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-gray-500 uppercase tracking-widest font-bold">{t.learning.openingTrainer.loadingSession}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!opening) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
        <main className="flex-grow w-full flex items-center justify-center px-4">
          <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {t.learning.openingTrainer.openingNotFound}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-snug">
              {t.learning.openingTrainer.openingNotFoundDescription}
            </p>
            <button
              onClick={() => router.push('/learning/openings')}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs uppercase tracking-wider transition-all"
            >
              {t.learning.openingTrainer.backToOpeningSelection}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Slim Navigation Row */}
      <div className="w-full px-4 pt-2">
        <div className="max-w-6xl mx-auto flex justify-between items-center py-1">
          <button
            onClick={() => router.push('/learning/openings')}
            className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
            aria-label={t.learning.openingTrainer.backToOpeningSelection}
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">{t.learning.openingTrainer.backToOpeningSelection}</span>
          </button>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
            {opening.name} • {opening.eco}
          </div>
        </div>
      </div>

      <main className="flex-grow w-full flex justify-center px-4 py-4 md:py-8">
        <div className="w-full max-w-6xl space-y-4 md:space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-tight">{opening.name}</h1>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-bold">ECO: {opening.eco}</p>
            </div>
          </div>

          <OpeningTrainerErrorBoundary>
            <OpeningTrainingProvider>
              <OpeningTrainer
                opening={opening}
                personality={selectedPersonality}
                apiKey={apiKey}
                language={language}
              />
            </OpeningTrainingProvider>
          </OpeningTrainerErrorBoundary>
        </div>
      </main>
    </div>
  );
}
