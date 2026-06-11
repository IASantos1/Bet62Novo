---
name: Tennis V1 stages parsing
description: V1 /live returns stages[] with per-set scores and game points; how to parse them
---

# V1 Tennis stages[] structure

Each live game from `/api/v1/tennis/live` includes a `stages` array:

```json
[
  {"id": 34, "name": "Game", "shortName": "Game", "homeCompetitorScore": 40, "awayCompetitorScore": 40, "isLive": true},
  {"id": 27, "name": "Set 1", "shortName": "S1", "homeCompetitorScore": 7, "awayCompetitorScore": 6, "isEnded": true},
  {"id": 28, "name": "Set 2", "shortName": "S2", "homeCompetitorScore": 4, "awayCompetitorScore": 4, "isLive": true},
  {"id": 35, "name": "Sets", "shortName": "Sets", "homeCompetitorScore": 1, "awayCompetitorScore": 0, "isLive": true}
]
```

- **"Game"**: current game points (0/15/30/40/50=AD)
- **"Set N"** (regex `/^set \d+$/i`): per-set game scores
- **"Sets"**: total sets won (same as `homeCompetitor.score`)

**Note:** `homeCompetitor.score` = sets won overall (already correct for `homeScore/awayScore`).
The `stages` field is NOT declared in `V1TennisGame` type — access via `(g as unknown as Record<string, unknown>)["stages"]`.

## Parsing in buildTennisLiveV1

```typescript
const stages = ((g as unknown as Record<string, unknown>)["stages"] as V1Stage[] | undefined) ?? [];
const setSets = stages.filter(s => /^set \d+$/i.test(s.name) && s.homeCompetitorScore >= 0).map(...);
const sets = setSets.length > 0 ? setSets : [[homeScore, awayScore]];
const gameStage = stages.find(s => s.name === "Game");
const hPt = gamePtLabel(gameStage?.homeCompetitorScore ?? 0); // 40 → "40", 50 → "AD"
```

**Why:** V1 API doesn't include `stages` in its documented schema but includes it in the response. The type cast to `unknown` first is required by TypeScript strict mode.
