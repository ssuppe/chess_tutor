# Pull Request Preparation: Wikipedia Cache Persistence

## Context
The application was suffering from `429 Too Many Requests` errors when fetching Wikipedia data for ~12,000 openings on every startup. Data was also being lost on container restarts.

## Changes

### 1. Infrastructure & Persistence
- **Docker Volume:** Added a volume mapping in `docker-compose.yml` (`./wikipedia-cache:/app/public/wikipedia`) to persist cached JSON files.
- **Auto-Initialization:** Added `scripts/ensure-cache.js` which runs before `npm run dev` and `npm run build` to check if the cache is empty/incomplete (< 20 files) and trigger a rebuild if necessary.
- **Smart Fetching:** Updated `scripts/fetch-wikipedia-openings.ts` to skip already cached files.
- **Locking Mechanism:** Implemented a `.rebuilding` lock file to prevent concurrent rebuild processes.

### 2. API & Reliability
- **Rate Limiting:** Implemented exponential backoff in the fetcher script to handle `429` errors gracefully.
- **Management API:** Added `src/app/api/v1/cache/wikipedia/route.ts` with `GET` (status), `POST` (trigger rebuild), and `DELETE` (clear cache) methods.
- **Stale Lock Cleanup:** Added logic to automatically clear lock files older than 1 hour or on local server startup.

### 3. UI & UX
- **Data Management UI:** Added "Clear" and "Rebuild" buttons to the Settings page with Lucide icons (`Trash2`, `RefreshCw`).
- **Polling & Feedback:** Implemented a polling mechanism in the UI to show a loading spinner and disable buttons while a rebuild is in progress.
- **Cache Sync:** Clearing the server cache now also clears the client's `localStorage` Wikipedia summaries for consistency.
- **Full Wipe Support:** Updated the "Clear all data" button to also trigger the server-side cache deletion, ensuring a complete reset of the environment.

### 4. Testing
- Added **10 new tests** in `src/app/api/v1/cache/wikipedia/route.test.ts` covering all API methods and edge cases.
- Total passing tests: **232**.

---

# Pull Request Preparation: Gemini Model Migration

## Context
The application had hardcoded references to older Gemini models (e.g., `gemini-2.5-flash`), which had very low rate limits (20 requests/day). This caused the AI Chess Tutor to hang once the quota was exhausted.

## Changes

### 1. Migration to SOTA Models
- **New Default:** Migrated the entire application to use `gemini-3.1-flash-lite-preview` by default, which offers a much higher free quota (1,000 requests/day) and improved reasoning.
- **Surgical Refactoring:** Replaced all hardcoded model ID strings in components (`Tutor`, `GameAnalysisModal`, etc.) and API routes with a centralized resolution logic.

### 2. Centralized Model Resolution
- **New Library (`src/lib/gemini.ts`):** Implemented `resolveModelId()` which handles model resolution with the following priority:
  1. Explicitly provided model name (from API call).
  2. User preference (from `localStorage`).
  3. Environment variable (`NEXT_PUBLIC_GEMINI_MODEL_ID`).
  4. System default (`gemini-3.1-flash-lite-preview`).

### 3. UI & Onboarding
- **Onboarding Integration:** Added a "Gemini Model" selection dropdown to the initial setup step, allowing users to choose their preferred model immediately.
- **Settings UI:** Added a new "Gemini Model" section to the Settings page with a dropdown and descriptive tooltips explaining the differences between Flash and Pro models.
- **I18n Support:** Fully translated all new UI strings across English, German, French, Italian, and Polish.

### 4. Testing & Documentation
- **New Tests:** Added `src/lib/__tests__/gemini.test.ts` with 100% coverage for the resolution logic.
- **Updated API Tests:** Verified that chat and analysis routes correctly delegate model resolution.
- **Documentation:** Updated `README.md` and `docs/llm_api.md` to reflect the new default model and configuration options.

---

# Pull Request Preparation: LLM Request Debouncing

## Context
Rapidly navigating through move history (scrubbing) triggered instantaneous API calls for every move. This led to API quota exhaustion ("choking") and race conditions where multiple feedback messages would overlap.

## Changes

### 1. Standardized Debounce Logic
- **3-Second Delay:** Implemented a **3-second debounce** on LLM commentary requests triggered by move changes.
- **Conditional Application:** The delay is **only** applied when analyzing/navigating history (`isReviewing: true`). In live gameplay, responses remain instantaneous to ensure a smooth experience.
- **Cleanup & Race Condition Prevention:** Integrated `clearTimeout` in the cleanup function of `useEffect` hooks. If a user moves to a new position before the 3-second timer expires, the previous request is cancelled.

### 2. Component Integration
- **`src/components/Tutor.tsx`:** Added `isReviewing` prop and wrapped automatic opening commentary and move exchange reactions in the debounce logic.
- **`src/components/OpeningTrainer/OpeningTrainer.tsx`:** Automatically detects historical navigation by comparing `currentMoveIndex` with `moveHistory.length` and passes the status to the Tutor.
- **`src/app/analysis/useAnalysisSession.ts`:** Standardized the analysis page to use the same 3-second debounce for move-by-move commentary.

### 3. Testing
- **New Unit Test:** Added a test case in `src/components/__tests__/Tutor.test.tsx` using `jest.useFakeTimers()` to verify that requests are correctly delayed and that immediate greetings are still sent instantly.
- Total passing tests: **227** (on this branch).

---

# Pull Request Preparation: High-Density UI Refactoring

## Context
Mobile users were experiencing excessive vertical scrolling during gameplay, often losing sight of the board when the AI Coach spoke. The UI also felt inconsistent, with bulky headers and redundant labels competing for screen real-estate.

## Changes

### 1. Minimalist Navigation & Breadcrumbs
- **Standardized Navigation:** Replaced the global page header with a minimalist "Breadcrumb" row across **all pages** (Analysis, Settings, Learning Area, and Informational pages).
- **Page Header Removal:** Removed the bulky site-wide header from active gameplay and analysis modes, reclaiming ~80px of vertical space.
- **Concise Controls:** Converted the "Back to Menu" button into a subtle ghost-button with a smaller icon (14px) and text.

### 2. High-Density Layout Standardization
- **Responsive Padding:** Halved the board container padding on mobile (`p-4` -> `p-2`) to maximize the chessboard size.
- **Utility UI Styling:** Unified all secondary labels, headers, and statistics to use a high-density `text-[10px]` uppercase, tracking-wider style.
- **Compressed Controls:** Repositioned board controls (Undo, Resign, Level) to the top of the tile and shrunk captured piece icons to `text-xl` to keep them tightly anchored to the board.
- **Refined Chat UI:** Increased chat bubbles to `92%` width, shrunk avatars to `24px`, and synchronized line-height (`leading-snug`) for better information density.

### 3. Integrated Utility Bar
- **New Component:** Created `TopUtilityLinks.tsx` to house "Tip" and "GitHub" links in a minimalist format.
- **Strategic Placement:** These links now appear only in management/setup views (Start Screen, Settings) and are hidden during active matches to maintain focus.

---

# Pull Request Preparation: AI Positional Integrity & Stability Suite

## Context
The AI Coach frequently "lost track" of piece positions during long games. Additionally, the application suffered from random "Invalid Move" crashes during history reconstruction and occasionally sent duplicate commentary bubbles.

## Changes

### 1. AI Positional Anchors (GROUNDING)
- **Human-Readable Board Utility:** Implemented `generateHumanReadableBoard` in `src/lib/gameState.ts` which converts complex FEN strings into simple text lists (e.g., "White: King on e1, Knight on f3").
- **Prompt Injection:** This list is now injected into **every** AI interaction as a "Source of Truth." The AI is explicitly instructed to verify piece locations against this list before speaking, effectively eliminating hallucinations.

### 2. Architectural Stability Fixes
- **Ref-to-State Migration:** Refactored the core board management in `ChessGame.tsx` from mutable `useRef` to reactive `useState`. This ensures the visual board and internal logic are always deterministically synchronized, fixing the "Invalid Move" crashes.
- **Resumption Awareness:** Refactored PGN loading to happen during state initialization. The AI Tutor now detects resumed games and provides a specialized "Resume Greeting" that acknowledges the current board state instead of greeting as a new game.
- **Commentary De-duplication:** Implemented immediate "Ref-locking" in `Tutor.tsx`. The moment an LLM call starts, a lock is placed to ignore all secondary triggers from React re-renders, ensuring "One Exchange = One Response."

### 3. Type Safety & Lint Resolution
- **Lint Cleanup:** Resolved over **40 critical React errors**, including cascading renders (setting state in useEffect without guards) and "accessing refs during render" violations.
- **'any' Elimination:** Systematically replaced the `any` type with specific interfaces or `unknown` in `Tutor.tsx`, `OpeningTrainer.tsx`, and `geminiErrorHandler.ts` for professional-grade type safety.

### 4. Testing
- Updated analysis tests to support the new high-density breadcrumb labels and multi-element tactical badges.
- **Final Result:** 100% pass rate across all **238 workspace tests**.

---

# Pull Request Preparation: Move Square Highlighting

## Context
Users were having difficulty tracking moves made by the opponent (AI) and themselves, especially during rapid gameplay or historical navigation. The application lacked a visual "trail" showing the origin and destination of the most recent move.

## Changes

### 1. Centralized UI Styles & Utilities
- **New Utility (`src/lib/chessStyles.ts`):** Created a centralized location for shared chessboard styles.
- **Theme Unification:** Consolidated all hardcoded colors (`#779954`, `#e9edcc`) and animation settings into a global `CHESSBOARD_THEME` object.
- **Robust Helper:** Implemented `getMoveHighlight()` which handles multiple move data formats including Move objects, coordinate objects, and raw UCI strings.

### 2. Visibility & API Correctness
- **API Resolution:** Corrected a critical mismatch with `react-chessboard` v5. Moves the highlighting prop from `customSquareStyles` (v4) to `squareStyles` and ensures it is correctly nested within the `options` object.
- **Layering Guarantee:** Switched from `backgroundColor` to `inset boxShadow` for highlights. This ensures that the highlight renders "on top" of the square's opaque background and is not obscured by piece images or board themes.

### 3. Application-Wide Integration
- **Game Mode:** Added live highlighting for user and computer moves, with automatic clearing on "Undo" or "New Game."
- **Analysis Mode:** Implemented history-aware highlighting that updates dynamically as the user navigates forward or backward through a game.
- **Opening Trainer:** Added navigation-aware highlighting that stays synchronized with the user's current position in the repertoire.
- **Tactical Practice:** Implemented highlighting for both the player's attempts and the AI's puzzle responses.

### 4. Testing
- **New Logic Tests:** Created `src/lib/__tests__/chessStyles.test.ts` with 100% coverage for the highlight generation logic.
- **Enhanced UI Tests:** Created comprehensive move highlighting tests for `ChessGame` and `AnalysisPage` covering:
    - Successful piece drops.
    - Async pre-analysis safeguards.
    - Multi-step history navigation.
    - State resets (Undo).
- **Final Result:** All **241 workspace tests** are passing.

