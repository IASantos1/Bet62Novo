import { getMapping } from "../liveStream/mapping.js";
import { CONFIG } from "../../lib/config.js";

export interface VideoInfo {
  matchId: number;
  sportId: number;
  tournamentId: number;
  statsHost: string;
  key: string;
}

// Same story as StatScore's resolver — matchId/sportId/tournamentId/key come
// from the admin-maintained mapping table, not from any automatic matching.
// statsHost falls back to SMYTDRYT_DEFAULT_STATS_HOST when the mapping row
// doesn't specify one explicitly.
export async function resolveVideoInfo(betbyEventId: string): Promise<VideoInfo | null> {
  const mapping = await getMapping(betbyEventId);
  if (!mapping?.videoMatchId || !mapping.videoSportId || !mapping.videoTournamentId || !mapping.videoKey) {
    return null;
  }
  return {
    matchId: mapping.videoMatchId,
    sportId: mapping.videoSportId,
    tournamentId: mapping.videoTournamentId,
    statsHost: mapping.videoStatsHost || CONFIG.SMYTDRYT_DEFAULT_STATS_HOST,
    key: mapping.videoKey,
  };
}
