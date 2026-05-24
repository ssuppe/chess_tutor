'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { OpeningMetadata } from '@/lib/openings';
import { useOpeningTraining, useChessInstance } from '@/contexts/OpeningTrainingContext';
import { loadSession } from '@/lib/openingTrainer/sessionManager';
import {
  parseMoveSequence,
  getUserColor,
  VariationTree,
  getAllPossibleNextMoves,
  identifyCurrentVariation,
  isMoveInVariationTree,
  describeCurrentPosition,
} from '@/lib/openingTrainer/gameLogic';
import { getWikipediaSummary } from '@/lib/openingTrainer/wikipediaService';
import { WikipediaSummary as WikipediaSummaryType } from '@/types/openingTraining';
import { extractFamilyName } from '@/lib/openingTrainer/openingFamilies';
import WikipediaSummary from './WikipediaSummary';
import DeviationDialog from './DeviationDialog';
import { Tutor } from '@/components/Tutor';
import { Personality } from '@/lib/personalities';
import { SupportedLanguage } from '@/lib/i18n/translations';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, X } from 'lucide-react';
import clsx from 'clsx';
import { CapturedPieces } from '@/components/CapturedPieces';
import { getCapturedState } from '@/lib/gameState';
import { EvaluationBar } from '@/components/EvaluationBar';
import { TopUtilityLinks } from '@/components/TopUtilityLinks';
import { BoardViewLayout } from '@/components/BoardViewLayout';

interface OpeningTrainerProps {
  opening: OpeningMetadata;
  personality: Personality;
  apiKey: string;
  language: SupportedLanguage;
  // Family training mode - allows multiple variations
  variationTree?: VariationTree;
  allVariations?: OpeningMetadata[];
}

export default function OpeningTrainer({
  opening,
  personality,
  apiKey,
  language,
  variationTree,
  allVariations,
}: OpeningTrainerProps) {
  const router = useRouter();
  const isFamilyMode = !!variationTree && !!allVariations;

  const {
    session,
    stockfish,
    currentFeedback,
    initializeSession,
    makeMove,
    undoToMove,
    navigateToMove,
  } = useOpeningTraining();

  // Get Chess instance on-demand from current FEN
  const chess = useChessInstance(session);

  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
    'white'
  );
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [existingSession, setExistingSession] = useState<any>(null);
  const [wikipediaSummary, setWikipediaSummary] = useState<WikipediaSummaryType | null>(null);

  // Mobile UX States
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isMobileBoardExpanded, setIsMobileBoardExpanded] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportOffset, setViewportOffset] = useState<number>(0);
  const [latestCoachMessage, setLatestCoachMessage] = useState<string | null>(null);

  // Tutor message control - track when tutor last spoke
  const [lastTutorMessageMoveIndex, setLastTutorMessageMoveIndex] = useState<number>(-1);

  // Deviation handling
  const [showDeviationDialog, setShowDeviationDialog] = useState(false);

  // Track actual visual viewport height and offset for keyboard awareness
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateViewport = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      const offset = window.visualViewport?.offsetTop || 0;
      setViewportHeight(height);
      setViewportOffset(offset);
      if (offset > 0) window.scrollTo(0, 0);
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

  // ============================================================================
  // Tutor Message Guardrail (computed values - must be before early returns)
  // ============================================================================

  const moveCount = session?.moveHistory.length ?? 0;
  const userColor = getUserColor(opening);

  // Determine when tutor should be allowed to speak
  const shouldTutorSpeak = useMemo(() => {
    if (!session || moveCount === 0) {
      // At start, tutor can give initial greeting
      return lastTutorMessageMoveIndex === -1;
    }

    // Check if we've had new moves since tutor last spoke
    const newMovesSinceLastMessage = moveCount - lastTutorMessageMoveIndex;

    if (session.deviationMoveIndex !== null) {
      // Off-book: Tutor speaks immediately after player's deviation
      return newMovesSinceLastMessage >= 1;
    }

    // In theory: Wait for both player AND opponent to move
    const isAtEndOfRepertoire = session.phase === 'end_of_repertoire';
    const movesNeeded = isAtEndOfRepertoire ? 1 : 2;

    return newMovesSinceLastMessage >= movesNeeded;
  }, [session, moveCount, lastTutorMessageMoveIndex]);

  // Detect deviation and show dialog
  useEffect(() => {
    if (session?.deviationMoveIndex !== null && !showDeviationDialog) {
      const timer = setTimeout(() => {
        setShowDeviationDialog(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [session?.deviationMoveIndex, showDeviationDialog]);

  useEffect(() => {
    checkForExistingSession();
  }, [opening.eco]);

  // Fetch Wikipedia summary for the opening
  useEffect(() => {
    const fetchWikipediaSummary = async () => {
      try {
        const familyName = extractFamilyName(opening.name);
        const summary = await getWikipediaSummary(familyName);
        setWikipediaSummary(summary);
      } catch (err) {
        console.error('Failed to fetch Wikipedia summary:', err);
      }
    };

    fetchWikipediaSummary();
  }, [opening.name]);

  const checkForExistingSession = () => {
    const saved = loadSession(opening.eco);

    if (saved && saved.moveHistory.length > 0) {
      setExistingSession(saved);
      setShowRecoveryDialog(true);
      setIsInitializing(false);
    } else {
      initSession(false);
    }
  };

  const initSession = async (forceNew: boolean = false) => {
    setIsInitializing(true);
    setError(null);
    setShowRecoveryDialog(false);

    try {
      await initializeSession(opening, forceNew);
      const orientation = ['D', 'E'].includes(opening.eco[0]) ? 'black' : 'white';
      setBoardOrientation(orientation);
    } catch (err) {
      console.error('Session initialization error:', err);
      setError('Failed to initialize training session');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleResumeSession = () => initSession(false);
  const handleStartFresh = () => initSession(true);

  const handlePieceDrop = (sourceSquare: string, targetSquare: string): boolean => {
    if (!chess) return false;
    try {
      const testChess = new Chess();
      testChess.loadPgn(chess.pgn());
      let move;
      try {
        move = testChess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      } catch (e) { return false; }
      if (move === null) return false;
      makeMove(move.san);
      return true;
    } catch (error) {
      console.error('Unexpected error in handlePieceDrop:', error);
      return false;
    }
  };

  const handleUndoDeviation = () => {
    if (!session || session.deviationMoveIndex === null) return;
    const targetIndex = session.deviationMoveIndex - 1;
    undoToMove(targetIndex);
    setShowDeviationDialog(false);
  };

  const handleStartGameFromPosition = () => {
    if (!session || !chess) return;
    const gameStartData = { fen: session.currentFEN, personalityId: personality.id, color: getUserColor(opening), stockfishDepth: 15 };
    localStorage.setItem('chess_tutor_pending_game', JSON.stringify(gameStartData));
    const openingContext = {
      openingName: opening.name,
      openingEco: opening.eco,
      movesCompleted: session.deviationMoveIndex || session.moveHistory.length,
      wikipediaSummary: wikipediaSummary?.extract,
      contextMessage: `You've studied the ${opening.name} (${opening.eco}) up to move ${session.deviationMoveIndex || session.moveHistory.length}. Let's continue playing from here!`,
    };
    localStorage.setItem('chess_tutor_opening_context', JSON.stringify(openingContext));
    router.push('/');
  };

  const handleContinueExploring = () => setShowDeviationDialog(false);
  const handleTutorMessageSent = () => setLastTutorMessageMoveIndex(moveCount);

  const variationPositionInfo = useMemo(() => {
    if (!isFamilyMode || !variationTree || !session) return null;
    const positionDesc = describeCurrentPosition(variationTree, session.moveHistory);
    const currentVariations = identifyCurrentVariation(variationTree, session.moveHistory);
    const possibleMoves = getAllPossibleNextMoves(variationTree, session.moveHistory);
    return { ...positionDesc, currentVariations, possibleMoves, isInAnyVariation: positionDesc.matchingCount > 0 };
  }, [isFamilyMode, variationTree, session]);

  const theoreticalMoves = useMemo(() => {
    if (isFamilyMode && variationPositionInfo) return variationPositionInfo.nextMoves;
    if (!session) return [];
    const moves = parseMoveSequence(opening.moves);
    const nextMove = moves[session.moveHistory.length];
    return nextMove ? [nextMove] : [];
  }, [isFamilyMode, variationPositionInfo, opening.moves, session]);

  if (showRecoveryDialog && existingSession) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Resume Training?</h2>
          <p className="text-gray-600 mb-6">You have an existing training session with <span className="font-semibold">{existingSession.moveHistory.length} moves</span>. Resume or start fresh?</p>
          <div className="space-y-3">
            <button onClick={handleResumeSession} className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">Resume Session</button>
            <button onClick={handleStartFresh} className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors">Start Fresh</button>
          </div>
        </div>
      </div>
    );
  }

  if (isInitializing) return <div className="flex items-center justify-center min-h-[500px]"><div className="text-center space-y-4"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="text-gray-600 dark:text-gray-400">Initializing training session...</p></div></div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center"><h3 className="font-semibold text-red-900 mb-2">Error</h3><p className="text-red-700">{error}</p><button onClick={() => initSession()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Retry</button></div>;
  if (!session || !chess) return <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center"><p className="text-gray-600 dark:text-gray-400">No active session</p></div>;

  const currentPosition = chess.fen();
  const tutorColor = userColor === 'white' ? 'black' : 'white';
  const userMoves = session.moveHistory.filter(m => m.color === userColor);
  const tutorMoves = session.moveHistory.filter(m => m.color === tutorColor);
  const lastUserMove = userMoves.length > 0 ? userMoves[userMoves.length - 1] : null;
  const lastTutorMove = tutorMoves.length > 0 ? tutorMoves[tutorMoves.length - 1] : null;

  const openingPracticeMode = {
    openingName: opening.name,
    openingEco: opening.eco,
    repertoireMoves: parseMoveSequence(opening.moves),
    currentMoveIndex: session.moveHistory.length,
    isInTheory: isFamilyMode ? (variationPositionInfo?.isInAnyVariation ?? false) : session.deviationMoveIndex === null,
    deviationMoveIndex: session.deviationMoveIndex,
    lastUserMove: lastUserMove ? { from: lastUserMove.uci.substring(0, 2), to: lastUserMove.uci.substring(2, 4), san: lastUserMove.san, color: lastUserMove.color === 'white' ? 'w' : 'b' } as any : null,
    lastTutorMove: lastTutorMove ? { from: lastTutorMove.uci.substring(0, 2), to: lastTutorMove.uci.substring(2, 4), san: lastTutorMove.san, color: lastTutorMove.color === 'white' ? 'w' : 'b' } as any : null,
    currentFeedback: currentFeedback ? { category: currentFeedback.classification.category, evaluationChange: currentFeedback.classification.evaluationChange, theoreticalAlternatives: isFamilyMode ? theoreticalMoves : currentFeedback.classification.theoreticalAlternatives } : (isFamilyMode ? { category: 'in-theory' as const, evaluationChange: 0, theoreticalAlternatives: theoreticalMoves } : null),
    wikipediaSummary: wikipediaSummary?.extract || undefined,
    shouldTutorSpeak,
    onTutorMessageSent: handleTutorMessageSent,
    isFamilyMode,
    variationInfo: isFamilyMode && variationPositionInfo ? { matchingVariations: variationPositionInfo.matchingCount, currentVariationNames: variationPositionInfo.currentVariationNames, possibleMoves: variationPositionInfo.nextMoves, isEndOfLine: variationPositionInfo.isEndOfLine } : undefined,
  };

  const capturedState = getCapturedState(chess);

  // Highlighting current move
  const lastMoveHighlight = useMemo(() => {
    if (session.moveHistory.length === 0) return {};
    const last = session.moveHistory[session.moveHistory.length - 1];
    return {
      [last.uci.substring(0, 2)]: { boxShadow: 'inset 0 0 0 4px rgba(255, 255, 0, 0.75)' },
      [last.uci.substring(2, 4)]: { boxShadow: 'inset 0 0 0 4px rgba(255, 255, 0, 0.75)' }
    };
  }, [session.moveHistory]);

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
        boardArea={
          <>
            {/* Interaction Overlay */}
            {isMobileChatOpen && <div className="absolute inset-0 z-10 cursor-pointer" />}

            {/* Top Cluster (Mobile only) */}
            {isMobileChatOpen && (
                <div className="w-full flex flex-col items-center gap-2 flex-shrink-0 scale-90">
                    <CapturedPieces captured={capturedState.blackPiecesLost} color="b" score={capturedState.blackLostScore - capturedState.whiteLostScore > 0 ? capturedState.blackLostScore - capturedState.whiteLostScore : null} />
                </div>
            )}

            {/* Chessboard */}
            <div className={clsx(
              "p-[2px] rounded-sm transition-all duration-300",
              isMobileChatOpen ? "w-full aspect-square shadow-sm bg-[#779954]" : "w-full bg-white dark:bg-gray-800"
            )}>
              <Chessboard
                key={currentPosition}
                options={{
                  position: currentPosition,
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare) return false;
                    return handlePieceDrop(sourceSquare, targetSquare);
                  },
                  boardOrientation: boardOrientation,
                  darkSquareStyle: { backgroundColor: '#779954' },
                  lightSquareStyle: { backgroundColor: '#e9edcc' },
                  animationDurationInMs: 200,
                  allowDragging: !isMobileChatOpen,
                  squareStyles: lastMoveHighlight
                }}
              />
            </div>

            {/* Bottom Cluster (Mobile only) */}
            {isMobileChatOpen && (
                <div className="w-full flex flex-col items-center gap-2 flex-shrink-0 scale-90">
                    {session.moveHistory.length > 0 && (
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium italic">
                            Last: <span className="font-black not-italic text-blue-600 dark:text-blue-400">{session.moveHistory[session.moveHistory.length - 1].san}</span>
                        </div>
                    )}
                    <CapturedPieces captured={capturedState.whitePiecesLost} color="w" score={capturedState.whiteLostScore - capturedState.blackLostScore > 0 ? capturedState.whiteLostScore - capturedState.blackLostScore : null} />
                </div>
            )}

            {/* Move Controls (Standard View only) */}
            {!isMobileChatOpen && (
              <div className="w-full pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Move History</h3>
                  <div className="flex gap-2">
                    <button onClick={() => navigateToMove(Math.max(0, session.currentMoveIndex - 1))} disabled={session.currentMoveIndex === 0} className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-30">← Back</button>
                    <button onClick={() => navigateToMove(Math.min(moveCount - 1, session.currentMoveIndex + 1))} disabled={session.currentMoveIndex >= moveCount - 1} className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-30">Forward →</button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-2">
                  {moveCount === 0 ? <p className="text-xs text-gray-500 text-center py-2 italic">Practice the {opening.name}...</p> : (
                    session.moveHistory.map((move, index) => (
                      <div key={index} onClick={() => navigateToMove(index)} className={clsx("p-1.5 rounded cursor-pointer text-xs flex justify-between items-center transition-colors", index === session.currentMoveIndex ? "bg-blue-100 dark:bg-blue-900/30 border border-blue-200" : "hover:bg-gray-100 dark:hover:bg-gray-700")}>
                        <span className="font-mono font-bold">{move.moveNumber}{move.color === 'white' ? '.' : '...'} {move.san}</span>
                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded uppercase font-black tracking-tighter", move.classification.category === 'in-theory' ? "text-green-600" : "text-amber-600")}>{move.classification.category}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        }
        sidePanel={
          <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-800">
            <div className="flex-1 overflow-hidden">
                {apiKey ? (
                    <Tutor
                        game={chess}
                        currentFen={currentPosition}
                        userMove={null}
                        computerMove={null}
                        stockfish={stockfish}
                        evalP0={null}
                        evalP2={null}
                        openingData={[]}
                        missedTactics={[]}
                        onAnalysisComplete={() => {}}
                        apiKey={apiKey}
                        personality={personality}
                        language={language}
                        playerColor={userColor}
                        onCheckComputerMove={() => {}}
                        isReviewing={session.currentMoveIndex < session.moveHistory.length}
                        resignationContext={null}
                        openingPracticeMode={openingPracticeMode}
                        onJumpToBoard={() => {
                            if (isMobileChatOpen) setIsMobileBoardExpanded(false);
                            setIsMobileChatOpen(false);
                        }}
                        onChatFocus={() => setIsKeyboardVisible(true)}
                        onChatBlur={() => setIsKeyboardVisible(false)}
                        onLatestMessage={setLatestCoachMessage}
                    />
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Coach Chat</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-xs">Set up your API key to interact with your coach.</p>
                        <button onClick={() => window.location.href = '/onboarding'} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm">Onboarding</button>
                    </div>
                )}
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
              "fixed right-4 z-[110] lg:hidden transition-all duration-500 shadow-2xl",
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
                  <div className="text-xl leading-none">{personality.image}</div>
                  <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">Tutor Chat</span>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              </>
          )}
      </button>

      {/* Deviation Dialog */}
      {showDeviationDialog && session?.deviationMoveIndex !== null && (
        <DeviationDialog openingName={opening.name} movesCompleted={session.deviationMoveIndex} onUndo={handleUndoDeviation} onStartGame={handleStartGameFromPosition} onContinueExploring={handleContinueExploring} language={language} />
      )}
    </div>
  );
}
