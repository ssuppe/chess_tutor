import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DebugProvider } from "@/contexts/DebugContext";
import AnalysisPage from "../page";

// Mock next/navigation
jest.mock("next/navigation", () => ({
    useRouter: jest.fn(() => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    })),
}));

// Mock react-chessboard
let lastChessboardOptions: any[] = [];
jest.mock("react-chessboard", () => ({
    Chessboard: ({ options }: { options: any }) => {
        lastChessboardOptions.push(options);
        return (
            <div 
                data-testid="chessboard" 
                data-styles={JSON.stringify(options.customSquareStyles || {})}
            >
                Mock Chessboard
            </div>
        );
    },
}));

// Mock Stockfish
jest.mock("@/lib/stockfish", () => ({
    Stockfish: jest.fn().mockImplementation(() => ({
        evaluate: jest.fn().mockResolvedValue({ score: 0, bestMove: "e2e4", depth: 10 }),
        terminate: jest.fn(),
    }))
}));

describe("AnalysisPage Move Highlighting", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        lastChessboardOptions = [];
    });

    const samplePgn = `
[Event "Casual Game"]
1. e4 e5 2. Nf3 Nc6
`;

    it("should highlight origin and destination squares of the current move in analysis", async () => {
        await act(async () => {
            render(
                <DebugProvider>
                    <AnalysisPage />
                </DebugProvider>
            );
        });

        const textarea = screen.getByPlaceholderText(/Paste PGN or FEN here/i);
        await act(async () => {
            fireEvent.change(textarea, { target: { value: samplePgn } });
            fireEvent.click(screen.getByText(/Start Analysis/i));
        });

        // Initially at index 0 (start position), no highlight
        const board = screen.getAllByTestId("chessboard")[0]; // There are two boards in analysis page (one for current, one for variation?) 
        // Actually there's only one main board usually, but let's check.
        
        expect(board.getAttribute("data-styles")).toBe("{}");

        // Navigate to first move (1. e4)
        const nextButton = screen.getByLabelText(/Next Move/i);
        await act(async () => {
            fireEvent.click(nextButton);
        });

        // Now it should highlight e2 and e4
        const updatedBoard = screen.getAllByTestId("chessboard")[0];
        const styles = JSON.parse(updatedBoard.getAttribute("data-styles") || "{}");
        
        expect(styles["e2"]).toBeDefined();
        expect(styles["e4"]).toBeDefined();
    });
});
