PulseScore REST client (`client.ts`) + confirmed response types
(`types.ts`) — real shapes captured 2026-09-10 from 5 live endpoints
(soccer/leagues, soccer/events list+detail, live-events list+detail).

Client only, nothing wired in yet: no route in `routes/matches.ts` calls
this, and it doesn't touch any odds a bettor sees. Still to come, in
order, once each step is explicitly requested:

1. A normalizer from PulseScore's already-canonical markets
   (canonicalMarket/canonicalOutcome) into BET62's own internal market
   shape.
2. The real cross-provider matching engine (see
   `artifacts/api-server/src/matching/README.md`) to pair a PulseScore
   `eventId` with a GOAL API fixture — team names/leagues won't match
   verbatim between the two providers, so this needs real examples from
   both sides before it can be built without guessing.
3. Only after both of those are verified: wiring PulseScore in as the
   real odds source, per the user's stated goal (GOAL API stays the
   match/event source of truth; PulseScore becomes the odds source).
