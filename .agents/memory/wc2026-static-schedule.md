---
name: WC2026 static schedule
description: V1 football competition/5930/games only returns near-term fixtures. A static 72-match group stage schedule (Jun 11–Jun 28) supplements _rebuildWC2026().
---

## Rule
The WC 2026 group stage (72 matches, June 11–28) is hardcoded as `WC2026_STATIC` in matches.ts, right before `_rebuildWC2026()`. When `_rebuildWC2026()` runs, it:
1. Fetches API results (V1 primary, V2 fallback) — usually only near-term 1-2 games
2. Builds `apiMatchups` set of `home|away` strings (lowercase) from API results
3. Iterates `WC2026_STATIC`, skipping past games and any already in apiMatchups
4. Appends remaining static games as `wc26-{home}-{away}-md{n}` IDs
5. Sorts all results chronologically

**Why:** V1 `/competition/5930/games` returns only 1-2 near-term fixtures. No V1 upcoming-schedule endpoint exists for WC. The WC schedule is fixed (FIFA announced dates), so hardcoding is safe and reliable.

**How to apply:** If game dates/times in the static schedule need updating, edit `WC2026_STATIC` in matches.ts. If the API starts returning more fixtures, the dedup logic automatically prevents doubles. When real odds become available for a WC game (API returns it), the API result overrides the static one.

**Note:** Times in `WC2026_STATIC` are UTC. The builder converts to Europe/Lisbon using `toLocaleDateString`/`toLocaleTimeString`.
