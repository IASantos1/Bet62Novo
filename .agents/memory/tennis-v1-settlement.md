---
name: Tennis V1 settlement gap
description: ensureFinishedMatchResult ignores tennis-v1-* IDs; fix pattern for adding new V1 sports to settlement.
---

# Tennis V1 Settlement Gap

## The rule
`ensureFinishedMatchResult` in `matches.ts` parses matchIds via regex:
`/^(football-v2|bball-v2|hockey-v2|tennis-v2|baseball-v2|mlb-v2)-(\d+)$/`
Any sport that uses V1 IDs (`tennis-v1-{id}`) returns null from parse() → returns false → bets stay pending forever.

**Why:** The function was built incrementally as V2 sports were added; V1 tennis was added later without updating this function.

**How to apply:** When adding a new sport or V1 variant to the live feed, check that `ensureFinishedMatchResult` handles its matchId format. Add a dedicated branch before the main parse() regex. Also add a `scan{Sport}V1ForFinished()` function (modelled on `scanVolleyballForFinished`) and wire it into the settlement cycle in `settlement.ts`.

## Fix pattern (tennis V1 example)
- `matchId.match(/^tennis-v1-(\d+)$/)` branch in `ensureFinishedMatchResult` (line ~6578 in matches.ts)
- Check DB first, then call `getTennisLiveV1()` and find game with `isTennisV1GameFinished(g)` (statusGroup===4)
- `home = g.homeCompetitor?.score` = sets won (for `osets` settlement: `ft.home + ft.away` = total sets)
- `scanTennisV1ForFinished()` exported from matches.ts; called in settlement.ts Promise.allSettled block
