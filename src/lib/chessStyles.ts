/**
 * Shared styles and helpers for Chessboard square highlighting.
 */

import { Move } from "chess.js";

/**
 * Lichess-style highlight for the last move origin and destination.
 * Uses an inset box shadow to ensure it renders on top of opaque square backgrounds.
 */
export const MOVE_HIGHLIGHT_STYLE = { 
    boxShadow: "inset 0 0 0 4px rgba(255, 255, 0, 0.75)" 
};

/**
 * Standard colors for the chessboard theme.
 */
export const CHESSBOARD_THEME = {
    darkSquare: '#779954',
    lightSquare: '#e9edcc',
    animationDuration: 200,
};

/**
 * Returns a style object mapping the origin and destination squares 
 * of a move to the standard highlight style.
 * Supports:
 * - Move object from chess.js
 * - Object with { from, to } strings
 * - UCI string (e.g. "e2e4")
 */
export function getMoveHighlight(move: { from: string, to: string } | Move | string | null) {
    if (!move) return {};

    let from: string;
    let to: string;

    if (typeof move === "string") {
        if (move.length < 4) return {};
        from = move.substring(0, 2);
        to = move.substring(2, 4);
    } else {
        from = move.from;
        to = move.to;
    }
    
    if (!from || !to) return {};

    return {
        [from]: MOVE_HIGHLIGHT_STYLE,
        [to]: MOVE_HIGHLIGHT_STYLE,
    };
}
