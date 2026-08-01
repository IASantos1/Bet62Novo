import { db, liveStreamMappingsTable, type LiveStreamMappingRow } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { LiveEvent } from "../betby/types.js";

// Bridges BetBY's event id and SMYTDRYT's video info — the two providers
// don't share an identifier scheme and there's no known automatic way to
// resolve one from the other, so this is a manual-mapping table: the poller
// seeds a row per live BetBY event (home/away/league only) the moment it's
// first seen, and an admin fills in the video* fields once — after that
// it's a straight lookup. (The Match Tracker doesn't need a row here — it's
// resolved from Statpal by team name at read time, see services/statpal/
// liveTracker.ts.) See routes/admin.ts's /live-stream/mappings endpoints.

// Ensures a row exists for this BetBY event (creates a blank one on first
// sight) and keeps the denormalized home/away/league fresh — called on
// every poll tick, so it must stay cheap and never touch the resolved
// video fields (an admin's manual work must never be clobbered).
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
    videoMatchId: number | null;
    videoSportId: number | null;
    videoTournamentId: number | null;
    videoStatsHost: string | null;
    videoKey: string | null;
  }>,
): Promise<LiveStreamMappingRow | null> {
  const [row] = await db
    .update(liveStreamMappingsTable)
    .set({ ...fields, resolvedBy: "manual", updatedAt: new Date() })
    .where(eq(liveStreamMappingsTable.betbyEventId, betbyEventId))
    .returning();
  return row ?? null;
}
