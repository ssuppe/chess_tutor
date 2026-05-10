"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Brain, ChevronLeft, ChevronRight, Loader2, ArrowLeft, Download, PlayCircle, Upload, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import Header from "@/components/Header";
import { SupportedLanguage } from "@/lib/i18n/translations";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Personality, PERSONALITIES } from "@/lib/personalities";
import { Stockfish, StockfishEvaluation } from "@/lib/stockfish";
import { detectChessFormat, ChessFormat } from "@/lib/chessFormatDetector";
import { detectMissedTactics, DetectedTactic, uciToSan, filterMeaningfulTactics } from "@/lib/tacticDetection";
import { lookupPossibleOpenings, buildMoveSequenceFromSteps, OpeningMetadata } from "@/lib/openings";
import { getGenAIModel } from "@/lib/gemini";
import { ChatSession } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import { generateHumanReadableBoard } from "@/lib/gameState";
import { useDebug } from "@/contexts/DebugContext";
import { GameImportModal } from "@/components/GameImportModal";
import { EvaluationBar } from "@/components/EvaluationBar";
import { OpeningsModal } from "@/components/OpeningsModal";
import { getMoveHighlight, CHESSBOARD_THEME } from "@/lib/chessStyles";

interface MoveStep {
    san: string;
    from: string;
    to: string;
    color: "white" | "black";
    moveNumber: number;
    fenBefore: string;
    fenAfter: string;
}

interface StepDetails {
    evalBefore?: StockfishEvaluation;
    evalAfter?: StockfishEvaluation;
    cpLoss?: number;
    missedTactics?: DetectedTactic[];
    bestMoveSan?: string | null;
    comment?: string;
}

const DEFAULT_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function AnalysisPage() {
    const router = useRouter();
    const [language, setLanguage] = useState<SupportedLanguage>("en");
    const [apiKey, setApiKey] = useState<string | null>(null);
    const t = useTranslation(language);
    const { addEntry } = useDebug();

    const [input, setInput] = useState("");
    const [detectedFormat, setDetectedFormat] = useState<ChessFormat | null>(null);
    const [selectedPersonality, setSelectedPersonality] = useState<Personality>(PERSONALITIES[0]);
    const [orientation, setOrientation] = useState<"white" | "black">("white");

    const [initialFen, setInitialFen] = useState<string>(DEFAULT_START);
    const [steps, setSteps] = useState<MoveStep[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0); // 0 = starting position
    const [error, setError] = useState<string | null>(null);

    const [stockfish, setStockfish] = useState<Stockfish | null>(null);
    const evaluationCache = useRef<Record<string, StockfishEvaluation>>({});
    const [evaluationVersion, setEvaluationVersion] = useState(0);
    const [stepDetails, setStepDetails] = useState<Record<number, StepDetails>>({});
    const [isCommenting, setIsCommenting] = useState(false);
    const [comments, setComments] = useState<Record<number, string>>({});
    const [chatSession, setChatSession] = useState<ChatSession | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showPlayModal, setShowPlayModal] = useState(false);
    const [showOpeningsModal, setShowOpeningsModal] = useState(false);
    const [playPersonality, setPlayPersonality] = useState<Personality>(PERSONALITIES[0]);
    const [playColor, setPlayColor] = useState<"white" | "black">("white");
    const [playStrength, setPlayStrength] = useState(15);

    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        const storedLang = localStorage.getItem("chess_tutor_language");
        if (storedKey) setApiKey(storedKey);
        if (storedLang) setLanguage(storedLang as SupportedLanguage);

        // Check for pending analysis from saved game
        const pendingAnalysis = localStorage.getItem("chess_tutor_pending_analysis");
        if (pendingAnalysis) {
            localStorage.removeItem("chess_tutor_pending_analysis");
            setInput(pendingAnalysis);
            setDetectedFormat(detectChessFormat(pendingAnalysis));
            // Load the game after a short delay to ensure stockfish is ready
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

    const analysisHighlight = useMemo(() => {
        return getMoveHighlight(steps[currentIndex - 1]);
    }, [currentIndex, steps]);

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

    const loadGameFromPgnOrFen = useCallback((notation: string) => {
        const trimmed = notation.trim();
        const format = detectChessFormat(trimmed);

        if (!trimmed || format === "invalid") {
            setError(t.analysis.importError);
            return;
        }

        try {
            const parsedGame = new Chess();
            const nextSteps: MoveStep[] = [];
            let startFen = DEFAULT_START;

            if (format === "fen") {
                parsedGame.load(trimmed);
                startFen = parsedGame.fen();
            } else {
                parsedGame.loadPgn(trimmed);
                const headers = parsedGame.header();
                if (headers.FEN) {
                    const base = new Chess();
                    base.load(headers.FEN);
                    startFen = base.fen();
                } else {
                    parsedGame.reset();
                    startFen = parsedGame.fen();
                }

                const replay = new Chess();
                replay.load(startFen);
                const history = new Chess();
                history.loadPgn(trimmed);
                history.history({ verbose: true }).forEach((move, idx) => {
                    const before = replay.fen();
                    const applied = replay.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
                    if (applied) {
                        nextSteps.push({
                            san: applied.san,
                            from: move.from,
                            to: move.to,
                            color: applied.color === "w" ? "white" : "black",
                            moveNumber: Math.floor(idx / 2) + 1,
                            fenBefore: before,
                            fenAfter: replay.fen(),
                        });
                    }
                });
            }

            evaluationCache.current = {};
            setEvaluationVersion(v => v + 1);
            setInitialFen(startFen);
            setSteps(nextSteps);
            setCurrentIndex(0);
            setStepDetails({});
            setComments({});
            setError(null);
            ensureEvaluation(startFen);
        } catch (e) {
            console.error("Failed to load game", e);
            setError(t.analysis.importError);
        }
    }, [t.analysis.importError, ensureEvaluation]);

    const handleImportGame = useCallback((pgn: string) => {
        setInput(pgn);
        setDetectedFormat(detectChessFormat(pgn));
        loadGameFromPgnOrFen(pgn);
    }, [loadGameFromPgnOrFen]);

    const handleResetAnalysis = useCallback(() => {
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
    }, []);

    const handleStartGameFromPosition = useCallback(() => {
        const payload = {
            fen: currentFen,
            personalityId: playPersonality.id,
            color: playColor,
            stockfishDepth: playStrength,
        };

        localStorage.setItem("chess_tutor_pending_game", JSON.stringify(payload));
        router.push("/");
    }, [currentFen, playPersonality.id, playColor, playStrength, router]);

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
            if (prev[currentIndex]?.evalBefore && prev[currentIndex]?.evalAfter) return prev;
            const cpLoss = step.color === "white"
                ? evalBefore.score - evalAfter.score
                : evalAfter.score - evalBefore.score;
            const missedTactics = detectMissedTactics({
                fen: step.fenBefore,
                playerColor: step.color,
                playerMoveSan: step.san,
                bestMoveUci: evalBefore.bestMove,
                cpLoss,
            });
            const bestMoveSan = uciToSan(step.fenBefore, evalBefore.bestMove);
            return {
                ...prev,
                [currentIndex]: {
                    evalBefore,
                    evalAfter,
                    cpLoss,
                    missedTactics,
                    bestMoveSan,
                }
            };
        });
    }, [currentIndex, steps, evaluationVersion]);

    useEffect(() => {
        if (!chatSession) return;
        if (currentIndex === 0) return;
        const step = steps[currentIndex - 1];
        const details = stepDetails[currentIndex];
        if (!step || !details?.evalBefore || !details?.evalAfter) return;
        if (comments[currentIndex]) return;

        let cancelled = false;
        setIsCommenting(true);
        const timeout = setTimeout(async () => {
            try {
                const delta = details.cpLoss ?? 0;
                const evalBefore = details.evalBefore!.score / 100;
                const evalAfter = details.evalAfter!.score / 100;
                const mateInfo = details.evalAfter!.mate !== null ? `Mate in ${details.evalAfter!.mate}` : "No mate detected";
                const tactics = filterMeaningfulTactics(details.missedTactics)
                    .map(t => `${t.tactic_type}${t.material_delta ? ` (~${(t.material_delta / 100).toFixed(1)} pawns)` : ""}`)
                    .join("; ") || "None";

                const prompt = `
Analyze this move:

DATA:
- Move number: ${step.moveNumber}
- Side to move: ${step.color}
- Move played (SAN): ${step.san}
- FEN before move: ${step.fenBefore}
- FEN after move: ${step.fenAfter}
- CURRENT PIECE POSITIONS: ${generateHumanReadableBoard(step.fenAfter)}
- Evaluation before move: ${evalBefore.toFixed(2)} pawns
- Evaluation after move: ${evalAfter.toFixed(2)} pawns
- Best move suggestion: ${details.bestMoveSan ?? details.evalBefore!.bestMove}
- Evaluation shift (centipawns): ${delta}
- Possible Openings: ${possibleOpenings.length > 0 ? possibleOpenings.map(o => `${o.name} (${o.eco})`).join(', ') : "Unknown/Midgame"}
- Missed tactics: ${tactics}
- Mate hint: ${mateInfo}

INSTRUCTIONS:
- Be concise (3-4 sentences).
- Mention whether the move improved or worsened the position and why.
- Highlight any tactical ideas the player may have missed.
- Refer to the player's side as ${step.color}.
- Use the CURRENT PIECE POSITIONS to verify exactly where all pieces are before speaking.
- Keep it educational and stay true to your personality tone.`;

                const result = await chatSession.sendMessage(prompt);
                const responseText = result.response.text();

                if (!cancelled) {
                    setComments(prev => ({ ...prev, [currentIndex]: responseText }));

                    // Track debug entry
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
    }, [chatSession, currentIndex, stepDetails, steps, comments, possibleOpenings, addEntry, selectedPersonality.name, language]);

    const formatEval = (evaluation?: StockfishEvaluation) => {
        if (!evaluation) return t.analysis.enginePending;
        if (evaluation.mate !== null) return `#${evaluation.mate}`;
        return `${evaluation.score >= 0 ? "+" : ""}${(evaluation.score / 100).toFixed(2)}`;
    };

    const formatCpLoss = (cp?: number) => {
        if (cp === undefined) return t.analysis.enginePending;
        const pawns = (cp / 100).toFixed(2);
        return `${cp > 0 ? "+" : ""}${pawns}`;
    };

    const currentDetails = currentIndex > 0 ? stepDetails[currentIndex] : undefined;
    const tacticSummary = filterMeaningfulTactics(currentDetails?.missedTactics);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Slim Navigation Row */}
            <div className="w-full px-4 pt-2">
                <div className="max-w-6xl mx-auto flex justify-between items-center py-1">
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
                        aria-label={t.game.backToMenu}
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">{t.game.backToMenu}</span>
                    </button>
                    {steps.length > 0 && (
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                            {t.analysis.title} • {currentIndex} / {steps.length}
                        </div>
                    )}
                </div>
            </div>

            <main className="flex-grow w-full flex justify-center px-4 py-4 md:py-8">
                <div className="w-full max-w-6xl space-y-4 md:space-y-8">
                    {/* Phase 1: Import View - shown when no game is loaded */}
                    {steps.length === 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 md:p-8 border border-gray-200 dark:border-gray-700">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Brain className="text-purple-600" size={24} /> {t.analysis.modeTitle}
                                    </h1>
                                    <p className="text-sm md:text-base text-gray-600 dark:text-gray-300 mt-1 md:mt-2">{t.analysis.modeDescription}</p>
                                </div>
                            </div>

                            <div className="mt-4 md:mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                <div className="space-y-4">
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{t.analysis.pasteLabel}</label>
                                    <textarea
                                        value={input}
                                        onChange={(e) => handleInputChange(e.target.value)}
                                        placeholder={t.analysis.pastePlaceholder}
                                        className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-sm min-h-[150px] md:min-h-[180px]"
                                    />
                                    {detectedFormat && (
                                        <p className="text-xs text-gray-500">Detected: {detectedFormat.toUpperCase()}</p>
                                    )}
                                    {error && <p className="text-sm text-red-500">{error}</p>}
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t.analysis.chooseCoach}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {PERSONALITIES.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => setSelectedPersonality(p)}
                                                    className={`p-2 md:p-3 rounded-lg border flex items-center gap-2 transition-colors ${selectedPersonality.id === p.id
                                                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                                                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}
                                                >
                                                    <span className="text-lg md:text-xl">{p.image}</span>
                                                    <span className="text-xs md:text-sm text-left text-gray-800 dark:text-gray-100">{p.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleLoadGame}
                                        className="w-full py-2.5 md:py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold shadow-lg transition-colors"
                                    >
                                        {t.analysis.startButton}
                                    </button>

                                    {/* Import from Online Platforms */}
                                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 text-center font-bold">
                                            Or import from online platforms
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setShowImportModal(true)}
                                                className="py-2 px-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-xs md:text-sm flex items-center justify-center gap-2 shadow transition-colors"
                                            >
                                                <Download size={14} />
                                                Chess.com
                                            </button>
                                            <button
                                                onClick={() => setShowImportModal(true)}
                                                className="py-2 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-xs md:text-sm flex items-center justify-center gap-2 shadow transition-colors"
                                            >
                                                <Download size={14} />
                                                Lichess
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700">
                                    <div className="w-full max-w-sm">
                                        <Chessboard
                                            options={{
                                                position: currentFen,
                                                boardOrientation: orientation,
                                                allowDragging: false,
                                                darkSquareStyle: { backgroundColor: CHESSBOARD_THEME.darkSquare },
                                                lightSquareStyle: { backgroundColor: CHESSBOARD_THEME.lightSquare },
                                                animationDurationInMs: CHESSBOARD_THEME.animationDuration,
                                                boardStyle: { borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" },
                                                squareStyles: analysisHighlight
                                            }}
                                        />
                                    </div>
                                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center uppercase tracking-wider font-bold">
                                        {t.analysis.currentPosition}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Phase 2: Analysis View - shown when game is loaded */}
                    {steps.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-3 md:p-6 border border-gray-200 dark:border-gray-700">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">{selectedPersonality.image}</span>
                                    <div>
                                        <h1 className="text-base font-bold text-gray-900 dark:text-white leading-none">
                                            {t.analysis.modeTitle}
                                        </h1>
                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mt-1">
                                            Coach: {selectedPersonality.name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleResetAnalysis}
                                        className="px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1.5 transition-colors"
                                    >
                                        <RotateCcw size={14} />
                                        <span>{t.analysis.loadNewGame}</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPlayColor(orientation);
                                            setShowPlayModal(true);
                                        }}
                                        className="px-2 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm transition-colors"
                                    >
                                        <PlayCircle size={14} />
                                        <span>Play</span>
                                    </button>
                                    <select
                                        value={orientation}
                                        onChange={(e) => setOrientation(e.target.value as "white" | "black")}
                                        className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-xs"
                                    >
                                        <option value="white">White</option>
                                        <option value="black">Black</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-3">
                                <div className="w-full max-w-md">
                                    <Chessboard
                                        options={{
                                            position: currentFen,
                                            boardOrientation: orientation,
                                            allowDragging: false,
                                            darkSquareStyle: { backgroundColor: CHESSBOARD_THEME.darkSquare },
                                            lightSquareStyle: { backgroundColor: CHESSBOARD_THEME.lightSquare },
                                            animationDurationInMs: CHESSBOARD_THEME.animationDuration,
                                            boardStyle: { borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" },
                                            squareStyles: analysisHighlight
                                        }}
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                                        className="p-1.5 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                                        disabled={currentIndex === 0}
                                        aria-label={t.analysis.previous}
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <div className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 min-w-[80px] text-center">
                                        {currentIndex} / {steps.length}
                                    </div>
                                    <button
                                        onClick={() => setCurrentIndex(i => Math.min(steps.length, i + 1))}
                                        className="p-1.5 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                                        disabled={currentIndex >= steps.length}
                                        aria-label={t.analysis.next}
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Analysis Panels - only shown when game is loaded */}
                    {steps.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                            {/* AI Analysis Panel - Swapped to top/first */}
                            <div className="order-1 lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-200 dark:border-gray-700 p-4 md:p-6 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.analysis.aiAnalysis}</h2>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Move {currentIndex}</div>
                                </div>

                                {/* Horizontal Evaluation Bar */}
                                {currentIndex > 0 && currentDetails?.evalAfter && (
                                    <div className="w-full mb-3">
                                        <EvaluationBar
                                            score={currentDetails.evalAfter.score}
                                            mate={currentDetails.evalAfter.mate}
                                            isPlayerWhite={true}
                                            orientation="horizontal"
                                        />
                                    </div>
                                )}

                                {!apiKey && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Please add an API key in settings to receive commentary.</p>
                                )}
                                {currentIndex === 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold text-center py-4">{t.analysis.currentPosition}</p>
                                )}
                                {currentIndex > 0 && (
                                    <div className="min-h-[100px]">
                                        {isCommenting && (
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs">
                                                <Loader2 className="animate-spin" size={14} />
                                                <span>{t.analysis.coachPending}</span>
                                            </div>
                                        )}
                                        {!isCommenting && comments[currentIndex] && (
                                            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-snug">
                                                <ReactMarkdown
                                                    components={{
                                                        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-snug">{children}</p>,
                                                    }}
                                                >
                                                    {comments[currentIndex]}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                        {!isCommenting && !comments[currentIndex] && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4 uppercase tracking-widest font-bold">{t.analysis.coachPending}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Technical Stats Panel - Swapped to second */}
                            <div className="lg:col-span-2 order-2 bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-200 dark:border-gray-700 p-4 md:p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.analysis.title}</h2>
                                    {possibleOpenings.length > 0 && (
                                        <button
                                            onClick={() => setShowOpeningsModal(true)}
                                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-bold transition-colors"
                                        >
                                            {t.analysis.opening}: {possibleOpenings.length === 1
                                                ? `${possibleOpenings[0].name} (${possibleOpenings[0].eco})`
                                                : `${possibleOpenings.length} ${t.analysis.possibleOpenings}`
                                            }
                                        </button>
                                    )}
                                </div>
                                {currentIndex === 0 ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold text-center py-8">{t.analysis.currentPosition}</p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                            <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                                                <div className="font-bold text-gray-400 uppercase tracking-widest mb-1">{t.analysis.step}</div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">#{currentIndex} - {steps[currentIndex - 1]?.san}</div>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                                                <div className="font-bold text-gray-400 uppercase tracking-widest mb-1">{t.analysis.evaluation}</div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatEval(currentDetails?.evalAfter)}</div>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                                                <div className="font-bold text-gray-400 uppercase tracking-widest mb-1">{t.analysis.cpLoss}</div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCpLoss(currentDetails?.cpLoss)}</div>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                                                <div className="font-bold text-gray-400 uppercase tracking-widest mb-1">{t.analysis.bestMove}</div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{currentDetails?.bestMoveSan || t.analysis.enginePending}</div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                                            <div className="font-bold text-gray-400 uppercase tracking-widest mb-2 text-[10px]">{t.analysis.missedTactics}</div>
                                            {tacticSummary.length === 0 && (
                                                <p className="text-xs text-gray-500 italic">{t.analysis.none}</p>
                                            )}
                                            {tacticSummary.length > 0 && (
                                                <ul className="list-disc pl-5 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                                                    {tacticSummary.map((tactic, idx) => (
                                                        <li key={`${tactic.move}-${idx}`} className="leading-snug">
                                                            <span className="font-bold">{tactic.tactic_type}</span>
                                                            {tactic.material_delta ? <span className="text-gray-500 ml-1"> (~{(tactic.material_delta / 100).toFixed(1)} pawns)</span> : ""}
                                                            {tactic.affected_squares ? <span className="text-gray-400 text-[10px] ml-1"> on {tactic.affected_squares.join(", ")}</span> : ""}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Game Import Modal */}
            {showImportModal && (
                <GameImportModal
                    onClose={() => setShowImportModal(false)}
                    onSelectGame={handleImportGame}
                    language={language}
                />
            )}

            {/* Openings Explorer Modal */}
            {showOpeningsModal && possibleOpenings.length > 0 && (
                <OpeningsModal
                    openings={possibleOpenings}
                    currentFen={currentFen}
                    language={language}
                    personality={selectedPersonality}
                    onClose={() => setShowOpeningsModal(false)}
                />
            )}

            {/* Play From Position Modal */}
            {showPlayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t.analysis.playFromHere}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{t.analysis.playDescription}</p>
                            </div>
                            <button
                                onClick={() => setShowPlayModal(false)}
                                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                aria-label={t.common.close}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t.analysis.chooseOpponent}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {PERSONALITIES.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setPlayPersonality(p)}
                                            className={`p-3 rounded-lg border flex items-center gap-2 ${playPersonality.id === p.id
                                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                                : "border-gray-200 dark:border-gray-700"}`}
                                        >
                                            <span className="text-xl">{p.image}</span>
                                            <div className="text-left">
                                                <div className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{p.description}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t.analysis.chooseSide}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(["white", "black"] as const).map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setPlayColor(color)}
                                                className={`py-2 px-3 rounded-lg border text-sm font-medium ${playColor === color
                                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                                    : "border-gray-200 dark:border-gray-700"}`}
                                            >
                                                {color === "white" ? t.game.white : t.game.black}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t.analysis.chooseStrength}</p>
                                    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                                        <div className="text-sm text-gray-700 dark:text-gray-200 mb-1">{t.game.stockfishStrength}: {playStrength}</div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="20"
                                            value={playStrength}
                                            onChange={(e) => setPlayStrength(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t.game.depth}: {playStrength}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowPlayModal(false)}
                                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                {t.common.cancel}
                            </button>
                            <button
                                onClick={handleStartGameFromPosition}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow"
                            >
                                {t.analysis.startPlay}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
