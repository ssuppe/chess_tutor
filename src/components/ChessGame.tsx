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
import { Brain, ArrowLeft, Download, Flag, AlertTriangle, X, ChevronRight, ChevronDown, MessageCircle } from "lucide-react";
import { CapturedPieces } from "./CapturedPieces";
import { detectMissedTactics, uciToSan, DetectedTactic } from "@/lib/tacticDetection";
import { upsertSavedGame } from "@/lib/savedGames";
import { useChessSounds } from "@/lib/hooks/useChessSounds";
import { TopUtilityLinks } from "./TopUtilityLinks";

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
    'p': 1,
    'n': 3,
    'b': 3,
    'r': 5,
    'q': 9,
    'k': 0
};

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function ChessGame({ gameId, initialFen, initialPgn, initialPersonality, initialColor, initialStockfishDepth, openingContext, onBack }: ChessGameProps) {
    const [game] = useState(() => new Chess(initialFen || DEFAULT_FEN));
    const [fen, setFen] = useState(initialFen || DEFAULT_FEN);
    const [stockfish, setStockfish] = useState<Stockfish | null>(null);

    // Analysis States
    const [evalP0, setEvalP0] = useState<StockfishEvaluation | null>(null);
    const [evalP2, setEvalP2] = useState<StockfishEvaluation | null>(null);

    // Opening Data
    const [openingData, setOpeningData] = useState<OpeningMetadata[]>([]);
    
    // Tactical Analysis Data
    const [latestMissedTactics, setLatestMissedTactics] = useState<DetectedTactic[] | null>(null);

    const [userMove, setUserMove] = useState<Move | null>(null);
    const [computerMove, setComputerMove] = useState<Move | null>(null);
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
    const [isMobileBoardExpanded, setIsMobileBoardExpanded] = useState(false);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [viewportHeight, setViewportHeight] = useState<number | null>(null);
    const [viewportOffset, setViewportOffset] = useState<number>(0);

    // Track actual visual viewport height and offset for keyboard awareness
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const updateViewport = () => {
            const height = window.visualViewport?.height || window.innerHeight;
            const offset = window.visualViewport?.offsetTop || 0;
            setViewportHeight(height);
            setViewportOffset(offset);
            
            // Counteract browser auto-scroll
            if (offset > 0) {
                window.scrollTo(0, 0);
            }
        };

        updateViewport();
        window.visualViewport?.addEventListener('resize', updateViewport);
        window.visualViewport?.addEventListener('scroll', updateViewport);
        window.addEventListener('resize', updateViewport);

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
    }, [game]);

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
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const boardAreaRef = useRef<HTMLDivElement>(null);
    const hasRebuiltHistoryRef = useRef(false);

    const handleJumpToBoard = () => {
        setIsMobileChatOpen(false);
        boardAreaRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

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

    const t = useTranslation(language);

    // Initialize Stockfish
    useEffect(() => {
        const sf = new Stockfish();
        setStockfish(sf);
        return () => sf.terminate();
    }, []);

    useEffect(() => {
        hasRebuiltHistoryRef.current = false;
    }, [initialPgn]);

    useEffect(() => {
        if (typeof initialStockfishDepth === 'number') {
            setStockfishDepth(initialStockfishDepth);
        }
    }, [initialStockfishDepth]);

    useEffect(() => {
        if (!initialPgn || !stockfish) return;
        if (moveHistory.length > 0 || hasRebuiltHistoryRef.current) return;

        let isCancelled = false;
        hasRebuiltHistoryRef.current = true;

        const rebuildHistoryFromPgn = async () => {
            try {
                const setupFen = initialFen || undefined;
                const parsingGame = new Chess(setupFen);
                parsingGame.loadPgn(initialPgn);
                const verboseMoves = parsingGame.history({ verbose: true });

                if (verboseMoves.length === 0) {
                    setMoveHistory([]);
                    return;
                }

                const startFen = verboseMoves[0].before;
                const replayGame = new Chess(startFen);
                const playerTurnColor = playerColor === 'white' ? 'w' : 'b';
                const rebuiltHistory: MoveHistoryItem[] = [];

                for (let i = 0; i < verboseMoves.length; i++) {
                    const move = verboseMoves[i];
                    if (move.color !== playerTurnColor) {
                        try { replayGame.move(move.lan); } catch (e) { break; }
                        continue;
                    }

                    const moveNumber = Math.floor(i / 2) + 1;
                    const fenBeforePlayerMove = replayGame.fen();
                    const evalBeforePlayerMove = await stockfish.evaluate(fenBeforePlayerMove, stockfishDepth);

                    let playerMoveResult;
                    try {
                        playerMoveResult = replayGame.move(move.lan);
                        if (!playerMoveResult) break;
                    } catch (e) { break; }

                    const fenAfterPlayerMove = replayGame.fen();
                    const evalAfterPlayerMove = await stockfish.evaluate(fenAfterPlayerMove, stockfishDepth);

                    let computerMoveSan = '';
                    let fenAfterComputerMove = fenAfterPlayerMove;
                    let evalAfterComputerMove = evalAfterPlayerMove;

                    if (i + 1 < verboseMoves.length && verboseMoves[i + 1].color !== move.color) {
                        const computerMove = verboseMoves[i + 1];
                        try {
                            const computerMoveResult = replayGame.move(computerMove.lan);
                            if (computerMoveResult) {
                                computerMoveSan = computerMoveResult.san;
                                fenAfterComputerMove = replayGame.fen();
                                evalAfterComputerMove = await stockfish.evaluate(fenAfterComputerMove, stockfishDepth);
                                i++;
                            }
                        } catch (e) {}
                    }

                    const isWhite = playerColor === 'white';
                    const evalBeforePerspective = isWhite ? evalBeforePlayerMove.score : -evalBeforePlayerMove.score;
                    const evalAfterPerspective = isWhite ? -evalAfterPlayerMove.score : evalAfterPlayerMove.score;
                    const cpLoss = evalBeforePerspective - evalAfterPerspective;

                    const bestMoveUci = evalBeforePlayerMove.bestMove;
                    const bestMoveSan = bestMoveUci ? uciToSan(fenBeforePlayerMove, bestMoveUci) : null;
                    const missedTactics = bestMoveUci ? detectMissedTactics({
                        fen: fenBeforePlayerMove,
                        playerColor,
                        playerMoveSan: playerMoveResult.san,
                        bestMoveUci,
                        cpLoss,
                    }) : undefined;

                    const currentPgn = replayGame.pgn();
                    const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                    const possibleOpenings = lookupPossibleOpenings(moveSequence, 5);

                    rebuiltHistory.push({
                        moveNumber,
                        playerMove: playerMoveResult.san,
                        playerColor,
                        fenBeforePlayerMove,
                        evalBeforePlayerMove,
                        fenAfterPlayerMove,
                        evalAfterPlayerMove,
                        computerMove: computerMoveSan || '...',
                        fenAfterComputerMove,
                        evalAfterComputerMove,
                        opening: possibleOpenings.length > 0 ? possibleOpenings[0].name : undefined,
                        move: playerMoveResult.san,
                        evalBefore: evalBeforePlayerMove.score,
                        evalAfter: evalAfterPlayerMove.score,
                        bestMove: evalBeforePlayerMove.bestMove,
                        bestMoveSan,
                        cpLoss,
                        missedTactics,
                    });
                }

                if (!isCancelled) setMoveHistory(rebuiltHistory);
            } catch (error) {
                console.error('Failed to rebuild move history from PGN', error);
                hasRebuiltHistoryRef.current = false;
            }
        };

        rebuildHistoryFromPgn();
        return () => { isCancelled = true; };
    }, [initialPgn, stockfish, playerColor, stockfishDepth, initialFen]);

    // Load Settings & Initial State
    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        const storedLang = localStorage.getItem("chess_tutor_language");

        if (storedKey) setApiKey(storedKey);
        if (storedLang) setLanguage(storedLang as SupportedLanguage);

        if (initialFen && initialFen !== game.fen()) {
            try {
                game.load(initialFen);
                setFen(initialFen);
                updateCapturedPieces();
            } catch (e) {}
        }

        if (initialPgn) {
            try {
                game.loadPgn(initialPgn);
                setFen(game.fen());
                updateCapturedPieces();
            } catch (e) {}
        }

        if (stockfish && game.history().length === 0) {
            const currentTurn = game.turn();
            const computerTurn = initialColor === 'white' ? 'b' : 'w';

            if (currentTurn === computerTurn) {
                setTimeout(() => {
                    stockfish.evaluate(game.fen(), 10).then(evalResult => {
                        const computerMoveData = {
                            from: evalResult.bestMove.substring(0, 2),
                            to: evalResult.bestMove.substring(2, 4),
                            promotion: evalResult.bestMove.length > 4 ? evalResult.bestMove.substring(4, 5) : "q"
                        };
                        makeAMove(computerMoveData);
                    }).catch(() => {});
                }, 1000);
            }
        }
    }, [initialFen, initialColor, stockfish, game, initialPgn, makeAMove, updateCapturedPieces]);

    // Save Game State on Change
    useEffect(() => {
        const saveData = {
            id: gameId,
            fen,
            language,
            selectedPersonality,
            playerColor,
            pgn: game.pgn(),
            updatedAt: Date.now(),
            evaluation: evalP0 ? {
                score: evalP0.score,
                mate: evalP0.mate,
                depth: evalP0.depth
            } : null
        };

        upsertSavedGame(saveData);
        localStorage.setItem("chess_tutor_save", JSON.stringify(saveData));
    }, [fen, language, selectedPersonality, playerColor, gameId, evalP0, game]);

    // Game Over Detection
    useEffect(() => {
        if (game.isGameOver()) {
            let result = "";
            let winner: "White" | "Black" | "Draw" = "Draw";

            if (game.isCheckmate()) {
                if (game.turn() === 'w') {
                    result = "Checkmate! You lost.";
                    winner = "Black";
                    if (playerColor === 'white') playDefeat();
                    else playVictory();
                } else {
                    result = "Checkmate! You won!";
                    winner = "White";
                    if (playerColor === 'white') playVictory();
                    else playDefeat();
                }
            } else if (game.isDraw()) {
                result = "Draw!";
                winner = "Draw";
            } else if (game.isStalemate()) {
                result = "Stalemate!";
                winner = "Draw";
            } else if (game.inCheck()) {
                playCheck();
            }

            setGameOverState({ result, winner });
        }
    }, [fen, playerColor, playDefeat, playVictory, playCheck, game]);

    // Pre-Analysis (P0)
    useEffect(() => {
        const playerTurn = playerColor === 'white' ? 'w' : 'b';
        if (stockfish && game.turn() === playerTurn && !isAnalyzing && !gameOverState) {
            stockfish.evaluate(game.fen(), stockfishDepth).then(evalResult => {
                setEvalP0(evalResult);
            }).catch(err => console.error("Pre-analysis failed:", err));
        }
    }, [playerColor, fen, stockfish, stockfishDepth, isAnalyzing, gameOverState, game]);

    function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
        if (!targetSquare || !stockfish || gameOverState) return false;
        const currentTurn = game.turn();
        const playerTurn = playerColor === 'white' ? 'w' : 'b';
        if (currentTurn !== playerTurn) return false;
        if (!evalP0) return false;

        const move = { from: sourceSquare, to: targetSquare, promotion: "q" };
        const fenP0 = game.fen();
        const moveResult = makeAMove(move);
        if (!moveResult) return false;

        setUserMove(moveResult.result);
        setComputerMove(null);
        setEvalP2(null);
        setOpeningData([]);
        setIsAnalyzing(true);
        const { newFen: fenP1 } = moveResult;

        stockfish.evaluate(fenP1, stockfishDepth).then(p1Eval => {
            const partialHistoryItem = evalP0 ? {
                moveNumber: game.moveNumber(),
                playerMove: moveResult.result.san,
                playerColor: playerColor,
                fenBeforePlayerMove: fenP0,
                evalBeforePlayerMove: evalP0,
                fenAfterPlayerMove: fenP1,
                evalAfterPlayerMove: p1Eval,
            } : null;

            setTimeout(() => {
                const computerMoveData = {
                    from: p1Eval.bestMove.substring(0, 2),
                    to: p1Eval.bestMove.substring(2, 4),
                    promotion: p1Eval.bestMove.length > 4 ? p1Eval.bestMove.substring(4, 5) : "q"
                };

                const compResult = makeAMove(computerMoveData);
                if (compResult) {
                    setComputerMove(compResult.result);
                    const { newFen: fenP2 } = compResult;

                    stockfish.evaluate(fenP2, stockfishDepth).then(p2Eval => {
                        setEvalP2(p2Eval);
                        const currentPgn = game.pgn();
                        const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                        const possibleOpenings = lookupPossibleOpenings(moveSequence, 5);
                        setOpeningData(possibleOpenings);

                        if (partialHistoryItem && evalP0) {
                            const isWhite = playerColor === 'white';
                            const evalBefore = isWhite ? evalP0.score : -evalP0.score;
                            const evalAfterPlayerMove = isWhite ? -p1Eval.score : p1Eval.score;
                            const cpLoss = evalBefore - evalAfterPlayerMove;
                            const bestMoveSan = uciToSan(fenP0, evalP0.bestMove);
                            const missedTactics = detectMissedTactics({
                                fen: fenP0,
                                playerColor,
                                playerMoveSan: moveResult.result.san,
                                bestMoveUci: evalP0.bestMove,
                                cpLoss,
                            });

                            setLatestMissedTactics(missedTactics);

                            const completeHistoryItem: MoveHistoryItem = {
                                ...partialHistoryItem,
                                computerMove: compResult.result.san,
                                fenAfterComputerMove: fenP2,
                                evalAfterComputerMove: p2Eval,
                                opening: possibleOpenings.length > 0 ? possibleOpenings[0].name : undefined,
                                move: playerMoveResult.san,
                                evalBefore: evalP0.score,
                                evalAfter: p1Eval.score,
                                bestMove: evalP0.bestMove,
                                bestMoveSan,
                                cpLoss,
                                missedTactics,
                            };
                            setMoveHistory(prev => [...prev, completeHistoryItem]);
                        }
                        setIsAnalyzing(false);
                    }).catch(() => setIsAnalyzing(false));
                } else setIsAnalyzing(false);
            }, 500);
        }).catch(() => setIsAnalyzing(false));

        return true;
    }

    const checkAndMakeComputerMove = useCallback(() => {
        if (!stockfish || gameOverState || isAnalyzing) return;
        const currentTurn = game.turn();
        const computerTurn = playerColor === 'white' ? 'b' : 'w';

        if (currentTurn === computerTurn) {
            setIsAnalyzing(true);
            const currentFen = game.fen();
            stockfish.evaluate(currentFen, stockfishDepth).then(evalResult => {
                const computerMoveData = {
                    from: evalResult.bestMove.substring(0, 2),
                    to: evalResult.bestMove.substring(2, 4),
                    promotion: evalResult.bestMove.length > 4 ? evalResult.bestMove.substring(4, 5) : "q"
                };

                const compResult = makeAMove(computerMoveData);
                if (compResult) {
                    setComputerMove(compResult.result);
                    stockfish.evaluate(compResult.newFen, stockfishDepth).then(p2Eval => {
                        setEvalP2(p2Eval);
                        const currentPgn = game.pgn();
                        const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                        const possibleOpenings = lookupPossibleOpenings(moveSequence, 5);
                        setOpeningData(possibleOpenings);
                        setIsAnalyzing(false);
                    }).catch(() => setIsAnalyzing(false));
                } else setIsAnalyzing(false);
            }).catch(() => setIsAnalyzing(false));
        }
    }, [stockfish, gameOverState, isAnalyzing, playerColor, stockfishDepth, makeAMove, game]);

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
        <>
            <div 
                className={clsx(
                    "flex-grow transition-all duration-300",
                    isMobileChatOpen 
                        ? "fixed top-0 left-0 right-0 z-[100] bg-white dark:bg-gray-900 flex flex-row p-0 m-0 w-full overflow-hidden" 
                        : "grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 w-full max-w-6xl mx-auto p-2 md:p-4 transition-all duration-300"
                )}
                style={isMobileChatOpen ? { 
                    height: viewportHeight ? `${viewportHeight}px` : '100dvh',
                    top: `${viewportOffset}px`,
                    willChange: 'height, top'
                } : {}}
            >


                {/* 1. Slim Navigation Row - Hidden in mobile chat mode */}
                <div className={clsx(
                    "md:col-span-3 flex justify-between items-center py-0 px-1",
                    isMobileChatOpen && "hidden md:flex"
                )}>
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1 px-2 py-0.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-bold transition-all"
                        aria-label={t.game.backToMenu}
                    >
                        &lt; {t.game.backToMenu}
                    </button>
                    <TopUtilityLinks language={language} showExternalLinks={false} />
                </div>

                {/* 2. Board Area (Left Part of Mobile Horizontal Split) */}
                <div 
                    data-testid="board-area"
                    data-keyboard={isKeyboardVisible}
                    ref={boardAreaRef} 
                    className={clsx(
                        "md:col-span-2 bg-white dark:bg-gray-800 p-1 md:p-4 rounded-lg shadow-lg flex flex-col md:flex-row gap-2 md:gap-8 relative overflow-hidden",
                        isMobileChatOpen ? "w-[35%] h-full rounded-none border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 items-center justify-center gap-4 py-4 px-1" : "md:relative md:h-auto transition-all duration-300"
                    )}
                    onClick={() => isMobileChatOpen && setIsMobileChatOpen(false)}
                >
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
                            "bg-[#779954] p-[2px] rounded-sm",
                            isMobileChatOpen ? "w-full aspect-square shadow-sm" : "w-full aspect-square transition-all duration-300"
                        )}>
                            <Chessboard options={{ position: fen, onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop({ sourceSquare, targetSquare }), darkSquareStyle: { backgroundColor: '#779954' }, lightSquareStyle: { backgroundColor: '#e9edcc' }, animationDurationInMs: 200, boardOrientation: playerColor, allowDragging: !isMobileChatOpen, squareStyles: lastMoveHighlight }} />
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
                </div>

                {/* 3. Tutor (Right Part of Mobile Horizontal Split) */}
                <div 
                    data-testid="tutor-container"
                    className={clsx(
                        "md:col-span-1 md:h-auto z-40 overflow-hidden flex flex-col",
                        isMobileChatOpen ? "flex-1 h-full" : "translate-y-full md:translate-y-0 fixed inset-x-0 bottom-0 md:relative md:inset-auto transition-all duration-300",
                    )}
                >
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
                    />
                </div>

                {/* Unified Mobile Floating Action Button */}
                <button
                    onClick={() => setIsMobileChatOpen(!isMobileChatOpen)}
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

                {/* 4. History (Col 1-3) - Full width at bottom */}
                <div className={clsx(
                    "md:col-span-3 bg-white dark:bg-gray-800 p-1.5 md:p-2 px-3 md:px-4 rounded-lg shadow-lg flex flex-col transition-all duration-300",
                    isMobileChatOpen && "hidden md:flex"
                )}>
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
        </>
    );
}
