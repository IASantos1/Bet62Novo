import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const casinoGamesTable = pgTable("casino_games", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  gameUid: text("game_uid").notNull(),
  name: text("name").notNull(),
  vendorCode: integer("vendor_code"),
  category: text("category").notNull().default("slots"),
  img: text("img"),
  isActive: boolean("is_active").notNull().default(true),
  popularity: integer("popularity").notNull().default(0),
  // Which aggregator this row launches through - "silentapi" | "palace".
  // Both re-list the same underlying vendor game_codes, so this is needed
  // alongside (provider, gameUid) to keep rows unique once more than one
  // aggregator's catalog is seeded.
  source: text("source").notNull().default("silentapi"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerGameSourceIdx: uniqueIndex("casino_games_provider_game_source_idx").on(
    table.provider,
    table.gameUid,
    table.source,
  ),
  providerCategoryIdx: index("casino_games_provider_category_idx").on(
    table.provider,
    table.category,
  ),
}));

export type CasinoGameRow = typeof casinoGamesTable.$inferSelect;
