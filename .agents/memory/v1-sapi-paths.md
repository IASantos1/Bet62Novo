---
name: V1 SportsAPI Pro paths
description: Correct URL structure for V1 SportsAPI Pro endpoints and V1 live game data format
---

## Rule
All V1 SportsAPI Pro sports use `/api/v1/{sport}/` as the path prefix — NOT `/api/` (returns 404).

**Why:** The V1 gateway routes requests via `/api/v1/{sport}/` versioned paths. The constants `SAPI_V1_FOOTBALL` and `SAPI_V1_BASKETBALL` were historically wrong (used `/api` base), causing all football/basketball V1 live calls to return 404.

**How to apply:**
- `SAPI_V1_FOOTBALL = "https://v1.football.sportsapipro.com/api/v1/football"` → `${base}/live` = correct
- `SAPI_V1_BASKETBALL = "https://v1.basketball.sportsapipro.com/api/v1/basketball"` → `${base}/live` = correct
- `SAPI_V1_TENNIS` remains `"https://v1.tennis.sportsapipro.com/api"` because its functions manually append `/v1/tennis/` (e.g. `${SAPI_V1_TENNIS}/v1/tennis/live`)

## V1 live response format
V1 football and basketball live returns `{ data: { games: V1LiveGame[] } }` — different from V2's `{ events: SAPIV2Event[] }`.

Each `V1LiveGame` has:
- `homeCompetitor: { name, score }` / `awayCompetitor: { name, score }` (not homeTeam/awayTeam)
- `statusGroup`: 2=Scheduled, 3=Live, 4=Ended
- `gameTime`: minute integer
- `competitionDisplayName`: league name string
- `competitionId`: numeric id

Use `v1GameToV2Event()` to map V1 games to SAPIV2Event for the shared live pipeline.

## WC 2026 specific
- competitionId = 5930
- `/current` returns ~99 games including 2+ upcoming WC fixtures (more than `/all` which only shows today's round)
- `hasBets: false` on WC pre-match games — real odds not available until game goes live; use generated odds with `hasRealOdds: false` flag and "ODDS ESTIMADAS" label
