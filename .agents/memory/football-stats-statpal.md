---
name: Football stats — Statpal limitations and fallback
description: Why the football stats panel was empty and what fallback was implemented
---

## Rule
Statpal has no per-match statistics endpoint. `/v2/soccer/match/{id}/statistics` returns 404.
The only stats source is SportsAPI Pro, which requires `SPORTSAPI_KEY` (not set in this deployment).

**Why:** Confirmed via direct HTTP probe during debugging session.

## How to apply
When `SPORTSAPI_KEY` is absent, the `/v2-statistics` endpoint fallback:
1. Computes **estimated possession** from `_baseOdds` (pre-game odds, not current live odds which shift after goals).
   Formula: `possH = round(1/home / (1/home + 1/away) * 100)`
2. Shows red cards if tracked (`liveState.redCardsHome/Away`).
3. Shows goals from score.
Uses `_baseOdds` preferentially over `liveState.odds` because live odds are distorted by score.

## Architecture note
ALL live football matches go through `buildFootballLiveV2`, not `buildFootballLiveStatpal`.
`buildFootballLiveStatpal` is dead code in the current flow — Statpal matches are converted
via `statpalMatchToV2Event` and processed by `buildFootballLiveV2` with the `football-v2-{id}` prefix.

## If real stats are ever needed
Subscribe to SportsAPI Pro and set `SPORTSAPI_KEY`. The existing `fetchFootballExtras` and
`v2-statistics` endpoint will use it automatically. Statpal's per-match stats endpoint
would need to be discovered via their docs (statpal.io/docs was unreachable when last checked).
