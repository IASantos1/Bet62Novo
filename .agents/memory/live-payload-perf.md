---
name: Live payload cold-start bottlenecks
description: What makes _buildLivePayloadImpl slow on cold start and how to keep it under 4s
---

## Root causes identified

1. **HTTP live/today fallback timeouts too high** — defaults were 8-9s; all HTTP fetches that run in the live payload must be ≤3s so `Promise.all` completes in ≤4s even when the API is slow or returning 404.

2. **buildTennisLiveV1Cached() was sequential** — was called `await buildTennisLiveV1Cached()` AFTER the main `Promise.all`. This added 4-6s sequentially. Fix: include it in the same `Promise.all`.

## Correct timeouts (as of fix)

| Call | Timeout |
|---|---|
| `getFootballLiveV2()` → `fetchLiveRace()` | 3s |
| `getHockeyLiveV2()` | 3s |
| `getBaseballLiveV2()` | 3s |
| `getTennisLiveV2()` (inline `tryTennis`) | 3s |
| `getTennisTodayV2()` | 3s |
| `fetchTennisLiveV1()` (cold V1 HTTP) | 4s |

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

**Why:** V2 HTTP live endpoints return 404 in 6-7s and timeouts in 3-9s; Tennis V2 /today returns 404 with 9s timeout → blocked `Promise.all` for 9s. After fix: worst case ~4s (V1 tennis HTTP cold fetch).
