import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Persistent cross-session PulseScore match -> API-Football fixture mapping.
//
// Solves a real production gap: when findApiFootballFixture() matches a
// fixture via the "fuzzy name + league + kickoff time" path, we currently only
// remember that fixtureId inside an in-memory LiveMatchState field
// (_apiFootballFixtureId), which is lost on process restart (or even when the
// match leaves the REST list for a tick and comes back — the current tick-by-
// tick hold can't help there either). The next session/tick re-runs the fuzzy
// matching and can, in ambiguous cases, pick a different fixtureId — giving
// up entirely on the "ambiguity" branch or worse, attaching wrong-fixture
// goals/cards briefly until another tick re-resolves it.
//
// This table is a permanent "once decided correctly, remember forever" bridge,
// exactly mirroring the pattern apiFootballTeamMappings already uses for
// team-name -> team-id. Once a match is resolved AND passes the
// cross-validation checks (scores actually align between the two providers
// for 3+ consecutive ticks — see recordValidatedFixturePair below for the
// exact validation gate), it's upserted here. On every subsequent live tick
// of that pulsescoreMatchId, findApiFootballFixture is short-circuited and the
// remembered apiFootballFixtureId is used first, the fuzzy path only used as
// a fallback when the remembered fixture isn't even present in today's live
// batch (provider hiccup, fixture genuinely finished and re-listed later).
//
// Why separate from apiFootballTeamMappings (which exists): team-mappings are
// per-team, can be reused across weeks/months/years, and are strong signal
// only when BOTH sides are already known and together match exactly one
// fixture in the batch. A match-mapping is PER MATCH ID, covers a single
// fixture only, and works even on a brand-new fixture where one or both
// team names had never been seen before (e.g. reserve/cup fixtures, lower
// divisions). The two caches are complementary, not redundant.
export const apiFootballFixtureMappingsTable = pgTable(
  "api_football_fixture_mappings",
  {
    id: serial("id").primaryKey(),
    // pulsescore match id, EXACTLY the format buildFootballLiveFromPulseScore
    // uses: `pulsescore-football-${ev.eventId}`. Kept in full so this row is
    // look-up-able without format conversion.
    pulsescoreMatchId: text("pulsescore_match_id").notNull(),
    // Source PulseScore event id raw (ev.eventId). Redundant but useful for
    // direct queries against PulseScore's own raw ids in admin support panels.
    pulsescoreEventId: text("pulsescore_event_id").notNull(),
    apiFootballFixtureId: integer("api_football_fixture_id").notNull(),
    // Snapshot of team names used when the mapping was first confirmed.
    // Diagnostic aid only, never used as a lookup key.
    homeTeam: text("home_team"),
    awayTeam: text("away_team"),
    league: text("league"),
    // Kickoff used (ms epoch). Null if the PulseScore event didn't carry a
    // startTime (early live-samples that only had minute; today's flow does
    // include startTime but we keep it nullable for the same "tolerant"
    // reasoning used everywhere else in this integration).
    kickoffMs: integer("kickoff_ms"),
    // Count of times this pairing has been RE-validated (score alignment
    // check passed across different ticks or even different processes).
    // Confidence grows the more this pairing is confirmed, so admin can sort
    // by low-confirmationCount mappings to find ones the fuzzer almost got
    // right but might need manual review.
    confirmationCount: integer("confirmation_count").notNull().default(1),
    firstConfirmedAt: timestamp("first_confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table: any) => ({
    matchIdx: uniqueIndex("api_football_fixture_mappings_match_idx").on(
      table.pulsescoreMatchId,
    ),
  }),
);

export type ApiFootballFixtureMapping = typeof apiFootballFixtureMappingsTable.$inferSelect;
