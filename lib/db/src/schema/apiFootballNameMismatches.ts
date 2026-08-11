import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Persists the "[DIAG apifootball-miss]" signal (routes/matches.ts,
// buildFootballLiveFromPulseScore) — a PulseScore/bwin live football match
// with real priced odds that no API-Football fixture matched by team name.
// Was pino-log-only (2026-08-09) until the Pré-Jogo Agent
// (lib/aiAgents/roles/preMatch.ts) needed something queryable to tell a
// one-off miss (API-Football just doesn't cover that league live) apart
// from a persistently-failing name pair worth fixing in team-name
// matching. One row per PulseScore match id, upserted on every fresh
// occurrence (occurrenceCount/lastSeenAt) rather than growing unbounded.
export const apiFootballNameMismatchesTable = pgTable("api_football_name_mismatches", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  league: text("league"),
  apiFootballCandidateNames: jsonb("api_football_candidate_names"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table: any) => ({
  matchIdx: uniqueIndex("api_football_name_mismatches_match_idx").on(table.matchId),
}));

export type ApiFootballNameMismatch = typeof apiFootballNameMismatchesTable.$inferSelect;
