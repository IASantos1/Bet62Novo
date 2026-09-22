# BET62 Technical Plan

## Scope

This document defines the target sportsbook data architecture for `BET62`, replacing the current single-provider odds flow with:

- `PulseScore` as the primary source of odds and bookmaker market feeds
- `Goal API` as the primary source of football match data, events, and statistics

This plan is designed to fit the current backend structure in `artifacts/api-server`.

## Source Validation

### PulseScore

Validated from the public documentation:

- Public docs: `https://pulsescore.net/docs`
- Authentication header: `X-Secret`
- Normalized bookmaker schema across REST responses
- Public bookmaker-specific REST prefixes, e.g.:
  - `https://api.pulsescore.net/api/onexbet`
  - `https://api.pulsescore.net/api/v3/bet365`
  - `https://api.pulsescore.net/api/betano-de`
- Public live WebSocket endpoints documented per bookmaker, e.g.:
  - `wss://api.pulsescore.net/api/onexbet/ws/live`
  - `wss://api.pulsescore.net/api/v3/bet365/ws/live`
  - `wss://api.pulsescore.net/api/betano-de/ws/live`

Important validated assumptions:

- PulseScore provides both `REST snapshots` and `live WebSocket feeds`
- The schema is normalized across bookmakers
- Sport coverage and market depth vary by bookmaker
- WebSocket concurrency and plan limits must be revalidated against the active paid plan before production rollout

### Goal API

Validated from the public documentation:

- Public docs: `https://goal-api.com/documentation`
- Base URL: `https://api.goal-api.com/v1`
- Authentication: `Authorization: Bearer <API_KEY>`
- Football resources documented for:
  - countries
  - leagues
  - teams
  - fixtures
  - standings
  - players
  - coaches
  - h2h
  - statistics-related resources
  - webhooks

Important validated assumptions:

- Goal API clearly documents `REST + webhooks`
- This plan does **not** assume Goal API WebSocket support unless the paid contract confirms it later
- For live football match state, the first implementation should use:
  - `Goal API REST`
  - `Goal API webhooks`
  - backend reconciliation jobs

## Architecture Decision

### Final Responsibility Split

#### PulseScore

Primary source for:

- prematch odds
- live odds
- market catalogs
- bookmaker-specific coverage
- normalized bookmaker event feeds

#### Goal API

Primary source for football-only:

- fixtures
- live match state
- score
- events
- cards
- corners
- substitutions
- lineups
- standings
- statistics
- xG and advanced football metadata where available

### Design Principle

The system must separate:

- `match state truth`
- `odds truth`

That means:

- football score/status/events come from `Goal API`
- football odds/markets come from `PulseScore`
- non-football score/odds can remain fully driven by `PulseScore` if no better match-state source exists

This separation reduces:

- disappearing events due to odds instability
- false live/upcoming transitions
- provider coupling inside route handlers

## Sport Mapping

## Primary Mapping

| Sport | Primary Bookmaker | Transport | Match Data Source | Odds Source |
| --- | --- | --- | --- | --- |
| Football | `1xBet` | `PulseScore WebSocket + REST` | `Goal API` | `PulseScore` |
| Tennis | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Basketball | `Bet365` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Ice Hockey | `Bet365` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Volleyball | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Handball | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Table Tennis | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Baseball | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| American Football / NFL | `Bet365` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Cricket | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Rugby Union | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Rugby League | `Bet365` | `PulseScore WebSocket or REST` | `PulseScore` | `PulseScore` |
| Esports | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Boxing | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| MMA | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Golf | `1xBet` | `PulseScore WebSocket or REST` | `PulseScore` | `PulseScore` |
| Motorsport | `1xBet` | `PulseScore WebSocket or REST` | `PulseScore` | `PulseScore` |
| Formula 1 | `Betano DE / 1xBet` | `PulseScore WebSocket or REST` | `PulseScore` | `PulseScore` |
| Snooker | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Darts | `Betano BR` | `PulseScore WebSocket or REST` | `PulseScore` | `PulseScore` |
| Field Hockey | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Futsal | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Padel | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Pickleball | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Water Polo | `1xBet` | `PulseScore WebSocket` | `PulseScore` | `PulseScore` |
| Horse Racing | `Bet365` | `PulseScore REST` | `PulseScore` | `PulseScore` |
| Greyhounds | `PulseScore / available bookmaker` | `PulseScore REST` | `PulseScore` | `PulseScore` |

## Fallback Rules

- If the primary bookmaker has incomplete coverage for a sport or competition, fall back to a secondary bookmaker
- Fallback selection must be controlled by backend config, not hardcoded inside route logic
- Fallback is allowed separately for:
  - event coverage
  - market depth
  - live transport

## Recommended Backend Shape

The current backend is centered around `src/routes/matches.ts`. The target architecture should move provider-specific logic out of route files and into dedicated service layers.

## Proposed Folder Structure

```text
artifacts/api-server/src/
  providers/
    pulsescore/
      client.ts
      auth.ts
      schema.ts
      rest/
        events.ts
        liveEvents.ts
        leagues.ts
        eventById.ts
      ws/
        connectionManager.ts
        sportsbookStream.ts
        bookmakerStreams/
          football1xbet.ts
          tennis1xbet.ts
          basketballBet365.ts
          hockeyBet365.ts
      normalizers/
        eventNormalizer.ts
        oddsNormalizer.ts
        marketNormalizer.ts
        statisticsNormalizer.ts
    goalApi/
      client.ts
      auth.ts
      schema.ts
      rest/
        fixtures.ts
        fixtureById.ts
        leagues.ts
        standings.ts
        lineups.ts
        statistics.ts
        h2h.ts
      webhooks/
        verify.ts
        ingest.ts
      normalizers/
        fixtureNormalizer.ts
        liveStateNormalizer.ts
        eventNormalizer.ts
        statsNormalizer.ts
  sportsbook/
    config/
      providerMatrix.ts
      bookmakerPriority.ts
      sportCapabilities.ts
    merge/
      mergeFootballStateWithOdds.ts
      mergePrematchCatalog.ts
    live/
      liveStateStore.ts
      liveOddsStore.ts
      subscriptionPlanner.ts
      visibilityRules.ts
    prematch/
      prematchCache.ts
      prematchRefresh.ts
      competitionFilters.ts
    markets/
      canonicalMarkets.ts
      marketMapper.ts
      selectionKeyBuilder.ts
    settlement/
      providerResultMapper.ts
  routes/
    matches.ts
    providerWebhooks.ts
```

## Core Runtime Flows

## 1. Football Live Flow

### Match State

- Goal API provides football live truth
- Incoming updates come from:
  - webhook ingestion
  - REST polling fallback
- The backend writes football runtime state into an in-memory store plus persistent cache for recovery

### Odds

- PulseScore `1xBet` WebSocket provides football odds and market updates
- REST snapshot is used for:
  - initial hydration
  - reconnect recovery
  - on-demand full event refresh

### Merge

- Merge key priority:
  - provider mapping table
  - canonical external event id
  - fallback identity matching by sport, home, away, start time, competition
- Final football event payload sent to frontend must contain:
  - Goal API score/status/events/statistics
  - PulseScore odds/markets/bookmaker metadata

## 2. Football Prematch Flow

- Goal API provides fixture catalog, league data, teams, standings, and metadata
- PulseScore REST provides prematch event odds and market snapshots
- Backend joins both sources into a canonical prematch match model
- If PulseScore odds temporarily disappear, the prematch fixture should remain visible with market state set to unavailable instead of removing the match

This is a key product rule to avoid the current instability where prematch events appear and disappear.

## 3. Other Sports Live Flow

- PulseScore remains the single source for event state and odds
- WebSocket should be preferred wherever supported
- REST should be used for:
  - bootstrapping
  - refresh after reconnect
  - fallback when websocket is unavailable

## 4. Other Sports Prematch Flow

- PulseScore REST should build the prematch catalog
- WebSocket can enrich live transitions where supported
- Provider/bookmaker selection must follow the sport matrix in config

## Canonical Models

The backend should use canonical internal models independent of provider payloads.

## Canonical Event

```ts
type CanonicalEvent = {
  id: string;
  sport: string;
  league: string;
  leagueId?: string;
  country?: string;
  regionId?: string;
  home: string;
  away: string;
  startTime: string;
  live: boolean;
  status?: string;
  score?: {
    home: number;
    away: number;
  };
  statistics?: Record<string, unknown>;
  incidents?: CanonicalIncident[];
  providers: {
    matchState?: ExternalProviderRef;
    odds?: ExternalProviderRef;
  };
};
```

## Canonical Market

```ts
type CanonicalMarket = {
  marketId: string;
  canonicalMarket: string;
  rawName: string;
  period: string;
  isActive: boolean;
  line?: number | string | null;
  selections: CanonicalSelection[];
  bookmaker: string;
};
```

## Canonical Incident

```ts
type CanonicalIncident = {
  type:
    | "goal"
    | "var"
    | "yellow_card"
    | "red_card"
    | "corner"
    | "penalty"
    | "substitution"
    | "period_start"
    | "period_end"
    | "other";
  team?: "home" | "away";
  player?: string;
  minute?: number;
  extra?: Record<string, unknown>;
};
```

## Storage and Mapping

The project already has a good base for provider mapping in the shared DB schema.

## Reuse Existing Schema

- `providerCompetitions`
- `matchProviderMapping`
- `matches`
- `eventRuntimeStates`
- `eventAdminOverrides`

## Add New Mapping Fields

Recommended new fields or related tables:

- `match_state_provider`
- `match_state_external_id`
- `odds_provider`
- `odds_external_id`
- `bookmaker`
- `provider_confidence`
- `last_match_state_sync_at`
- `last_odds_sync_at`

Recommended because football will now use two different providers for the same event.

## Cache Strategy

## Live

- `liveStateStore`: current event state by canonical event id
- `liveOddsStore`: latest normalized odds by canonical event id
- `subscriptionPlanner`: decides which sports and bookmakers are actively subscribed
- `reconnectSnapshotCache`: stores last REST snapshot per sport/bookmaker to recover after disconnect

## Prematch

- `prematchCatalogCache`: visible fixtures by sport
- `prematchOddsCache`: latest prematch market snapshot per event
- `competitionVisibilityCache`: precomputed allow/block decision per league

## Important Product Rule

Prematch visibility must not depend solely on the presence of live odds.

That means:

- hide only if the event itself becomes invalid, finished, duplicated, or outside visibility window
- do not hide a prematch event merely because a temporary odds refresh returned empty

Instead:

- keep the event visible
- mark markets unavailable
- schedule a background rehydrate

## Rate Limit and Concurrency Policy

## PulseScore

- REST calls must be routed through per-bookmaker rate limiters
- WebSocket connections must be centrally managed
- A sport-bookmaker stream registry should prevent duplicate concurrent streams

Recommended internal policy:

- one central `ConnectionManager`
- one stream per `sport + bookmaker + live/prematch mode`
- per-bookmaker REST queues
- gzip enabled on all REST calls

## Goal API

- webhook-first for football live event changes
- REST polling fallback for:
  - missed webhook recovery
  - periodic consistency checks
  - cold-start hydration

## API Surface to Frontend

The frontend should not become provider-aware.

Current endpoints can remain, but their internals should change:

- `/api/matches/live`
- `/api/matches/live-match/:id`
- `/api/matches/upcoming`
- `/api/matches/upcoming-match/:id`
- `/api/matches/all-odds/:id`
- `/api/matches/catalog`
- `/api/matches/stats`
- `/api/matches/live-stream`

Recommended additions:

- `/api/provider-webhooks/goal`
- `/api/admin/providers/status`
- `/api/admin/providers/replay/:provider/:eventId`
- `/api/admin/providers/mapping/:eventId`

## Migration Plan

## Phase 0

- Keep current routes stable
- Introduce new provider modules without changing frontend contracts
- Add feature flags:
  - `USE_PULSESCORE`
  - `USE_GOAL_API`
  - `FOOTBALL_MATCH_STATE_PROVIDER=goal`
  - `FOOTBALL_ODDS_PROVIDER=pulsescore`

## Phase 1

- Implement PulseScore client, auth, REST wrappers, and normalized parsers
- Implement Goal API client, auth, REST wrappers, and webhook ingestion
- Create canonical merge layer for football

## Phase 2

- Switch football prematch from current provider to:
  - Goal API fixtures
  - PulseScore prematch odds
- Keep current response shapes for frontend compatibility

## Phase 3

- Switch football live from current provider to:
  - Goal API live state
  - PulseScore live odds WebSocket
- Introduce reconnect and replay tooling

## Phase 4

- Migrate non-football sports to PulseScore by bookmaker matrix
- Enable sport-specific websocket managers

## Phase 5

- Remove the legacy sports data provider once:
  - mapping coverage is stable
  - settlement keys are validated
  - live and prematch regression checks pass

## Risks

## Provider Identity Matching

The main integration risk is matching the same football event across:

- Goal API
- PulseScore

This must be solved with durable mapping storage and reconciliation jobs.

## Market Canonicalization

PulseScore normalizes markets, but `BET62` still needs its own canonical settlement keys and UI grouping rules.

This requires:

- market alias mapping
- selection key generation
- bookmaker-specific edge-case handling

## Plan Limits

PulseScore WebSocket concurrency and bookmaker access must be validated against the active paid plan before launch.

## Goal API Delivery Model

If Goal API live delivery is webhook-only rather than websocket, the backend must tolerate:

- webhook delivery latency
- retry/replay handling
- periodic polling reconciliation

## First Implementation Priorities

The recommended first delivery order is:

1. PulseScore client and schema normalization
2. Goal API client and webhook ingestion
3. football merge layer
4. football live endpoint migration
5. football prematch endpoint migration
6. tennis and basketball websocket rollout
7. remaining sport migration by bookmaker matrix

## Immediate Backlog

- Create `PulseScore` provider module
- Create `Goal API` provider module
- Add provider feature flags to backend config
- Add provider webhook route for Goal API
- Add canonical event merge layer for football
- Add bookmaker matrix config by sport
- Add per-bookmaker REST rate limiter
- Add websocket connection manager
- Refactor current `matches.ts` to consume canonical services instead of provider-specific code
- Add admin debug endpoints for mapping and provider health
- Add regression fixtures for:
  - football live transitions
  - prematch persistence without temporary odds
  - corners/cards/statistics propagation
  - bookmaker fallback behavior

## Conclusion

The target architecture for `BET62` should be:

- `Goal API` for football match truth
- `PulseScore` for odds and markets across all supported sports
- bookmaker-specific selection per sport driven by config
- canonical internal models exposed to the frontend through stable BET62 routes

This is the most scalable path for:

- live football quality
- broader market depth
- better prematch stability
- future multi-bookmaker expansion
