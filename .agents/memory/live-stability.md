---
name: Live section stability
description: Root causes and fixes for the live matches appearing/disappearing bug
---

# Live Section Stability

## Root causes found
1. **`TENNIS_LIVE_V1_TTL = 2000ms`** — SSE broadcasts every 900ms meant the V1 tennis API was hammered at ~1 req/s, causing rate-limiting → empty responses → all tennis matches disappeared from the broadcast. Fixed to 8000ms.

2. **No per-sport fallback** — when `buildTennisLiveV1Cached()` returned empty (API failure), all tennis matches vanished from the broadcast. The global `getLivePayloadFallback()` only kicks in when the ENTIRE response is empty (all sports empty), not per-sport.

3. **Client stale removal by time only** — matches removed after 10s (→ 30s) regardless of whether it was a single transient miss or repeated absence.

## Fixes applied
**Server (`matches.ts`)**:
- `TENNIS_LIVE_V1_TTL`: 2000 → 8000ms
- `sportWithFallback(sport, fresh)`: module-level Map stores last non-empty result per sport for 35s; used in `buildLivePayload` for all sports
- `_lastGoodSport` Map: keyed by sport name (`"tennis"`, `"football"`, etc.)

**Client (`home.tsx`)**:
- `matchMissCountRef`: tracks consecutive full-sync absences per match ID
- Stale filter: `missCount < 2 || (now - lastSeen) < 30_000` — needs 2+ consecutive misses before removal
- Reset `matchMissCountRef` when clearing all live state

**Why:**
- `sportWithFallback` prevents per-sport flicker without hiding genuinely finished matches (35s TTL lets matches expire naturally after a sport session ends)
- Miss-count approach is more robust than pure time-based: a single bad API response doesn't flush the UI

## Key architectural notes
- `buildLivePayload` is called by both `broadcastLive()` and `GET /live` HTTP route
- SSE delta updates (`type: "update"`) patch one match and update its `lastSeen` but do NOT run `processLiveData` — stale cleanup only happens on full polling syncs
- `emptyLiveStreakRef` already requires 3 consecutive empty responses before clearing the full list
