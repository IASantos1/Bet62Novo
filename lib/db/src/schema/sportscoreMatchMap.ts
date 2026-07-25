import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Maps a Statpal match (our primary data source for games/odds/stats/events/
// settlement) to the corresponding SportScore match ID, which is required to
// embed SportScore's Match Tracker widget:
//   https://sportscore.com/api/widget/tracker/?sport={sport}&id={sportscoreId}
// Statpal and SportScore use unrelated ID spaces, so this table is the only
// bridge between "the match the user is looking at" and "the ID the tracker
// widget needs". Populated manually via the admin endpoint until an
// automatic team/date matching service is wired up against a real SportScore
// fixtures/search endpoint.
export const sportscoreMatchMapTable = pgTable("sportscore_match_map", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull(),
  statpalMatchId: text("statpal_match_id").notNull(),
  sportscoreId: text("sportscore_id").notNull(),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  matchDate: text("match_date"),
  source: text("source").notNull().default("manual"), // "manual" | "auto"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statpalIdx: uniqueIndex("sportscore_match_map_statpal_idx").on(
    table.sport,
    table.statpalMatchId,
  ),
}));

export type SportscoreMatchMap = typeof sportscoreMatchMapTable.$inferSelect;
