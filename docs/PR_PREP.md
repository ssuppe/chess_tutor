# Pull Request Preparation: Wikipedia Cache Persistence

## Context
The application was suffering from `429 Too Many Requests` errors when fetching Wikipedia data for ~12,000 openings on every startup. Data was also being lost on container restarts.

## Changes

### 1. Infrastructure & Persistence
- **Docker Volume:** Added a volume mapping in `docker-compose.yml` (`./wikipedia-cache:/app/public/wikipedia`) to persist cached JSON files.
- **Auto-Initialization:** Added `scripts/ensure-cache.js` which runs before `npm run dev` and `npm run build` to check if the cache is empty/incomplete (< 10 files) and trigger a rebuild if necessary.
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

### 4. Testing
- Added **10 new tests** in `src/app/api/v1/cache/wikipedia/route.test.ts` covering all API methods and edge cases.
- Total passing tests: **232**.

## How to Submit
When ready to submit this PR:
1. Switch to the `feature/wikipedia-cache-persistence` branch.
2. Review the changes.
3. Use `gh pr create --title "feat: persistent wikipedia cache and management UI" --body-file docs/PR_PREP.md`.
