import { render, screen, fireEvent, act } from "@testing-library/react";
import ChessGame from "../ChessGame";
import { PERSONALITIES } from "@/lib/personalities";
import { DebugProvider } from "@/contexts/DebugContext";

// Mock react-chessboard as it's heavy and not relevant for overlay logic
jest.mock("react-chessboard", () => ({
    Chessboard: () => <div data-testid="chessboard">Mock Chessboard</div>
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

// Mock Stockfish Worker
global.Worker = jest.fn().mockImplementation(() => ({
    postMessage: jest.fn(),
    onmessage: jest.fn(),
    terminate: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
})) as any;

const defaultProps = {
    gameId: "test-game",
    initialPersonality: PERSONALITIES[0],
    initialColor: 'white' as const,
    initialStockfishDepth: 10,
    onBack: jest.fn(),
};

describe("Mobile Chat Overlay (Bottom Sheet)", () => {
    const renderGame = () => render(
        <DebugProvider>
            <ChessGame {...defaultProps} />
        </DebugProvider>
    );

    it("should display a floating chat button on mobile-sized screens", () => {
        renderGame();
        const toggleButton = screen.getByLabelText(/Open Chat/i);
        expect(toggleButton).toBeInTheDocument();
    });

    it("should toggle the chat overlay when the unified floating button is clicked", () => {
        renderGame();
        
        const toggleButton = screen.getByLabelText(/Open Chat/i);
        const tutorContainer = screen.getByTestId("tutor-container");
        const boardArea = screen.getByTestId("board-area");
        const mainContainer = boardArea.parentElement;

        // Initially closed
        expect(tutorContainer).toHaveClass("translate-y-full");

        // Open chat
        fireEvent.click(toggleButton);
        expect(tutorContainer).not.toHaveClass("translate-y-full");
        
        // Flex split should be active (Side-by-Side)
        expect(mainContainer).toHaveClass("flex");
        expect(mainContainer).toHaveClass("flex-row");
        expect(boardArea).toHaveClass("w-[35%]");

        // Close chat via the same button (which now says 'Close Chat')
        const closeButton = screen.getByLabelText(/Close Chat/i);
        
        // Verify FAB stays on the right but moves up to clear input
        expect(closeButton).toHaveClass("right-4");
        expect(closeButton).toHaveClass("bottom-40");

        fireEvent.click(closeButton);
        expect(tutorContainer).toHaveClass("translate-y-full");
    });

    it("should maintain the horizontal split regardless of keyboard state", () => {
        renderGame();
        
        // Open chat
        fireEvent.click(screen.getByLabelText(/Open Chat/i));
        
        const boardArea = screen.getByTestId("board-area");
        const mainContainer = boardArea.parentElement;
        const textarea = screen.getByPlaceholderText(/Ask/i);

        // Standard chat view (Side-by-Side)
        expect(mainContainer).toHaveClass("flex");
        expect(boardArea).toHaveClass("w-[35%]");

        // Simulate focus (keyboard opening)
        fireEvent.focus(textarea);
        
        // Should STILL be side-by-side
        expect(mainContainer).toHaveClass("flex");
        expect(boardArea).toHaveClass("w-[35%]");

        // Simulate blur (keyboard closing)
        fireEvent.blur(textarea);
        expect(mainContainer).toHaveClass("flex");
    });

    it("should maintain chat input state even when the overlay is closed", async () => {
        renderGame();
        
        // Open chat
        fireEvent.click(screen.getByLabelText(/Open Chat/i));
        
        const textarea = screen.getByPlaceholderText(/Ask/i);
        fireEvent.change(textarea, { target: { value: "Hello Coach" } });
        expect(textarea.value).toBe("Hello Coach");

        // Close chat
        fireEvent.click(screen.getByLabelText(/Close Chat/i));
        
        // Re-open chat
        fireEvent.click(screen.getByLabelText(/Open Chat/i));
        
        // Input should still be there
        expect(screen.getByPlaceholderText(/Ask/i)).toHaveValue("Hello Coach");
    });
});
