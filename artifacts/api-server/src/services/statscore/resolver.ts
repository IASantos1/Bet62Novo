import { getMapping } from "../liveStream/mapping.js";

// No documented StatScore "list live events" endpoint exists to match
// betbyEventId -> statscoreEventId automatically, so this is a straight
// lookup against the admin-maintained mapping table (routes/admin.ts's
// /live-stream/mappings endpoints) — the same manual step SMYTDRYT's video
// info already needs.
export async function resolveStatscoreEventId(betbyEventId: string): Promise<number | null> {
  const mapping = await getMapping(betbyEventId);
  return mapping?.statscoreEventId ?? null;
}
