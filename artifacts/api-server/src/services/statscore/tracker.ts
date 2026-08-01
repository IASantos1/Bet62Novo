import { getPushes } from "./client.js";
import type { MatchTracker } from "../liveStream/trackerTypes.js";

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

// The only confirmed get_pushes response shape is the minimal example from
// the original spec: {minute, status, homeScore, awayScore, incidents}.
// Normalized defensively in case the real payload nests these differently.
function normalizeTracker(eventId: number, raw: unknown): MatchTracker {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const homeScoreRaw = pick(o, ["homeScore", "home_score"]);
  const awayScoreRaw = pick(o, ["awayScore", "away_score"]);
  const incidentsRaw = pick(o, ["incidents"]);
  return {
    provider: "statscore",
    eventId: String(eventId),
    status: String(pick(o, ["status"]) ?? ""),
    minute: String(pick(o, ["minute"]) ?? ""),
    homeScore: homeScoreRaw != null ? Number(homeScoreRaw) : 0,
    awayScore: awayScoreRaw != null ? Number(awayScoreRaw) : 0,
    incidents: Array.isArray(incidentsRaw) ? incidentsRaw : [],
  };
}

export async function getStatscoreTracker(eventId: number): Promise<MatchTracker> {
  const raw = await getPushes(eventId);
  return normalizeTracker(eventId, raw);
}
