---
name: Football live goal tracking
description: How goal minutes are tracked per match in the live football state; where to add new tracking logic; why stats are empty.
---

## Goal minute tracking
- Tracked in `buildFootballLiveV2` (the main football state builder for `football-v2-*` IDs).
- Added to `liveExtra` object (~line 15910) via `homeGoalMinutes[]` and `awayGoalMinutes[]`.
- Score-change detection: when `homeScore > existing.homeScore`, pushes `minute` to the home array.
- Arrays are deduplicated and sorted on every tick.
- **Limitation**: goals scored before the current server session are not retroactively recorded — only future goals during uptime are tracked.

## Key code paths
- `buildFootballLiveV2` (~line 15429) — main football live builder for all provider paths (Statpal + SportsAPI both funnel through this via `SAPIV2Event[]`).
- `buildFootballLiveStatpal` (~line 13792) — secondary builder that tracks goals from `m.events?.event` events when Statpal provides them; uses `m.main_id` as liveMatchState key.
- Both paths store `homeGoalMinutes`/`awayGoalMinutes` in `_liveExtra`.

## Stats panel (v2-statistics)
- Stats come from SportsAPI V2 `/match/{id}/statistics` which requires `SPORTSAPI_KEY` (not set).
- Fallback implemented: when SportsAPI fails, synthesizes a stats group from `_liveExtra` fields (possession, shots, attacks, etc.).
- If `_liveExtra` has no stat fields either (common for football-v2 matches), the panel stays empty — this is correct behavior, not a bug.

## Incidents (v2-incidents)  
- Fallback: when SportsAPI fails, returns `match.events[]` from liveMatchState, or builds goal-type incidents from `homeGoalMinutes`/`awayGoalMinutes`.

## Why football-v2 matches have only clock data in _liveExtra
- `fetchFootballExtras(id)` populates possession/shots/corners etc. but requires `SPORTSAPI_KEY`.
- Without that key, `_liveExtra` only gets clock fields (kickoffSec, clockSec, clockAtMs, clockRunning, clockStr) plus goal minutes.
