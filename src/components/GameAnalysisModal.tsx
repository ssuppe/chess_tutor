"use client";

import { useState, useEffect } from "react";
import { Stockfish, StockfishEvaluation } from "@/lib/stockfish";
import { OpeningMetadata, lookupOpening } from "@/lib/openings";
import { getGenAIModel } from "@/lib/gemini";
import { Loader2, X, Brain, Trophy, AlertTriangle } from "lucide-react";
import { SupportedLanguage } from "@/lib/i18n/translations";

interface GameAnalysisModalProps {
    fen: string;
    stockfish: Stockfish | null;
    apiKey: string | null;
    language: SupportedLanguage;
    onClose: () => void;
}

export function GameAnalysisModal({ fen, stockfish, apiKey, language, onClose }: GameAnalysisModalProps) {
    const [evaluation, setEvaluation] = useState<StockfishEvaluation | null>(null);
    const [opening, setOpening] = useState<OpeningMetadata | null>(null);
    const [summary, setSummary] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const analyze = async () => {
            setIsLoading(true);
            try {
                // 1. Stockfish Evaluation
                let evalResult: StockfishEvaluation | null = null;
                if (stockfish) {
                    evalResult = await stockfish.evaluate(fen, 15); // Quick depth
                    setEvaluation(evalResult);
                }

                // 2. Opening Lookup
                const openingData = lookupOpening(fen);
                setOpening(openingData);

                // 3. LLM Summary
                if (apiKey && evalResult) {
                    const model = getGenAIModel(apiKey);
                    const evalInPawns = (evalResult.score / 100).toFixed(2);
                    const prompt = `
You are a Chess Grandmaster Analyst.
Analyze this position for the user.

DATA:
- FEN: ${fen}
- Evaluation: ${evalInPawns} pawns (${evalResult.score} centipawns)
  Note: Positive = White advantage, Negative = Black advantage
  100 centipawns = 1 pawn
- Mate in: ${evalResult.mate ?? "N/A"}
- Best Move: ${evalResult.bestMove}
- Opening: ${openingData ? `${openingData.name} (${openingData.eco})` : "Unknown/Midgame"}

INSTRUCTIONS:
1. Summarize who is winning and why (based on score). Use the pawn value (e.g., "White is up 2.5 pawns" not "250 centipawns").
2. Identify the key strategic factors (space, piece activity, king safety).
3. Mention the opening if relevant.
4. Keep it concise (max 3-4 sentences).
5. Respond in ${language.toUpperCase()}.

OUTPUT FORMAT:
Plain text paragraph.
                    `;

                    const result = await model.generateContent(prompt);
                    setSummary(result.response.text());
                } else if (!apiKey) {
                    setSummary("Please provide an API Key to get an AI summary.");
                }
            } catch (e) {
                console.error("Analysis failed:", e);
                setSummary("Failed to generate analysis.");
            } finally {
                setIsLoading(false);
            }
        };

        analyze();
    }, [fen, stockfish, apiKey, language]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-3 px-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-gray-900 dark:text-white uppercase tracking-wider">
                        <Brain className="text-purple-600" size={16} />
                        Game Analysis
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-3">
                            <Loader2 className="animate-spin text-purple-600" size={32} />
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Analyzing position...</p>
                        </div>
                    ) : (
                        <>
                            {/* Evaluation Score */}
                            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none mb-1">Evaluation</p>
                                    <p className={`text-xl font-bold leading-none ${(evaluation?.score || 0) > 0 ? "text-green-600" : (evaluation?.score || 0) < 0 ? "text-red-600" : "text-gray-600"
                                        }`}>
                                        {evaluation?.mate
                                            ? `Mate in ${evaluation.mate}`
                                            : `${(evaluation?.score || 0) > 0 ? "+" : ""}${(evaluation?.score || 0) / 100}`}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none mb-1">Best Move</p>
                                    <p className="text-lg font-mono font-bold text-gray-900 dark:text-white leading-none">
                                        {evaluation?.bestMove}
                                    </p>
                                </div>
                            </div>

                            {/* Opening Info */}
                            {opening && (
                                <div className="p-3 border border-blue-100 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-900/30 rounded-lg">
                                    <h3 className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest leading-none mb-1.5">Opening Identified</h3>
                                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{opening.name} ({opening.eco})</p>
                                </div>
                            )}

                            {/* AI Summary */}
                            <div>
                                <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none mb-2 flex items-center gap-1.5">
                                    <Trophy size={12} className="text-yellow-500" />
                                    Coach's Summary
                                </h3>
                                <div className="p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/20 rounded-lg text-sm text-gray-800 dark:text-gray-200 leading-snug">
                                    {summary}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                {/* Footer/Action */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md hover:bg-blue-700 transition-all active:scale-95"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
