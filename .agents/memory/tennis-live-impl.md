---
name: Tennis live odds + game score
description: How real game score and live bookmaker odds are fetched for V2 tennis live matches
---

## Game score (real)
`SAPIV2ScoreObj.point?: string` — values: "0" | "15" | "30" | "40" | "A" (advantage) | "D" (deuce)
Used in `buildTennisLiveV2` via `hS?.point` / `aS?.point`. Falls back to `advanceTennisGamePts` simulation when field missing (some ITF matches).

## Live odds (real)
Endpoint: `GET {SAPI_V2_TENNIS}/match/:id/odds`  
Auth: `x-api-key` header (SPORTSAPI_KEY)  
Response path: `data.markets[]` → find `{ marketName: "Full time", marketId: 1, isLive: true }`  
Choices: `name: "1"` = home, `name: "2"` = away  
Format: `fractionalValue: "7/2"` → decimal = `1 + 7/2 = 4.50`  
Parse: `parseFractionalOdd(frac: string): number`

## Cache
`_tennisLiveOddsCache: Map<number, { home, away, at }>` — keyed by V2 match ID (number), TTL 45s  
Refresh: `refreshTennisLiveOdds(ids: number[])` — fire-and-forget, called at start of `buildTennisLiveV2`  
Priority in buildTennisLiveV2: real live cache → pre-match cache + drift → seeded estimate + drift

**Why:** First request uses fallback (cache cold). After ~10s the background refresh populates real odds. Subsequent requests within 45s use cached real odds.
