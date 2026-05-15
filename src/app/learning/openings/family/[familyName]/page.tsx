'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Header from '@/components/Header';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SupportedLanguage } from '@/lib/i18n/translations';
import { OpeningMetadata } from '@/lib/openings';
import { OpeningTrainingProvider } from '@/contexts/OpeningTrainingContext';
import OpeningTrainer from '@/components/OpeningTrainer/OpeningTrainer';
import { OpeningTrainerErrorBoundary } from '@/components/OpeningTrainer/ErrorBoundary';
import { getOpeningsByFamily } from '@/lib/openingTrainer/openingLoader';
import { buildVariationTree, VariationTree } from '@/lib/openingTrainer/gameLogic';
import { Personality, PERSONALITIES } from '@/lib/personalities';

/**
 * Family Training Page
 *
 * This page enables training on an entire opening family (e.g., "Italian Game")
 * instead of a single specific variation. Users can play any moves that exist
 * in any variation, and the tutor will guide them through the repertoire.
 */
export default function FamilyTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const familyName = decodeURIComponent(params.familyName as string);

  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('chess_tutor_language') as SupportedLanguage) || 'en';
    }
    return 'en';
  });
  const [mounted, setMounted] = useState(false);
  const [variations, setVariations] = useState<OpeningMetadata[]>([]);
  const [variationTree, setVariationTree] = useState<any>(null);
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
      return localStorage.getItem('gemini_api_key') || '';
    }
    return '';
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const t = useTranslation(language);

  const loadFamilyVariations = useCallback(() => {
    // Get all variations for this family
    const familyVariations = getOpeningsByFamily(familyName);

    if (familyVariations.length === 0) {
      // No variations found - redirect back to selection
      router.push('/learning/openings');
      return;
    }

    setVariations(familyVariations);

    // Build the variation tree for efficient lookup
    const tree = buildVariationTree(familyVariations, familyName);
    setVariationTree(tree);

    setIsLoading(false);
  }, [familyName, router]);

  useEffect(() => {
    if (mounted) {
      loadFamilyVariations();
    }
  }, [mounted, loadFamilyVariations]);

  // Create a "representative" opening for the family
  // Uses the first ECO code and combines info from all variations
  const familyOpening: OpeningMetadata | null = useMemo(() => {
    if (variations.length === 0) return null;

    // Get all unique ECO codes
    const ecoCodes = [...new Set(variations.map((v: OpeningMetadata) => v.eco))].sort();
    const ecoRange = ecoCodes.length === 1
      ? ecoCodes[0]
      : `${ecoCodes[0]}-${ecoCodes[ecoCodes.length - 1]}`;

    // Find the variation with the most moves (for the initial repertoire display)
    const longestVariation = variations[0]; // Already sorted by move count

    // Create a combined opening metadata
    return {
      eco: longestVariation.eco,
      name: familyName,
      moves: longestVariation.moves, // Use longest for display, but tree handles all
      src: 'family',
      isEcoRoot: true,
      wikipediaSlug: longestVariation.wikipediaSlug,
    };
  }, [variations, familyName]);

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

  if (!familyOpening || !variationTree) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
        <main className="flex-grow w-full flex items-center justify-center px-4">
          <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {t.learning.openingTrainer.openingNotFound}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-snug">
              No variations found for &quot;{familyName}&quot;
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
            {familyName} • {variations.length} variations
          </div>
        </div>
      </div>

      <main className="flex-grow w-full flex justify-center px-4 py-4 md:py-8">
        <div className="w-full max-w-6xl space-y-4 md:space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-tight">{familyName}</h1>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-bold">
                {variations.length} variation{variations.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>

          <OpeningTrainerErrorBoundary>
            <OpeningTrainingProvider>
              <OpeningTrainer
                opening={familyOpening}
                personality={selectedPersonality}
                apiKey={apiKey}
                language={language}
                variationTree={variationTree}
                allVariations={variations}
              />
            </OpeningTrainingProvider>
          </OpeningTrainerErrorBoundary>
        </div>
      </main>
    </div>
  );
}
