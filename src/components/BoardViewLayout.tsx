"use client";

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SupportedLanguage } from '@/lib/i18n/translations';
import { TopUtilityLinks } from './TopUtilityLinks';

interface BoardViewLayoutProps {
    // Basic config
    language: SupportedLanguage;
    onBack: () => void;
    
    // Layout State
    isMobileChatOpen: boolean;
    isMobileBoardExpanded: boolean;
    setIsMobileBoardExpanded: (expanded: boolean) => void;
    
    // Viewport State (Managed by parent or layout)
    viewportHeight?: number;
    viewportOffset?: number;
    
    // Slots
    boardArea: React.ReactNode;
    sidePanel: React.ReactNode;
    
    // Optional Header additions
    headerActions?: React.ReactNode;
    
    // Custom container classes
    containerClassName?: string;
}

export const BoardViewLayout: React.FC<BoardViewLayoutProps> = ({
    language,
    onBack,
    isMobileChatOpen,
    isMobileBoardExpanded,
    setIsMobileBoardExpanded,
    viewportHeight,
    viewportOffset,
    boardArea,
    sidePanel,
    headerActions,
    containerClassName
}) => {
    const t = useTranslation(language);

    return (
        <div 
            className={clsx(
                "flex-grow transition-all duration-300",
                isMobileChatOpen 
                    ? "fixed top-0 left-0 right-0 z-[100] bg-white dark:bg-gray-900 flex flex-row p-0 m-0 w-full overflow-hidden" 
                    : "grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 w-full max-w-6xl mx-auto p-2 md:p-4 transition-all duration-300",
                containerClassName
            )}
            style={isMobileChatOpen ? { 
                height: viewportHeight ? `${viewportHeight}px` : '100dvh',
                top: `${viewportOffset}px`,
                willChange: 'height, top'
            } : {}}
        >
            {/* 1. Navigation Row - Hidden in mobile chat mode */}
            {!isMobileChatOpen && (
                <div className="md:col-span-3 flex justify-between items-center py-0 px-1">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1 px-2 py-0.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-bold transition-all"
                        aria-label={t.game.backToMenu}
                    >
                        &lt; {t.game.backToMenu}
                    </button>
                    <div className="flex items-center gap-2">
                        {headerActions}
                        <TopUtilityLinks language={language} showExternalLinks={false} />
                    </div>
                </div>
            )}

            {/* 2. Board Area */}
            <div 
                data-testid="board-area"
                className={clsx(
                    "md:col-span-2 bg-white dark:bg-gray-800 p-1 md:p-4 rounded-lg shadow-lg flex flex-col md:flex-row gap-2 md:gap-8 relative overflow-hidden transition-all duration-300",
                    isMobileChatOpen 
                        ? (isMobileBoardExpanded ? "w-[55%]" : "w-[35%]") 
                        : "md:relative md:h-auto",
                    isMobileChatOpen && "h-full rounded-none border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 items-center justify-center gap-4 py-4 px-1"
                )}
                onClick={() => isMobileChatOpen && setIsMobileBoardExpanded(!isMobileBoardExpanded)}
            >
                {/* Interaction Overlay for resizing on mobile */}
                {isMobileChatOpen && (
                    <div className="absolute inset-0 z-10 cursor-pointer" aria-hidden="true" />
                )}
                {boardArea}
            </div>

            {/* 3. Side Panel (Chat/Analysis) */}
            <div 
                data-testid="tutor-container"
                className={clsx(
                "md:col-span-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300",
                isMobileChatOpen ? "flex-grow h-full rounded-none" : "min-h-[400px] md:h-[560px]"
            )}>
                {sidePanel}
            </div>
        </div>
    );
};
