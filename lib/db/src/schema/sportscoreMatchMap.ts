import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Maps a Statpal match (our primary data source for games/odds/stats/events/
// settlement) to the corresponding SportScore match, using SportScore's
// free, keyless, open-CORS REST API (https://sportscore.com/developers/):
//   - sportscoreId: the match "slug" (e.g. "home-team-vs-away-team"), used
//     by /api/widget/match/, /embed/tracker/{sport}/{slug}/, etc.
//   - trackerId: the numeric match id used specifically by
//     /api/widget/tracker/?sport={sport}&id={trackerId}, which returns raw
//     live position/animation JSON meant to be rendered by us (not an
//     iframe embed) — this is what lets the mini campo show real ball/event
//     data in our own 2D style instead of SportScore's own 3D embed widget.
// Statpal and SportScore use unrelated ID spaces, so this table is the only
// bridge between "the match the user is looking at" and the SportScore
// identifiers needed. Populated automatically by matching team names
// against /api/widget/matches/ (the real fixtures list), falling back to
// manual entry via the admin panel when the automatic match can't be found
// (e.g. lower-tier/reserve team fixtures with divergent naming).
export const sportscoreMatchMapTable = pgTable("sportscore_match_map", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull(),
  statpalMatchId: text("statpal_match_id").notNull(),
  sportscoreId: text("sportscore_id").notNull(),
  trackerId: text("tracker_id"),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  matchDate: text("match_date"),
  source: text("source").notNull().default("manual"), // "manual" | "auto"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table: any) => ({
  statpalIdx: uniqueIndex("sportscore_match_map_statpal_idx").on(
    table.sport,
    table.statpalMatchId,
  ),
}));

export type SportscoreMatchMap = typeof sportscoreMatchMapTable.$inferSelect;
