---
name: Tennis settlement fixes
description: Root causes and fixes for tennis bets stuck in open bets / correct-score set markets not settling
---

## Root causes fixed (July 2026)

### Fix 1 — `isProviderManagedMatchId` excluded `tennis-v1-`
The pre-fetch step in `autoSettlePendingBets` only calls `ensureFinishedMatchResult()` for IDs that pass `isProviderManagedMatchId`. Tennis-v1 was missing, so the DB fallback was never reached. Added `tennis-v1` (and `nhl`, `nba`, `mlb`) to the regex.

### Fix 2 — `providerMatchIdPrefixesForSport("tennis")` only had `"tennis-v2"`
For pure numeric match IDs, canonical ID generation produced `tennis-v2-X` never `tennis-v1-X`. Added `"tennis-v1"` to the list.

### Fix 3 — `scanTennisV1ForFinished` only checked live feed
Matches that finished between scan cycles (or during a server restart) were missed. Now scans BOTH `/v1/tennis/live` AND `/v1/tennis/all` (today's games stay here for hours). Also added a DB recovery pass on startup: re-loads all tennis results from `matchResultsTable` for the last 7 days into `finishedMatchResults`.

### Fix 4 — Per-set scores missing from `finishedMatchResults`
`sc1-6-3`, `sc2-4-6`, `ses-6-3` (correct score of set) markets need `extras.tennis.sets` to settle. `scanTennisV1ForFinished` was only storing `home`/`away` (total sets won), not the per-set game scores. Fixed by:
- Adding `stages?: V1TennisStage[]` to the `V1TennisGame` interface
- Extracting set stages (`/^set \d+$/i`) in `scanTennisV1ForFinished` and storing `extras = { tennis: { sets: [[6,3],[4,6]] } }`
- `getTennisSetsFromExtras(extras)` already reads this shape correctly

## Correct-score-of-set settlement timing
**Rule**: `sc1-` bets settle when set 1 finishes; `sc2-` when set 2 finishes; `ses-` on the final set. This is handled by `liveDefinitiveOutcomeForSel` during live settlement — it checks `tennisSetFinished(tennisSets[setNum-1])` before committing. No code change needed here; the live state already has `_liveExtra.sets` from both Statpal livescores and V1 live feed.

## Selection key format
- `sc1-6-3` = correct score of set 1 is 6-3 (home:6, away:3)
- `sc2-4-6` = correct score of set 2 is 4-6
- `ses-6-3` = correct score of the final/deciding set is 6-3
- These keys are built by `home.tsx` as `sc1-${sc.label}` where label is the API score string

## Data flow for correct-score settlement
```
/v1/tennis/all or /live → stages → sets [[6,3],[4,6]] → extras.tennis.sets
  → persistFinishedMatchRecord (DB)
  → finishedMatchResults.set("tennis-v1-X", { ...extras })
  → getTennisSetsFromExtras(extras) → [[6,3],[4,6]]
  → scoreOutcomeForSel("sc1-6-3") → tennisSets[0] = [6,3] → "won"
```
