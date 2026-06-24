---
name: Premature settlement via live state garbage collector
description: buildBaseballLiveV2/HockeyLiveV2/BasketballLiveV2 called finalizeStaleLiveMatch immediately when a game dropped from the V2 live feed, writing in-progress scores to finishedMatchResults and causing bets to settle prematurely.
---

## The rule
`buildBaseballLiveV2`, `buildHockeyLiveV2`, and `buildBasketballLiveV2` must NOT call `finalizeStaleLiveMatch` just because `!currentIds.has(id)`. They must only auto-finalize on `tooOld` (4-hour timeout), AND only when the partial score looks complete:
- Baseball: innings.length >= 9
- Hockey: periods.length >= 3
- Basketball: quarters.length >= 4

When a game drops from the feed without `tooOld`, simply delete from `liveMatchState` — `scanV2AllSportsForFinished` will detect the real "Finished" status from the today endpoint.

**Why:** KBO/MLB/NHL/NBA games temporarily disappear from the V2 live feed due to API latency or pagination gaps. The old code immediately called `finalizeStaleLiveMatch` on any feed-drop, writing the mid-game score (e.g. 2-2 after 2 innings) to `finishedMatchResults`. The settlement worker then resolved the bet (e.g. Over 9.5 runs) using that premature score → wrong LOST result.

**How to apply:** In the GC loop at the bottom of each `build*LiveV2` function, split `!currentIds.has(id) || tooOld` into two branches. The `!currentIds` branch just does `liveMatchState.delete(id)`. The `tooOld` branch calls `finalizeStaleLiveMatch` only after checking the partial-score completeness guard.

## Tennis caveat
`rememberFinishedTennisState` after the 45-second grace period is guarded by `tennisScoreLooksFinished` (`cached.homeScore >= 2 || cached.awayScore >= 2`). Immediate finalisation when `isTennisFinishedStatusText` returns true still bypasses the guard (status-text is authoritative).
