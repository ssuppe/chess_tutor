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

# Pull Request Preparation: Mobile UX & High-Density Gameplay

## Context
Mobile users faced significant ergonomic friction due to a vertical layout that required constant scrolling between the chessboard and the AI coach. The on-screen keyboard also frequently shifted the board off-screen, breaking the game's mental flow.

## Changes

### 1. Smart Split Architecture (Unified Pattern)
- **Permanent Horizontal Split**: Replaced the long-scroll vertical layout with a stable 35/65 side-by-side split on mobile. This pattern was porting from the main Gameplay mode to both the **Analysis Page** and **Opening Trainer**.
- **Adaptive Resizing**: Users can now **tap the board column** to toggle its width between **35% (Mini)** and **55% (Focus)** in all training modes.
- **Interaction Overlay**: Implemented a transparent overlay over the board area to ensure taps are reliably caught without being swallowed by the chessboard component.
- **Stable Visual Anchor**: The chessboard is now pinned to the left column, providing a constant view of the game state while chatting.
- **Viewport Tracking**: Integrated the `window.visualViewport` API to track real-time available height. The UI now anchors to the `offsetTop` and uses precise pixel heights to prevent the browser from 'shifting' the board off-screen when the keyboard opens.

### 2. AI Coach Intelligence Restoration
- **Full Prompt Fidelity**: Restored the high-detail original system prompts (Move Help, Resignation, Opening Training) that had been accidentally shortened during UI refactoring.
- **Tactical Oversight**: Re-implemented the `analyzeExchange` logic in `Tutor.tsx`, restoring the coach's ability to identify missed forks, pins, and skewers.
- **Positional Grounding**: Integrated `generateHumanReadableBoard` across all system triggers, ensuring the coach maintains perfect awareness of piece locations to prevent hallucinations.
- **Game Resumption**: Restored logic to detect existing game history, allowing the coach to greet players with a context-aware "continuation" message instead of a generic welcome.

### 3. High-Density UI Polish
- **Minified Avatars**: Removed coach icons from individual bubbles and shrunk user avatars to `w-3 h-3` to reclaim horizontal space for text.
- **Focus-Aware Density**: Implemented a minimalist 'Chatting with Coach' header and auto-hiding 'Quick Actions' (Hint/Best Move) when the input is focused, maximizing room for the conversation above the keyboard.
- **Game Context Strip**: Clustered opponent material, horizontal Evaluation Bar, and Last Move labels into a high-density vertical strip beside the mini-board.
- **Contrast Strategy**: Implemented dynamic backgrounds for captured piece trays to ensure 100% legibility across all themes.

### 4. Technical Refinements
- **Unified Navigation**: Standardized the "Back to Menu" button as a high-visibility text-link.
- **Anti-Flicker Logic**: Muted CSS transitions and implemented `will-change: height, top` hints to ensure fluid keyboard animations.
- **React Safety**: Wrapped `ReactMarkdown` in styled containers to resolve `className` deprecation warnings and ensure consistent typography.

## Testing & Validation
- **Multi-Mode Test Suite**: Verified stability with `MobileChatOverlay.test.tsx` (Gameplay), `page.test.tsx` (Analysis), and `Tutor.test.tsx`.
- **Final Result**: All **247 workspace tests** are passing.
