import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const casinoBannersTable = pgTable("casino_banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  ctaText: text("cta_text"),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"),
  // "top" | "middle" — where on the casino page this banner renders.
  position: text("position").notNull(),
  // casino_games.id values this banner promotes — a banner is only ever
  // shown once at least one of these games is active, and clicking it
  // (absent a linkUrl override) launches the first one.
  gameIds: jsonb("game_ids").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CasinoBannerRow = typeof casinoBannersTable.$inferSelect;
