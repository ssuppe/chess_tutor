"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move } from "chess.js";

import { Personality } from "@/lib/personalities";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { lookupPossibleOpenings, extractMoveSequenceFromPGN, OpeningMetadata } from "@/lib/openings";
import { DetectedTactic } from "@/lib/tacticDetection";
import { buildMoveHistoryItem, getCapturedState } from "@/lib/gameState";
import { Stockfish, StockfishEvaluation } from "@/lib/stockfish";
import { upsertSavedGame } from "@/lib/savedGames";
import { MoveHistoryItem } from "./GameOverModal";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface UseChessGameArgs {
    gameId: string;
    initialFen?: string;
    initialPgn?: string;
    initialPersonality: Personality;
    initialColor: "white" | "black";
    initialStockfishDepth?: number;
    onMoveApplied?: (captured: boolean) => void;
}

function createInitialGame(initialFen?: string, initialPgn?: string): Chess {
    const game = new Chess(initialFen || START_FEN);

    if (initialPgn) {
        game.loadPgn(initialPgn);
    }

    return game;
}

function cloneChessGame(game: Chess): Chess {
    const clone = new Chess();
    const pgn = game.pgn();

    if (pgn) {
        clone.loadPgn(pgn);
        return clone;
    }

    clone.load(game.fen());
    return clone;
}

export function useChessGame({
    gameId,
    initialFen,
    initialPgn,
    initialPersonality,
    initialColor,
    initialStockfishDepth,
    onMoveApplied,
}: UseChessGameArgs) {
    const initialGame = useMemo(() => createInitialGame(initialFen, initialPgn), [initialFen, initialPgn]);
    const initialCapturedState = useMemo(() => getCapturedState(initialGame), [initialGame]);

    const [gameSnapshot, setGameSnapshot] = useState(() => cloneChessGame(initialGame));
    const gameRef = useRef(gameSnapshot);
    const [fen, setFen] = useState(() => initialGame.fen());
    const [stockfish] = useState<Stockfish | null>(() => (typeof window !== "undefined" ? new Stockfish() : null));

    const [evalP0, setEvalP0] = useState<StockfishEvaluation | null>(null);
    const [evalP2, setEvalP2] = useState<StockfishEvaluation | null>(null);
    const [openingData, setOpeningData] = useState<OpeningMetadata[]>([]);
    const [latestMissedTactics, setLatestMissedTactics] = useState<DetectedTactic[] | null>(null);
    const [userMove, setUserMove] = useState<Move | null>(null);
    const [computerMove, setComputerMove] = useState<Move | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey] = useState<string | null>(() => {
        if (typeof window === "undefined") {
            return null;
        }

        return localStorage.getItem("gemini_api_key");
    });
    const [stockfishDepth, setStockfishDepth] = useState(initialStockfishDepth ?? 15);
    const [language] = useState<SupportedLanguage>(() => {
        if (typeof window === "undefined") {
            return "en";
        }

        return (localStorage.getItem("chess_tutor_language") as SupportedLanguage) || "en";
    });
    const [moveHistory, setMoveHistory] = useState<MoveHistoryItem[]>([]);
    const [capturedWhitePieces, setCapturedWhitePieces] = useState<string[]>(() => initialCapturedState.whitePiecesLost);
    const [capturedBlackPieces, setCapturedBlackPieces] = useState<string[]>(() => initialCapturedState.blackPiecesLost);
    const [materialScore, setMaterialScore] = useState<{ white: number; black: number }>(() => ({
        white: initialCapturedState.whiteLostScore,
        black: initialCapturedState.blackLostScore,
    }));
    const [dismissedGameOverFen, setDismissedGameOverFen] = useState<string | null>(null);

    const activeAnalysisIdRef = useRef(0);
    const initialMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const playerColor = initialColor;
    const selectedPersonality = initialPersonality;

    const syncGameState = useCallback((game: Chess) => {
        setFen(game.fen());
        setGameSnapshot(cloneChessGame(game));
    }, []);

    const updateCapturedPieces = useCallback(() => {
        const capturedState = getCapturedState(gameRef.current);

        setCapturedWhitePieces(capturedState.whitePiecesLost);
        setCapturedBlackPieces(capturedState.blackPiecesLost);
        setMaterialScore({
            white: capturedState.whiteLostScore,
            black: capturedState.blackLostScore,
        });
    }, []);

    const makeAMove = useCallback(
        (move: { from: string; to: string; promotion?: string }) => {
            try {
                const game = gameRef.current;
                const result = game.move(move);

                if (result) {
                    syncGameState(game);
                    updateCapturedPieces();
                    onMoveApplied?.(Boolean(result.captured));

                    return { result, newFen: game.fen() };
                }
            } catch {
                return null;
            }

            return null;
        },
        [onMoveApplied, syncGameState, updateCapturedPieces]
    );

    useEffect(() => {
        gameRef.current = gameSnapshot;
    }, [gameSnapshot]);

    useEffect(() => {
        return () => stockfish?.terminate();
    }, [stockfish]);

    useEffect(() => {
        let cancelled = false;

        if (initialColor === "black" && gameRef.current.fen() === START_FEN && stockfish) {
            initialMoveTimeoutRef.current = setTimeout(() => {
                stockfish.evaluate(gameRef.current.fen(), 10).then((evalResult) => {
                    if (cancelled) return;

                    makeAMove({
                        from: evalResult.bestMove.substring(0, 2),
                        to: evalResult.bestMove.substring(2, 4),
                        promotion: evalResult.bestMove.length > 4 ? evalResult.bestMove.substring(4, 5) : "q",
                    });
                });
            }, 1000);
        }

        return () => {
            cancelled = true;
            if (initialMoveTimeoutRef.current) {
                clearTimeout(initialMoveTimeoutRef.current);
                initialMoveTimeoutRef.current = null;
            }
        };
    }, [initialColor, makeAMove, stockfish]);

    useEffect(() => {
        const saveData = {
            id: gameId,
            fen,
            language,
            selectedPersonality,
            playerColor,
            pgn: gameRef.current.pgn(),
            updatedAt: Date.now(),
            evaluation: evalP0
                ? {
                    score: evalP0.score,
                    mate: evalP0.mate,
                    depth: evalP0.depth,
                }
                : null,
        };

        upsertSavedGame(saveData);
        localStorage.setItem("chess_tutor_save", JSON.stringify(saveData));
    }, [evalP0, fen, gameId, language, playerColor, selectedPersonality]);

    const gameOverState = useMemo(() => {
        const game = gameSnapshot;
        if (!game.isGameOver()) {
            return null;
        }

        if (game.isCheckmate()) {
            if (game.turn() === "w") {
                return { result: "Checkmate! You lost.", winner: "Black" as const };
            }

            return { result: "Checkmate! You won!", winner: "White" as const };
        }

        if (game.isStalemate()) {
            return { result: "Stalemate!", winner: "Draw" as const };
        }

        if (game.isDraw()) {
            return { result: "Draw!", winner: "Draw" as const };
        }

        return null;
    }, [gameSnapshot]);

    const visibleGameOverState = gameOverState && dismissedGameOverFen !== fen ? gameOverState : null;

    useEffect(() => {
        const playerTurn = playerColor === "white" ? "w" : "b";
        if (stockfish && gameRef.current.turn() === playerTurn && !isAnalyzing && !gameOverState) {
            stockfish.evaluate(gameRef.current.fen(), stockfishDepth).then((evalResult) => {
                setEvalP0(evalResult);
            }).catch((error) => console.error("Pre-analysis failed:", error));
        }
    }, [fen, gameOverState, isAnalyzing, playerColor, stockfish, stockfishDepth]);

    const onDrop = useCallback(({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
        if (!targetSquare || !stockfish || gameOverState) return false;

        const currentTurn = gameRef.current.turn();
        const playerTurn = playerColor === "white" ? "w" : "b";
        if (currentTurn !== playerTurn) {
            return false;
        }

        const move = {
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
        };

        const fenP0 = gameRef.current.fen();
        const moveResult = makeAMove(move);

        if (!moveResult) return false;

        setUserMove(moveResult.result);
        setComputerMove(null);
        setEvalP2(null);
        setOpeningData([]);

        setIsAnalyzing(true);
        const analysisId = ++activeAnalysisIdRef.current;
        const { newFen: fenP1 } = moveResult;

        stockfish.evaluate(fenP1, stockfishDepth).then((p1Eval) => {
            if (analysisId !== activeAnalysisIdRef.current) return;

            const partialHistoryItem = evalP0 ? {
                moveNumber: gameRef.current.moveNumber(),
                playerMove: moveResult.result.san,
                playerColor,
                fenBeforePlayerMove: fenP0,
                evalBeforePlayerMove: evalP0,
                fenAfterPlayerMove: fenP1,
                evalAfterPlayerMove: p1Eval,
            } : null;

            setTimeout(() => {
                if (analysisId !== activeAnalysisIdRef.current) return;

                const compResult = makeAMove({
                    from: p1Eval.bestMove.substring(0, 2),
                    to: p1Eval.bestMove.substring(2, 4),
                    promotion: p1Eval.bestMove.length > 4 ? p1Eval.bestMove.substring(4, 5) : "q",
                });

                if (!compResult) {
                    setIsAnalyzing(false);
                    return;
                }

                if (analysisId !== activeAnalysisIdRef.current) return;

                setComputerMove(compResult.result);
                const { newFen: fenP2 } = compResult;

                stockfish.evaluate(fenP2, stockfishDepth).then((p2Eval) => {
                    if (analysisId !== activeAnalysisIdRef.current) return;

                    setEvalP2(p2Eval);

                    const currentPgn = gameRef.current.pgn();
                    const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                    const possibleOpenings = lookupPossibleOpenings(moveSequence, 5);
                    setOpeningData(possibleOpenings);

                    if (partialHistoryItem && evalP0) {
                        const { historyItem, missedTactics } = buildMoveHistoryItem({
                            computerMove: compResult.result,
                            evalP0,
                            fenAfterComputerMove: fenP2,
                            fenBeforePlayerMove: fenP0,
                            openingData: possibleOpenings,
                            p1Eval,
                            p2Eval,
                            playerColor,
                            playerMove: moveResult.result,
                        });

                        setLatestMissedTactics(missedTactics);
                        setMoveHistory((previous) => [...previous, { ...partialHistoryItem, ...historyItem }]);
                    } else {
                        console.warn("Skipping move history - evalP0 was not available when player moved");
                    }

                    setIsAnalyzing(false);
                }).catch((error) => {
                    if (analysisId !== activeAnalysisIdRef.current) return;
                    console.error("P2 analysis failed:", error);
                    setIsAnalyzing(false);
                });
            }, 500);
        }).catch((error) => {
            if (analysisId !== activeAnalysisIdRef.current) return;
            console.error("Bot move analysis failed:", error);
            setIsAnalyzing(false);
        });

        return true;
    }, [evalP0, gameOverState, makeAMove, playerColor, stockfish, stockfishDepth]);

    const checkAndMakeComputerMove = useCallback(() => {
        if (!stockfish || gameOverState || isAnalyzing) return;

        const currentTurn = gameRef.current.turn();
        const computerTurn = playerColor === "white" ? "b" : "w";

        if (currentTurn === computerTurn) {
            setIsAnalyzing(true);

            const currentFen = gameRef.current.fen();
            stockfish.evaluate(currentFen, stockfishDepth).then((evalResult) => {
                const compResult = makeAMove({
                    from: evalResult.bestMove.substring(0, 2),
                    to: evalResult.bestMove.substring(2, 4),
                    promotion: evalResult.bestMove.length > 4 ? evalResult.bestMove.substring(4, 5) : "q",
                });

                if (!compResult) {
                    setIsAnalyzing(false);
                    return;
                }

                setComputerMove(compResult.result);

                stockfish.evaluate(compResult.newFen, stockfishDepth).then((p2Eval) => {
                    setEvalP2(p2Eval);

                    const currentPgn = gameRef.current.pgn();
                    const moveSequence = extractMoveSequenceFromPGN(currentPgn);
                    setOpeningData(lookupPossibleOpenings(moveSequence, 5));
                    setIsAnalyzing(false);
                }).catch((error) => {
                    console.error("Post-computer-move analysis failed:", error);
                    setIsAnalyzing(false);
                });
            }).catch((error) => {
                console.error("Computer move evaluation failed:", error);
                setIsAnalyzing(false);
            });
        }
    }, [gameOverState, isAnalyzing, makeAMove, playerColor, stockfish, stockfishDepth]);

    const handleNewGame = useCallback(() => {
        activeAnalysisIdRef.current += 1;
        const newGame = new Chess();

        gameRef.current = newGame;
        syncGameState(newGame);
        setDismissedGameOverFen(null);
        setMoveHistory([]);
        setUserMove(null);
        setComputerMove(null);
        setEvalP0(null);
        setEvalP2(null);
        setOpeningData([]);
        updateCapturedPieces();
    }, [syncGameState, updateCapturedPieces]);

    const undoLastTurn = useCallback(() => {
        const game = gameRef.current;

        activeAnalysisIdRef.current += 1;
        game.undo();
        game.undo();
        syncGameState(game);
        setDismissedGameOverFen(null);
        setUserMove(null);
        setComputerMove(null);
        setEvalP0(null);
        setEvalP2(null);
        setOpeningData([]);
        updateCapturedPieces();
    }, [syncGameState, updateCapturedPieces]);

    const dismissGameOver = useCallback(() => {
        setDismissedGameOverFen(fen);
    }, [fen]);

    const whiteAdvantage = materialScore.black - materialScore.white;
    const blackAdvantage = materialScore.white - materialScore.black;

    return {
        apiKey,
        checkAndMakeComputerMove,
        computerMove,
        currentGame: gameSnapshot,
        currentFen: fen,
        evalP0,
        evalP2,
        gameOverState,
        isAnalyzing,
        language,
        latestMissedTactics,
        moveHistory,
        onDrop,
        openingData,
        playerColor,
        selectedPersonality,
        setStockfishDepth,
        stockfish,
        stockfishDepth,
        undoLastTurn,
        userMove,
        visibleGameOverState,
        handleNewGame,
        dismissGameOver,
        capturedWhitePieces,
        capturedBlackPieces,
        whiteAdvantage,
        blackAdvantage,
    };
}
