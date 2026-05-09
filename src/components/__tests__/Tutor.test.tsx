import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { Tutor } from '../Tutor';
import { Stockfish } from '@/lib/stockfish';
import { Chess } from 'chess.js';
import * as gemini from '@/lib/gemini';
import { DebugProvider } from '@/contexts/DebugContext';

jest.mock('@/lib/stockfish');
jest.mock('@/lib/gemini');

describe('Tutor', () => {
  let stockfish: Stockfish;
  let game: Chess;

  beforeEach(() => {
    stockfish = new Stockfish();
    game = new Chess();
    (gemini.getGenAIModel as jest.Mock).mockReturnValue({
        startChat: jest.fn().mockReturnValue({
            sendMessage: jest.fn().mockResolvedValue({
                response: {
                    text: () => 'Test response',
                },
            }),
        }),
    });
  });

  it('should call evaluateCurrentPosition when hint button is clicked', async () => {
    const evaluateSpy = jest.spyOn(stockfish, 'evaluate').mockResolvedValue({
      bestMove: 'e2e4',
      ponder: 'e7e5',
      score: 10,
      mate: null,
      depth: 15,
    });

    render(
      <DebugProvider>
        <Tutor
          game={game}
          currentFen={game.fen()}
          userMove={null}
          computerMove={null}
          stockfish={stockfish}
          evalP0={null}
          evalP2={null}
          openingData={[]}
          missedTactics={null}
          onAnalysisComplete={() => {}}
          apiKey="test-api-key"
          personality={{
              id: "test",
              name: "Test Personality",
              systemPrompt: "Test Prompt",
              image: "🤖",
              description: "Test description"
          }}
          language="en"
          playerColor="white"
          onCheckComputerMove={() => {}}
          resignationContext={null}
        />
      </DebugProvider>
    );

    const hintButton = screen.getByText(/hint/i);
    await act(async () => {
      fireEvent.click(hintButton);
    });


    expect(evaluateSpy).toHaveBeenCalledWith(game.fen(), 15);
  });

  it('sends a resignation follow-up message when provided context', async () => {
    const sendMessage = jest.fn().mockResolvedValue({
        response: {
            text: () => 'Resignation response',
        },
    });

    (gemini.getGenAIModel as jest.Mock).mockReturnValue({
        startChat: jest.fn().mockReturnValue({
            sendMessage,
        }),
    });

    const evaluation = {
        bestMove: 'e2e4',
        ponder: null,
        score: 50,
        mate: null,
        depth: 12,
    };

    render(
      <DebugProvider>
        <Tutor
          game={game}
          currentFen={game.fen()}
          userMove={null}
          computerMove={null}
          stockfish={stockfish}
          evalP0={null}
          evalP2={null}
          openingData={[]}
          missedTactics={null}
          onAnalysisComplete={() => {}}
          apiKey="test-api-key"
          personality={{
              id: "test",
              name: "Test Personality",
              systemPrompt: "Test Prompt",
              image: "🤖",
              description: "Test description"
          }}
          language="en"
          playerColor="white"
          onCheckComputerMove={() => {}}
          resignationContext={{
              trigger: Date.now(),
              fen: game.fen(),
              evaluation,
              history: [],
              result: 'Resignation',
              winner: 'Black',
          }}
        />
      </DebugProvider>
    );

    await waitFor(() => {
        expect(sendMessage).toHaveBeenCalled();
    });

    const callsContainResignation = sendMessage.mock.calls.some((call: any[]) =>
        String(call[0]).includes('[SYSTEM TRIGGER: resignation]')
    );

    expect(callsContainResignation).toBe(true);
  });

  it('debounces automatic commentary when isReviewing is true', async () => {
    jest.useFakeTimers();
    
    const sendMessage = jest.fn().mockResolvedValue({
        response: {
            text: () => 'Debounced response',
        },
    });

    (gemini.getGenAIModel as jest.Mock).mockReturnValue({
        startChat: jest.fn().mockReturnValue({
            sendMessage,
        }),
    });

    const openingPracticeMode = {
        openingName: 'French Defense',
        openingEco: 'C00',
        repertoireMoves: ['e4', 'e6'],
        currentMoveIndex: 1,
        isInTheory: true,
        deviationMoveIndex: null,
        lastUserMove: { san: 'e6', color: 'b' } as any,
        lastTutorMove: null,
        currentFeedback: null,
        shouldTutorSpeak: true,
    };

    render(
      <DebugProvider>
        <Tutor
          game={game}
          currentFen={game.fen()}
          userMove={null}
          computerMove={null}
          stockfish={stockfish}
          evalP0={null}
          evalP2={null}
          openingData={[]}
          missedTactics={null}
          onAnalysisComplete={() => {}}
          apiKey="test-api-key"
          personality={{
              id: "test",
              name: "Test Personality",
              systemPrompt: "Test Prompt",
              image: "🤖",
              description: "Test description"
          }}
          language="en"
          playerColor="white"
          onCheckComputerMove={() => {}}
          isReviewing={true}
          openingPracticeMode={openingPracticeMode}
        />
      </DebugProvider>
    );

    // Should have called sendMessage ONCE for the initial greeting
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Advance time by 2 seconds
    act(() => {
        jest.advanceTimersByTime(2000);
    });
    // Still only 1 call (greeting)
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Advance time to 3 seconds
    act(() => {
        jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
        // Now should have 2 calls (greeting + commentary)
        expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    jest.useRealTimers();
  });

  it('renders a streamlined header without redundant subtitle', () => {
    render(
      <DebugProvider>
        <Tutor
          game={game}
          currentFen={game.fen()}
          userMove={null}
          computerMove={null}
          stockfish={stockfish}
          evalP0={null}
          evalP2={null}
          openingData={[]}
          missedTactics={null}
          onAnalysisComplete={() => {}}
          apiKey="test-api-key"
          personality={{
              id: "test",
              name: "Test Personality",
              systemPrompt: "Test Prompt",
              image: "🤖",
              description: "Test description"
          }}
          language="en"
          playerColor="white"
          onCheckComputerMove={() => {}}
          resignationContext={null}
        />
      </DebugProvider>
    );

    expect(screen.getByText('Test Personality')).toBeInTheDocument();
    expect(screen.queryByText(/AI Coach/i)).not.toBeInTheDocument();
    
    // Check for smaller avatar size class (text-base)
    const avatar = screen.getByText('🤖');
    expect(avatar).toHaveClass('text-base');
  });
});
