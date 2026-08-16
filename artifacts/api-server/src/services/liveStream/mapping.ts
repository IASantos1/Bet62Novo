import { db, liveStreamMappingsTable, type LiveStreamMappingRow } from "@workspace/db";
import { eq } from "drizzle-orm";

// Admin-managed mapping table bridging a live event with StatScore's
// eventId and SMYTDRYT's video info — filled in manually via
// /api/admin/live-stream/mappings (PATCH/POST).
//
// Bug found 2026-08-16 auditing the whole BetBY Tracker pipeline end to end:
// this table's header comment (and the matching UI copy in admin.tsx) used
// to claim the tracker side "never required this table at all" because
// PulseScore/Statpal cover it automatically — but routes/betbyTracker.ts's
// resolveBetbyEventIdByName() DOES read this table (layer 2, after BetBY's
// own live-catalogue auto-discovery) as a real fallback for teams BetBY's
// demo brand isn't currently showing. The table just had no way to ever get
// rows INTO it: no POST/create route existed (setMapping below is UPDATE-
// only, matched by betbyEventId — a 404 on any row that doesn't already
// exist), and nothing ever auto-seeds rows either, so in practice this table
// was permanently empty and that fallback layer was dead code. createMapping
// below is what was missing.

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

// betbyEventId is NOT NULL + UNIQUE on this table, but an admin adding a
// team↔Statscore mapping by hand usually has no real BetBY event id in
// hand (that's the whole point — the match isn't showing up in BetBY's own
// live catalogue). Callers pass a caller-generated placeholder id in that
// case (routes/admin.ts does `manual-<timestamp>-<random>`); it's never
// validated as a real BetBY id anywhere downstream of this table — only
// home/away (for the name match) and statscoreEventId (the actual payoff)
// are read by resolveBetbyEventIdByName in routes/betbyTracker.ts.
export async function createMapping(fields: {
  betbyEventId: string;
  home: string;
  away: string;
  league?: string | null;
  statscoreEventId?: number | null;
}): Promise<LiveStreamMappingRow> {
  const [row] = await db
    .insert(liveStreamMappingsTable)
    .values({
      betbyEventId: fields.betbyEventId,
      home: fields.home,
      away: fields.away,
      league: fields.league ?? null,
      statscoreEventId: fields.statscoreEventId ?? null,
      resolvedBy: "manual",
    })
    .returning();
  return row!;
}
