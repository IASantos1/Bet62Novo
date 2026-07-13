---
name: Football live "too early" guard must use same-provider ground truth
description: Why cross-checking a live feed's self-reported kickoff time against a different data provider's schedule silently fails, and what actually works.
---

Bet62's football live list can show matches as "Ao Vivo" before their real
kickoff, because a live-data provider (Statpal) can self-report a fixture's
date/time as already-past in lockstep with a fake early "live" status — the
provider's own live feed is internally consistent but factually wrong. A
guard that only compares the live feed against itself can't catch this.

**Why a naive fix failed the first time:** the fix built a ground-truth
kickoff map from `getUpcomingEventsV2`/`getScheduleV2`, which always calls the
*SportsAPI Pro* domain — a completely different provider from Statpal, with
its own unrelated event-id numbering. Keying the ground-truth map by event id
from one provider and looking it up with ids from a different provider never
matches, so the "fix" was silently a no-op.

**How to apply:** any ground-truth/cross-check source must live in the *same
provider's* id space as the feed being checked. For Statpal-sourced football
live events (numeric ids = Statpal's `main_id`), the correct ground truth is
Statpal's own daily/schedule feed (`getDailyLeagues` → `fetchStatpalFootballDailyLeagues`,
converted via `statpalMatchToV2Event`), not a different provider's schedule
endpoint. Before wiring up any "trust source X over source Y" guard across
two data fetchers, confirm both actually share an id space — check which
provider each one hits, not just that both return a `SAPIV2Event`-shaped type.

Also: basketball/hockey/baseball live-builders in the same file had a weaker
version of this guard (no ground-truth fallback, no "block first appearance if
already old" gate, and an undefined `startTimestamp` silently bypassed the
early-kickoff check entirely). When fixing one sport's live-admission guard in
this codebase, check the other three — they're independent copies, not shared
code, and tend to drift.
