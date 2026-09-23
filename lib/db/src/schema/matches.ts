import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// BET62 Fase 0 — canonical match entity, independent of any single
// provider's id. Mirrors
// the competitions/providerCompetitions pattern already established in
// this schema (competitions.ts + providerCompetitions.ts) — this is the
// same pattern, one level down, for individual matches instead of whole
// competitions. Every row starts as a canonical internal match record with
// confidence 100 when ingested from a single source. This table exists so
// the join point is ready whenever multiple providers need to be reconciled
// against the same match.
//
// competitionId is a plain nullable reference (no FK constraint) rather
// than a hard foreign key into competitions — the live competition catalog
// (lib/liveCompetitionCatalog.ts) syncs that table on its own schedule and
// this table's population must never fail an insert just because that
// sync hasn't caught up yet.
export const matchesTable = pgTable("canonical_matches", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull(),
  homeName: text("home_name").notNull(),
  awayName: text("away_name").notNull(),
  normalizedHomeName: text("normalized_home_name").notNull(),
  normalizedAwayName: text("normalized_away_name").notNull(),
  competitionId: integer("competition_id"),
  leagueName: text("league_name"),
  kickoffUtc: timestamp("kickoff_utc", { withTimezone: true }),
  status: text("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CanonicalMatch = typeof matchesTable.$inferSelect;
