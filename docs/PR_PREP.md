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
