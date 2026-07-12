---
name: Statpal tennis decimal set scores
description: Statpal's tennis livescores API can return set-game counts as decimals (e.g. "6.4", "7.7") instead of plain integers.
---

Statpal's `/v1/tennis/livescores` `s1`..`s5` player fields are usually plain
integer game counts ("6", "4"), but for some matches (observed on finished
and in-progress matches alike) they come back as decimals like "6.4" or
"7.7" — the fractional part appears to be tiebreak-related encoding, not
documented anywhere in Statpal's API docs.

**Why:** Feeding a raw fractional/out-of-range game count into tennis
odds/exact-score math (which recurses game-by-game toward a valid finished
set score) can recurse forever and crash the process with a stack overflow,
since a fractional or >7 value never satisfies the "set finished" base case.

**How to apply:** Always `Math.trunc()` (and clamp to a sane max like 7)
any statpal set-score field before using it in scoring/odds logic. As a
second line of defense, any recursive set-score algorithm should have a
hard bound (e.g. bail out if games > 7) so malformed input from *any*
provider can never cause unbounded recursion.
