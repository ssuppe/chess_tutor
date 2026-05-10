import { render, screen, act, waitFor } from "@testing-library/react";
import ChessGame from "../ChessGame";
import { PERSONALITIES } from "@/lib/personalities";
import { MOVE_HIGHLIGHT_STYLE } from "@/lib/chessStyles";

// Mock react-chessboard to inspect props
let lastChessboardOptions: any = null;
jest.mock("react-chessboard", () => ({
    Chessboard: ({ options }: { options: any }) => {
        lastChessboardOptions = options;
        return (
            <div 
                data-testid="chessboard" 
                data-styles={JSON.stringify(options.squareStyles || {})}
            >
                Mock Chessboard
            </div>
        );
    }
}));

// Mock useChessSounds
jest.mock("@/lib/hooks/useChessSounds", () => ({
    useChessSounds: () => ({
        playMoveSound: jest.fn(),
        playCheck: jest.fn(),
        playVictory: jest.fn(),
        playDefeat: jest.fn(),
    })
}));

// Mock Tutor component
jest.mock("../Tutor", () => ({
    Tutor: () => <div data-testid="tutor-mock">Mock Tutor</div>
}));

// Mock Stockfish
jest.mock("@/lib/stockfish", () => ({
    Stockfish: jest.fn().mockImplementation(() => ({
        evaluate: jest.fn().mockResolvedValue({ score: 0, bestMove: "e2e4", depth: 10 }),
        terminate: jest.fn(),
    }))
}));

// Mock translations
jest.mock("@/lib/i18n/useTranslation", () => ({
    useTranslation: () => ({
        game: {
            backToMenu: "Back",
            stockfishLevel: "Level",
            undoMove: "Undo",
            resign: "Resign",
            gameHistory: "History",
            white: "White",
            black: "Black",
            evalChange: "Eval",
            noMovesYet: "No moves",
            download: "Download",
            analyze: "Analyze",
            resignConfirm: "Are you sure?",
            resignation: "Resigned",
        },
        analysis: {
            downloadTitle: "Download",
            downloadPGN: "PGN",
            downloadFEN: "FEN",
        },
        common: {
            cancel: "Cancel"
        }
    })
}));

describe("ChessGame Move Highlighting", () => {
    const defaultProps = {
        gameId: "test-game",
        initialPersonality: PERSONALITIES[0],
        initialColor: "white" as const,
        onBack: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        lastChessboardOptions = null;
    });

    it("should initially have no highlighted squares", () => {
        render(<ChessGame {...defaultProps} />);
        const board = screen.getByTestId("chessboard");
        expect(board.getAttribute("data-styles")).toBe("{}");
    });

    it("should highlight origin and destination squares after a move", async () => {
        render(<ChessGame {...defaultProps} />);
        
        // Wait for Chessboard to be rendered
        await waitFor(() => {
             expect(lastChessboardOptions).not.toBeNull();
        });

        // We need to wait for the initial evaluation (evalP0) to be set
        // Since evalP0 isn't directly visible, we'll try making the move 
        // until it's accepted (doesn't return null/false)
        
        await waitFor(async () => {
            const result = await act(async () => {
                return lastChessboardOptions.onPieceDrop({ sourceSquare: "e2", targetSquare: "e4" });
            });
            expect(result).not.toBe(false);
        });

        const board = screen.getByTestId("chessboard");
        
        await waitFor(() => {
            const styles = JSON.parse(board.getAttribute("data-styles") || "{}");
            expect(Object.keys(styles).length).toBeGreaterThan(0);
        });

        const styles = JSON.parse(board.getAttribute("data-styles") || "{}");
        expect(styles["e2"]).toEqual(MOVE_HIGHLIGHT_STYLE);
        expect(styles["e4"]).toEqual(MOVE_HIGHLIGHT_STYLE);
    });

    it("should clear highlights on Undo", async () => {
        render(<ChessGame {...defaultProps} />);
        
        await waitFor(() => {
             expect(lastChessboardOptions).not.toBeNull();
        });

        // Wait for evalP0 and make move
        await waitFor(async () => {
            const result = await act(async () => {
                return lastChessboardOptions.onPieceDrop({ sourceSquare: "e2", targetSquare: "e4" });
            });
            expect(result).not.toBe(false);
        });

        // Verify highlight exists
        await waitFor(() => {
            const board = screen.getByTestId("chessboard");
            expect(board.getAttribute("data-styles")).not.toBe("{}");
        });

        const undoButton = screen.getByText(/Undo/i);
        await act(async () => {
            undoButton.click();
        });

        await waitFor(() => {
            const board = screen.getByTestId("chessboard");
            expect(board.getAttribute("data-styles")).toBe("{}");
        });
    });
});
