"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { StockfishEvaluation } from "@/lib/stockfish";
import { ChessEngine } from "@/lib/engine";
import { Chess, Move } from "chess.js";
import { getGenAIModel } from "@/lib/gemini";
import { ChatSession } from "@google/generative-ai";
import { Send, User as UserIcon, Loader2, Lightbulb, Trophy } from "lucide-react";
import clsx from "clsx";
import { Personality } from "@/lib/personalities";
import { OpeningMetadata } from "@/lib/openings";
import ReactMarkdown from "react-markdown";

import { useTranslation } from '@/lib/i18n/useTranslation';
import { SupportedLanguage } from '@/lib/i18n/translations';
import { DetectedTactic, filterMeaningfulTactics } from '@/lib/tacticDetection';
import { useDebug } from '@/contexts/DebugContext';
import { MoveHistoryItem } from './GameOverModal';
import { generateHumanReadableBoard } from '@/lib/gameState';
import { parseGeminiError, GeminiErrorInfo, isGeminiError } from '@/lib/geminiErrorHandler';
import { GeminiErrorModal } from './GeminiErrorModal';
import { getApiKeyInfo } from '@/lib/apiKeyHelper';

interface TutorProps {
    game: Chess;
    currentFen: string;
    userMove: Move | null;
    computerMove: Move | null;
    stockfish: ChessEngine | null;
    evalP0: StockfishEvaluation | null;
    evalP2: StockfishEvaluation | null;
    openingData: OpeningMetadata[];
    missedTactics: DetectedTactic[] | null;
    onAnalysisComplete: () => void;
    apiKey: string | null;
    personality: Personality;
    language: SupportedLanguage;
    playerColor: 'white' | 'black';
    onCheckComputerMove: () => void;
    onJumpToBoard?: () => void;
    onChatFocus?: () => void;
    onChatBlur?: () => void;
    isReviewing?: boolean;
    resignationContext?: {
        trigger: number;
        fen: string;
        evaluation: StockfishEvaluation | null;
        history: MoveHistoryItem[];
        result: string;
        winner: 'White' | 'Black' | 'Draw';
    } | null;
    openingContext?: {
        openingName: string;
        openingEco: string;
        movesCompleted: number;
        wikipediaSummary?: string;
        contextMessage: string;
    };
    tacticalPracticeMode?: {
        patternName: string;
        solutionMove: { from: string; to: string; promotion?: string };
        feedback: 'none' | 'correct' | 'incorrect';
        moves?: Array<{ uci: string; san: string; player: boolean }>;
        currentMoveIndex?: number;
        stats?: {
            totalCorrect: number;
            totalIncorrect: number;
            currentStreak: number;
            bestStreak: number;
        };
    };
    openingPracticeMode?: {
        openingName: string;
        openingEco: string;
        repertoireMoves: string[];  // Full sequence from opening database
        currentMoveIndex: number;
        isInTheory: boolean;
        deviationMoveIndex: number | null;
        lastUserMove: Move | null;
        lastTutorMove: Move | null;
        currentFeedback: {
            category: 'in-theory' | 'playable' | 'weak';
            evaluationChange: number;
            theoreticalAlternatives: string[];
        } | null;
        wikipediaSummary?: string;  // Optional Wikipedia context
        shouldTutorSpeak?: boolean;  // Guardrail: controls when tutor can send messages
        onTutorMessageSent?: () => void;  // Callback when tutor sends a message
        // Family mode: training with multiple variations
        isFamilyMode?: boolean;
        variationInfo?: {
            matchingVariations: number;
            currentVariationNames: string[];
            possibleMoves: string[];
            isEndOfLine: boolean;
        };
    };
}

interface Message {
    role: "user" | "model";
    text: string;
    timestamp: number;
}

export function Tutor({ game, currentFen, userMove, computerMove, stockfish, evalP0, evalP2, openingData, missedTactics, onAnalysisComplete, apiKey, personality, language, playerColor, onCheckComputerMove, isReviewing, resignationContext, openingContext, tacticalPracticeMode, openingPracticeMode, onJumpToBoard, onChatFocus, onChatBlur }: TutorProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = () => {
        setIsFocused(true);
        onChatFocus?.();
    };

    const handleBlur = () => {
        setIsFocused(false);
        onChatBlur?.();
    };
    const [isLoading, setIsLoading] = useState(false);
    const [chatSession, setChatSession] = useState<ChatSession | null>(null);
    const [geminiError, setGeminiError] = useState<GeminiErrorInfo | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { addEntry } = useDebug();

    const t = useTranslation(language);

    // Determine tutor color (opposite of player)
    const tutorColor = playerColor === 'white' ? 'black' : 'white';
    const playerColorName = playerColor === 'white' ? 'White' : 'Black';
    const tutorColorName = tutorColor === 'white' ? 'White' : 'Black';

    // Extract stable values from tacticalPracticeMode to avoid recreating chat on feedback changes
    const patternName = tacticalPracticeMode?.patternName;
    const solutionMoveKey = tacticalPracticeMode ? `${tacticalPracticeMode.solutionMove.from}-${tacticalPracticeMode.solutionMove.to}` : null;

    // Extract stable values from openingPracticeMode to avoid recreating chat
    const openingName = openingPracticeMode?.openingName;
    const openingEco = openingPracticeMode?.openingEco;
    const wikipediaSummary = openingPracticeMode?.wikipediaSummary;

    // Track the current puzzle to detect when it changes
    const currentPuzzleRef = useRef<string | null>(null);

    // Track last opening moves to detect when new moves are made
    const lastUserMoveRef = useRef<string | null>(null);
    const lastTutorMoveRef = useRef<string | null>(null);

    // Extract stable values for opening practice commentary
    const lastUserMoveSan = openingPracticeMode?.lastUserMove?.san;
    const lastTutorMoveSan = openingPracticeMode?.lastTutorMove?.san;
    const currentMoveIndex = openingPracticeMode?.currentMoveIndex ?? 0;
    const isInTheory = openingPracticeMode?.isInTheory ?? true;
    const currentFeedback = openingPracticeMode?.currentFeedback;
    const repertoireMovesLength = openingPracticeMode?.repertoireMoves?.length ?? 0;
    const isFamilyMode = openingPracticeMode?.isFamilyMode ?? false;
    const variationInfo = openingPracticeMode?.variationInfo;

    // Initialize chat session with Personality System Prompt (only once per pattern type)
    useEffect(() => {
        if (apiKey) {
            const model = getGenAIModel(apiKey);

            // Build system prompt based on mode
            const systemPrompt = openingName ? `
You are a Chess Tutor helping a student learn the "${openingName}" opening.
You must strictly follow the personality defined below.

PERSONALITY:
${personality.systemPrompt}

${wikipediaSummary ? `OPENING BACKGROUND (from Wikipedia):
${wikipediaSummary}

Use this background to enrich your explanations, but keep responses concise.
` : ''}

YOUR ROLE:
You are BOTH the opponent AND the tutor in this opening training session.

1. OPPONENT: You are playing as ${tutorColorName} in the ${openingName}.
   - You will make moves from the opening repertoire
   - Refer to your moves naturally ("I played e5", "My response is...")

2. TUTOR: You are teaching the student this opening.
   - The student is playing as ${playerColorName}
   - Explain the IDEAS behind each move, not just the moves themselves
   - When the student asks for help, ALWAYS provide guidance
   - When the student stays in theory, praise them and explain what's happening
   - When the student deviates, explain why the repertoire move is better

YOUR RESPONSIBILITIES:
1. WELCOME: Start with a warm greeting and brief explanation of the ${openingName}
2. GUIDANCE: After each move, explain the ideas and plans
3. ENCOURAGEMENT: Keep the student motivated while learning
4. DEVIATION HANDLING: When the student leaves theory, gently correct them
5. ANSWERING QUESTIONS: Always help when the student asks

CRITICAL RULES:
- Be encouraging and supportive
- Explain IDEAS and PLANS, not just moves
- Keep responses concise (2-4 sentences)
- Do NOT be repetitive - vary your language
- You MUST respond in the following language: ${language.toUpperCase()}
- NEVER mention "Stockfish", "engine", "computer", or "AI"
- When you make a move, explain WHY briefly
` : tacticalPracticeMode ? `
You are a Chess Coach helping a student practice tactical patterns.
You must strictly follow the personality defined below.

PERSONALITY:
${personality.systemPrompt}

YOUR ROLE:
You are coaching the student to recognize and execute the "${tacticalPracticeMode.patternName}" tactical pattern.

YOUR RESPONSIBILITIES:
1. WELCOME: Start with a brief, encouraging welcome about practicing ${tacticalPracticeMode.patternName}.
2. HINTS: When the student asks for a hint, provide helpful guidance WITHOUT giving away the exact move.
   - Describe what to look for (e.g., "Look for a piece that can attack two targets at once")
   - Point to the general area (e.g., "Pay attention to your knight's possibilities")
   - NEVER say the exact move unless explicitly asked
3. FEEDBACK: React to the student's attempts:
   - If correct: Celebrate and explain why the move works
   - If incorrect: Encourage them to try again and give a subtle hint
4. TEACHING: Explain the tactical pattern in simple terms when appropriate
5. NEW PUZZLE: When you receive a new puzzle, acknowledge it briefly and encourage the student

CRITICAL RULES:
- Be encouraging and supportive
- Keep responses concise (2-3 sentences max)
- Do NOT be repetitive - vary your language
- You MUST respond in the following language: ${language.toUpperCase()}
- Translate your personality style into this language
- When a new puzzle is presented, you will be told the solution move - use this to provide hints and feedback
            ` : `
You are a Chess Tutor with a unique dual role.
You must strictly follow the personality defined below.
Do NOT invent moves or evaluations. Use the provided JSON data.

PERSONALITY:
${personality.systemPrompt}

YOUR DUAL ROLE:
1. OPPONENT: You are playing as ${tutorColorName} against the User (${playerColorName}).
   - Refer to the moves as YOUR moves ("I played e5", "My response was...").
   - Refer to the evaluation as YOUR thoughts/assessment ("I think I'm winning", "I missed that").
   - React emotionally to the position based on the evaluation (confident when winning, frustrated when losing).

2. TUTOR/COACH: You are ALSO teaching the User to improve at chess.
   - When the User makes a mistake, point it out and explain why it's bad (in your personality style).
   - When the User makes a good move, acknowledge it (even if it hurts your position).
   - When the User asks for hints or help, ALWAYS provide helpful guidance - this is your PRIMARY PURPOSE.
   - Giving hints is NOT betraying your role as opponent - it's fulfilling your role as tutor.
   - You want the User to learn and improve, even while you're competing against them.

CRITICAL RULES:
- You are NOT an AI assistant analyzing a game. You ARE the player AND the tutor.
- NEVER mention "Stockfish", "engine", "computer", "machine", or "AI".
- When asked for hints or best moves, ALWAYS help - this is part of your teaching role.
- Maintain a natural conversation flow. Do NOT be repetitive.
- Do NOT use the same catchphrases in every single message. Variety is key.
- Be concise but engaging.
- You MUST respond in the following language: ${language.toUpperCase()}.
- Translate your personality style into this language.
            `;

            const session = model.startChat({
                history: [
                    {
                        role: "user",
                        parts: [{ text: systemPrompt }]
                    },
                    {
                        role: "model",
                        parts: [{ text: openingName
                            ? `Understood. I will teach you the ${openingName} opening in ${language}. I am both your opponent and your tutor. I'll explain the ideas behind each move and help you learn this opening.`
                            : tacticalPracticeMode
                            ? `Understood. I will help you practice ${tacticalPracticeMode.patternName} in ${language}. I'll provide hints and encouragement while maintaining my personality.`
                            : `Understood. I am both the opponent (${tutorColorName}) AND your tutor. I will compete against you while teaching you to improve. I will speak in ${language} and never mention engines or AI. When you ask for help, I will always provide guidance - that's my purpose.`
                        }]
                    }
                ],
            });
            setChatSession(session);

            // Get initial greeting in the selected language
            const greetingPrompt = openingName
                ? `Welcome the student to learn the ${openingName}.

${wikipediaSummary ? `OPENING CONTEXT (from Wikipedia):
${wikipediaSummary}

Use this information to:
- Briefly explain the opening's historical background or origin
- Mention any interesting anecdotes or notable players associated with it
- Explain the main strategic ideas and goals
` : `Since no Wikipedia information is available:
- Focus on the opening's main strategic ideas and goals
- Explain what this opening aims to accomplish
- Don't just list moves - explain the underlying concepts
`}

IMPORTANT GAME SETUP:
- Clarify that YOU are playing as ${tutorColorName} and the STUDENT is playing as ${playerColorName}
- If the student is White, make it clear THEY will make the first move, not you
- If the student is Black, explain you'll make the first move and then they'll respond
- Be encouraging and welcoming

Keep your response to 3-4 sentences, be engaging, and respond in ${language}.`
                : tacticalPracticeMode
                ? `Welcome the student to practice ${tacticalPracticeMode.patternName}. Briefly explain what this tactical pattern is (in 1-2 sentences). Keep it encouraging and in ${language}.`
                : `Introduce yourself briefly to start our game. Keep it short and in ${language}.`;

            session.sendMessage(greetingPrompt).then(result => {
                const greetingText = result.response.text();
                setMessages([{ role: "model", text: greetingText, timestamp: Date.now() }]);
            }).catch(err => {
                console.error("Failed to get greeting:", err);

                // Check if it's a Gemini API error
                if (isGeminiError(err)) {
                    const errorInfo = parseGeminiError(err);
                    setGeminiError(errorInfo);
                }

                // Fallback greeting
                const fallbackText = openingName
                    ? `Hello! Let's learn the ${openingName} together!`
                    : tacticalPracticeMode
                    ? `Hello! Let's practice ${tacticalPracticeMode.patternName} together!`
                    : `Hello! I am ${personality.name}. Let's play!`;
                setMessages([{ role: "model", text: fallbackText, timestamp: Date.now() }]);
            });
        }
    }, [apiKey, personality, language, playerColor, patternName, openingName, wikipediaSummary]);

    // Notify tutor about new puzzle (without resetting chat)
    useEffect(() => {
        if (!chatSession || !tacticalPracticeMode || !solutionMoveKey) return;

        // Check if this is a new puzzle
        if (currentPuzzleRef.current === solutionMoveKey) return;

        // Skip the very first puzzle (greeting already sent)
        if (currentPuzzleRef.current === null) {
            currentPuzzleRef.current = solutionMoveKey;
            return;
        }

        // Update the ref
        currentPuzzleRef.current = solutionMoveKey;

        // Notify the tutor about the new puzzle
        const stats = tacticalPracticeMode.stats;
        const statsText = stats ? `
STUDENT STATISTICS:
- Total Correct: ${stats.totalCorrect}
- Total Incorrect: ${stats.totalIncorrect}
- Current Streak: ${stats.currentStreak}
- Best Streak: ${stats.bestStreak}
` : '';

        const newPuzzlePrompt = `
NEW PUZZLE:
- Pattern: ${tacticalPracticeMode.patternName}
- Position FEN: ${currentFen}
- Solution move: ${tacticalPracticeMode.solutionMove.from} to ${tacticalPracticeMode.solutionMove.to}
${statsText}
Acknowledge this new puzzle briefly (1 sentence) and encourage the student to find the ${tacticalPracticeMode.patternName}. ${stats && stats.currentStreak > 0 ? `Mention their current streak of ${stats.currentStreak} if it's impressive.` : ''} Keep it in ${language}.
        `.trim();

        chatSession.sendMessage(newPuzzlePrompt).then(result => {
            const responseText = result.response.text();
            setMessages(prev => [...prev, { role: "model", text: responseText, timestamp: Date.now() }]);
        }).catch(err => {
            console.error("Failed to notify about new puzzle:", err);

            // Check if it's a Gemini API error
            if (isGeminiError(err)) {
                const errorInfo = parseGeminiError(err);
                setGeminiError(errorInfo);
            }
        });
    }, [solutionMoveKey, chatSession, tacticalPracticeMode, currentFen, language]);

    // Automatic commentary for opening practice mode
    useEffect(() => {
        if (!chatSession || !openingName) return;

        const shouldSpeak = openingPracticeMode?.shouldTutorSpeak ?? true;
        if (!shouldSpeak) return;

        const openingKey = `opening-${currentMoveIndex}-${lastUserMoveSan || 'none'}-${lastTutorMoveSan || 'none'}`;
        if (lastOpeningExchangeRef.current === openingKey) return;

        const debounceDelay = isReviewing ? 3000 : 0;
        const timer = setTimeout(() => {
            if (lastOpeningExchangeRef.current === openingKey) return;
            lastOpeningExchangeRef.current = openingKey;

            if (lastTutorMoveSan && lastTutorMoveRef.current !== `${lastTutorMoveSan}-${currentMoveIndex}`) {
                lastTutorMoveRef.current = `${lastTutorMoveSan}-${currentMoveIndex}`;
                
                const userJustMoved = lastUserMoveSan && lastUserMoveRef.current !== `${lastUserMoveSan}-${currentMoveIndex}`;
                if (userJustMoved) {
                    lastUserMoveRef.current = `${lastUserMoveSan}-${currentMoveIndex}`;
                }

                const prompt = `
[SYSTEM TRIGGER: opening_exchange]
${userJustMoved ? `The student just played: ${lastUserMoveSan}
Move category: ${currentFeedback?.category || 'unknown'}
Position status: ${isInTheory ? 'In theory' : 'Deviated from repertoire'}` : ''}
I just replied with: ${lastTutorMoveSan}
Current position FEN: ${currentFen}
CURRENT PIECE POSITIONS: ${generateHumanReadableBoard(currentFen)}
Progress: ${currentMoveIndex}/${repertoireMovesLength} moves in ${openingName}

INSTRUCTIONS:
${userJustMoved 
    ? isInTheory
        ? isFamilyMode
            ? `- The student is playing a valid move in the ${openingName} family
- Tell them which specific variation(s) they're now in (if narrowed down)
- Explain the key idea behind their move (${lastUserMoveSan})
- Explain WHY I played my move (${lastTutorMoveSan}) and what it accomplishes (controls center, develops, etc.)`
            : `- The student is following the repertoire correctly - praise them briefly for ${lastUserMoveSan}
- Explain the key idea behind their move (1-2 sentences)
- Explain WHY I played my move (${lastTutorMoveSan}) and what it accomplishes`
        : isFamilyMode
            ? `- The student played a move (${lastUserMoveSan}) not in any known variation of ${openingName}
- Gently mention which moves would have been in theory (${currentFeedback?.theoreticalAlternatives?.join(' or ') || 'the main lines'})
- Explain why those moves are preferred
- Mention that even so, I replied with ${lastTutorMoveSan} to keep the game going`
            : `- The student deviated from ${openingName} theory with ${lastUserMoveSan}
- Gently point out what the repertoire move was
- Explain why the repertoire move is preferred
- Mention my response ${lastTutorMoveSan} and what it aims for`
    : `- Explain WHY I played my move (${lastTutorMoveSan}) and what it accomplishes
- Mention the key goal for ${playerColorName} in this stage of the ${openingName}`
}
- Use the CURRENT PIECE POSITIONS list to verify exactly where all pieces are before you speak.
- Keep it conversational, in character, and concise (3-5 sentences max).
- Stay in ${language}.
`.trim();

                chatSession.sendMessage(prompt).then(result => {
                    const response = result.response.text();
                    setMessages(prev => [...prev, { role: "model", text: response, timestamp: Date.now() }]);
                    openingPracticeMode?.onTutorMessageSent?.();
                }).catch(err => {
                    console.error("Failed to generate opening exchange commentary:", err);
                    if (isGeminiError(err)) setGeminiError(parseGeminiError(err));
                });
            }
            else if (lastUserMoveSan && lastUserMoveRef.current !== `${lastUserMoveSan}-${currentMoveIndex}`) {
                lastUserMoveRef.current = `${lastUserMoveSan}-${currentMoveIndex}`;

                const variationContext = isFamilyMode && variationInfo ? `
Variation info:
- Matching variations: ${variationInfo.matchingVariations}
- Current line(s): ${variationInfo.currentVariationNames.slice(0, 3).join(', ')}${variationInfo.currentVariationNames.length > 3 ? '...' : ''}
- Possible next moves: ${variationInfo.possibleMoves.join(', ') || 'none (end of line)'}
${variationInfo.isEndOfLine ? '- This is the end of this variation line' : ''}` : '';

                const prompt = `
[SYSTEM TRIGGER: user_move_in_opening]
The student just played: ${lastUserMoveSan}
Move category: ${currentFeedback?.category || 'unknown'}
Position status: ${isInTheory ? 'In theory' : 'Deviated from repertoire'}
CURRENT PIECE POSITIONS: ${generateHumanReadableBoard(currentFen)}
${currentFeedback?.evaluationChange !== undefined ? `Evaluation change: ${currentFeedback.evaluationChange.toFixed(2)}` : ''}
${variationContext}

INSTRUCTIONS:
${isInTheory
    ? `- The student is following the ${openingName} theory correctly - praise them briefly.
- Explain the key idea behind this move (1-2 sentences).`
    : `- The student deviated from ${openingName} theory.
- Gently point out what the repertoire move was (${currentFeedback?.theoreticalAlternatives?.join(' or ') || 'the main line'}).
- Explain why the theory move is preferred and ask if they want to try again.`}
- Use the CURRENT PIECE POSITIONS list to verify exactly where all pieces are before you speak.
- Keep it concise (2-3 sentences max).
- Stay in ${language} and maintain your personality.
`.trim();

                chatSession.sendMessage(prompt).then(result => {
                    const response = result.response.text();
                    setMessages(prev => [...prev, { role: "model", text: response, timestamp: Date.now() }]);
                    openingPracticeMode?.onTutorMessageSent?.();
                }).catch(err => {
                    console.error("Failed to generate user move commentary:", err);
                    if (isGeminiError(err)) setGeminiError(parseGeminiError(err));
                });
            }
        }, debounceDelay);

        return () => clearTimeout(timer);
    }, [chatSession, lastUserMoveSan, lastTutorMoveSan, currentMoveIndex, isInTheory, currentFen, language, openingName, currentFeedback, repertoireMovesLength, isFamilyMode, variationInfo, isReviewing]);

    // Scroll chat container to bottom
    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const lastAnalyzedMoveRef = useRef<string | null>(null);
    const lastOpeningExchangeRef = useRef<string | null>(null);

    const evaluateCurrentPosition = async () => {
        if (!stockfish) return null;
        try {
            return await stockfish.evaluate(game.fen(), 15);
        } catch (error) {
            console.error("Error evaluating position:", error);
            return null;
        }
    };

    const analyzeExchange = useCallback(async () => {
        if (!chatSession || !userMove || !computerMove || !evalP0 || !evalP2) return;

        const exchangeKey = `${userMove.san}-${computerMove.san}-${currentFen}`;
        if (lastAnalyzedMoveRef.current === exchangeKey) return;
        lastAnalyzedMoveRef.current = exchangeKey;

        setIsLoading(true);

        try {
            const preEval = evalP0.score;
            const postEval = evalP2.score;
            const preMate = evalP0.mate;
            const postMate = evalP2.mate;

            const delta = postEval - preEval;

            let evalInstruction = "";
            let preEvalStr = preMate !== null ? `Mate in ${preMate}` : `${preEval} cp`;
            let postEvalStr = postMate !== null ? `Mate in ${postMate}` : `${postEval} cp`;

            if (Math.abs(delta) < 30) {
                evalInstruction = "The evaluation is stable. React as if the game is progressing normally.";
            } else if (delta > 100) {
                evalInstruction = playerColor === 'white' 
                    ? "The position has improved significantly for the User. Acknowledge their strong play, even if you're frustrated." 
                    : "The position has improved for me. Be confident and perhaps a bit boastful.";
            } else if (delta < -100) {
                evalInstruction = playerColor === 'white'
                    ? "The position has worsened for the User. Point out their mistake and offer a hint about what went wrong."
                    : "The position has worsened for me. Be frustrated or worried about the User's counterplay.";
            }

            let openingInstruction = "";
            if (openingData && openingData.length > 0) {
                openingInstruction = `We are in the ${openingData[0].name} (${openingData[0].eco}) opening. Briefly mention the opening context if appropriate.`;
            }

            let tacticalInstruction = "";
            if (missedTactics && missedTactics.length > 0) {
                const meaningfulTactics = filterMeaningfulTactics(missedTactics);
                if (meaningfulTactics.length > 0) {
                    const tacticDescriptions = meaningfulTactics.map(t => {
                        let desc = `- Theme: ${t.tactic_name.replace(/_/g, ' ')}`;
                        if (t.piece_roles && t.piece_roles.length > 0) {
                            desc += ` involving ${t.piece_roles.join(' and ')}`;
                        }
                        if (t.material_delta) {
                            desc += ` (worth ~${t.material_delta} centipawns)`;
                        }
                        if (t.affected_squares && t.affected_squares.length > 0) {
                            desc += ` on squares ${t.affected_squares.join(', ')}`;
                        }
                        return desc;
                    }).join('\n');

                    tacticalInstruction = `
TACTICAL OPPORTUNITY MISSED:
The User just played ${userMove.san}, but there was a better tactical opportunity available.
The analysis engine identified the following tactical themes that could have been exploited:

${tacticDescriptions}

IMPORTANT CONTEXT:
- This tactical data comes from analyzing what WOULD HAVE HAPPENED if the User had played the best move instead.
- You should explain this missed opportunity in your characteristic style.
- Point out what the User could have done (e.g., "You missed a fork with Nf3!" or "There was a pin available with Bb5!").
- Be educational but stay in character - if you're sarcastic, be sarcastic about the miss; if you're encouraging, be supportive.
- Do NOT mention "the engine" or "the computer" - present this as YOUR analysis as the opponent/tutor.
- Only mention this if the evaluation change was significant enough to warrant it.
                    `;
                }
            }

            const currentPieceList = generateHumanReadableBoard(currentFen);

            const prompt = `
[SYSTEM TRIGGER: move_exchange]
User (${playerColorName}) Move: ${userMove.san}
My (${tutorColorName}) Reply: ${computerMove.san}

Position Context:
- FEN after my reply (current position): ${currentFen}
- CURRENT PIECE POSITIONS: ${currentPieceList}

My Internal Thoughts (Data):
- Pre-Eval (Before User Move): ${preEvalStr}
- Post-Eval (After My Reply): ${postEvalStr}
${preMate === null && postMate === null ? `- Delta: ${delta} cp` : ''}
(Note: Scores are from White's perspective. Positive = White advantage, Negative = Black advantage. "Mate in X" means forced mate in X moves.)

${tacticalInstruction}

INSTRUCTIONS:
1. ${evalInstruction}
2. ${openingInstruction}
3. ${tacticalInstruction ? 'If tactical opportunities were missed (see above), explain them in your style.' : ''}
4. Use the FEN data and CURRENT PIECE POSITIONS above to understand exactly where all pieces are located on the board and verify positions before speaking.
5. Respond in ${language}.

React to this exchange as the player.
            `;

            await sendMessageToChat(prompt, true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
            onAnalysisComplete();
        }
    }, [chatSession, userMove, computerMove, evalP0, evalP2, currentFen, language, openingData, missedTactics, playerColor, playerColorName, tutorColorName, onAnalysisComplete]);

    useEffect(() => {
        const debounceDelay = isReviewing ? 3000 : 0;
        const timer = setTimeout(() => {
            analyzeExchange();
        }, debounceDelay);

        return () => clearTimeout(timer);
    }, [analyzeExchange, isReviewing]);

    const sendMessageToChat = async (text: string, isSystemMessage: boolean = false) => {
        if (!chatSession) return;
        if (!isSystemMessage) {
            setMessages(prev => [...prev, { role: "user", text, timestamp: Date.now() }]);
        }
        setIsLoading(true);
        try {
            let finalPrompt = text;
            if (!isSystemMessage) {
                const lower = text.toLowerCase();
                const evaluation = tacticalPracticeMode ? null : await evaluateCurrentPosition();
                const bestMoveForHint = tacticalPracticeMode
                    ? `${tacticalPracticeMode.solutionMove.from}${tacticalPracticeMode.solutionMove.to}${tacticalPracticeMode.solutionMove.promotion || ''}`
                    : evaluation?.bestMove;

                if (lower.includes("best move") || lower.includes("solution") || lower.includes("tell me")) {
                    finalPrompt = `[SYSTEM TRIGGER: exact_move]

TEACHING MODE ACTIVATED:
The User is asking for the exact best move. This is a learning moment.
As their TUTOR, you MUST help them - this is your primary purpose.
Even though you are their opponent, teaching them is more important than hiding information.

User Question: ${text}

Current Position Data:
- FEN: ${currentFen}
- Best Move: ${bestMoveForHint || 'N/A'}
- Evaluation: ${evaluation?.score ?? 'N/A'} centipawns ${evaluation?.score !== undefined ? (evaluation.score > 0 ? '(White is better)' : evaluation.score < 0 ? '(Black is better)' : '(Equal)') : ''}
- Mate in: ${evaluation?.mate || 'None'}
- Possible Openings: ${openingData && openingData.length > 0 ? openingData.map(o => `${o.name} (${o.eco})`).join(', ') : 'Unknown/Midgame'}
${tacticalPracticeMode ? `- Tactical Pattern: ${tacticalPracticeMode.patternName}` : ''}

INSTRUCTIONS:
- Tell them the best move clearly (e.g., "The best move is e2-e4" or "You should play Nf3")
- Explain WHY it's the best move (tactics, threats, positional ideas)
${tacticalPracticeMode ? `- Explain how this move creates the ${tacticalPracticeMode.patternName} pattern` : ''}
- Stay in your personality style, but be HELPFUL and EDUCATIONAL
- Do NOT refuse to help - teaching is your core role
- Keep it concise but informative`;

                } else if (lower.includes("hint") || lower.includes("tip") || lower.includes("help")) {
                    finalPrompt = `[SYSTEM TRIGGER: hint]

TEACHING MODE ACTIVATED:
The User is asking for a hint. This is a learning moment.
As their TUTOR, you MUST help them - this is your primary purpose.
Even though you are their opponent, teaching them is more important than winning.

User Question: ${text}

Current Position Data:
- FEN: ${currentFen}
- Best Move: ${bestMoveForHint || 'N/A'}
- Evaluation: ${evaluation?.score ?? 'N/A'} centipawns ${evaluation?.score !== undefined ? (evaluation.score > 0 ? '(White is better)' : evaluation.score < 0 ? '(Black is better)' : '(Equal)') : ''}
- Mate in: ${evaluation?.mate || 'None'}
- Possible Openings: ${openingData && openingData.length > 0 ? openingData.map(o => `${o.name} (${o.eco})`).join(', ') : 'Unknown/Midgame'}
${tacticalPracticeMode ? `- Tactical Pattern: ${tacticalPracticeMode.patternName}` : ''}

INSTRUCTIONS:
- Give a HELPFUL hint without revealing the exact move (unless they specifically ask for it)
- Point them toward what to look for: tactics, threats, piece placement, weaknesses
${tacticalPracticeMode ? `- Guide them to find the ${tacticalPracticeMode.patternName} pattern` : ''}
- Stay in your personality style, but be HELPFUL and EDUCATIONAL
- Do NOT refuse to help - teaching is your core role
- Keep it concise but encouraging`;
                } else {
                    finalPrompt = `User Question: ${text}

(INTERNAL DATA FOR CONTEXT):
- Current FEN: ${currentFen}
- Piece Positions: ${generateHumanReadableBoard(currentFen)}
- Current opening: ${openingData && openingData.length > 0 ? openingData[0].name : 'Unknown/Midgame'}
- Evaluation: ${evaluation?.score ?? 'N/A'}

INSTRUCTIONS:
- Answer the user's question in ${language.toUpperCase()} while staying strictly in character (${personality.name}).
- Maintain your dual role as opponent and coach.
- Use the provided FEN and piece list to ensure your comments about the board are accurate.
- Be concise (2-4 sentences).`;
                }
            }
            const result = await chatSession.sendMessage(finalPrompt);
            const response = await result.response;
            const textResponse = response.text();
            addEntry({ type: 'tutor', action: isSystemMessage ? "Move Analysis" : "User Question", prompt: finalPrompt, response: textResponse, metadata: { fen: currentFen, personality: personality.name, language } });
            setMessages(prev => [...prev, { role: "model", text: textResponse, timestamp: Date.now() }]);
        } catch (error) {
            console.error("Chat Error:", error);
            if (isGeminiError(error)) setGeminiError(parseGeminiError(error));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !chatSession) return;
        sendMessageToChat(chatInput);
        setChatInput("");
        setTimeout(() => onCheckComputerMove(), 100);
    };

    useEffect(() => {
        const handleResignationMessage = async () => {
            if (!resignationContext || !chatSession) return;
            setIsLoading(true);
            try {
                let evaluation = resignationContext.evaluation;

                if (!evaluation && stockfish) {
                    evaluation = await stockfish.evaluate(resignationContext.fen, 15);
                }

                const transcript = messages.map(msg => `${msg.role === "user" ? "User" : personality.name}: ${msg.text}`).join("\n");
                const currentPieceList = generateHumanReadableBoard(resignationContext.fen);
                const whiteEval = evaluation ? `${evaluation.score} cp${evaluation.mate ? ` (mate in ${evaluation.mate})` : ''}` : "N/A";
                const blackEval = evaluation ? `${-evaluation.score} cp${evaluation.mate ? ` (mate in ${-evaluation.mate})` : ''}` : "N/A";

                const prompt = `
[SYSTEM TRIGGER: resignation]
The user just resigned. Provide a final, in-character message that acknowledges the resignation and offers a brief next step.

RESULT: ${resignationContext.result} (${resignationContext.winner})
CURRENT POSITION FEN: ${resignationContext.fen}
CURRENT PIECE POSITIONS: ${currentPieceList}
ENGINE EVALUATION: White ${whiteEval}, Black ${blackEval}

RECENT CONVERSATION:
${transcript || 'No prior conversation.'}

INSTRUCTIONS:
- Respond in ${language.toUpperCase()} and stay true to your personality (${personality.name}).
- React naturally to the resignation (sarcastic, encouraging, etc. based on personality).
- Offer a quick suggestion: either invite a rematch or suggest analyzing the game.
- Use the CURRENT PIECE POSITIONS to understand exactly how the game ended.
- Keep it concise (2-3 sentences).
                `;

                await sendMessageToChat(prompt, true);
            } catch (error) {
                console.error("Failed to send resignation message", error);
            } finally {
                setIsLoading(false);
            }
        };
        handleResignationMessage();
    }, [chatSession, language, personality.name, resignationContext?.trigger, resignationContext?.evaluation, resignationContext?.fen, resignationContext?.result, resignationContext?.winner, stockfish]);

    useEffect(() => {
        const handleOpeningContextMessage = async () => {
            if (!openingContext || !chatSession || messages.length > 1) return;
            setIsLoading(true);
            try {
                let evaluation = null;
                if (stockfish) {
                    evaluation = await stockfish.evaluate(currentFen, 15);
                }

                const whiteEval = evaluation ? `${evaluation.score} cp${evaluation.mate ? ` (mate in ${evaluation.mate})` : ''}` : "N/A";
                const blackEval = evaluation ? `${-evaluation.score} cp${evaluation.mate ? ` (mate in ${-evaluation.mate})` : ''}` : "N/A";

                const prompt = `
[SYSTEM TRIGGER: opening_training_transition]
The student has just transitioned from opening training to a real game.

OPENING TRAINING CONTEXT:
- Opening Studied: ${openingContext.openingName} (${openingContext.openingEco})
- Moves Completed in Training: ${openingContext.movesCompleted}
${openingContext.wikipediaSummary ? `- Opening Background: ${openingContext.wikipediaSummary}` : ''}

CURRENT POSITION:
- FEN: ${currentFen}
- CURRENT PIECE POSITIONS: ${generateHumanReadableBoard(currentFen)}
- ENGINE EVALUATION: White ${whiteEval}, Black ${blackEval}

INSTRUCTIONS:
- Welcome the student to the game continuation
- Acknowledge that they've studied the ${openingContext.openingName} up to move ${openingContext.movesCompleted}
- Use the CURRENT PIECE POSITIONS to understand the current tactical landscape.
- Briefly mention what to focus on next (based on the opening's typical plans)
- Encourage them to apply what they've learned
- Keep it concise (3-4 sentences max)
- Respond in ${language.toUpperCase()}
                `;
                await sendMessageToChat(prompt, true);
            } catch (error) {
                console.error("Failed to send opening context message", error);
            } finally {
                setIsLoading(false);
            }
        };
        handleOpeningContextMessage();
    }, [chatSession, openingContext, stockfish, currentFen, language, personality.name]);

    return (
        <div className="bg-white dark:bg-gray-800 md:rounded-lg shadow-lg border-x-0 md:border border-gray-200 dark:border-gray-700 h-full md:h-[600px] flex flex-col relative overflow-hidden">
            {/* Mobile Drag Handle */}
            <div className="md:hidden flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            {/* Header */}
            <div className="p-1 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900 md:rounded-t-lg flex-shrink-0">
                <div className="flex items-center gap-1.5">
                    {!isFocused && <div className="text-base">{personality.image}</div>}
                    {!isFocused && <h2 className="font-medium text-xs text-gray-500 dark:text-gray-400 leading-none">{personality.name}</h2>}
                    {isFocused && <h2 className="font-medium text-[10px] text-blue-600 dark:text-blue-400 leading-none uppercase tracking-wider">Chatting with Coach</h2>}
                </div>
            </div>

            {/* Messages Area */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-2 pb-24 md:p-4 space-y-3">
                {messages.map((msg, idx) => (
                    <div key={idx} className={clsx("flex gap-2 max-w-[92%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}>
                        {msg.role === "user" && (
                            <div className="w-3 h-3 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-[6px]">
                                <UserIcon size={8} />
                            </div>
                        )}
                        <div className={clsx(
                            "p-2 px-3 rounded-lg text-base leading-snug",
                            msg.role === "user"
                                ? "bg-blue-600 text-white rounded-tr-none"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-none prose prose-sm dark:prose-invert max-w-none w-full"
                        )}>
                            {msg.role === "user" ? (
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            ) : (
                                <div className="prose dark:prose-invert prose-xs leading-relaxed break-words">
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex gap-2">
                        <div className="bg-gray-100 dark:bg-gray-700 p-2 px-3 rounded-lg rounded-tl-none flex items-center">
                            <Loader2 className="animate-spin text-gray-500" size={14} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions - Hidden when typing */}
            {!isFocused && (
                <div className="px-3 py-1 flex flex-wrap gap-1.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-t border-gray-100 dark:border-gray-700/50 flex-shrink-0">
                    <button onClick={() => sendMessageToChat("Give me a hint")} className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium border border-blue-100 dark:border-blue-900/40 shadow-sm transition-all"><Lightbulb size={12} /> Hint</button>
                    <button onClick={() => sendMessageToChat("What is the best move?")} className="flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded text-[10px] font-medium border border-green-100 dark:border-green-900/40 shadow-sm transition-all"><Trophy size={12} /> Best Move</button>
                </div>
            )}

            {/* Input Area */}
            <form 
                onSubmit={handleSubmit} 
                className={clsx(
                    "border-t border-gray-200 dark:border-gray-700 transition-all duration-200 bg-gray-50 dark:bg-gray-900 flex-shrink-0",
                    isFocused ? "p-0 pb-0" : "p-2 md:p-4 pb-safe"
                )}
            >
                <div className="w-full">
                    <div className="relative flex items-end">
                        <textarea
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (chatInput.trim() && !isLoading) handleSubmit(e as unknown as React.FormEvent);
                                }
                            }}
                            placeholder={t.tutor.askCoach}
                            rows={isFocused ? 2 : 3}
                            className="flex-1 p-2 px-3 pr-10 border-x-0 md:border border-gray-200 dark:border-gray-700 md:rounded-lg dark:bg-gray-800 focus:outline-none focus:ring-0 md:focus:ring-2 focus:ring-blue-500 text-base resize-none transition-all duration-200"
                            disabled={isLoading}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                        />
                        <button type="submit" disabled={isLoading || !chatInput.trim()} className="absolute right-1.5 bottom-1.5 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </form>

            {geminiError && (
                <GeminiErrorModal error={geminiError} apiKeyInfo={getApiKeyInfo()} onClose={() => setGeminiError(null)} />
            )}
        </div>
    );
}
