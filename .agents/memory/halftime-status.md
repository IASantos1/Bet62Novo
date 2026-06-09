---
name: Halftime status string variant
description: Some V2 events use "Halftime" (no space) which wasn't recognized as live
---

## Rule
`isFootballV2LiveStatus` must include `s.includes("halftime")` before other checks.

**Why:** Some leagues (e.g. LigaPro Primera B from Ecuador) report halftime as "Halftime" (single word, no space) rather than "HT" or "half time". Without this check the match was incorrectly treated as not-live and filtered out.

**How to apply:** If adding new status strings, always check for both spaced and unspaced variants.
