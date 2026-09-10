Reserved for the PulseScore REST/WebSocket client, odds/market/bookmaker
normalizer, and provider health feed — intentionally empty until the user
sends real PulseScore API docs/credentials. Do not guess field shapes ahead
of that; see `lib/db/src/schema/matchProviderMapping.ts` and
`artifacts/api-server/src/health/providerHealth.ts`, both already shaped to
accept a second provider without changes.
