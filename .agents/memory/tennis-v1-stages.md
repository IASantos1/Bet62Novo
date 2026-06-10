---
name: Tennis V1 stages field
description: V1 /live game object has a `stages` array with per-set scores, live game points, and serving info
---

## The stages array

Each live V1 tennis game (`statusGroup===3`) contains a `stages` array:

```json
[
  { "name": "Game",  "homeCompetitorScore": 15, "awayCompetitorScore": 30, "isLive": true },
  { "name": "Set 1", "homeCompetitorScore": 6,  "awayCompetitorScore": 7,  "isEnded": true, "homeCompetitorExtraScore": 5, "awayCompetitorExtraScore": 7 },
  { "name": "Set 2", "homeCompetitorScore": 6,  "awayCompetitorScore": 4,  "isEnded": true },
  { "name": "Set 3", "homeCompetitorScore": 4,  "awayCompetitorScore": 4,  "isLive": true },
  { "name": "Sets",  "homeCompetitorScore": 1,  "awayCompetitorScore": 1,  "isCurrent": true }
]
```

- **"Set N"** entries (filter: `/^set\s*\d+$/i`): per-set game score; sort by set number to build `sets[]` array
- **"Game"** entry (`isLive: true`): current game points — values 0/15/30/40/50(=Advantage)
- **"Sets"** entry: same as homeCompetitor.score / awayCompetitor.score (sets won total)
- **homeCompetitorExtraScore** / **awayCompetitorExtraScore**: tiebreak point scores when present

## Serving

`homeCompetitor.inPossession === true` or `awayCompetitor.inPossession === true` → who is currently serving.
Map to `_liveExtra.serving: [boolean, boolean]`.

## How buildTennisLiveV1 uses this

1. Filter stages by `/^set\s*\d+$/i` → sort by number → build `sets: Array<[number,number]>`
2. Find stage with `name === "Game" && isLive` → convert scores (50→"A") → `currentPoints: [string, string]`
3. Check `inPossession` on competitors → `serving: [boolean, boolean]`
4. Fallback if no Set stages: `[[homeScore, awayScore]]` (just sets-won count)

**Why:** The raw `homeCompetitor.score` only returns sets won (e.g. 1), not individual game scores per set. The `stages` field is the only source for detailed set scores.
