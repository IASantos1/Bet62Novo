---
name: V2 degradation V1-first pattern
description: When SportsAPI Pro V2 is degraded, upcoming builders that call getUpcomingEventsV2 first silently waste 54+ seconds on timeouts before falling back to V1.
---

## Rule
For sports where V1 is always available (basketball, football), call the V1 builder FIRST in the upcoming builder. Only fall back to V2 if V1 returns nothing.

```typescript
async function buildBasketballUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const v1Games = await buildBasketballUpcomingV1().catch(() => [] as UpcomingMatch[]);
    if (v1Games.length > 0) return v1Games; // fast path
    const events = await getUpcomingEventsV2("basketball", 3); // slow fallback
    ...
  }
}
```

**Why:** `getUpcomingEventsV2` for basketball calls 3 days × 2 endpoints (schedule + today) = 6 requests, each with a 9-second AbortSignal timeout. When V2 is degraded (503/timeout), this takes 54+ seconds. The `refreshUpcomingTop` Promise.all race returns before basketball finishes, so basketball gets cached as empty. Putting V1 first cuts this to ~1-2 seconds.

**How to apply:** Any time you add a `buildXUpcoming()` that has a V1 alternative, put V1 first. Football already uses `buildFootballUpcomingV1()` as fallback from `buildUpcomingMatches()` (inside the function, not at the top level) — that's fine because football V2 usually works. Basketball is the critical case since it has no native V2 schedule endpoint.
