import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Bridges BetBY (live events list) with SMYTDRYT (HLS stream, keyed by its
// own matchId) — the two providers with no shared identifier and no known
// automatic resolution. The Match Tracker doesn't need a row here: it comes
// from Statpal, matched by team name at read time (see services/statpal/
// liveTracker.ts) since Statpal is already the platform's live-football
// data source. A live event's stream is only ready once an admin fills in
// the video* fields for its row (see services/liveStream/mapping.ts).
export const liveStreamMappingsTable = pgTable("live_stream_mappings", {
  id: serial("id").primaryKey(),
  betbyEventId: text("betby_event_id").notNull().unique(),
  home: text("home").notNull(),
  away: text("away").notNull(),
  league: text("league"),
  videoMatchId: integer("video_match_id"),
  videoSportId: integer("video_sport_id"),
  videoTournamentId: integer("video_tournament_id"),
  videoStatsHost: text("video_stats_host"),
  videoKey: text("video_key"),
  // "auto" — the row was only seeded by the poller (home/away/league only);
  // "manual" — an admin has filled in/overridden the video* fields.
  resolvedBy: text("resolved_by").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LiveStreamMappingRow = typeof liveStreamMappingsTable.$inferSelect;
