import { render, screen, fireEvent, act } from "@testing-library/react";
import StartScreen from "../StartScreen";
import { PERSONALITIES } from "@/lib/personalities";
import { DebugProvider } from "@/contexts/DebugContext";

// Mock next/navigation
jest.mock("next/navigation", () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
        back: jest.fn(),
    }),
}));

const mockSavedGames = [
    {
        id: "test-game-1",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        playerColor: "white" as const,
        selectedPersonality: PERSONALITIES[0],
        updatedAt: Date.now(),
        language: "en" as any,
    }
];

const defaultProps = {
    onStartGame: jest.fn(),
    onResumeGame: jest.fn(),
    savedGames: mockSavedGames,
    onDeleteSavedGame: jest.fn(),
};

describe("StartScreen Game Management", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should show delete confirmation modal when delete button is clicked", () => {
        render(
            <DebugProvider>
                <StartScreen {...defaultProps} />
            </DebugProvider>
        );

        const deleteButton = screen.getByLabelText(/Delete Game/i);
        fireEvent.click(deleteButton);

        expect(screen.getByText(/Delete Game\?/i)).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete this game\?/i)).toBeInTheDocument();
    });

    it("should call onDeleteSavedGame when confirmed", () => {
        render(
            <DebugProvider>
                <StartScreen {...defaultProps} />
            </DebugProvider>
        );

        fireEvent.click(screen.getByLabelText(/Delete Game/i));
        
        // Find the button with exact text "Delete" (the confirmation button)
        const confirmButton = screen.getByRole("button", { name: /^Delete$/ });
        fireEvent.click(confirmButton);

        expect(defaultProps.onDeleteSavedGame).toHaveBeenCalledWith("test-game-1");
        expect(screen.queryByText(/Delete Game\?/i)).not.toBeInTheDocument();
    });

    it("should close modal without deleting when cancel is clicked", () => {
        render(
            <DebugProvider>
                <StartScreen {...defaultProps} />
            </DebugProvider>
        );

        fireEvent.click(screen.getByLabelText(/Delete Game/i));
        
        const cancelButton = screen.getByRole("button", { name: /Cancel/i });
        fireEvent.click(cancelButton);

        expect(defaultProps.onDeleteSavedGame).not.toHaveBeenCalled();
        expect(screen.queryByText(/Delete Game\?/i)).not.toBeInTheDocument();
    });
});
