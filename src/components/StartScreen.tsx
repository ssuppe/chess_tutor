"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, ChevronDown, ChevronUp, Brain, Trash2, BarChart2, GraduationCap } from "lucide-react";
import { Personality, PERSONALITIES } from "@/lib/personalities";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { TopUtilityLinks } from "./TopUtilityLinks";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { detectChessFormat, ChessFormat } from "@/lib/chessFormatDetector";
import Header from "./Header";
import { SavedGame } from "@/lib/savedGames";
import { Chessboard } from "react-chessboard";
import { CHESSBOARD_THEME } from "@/lib/chessStyles";

interface StartScreenProps {
    onStartGame: (options: {
        personality: Personality;
        color: 'white' | 'black' | 'random';
        fen?: string;
        pgn?: string;
    }) => void;
    onResumeGame: (game: SavedGame) => void;
    savedGames: SavedGame[];
    onDeleteSavedGame: (id: string) => void;
}

export default function StartScreen({ onStartGame, onResumeGame, savedGames, onDeleteSavedGame }: StartScreenProps) {
    const router = useRouter();
    const [language, setLanguage] = useState<SupportedLanguage>(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("chess_tutor_language") as SupportedLanguage) || "en";
        }
        return "en";
    });
    const [showNewGameOptions, setShowNewGameOptions] = useState(false);
    const [importInput, setImportInput] = useState("");
    const [detectedFormat, setDetectedFormat] = useState<ChessFormat | null>(null);
    const [colorSelection, setColorSelection] = useState<'white' | 'black' | 'random'>('white');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [gameToDelete, setGameToDelete] = useState<string | null>(null);
    const hasSavedGames = savedGames.length > 0;

    useEffect(() => {
        setMounted(true);
    }, []);

    const t = useTranslation(language);

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setGameToDelete(id);
    };

    const confirmDelete = () => {
        if (gameToDelete) {
            onDeleteSavedGame(gameToDelete);
            setGameToDelete(null);
        }
    };

    const handleImportChange = (value: string) => {
        setImportInput(value);
        const format = detectChessFormat(value);
        setDetectedFormat(format);
    };

    const handleNewGame = (personality: Personality) => {
        const trimmedInput = importInput.trim();
        const format = trimmedInput ? detectChessFormat(trimmedInput) : null;

        onStartGame({
            personality,
            color: colorSelection,
            fen: format === 'fen' ? trimmedInput : undefined,
            pgn: format === 'pgn' ? trimmedInput : undefined
        });
    };

    const sortedSavedGames = useMemo(
        () => [...savedGames].sort((a, b) => b.updatedAt - a.updatedAt),
        [savedGames]
    );

    const formatEvaluation = (game: SavedGame) => {
        if (!game.evaluation) return t.start.noEvaluation;

        if (game.evaluation.mate !== null && game.evaluation.mate !== undefined) {
            const movesToMate = Math.abs(game.evaluation.mate);
            const side = game.evaluation.mate > 0 ? t.game.white : t.game.black;
            return `${side} #${movesToMate}`;
        }

        if (typeof game.evaluation.score === 'number') {
            const score = game.playerColor === 'black'
                ? -(game.evaluation.score || 0)
                : (game.evaluation.score || 0);
            const display = (score / 100).toFixed(2);
            return `${score >= 0 ? '+' : ''}${display}`;
        }

        return t.start.noEvaluation;
    };



    if (!mounted) return null;

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            <div className="flex-grow p-3 md:p-8 flex flex-col items-center justify-center relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <TopUtilityLinks language={language} />
                    <button
                        onClick={() => router.push("/settings")}
                        className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                        title={t.start.settings}
                    >
                        <Settings size={20} />
                    </button>
                </div>

                <h1 className="text-3xl md:text-4xl font-bold mb-6 md:mb-10 text-gray-800 dark:text-white tracking-tight">
                    {t.start.title}
                </h1>

                <div className="bg-white dark:bg-gray-800 p-4 md:p-8 rounded-2xl shadow-xl max-w-2xl w-full space-y-4 md:space-y-6">
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2">
                            {t.start.startGame}
                        </h2>

                        <div className="space-y-4">
                            {/* Start New Game Button - Always visible at top */}
                            <div>
                                <button
                                    onClick={() => setShowNewGameOptions(!showNewGameOptions)}
                                    className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                                >
                                    <Brain size={16} />
                                    {t.start.startNewGame}
                                </button>
                            </div>

                            {/* Unfinished Games Section */}
                            {hasSavedGames && !showNewGameOptions && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                            {t.start.savedGamesTitle}
                                        </h3>
                                    </div>

                                    {sortedSavedGames.length === 0 && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                                            {t.start.savedGamesEmpty}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {sortedSavedGames.map(game => (
                                            <div
                                                key={game.id}
                                                onClick={() => onResumeGame(game)}
                                                className="group relative bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-300 shadow-sm transition-all cursor-pointer"
                                            >
                                                <div className="absolute top-1.5 right-1.5 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-opacity z-10">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // Navigate to analysis with this game's PGN
                                                            if (game.pgn) {
                                                                localStorage.setItem('chess_t_pending_analysis', game.pgn);
                                                            }
                                                            router.push('/analysis');
                                                        }}
                                                        aria-label={t.start.analyzeThisGame}
                                                        className="p-1.5 rounded-full bg-white dark:bg-gray-800 text-gray-500 hover:text-purple-600 shadow-sm border border-gray-100 dark:border-gray-600"
                                                    >
                                                        <BarChart2 size={12} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteClick(e, game.id)}
                                                        aria-label={t.start.deleteGame}
                                                        className="p-1.5 rounded-full bg-white dark:bg-gray-800 text-gray-500 hover:text-red-600 shadow-sm border border-gray-100 dark:border-gray-600"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>

                                                <div className={`p-[1.5px] rounded-sm max-w-[120px] mx-auto sm:max-w-none`} style={{ backgroundColor: CHESSBOARD_THEME.darkSquare }}>
                                                    <Chessboard
                                                        options={{
                                                            position: game.fen,
                                                            boardOrientation: game.playerColor,
                                                            allowDragging: false,
                                                            darkSquareStyle: { backgroundColor: CHESSBOARD_THEME.darkSquare },
                                                            lightSquareStyle: { backgroundColor: CHESSBOARD_THEME.lightSquare },
                                                            animationDurationInMs: CHESSBOARD_THEME.animationDuration,
                                                            boardStyle: { width: '100%', aspectRatio: '1' }
                                                        }}
                                                    />
                                                </div>

                                                <div className="mt-2 flex items-start justify-between gap-2 text-xs">
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-base">{game.selectedPersonality.image}</span>
                                                            <div className="font-semibold text-gray-900 dark:text-white truncate max-w-[80px]">{game.selectedPersonality.name}</div>
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                                            vs {game.playerColor === 'white' ? t.game.black : t.game.white}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500">{t.start.evaluationLabel}</div>
                                                        <div className="font-bold text-gray-900 dark:text-white text-[11px]">{formatEvaluation(game)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* New Game Options */}
                            {showNewGameOptions && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                    {/* Color Selection */}
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">
                                            {t.start.colorSelection}
                                        </label>
                                        <div className="grid grid-cols-3 gap-3">
                                            <button
                                                onClick={() => setColorSelection('white')}
                                                className={`py-2 px-2 rounded-xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1 ${colorSelection === 'white'
                                                    ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                                                    }`}
                                            >
                                                <span className="text-2xl">♔</span> {t.start.playAsWhite}
                                            </button>
                                            <button
                                                onClick={() => setColorSelection('black')}
                                                className={`py-2 px-2 rounded-xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1 ${colorSelection === 'black'
                                                    ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                                                    }`}
                                            >
                                                <span className="text-2xl">♚</span> {t.start.playAsBlack}
                                            </button>
                                            <button
                                                onClick={() => setColorSelection('random')}
                                                className={`py-2 px-2 rounded-xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1 ${colorSelection === 'random'
                                                    ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                                                    }`}
                                            >
                                                <span className="text-2xl">🎲</span> {t.start.randomColor}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Personality Grid */}
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">
                                            {t.start.chooseCoach}
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {PERSONALITIES.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => handleNewGame(p)}
                                                    className="group relative bg-gray-50 dark:bg-gray-700 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-all border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 shadow-sm text-left flex items-start gap-3"
                                                >
                                                    <div className="text-3xl shrink-0 group-hover:scale-110 transition-transform">{p.image}</div>
                                                    <div>
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">{p.name}</h3>
                                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight line-clamp-2">{p.description}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Advanced Options (Accordion) */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                        <button
                                            onClick={() => setShowAdvanced(!showAdvanced)}
                                            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                                        >
                                            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            Advanced Options
                                        </button>

                                        {showAdvanced && (
                                            <div className="mt-3 animate-in fade-in slide-in-from-top-2 space-y-2">
                                                <label className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-1">
                                                    {t.start.importPosition}
                                                </label>
                                                <textarea
                                                    placeholder={t.start.importPositionPlaceholder}
                                                    value={importInput}
                                                    onChange={(e) => handleImportChange(e.target.value)}
                                                    className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-[11px] focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[60px]"
                                                    rows={3}
                                                />

                                                {/* Format Detection Indicator */}
                                                {importInput && (
                                                    <div className="text-[10px] font-bold uppercase tracking-tight">
                                                        {detectedFormat === 'fen' && (
                                                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                {t.start.formatDetected} {t.start.formatFen}
                                                            </span>
                                                        )}
                                                        {detectedFormat === 'pgn' && (
                                                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                {t.start.formatDetected} {t.start.formatPgn}
                                                            </span>
                                                        )}
                                                        {detectedFormat === 'invalid' && (
                                                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                                {t.start.formatInvalid}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setShowNewGameOptions(false)}
                                        className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors uppercase font-bold tracking-widest"
                                    >
                                        {t.common.cancel}
                                    </button>
                                </div>
                            )}

                            {/* Mode Links Section */}
                            {!showNewGameOptions && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100 dark:border-gray-700 pt-6">
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                            {t.start.analyzeGame}
                                        </p>
                                        <button
                                            onClick={() => router.push("/analysis")}
                                            className="w-full py-3 px-4 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Brain size={16} />
                                            {t.start.analyzeGame}
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                            {t.start.learningArea}
                                        </p>
                                        <button
                                            onClick={() => router.push("/learning")}
                                            className="w-full py-3 px-4 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-semibold shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                                        >
                                            <GraduationCap size={16} />
                                            {t.start.learningArea}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {gameToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-100 dark:border-gray-700 animate-in zoom-in slide-in-from-bottom-4 duration-300">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                                <Trash2 size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {t.common.deleteConfirmTitle}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {t.common.deleteConfirmMessage}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 w-full pt-2">
                                <button
                                    onClick={() => setGameToDelete(null)}
                                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                                >
                                    {t.common.cancel}
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-4 py-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 shadow-md transition-colors text-sm"
                                >
                                    {t.common.delete}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
