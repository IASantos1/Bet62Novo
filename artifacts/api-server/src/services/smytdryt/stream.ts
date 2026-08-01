import { CONFIG } from "../../lib/config.js";
import type { VideoInfo } from "./resolver.js";

// Matches the URL template confirmed by the user exactly — a fresh
// `timestamp` on every call, since the HLS token is presumably time-bound.
export function buildStreamUrl(video: VideoInfo): string {
  const ts = Math.floor(Date.now() / 1000);
  return (
    `${CONFIG.SMYTDRYT_BASE_URL}/playlist.m3u8` +
    `?match_id=${video.matchId}` +
    `&s_id=${video.sportId}` +
    `&t_id=${video.tournamentId}` +
    `&stats=${video.statsHost}` +
    `&timestamp=${ts}` +
    `&language=FASTEST` +
    `&key=${encodeURIComponent(video.key)}`
  );
}
