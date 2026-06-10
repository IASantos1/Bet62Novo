---
name: Tennis ATP/WTA filter
description: How to correctly filter tennis to main tour only and expose odds in upcoming + live + frontend
---

## Rule
Only ATP/WTA/Grand Slam matches appear in the live section and upcoming list. Challengers, ITF, and any tier-999 unknowns are excluded.

**Why:** The V1 livescores feed returns all active tournaments including Challengers (Bratislava, Ilkley, Cattolica, etc.) which should never appear in the betting platform.

## How to apply

### buildTennisLiveV1 / buildTennisUpcoming
After computing `compName`, call `enrichTennisV1League(compName)` and check if the result `.startsWith("ATP")` or `.startsWith("WTA")` or `.startsWith("Grand Slam")`. If not, `continue`. No separate `itf` array is needed — just a single `primary` array.

### enrichTennisV1League
Cache key stripping: strips leading single-char prefix AND normalizes "s-hertogenbosch" → "hertogenbosch" (strips leading `s-`). The city-tier lookup maps (ATP_CITY_TIER / WTA_CITY_TIER) are the source of truth.

### mergeTennisUpcomingSources (deduplication)
V1 IDs (`tennis-v2-${g.id}` using V1 game ID) differ from V2 odds IDs (`tennis-v2-${entry.matchId}` using SofaScore ID). Deduplicate by normalized player-name pair (sorted, NFD-normalized, lowercased), not by match ID. V2 odds version wins when both exist.

### Frontend (home.tsx)
The odds guard `if (!match.hasRealOdds)` must also allow markets when `match.sport === "tennis" && m?.tennisExtra?.firstSet?.home` is truthy. V1-sourced ATP/WTA matches get `hasRealOdds: true` explicitly set.

### getTennisOdds + rebuildUpcomingCache timing
`getTennisOdds()` must be awaited BEFORE `buildTennisUpcoming()` inside `rebuildUpcomingCache()` so the `_tennisV2LeagueLabelByCompName` cache is populated before enrichment runs.
