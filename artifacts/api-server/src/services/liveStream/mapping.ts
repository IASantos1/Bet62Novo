import { db, liveStreamMappingsTable, type LiveStreamMappingRow } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { LiveEvent } from "../betby/types.js";
import type { BetbyExtractedVideo } from "../betby/client.js";

// Bridges BetBY's event id with StatScore's eventId and SMYTDRYT's video
// info — none of the three share an identifier scheme. Two filling modes:
//   • MANUAL — admin calls setMapping() via /api/admin/live-stream/mappings
//     (resolvedBy = "manual"). These values are NEVER overwritten by the
//     poller's auto-discovery.
//   • AUTO   — poller deep-scans the BetBY chunk for raw SMYTDRYT playlist
//     URLs (playlist.m3u8 + match_id/s_id/t_id/timestamp/key params) and
//     calls applyAutoExtractedVideo() (resolvedBy = "auto") for any event
//     the admin hasn't touched yet. If the admin later fills in any video
//     field via PATCH, the row flips to "manual" and auto-fill stops
//     touching it.
// (PulseScore / Statpal are the automatic fallbacks for the TRACKER side —
// see services/pulsescore/betbyTracker.ts and services/statpal/liveTracker.ts
// — so the tracker side never required this table at all; only the stream
// side was historically strictly gated by manual admin work. AUTO mode
// removes that whenever BetBY embeds the stream URL in its feed.)

// Ensures a row exists for this BetBY event (creates a blank one on first
// sight) and keeps the denormalized home/away/league fresh — called on
// every poll tick, so it must stay cheap and never touch the resolved
// statscore/video fields (an admin's manual work must never be clobbered).
export async function ensureMapping(event: LiveEvent): Promise<void> {
  await db
    .insert(liveStreamMappingsTable)
    .values({
      betbyEventId: event.betbyEventId,
      home: event.home,
      away: event.away,
      league: event.league || null,
    })
    .onConflictDoUpdate({
      target: liveStreamMappingsTable.betbyEventId,
      set: {
        home: sql`excluded.home`,
        away: sql`excluded.away`,
        league: sql`excluded.league`,
      },
    });
}

export async function getMapping(betbyEventId: string): Promise<LiveStreamMappingRow | null> {
  const [row] = await db
    .select()
    .from(liveStreamMappingsTable)
    .where(eq(liveStreamMappingsTable.betbyEventId, betbyEventId))
    .limit(1);
  return row ?? null;
}

export async function listMappings(): Promise<LiveStreamMappingRow[]> {
  return db.select().from(liveStreamMappingsTable).orderBy(liveStreamMappingsTable.updatedAt);
}

export async function setMapping(
  betbyEventId: string,
  fields: Partial<{
    statscoreEventId: number | null;
    videoMatchId: number | null;
    videoSportId: number | null;
    videoTournamentId: number | null;
    videoStatsHost: string | null;
    videoKey: string | null;
    videoBasePath: string | null;
    videoTimestamp: number | null;
  }>,
): Promise<LiveStreamMappingRow | null> {
  const [row] = await db
    .update(liveStreamMappingsTable)
    .set({ ...fields, resolvedBy: "manual", updatedAt: new Date() })
    .where(eq(liveStreamMappingsTable.betbyEventId, betbyEventId))
    .returning();
  return row ?? null;
}

// Applies a BetBY-deep-scanned SMYTDRYT video info into the mapping row —
// but ONLY when none of the 6 admin-owned video* fields have been filled
// yet AND resolvedBy is still "auto" (or missing). This avoids clobbering
// an admin's manual work the moment a (potentially stale/wrong) URL shows
// up in the feed later. Returns true when a change was written.
export async function applyAutoExtractedVideo(
  betbyEventId: string,
  video: BetbyExtractedVideo,
): Promise<boolean> {
  if (!video) return false;
  const result = await db
    .update(liveStreamMappingsTable)
    .set({
      videoMatchId: video.matchId,
      videoSportId: video.sportId,
      videoTournamentId: video.tournamentId,
      videoStatsHost: video.statsHost,
      videoKey: video.key,
      videoBasePath: video.basePath,
      videoTimestamp: video.timestamp,
      resolvedBy: "auto",
      updatedAt: new Date(),
    })
    .where(
      eq(liveStreamMappingsTable.betbyEventId, betbyEventId)
        // only overwrite when the row is still in "auto" state AND no
        // required video column has been filled in yet (manual presence of
        // any one of them means an admin already worked on this row).
        .and(sql`coalesce(${liveStreamMappingsTable.resolvedBy}, 'auto') = 'auto'`)
        .and(liveStreamMappingsTable.videoMatchId.isNull())
        .and(liveStreamMappingsTable.videoKey.isNull()),
    );
  return (result.rowCount ?? 0) > 0;
}
