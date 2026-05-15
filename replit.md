# Bet62 — Plataforma de Apostas Esportivas

Bet62 é uma plataforma completa de apostas esportivas com dados ao vivo via Statpal API, sistema de Cash Out, odds avançadas, e painel administrativo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `STATSPAL_API_KEY`
- Ifthenpay env: `IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_MULTIBANCO_KEY`, `IFTHENPAY_CARD_KEY`, `IFTHENPAY_BACKOFFICE_KEY`
- SMTP env (optional): `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (default noreply@bet62.com)

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
- `GET /api/matches/volleyball-results` — yesterday's volleyball results (`v1/volleyball/daily/d-1`), 5 min cache; `{ results: VolleyDailyResult[] }` with set-by-set scores and homeWon flag
- `GET /api/matches/volleyball-leagues` — active volleyball leagues from today's livescores; `{ leagues: VolleyLeague[] }` with id/gid/league/country; 30s cache (via getVolleyballLive)
- `GET /api/matches/volleyball-schedule/:id` — full season schedule for a league (id = tournament id from livescores); 5 min cache; `{ league, season, country, recentWeeks[], nextWeek }` — recentWeeks = last 3 finished rounds, nextWeek = first round with upcoming matches
- `GET /api/matches/volleyball-standings/:id` — league standings table; 5 min cache; `{ id, name, season, country, teams[] }` — teams = [] for play-off phases (API returns no data); pos/w/l/pts/points_for/points_against/recent_form/description
- `GET /api/matches/volleyball-odds` — pre-match odds for all upcoming volleyball matches (`v1/volleyball/odds`); 5 min cache; `{ odds: VolleyOddsEntry[] }` — averaged across bookmakers with 2.5% house margin; includes Home/Away + Over/Under 3.5 sets line
- `GET /api/matches/basketball-standings` — NBA standings (`v1/nba/standings`), 30 min cache; `{ season, conferences[] }` — conferences = Eastern/Western, each with `divisions[]` (Atlantic/Central/Southeast/Northwest/Pacific/Southwest), each with `teams[]` (position/won/lost/pct/gb/streak/lastTen/homeRecord/roadRecord/ppg/papg/diff + `abbr` for roster lookup); accessible via "🏆 Classificação" tab in basketball expanded view
- `GET /api/matches/basketball-roster/:team` — NBA team roster (`v1/nba/rosters/{abbr}`), 1h cache; `{ teamName, abbreviation, season, players[] }` — players sorted by position (G/F/C) then name; each player has id/name/number/age/position/college/height/weight/salary; click team row in standings to load; uses standard NBA abbreviations (lowercase) via NBA_ABBR map; API has typos `heigth`/`weigth` (handled)
- `GET /api/matches/basketball-team-stats/:team` — NBA per-player season stats (`v1/nba/team-stats/{abbr}`), 30 min cache; `{ teamName, players[] }` — merges "Game" + "Shooting" categories by player id; players sorted by PPG desc; each has ppg/rpg/apg/bpg/spg/topg/fpg/min/gp/gs + fgPct/fg3Pct/ftPct (percentages as %; API gives 0–1 floats); accessible via "Estatísticas" tab in roster panel
- `GET /api/matches/basketball-odds` — NBA pre-match odds (`v1/nba/odds`), 5 min cache; `{ odds: NBAOddsEntry[] }` — single category (USA: NBA), "3Way Result" market averaged across bookmakers with 2.5% house margin; includes homeOdds/awayOdds only (no Draw — basketball has no draws); matched to Calendário NBA by normalized team name + date; 1-2 buttons appear on calendar cards when odds available
- `GET /api/matches/basketball-injuries/:team` — NBA injury report (`v1/nba/injuries/{abbr}`), 15 min cache; `{ teamName, report[] }` — report items: playerName/playerId/status/description/date; status "Sidelined" → red badge; description "Game Time Decision" → yellow badge; other body-part statuses (Calf/Wrist/etc.) → amber badge; empty report = team fully healthy
- `GET /api/matches/basketball-schedule` — NBA full season schedule (`v1/nba/season-schedule`), 30 min cache; `{ league, season, upcomingMatches[], recentMatches[] }` — upcomingMatches = next 21 days "Not Started" games sorted by date/time; recentMatches = last 14 days finished games with quarter scores; shown as "📅 Calendário NBA" on main page; **fallback to `v1/nba/livescores` when season-schedule is empty (playoffs)**
- `GET /api/matches/basketball-results` — yesterday's NBA results (`v1/nba/daily/d-1`), 5 min cache; `{ results: BasketballDailyResult[] }` with quarter-by-quarter scores (Q1/Q2/Q3/Q4/OT) and homeWon flag
- `GET /api/matches/hockey-results` — yesterday's NHL results (`v1/nhl/daily/d-1`), 5 min cache; `{ results: HockeyDailyResult[] }` with period-by-period scores (P1/P2/P3/OT/SO) and homeWon flag
- `GET /api/matches/hockey-schedule` — NHL full season schedule (`v1/nhl/season-schedule`), 30 min cache; `{ league, season, upcomingMatches[], recentMatches[] }` — recentMatches (last 14 days) include `teamStats` (shotsOnGoal, savesPct, ppGoals, ppPct, penKillPct, faceoffPct, penaltyMinutes) from `team_stats` field; upcomingMatches = next 21 days "Not Started" games sorted by date/time; **fallback to `v1/nhl/livescores` when season-schedule is empty (playoffs)**
- `GET /api/matches/hockey-standings` — NHL standings (`v1/nhl/standings`), 30 min cache; `{ season, conferences[] }` — conferences = Eastern/Western, each with `divisions[]` (Atlantic/Metropolitan/Central/Pacific), each with `teams[]` (position/gp/won/lost/otLosses/points/gf/ga/diff/streak/lastTen/homeRecord/roadRecord + `abbr` for roster lookup)
- `GET /api/matches/hockey-roster/:team` — NHL team roster (`v1/nhl/rosters/{abbr}`), 1h cache; `{ teamName, abbreviation, season, positions[] }` — positions = Centers/Left Wings/Right Wings/Defense/Goalies, each with `players[]` (id/name/number/age/birthPlace/height/weight/shot/salary); frontend caches all fetched rosters in state; Statpal uses non-standard abbreviations: `tb` (Tampa Bay), `la` (LA Kings), `nj` (NJ Devils), `sj` (San Jose); Vegas/Seattle/Utah/Arizona have no roster endpoint
- `GET /api/matches/hockey-team-stats/:team` — NHL per-player season stats (`v1/nhl/team-stats/{abbr}`), 30 min cache; `{ teamName, season, skaters[], goalies[] }` — skaters: rank/name/pos/gp/goals/assists/points/plusMinus/pim/ppg/ppa/shots/gwg/toiPerGame/faceoffPct; goalies: rank/name/gp/wins/losses/otLosses/saves/savesPct/shotsAgainst/goalsAgainst/shutouts/toi; same abbreviation map as rosters
- `GET /api/matches/hockey-injuries/:team` — NHL injury report (`v1/nhl/injuries/{abbr}`), 15 min cache; `{ teamName, report[] }` — report items: playerName/playerId/status/description/date; status values: "Sidelined" (red), "I.L." (amber), "Day-to-Day" (yellow); empty report = team fully healthy
- `GET /api/matches/hockey-odds` — NHL pre-match odds (`v1/nhl/odds`), 5 min cache; `{ odds: HockeyOddsEntry[] }` — single category (USA: NHL), "3Way Result" market averaged across bookmakers with 2.5% house margin; includes homeOdds/drawOdds/awayOdds; matched to Calendário NHL by normalized team name + date; 1X2 buttons appear on calendar cards when odds available
- `GET /api/matches/live` — MLB included via `v1/mlb/livescores`; sport = `"baseball"`; match IDs prefixed `mlb-`; statuses: "Not Started" / "1st Inning"…"9th Inning" / "Extra Inning"; `_liveExtra.innings` = `Array<[homeRuns, awayRuns]>` per inning; markets: run-line ±1.5 (home/away) + total runs O/U 8.5; no draws (`liveOdds.draw = 0`); live odds drift factor 0.10 per run (vs 0.15 for hockey)
- `GET /api/matches/mlb-results` — yesterday's MLB results (`v1/mlb/daily/d-1`), 5 min cache; `{ results: MLBDailyResult[] }` — `innings` = `Array<[homeRuns|null, awayRuns|null]>` (null = inning not played, e.g. home walk-off win skips bottom of 9th); `hasExtra` = true if game went to extra innings; also includes `homeHits/awayHits/homeErrors/awayErrors`; displayed in "Ontem" tab of expanded baseball match view with R/H/E columns
- `GET /api/matches/mlb-schedule` — MLB season schedule (`v1/mlb/season-schedule`), 30 min cache; `{ league, season, upcomingMatches[], recentMatches[] }` — upcomingMatches = next 21 days "Scheduled"/"Not Started" games sorted by date/time; recentMatches = last 14 days "Finished" games with scores; includes `venue` field; **fallback to `v1/mlb/livescores` when season-schedule is empty**; shown as "⚾ Calendário MLB" in main page upcoming tab when baseball sport is selected
- `GET /api/matches/mlb-standings` — MLB standings (`v1/mlb/standings`), 30 min cache; `{ season, leagues[] }` — leagues = American League/National League, each with `divisions[]` (East/Central/West), each with `teams[]` (position/won/lost/gamesBack/streak/homeRecord/awayRecord/runsScored/runsAllowed/runsDiff); displayed as "🏆 Classificação MLB" in "Ontem" tab; click team row to load roster
- `GET /api/matches/mlb-roster/:team` — MLB team roster (`v1/mlb/rosters/{abbr}`), 1h cache; `{ teamName, abbreviation, season, positions[] }` — positions = Pitchers/Catchers/Infielders/Outfielders/Designated Hitter, each with `players[]` (id/name/number/age/position/height/weight/bats/throws/salary); Bats/Throws: L=blue, R=orange, S=purple (switch hitter); MLB_ABBR map covers all 30 teams; roster panel shown when team row clicked in standings
- `GET /api/matches/mlb-team-stats/:team` — MLB per-player season stats (`v1/mlb/team-stats/{abbr}`), 30 min cache; `{ teamName, season, batters[], pitchers[] }` — structure: `statistics.category[].team.player[]`; Batting: avg/obp/slg/hr/rbi/r/h/sb/bb/so sorted by AVG desc; Pitching: era/w/l/ip/so/bb/whip/baa sorted by ERA asc; shown in "Estatísticas" tab of roster panel (lazy-loaded on tab click)
- `GET /api/matches/mlb-injuries/:team` — MLB injury report (`v1/mlb/injuries/{abbr}`), 15 min cache; `{ teamName, report[] }` — report items: playerName/playerId/status/description/date; status colors: "60-Day IL"/Sidelined → red, "15-Day IL"/"10-Day IL" → amber, "7-Day IL"/"Day-to-Day" → yellow; shown in "🩹 Lesões" tab of roster panel (lazy-loaded)
- `GET /api/matches/mlb-odds` — MLB pre-match odds (`v1/mlb/odds`), 5 min cache; `{ odds: MLBOddsEntry[] }` — single category (USA: MLB), "3Way Result" market averaged across bookmakers with 2.5% house margin; includes homeOdds/awayOdds (drawOdds zeroed out for baseball — draw in API means cancelled game); matched to Calendário MLB by normalized team name + date; 1-2 buttons appear on calendar cards when odds available
- `GET /api/matches/mlb-league-stats` — MLB batting leaders (`v1/mlb/league-stats/mlb_player_batting`), 30 min cache; `{ batters[] }` — top 50 players with rank/name/team/gp/atBats/hits/doubles/triples/homeRuns/runs/rbi/stolenBases/walks/strikeouts/avg/obp/slg; shown in "⭐ Liga" tab of baseball match view with 4 sorted leaderboards: AVG / HR / RBI / SB (top 25 each, client-sorted); note: pitching league-stats endpoint not available on current plan
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
- Statpal live data is cached server-side for 30s to avoid rate limits; upcoming matches are static with computed advanced markets
- Real live endpoints: football v2/live, NBA v1/nba/livescores, NHL v1/nhl/livescores, tennis v1/tennis/livescores, volleyball v1/volleyball/livescores
- Tennis extras: v1/tennis/livestats (match stats: aces/DF/1stServe/winners), v1/tennis/daily/d-1 (yesterday's results), v1/tennis/tournament-list/atp|wta (active tournaments), v1/tennis/tournament/{id} (full draw: all rounds, match-by-match results + schedule), v1/tennis/standings/atp|wta (top 100 rankings with movement), v1/tennis/odds (pre-match odds: Home/Away + 1st Set winner, 11 bookmakers averaged with 2.5% margin, 1 min cache)
- Tennis odds matching: extractSurname strips ALL leading initials (regex `^([A-Z]\\. *)+`) to handle "T. A. Tirante" → "tirante"; keyed by `${date}-${surname0}-${surname1}` in both orders; odds floor at 1.01
- Basketball has no Statpal endpoint — simulated with persistent state; tennis/volleyball fall back to simulation when no live matches
- Simulated live state persists in module-level Maps (_bballMap, _tennisMap, _volleyMap, _hockeyMap) — scores advance incrementally, never jump
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
