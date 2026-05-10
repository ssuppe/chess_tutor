import { render, screen, act } from "@testing-library/react";
import ChessGame from "../ChessGame";
import { PERSONALITIES } from "@/lib/personalities";

// Mock react-chessboard to inspect props
let lastChessboardOptions: any = null;
jest.mock("react-chessboard", () => ({
    Chessboard: ({ options }: { options: any }) => {
        lastChessboardOptions = options;
        return (
            <div 
                data-testid="chessboard" 
                data-styles={JSON.stringify(options.customSquareStyles || {})}
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
        
        // Simulate a move: e2 to e4
        const sourceSquare = "e2";
        const targetSquare = "e4";
        
        await act(async () => {
            // Need to wait for initial useEffects to run so lastChessboardOptions is set
        });

        if (!lastChessboardOptions) {
             // Try to wait a bit more if it's not ready
             await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
             });
        }

        await act(async () => {
            lastChessboardOptions.onPieceDrop({ sourceSquare, targetSquare });
        });

        const board = screen.getByTestId("chessboard");
        const styles = JSON.parse(board.getAttribute("data-styles") || "{}");
        
        expect(styles["e2"]).toBeDefined();
        expect(styles["e4"]).toBeDefined();
        expect(styles["e2"]).toEqual({ backgroundColor: "rgba(255, 255, 0, 0.4)" });
    });
});
