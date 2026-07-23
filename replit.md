# Bet62 — Sports Betting Platform

## Project overview
Bet62 is a sports betting platform primarily focused on football/soccer. Users can browse matches, place bets, manage their balance (via Stripe deposits), and track their bet history. An admin panel allows operators to manage matches, users, withdrawals, and settlement.

## Architecture

**Monorepo** managed by pnpm with the following packages:
- `artifacts/bet62` — React 19 + Vite frontend (Radix UI, Tailwind CSS, Framer Motion, TanStack Query, Wouter)
- `artifacts/api-server` — Express 5 backend (TypeScript, Drizzle ORM, BullMQ, ioredis)
- `lib/db` — Shared PostgreSQL schema and `initDb()` schema init
- `lib/api-zod` — Shared Zod schemas and API types
- `lib/api-client-react` — Shared React Query hooks/clients

## Running the project

Both services start automatically via their workflows:

| Service | Workflow name | Port |
|---|---|---|
| Frontend (Vite) | `artifacts/bet62: web` | 5173 |
| API Server (Express) | `artifacts/api-server: API Server` | 8080 |

The frontend proxies `/api` and `/ws` to the API server at port 8080.

**API server dev command:** builds with esbuild then runs the compiled bundle (`pnpm --filter @workspace/api-server run dev`)

## Required secrets / environment variables

| Variable | Purpose | Status |
|---|---|---|
| `SESSION_SECRET` | JWT-like signing for auth tokens | ✅ Configured |
| `ADMIN_PASSWORD` | Admin panel login password | ✅ Configured |
| `DATABASE_URL` | PostgreSQL connection string | ✅ Replit-managed (auto-provided) |
| `REDIS_URL` | BullMQ settlement queue | ✅ Configured |
| `STATPAL_API_KEY` | Statpal live scores (primary data source) | ✅ Configured |
| `STRIPE_SECRET_KEY` | Stripe payments backend | ✅ Configured |
| `STRIPE_PUBLISHABLE_KEY` | Stripe frontend key | ✅ Configured |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | ✅ Configured |
| `SMTP_HOST` | Email delivery host | ✅ Configured |
| `SMTP_USER` | Email delivery username | ✅ Configured |
| `SMTP_PASS` | Email delivery password | ✅ Configured |

**Set as env vars (non-secret):**
- `ADMIN_USERNAME=Israel`
- `ADMIN_EMAIL=suportebet62@gmail.com`
- `SMTP_PORT=587`
- `SMTP_FROM=suportebet62@gmail.com`
- `FOOTBALL_LIVE_PROVIDER=statpal`
- `FOOTBALL_DAILY_PROVIDER=statpal`
- `NODE_ENV=development`

## Database
Replit's built-in PostgreSQL is used. Schema is auto-initialised on API server startup via `lib/db/src/init.ts` (all statements use `IF NOT EXISTS` — fully idempotent). No manual migration step needed in development.

## Notable quirks
- The API server **must** be built before running (`esbuild` bundle); the dev script does this automatically.
- `REDIS_URL` is optional — the settlement queue is gracefully disabled when not set.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_EMAIL` are all required for the server to start; it throws on boot if any are missing.
- The frontend's Vite proxy handles `/api` → `localhost:8080`, so all API calls work without CORS in development.
- Originally deployed on Railway (production serves the built React SPA from the Express server).

## User preferences
- Keep the existing monorepo structure and stack.
- After every change (no matter how small), always do `git add -A && git commit` and then `git push origin main` automatically — no need to ask.
