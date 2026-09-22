---
name: PropLine tennis metadata
description: Constraint on ranking and filtering tennis events from PropLine odds boards.
---

PropLine tennis odds events do not expose tournament, competition, league, ATP/WTA, Challenger, or ITF metadata. They contain players, event time, live state, bookmakers, and markets.

**Why:** Filtering by a generic sport title labels every event as “Tennis” and cannot distinguish major circuits from small competitions.

**How to apply:** For the live tennis board, rank events by valid open odds and market/bookmaker depth, then enforce a display cap. Do not claim exact ATP/WTA filtering unless another verified metadata source is added.