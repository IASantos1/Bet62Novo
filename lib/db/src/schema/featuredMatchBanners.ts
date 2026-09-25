import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Admin-scheduled "jogo em destaque" banners for the Destaques/home page —
// BET62 has no live match data of its own anymore (the native bsd sports
// engine was retired in favor of WinHouse's sportsbook), so featuring a
// specific game is now a manual, admin-entered schedule instead of
// something derived from a live feed. A banner is public (shown on
// Destaques) exactly between kickoffAt and endsAt, and the "Apostar"
// button just opens the Sportsbook tab — there's no way to deep-link the
// WinHouse iframe to one specific match.
export const featuredMatchBannersTable = pgTable("featured_match_banners", {
  id: serial("id").primaryKey(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  competition: text("competition"),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  // Defaults to kickoffAt + 3h (set by the admin route) — when this passes,
  // the banner stops being returned by the public endpoint on its own,
  // no manual cleanup needed.
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeaturedMatchBannerRow = typeof featuredMatchBannersTable.$inferSelect;
