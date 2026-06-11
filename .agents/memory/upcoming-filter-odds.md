---
name: Upcoming filter must check odds not hasRealOdds
description: The /upcoming route filter used !!m.hasRealOdds for non-football/tennis sports, which silently filtered out all V1-built games (which have hasRealOdds=false).
---

## Rule
The `/upcoming` route filter must use `m.odds?.home > 0 && m.odds?.away > 0` for all sports, not `!!m.hasRealOdds`.

```typescript
// WRONG — silently drops V1-built basketball/hockey/etc. games:
return !!m.hasRealOdds;

// CORRECT — shows any game with valid odds regardless of source:
const filtered = matches.filter(m => m.odds?.home > 0 && m.odds?.away > 0);
```

**Why:** V1 builders (football, basketball, tennis) all set `hasRealOdds: false` since odds are simulated. The old filter correctly passed football/tennis via explicit checks (`m.odds?.home > 0 && m.odds?.away > 0`) but fell through to `!!m.hasRealOdds` for basketball, hockey, volleyball, baseball — making those sports return 0 even when V1 data was available.

**How to apply:** When adding new sport upcoming builders (V1 or simulated), always verify the `/upcoming` filter allows them through. The current filter at the `/upcoming` route handler checks `m.odds?.home > 0 && m.odds?.away > 0` for all sports.
