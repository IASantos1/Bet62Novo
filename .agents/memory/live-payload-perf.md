---
name: Live payload cold-start bottlenecks
description: What makes buildLivePayload slow on cold start and how to keep it under 4s
---

## Root causes identified

1. **HTTP live/today fallback timeouts too high** — defaults were 8-9s; all HTTP fetches that run in the live payload must be ≤3s so `Promise.all` completes in ≤4s even when the API is slow or returning 404.

2. **fetchLiveRace() empty-V1 deadlock** — original code threw `"empty"` when V1 returned `{ data: { games: [] } }` (valid: no live games right now). Promise.any then waited for V2 to timeout (8s). Fix: V1 format check must accept empty games array as a successful response (return [] immediately); only V2 needs non-empty to count as success.

3. **buildTennisLiveV1Cached() was sequential** — was called `await buildTennisLiveV1Cached()` AFTER the main `Promise.all`. This added 4-6s sequentially. Fix: include it in the same `Promise.all`.

## Correct timeouts (as of fix)

| Call | Timeout |
|---|---|
| `getFootballLiveV2()` → `fetchLiveRace()` V1/V2 | 3s each |
| `getHockeyLiveV2()` direct V2 fetch | 3s |
| `getBaseballLiveV2()` direct V2 fetch | 3s |
| `getTennisLiveV2()` inline `tryTennis` | 3s |
| `getTennisTodayV2()` | 3s |
| `fetchTennisLiveV1()` (cold V1 HTTP) | 4s |
| All V2 /today endpoints (football/basketball/hockey/tennis/baseball) | 3s |

## fetchLiveRace contract (important)

```typescript
// V1: accept empty games[] as valid (0 live games is a real state, not an error)
const tryV1 = async () => {
  const resp = await fetch(`${v1Base}/live`, { signal: AbortSignal.timeout(3000) });
  const v1Data = raw["data"] as { games?: V1LiveGame[] } | null | undefined;
  if (v1Data && !Array.isArray(v1Data) && Array.isArray(v1Data.games)) {
    return v1Data.games.map(v1GameToV2Event); // returns [] when no live games
  }
  throw new Error("not V1 format");
};
// V2: still requires non-empty (V2 format unreliable when degraded)
const tryV2 = async () => {
  if (v2Events.length === 0) throw new Error("empty");
  return v2Events;
};
return Promise.any([tryV1(), tryV2()]).catch(() => []);
```

## Correct Promise.all structure

```typescript
const [
  footballEvents, basketballEvents, hockeyEvents, baseballEvents,
  tennisEvents, tennisTodayEvents, tennisV1LivePart,
] = await Promise.all([
  getFootballLiveV2(),
  getBasketballLiveV2(),
  getHockeyLiveV2(),
  getBaseballLiveV2(),
  getTennisLiveV2(),
  getTennisTodayV2(),
  buildTennisLiveV1Cached(),   // ← must be here, not after
]);
```

## Hot cache

`_livePayloadHotCache` (1.5s TTL) + `_livePayloadInFlight` dedup ensures only one build at a time. Cold builds take ~3-4s; after that hot cache returns in <5ms.

**Why:** V2 HTTP live endpoints return 404 in 6-7s and timeout in 3-9s when degraded; Tennis V2 /today returns 404 after 9s → blocked `Promise.all`. After all fixes: worst case ~3.5s (3s timeout + parse overhead).
