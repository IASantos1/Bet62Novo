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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerGameIdx: uniqueIndex("casino_games_provider_game_idx").on(
    table.provider,
    table.gameUid,
  ),
  providerCategoryIdx: index("casino_games_provider_category_idx").on(
    table.provider,
    table.category,
  ),
}));

export type CasinoGameRow = typeof casinoGamesTable.$inferSelect;
