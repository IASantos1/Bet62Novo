---
name: Settlement Statpal-only migration
description: scanV2AllSportsForFinished removed; NHL/NBA/MLB use Statpal live+daily feeds; standalone worker guard added.
---

## Rule
All settlement scanning now uses Statpal exclusively. `scanV2AllSportsForFinished()` is gone — do NOT reintroduce it.

## New scan functions (matches.ts, exported)
- `scanNHLForFinished()` — checks Statpal NHL live feed for Finished status + `getHockeyDailyResults()` (d-1). matchId: `nhl-${id}`.
- `scanNBAForFinished()` — checks Statpal NBA live feed + `getBasketballDailyResults()` (d-1). matchId: `nba-${id}`.
- `scanMLBForFinished()` — checks Statpal MLB live feed + `getMLBDailyResults()` (d-1). matchId: `mlb-${id}`.

## settlement.ts worker cycle (run() → Promise.allSettled)
1. `scanDailyForFinished()` — football (Statpal daily)
2. `scanVolleyballForFinished()` — volleyball (Statpal live)
3. `scanTennisV1ForFinished()` — tennis (Statpal V1)
4. `scanNHLForFinished()` — hockey
5. `scanNBAForFinished()` — basketball
6. `scanMLBForFinished()` — baseball

## Dual-worker guard
`settlement.worker.ts` (standalone process) is now a no-op unless `ENABLE_STANDALONE_WORKER=true` is set. The main API server runs settlement inline; both running simultaneously would cause double-processing (idempotency prevents double-payouts but wastes resources).

## Post-cycle email notifications
`notifySettledBetsInBackground()` runs after each `autoSettlePendingBets()` call. Queries bets settled in last 90 s, looks up user email via usersTable, calls `sendBetSettled()` from mailer.ts fire-and-forget. Tracks notified bet IDs in `_notifiedBetIds` Set (pruned at 50k entries).

## Volleyball markets added
Registry now covers: `match_winner`, `total_sets`, `set_winner`, `set_handicap`, `set_points`, `total_points`. Set points parsed from `extras.volleyball.sets[]` array or period1/set1 fallback keys.

## MatchStateEngine additions
Added `htHomeScore`, `htAwayScore`, `clockStr`, `sport` fields to `MatchState`. Added `updateScore()` and `finishMatch()` convenience methods. `normalizeStatus()` now covers NBA quarters (q1..q4), NHL periods (1p..3p), MLB innings (top/bottom prefix), After OT/SO, Final, Closed.

**Why:** SportsAPI Pro was removed to make Statpal the sole data provider; match IDs already use Statpal-native prefixes so scans produce matching keys.
