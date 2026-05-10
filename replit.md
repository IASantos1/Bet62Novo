# Bet62 — Plataforma de Apostas Esportivas

Bet62 é uma plataforma completa de apostas esportivas com dados ao vivo via Statpal API, sistema de Cash Out, odds avançadas, e painel administrativo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `STATSPAL_API_KEY`
- Ifthenpay env: `IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_MULTIBANCO_KEY`, `IFTHENPAY_CARD_KEY`, `IFTHENPAY_BACKOFFICE_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Frontend: React + Vite, Framer Motion, shadcn/ui, Tailwind CSS, Wouter
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/bet62/src/pages/home.tsx` — main betting UI (hero, match cards, bet slip, live section, auth modal, deposit modal)
- `artifacts/bet62/src/pages/admin.tsx` — admin dashboard (login, stats, users, bets)
- `artifacts/bet62/src/App.tsx` — router (/ = home, /admin = admin panel)
- `artifacts/bet62/src/hooks/use-auth.tsx` — JWT auth context for regular users
- `artifacts/api-server/src/routes/matches.ts` — Statpal live + upcoming match engine
- `artifacts/api-server/src/routes/bets.ts` — bet placement, history, cash out
- `artifacts/api-server/src/routes/auth.ts` — register/login/me for regular users
- `artifacts/api-server/src/routes/admin.ts` — admin login (username or email), stats, user/bet management
- `artifacts/api-server/src/routes/payments.ts` — ifthenpay payment initiation + webhook callback
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware for users
- `artifacts/api-server/src/middlewares/adminAuth.ts` — JWT middleware for admins
- `lib/db/src/schema/users.ts` — users DB schema
- `lib/db/src/schema/bets.ts` — bets DB schema
- `lib/db/src/schema/payments.ts` — payments DB schema (tracks ifthenpay orders)

## Admin Access

- URL: `/admin`
- Default username: `admin` OR email: `admin@bet62.com`
- Default password: `bet62admin2026`
- Override via env vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`
- Admin JWT lasts 8 hours; stored in sessionStorage (clears on tab close)

## Ifthenpay Payment Flow

- **Multibanco**: `POST /api/payments/multibanco` → calls ifthenpay API → returns entity/reference → user pays at ATM → ifthenpay calls `GET /api/payments/callback?orderId=...&amount=...` → balance credited
- **MB WAY**: `POST /api/payments/mbway` → calls ifthenpay API with phone → user accepts on MB WAY app → webhook credits balance
- **Card**: `POST /api/payments/card` → calls ifthenpay API → returns PaymentUrl → user redirected to 3DS page → `GET /api/payments/card-return` credits balance
- Callback URL for ifthenpay backoffice: `https://{domain}/api/payments/callback`
- All payment orders stored in `payments` table with status: pending → completed/failed

## Architecture decisions

- Admin auth is separate from user auth — same SESSION_SECRET but JWT payload has `isAdmin: true`; no DB table needed for admin
- Admin login accepts username (`admin`) OR email (`admin@bet62.com`) — configurable via env vars
- Statpal live data is cached server-side for 15s to avoid rate limits; upcoming matches are static with computed advanced markets
- Cash out value = (stake × originalOdds) / currentOdds × 0.92 (8% house margin)
- Admin bet settlement: marking a bet as "won" atomically credits the user's balance with potentialWin
- New user balance starts at €0.00 on registration
- Deposits are never credited immediately — only after ifthenpay webhook/card-return confirmation

## Product

- Betting platform with live scores (Statpal API), multiple odds markets, bet slip, and cash out
- Admin dashboard at /admin: stats overview, user management with balance adjustments, bet settlement
- Deposit via Multibanco, MB WAY, or Card (ifthenpay)
- Markets: Football (standard), Basketball (quartos/times), Tennis (jogos/placar), Hockey (períodos/especiais), Volleyball (por set/pontos)

## User preferences

- Language: Portuguese (PT) throughout the UI
- Currency: € (Euro)
- Dark theme (zinc/red color scheme)
- Always use `zod/v4` imports, never `zod`

## Gotchas

- Always run `pnpm run typecheck:libs` before `api-server typecheck` (lib must be built first)
- Statpal API base URL is `statpal.io` (not `statspal.io`) with `?access_key=` query param
- Admin credentials default to `admin` / `bet62admin2026` if env vars not set — change in production
- `req.params.id` must be cast with `String(req.params["id"])` in Express 5 (TS union type)
- ifthenpay callback URL must be configured in the ifthenpay backoffice portal pointing to `/api/payments/callback`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
