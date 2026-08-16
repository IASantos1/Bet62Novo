import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Bridges BetBY (live events list) with StatScore (Match Tracker, keyed by
// its own eventId — real auth confirmed, but no "list live events" endpoint
// exists to auto-resolve one from a BetBY event) and SMYTDRYT (HLS stream,
// keyed by its own matchId). None of the three share an identifier and none
// have a known automatic resolution, so this is a manual-mapping table: an
// admin fills in home/away/statscoreEventId/video* fields via
// /api/admin/live-stream/mappings (see services/liveStream/mapping.ts).
//
// Corrected 2026-08-16: this comment used to say a row gets seeded per live
// BetBY event automatically and that the tracker side falls back to
// PulseScore/never needs this table — neither was true. No poller ever
// seeded rows (grep confirms zero writers besides admin.ts's mapping
// routes), so with only an UPDATE-by-betbyEventId route existing (no
// CREATE), this table was permanently empty in practice. And
// routes/betbyTracker.ts's resolveBetbyEventIdByName DOES read this table
// as a real fallback layer (by team name) when BetBY's own live catalogue
// doesn't have the match — it just had no rows to find. Both gaps (missing
// CREATE route, and statscoreEventId never actually being read once found)
// were fixed the same day; this table is now a real, load-bearing part of
// the tracker resolution pipeline, not just a stream-side nicety.
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
  // Unix seconds timestamp captured together with videoKey — confirmed via
  // live testing that the key is signed against this exact value, not
  // "whatever time it is now": generating a fresh timestamp per request
  // (the original approach) got a 400 every time, while replaying the
  // original captured timestamp alongside its key worked. So this has to be
  // stored and reused verbatim, never regenerated — see stream.ts.
  videoTimestamp: integer("video_timestamp"),
  // "auto" — the row was only seeded by the poller (home/away/league only);
  // "manual" — an admin has filled in/overridden the statscore/video fields.
  resolvedBy: text("resolved_by").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LiveStreamMappingRow = typeof liveStreamMappingsTable.$inferSelect;
