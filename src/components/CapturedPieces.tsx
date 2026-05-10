import React, { memo, useMemo } from 'react';
import clsx from "clsx";

interface CapturedPiecesProps {
    captured: string[]; // Array of piece types, e.g., ['p', 'n', 'q']
    color: 'w' | 'b'; // The color of the pieces (to display the correct icon)
    score?: number | null; // Material advantage, e.g., +2
}

const PIECE_ICONS: Record<string, string> = {
    'p': '♟',
    'n': '♞',
    'b': '♝',
    'r': '♜',
    'q': '♛',
    'k': '♚', // King is never captured, but for completeness
};

const sortOrder = ['q', 'r', 'b', 'n', 'p'];

/**
 * Displays captured pieces with optional material advantage score.
 * Memoized to prevent unnecessary re-renders.
 */
export const CapturedPieces = memo(function CapturedPieces({ captured, color, score }: CapturedPiecesProps) {
    // Memoize sorted pieces to prevent recalculation on every render
    const sortedPieces = useMemo(
        () => [...captured].sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b)),
        [captured]
    );

    return (
        <div className="flex items-center h-6 gap-2">
            <div className={clsx(
                "flex -space-x-1.5 text-xl leading-none select-none px-2 py-1 rounded shadow-sm border",
                color === 'w' 
                    ? "bg-gray-800 border-gray-700 dark:bg-gray-950 dark:border-gray-900" // High-contrast dark tray for white pieces
                    : "bg-blue-50 border-blue-200 dark:bg-blue-100 dark:border-blue-300" // Distinct light blue tray for black pieces
            )}>
                {sortedPieces.map((piece, index) => (
                    <span 
                        key={index} 
                        className={clsx(
                            "transition-colors",
                            color === 'w' 
                                ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" 
                                : "text-gray-900 drop-shadow-[0_1px_0px_rgba(255,255,255,0.5)]"
                        )}
                    >
                        {PIECE_ICONS[piece.toLowerCase()] || piece}
                    </span>
                ))}
            </div>
            {score && score > 0 && (
                <span className={clsx(
                    "text-[10px] font-black px-1.5 py-0.5 rounded border shadow-sm tabular-nums",
                    color === 'w'
                        ? "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700"
                        : "bg-blue-200 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800"
                )}>
                    +{score}
                </span>
            )}
        </div>
    );
});
