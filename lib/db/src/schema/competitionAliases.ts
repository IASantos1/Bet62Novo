import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { competitionsTable } from "./competitions";

export const competitionAliasesTable = pgTable("competition_aliases", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").notNull().references(() => competitionsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("internal"),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  aliasProviderIdx: uniqueIndex("competition_aliases_provider_alias_idx").on(
    table.provider,
    table.normalizedAlias,
  ),
}));

export type CompetitionAlias = typeof competitionAliasesTable.$inferSelect;
