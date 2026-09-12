import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches.js";

// BET62 Fase 0 — maps one provider's native match id to the canonical
// match it represents. Same shape as providerCompetitions.ts, one level
// down. GOAL API is the only provider writing rows here today (confidence
// "single_source" — there is nothing to disambiguate against yet); once a
// second provider (PulseScore) needs to be joined to the same match, its
// rows land here too and the matching engine (not yet built — see the
// Fase 0 plan) decides the confidence level instead of assuming 100%.
export const matchProviderMappingTable = pgTable("match_provider_mapping", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  providerSport: text("provider_sport").notNull(),
  providerMatchId: text("provider_match_id").notNull(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  homeNameRaw: text("home_name_raw").notNull(),
  awayNameRaw: text("away_name_raw").notNull(),
  confidence: integer("confidence").notNull().default(100),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table: any) => ({
  providerKeyIdx: uniqueIndex("match_provider_mapping_provider_key_idx").on(
    table.provider,
    table.providerSport,
    table.providerMatchId,
  ),
}));

export type MatchProviderMapping = typeof matchProviderMappingTable.$inferSelect;
