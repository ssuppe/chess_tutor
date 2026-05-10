"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Stockfish, StockfishEvaluation } from "@/lib/stockfish";
import { Tutor } from "./Tutor";
import { EvaluationBar } from "./EvaluationBar";
import { Personality } from "@/lib/personalities";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { lookupOpening, lookupPossibleOpenings, extractMoveSequenceFromPGN, OpeningMetadata } from "@/lib/openings";
import { GameAnalysisModal } from "./GameAnalysisModal";
import { GameOverModal, MoveHistoryItem } from "./GameOverModal";
import { Brain, ArrowLeft, Download, Flag, AlertTriangle, X, ChevronRight, ChevronDown } from "lucide-react";
import { CapturedPieces } from "./CapturedPieces";
import { detectMissedTactics, uciToSan, DetectedTactic } from "@/lib/tacticDetection";
import { upsertSavedGame } from "@/lib/savedGames";
import { useChessSounds } from "@/lib/hooks/useChessSounds";

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
    const [game] = useState(() => {
        const g = new Chess(initialFen || DEFAULT_FEN);
        if (initialPgn) {
            try {
                g.loadPgn(initialPgn);
            } catch (e) {
                console.error("Failed to load initial PGN:", e);
            }
        }
        return g;
    });
    const [fen, setFen] = useState(() => game.fen());
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
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(() => {
        if (typeof window !== "undefined") return localStorage.getItem("gemini_api_key");
        return null;
    });
    const [stockfishDepth, setStockfishDepth] = useState(initialStockfishDepth ?? 15);

    // Settings
    const [language, setLanguage] = useState<SupportedLanguage>(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("chess_tutor_language");
            return (stored as SupportedLanguage) || 'en';
        }
        return 'en';
    });

    // Game State
    const [playerColor, setPlayerColor] = useState<'white' | 'black'>(initialColor);
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
        boardAreaRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Chess sounds hook
    const { playMoveSound, playCheck, playVictory, playDefeat } = useChessSounds();

    // Removed auto-scroll to prevent page jumping when moves are added
    // Users can manually scroll to see move history if needed

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
                if (move.color === 'w') { // White moved, captured a black piece. So a black piece was lost.
                    blackPiecesLost.push(move.captured);
                    blackLostScore += PIECE_VALUES[move.captured] || 0;
                } else { // Black moved, captured a white piece. So a white piece was lost.
                    whitePiecesLost.push(move.captured);
                    whiteLostScore += PIECE_VALUES[move.captured] || 0;
                }
            }
        });

        setCapturedWhitePieces(whitePiecesLost);
        setCapturedBlackPieces(blackPiecesLost);
        setMaterialScore({ white: whiteLostScore, black: blackLostScore });
    }, []);

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

    const rebuildHistoryFromPgn = useCallback(async () => {
        if (!initialPgn || !stockfish) return;
        if (moveHistory.length > 0 || hasRebuiltHistoryRef.current) return;

        hasRebuiltHistoryRef.current = true;

        try {
            const setupFen = initialFen || undefined;
            const parsingGame = new Chess(setupFen);
            parsingGame.loadPgn(initialPgn);
            const verboseMoves = parsingGame.history({ verbose: true });

            if (verboseMoves.length === 0) {
                setMoveHistory([]);
                return;
            }

            // Initialize from the actual starting position of this move sequence
            const startFen = verboseMoves[0].before;
            const replayGame = new Chess(startFen);
            const playerTurnColor = playerColor === 'white' ? 'w' : 'b';
            const rebuiltHistory: MoveHistoryItem[] = [];

            for (let i = 0; i < verboseMoves.length; i++) {
                const move = verboseMoves[i];

                // Play through opponent moves until it's the player's turn
                if (move.color !== playerTurnColor) {
                    try {
                        replayGame.move(move.lan);
                    } catch (e) {
                        console.error("Invalid opponent move in history:", move.lan, e);
                        break;
                    }
                    continue;
                }

                const moveNumber = Math.floor(i / 2) + 1;
                const fenBeforePlayerMove = replayGame.fen();
                const evalBeforePlayerMove = await stockfish.evaluate(fenBeforePlayerMove, stockfishDepth);

                let playerMoveResult;
                try {
                    playerMoveResult = replayGame.move(move.lan);
                    if (!playerMoveResult) break;
                } catch (e) {
                    console.error("Invalid player move in history:", move.lan, e);
                    break;
                }

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
                            i++; // Skip the computer move we just processed
                        }
                    } catch (e) {
                        console.error("Invalid computer move in history:", computerMove.lan, e);
                        // We don't break here, we just stop processing this specific computer move
                    }
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
                    evalAfter: evalAfterComputerMove.score,
                    bestMove: evalBeforePlayerMove.bestMove,
                    bestMoveSan,
                    cpLoss,
                    missedTactics,
                });
            }

            setMoveHistory(rebuiltHistory);
        } catch (error) {
            console.error('Failed to rebuild move history from PGN', error);
            hasRebuiltHistoryRef.current = false;
        }
    }, [initialFen, initialPgn, playerColor, stockfish, stockfishDepth]);

    useEffect(() => {
        rebuildHistoryFromPgn();
    }, [rebuildHistoryFromPgn]);

    // Game Initialization & Sync
    useEffect(() => {
        // If initialFen is provided, ensure game is synced
        if (initialFen && initialFen !== game.fen()) {
            try {
                game.load(initialFen);
                setFen(initialFen);
                updateCapturedPieces(); // Update captured pieces for loaded game
            } catch (e) {
                console.error("Failed to load initial FEN:", e);
            }
        }

        // Note: initialPgn is already loaded in the state initializer

        // Update captured pieces for loaded game
        updateCapturedPieces();
    }, [initialFen, game, updateCapturedPieces]);

    // Initial computer move detection
    useEffect(() => {
        if (stockfish && game.history().length === 0) {
            // No moves have been made yet - check whose turn it is
            const currentTurn = game.turn(); // 'w' or 'b'
            const computerTurn = initialColor === 'white' ? 'b' : 'w';

            if (currentTurn === computerTurn) {
                console.log('[ChessGame] Initial position - computer\'s turn, making move...');
                // Small delay to ensure stockfish is ready
                const timer = setTimeout(() => {
                    stockfish.evaluate(game.fen(), 10).then(evalResult => {
                        const computerMoveData = {
                            from: evalResult.bestMove.substring(0, 2),
                            to: evalResult.bestMove.substring(2, 4),
                            promotion: evalResult.bestMove.length > 4 ? evalResult.bestMove.substring(4, 5) : "q"
                        };
                        makeAMove(computerMoveData);
                    }).catch(err => {
                        console.error('[ChessGame] Failed to make initial computer move:', err);
                    });
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [stockfish, initialColor, game, makeAMove]);

    // Save Game State on Change
    useEffect(() => {
        const saveData = {
            id: gameId,
            fen,
            language,
            selectedPersonality,
            playerColor, // Save player color too
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

        // Check if it's the player's turn
        const currentTurn = game.turn(); // 'w' or 'b'
        const playerTurn = playerColor === 'white' ? 'w' : 'b';

        if (currentTurn !== playerTurn) {
            // Not the player's turn - prevent move
            return false;
        }

        // Wait for pre-analysis (evalP0) to be available before allowing moves
        // This ensures we can properly track move history with evaluations
        if (!evalP0) {
            console.log("Waiting for position analysis before move...");
            return false;
        }

        const move = {
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
        };

        // Capture FEN BEFORE player's move (P0)
        const fenP0 = game.fen();

        // 1. User Move (P0 -> P1)
        const moveResult = makeAMove(move);

        if (!moveResult) return false;

        setUserMove(moveResult.result);

        // Reset Computer State
        setComputerMove(null);
        setEvalP2(null);
        setOpeningData([]);

        setIsAnalyzing(true);
        const { newFen: fenP1 } = moveResult;

        // 2. Bot Move (P1 -> P2)
        stockfish.evaluate(fenP1, stockfishDepth).then(p1Eval => {
            // Store partial history data if evalP0 is available
            const partialHistoryItem = evalP0 ? {
                moveNumber: game.moveNumber(),
                playerMove: moveResult.result.san,
                playerColor: playerColor,
                fenBeforePlayerMove: fenP0,
                evalBeforePlayerMove: evalP0,
                fenAfterPlayerMove: fenP1,
                evalAfterPlayerMove: p1Eval,
            } : null;

            // Computer should ALWAYS move, even if evalP0 is missing
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

                    // 3. Post-Eval (P2)
                    stockfish.evaluate(fenP2, stockfishDepth).then(p2Eval => {
                        setEvalP2(p2Eval);

                        // 4. Opening Lookup - Get multiple possible openings
                        const currentPgn = game.pgn();
                        const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                        const possibleOpenings = lookupPossibleOpenings(moveSequence, 5);
                        setOpeningData(possibleOpenings);

                        // 5. Complete the history item with computer's move data (only if we have evalP0)
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

                            // Store the latest tactics for the Tutor component
                            setLatestMissedTactics(missedTactics);

                            const completeHistoryItem: MoveHistoryItem = {
                                ...partialHistoryItem,
                                computerMove: compResult.result.san,
                                fenAfterComputerMove: fenP2,
                                evalAfterComputerMove: p2Eval,
                                opening: possibleOpenings.length > 0 ? possibleOpenings[0].name : undefined,
                                // Legacy fields for backward compatibility
                                move: moveResult.result.san,
                                evalBefore: evalP0.score,
                                evalAfter: p1Eval.score,
                                bestMove: evalP0.bestMove,
                                bestMoveSan,
                                cpLoss,
                                missedTactics,
                            };
                            setMoveHistory(prev => [...prev, completeHistoryItem]);
                        } else {
                            console.warn("Skipping move history - evalP0 was not available when player moved");
                        }

                        setIsAnalyzing(false);
                    }).catch(err => {
                        console.error("P2 analysis failed:", err);
                        setIsAnalyzing(false);
                    });
                } else {
                    setIsAnalyzing(false);
                }
            }, 500);
        }).catch(err => {
            console.error("Bot move analysis failed:", err);
            setIsAnalyzing(false);
        });

        return true;
    }

    // Check if computer needs to move (safety net for race conditions)
    const checkAndMakeComputerMove = useCallback(() => {
        if (!stockfish || gameOverState || isAnalyzing) return;

        const currentTurn = game.turn();
        const computerTurn = playerColor === 'white' ? 'b' : 'w';

        // If it's the computer's turn and we're not already analyzing, make a move
        if (currentTurn === computerTurn) {
            console.log("Safety check: Computer's turn detected, making move...");
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
                    const { newFen } = compResult;

                    // Evaluate the position after computer's move
                    stockfish.evaluate(newFen, stockfishDepth).then(p2Eval => {
                        setEvalP2(p2Eval);
                        const currentPgn = game.pgn();
                        const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                        const possibleOpenings = lookupPossibleOpenings(moveSequence, 5);
                        setOpeningData(possibleOpenings);
                        setIsAnalyzing(false);
                    }).catch(err => {
                        console.error("Post-computer-move analysis failed:", err);
                        setIsAnalyzing(false);
                    });
                } else {
                    setIsAnalyzing(false);
                }
            }).catch(err => {
                console.error("Computer move evaluation failed:", err);
                setIsAnalyzing(false);
            });
        }
    }, [stockfish, gameOverState, isAnalyzing, playerColor, stockfishDepth, makeAMove]);

    const handleNewGame = () => {
        // Reset game to initial props or just reload?
        // For now, let's just reset the board
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
            try {
                evaluation = await stockfish.evaluate(currentFen, stockfishDepth);
            } catch (error) {
                console.error("Failed to evaluate resignation position", error);
            }
        }

        const result = t.game.resignation;
        const winner = playerColor === 'white' ? 'Black' : 'White' as const;

        setGameOverState({
            result,
            winner,
        });

        setResignationContext({
            trigger: Date.now(),
            fen: currentFen,
            evaluation,
            history: moveHistory,
            result,
            winner,
        });
    }, [moveHistory, playerColor, stockfish, stockfishDepth, t.game.resignation]);

    const handleResignCancel = useCallback(() => {
        setShowResignConfirm(false);
    }, []);

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

    // Determine material advantage
    // If Black lost more value, White has advantage
    const whiteAdvantage = materialScore.black - materialScore.white;
    const blackAdvantage = materialScore.white - materialScore.black;

    const [showStrengthSlider, setShowStrengthSlider] = useState(false);
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

    const handleAnalysisComplete = useCallback(() => {
        setIsAnalyzing(false);
    }, []);

    return (
        <>
            <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 w-full max-w-6xl mx-auto p-4">


                {/* 1. Slim Navigation Row */}
                <div className="md:col-span-3 flex justify-between items-center py-1 px-1">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
                        aria-label={t.game.backToMenu}
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">{t.game.backToMenu}</span>
                    </button>
                </div>

                {/* 2. Board Area (Col 1-2) */}
                <div ref={boardAreaRef} className="md:col-span-2 bg-white dark:bg-gray-800 p-2 md:p-4 rounded-lg shadow-lg flex flex-col md:flex-row gap-2 md:gap-8 relative">
                    {/* Mobile Eval Bar (Horizontal) - Moved to top */}
                    <div className="md:hidden w-full">
                        <EvaluationBar
                            score={isAnalyzing ? null : evalP0?.score}
                            mate={isAnalyzing ? null : evalP0?.mate}
                            isPlayerWhite={playerColor === 'white'}
                            orientation="horizontal"
                        />
                    </div>

                    {/* Desktop Eval Bar (Vertical) */}
                    <div className="hidden md:block h-[560px]">
                        <EvaluationBar
                            score={isAnalyzing ? null : evalP0?.score}
                            mate={isAnalyzing ? null : evalP0?.mate}
                            isPlayerWhite={playerColor === 'white'}
                            orientation="vertical"
                        />
                    </div>

                    <div className="flex-1 flex flex-col gap-1">
                        {/* Board Controls - Moved to top */}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <div className="relative">
                                <button
                                    onClick={() => setShowStrengthSlider(!showStrengthSlider)}
                                    className="hover:text-gray-700 dark:hover:text-gray-200 underline decoration-dotted underline-offset-2"
                                >
                                    {t.game.stockfishLevel}: {stockfishDepth}
                                </button>
                                {showStrengthSlider && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-700 p-3 rounded shadow-xl border border-gray-200 dark:border-gray-600 z-10">
                                        <label className="block text-xs font-bold mb-1 text-gray-700 dark:text-gray-200">
                                            {t.game.stockfishStrength} ({t.game.depth}: {stockfishDepth})
                                        </label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="20"
                                            value={stockfishDepth}
                                            onChange={(e) => setStockfishDepth(parseInt(e.target.value))}
                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        game.undo();
                                        game.undo();
                                        setFen(game.fen());
                                        setUserMove(null);
                                        setComputerMove(null);
                                        setEvalP0(null);
                                        setEvalP2(null);
                                        setOpeningData([]);
                                        updateCapturedPieces();
                                    }}
                                    className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    disabled={!!gameOverState}
                                >
                                    <ArrowLeft size={12} /> {t.game.undoMove}
                                </button>

                                <button
                                    onClick={handleResignClick}
                                    className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                                    disabled={!!gameOverState}
                                >
                                    <Flag size={12} /> {t.game.resign}
                                </button>
                            </div>
                        </div>

                        {/* Opponent's Captured Pieces (Top) */}
                        <div className="h-6">
                            <CapturedPieces
                                captured={playerColor === 'white' ? capturedWhitePieces : capturedBlackPieces}
                                color={playerColor === 'white' ? 'w' : 'b'}
                                score={playerColor === 'white' ? (blackAdvantage > 0 ? blackAdvantage : null) : (whiteAdvantage > 0 ? whiteAdvantage : null)}
                            />
                        </div>

                        <div className="bg-[#779954] p-[2px] rounded-sm">
                            <Chessboard
                                options={{
                                    position: fen,
                                    onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop({ sourceSquare, targetSquare }),
                                    darkSquareStyle: { backgroundColor: '#779954' },
                                    lightSquareStyle: { backgroundColor: '#e9edcc' },
                                    animationDurationInMs: 200,
                                    boardOrientation: playerColor
                                }}
                            />
                        </div>

                        {/* Player's Captured Pieces (Bottom) */}
                        <div className="h-6">
                            <CapturedPieces
                                captured={playerColor === 'white' ? capturedBlackPieces : capturedWhitePieces}
                                color={playerColor === 'white' ? 'b' : 'w'}
                                score={playerColor === 'white' ? (whiteAdvantage > 0 ? whiteAdvantage : null) : (blackAdvantage > 0 ? blackAdvantage : null)}
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Tutor (Col 3) - Side by side with Board on Desktop */}
                <div className="md:col-span-1 h-[400px] md:h-auto">
                    {/* Note: We rely on Tutor's internal height styling or pass a class.
                         The Tutor component has 'h-[400px] md:h-full'.
                         Since it's in a grid cell that might stretch, 'h-full' should work if the row has height.
                         However, the Board Area defines the row height.
                     */}
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
                        onJumpToBoard={handleJumpToBoard}
                    />
                </div>

                {/* 4. History (Col 1-3) - Full width at bottom */}
                <div className="md:col-span-3 bg-white dark:bg-gray-800 p-1.5 md:p-2 px-3 md:px-4 rounded-lg shadow-lg flex flex-col transition-all duration-300">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                            className="flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 p-0.5 px-1 rounded-md transition-colors"
                        >
                            {isHistoryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.game.gameHistory}</h3>
                            {!isHistoryExpanded && moveHistory.length > 0 && (
                                <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1 py-0 rounded-full font-bold">
                                    {moveHistory.length}
                                </span>
                            )}
                        </button>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowDownloadModal(true)}
                                className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded hover:bg-green-200 dark:bg-green-900 dark:text-green-200 flex items-center gap-1"
                            >
                                <Download size={10} /> {t.game.download}
                            </button>
                            <button
                                onClick={() => setShowAnalysisModal(true)}
                                className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200 flex items-center gap-1"
                            >
                                <Brain size={10} /> {t.game.analyze}
                            </button>
                        </div>
                    </div>

                    {isHistoryExpanded && (
                        <div className="mt-1.5 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 p-1.5 max-h-40">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-0.5 px-2 w-10">#</th>
                                        <th className="py-0.5 px-2">{t.game.white}</th>
                                        <th className="py-0.5 px-2">{t.game.black}</th>
                                        <th className="py-0.5 px-2 text-center w-20">{t.game.evalChange}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {moveHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-2 text-center text-gray-500 italic">
                                                {t.game.noMovesYet}
                                            </td>
                                        </tr>
                                    ) : (
                                        moveHistory.map((item, idx) => {
                                            // Calculate evaluation change for player's move
                                            const evalBefore = item.evalBeforePlayerMove.score ?? 0;
                                            const evalAfter = item.evalAfterPlayerMove.score ?? 0;
                                            const evalChange = evalAfter - evalBefore;

                                            // Determine color based on evaluation change
                                            // Positive change = good for white, negative = good for black
                                            let evalColor = 'text-gray-500';
                                            if (Math.abs(evalChange) > 50) {
                                                if (item.playerColor === 'white') {
                                                    evalColor = evalChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                                                } else {
                                                    evalColor = evalChange < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                                                }
                                            }

                                            const evalDisplay = evalChange > 0 ? `+${(evalChange / 100).toFixed(1)}` : (evalChange / 100).toFixed(1);

                                            return (
                                                <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                    <td className="py-0.5 px-2 text-gray-500 dark:text-gray-500">{item.moveNumber}.</td>
                                                    <td className="py-0.5 px-2 font-medium text-gray-900 dark:text-gray-200">
                                                        {item.playerColor === 'white' ? item.playerMove : item.computerMove}
                                                    </td>
                                                    <td className="py-0.5 px-2 font-medium text-gray-900 dark:text-gray-200">
                                                        {item.playerColor === 'black' ? item.playerMove : item.computerMove}
                                                    </td>
                                                    <td className={`py-0.5 px-2 text-center font-mono text-[10px] ${evalColor}`}>
                                                        {evalDisplay}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            </div>

            {showAnalysisModal && (
                <GameAnalysisModal
                    fen={fen}
                    stockfish={stockfish}
                    apiKey={apiKey}
                    language={language}
                    onClose={() => setShowAnalysisModal(false)}
                />
            )}

            {gameOverState && (
                <GameOverModal
                    result={gameOverState.result}
                    winner={gameOverState.winner}
                    history={moveHistory}
                    apiKey={apiKey}
                    language={language}
                    onClose={() => setGameOverState(null)}
                    onNewGame={handleNewGame}
                    onAnalyze={() => {
                        setGameOverState(null);
                        setShowAnalysisModal(true);
                    }}
                />
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

            {/* Resign Confirmation Modal */}
            {showResignConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        {/* Header */}
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

                        {/* Content */}
                        <div className="px-6 py-5">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-600 dark:text-gray-300">
                                    {t.game.resignConfirm}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
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
