import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Persistent, cross-session team-identity cache between PulseScore/bwin's
// team names and API-Football's team ids — user-requested (2026-08-12)
// architecture hardening. findApiFootballFixture's fuzzy name+league+
// kickoff-time matching (apiFootball.ts) is trustworthy but gets re-derived
// from scratch on the first live tick of every match involving a given
// team, even for a team already confirmed correctly in an earlier match —
// this table is what lets that confirmation carry over. Once a match
// resolves via the fuzzy path, both teams' pulsescoreTeamName ->
// apiFootballTeamId pairing is upserted here, so the next time either team
// appears in a live match (this session or after a restart), the lookup
// is an exact id match instead of another fuzzy string comparison — grown
// organically from confirmed real matches rather than a bulk offline sync
// job covering every league up front. One row per PulseScore team name (a
// given bwin display name maps to exactly one real team), upserted (not
// duplicated) on every re-confirmation.
export const apiFootballTeamMappingsTable = pgTable(
  "api_football_team_mappings",
  {
    id: serial("id").primaryKey(),
    pulsescoreTeamName: text("pulsescore_team_name").notNull(),
    apiFootballTeamId: integer("api_football_team_id").notNull(),
    apiFootballTeamName: text("api_football_team_name").notNull(),
    confirmedCount: integer("confirmed_count").notNull().default(1),
    firstConfirmedAt: timestamp("first_confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table: any) => ({
    nameIdx: uniqueIndex("api_football_team_mappings_name_idx").on(
      table.pulsescoreTeamName,
    ),
  }),
);

export type ApiFootballTeamMapping = typeof apiFootballTeamMappingsTable.$inferSelect;
