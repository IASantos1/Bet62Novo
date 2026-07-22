---
name: Settlement worker startup
description: The main settlement worker must be explicitly started in api/index.ts — it is not auto-started anywhere else.
---

## Rule
`startSettlementWorker()` from `settlement.ts` must be called in `artifacts/api-server/src/api/index.ts` inside the `server.listen` callback.

**Why:** The function exists and is exported but was never imported/called in the app startup chain. The settlement loop (`autoSettlePendingBets`, live early settlement, expired bet void) never ran, so no bets were ever settled automatically.

## How to apply
Any time auto-settlement is broken or bets are stuck pending, first check that `startSettlementWorker()` is called in `api/index.ts`. This is the single entry point for all automatic settlement.

## In-play early settlement
The in-play logic lives in `liveDefinitiveOutcomeForSel` in `settlement.ts`. It already handles:
- BTTS (`bts-yes`/`bts-no`) — won when both score, pending otherwise
- Over/Under goals (`o25`, `u15`, etc.) — over won when threshold crossed; under lost when exceeded
- Tennis set winner (`set1-home`, `set1-away`, etc.) — won/lost when that set finishes
- HT markets, basketball quarters, hockey periods, baseball F5, etc.

## Normalization additions (added alongside the fix)
Two new normalizations added to `normalizeSettlementSelectionKey` in `settlement.ts`:
- `"over_2.5"` / `"under_1.5"` (verbose format) → `"o25"` / `"u15"` compact format
- `"home_set1"` / `"away_set2"` (rule-file format) → `"set1-home"` / `"set2-away"` (live key format)

## Rule file in-play support
Added in-play early settlement logic to:
- `rules/football/btts.ts` — settles won/lost immediately when both teams score during live play
- `rules/football/overUnder.ts` — settles over-won / under-lost immediately when threshold crossed live; accepts both "over_2.5" and "o25" formats
- `rules/tennis/index.ts` — `settleTennisSetWinner` and `settleCorrectSetScore` now settle as soon as a set has a conclusive result during live play; added `tennisSetIsComplete()` helper
