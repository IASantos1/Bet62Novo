import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Maps a Statpal match (our primary data source for games/odds/stats/events/
// settlement) to the corresponding SportScore match slug, which is required
// to embed SportScore's Match Tracker widget:
//   https://sportscore.com/embed/tracker/{sport}/{slug}/
// (slug is e.g. "home-team-vs-away-team" — SportScore's own team-name-based
// slug, not a numeric ID, and not derivable from our own team name strings
// since spellings/abbreviations differ between providers.) Statpal and
// SportScore use unrelated ID spaces, so this table is the only bridge
// between "the match the user is looking at" and "the slug the tracker
// widget needs". Populated manually via the admin endpoint until an
// automatic team/date matching service is wired up against a real SportScore
// fixtures/search endpoint. Column name kept as sportscoreId for stability.
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
