import { getMapping } from "../liveStream/mapping.js";
import { CONFIG } from "../../lib/config.js";

export interface VideoInfo {
  matchId: number;
  sportId: number;
  tournamentId: number;
  statsHost: string;
  key: string;
  basePath: string;
}

// Same story as StatScore's resolver — matchId/sportId/tournamentId/key/
// basePath come from the admin-maintained mapping table, not from any
// automatic matching. statsHost falls back to SMYTDRYT_DEFAULT_STATS_HOST
// when the mapping row doesn't specify one explicitly; basePath has no
// fallback (confirmed via real BetBY captures to vary per match/stream, so
// there's no safe global default — see stream.ts).
export async function resolveVideoInfo(betbyEventId: string): Promise<VideoInfo | null> {
  const mapping = await getMapping(betbyEventId);
  if (
    !mapping?.videoMatchId ||
    !mapping.videoSportId ||
    !mapping.videoTournamentId ||
    !mapping.videoKey ||
    !mapping.videoBasePath
  ) {
    return null;
  }
  return {
    matchId: mapping.videoMatchId,
    sportId: mapping.videoSportId,
    tournamentId: mapping.videoTournamentId,
    statsHost: mapping.videoStatsHost || CONFIG.SMYTDRYT_DEFAULT_STATS_HOST,
    key: mapping.videoKey,
    basePath: mapping.videoBasePath,
  };
}
