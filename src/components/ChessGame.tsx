"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Stockfish, StockfishEvaluation } from "@/lib/stockfish";
import { Tutor } from "./Tutor";
import clsx from "clsx";
import { EvaluationBar } from "./EvaluationBar";
import { Personality } from "@/lib/personalities";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { lookupOpening, lookupPossibleOpenings, extractMoveSequenceFromPGN, OpeningMetadata } from "@/lib/openings";
import { GameAnalysisModal } from "./GameAnalysisModal";
import { GameOverModal, MoveHistoryItem } from "./GameOverModal";
import { Brain, ArrowLeft, Download, Flag, AlertTriangle, X, ChevronRight, ChevronDown, MessageCircle, Loader2 } from "lucide-react";
import { CapturedPieces } from "./CapturedPieces";
import { detectMissedTactics, uciToSan, DetectedTactic } from "@/lib/tacticDetection";
import { upsertSavedGame } from "@/lib/savedGames";
import { useChessSounds } from "@/lib/hooks/useChessSounds";
import { TopUtilityLinks } from "./TopUtilityLinks";
import { BoardViewLayout } from "./BoardViewLayout";
import ReactMarkdown from "react-markdown";

interface ChessGameProps {
    gameId: string;
    initialFen?: string;
    initialPgn?: string;
    initialPersonality: Personality;
    initialColor: 'white' | 'black';
    initialStockfishDepth?: number;
    openingContext?: {
        openingName: string;
        openingEco: string;
        movesCompleted: number;
        wikipediaSummary?: string;
        contextMessage: string;
    };
    onBack: () => void;
}

const PIECE_VALUES: Record<string, number> = {
    p: 100, n: 300, b: 300, r: 500, q: 900
};

export default function ChessGame({ 
    gameId, 
    initialFen, 
    initialPgn,
    initialPersonality,
    initialColor = 'white', 
    initialStockfishDepth,
    openingContext: initialOpeningContext,
    onBack 
}: ChessGameProps) {
    const [game] = useState(() => new Chess(initialFen));
    const [fen, setFen] = useState(game.fen());
    const [userMove, setUserMove] = useState<Move | null>(null);
    const [computerMove, setComputerMove] = useState<Move | null>(null);
    const [stockfish, setStockfish] = useState<Stockfish | null>(null);
    const [isEngineReady, setIsEngineReady] = useState(false);
    const [evalP0, setEvalP0] = useState<StockfishEvaluation | null>(null);
    const [evalP2, setEvalP2] = useState<StockfishEvaluation | null>(null);
    const [openingData, setOpeningData] = useState<OpeningMetadata[]>([]);
    const [latestMissedTactics, setLatestMissedTactics] = useState<DetectedTactic[]>([]);
    const [openingContext, setOpeningContext] = useState(initialOpeningContext || null);
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
    const [isMobileBoardExpanded, setIsMobileBoardExpanded] = useState(false);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [viewportHeight, setViewportHeight] = useState<number | null>(null);
    const [viewportOffset, setViewportOffset] = useState<number>(0);
    const [latestCoachMessage, setLatestCoachMessage] = useState<string | null>(null);

    // Track visual viewport for stable mobile layout
    useEffect(() => {
        const updateViewport = () => {
            if (window.visualViewport) {
                setViewportHeight(window.visualViewport.height);
                setViewportOffset(window.visualViewport.offsetTop);
            }
        };

        window.visualViewport?.addEventListener('resize', updateViewport);
        window.visualViewport?.addEventListener('scroll', updateViewport);
        window.addEventListener('resize', updateViewport);
        updateViewport();

        return () => {
            window.visualViewport?.removeEventListener('resize', updateViewport);
            window.visualViewport?.removeEventListener('scroll', updateViewport);
            window.removeEventListener('resize', updateViewport);
        };
    }, []);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [stockfishDepth, setStockfishDepth] = useState(initialStockfishDepth ?? 15);

    // Lock body scroll and mute global keyboard padding when mobile chat is open
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (isMobileChatOpen) {
                document.body.style.overflow = 'hidden';
                document.body.style.overscrollBehavior = 'none';
                document.documentElement.style.setProperty('--keyboard-height', '0px');
            } else {
                document.body.style.overflow = '';
                document.body.style.overscrollBehavior = '';
            }
        }
        return () => { 
            if (typeof window !== 'undefined') {
                document.body.style.overflow = '';
                document.body.style.overscrollBehavior = '';
            }
        };
    }, [isMobileChatOpen]);

    const lastMoveHighlight = useMemo(() => {
        const history = game.history({ verbose: true });
        if (history.length === 0) return {};
        const lastMove = history[history.length - 1];
        return {
            [lastMove.from]: { boxShadow: 'inset 0 0 0 4px rgba(255, 255, 0, 0.75)' },
            [lastMove.to]: { boxShadow: 'inset 0 0 0 4px rgba(255, 255, 0, 0.75)' }
        };
    }, [game, fen]);

    // Settings
    const [language, setLanguage] = useState<SupportedLanguage>('en');

    // Game State
    const [playerColor, setPlayerColor] = useState<'white' | 'black'>(initialColor);
    const [showStrengthSlider, setShowStrengthSlider] = useState(false);
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [showResignConfirm, setShowResignConfirm] = useState(false);
    const [gameOverState, setGameOverState] = useState<{ result: string, winner: "White" | "Black" | "Draw" } | null>(null);
    const [moveHistory, setMoveHistory] = useState<MoveHistoryItem[]>([]);
    const [selectedPersonality, setSelectedPersonality] = useState<Personality>(initialPersonality);
    const [resignationContext, setResignationContext] = useState<{
        trigger: number;
        fen: string;
        evaluation: StockfishEvaluation | null;
        history: MoveHistoryItem[];
        result: string;
        winner: "White" | "Black" | "Draw";
    } | null>(null);
    const boardAreaRef = useRef<HTMLDivElement>(null);
    const hasRebuiltHistoryRef = useRef(false);

    // Chess sounds hook
    const { playMoveSound, playCheck, playVictory, playDefeat } = useChessSounds();

    // Captured Pieces State
    const [capturedWhitePieces, setCapturedWhitePieces] = useState<string[]>([]);
    const [capturedBlackPieces, setCapturedBlackPieces] = useState<string[]>([]);
    const [materialScore, setMaterialScore] = useState<{ white: number, black: number }>({ white: 0, black: 0 });

    const updateCapturedPieces = useCallback(() => {
        const history = game.history({ verbose: true });
        const whitePiecesLost: string[] = [];
        const blackPiecesLost: string[] = [];
        let whiteLostScore = 0;
        let blackLostScore = 0;

        history.forEach(move => {
            if (move.captured) {
                if (move.color === 'w') {
                    blackPiecesLost.push(move.captured);
                    blackLostScore += PIECE_VALUES[move.captured] || 0;
                } else {
                    whitePiecesLost.push(move.captured);
                    whiteLostScore += PIECE_VALUES[move.captured] || 0;
                }
            }
        });

        setCapturedWhitePieces(whitePiecesLost);
        setCapturedBlackPieces(blackPiecesLost);
        setMaterialScore({ white: whiteLostScore, black: blackLostScore });
    }, [game]);

    const makeAMove = useCallback(
        (move: { from: string; to: string; promotion?: string }) => {
            try {
                const result = game.move(move);

                if (result) {
                    const newFen = game.fen();
                    setFen(newFen);
                    updateCapturedPieces();
                    playMoveSound(!!result.captured);

                    return { result, newFen };
                }
            } catch (e) {
                return null;
            }
            return null;
        },
        [game, updateCapturedPieces, playMoveSound]
    );

    // Initialize Stockfish
    useEffect(() => {
        const sf = new Stockfish(() => setIsEngineReady(true));
        setStockfish(sf);

        const storedKey = localStorage.getItem("gemini_api_key");
        const storedLang = localStorage.getItem("chess_tutor_language");
        if (storedKey) setApiKey(storedKey);
        if (storedLang) setLanguage(storedLang as SupportedLanguage);

        return () => {
            sf.terminate();
        };
    }, []);

    // Load initial PGN if provided (for resuming games)
    useEffect(() => {
        if (initialPgn && !hasRebuiltHistoryRef.current) {
            hasRebuiltHistoryRef.current = true;
            try {
                game.loadPgn(initialPgn);
                const history = game.history({ verbose: true });
                
                const newMoveHistory: MoveHistoryItem[] = [];
                for (let i = 0; i < history.length; i += 2) {
                    newMoveHistory.push({
                        playerMove: history[i].san,
                        computerMove: history[i+1]?.san || '...'
                    });
                }
                setMoveHistory(newMoveHistory);
                setFen(game.fen());
                updateCapturedPieces();

                const moveSequence = extractMoveSequenceFromPGN(initialPgn);
                const opening = lookupOpening(moveSequence);
                if (opening && !openingContext) {
                    setOpeningContext({ 
                        openingName: opening.name, 
                        openingEco: opening.eco,
                        movesCompleted: Math.floor(history.length / 2),
                        contextMessage: `You've played the ${opening.name}. Let's continue!`
                    });
                }
            } catch (e) {
                console.error("Failed to load initial PGN:", e);
            }
        }
    }, [initialPgn, game, updateCapturedPieces, openingContext]);

    // Handle Game Over Check
    useEffect(() => {
        if (game.isGameOver()) {
            let result = "";
            let winner: "White" | "Black" | "Draw" = "Draw";

            if (game.isCheckmate()) {
                result = "Checkmate";
                winner = game.turn() === "w" ? "Black" : "White";
                playVictory();
            } else if (game.isDraw()) {
                result = "Draw";
            } else if (game.isStalemate()) {
                result = "Stalemate";
            } else if (game.isThreefoldRepetition()) {
                result = "Threefold Repetition";
            }

            setGameOverState({ result, winner });
        } else if (game.inCheck()) {
            playCheck();
        }
    }, [fen, game, playCheck, playVictory]);

    const checkAndMakeComputerMove = useCallback(async () => {
        if (!stockfish || game.isGameOver() || game.turn() === (playerColor === 'white' ? 'w' : 'b')) return;

        setIsAnalyzing(true);
        const currentFen = game.fen();
        
        const p0 = await stockfish.evaluate(currentFen, stockfishDepth);
        setEvalP0(p0);

        const tactics = await detectMissedTactics({
            fen: currentFen,
            playerColor: playerColor,
            playerMoveSan: userMove?.san || '',
            bestMoveUci: p0.bestMove,
        });
        setLatestMissedTactics(tactics);

        const bestMove = await stockfish.getBestMove(currentFen, stockfishDepth);
        const result = makeAMove({
            from: bestMove.slice(0, 2),
            to: bestMove.slice(2, 4),
            promotion: bestMove.length === 5 ? bestMove[4] : undefined
        });

        if (result) {
            setComputerMove(result.result);
            
            const moveSequence = game.history().join(' ');
            const possible = lookupPossibleOpenings(moveSequence, 5);
            setOpeningData(possible);

            const p2 = await stockfish.evaluate(result.newFen, stockfishDepth);
            setEvalP2(p2);
            
            setMoveHistory(prev => {
                const newHistory = [...prev];
                if (newHistory.length > 0 && newHistory[newHistory.length - 1].computerMove === '...') {
                    newHistory[newHistory.length - 1].computerMove = result.result.san;
                }
                return newHistory;
            });

            upsertSavedGame({
                id: gameId,
                fen: result.newFen,
                pgn: game.pgn(),
                playerColor,
                selectedPersonality,
                updatedAt: Date.now(),
                evaluation: p2,
                language
            });
        }
        setIsAnalyzing(false);
    }, [game, gameId, makeAMove, playerColor, stockfish, stockfishDepth, selectedPersonality, language, userMove]);

    // Save Game State on Change
    useEffect(() => {
        const saveData = {
            id: gameId,
            fen,
            pgn: game.pgn(),
            playerColor,
            selectedPersonality,
            updatedAt: Date.now(),
            evaluation: evalP2,
            language
        };
        upsertSavedGame(saveData);
    }, [gameId, fen, playerColor, selectedPersonality, evalP2, language, game]);

    // Trigger analysis on mount or reset
    useEffect(() => {
        if (stockfish && isEngineReady && !gameOverState && !isAnalyzing && moveHistory.length === 0) {
            const runInitialEval = async () => {
                setIsAnalyzing(true);
                try {
                    const p0 = await stockfish.evaluate(fen, stockfishDepth);
                    setEvalP0(p0);
                } catch (e) {}
                setIsAnalyzing(false);
            };
            runInitialEval();
        }
    }, [stockfish, isEngineReady, gameOverState, stockfishDepth]);

    async function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) {
        if (game.isGameOver() || game.turn() !== (playerColor === 'white' ? 'w' : 'b')) return false;

        const moveData = {
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
        };

        const result = makeAMove(moveData);
        if (result) {
            setUserMove(result.result);
            setMoveHistory(prev => [...prev, { playerMove: result.result.san, computerMove: '...' }]);
            checkAndMakeComputerMove();
            return true;
        }
        return false;
    }

    const t = useTranslation(language);

    const handleNewGame = () => {
        game.reset();
        setFen(game.fen());
        setGameOverState(null);
        setMoveHistory([]);
        setUserMove(null);
        setComputerMove(null);
        setEvalP0(null);
        setEvalP2(null);
        setOpeningData([]);
        setResignationContext(null);
        updateCapturedPieces();
    };

    const handleResignClick = useCallback(() => {
        if (gameOverState) return;
        setShowResignConfirm(true);
    }, [gameOverState]);

    const handleResignConfirm = useCallback(async () => {
        setShowResignConfirm(false);
        setIsAnalyzing(false);

        const currentFen = game.fen();
        let evaluation: StockfishEvaluation | null = null;
        if (stockfish) {
            try { evaluation = await stockfish.evaluate(currentFen, stockfishDepth); } catch (error) {}
        }

        const result = t.game.resignation;
        const winner = playerColor === 'white' ? 'Black' : 'White' as const;
        setGameOverState({ result, winner });
        setResignationContext({ trigger: Date.now(), fen: currentFen, evaluation, history: moveHistory, result, winner });
    }, [moveHistory, playerColor, stockfish, stockfishDepth, t.game.resignation]);

    const handleResignCancel = useCallback(() => setShowResignConfirm(false), []);

    const handleDownloadPGN = () => {
        const pgn = game.pgn();
        const blob = new Blob([pgn], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chess-game-${Date.now()}.pgn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowDownloadModal(false);
    };

    const handleDownloadFEN = () => {
        const fen = game.fen();
        const blob = new Blob([fen], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chess-position-${Date.now()}.fen`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowDownloadModal(false);
    };

    const whiteAdvantage = materialScore.black - materialScore.white;
    const blackAdvantage = materialScore.white - materialScore.black;

    const handleAnalysisComplete = useCallback(() => setIsAnalyzing(false), []);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            <BoardViewLayout
                language={language}
                onBack={onBack}
                isMobileChatOpen={isMobileChatOpen}
                isMobileBoardExpanded={isMobileBoardExpanded}
                setIsMobileBoardExpanded={setIsMobileBoardExpanded}
                viewportHeight={viewportHeight ?? undefined}
                viewportOffset={viewportOffset}
                boardArea={
                    <>
                        {/* Top Cluster: Opponent Material + Eval Bar (Mobile Chat Mode only) */}
                        {isMobileChatOpen && (
                            <div className="w-full flex flex-col items-center gap-2 flex-shrink-0 scale-90">
                                <CapturedPieces 
                                    captured={playerColor === 'white' ? capturedWhitePieces : capturedBlackPieces} 
                                    color={playerColor === 'white' ? 'w' : 'b'} 
                                    score={playerColor === 'white' ? (blackAdvantage > 0 ? blackAdvantage : null) : (whiteAdvantage > 0 ? whiteAdvantage : null)} 
                                />
                                
                                <div className="w-full h-3">
                                    <EvaluationBar 
                                        score={isAnalyzing ? null : evalP0?.score} 
                                        mate={isAnalyzing ? null : evalP0?.mate} 
                                        isPlayerWhite={playerColor === 'white'} 
                                        orientation="horizontal" 
                                    />
                                </div>
                            </div>
                        )}

                        {/* Mobile Advice Strip (When chat is closed) */}
                        {!isMobileChatOpen && latestCoachMessage && (
                            <div className="md:hidden w-full px-2 py-1.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/30 rounded-lg animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-sm leading-none">{selectedPersonality.image}</span>
                                    <span className="text-[8px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-widest">Advice</span>
                                </div>
                                <div className="prose prose-sm dark:prose-invert text-[11px] leading-tight line-clamp-2 text-gray-700 dark:text-gray-300">
                                    <ReactMarkdown>{latestCoachMessage}</ReactMarkdown>
                                </div>
                            </div>
                        )}

                        <div className={clsx(
                            "md:hidden w-full transition-opacity duration-200",
                            isMobileChatOpen ? "hidden" : "block"
                        )}>
                            <EvaluationBar score={isAnalyzing ? null : evalP0?.score} mate={isAnalyzing ? null : evalP0?.mate} isPlayerWhite={playerColor === 'white'} orientation="horizontal" />
                        </div>

                        <div className={clsx(
                            "hidden md:block h-[560px]",
                            isMobileChatOpen && "md:block"
                        )}>
                            <EvaluationBar score={isAnalyzing ? null : evalP0?.score} mate={isAnalyzing ? null : evalP0?.mate} isPlayerWhite={playerColor === 'white'} orientation="vertical" />
                        </div>

                        <div className={clsx(
                            "flex flex-col gap-1 transition-all duration-300 w-full justify-center items-center",
                            isMobileChatOpen ? "h-auto flex-shrink" : "flex-1 h-full transition-all duration-300"
                        )}>
                            {!isMobileChatOpen && (
                                <>
                                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 w-full">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <button onClick={() => setShowStrengthSlider(!showStrengthSlider)} className="hover:text-gray-700 dark:hover:text-gray-200 underline decoration-dotted underline-offset-2">
                                                    {t.game.stockfishLevel}: {stockfishDepth}
                                                </button>
                                                {showStrengthSlider && (
                                                    <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-700 p-3 rounded shadow-xl border border-gray-200 dark:border-gray-600 z-10">
                                                        <label className="block text-xs font-bold mb-1 text-gray-700 dark:text-gray-200">{t.game.stockfishStrength} ({t.game.depth}: {stockfishDepth})</label>
                                                        <input type="range" min="1" max="20" value={stockfishDepth} onChange={(e) => setStockfishDepth(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => { game.undo(); game.undo(); setFen(game.fen()); setUserMove(null); setComputerMove(null); setEvalP0(null); setEvalP2(null); setOpeningData([]); updateCapturedPieces(); }} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" disabled={!!gameOverState}><ArrowLeft size={12} /> {t.game.undoMove}</button>
                                            <button onClick={handleResignClick} className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors" disabled={!!gameOverState}><Flag size={12} /> {t.game.resign}</button>
                                        </div>
                                    </div>
                                    <div className="h-6 w-full flex justify-start">
                                        <CapturedPieces 
                                            captured={playerColor === 'white' ? capturedWhitePieces : capturedBlackPieces} 
                                            color={playerColor === 'white' ? 'w' : 'b'} 
                                            score={playerColor === 'white' ? (blackAdvantage > 0 ? blackAdvantage : null) : (whiteAdvantage > 0 ? whiteAdvantage : null)} 
                                        />
                                    </div>
                                </>
                            )}

                            <div className={clsx(
                                "bg-[#779954] p-[2px] rounded-sm relative overflow-hidden",
                                isMobileChatOpen ? "w-full aspect-square shadow-sm" : "w-full aspect-square transition-all duration-300"
                            )}>
                                {!isEngineReady && (
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1.5px] rounded-sm animate-in fade-in duration-500">
                                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-gray-100 dark:border-gray-700 transform animate-in zoom-in slide-in-from-bottom-4 duration-500">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-blue-400/20 blur-xl rounded-full animate-pulse" />
                                                <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin relative z-10" />
                                            </div>
                                            <div className="flex flex-col items-center text-center">
                                                <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Engine Booting</span>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest opacity-80">Stockfish is warming up...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <Chessboard options={{ position: fen, onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop({ sourceSquare, targetSquare }), darkSquareStyle: { backgroundColor: '#779954' }, lightSquareStyle: { backgroundColor: '#e9edcc' }, animationDurationInMs: 200, boardOrientation: playerColor, allowDragging: !isMobileChatOpen && isEngineReady, squareStyles: lastMoveHighlight }} />
                            </div>

                            {!isMobileChatOpen && (
                                <div className="h-6 w-full flex justify-start">
                                    <CapturedPieces 
                                        captured={playerColor === 'white' ? capturedBlackPieces : capturedWhitePieces} 
                                        color={playerColor === 'white' ? 'b' : 'w'} 
                                        score={playerColor === 'white' ? (whiteAdvantage > 0 ? whiteAdvantage : null) : (blackAdvantage > 0 ? blackAdvantage : null)} 
                                    />
                                </div>
                            )}
                        </div>

                        {/* Bottom Cluster: Last Move + Player Material (Mobile Chat Mode only) */}
                        {isMobileChatOpen && (
                            <div className="w-full flex flex-col items-center gap-2 flex-shrink-0 scale-90">
                                {moveHistory.length > 0 && (
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium italic">
                                        Last move ({
                                            moveHistory[moveHistory.length - 1].computerMove !== '...' 
                                                ? (playerColor === 'white' ? 'Black' : 'White') 
                                                : (playerColor === 'white' ? 'White' : 'Black')
                                        }): <span className="font-black not-italic text-gray-800 dark:text-gray-200">{
                                            moveHistory[moveHistory.length - 1].computerMove !== '...' 
                                                ? moveHistory[moveHistory.length - 1].computerMove 
                                                : moveHistory[moveHistory.length - 1].playerMove
                                        }</span>
                                    </div>
                                )}
                                <CapturedPieces 
                                    captured={playerColor === 'white' ? capturedBlackPieces : capturedWhitePieces} 
                                    color={playerColor === 'white' ? 'b' : 'w'} 
                                    score={playerColor === 'white' ? (whiteAdvantage > 0 ? whiteAdvantage : null) : (blackAdvantage > 0 ? blackAdvantage : null)} 
                                />
                            </div>
                        )}

                        {isMobileChatOpen && !isKeyboardVisible && (
                            <div className="absolute bottom-1 left-0 right-0 text-center text-[7px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
                                Live Game
                            </div>
                        )}
                    </>
                }
                sidePanel={
                    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-800">
                        <div className="flex-1 overflow-hidden">
                            <Tutor
                                game={game}
                                currentFen={fen}
                                userMove={userMove}
                                computerMove={computerMove}
                                stockfish={stockfish}
                                evalP0={evalP0}
                                evalP2={evalP2}
                                openingData={openingData}
                                missedTactics={latestMissedTactics}
                                onAnalysisComplete={handleAnalysisComplete}
                                apiKey={apiKey}
                                personality={selectedPersonality}
                                language={language}
                                playerColor={playerColor}
                                onCheckComputerMove={checkAndMakeComputerMove}
                                resignationContext={resignationContext}
                                openingContext={openingContext}
                                onJumpToBoard={() => setIsMobileChatOpen(false)}
                                onChatFocus={() => setIsKeyboardVisible(true)}
                                onChatBlur={() => setIsKeyboardVisible(false)}
                                onLatestMessage={setLatestCoachMessage}
                                isResumed={moveHistory.length > 0}
                                isMobileChatOpen={isMobileChatOpen}
                            />
                        </div>
                    </div>
                }
            />

            {/* Unified Mobile Floating Action Button */}
            <button
                onClick={() => {
                    if (isMobileChatOpen) setIsMobileBoardExpanded(false);
                    setIsMobileChatOpen(!isMobileChatOpen);
                }}
                    aria-label={isMobileChatOpen ? "Close Chat" : "Open Chat"}
                    className={clsx(
                        "fixed right-4 z-[110] md:hidden transition-all duration-500 shadow-2xl",
                        "flex items-center gap-2 px-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800",
                        isMobileChatOpen ? "bottom-40 scale-90 opacity-90" : "bottom-24 scale-100 opacity-100"
                    )}
                >
                    {isMobileChatOpen ? (
                        <>
                            <X size={18} className="text-red-500 dark:text-red-400" />
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-tight">Close</span>
                        </>
                    ) : (
                        <>
                            <div className="text-xl leading-none">{selectedPersonality.image}</div>
                            <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">Coach Chat</span>
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                        </>
                    )}
                </button>

            {/* History Bar - Hidden when chat is open on mobile */}
            {!isMobileChatOpen && (
                <div className="max-w-6xl mx-auto px-2 md:p-4 mt-2">
                    <div className="bg-white dark:bg-gray-800 p-1.5 md:p-2 px-3 md:px-4 rounded-lg shadow-lg flex flex-col transition-all duration-300">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                                className="flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 p-0.5 px-1 rounded-md transition-colors"
                            >
                                {isHistoryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.game.gameHistory}</h3>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAnalysisModal && (
                <GameAnalysisModal fen={fen} stockfish={stockfish} apiKey={apiKey} language={language} onClose={() => setShowAnalysisModal(false)} />
            )}

            {gameOverState && (
                <GameOverModal result={gameOverState.result} winner={gameOverState.winner} history={moveHistory} apiKey={apiKey} language={language} onClose={() => setGameOverState(null)} onNewGame={handleNewGame} onAnalyze={() => { setGameOverState(null); setShowAnalysisModal(true); }} />
            )}

            {showDownloadModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {t.analysis.downloadTitle}
                            </h2>
                            <button
                                onClick={() => setShowDownloadModal(false)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <button
                                onClick={handleDownloadPGN}
                                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
                                {t.analysis.downloadPGN}
                            </button>
                            <button
                                onClick={handleDownloadFEN}
                                className="w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
                                {t.analysis.downloadFEN}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showResignConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="bg-red-50 dark:bg-red-900/20 px-6 py-4 border-b border-red-100 dark:border-red-900/30">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-full">
                                        <Flag className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                        {t.game.resign}?
                                    </h2>
                                </div>
                                <button
                                    onClick={handleResignCancel}
                                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-600 dark:text-gray-300">
                                    {t.game.resignConfirm}
                                </p>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
                            <button
                                onClick={handleResignCancel}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                            >
                                {t.common.cancel}
                            </button>
                            <button
                                onClick={handleResignConfirm}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm transition-colors flex items-center gap-2"
                            >
                                <Flag size={16} />
                                {t.game.resign}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
