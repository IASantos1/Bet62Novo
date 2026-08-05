import { db, liveStreamMappingsTable, type LiveStreamMappingRow } from "@workspace/db";
import { eq } from "drizzle-orm";

// Admin-managed mapping table bridging a live event with StatScore's
// eventId and SMYTDRYT's video info — filled in manually via
// /api/admin/live-stream/mappings (PATCH). PulseScore / Statpal are the
// automatic fallbacks for the TRACKER side — see
// services/pulsescore/genericTracker.ts and services/statpal/liveTracker.ts
// — so the tracker side never required this table at all; only the stream
// (video) side needs it, and only for matches an admin has manually mapped.

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
