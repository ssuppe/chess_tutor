"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Brain, ChevronLeft, ChevronRight, Loader2, ArrowLeft, Download, PlayCircle, Upload, RotateCcw, X, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDebug } from "@/contexts/DebugContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Personality, PERSONALITIES } from "@/lib/personalities";
import { Stockfish, StockfishEvaluation } from "@/lib/stockfish";
import { detectChessFormat, ChessFormat } from "@/lib/chessFormatDetector";
import { detectMissedTactics, DetectedTactic, uciToSan, filterMeaningfulTactics } from "@/lib/tacticDetection";
import { lookupPossibleOpenings, buildMoveSequenceFromSteps, OpeningMetadata } from "@/lib/openings";
import { getGenAIModel } from "@/lib/gemini";
import { ChatSession } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";

import { GameImportModal } from "@/components/GameImportModal";
import { EvaluationBar } from "@/components/EvaluationBar";
import { OpeningsModal } from "@/components/OpeningsModal";
import { TopUtilityLinks } from "@/components/TopUtilityLinks";
import { BoardViewLayout } from "@/components/BoardViewLayout";
import { generateHumanReadableBoard, getCapturedState } from "@/lib/gameState";
import clsx from "clsx";

interface MoveStep {
    san: string;
    fenBefore: string;
    fenAfter: string;
    color: 'w' | 'b';
    moveNumber: number;
    from?: string;
    to?: string;
}

interface MoveDetails {
    evalAfter: StockfishEvaluation | null;
    bestMoveSan: string | null;
    cpLoss: number | null;
    missedTactics: DetectedTactic[];
    comment?: string;
}

const DEFAULT_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function AnalysisPage() {
    const router = useRouter();
    const { isDebug, addEntry } = useDebug();

    const [language, setLanguage] = useState<SupportedLanguage>("en");
    const t = useTranslation(language);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [detectedFormat, setDetectedFormat] = useState<ChessFormat | null>(null);
    const [selectedPersonality, setSelectedPersonality] = useState<Personality>(PERSONALITIES[0]);
    const [error, setError] = useState<string | null>(null);

    const [steps, setSteps] = useState<MoveStep[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [initialFen, setInitialFen] = useState(DEFAULT_START);
    const [orientation, setOrientation] = useState<"white" | "black">("white");

    const [stockfish, setStockfish] = useState<Stockfish | null>(null);
    const [stepDetails, setStepDetails] = useState<Record<number, MoveDetails>>({});
    const [comments, setComments] = useState<Record<number, string>>({});
    const [isCommenting, setIsCommenting] = useState(false);
    const [evaluationVersion, setEvaluationVersion] = useState(0);

    const evaluationCache = useRef<Record<string, StockfishEvaluation>>({});
    const [chatSession, setChatSession] = useState<ChatSession | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showPlayModal, setShowPlayModal] = useState(false);
    const [showOpeningsModal, setShowOpeningsModal] = useState(false);

    const [playPersonality, setPlayPersonality] = useState<Personality>(PERSONALITIES[0]);
    const [playColor, setPlayColor] = useState<"white" | "black">("white");
    const [playStrength, setPlayStrength] = useState(10);

    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
    const [isMobileBoardExpanded, setIsMobileBoardExpanded] = useState(false);
    const [viewportHeight, setViewportHeight] = useState<number | null>(null);
    const [viewportOffset, setViewportOffset] = useState<number>(0);

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

    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        const storedLang = localStorage.getItem("chess_tutor_language");
        if (storedKey) setApiKey(storedKey);
        if (storedLang) setLanguage(storedLang as SupportedLanguage);

        // Check for pending analysis from saved game
        const pendingAnalysis = localStorage.getItem("chess_t_pending_analysis");
        if (pendingAnalysis) {
            localStorage.removeItem("chess_t_pending_analysis");
            setInput(pendingAnalysis);
            setDetectedFormat(detectChessFormat(pendingAnalysis));
            setTimeout(() => {
                loadGameFromPgnOrFen(pendingAnalysis);
            }, 100);
        }
    }, []);

    useEffect(() => {
        setPlayPersonality(selectedPersonality);
    }, [selectedPersonality]);

    useEffect(() => {
        const sf = new Stockfish();
        setStockfish(sf);
        return () => sf.terminate();
    }, []);

    // Initialize chat session for conversational analysis
    useEffect(() => {
        if (apiKey) {
            const model = getGenAIModel(apiKey);
            const session = model.startChat({
                history: [
                    {
                        role: "user",
                        parts: [{
                            text: `You are ${selectedPersonality.name}. You will analyze a chess game move by move.
Stay in character and maintain your personality throughout the analysis.
Language: ${language.toUpperCase()}.

IMPORTANT:
- You are analyzing moves sequentially
- Each move you analyze builds on the previous context
- If the user navigates backwards or forwards, you will see the move number
- Provide educational commentary in your characteristic style
- Be concise (3-4 sentences per move)
- Focus on what the move accomplishes and what was missed`
                        }]
                    },
                    {
                        role: "model",
                        parts: [{
                            text: `Understood. I am ${selectedPersonality.name}, and I will analyze this game move by move in ${language}, maintaining my personality while providing educational insights. I'll keep track of the game's progression and provide context-aware commentary.`
                        }]
                    }
                ]
            });
            setChatSession(session);
        }
    }, [apiKey, selectedPersonality, language]);

    const currentFen = useMemo(() => {
        if (currentIndex === 0) return initialFen;
        return steps[currentIndex - 1]?.fenAfter || initialFen;
    }, [currentIndex, steps, initialFen]);

    const possibleOpenings = useMemo(() => {
        if (currentIndex === 0) return [];
        const moveSequence = buildMoveSequenceFromSteps(steps, currentIndex);
        return lookupPossibleOpenings(moveSequence, 5);
    }, [currentIndex, steps]);

    const handleInputChange = (value: string) => {
        setInput(value);
        setDetectedFormat(value.trim() ? detectChessFormat(value) : null);
    };

    const ensureEvaluation = useCallback(async (fen: string) => {
        if (!stockfish) return null;
        if (evaluationCache.current[fen]) return evaluationCache.current[fen];
        const result = await stockfish.evaluate(fen, 14);
        evaluationCache.current[fen] = result;
        setEvaluationVersion(v => v + 1);
        return result;
    }, [stockfish]);

    const handleLoadGame = () => {
        const trimmed = input.trim();
        const format = detectChessFormat(trimmed);

        if (!trimmed || format === "invalid") {
            setError(t.analysis.importError);
            return;
        }

        loadGameFromPgnOrFen(trimmed);
    };

    const loadGameFromPgnOrFen = (notation: string) => {
        const trimmed = notation.trim();
        const format = detectChessFormat(trimmed);
        const chess = new Chess();

        try {
            if (format === "fen") {
                chess.load(trimmed);
                setInitialFen(trimmed);
                setSteps([]);
            } else if (format === "pgn") {
                chess.loadPgn(trimmed);
                const headers = chess.header();
                let startFen = DEFAULT_START;
                if (headers.FEN) {
                    const base = new Chess();
                    base.load(headers.FEN);
                    startFen = base.fen();
                }

                const replay = new Chess();
                replay.load(startFen);
                const verboseMoves = chess.history({ verbose: true });
                const nextSteps: MoveStep[] = [];
                
                verboseMoves.forEach((move, idx) => {
                    const before = replay.fen();
                    const applied = replay.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
                    if (applied) {
                        nextSteps.push({
                            san: applied.san,
                            color: applied.color,
                            moveNumber: Math.floor(idx / 2) + 1,
                            fenBefore: before,
                            fenAfter: replay.fen(),
                            from: move.from,
                            to: move.to,
                        });
                    }
                });
                
                setInitialFen(startFen);
                setSteps(nextSteps);
            }
            evaluationCache.current = {};
            setEvaluationVersion(v => v + 1);
            setCurrentIndex(0);
            setStepDetails({});
            setComments({});
            setError(null);
            ensureEvaluation(initialFen);
        } catch (e) {
            console.error("Failed to load game", e);
            setError(t.analysis.importError);
        }
    };

    const handleImportGame = (pgn: string) => {
        setInput(pgn);
        setDetectedFormat(detectChessFormat(pgn));
        loadGameFromPgnOrFen(pgn);
        setShowImportModal(false);
    };

    const handleResetAnalysis = () => {
        setInput("");
        setDetectedFormat(null);
        setSteps([]);
        setCurrentIndex(0);
        setStepDetails({});
        setComments({});
        setInitialFen(DEFAULT_START);
        evaluationCache.current = {};
        setEvaluationVersion(v => v + 1);
        setError(null);
    };

    const handleStartGameFromPosition = () => {
        const payload = {
            fen: currentFen,
            personalityId: playPersonality.id,
            color: playColor,
            stockfishDepth: playStrength,
        };

        localStorage.setItem("chess_t_pending_game", JSON.stringify(payload));
        router.push("/");
    };

    useEffect(() => {
        if (!stockfish || !currentFen) return;
        ensureEvaluation(currentFen);
        const currentStep = steps[currentIndex - 1];
        if (currentStep) {
            ensureEvaluation(currentStep.fenBefore);
        }
    }, [stockfish, currentFen, steps, currentIndex, ensureEvaluation]);

    useEffect(() => {
        if (currentIndex === 0) return;
        const step = steps[currentIndex - 1];
        if (!step) return;

        const evalBefore = evaluationCache.current[step.fenBefore];
        const evalAfter = evaluationCache.current[step.fenAfter];
        if (!evalBefore || !evalAfter) return;

        setStepDetails(prev => {
            if (prev[currentIndex]?.evalAfter) return prev;
            const isWhite = step.color === "w";
            const cpLoss = isWhite
                ? evalBefore.score - evalAfter.score
                : evalAfter.score - evalBefore.score;
            const missedTactics = detectMissedTactics({
                fen: step.fenBefore,
                playerColor: isWhite ? "white" : "black",
                playerMoveSan: step.san,
                bestMoveUci: evalBefore.bestMove,
                cpLoss,
            });
            const bestMoveSan = uciToSan(step.fenBefore, evalBefore.bestMove);
            return {
                ...prev,
                [currentIndex]: {
                    evalAfter,
                    bestMoveSan,
                    cpLoss,
                    missedTactics,
                }
            };
        });
    }, [currentIndex, steps, evaluationVersion]);

    useEffect(() => {
        if (!chatSession) return;
        if (currentIndex === 0) return;
        const step = steps[currentIndex - 1];
        const details = stepDetails[currentIndex];
        if (!step || !details?.evalAfter) return;
        if (comments[currentIndex]) return;

        let cancelled = false;
        setIsCommenting(true);
        const timeout = setTimeout(async () => {
            try {
                const delta = details.cpLoss ?? 0;
                const evalAfter = details.evalAfter!.score / 100;
                const mateInfo = details.evalAfter!.mate !== null ? `Mate in ${details.evalAfter!.mate}` : "No mate detected";
                const tactics = filterMeaningfulTactics(details.missedTactics)
                    .map(t => `${t.tactic_type}${t.material_delta ? ` (~${(t.material_delta / 100).toFixed(1)} pawns)` : ""}`)
                    .join("; ") || "None";

                const prompt = `
Analyze this move:

DATA:
- Move number: ${step.moveNumber}
- Side to move: ${step.color === 'w' ? 'White' : 'Black'}
- Move played (SAN): ${step.san}
- FEN before move: ${step.fenBefore}
- FEN after move: ${step.fenAfter}
- CURRENT PIECE POSITIONS: ${generateHumanReadableBoard(step.fenAfter)}
- Evaluation after move: ${evalAfter.toFixed(2)} pawns
- Best move suggestion: ${details.bestMoveSan}
- Evaluation shift (centipawns): ${delta}
- Possible Openings: ${possibleOpenings.length > 0 ? possibleOpenings.map(o => `${o.name} (${o.eco})`).join(', ') : "Unknown/Midgame"}
- Missed tactics: ${tactics}
- Mate hint: ${mateInfo}

INSTRUCTIONS:
- Be concise (3-4 sentences).
- Mention whether the move improved or worsened the position and why.
- Highlight any tactical ideas the player may have missed.
- Use the CURRENT PIECE POSITIONS to verify exactly where all pieces are located.
- Keep it educational and stay true to your personality tone.`;

                const result = await chatSession.sendMessage(prompt);
                const responseText = result.response.text();

                if (!cancelled) {
                    setComments(prev => ({ ...prev, [currentIndex]: responseText }));
                    addEntry({
                        type: 'analysis',
                        action: `Move ${step.moveNumber} Analysis (${step.color})`,
                        prompt,
                        response: responseText,
                        metadata: {
                            moveNumber: step.moveNumber,
                            san: step.san,
                            color: step.color,
                            fenBefore: step.fenBefore,
                            fenAfter: step.fenAfter,
                            cpLoss: delta,
                            personality: selectedPersonality.name,
                            language,
                        }
                    });
                }
            } catch (err) {
                console.error("Commentary failed", err);
            } finally {
                if (!cancelled) setIsCommenting(false);
            }
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
            setIsCommenting(false);
        };
    }, [chatSession, currentIndex, stepDetails, steps, comments, possibleOpenings, addEntry, language, selectedPersonality.name]);

    const formatEval = (evaluation?: StockfishEvaluation | null) => {
        if (!evaluation) return t.analysis.enginePending;
        if (evaluation.mate !== null) return `#${evaluation.mate}`;
        return `${evaluation.score >= 0 ? "+" : ""}${(evaluation.score / 100).toFixed(2)}`;
    };

    const formatCpLoss = (cp?: number | null) => {
        if (cp === null || cp === undefined) return t.analysis.enginePending;
        const pawns = (cp / 100).toFixed(2);
        return `${cp > 0 ? "+" : ""}${pawns}`;
    };

    const currentStep = steps[currentIndex - 1];
    const currentDetails = currentIndex > 0 ? stepDetails[currentIndex] : undefined;
    const tacticSummary = filterMeaningfulTactics(currentDetails?.missedTactics);

    // Get captured pieces for both sides at current FEN
    const capturedState = useMemo(() => getCapturedState(currentFen), [currentFen]);

    // Highlighting current move
    const lastMoveHighlight = useMemo(() => {
        if (currentIndex === 0 || !currentStep) return {};
        return {
            [currentStep.from!]: { boxShadow: 'inset 0 0 0 4px rgba(255, 255, 0, 0.75)' },
            [currentStep.to!]: { boxShadow: 'inset 0 0 0 4px rgba(255, 255, 0, 0.75)' }
        };
    }, [currentIndex, currentStep]);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            <BoardViewLayout
                language={language}
                onBack={() => router.push('/')}
                isMobileChatOpen={isMobileChatOpen}
                isMobileBoardExpanded={isMobileBoardExpanded}
                setIsMobileBoardExpanded={setIsMobileBoardExpanded}
                viewportHeight={viewportHeight ?? undefined}
                viewportOffset={viewportOffset}
                headerActions={
                    steps.length > 0 && (
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                            {t.analysis.title} • {currentIndex} / {steps.length}
                        </div>
                    )
                }
                boardArea={
                    steps.length === 0 ? (
                        <div className="w-full flex flex-col items-center justify-center h-full p-4 space-y-4">
                            <div className="w-full max-w-sm">
                                <Chessboard 
                                    options={{ 
                                        position: currentFen, 
                                        boardOrientation: orientation, 
                                        allowDragging: false, 
                                        darkSquareStyle: { backgroundColor: '#779954' }, 
                                        lightSquareStyle: { backgroundColor: '#e9edcc' }, 
                                        animationDurationInMs: 200, 
                                        boardStyle: { borderRadius: "8px" }
                                    }} 
                                />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center uppercase tracking-wider font-bold">{t.analysis.currentPosition}</p>
                        </div>
                    ) : (
                        <>
                            {/* Top Cluster (Mobile Chat Mode only) */}
                            {isMobileChatOpen && (
                                <div className="w-full flex flex-col items-center gap-1.5 scale-90 flex-shrink-0">
                                    <CapturedPieces captured={capturedState.blackPiecesLost} color="b" score={capturedState.blackLostScore - capturedState.whiteLostScore > 0 ? capturedState.blackLostScore - capturedState.whiteLostScore : null} />
                                    {currentIndex > 0 && currentDetails?.evalAfter && <div className="w-full h-3"><EvaluationBar score={currentDetails.evalAfter.score} mate={currentDetails.evalAfter.mate} isPlayerWhite={orientation === 'white'} orientation="horizontal" /></div>}
                                </div>
                            )}

                            {/* Board Container */}
                            <div className={clsx(
                                "bg-[#779954] p-[1px] rounded-sm relative overflow-hidden",
                                isMobileChatOpen ? "w-full aspect-square shadow-sm" : "w-full aspect-square max-w-md transition-all duration-300"
                            )}>
                                <Chessboard options={{ position: currentFen, boardOrientation: orientation, allowDragging: false, darkSquareStyle: { backgroundColor: '#779954' }, lightSquareStyle: { backgroundColor: '#e9edcc' }, animationDurationInMs: 200, squareStyles: lastMoveHighlight }} />
                            </div>

                            {/* Bottom Cluster (Mobile Chat Mode only) */}
                            {isMobileChatOpen && (
                                <div className="w-full flex flex-col items-center gap-2 flex-shrink-0 scale-90">
                                    {currentIndex > 0 && currentStep && (
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium italic">
                                            Last move ({currentStep.color === 'w' ? 'White' : 'Black'}): <span className="font-black not-italic text-gray-800 dark:text-gray-200">{currentStep.san}</span>
                                        </div>
                                    )}
                                    <CapturedPieces captured={capturedState.whitePiecesLost} color="w" score={capturedState.whiteLostScore - capturedState.blackLostScore > 0 ? capturedState.whiteLostScore - capturedState.blackLostScore : null} />
                                    
                                    {/* Navigation Arrows in Strip */}
                                    <div className="flex items-center gap-4 mt-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => Math.max(0, i - 1)); }}
                                            disabled={currentIndex === 0}
                                            className="p-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm disabled:opacity-20"
                                            aria-label={t.analysis.previous}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <div className="text-[10px] font-black tabular-nums">{currentIndex}</div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => Math.min(steps.length, i + 1)); }}
                                            disabled={currentIndex >= steps.length}
                                            className="p-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm disabled:opacity-20"
                                            aria-label={t.analysis.next}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Controls (Desktop/Non-chat view) */}
                            {!isMobileChatOpen && (
                                <div className="flex items-center gap-4 mt-4">
                                    <button
                                        onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                                        className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30"
                                        disabled={currentIndex === 0}
                                        aria-label={t.analysis.previous}
                                    >
                                        <ChevronLeft size={24} />
                                    </button>
                                    <div className="text-xs font-black tabular-nums">{currentIndex} / {steps.length}</div>
                                    <button
                                        onClick={() => setCurrentIndex(i => Math.min(steps.length, i + 1))}
                                        className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30"
                                        disabled={currentIndex >= steps.length}
                                        aria-label={t.analysis.next}
                                    >
                                        <ChevronRight size={24} />
                                    </button>
                                </div>
                            )}
                        </>
                    )
                }
                sidePanel={
                    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-800">
                        {steps.length === 0 ? (
                            /* Import View Slot */
                            <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
                                <div className="space-y-4">
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{t.analysis.pasteLabel}</label>
                                    <textarea
                                        value={input}
                                        onChange={(e) => handleInputChange(e.target.value)}
                                        placeholder={t.analysis.pastePlaceholder}
                                        className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-sm min-h-[120px] focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                    {error && <p className="text-sm text-red-500">{error}</p>}
                                    <div className="grid grid-cols-2 gap-2">
                                        {PERSONALITIES.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => setSelectedPersonality(p)}
                                                className={`p-2 rounded-lg border flex items-center gap-2 transition-colors ${selectedPersonality.id === p.id ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200 dark:border-gray-700"}`}
                                            >
                                                <span className="text-lg">{p.image}</span>
                                                <span className="text-[10px] text-left leading-tight font-bold">{p.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={handleLoadGame} className="w-full py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold shadow-lg transition-all active:scale-[0.98]">{t.analysis.startButton}</button>

                                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 text-center font-bold">
                                            {t.analysis.importFromPlatforms}
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setShowImportModal(true)}
                                                className="py-2 px-3 bg-[#81b64c] text-white rounded-lg hover:bg-[#a3d16e] font-medium text-xs flex items-center justify-center gap-2 shadow transition-colors"
                                            >
                                                <Download size={14} />
                                                Chess.com
                                            </button>
                                            <button
                                                onClick={() => setShowImportModal(true)}
                                                className="py-2 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-xs flex items-center justify-center gap-2 shadow transition-colors"
                                            >
                                                <Download size={14} />
                                                Lichess
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Analysis Content Slot */
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {/* Header Controls */}
                                <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                        <div className="text-sm shrink-0">{selectedPersonality.image}</div>
                                        <h2 className="font-bold text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-widest truncate">Coach Analysis</h2>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={handleResetAnalysis} className="p-1.5 text-gray-500 hover:text-purple-600 transition-colors" title={t.analysis.loadNewGame}><RotateCcw size={14} /></button>
                                        <button onClick={() => { setPlayColor(orientation); setShowPlayModal(true); }} className="p-1.5 text-blue-600 hover:text-blue-700 transition-colors" title="Play"><PlayCircle size={14} /></button>
                                        <select value={orientation} onChange={(e) => setOrientation(e.target.value as "white" | "black")} className="p-1 rounded bg-transparent border-none text-[9px] font-black uppercase outline-none cursor-pointer">{ (["white", "black"] as const).map(c => <option key={c} value={c}>{c.slice(0,1).toUpperCase()}</option>) }</select>
                                    </div>
                                </div>

                                {/* Content Scroll Area */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
                                    {/* Evaluation Strip (Non-chat mobile/Desktop only) */}
                                    {!isMobileChatOpen && currentIndex > 0 && currentDetails?.evalAfter && (
                                        <div className="w-full h-3 flex-shrink-0"><EvaluationBar score={currentDetails.evalAfter.score} mate={currentDetails.evalAfter.mate} isPlayerWhite={orientation === 'white'} orientation="horizontal" /></div>
                                    )}

                                    {/* Commentary Bubble */}
                                    <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-4 border border-purple-100 dark:border-purple-800/30">
                                        {isCommenting ? (
                                            <div className="flex items-center gap-2 text-gray-500 text-xs animate-pulse font-bold uppercase tracking-widest"><Loader2 className="animate-spin" size={14} /> <span>Coach Thinking...</span></div>
                                        ) : comments[currentIndex] ? (
                                            <div className="prose prose-sm dark:prose-invert text-sm md:text-base leading-snug"><ReactMarkdown>{comments[currentIndex]}</ReactMarkdown></div>
                                        ) : (
                                            <p className="text-xs text-gray-400 text-center py-4 italic font-bold uppercase tracking-wider">{t.analysis.coachPending}</p>
                                        )}
                                    </div>

                                    {/* Tech Stats Section */}
                                    {currentIndex > 0 && (
                                        <div className="grid grid-cols-2 gap-2 text-[9px] uppercase font-black">
                                            <div className="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/50"><div className="text-gray-400 mb-1">Position</div><div>#{currentIndex} - {currentStep?.san}</div></div>
                                            <div className="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/50"><div className="text-gray-400 mb-1">Engine Eval</div><div>{formatEval(currentDetails?.evalAfter)}</div></div>
                                            <div className="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/50"><div className="text-gray-400 mb-1">Move Quality</div><div className={clsx(currentDetails?.cpLoss && currentDetails.cpLoss > 100 ? "text-red-500" : "text-green-600")}>{formatCpLoss(currentDetails?.cpLoss)}</div></div>
                                            <div className="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/50"><div className="text-gray-400 mb-1">Best Move</div><div className="text-blue-600">{currentDetails?.bestMoveSan || "..."}</div></div>
                                        </div>
                                    )}

                                    {/* Tactics List */}
                                    {tacticSummary.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase text-red-500 tracking-[0.2em] mb-1">Detected Tactics</p>
                                            <div className="flex flex-wrap gap-2">
                                                {tacticSummary.map((t, i) => (
                                                    <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-full text-[10px]">
                                                        <span className="font-black text-red-600 dark:text-red-400 uppercase">
                                                            {t.tactic_type} {t.affected_squares && t.affected_squares.length > 0 ? `on ${t.affected_squares.join(', ')}` : ''}
                                                        </span>
                                                        {t.material_delta && (
                                                            <span className="text-red-500/70 dark:text-red-500/50 font-bold tabular-nums">
                                                                ~{(t.material_delta / 100).toFixed(1)} pawns
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                }
            />

            {/* Unified Mobile Floating Action Button */}
            {steps.length > 0 && (
                <button
                    onClick={() => {
                        if (isMobileChatOpen) setIsMobileBoardExpanded(false);
                        setIsMobileChatOpen(!isMobileChatOpen);
                    }}
                    aria-label={isMobileChatOpen ? "Close Analysis" : "Open Analysis"}
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
                            <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">AI Analysis</span>
                            <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
                        </>
                    )}
                </button>
            )}

            {/* Modals */}
            {showImportModal && <GameImportModal onClose={() => setShowImportModal(false)} onSelectGame={handleImportGame} language={language} />}
            {showOpeningsModal && possibleOpenings.length > 0 && <OpeningsModal openings={possibleOpenings} currentFen={currentFen} language={language} personality={selectedPersonality} onClose={() => setShowOpeningsModal(false)} />}
            {showPlayModal && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4 py-8">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 border border-gray-200 dark:border-gray-700 animate-in zoom-in duration-300">
                        <div className="flex items-start justify-between gap-4">
                            <div><h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t.analysis.playFromHere}</h3><p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{t.analysis.playDescription}</p></div>
                            <button onClick={() => setShowPlayModal(false)} className="text-gray-500 hover:text-gray-700" aria-label={t.common.close}>✕</button>
                        </div>
                        <div className="space-y-4">
                            <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t.analysis.chooseOpponent}</p><div className="grid grid-cols-2 gap-2">{PERSONALITIES.map(p => <button key={p.id} onClick={() => setPlayPersonality(p)} className={`p-3 rounded-lg border flex items-center gap-2 ${playPersonality.id === p.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-gray-700"}`}><span className="text-xl">{p.image}</span><div className="text-left"><div className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</div><div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{p.description}</div></div></button>)}</div></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-2"><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t.analysis.chooseSide}</p><div className="grid grid-cols-2 gap-2">{(["white", "black"] as const).map(color => <button key={color} onClick={() => setPlayColor(color)} className={`py-2 px-3 rounded-lg border text-sm font-medium ${playColor === color ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-gray-700"}`}>{color === "white" ? t.game.white : t.game.black}</button>)}</div></div><div className="space-y-2"><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t.analysis.chooseStrength}</p><div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3"><div className="text-sm text-gray-700 dark:text-gray-200 mb-1">{t.game.stockfishLevel}: {playStrength}</div><input type="range" min="1" max="20" value={playStrength} onChange={(e) => setPlayStrength(parseInt(e.target.value))} className="w-full" /><div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t.game.depth}: {playStrength}</div></div></div></div>
                        </div>
                        <div className="flex items-center justify-end gap-3"><button onClick={() => setShowPlayModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 dark:text-gray-200">Cancel</button><button onClick={handleStartGameFromPosition} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow">{t.analysis.startPlay}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
