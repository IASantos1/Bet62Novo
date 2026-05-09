# Bet62 — Plataforma Brasileira de Apostas Esportivas

Bet62 é uma plataforma completa de apostas esportivas com dados ao vivo via Statpal API, sistema de Cash Out, odds avançadas, e painel administrativo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `STATSPAL_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Frontend: React + Vite, Framer Motion, shadcn/ui, Tailwind CSS, Wouter
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/bet62/src/pages/home.tsx` — main betting UI (hero, match cards, bet slip, live section, auth modal)
- `artifacts/bet62/src/pages/admin.tsx` — admin dashboard (login, stats, users, bets)
- `artifacts/bet62/src/App.tsx` — router (/ = home, /admin = admin panel)
- `artifacts/bet62/src/hooks/use-auth.tsx` — JWT auth context for regular users
- `artifacts/api-server/src/routes/matches.ts` — Statpal live + upcoming match engine
- `artifacts/api-server/src/routes/bets.ts` — bet placement, history, cash out
- `artifacts/api-server/src/routes/auth.ts` — register/login/me for regular users
- `artifacts/api-server/src/routes/admin.ts` — admin login, stats, user/bet management
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware for users
- `artifacts/api-server/src/middlewares/adminAuth.ts` — JWT middleware for admins
- `lib/db/src/schema/users.ts` — users DB schema
- `lib/db/src/schema/bets.ts` — bets DB schema

## Admin Access

- URL: `/admin`
- Default username: `admin`
- Default password: `bet62admin2026`
- Override via env vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- Admin JWT lasts 8 hours; stored in sessionStorage (clears on tab close)

## Architecture decisions

- Admin auth is separate from user auth — same SESSION_SECRET but JWT payload has `isAdmin: true`; no DB table needed for admin
- Statpal live data is cached server-side for 15s to avoid rate limits; upcoming matches are static with computed advanced markets
- Cash out value = (stake × originalOdds) / currentOdds × 0.92 (8% house margin)
- Admin bet settlement: marking a bet as "won" atomically credits the user's balance with potentialWin
- Regular user balance starts at R$ 1.000 on registration

## Product

- Betting platform with live scores (Statpal API), multiple odds markets, bet slip, and cash out
- Admin dashboard at /admin: stats overview, user management with balance adjustments, bet settlement
- Registration with CPF, phone, date of birth (18+ validation), terms acceptance

## User preferences

- Language: Portuguese (Brazilian) throughout the UI
- Dark theme (zinc/red color scheme)
- Always use `zod/v4` imports, never `zod`

## Gotchas

- Always run `pnpm run typecheck:libs` before `api-server typecheck` (lib must be built first)
- Statpal API base URL is `statpal.io` (not `statspal.io`) with `?access_key=` query param
- Admin credentials default to `admin` / `bet62admin2026` if env vars not set — change in production
- `req.params.id` must be cast with `String(req.params["id"])` in Express 5 (TS union type)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
