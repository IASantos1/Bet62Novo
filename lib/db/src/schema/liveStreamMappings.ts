import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Bridges BetBY (live events list) with StatScore (Match Tracker, keyed by
// its own eventId — real auth confirmed, but no "list live events" endpoint
// exists to auto-resolve one from a BetBY event) and SMYTDRYT (HLS stream,
// keyed by its own matchId). None of the three share an identifier and none
// have a known automatic resolution, so this is a manual-mapping table: a
// row is seeded per live BetBY event automatically (home/away/league only),
// and an admin fills in statscoreEventId/video* fields to complete the
// wiring (see services/liveStream/mapping.ts). Until statscoreEventId is
// set, the tracker automatically falls back to PulseScore, matched by team
// name (see services/pulsescore/betbyTracker.ts) — so this table only gates
// the stream side strictly, and the tracker side is a quality upgrade, not a
// hard requirement.
export const liveStreamMappingsTable = pgTable("live_stream_mappings", {
  id: serial("id").primaryKey(),
  betbyEventId: text("betby_event_id").notNull().unique(),
  home: text("home").notNull(),
  away: text("away").notNull(),
  league: text("league"),
  statscoreEventId: integer("statscore_event_id"),
  videoMatchId: integer("video_match_id"),
  videoSportId: integer("video_sport_id"),
  videoTournamentId: integer("video_tournament_id"),
  videoStatsHost: text("video_stats_host"),
  videoKey: text("video_key"),
  // Hex path segment SMYTDRYT puts between the host and /playlist.m3u8
  // (e.g. "e34417db0028895ff9a29e8a0865eaea") — confirmed via real BetBY
  // captures to vary per match/stream, not a fixed account-wide value as
  // originally assumed, so it has to be admin-set per event same as the key.
  videoBasePath: text("video_base_path"),
  // "auto" — the row was only seeded by the poller (home/away/league only);
  // "manual" — an admin has filled in/overridden the statscore/video fields.
  resolvedBy: text("resolved_by").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LiveStreamMappingRow = typeof liveStreamMappingsTable.$inferSelect;
