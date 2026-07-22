---
name: Football stats implementation
description: What was built for football live stats — goal/card events, H2H, storylines
---

## Goal/card events in _liveExtra

**Rule:** `fetchStatpalMatchStats` returns `{ football: { goals, cards } }` with player names. The `buildFootballLiveV2` `statsOverlay` previously only merged numeric fields. Added explicit merge for `football` object after the numeric forEach loop.

**How to apply:** When adding new non-numeric fields from `fetchStatpalMatchStats` to `_liveExtra`, they need to be merged explicitly (the `mergeStatNum` helper only handles `keyof FootballExtras` numeric keys). Pattern added at ~line 16184:
```typescript
const mergedFootball = freshFootball ?? prevFootball;
if (mergedFootball && (goals.length > 0 || cards.length > 0)) {
  statsOverlay.football = mergedFootball;
}
```

## Statpal H2H in /confrontos

**Rule:** Statpal H2H uses team IDs from `liveMatchState.get(matchId)?.homeTeamId/awayTeamId`. The endpoint is `/v2/soccer/head-to-head?team1_id=X&team2_id=Y`. Runs before SportsAPI Pro V2 — V2 skips if Statpal already found data.

**Response format guessed (not documented):** `{ head_to_head: { summary: { team1_wins, team2_wins, draws }, matches: [...] } }`. Falls through gracefully if format doesn't match.

## Storylines endpoint

**Endpoint:** `GET /api/matches/storylines/:matchId`

Calls Statpal `/v2/soccer/live-storylines`, finds match by `main_id/id/match_id`, returns `{ storyline: string | null }`. 1-minute cache. Returns null if no STATPAL_API_KEY or match not found.

## Frontend

- `MatchStatsPanel.tsx`: Added `storyline?: string | null` prop, "eventos" and "insight" to TabId. "Eventos" tab shows goal/card timeline from `liveExtra.football`. "Storyline" (insight tab) shows the narrative text.
- `home.tsx`: Added `matchStoryline` state, fetch effect for live football matches, passed to MatchStatsPanel.
