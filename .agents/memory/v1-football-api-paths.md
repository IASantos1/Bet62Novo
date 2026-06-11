---
name: V1 Football API correct paths
description: SportsAPI Pro V1 football uses /api/v1/football/ prefix, NOT /api/ — and correct stable endpoints
---

## The Rule
`SAPI_V1_FOOTBALL = "https://v1.football.sportsapipro.com/api"` gives **404** for all endpoints.
Correct base: `https://v1.football.sportsapipro.com/api/v1/football`

**Why:** V1 uses a versioned path (`/api/v1/{sport}/`) unlike V2 which uses `/api/`.

## Working V1 Football Endpoints
- `/api/v1/football/live` — 200, returns `{data: {games: [...]}}`; up to 3-5 live games
- `/api/v1/football/all` — 200, returns ~31 current-round games; **most stable**
- `/api/v1/football/competition/{id}/games` — 200, returns upcoming game for that competition
- `/api/v1/football/competitions` — 200, lists active competitions

## Flaky Endpoints
- `/api/v1/football/current` — sometimes 500 "Request timeout" (upstream flaky); returns ~99 games when working

## FIFA World Cup 2026
- Competition ID: **5930** (`competitionId === 5930`)
- `competitionDisplayName` includes `"FIFA World Cup"` or `"World Cup"`
- `/api/v1/football/all` + filter by compId 5930 is the primary source for WC matches
- `/api/v1/football/live` + filter finds live WC games

## V1 Game Data Format
```
{id, competitionId, competitionDisplayName, startTime (ISO), statusGroup (2=Sched/3=Live/4=Ended),
 statusText, homeCompetitor: {name}, awayCompetitor: {name}, groupName, roundName}
```
Different from V2 (which uses homeTeam/awayTeam objects).

## How to Apply
- `_rebuildWC2026()` in matches.ts: uses `/all` + `/live` + `/competition/5930/games` filtered by compId 5930
- `fetchLiveRace` still uses SAPI_V1_FOOTBALL which has wrong base — it's not fixed but football falls back to V2 live
- Do NOT change SAPI_V1_FOOTBALL without updating fetchLiveRace to handle V1 game format (`data.games`)
