---
name: Football live gate threshold
description: The 5-min new-event gate in buildFootballLiveV2 filtered out all fallback leagues; fixed to 120 min
---

## Rule
Line with `!liveMatchState.has('football-v2-${ev.id}') && evAgeSeconds > N * 60 && !isPriorityLeague && !fromUpcoming` must use N=120 (not N=5).

**Why:** The 5-minute threshold blocked all live events from non-priority leagues (Copa Paraguay, Botola Pro, LigaPro, Iceland) because the server hadn't seen them before (not in liveMatchState) and they started more than 5 minutes before the server first polled them. The separate 2.5-hour gate at line ~7286 is the real zombie filter.

**How to apply:** If the gate is ever changed back or a new gate is introduced, use 120 minutes minimum for fallback/unknown leagues. Priority leagues bypass this gate anyway.
