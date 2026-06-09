import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { competitionsTable } from "./competitions";

export const providerCompetitionsTable = pgTable("provider_competitions", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  providerSport: text("provider_sport").notNull(),
  providerCompetitionKey: text("provider_competition_key").notNull(),
  providerCompetitionId: text("provider_competition_id"),
  providerName: text("provider_name").notNull(),
  providerCountry: text("provider_country").notNull().default("unknown"),
  competitionId: integer("competition_id").notNull().references(() => competitionsTable.id, { onDelete: "cascade" }),
  mappingConfidence: text("mapping_confidence").notNull().default("high"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerKeyIdx: uniqueIndex("provider_competitions_provider_key_idx").on(
    table.provider,
    table.providerSport,
    table.providerCompetitionKey,
  ),
}));

export type ProviderCompetition = typeof providerCompetitionsTable.$inferSelect;
