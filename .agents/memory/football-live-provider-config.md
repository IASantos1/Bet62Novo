---
name: Football live provider config defaults
description: Why Statpal was silently skipped for live football on Railway despite the key being set
---

## The rule

`artifacts/api-server/src/lib/config.ts` FOOTBALL_LIVE_PROVIDER, FOOTBALL_DAILY_PROVIDER, and
FOOTBALL_REFERENCE_PROVIDER must all default to `"auto"` — NOT `"sportsapipro"`.

**Why:** When defaulting to `"sportsapipro"`, `canUseStatpal` in `getFootballLiveV2` evaluates to:
```
!!STATPAL_API_KEY && (... || (liveProvider === "sportsapipro" && sportsApiMissing))
```
If SPORTSAPI_KEY is also set on Railway, `sportsApiMissing = false` → `canUseStatpal = false` →
Statpal is **never called** even though STATPAL_API_KEY is present.

**How to apply:** If you ever see no live football on Railway but tennis/other sports work (they use
Statpal directly without a provider guard), check these three defaults first before debugging
the parsing logic.

## Secondary rule — 0-event fallback

`getFootballLiveV2` must only cache and return Statpal results when `events.length > 0`.
If Statpal returns 0 events (parse failure, empty feed), it must fall through to SportsAPI Pro.
Previously it cached `[]` immediately and returned, silently dropping the fallback path.

## Secondary rule — odds/live 20-min gate bypass

`oddsLiveKnownIds` (module-level Set) stores IDs confirmed live via `/v2/soccer/odds/live`.
`buildFootballLiveV2` checks `oddsLiveKnownIds.has(ev.id)` as an additional bypass for the
"never-seen + >20 min old" gate. Without this, every Railway cold start (after the 5-min grace)
blocks all mid-game matches because `liveMatchState` is empty.
