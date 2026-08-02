import { getMapping } from "../liveStream/mapping.js";
import { CONFIG } from "../../lib/config.js";

export interface VideoInfo {
  matchId: number;
  sportId: number;
  tournamentId: number;
  statsHost: string;
  key: string;
  basePath: string;
  timestamp: number;
}

// Same story as StatScore's resolver — matchId/sportId/tournamentId/key/
// basePath/timestamp come from the admin-maintained mapping table, not from
// any automatic matching. statsHost falls back to SMYTDRYT_DEFAULT_STATS_HOST
// when the mapping row doesn't specify one explicitly; basePath and
// timestamp have no fallback — both confirmed via real testing to be
// per-match/per-key values with no safe global default (see stream.ts:
// the key is signed against this exact timestamp, not "now").
export async function resolveVideoInfo(betbyEventId: string): Promise<VideoInfo | null> {
  const mapping = await getMapping(betbyEventId);
  if (
    !mapping?.videoMatchId ||
    !mapping.videoSportId ||
    !mapping.videoTournamentId ||
    !mapping.videoKey ||
    !mapping.videoBasePath ||
    !mapping.videoTimestamp
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
    timestamp: mapping.videoTimestamp,
  };
}
