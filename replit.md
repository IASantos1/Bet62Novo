# Bet62 - Apostas Esportivas

A sports betting (PWA) platform for Brazilian/Portuguese-speaking users — live odds, pre-match betting, multi-bet slips, deposits/withdrawals, and an admin panel.

## Run & Operate

- Running via two Replit workflows: `artifacts/api-server: API Server` (port 8080, mounted at `/api`) and `artifacts/bet62: web` (port 5173, mounted at `/`). Restart them from the Workflows pane after server-side code changes.
- `pnpm --filter @workspace/api-server run dev` — run the API server directly (port 8080, mounted at `/api`)
- `pnpm --filter @workspace/bet62 run dev` — run the web app directly (port 5173, mounted at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` (auto-provisioned), `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`
- Optional env: `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` (deposits/withdrawals), `REDIS_URL` (background settlement queue), `SPORTSAPI_KEY` (live sports data), `SMTP_*` (email delivery)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, sports data ingestion + bet settlement engine
- DB: PostgreSQL + Drizzle ORM
- Web: React + Vite, wouter router, Tailwind, shadcn/ui, Stripe Elements
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/bet62` — web frontend (home, live betting, world cup, admin, profile pages)
- `artifacts/api-server` — Express API: auth, bets, matches/odds, payments, withdrawals, admin, stats, tracking
- `lib/db/src/schema` — Drizzle schema (users, bets, payments, withdrawals, competitions, settlement/ledger tables)
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Imported from an existing GitHub repo (`IASantos1/Bet62Novo`) — only the web (PWA) product was imported; the repo's native mobile app was intentionally excluded.
- Bet settlement runs through a queue/worker (`bullmq` + `settlement.worker.ts`) with Redis optional — settlement falls back to synchronous processing if `REDIS_URL` is unset.
- Live sports data comes from a third-party sports API (statpal.io) gated by `SPORTSAPI_KEY`; without it, matches/odds routes serve cached/fallback data.

## Product

- Users browse pre-match and live odds across football, basketball, tennis, hockey, baseball, volleyball; build multi-bet slips; deposit/withdraw funds; view bet history and profile.
- Admins manage users, suspend/settle events, and review payments/withdrawals via an admin panel.

## User preferences

- User communicates in Portuguese.

## Gotchas

- The web app's `/api/*` and `/api/payments/stripe-webhook` calls must go through the `/api` path prefix — the API server is a separate artifact/service.
- Without Stripe keys configured, deposit/withdrawal flows will not complete real payments.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
