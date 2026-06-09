---
name: Live broadcast latency optimizations
description: Two-part fix for score update latency in broadcastLive/buildLivePayload
---

## The rule
`broadcastLive()` must use the `broadcastPending` flag (not a bare `return`)
so score patches that arrive mid-broadcast are queued and sent immediately after.
The upcoming matches section must use the 30s `_allUpcomingCache` so the hot path
only awaits in-memory WS caches (sub-ms).

**Why:** `buildLivePayload()` takes ~200ms because it awaits 5 upcoming builders
(network I/O). With the old `if (broadcastInProgress) return` guard, every WS
score patch that arrived during those 200ms was silently dropped.

**How to apply:**
- `broadcastPending` is set to `true` inside the `if (broadcastInProgress)` branch;
  the `finally` block in `broadcastLive()` calls `setImmediate(() => broadcastLive())`
  if pending.
- `rebuildUpcomingCache()` rebuilds `_allUpcomingCache` (first call: awaited;
  subsequent stale calls: background fire-and-forget using the stale list immediately).
- `getTennisOdds()` / `getMLBOdds()` are cache-warming calls whose return values
  were already discarded — moved to fire-and-forget to not block `Promise.all`.
