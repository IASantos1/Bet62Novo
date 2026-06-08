import { boolean, pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const competitionsTable = pgTable("competitions", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull(),
  name: text("name").notNull(),
  country: text("country").notNull().default("unknown"),
  normalizedName: text("normalized_name").notNull(),
  normalizedCountry: text("normalized_country").notNull().default("unknown"),
  tier: text("tier").notNull().default("standard"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  canonicalIdx: uniqueIndex("competitions_canonical_idx").on(
    table.sport,
    table.normalizedCountry,
    table.normalizedName,
  ),
}));

export type Competition = typeof competitionsTable.$inferSelect;
