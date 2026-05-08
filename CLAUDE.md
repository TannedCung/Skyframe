# Skyframe – Developer Guide

## Project Overview

AI-first tour planner: Next.js 15 App Router, Neon serverless Postgres, NextAuth v4 (Google OAuth), Anthropic Claude (with OpenAI fallback), Kiwi Tequila flight API, AWS SES.

## Key Concepts

- **SG1**: AI-generated high-level trip options (cities, themes, rough dates). No flights yet.
- **SG2**: Full day-by-day itinerary built on a selected SG1 option + real Kiwi flight data.
- **Versioning**: Each SG2 update creates a new `itineraries` row linked to the previous one via `parent_version_id`. The latest is `status='current'`.
- **Cron refresh**: Runs hourly via Vercel Cron. Re-fetches Kiwi data. If price changes >5%, regenerates SG2 with a minimal-diff prompt and notifies watchers via SES.

## Commands

```bash
# Dev server
next dev

# Type checking
tsc --noEmit

# Linting
eslint src --ext .ts,.tsx

# Formatting
prettier --write src tests

# Unit + integration tests
jest

# Coverage
jest --coverage

# E2E tests
playwright test
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in all values.  
For tests, also set `DATABASE_TEST_URL` pointing to a separate Neon branch.

## Project Structure

```
src/
  app/           Next.js App Router pages + API routes
  components/    React UI components
  lib/
    auth.ts      NextAuth config (Google + test credentials)
    db/          Neon client + typed query functions
    llm/         Anthropic/OpenAI provider + SG1/SG2 prompt builders
    flights/     FlightProvider interface + KiwiTequilaFlightProvider
    email/       SES client + email templates
    errors.ts    AppError class + apiError() helper
    iata.ts      IATA airport code validation
    logger.ts    pino structured logger
  types/         Shared TypeScript types
migrations/      SQL DDL (run against Neon manually or via migration tool)
tests/
  setup/         Jest setup + MSW handlers
  unit/          Pure unit tests (no DB, no real HTTP)
  integration/   Tests that hit the Neon test branch
  e2e/           Playwright end-to-end tests
```

## Testing Rules

1. **Unit tests** live in `src/**/__tests__/` or `tests/unit/`. No DB, no real HTTP — use MSW.
2. **Integration tests** hit `DATABASE_TEST_URL`. Always clean up after each test.
3. **E2E tests** run against the live dev server (`next dev` on port 3000). Use the `test-credentials` NextAuth provider to sign in.
4. **MSW handlers** are in `tests/setup/msw-handlers.ts`. Override per-test with `server.use(...)`.
5. Coverage thresholds: 80% statements/functions/lines, 75% branches.

## Code Rules

- TypeScript strict mode — no `any`, no unchecked array access without guard.
- All API routes must call `getServerSession(authOptions)` first and return `apiError(Errors.unauthorized())` if no session.
- IATA codes must be validated with `validateIata()` before being stored.
- LLM calls always go through `callLLM()` in `src/lib/llm/provider.ts` — never call Anthropic/OpenAI SDKs directly in route handlers.
- Flight data always goes through `getFlightProvider()` — never call Kiwi directly in route handlers.
- Log with `logger` (pino) — never `console.log` in production paths.
- Commit messages must follow Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`.

## Database

Run `migrations/001_initial.sql` against your Neon database to set up the schema.  
For the test branch, run the same migration against `DATABASE_TEST_URL`.

The `trips.last_flight_refresh_at` column is set after each cron refresh so we don't re-run within 55 minutes.

## Adding a New Flight Provider

1. Create `src/lib/flights/your-provider.ts` implementing `FlightProvider` interface.
2. Update `getFlightProvider()` in `kiwi.ts` (or extract to a separate factory) to try the new provider as a fallback.
3. Add MSW handlers for the new provider's API in `tests/setup/msw-handlers.ts`.
4. Write unit tests in `src/lib/flights/__tests__/your-provider.test.ts`.
