# Technical Design Document: AI Positional Integrity & Commentary De-duplication

**Author:** Technical Lead  
**Date:** May 23, 2026  
**Status:** FINAL (Implemented & Verified)  
**Target Audience:** Engineering Team (Junior Engineer Friendly)

---

## 1. Problem Statement
Users have identified two critical issues impacting the AI Tutor experience:
1.  **Duplicate Commentary:** The AI often sends two separate chat bubbles for a single move exchange.
2.  **Positional Disorientation:** The AI Coach occasionally refers to piece positions that contradict the current board state (hallucination/loss of context).

---

## 2. Root Cause Analysis

### 2.1 Duplicate Commentary Bubbles
The `Tutor` component currently contains two separate `useEffect` logic paths that trigger automatic LLM messages:
*   **Standard Analysis Loop:** Triggers when `computerMove` and `userMove` are detected.
*   **Opening Practice Loop:** Triggers when moves are made while an `openingName` is active.

In **Opening Practice** mode, both of these triggers fire because the tutor is acting as the opponent. This results in the tutor sending one technical analysis message and one repertoire-focused message.

### 2.2 Positional Inaccuracy (The "Drift")
The AI's understanding of the board state is currently fragile due to "Late Reconstruction":
1.  **Async Lag:** The `Tutor` tries to calculate the FEN of the board *before* the user's move by calling `.undo()` on the `game` object.
2.  **Mutable State Risk:** If the parent `ChessGame` component re-renders or updates the `game` object while the `Tutor` is in the middle of an async `.undo()` calculation, the FEN strings passed to the AI can become mismatched.
3.  **Token Sensitivity:** LLMs read FENs as strings of tokens. A single character error in a long FEN can radically change the board state in the AI's mind.

---

## 3. Proposed Architectural Changes

### 3.1 The "One Exchange = One Prompt" Rule
We will implement a **Commentary Orchestrator** pattern.
*   **Strategy:** Only one `useEffect` will be permitted to initiate an LLM exchange.
*   **Logic:** If the user is in "Opening Practice" mode, the standard analysis loop will be suppressed. The Opening Practice prompt will be upgraded to include the technical delta/eval data that the standard loop used to provide.

### 3.2 Atomic Board Snapshots
We will move the responsibility of FEN calculation from the **Tutor** (receiver) to the **ChessGame** (sender).
*   **State Change:** `ChessGame` will track an `exchangeContext` object.
*   **Mechanism:** When a move is completed, the parent will "snapshot" the FENs exactly as they were at each step (Before Move, After User Move, After Tutor Move).
*   **Benefit:** This removes all "reconstruction" logic from the Tutor and guarantees the AI receives a perfectly consistent timeline of the turn.

### 3.3 Redundant Positional Encoding (Human-Readable Backup)
We will introduce a "Human Readable" board description in the prompt.
*   **Example:** Instead of just `rnbqkbnr/...`, we will also provide `White: King on e1, Queen on d1...`.
*   **Benefit:** This acts as a secondary verification for the AI, significantly reducing FEN interpretation errors.

---

## 4. Implementation Plan

### Step 1: Define the `ExchangeContext` Type
Define a robust interface for passing move data:
```typescript
interface ExchangeContext {
    fenBefore: string;
    fenAfterUser: string;
    fenAfterTutor: string;
    userMoveSan: string;
    tutorMoveSan: string;
    evaluationDelta: number;
}
```

### Step 2: Update `ChessGame.tsx` (The Sender)
*   Create a new state variable: `const [latestExchange, setLatestExchange] = useState<ExchangeContext | null>(null);`.
*   Update the `onDrop` and `computerMove` logic to populate this object with actual FEN snapshots.

### Step 3: Update `Tutor.tsx` (The Receiver)
*   Remove the `undo()` and `tempGame.loadPgn()` logic.
*   Update the prompts to use the `ExchangeContext` directly.
*   Add a guard: `if (openingPracticeMode) return;` inside the standard `analyzeExchange` loop.

### Step 4: Add Human-Readable Utility
*   Create a utility function `getHumanReadableBoard(fen: string)` that returns a simple text list of piece positions.
*   Include this in the system instructions for the LLM.

### Step 5: Fix Resumption Awareness
*   **Problem:** AI Tutor greets the user as a new game even when resuming.
*   **Solution:** 
    *   Load PGN during `useState` initialization in `ChessGame.tsx` so `game.history()` is populated on the first render.
    *   In `Tutor.tsx`, check `game.history().length > 0` during initialization.
    *   Provide a specialized "Resume Game" prompt to the AI that includes the current piece list and the last move played.

---

## 5. Risk Assessment
*   **TDD Dependency:** We must ensure that standard gameplay (non-opening) still triggers the analysis correctly.
*   **Performance:** Generating human-readable text adds a few hundred tokens to each prompt; we will keep it concise (only listing major pieces and pawns).

---

## 6. Definition of Done
1.  Verify that only one AI bubble is sent per exchange in Opening Practice mode.
2.  Verify that the AI correctly identifies piece positions (e.g., "Your knight on f3 is pinned") after a 20+ move game.
3.  All existing unit tests pass.
