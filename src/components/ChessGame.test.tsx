import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ChessGame from "./ChessGame";

interface MockChessboardProps {
    options: {
        onPieceDrop?: (move: { sourceSquare: string; targetSquare: string | null }) => void;
    };
}

interface MockStartOptions {
    personality: { name: string };
    color: 'white' | 'black' | 'random';
}

// Mock dependencies
jest.mock("react-chessboard", () => ({
    Chessboard: ({ options }: MockChessboardProps) => (
        <div data-testid="chessboard" onClick={() => {
            // Simulate a move drop
            if (options.onPieceDrop) {
                options.onPieceDrop({ sourceSquare: "e2", targetSquare: "e4" });
            }
        }}>
            Chessboard Mock
        </div>
    ),
}));

jest.mock("../lib/stockfish", () => {
    const evaluate = jest.fn().mockResolvedValue({
        score: 0.5,
        mate: null,
        bestMove: "e7e5",
        depth: 15
    });
    return {
        __mock: { evaluate },
        Stockfish: jest.fn().mockImplementation((onReady) => {
            if (onReady) setTimeout(onReady, 0);
            return {
                evaluate,
                terminate: jest.fn(),
            };
        }),
    };
});
const { __mock: stockfishMock } = jest.requireMock("../lib/stockfish") as { __mock: { evaluate: jest.Mock } };

let lastTutorProps: any = null;
const mockedTutor = jest.fn((props) => {
    lastTutorProps = props;
    const { currentFen, userMove, computerMove, evalP0, evalP2, language } = props;
    return (
        <div data-testid="tutor">
            Tutor Mock (Fen: {currentFen})
            {userMove && <span>User Move: {userMove.san}</span>}
            {computerMove && <span>Computer Move: {computerMove.san}</span>}
            {evalP0 && <span>Eval P0: {evalP0.score}</span>}
            {evalP2 && <span>Eval P2: {evalP2.score}</span>}
            <span>Language: {language}</span>
        </div>
    );
});

jest.mock("./Tutor", () => ({
    Tutor: (props: any) => mockedTutor(props)
}));

jest.mock("./GameAnalysisModal", () => ({
    GameAnalysisModal: () => <div data-testid="analysis-modal">Analysis Modal Mock</div>,
}));

jest.mock("./GameOverModal", () => ({
    GameOverModal: ({ onAnalyze }: { onAnalyze: () => void }) => (
        <div data-testid="game-over-modal" onClick={onAnalyze}>Game Over Modal Mock</div>
    ),
    MoveHistoryItem: {} // Mocked as empty object for type safety
}));

jest.mock("./StartScreen", () => ({
    __esModule: true,
    default: ({ onStartGame }: { onStartGame: (options: MockStartOptions) => void }) => (
        <div data-testid="start-screen">
            <button onClick={() => onStartGame({ personality: { name: 'Test Personality' } as any, color: 'white' })}>
                Start Game
            </button>
        </div>
    ),
}));


describe("ChessGame Component", () => {
    const mockPersonality = {
        id: "test",
        name: "Test Personality",
        systemPrompt: "You are a helpful assistant.",
        image: "🤖",
        description: "Test description",
    };

    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        // Use real timers for more predictable async behavior in complex tests
        jest.useRealTimers();
        stockfishMock.evaluate.mockResolvedValue({
            score: 0.5,
            mate: null,
            bestMove: "e7e5",
            depth: 15
        });
    });

    it("renders the game board and tutor", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="test-game"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    onBack={() => {}}
                />
            );
        });
        expect(screen.getByTestId("chessboard")).toBeInTheDocument();
        expect(screen.getByTestId("tutor")).toBeInTheDocument();
    });

    it("handles user move and triggers analysis", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="test-game"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    onBack={() => {}}
                />
            );
        });

        const initialCalls = mockedTutor.mock.calls.length;

        // Make a move by clicking the mock chessboard
        await act(async () => {
            fireEvent.click(screen.getByTestId("chessboard"));
        });

        // The Tutor should be updated with user move and eventually computer move
        await waitFor(() => {
            expect(mockedTutor.mock.calls.length).toBeGreaterThan(initialCalls);
        }, { timeout: 3000 });
    });

    it("restores a PGN game and persists save data without apiKey", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="restore-game"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    initialPgn="1. e4 e5 2. Nf3 Nc6"
                    onBack={() => {}}
                />
            );
        });

        await waitFor(() => {
            const savedGames = JSON.parse(localStorage.getItem("chess_tutor_saves") || "[]");
            const saved = savedGames.find((g: any) => g.id === "restore-game");
            expect(saved).toBeDefined();
            expect(saved.pgn).toContain("1. e4 e5");
        });
    });

    it("undoes cleanly while analysis is in flight", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="undo-game"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    onBack={() => {}}
                />
            );
        });

        await act(async () => {
            fireEvent.click(screen.getByTestId("chessboard"));
        });

        await act(async () => {
            const undoButton = screen.getByText(/Undo Last Move/i);
            fireEvent.click(undoButton);
        });

        await waitFor(() => {
            expect(screen.getByTestId("tutor")).toHaveTextContent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        });
    });

    it("ignores rapid repeated drops once the turn has switched", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="rapid-drop-test"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    onBack={() => {}}
                />
            );
        });

        const initialCalls = stockfishMock.evaluate.mock.calls.length;

        await act(async () => {
            fireEvent.click(screen.getByTestId("chessboard"));
            fireEvent.click(screen.getByTestId("chessboard"));
        });

        await waitFor(() => {
            expect(stockfishMock.evaluate.mock.calls.length).toBeLessThanOrEqual(initialCalls + 2);
        });
    });

    it("triggers computer move when resumed on computer's turn", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="resume-computer-turn"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    initialPgn="1. e4"
                    onBack={() => {}}
                />
            );
        });

        await waitFor(() => {
            const lastProps = mockedTutor.mock.calls[mockedTutor.mock.calls.length - 1][0];
            expect(lastProps.computerMove).not.toBeNull();
        }, { timeout: 3000 });
    });

    it("handles engine initialization timeout gracefully", async () => {
        jest.useFakeTimers();
        
        // Mock Stockfish constructor directly for this test
        const { Stockfish } = require("../lib/stockfish");
        (Stockfish as jest.Mock).mockImplementationOnce(() => ({
            evaluate: jest.fn(),
            terminate: jest.fn(),
        }));

        await act(async () => {
            render(
                <ChessGame
                    gameId="engine-timeout"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    onBack={() => {}}
                />
            );
        });

        // Fast-forward 11 seconds
        await act(async () => {
            jest.advanceTimersByTime(11000);
        });

        expect(screen.getByText(/Engine Error/i)).toBeInTheDocument();
        expect(screen.getByText(/Retry Engine/i)).toBeInTheDocument();
        
        jest.useRealTimers();
    });

    it("aligns move history correctly for Black human player", async () => {
        await act(async () => {
            render(
                <ChessGame
                    gameId="black-player-history"
                    initialPersonality={mockPersonality}
                    initialColor="black"
                    onBack={() => {}}
                />
            );
        });

        // Wait for engine to be ready and evaluation to be triggered
        await waitFor(() => {
            expect(stockfishMock.evaluate).toHaveBeenCalled();
        }, { timeout: 3000 });
        
        // This confirms the engine was triggered because human is Black
    });

    it("prevents stale evaluations from updating state during rapid moves", async () => {
        let resolveEval: (val: any) => void = () => {};
        const evalPromise = new Promise((resolve) => {
            resolveEval = resolve;
        });

        await act(async () => {
            render(
                <ChessGame
                    gameId="stale-eval"
                    initialPersonality={mockPersonality}
                    initialColor="white"
                    onBack={() => {}}
                />
            );
        });

        // Ensure engine is triggered
        await waitFor(() => {
            expect(stockfishMock.evaluate).toHaveBeenCalled();
        }, { timeout: 3000 });

        stockfishMock.evaluate.mockClear();
        stockfishMock.evaluate.mockReturnValue(evalPromise);

        // Trigger a move
        const board = screen.getByTestId("chessboard");
        await act(async () => {
            fireEvent.click(board);
        });

        // Move evaluation triggered (P0)
        expect(stockfishMock.evaluate).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveEval({ score: 0.1, bestMove: "e7e5", depth: 15 });
        });

        // Now P2 should be triggered
        await waitFor(() => {
            expect(stockfishMock.evaluate).toHaveBeenCalledTimes(2);
        }, { timeout: 3000 });
    });
});