---
name: Live dedup key must omit league
description: liveMatchIdentityKey must use only sport+home+away, never include league — V1 and V2 return different league names for the same match.
---

# Live Dedup Key Must Omit League

## The rule
`liveMatchIdentityKey(match)` must be keyed on `sport | normalised_home | normalised_away` only.

**Why:** V1 and V2 APIs return different strings for the same league. Example: V1 says "SERIE C", V2 says "BRASILEIRÃO SÉRIE C" for the exact same Confiança vs Guarani match. If `league` is part of the key, the two entries get different keys → deduplication fails → same match appears twice.

**How to apply:** If you ever need to add a field to the dedup key, do NOT use `league`. Use only fields that are stable across providers (sport, home team name, away team name — after normalisation).
