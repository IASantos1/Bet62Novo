import { CONFIG } from "../../lib/config.js";
import type { VideoInfo } from "./resolver.js";

// Matches the URL template confirmed by the user exactly — a fresh
// `timestamp` on every call, since the HLS token is presumably time-bound.
// `excluded_languages` is required even empty: a real captured working URL
// had it as a trailing `&excluded_languages=`, and omitting it entirely
// (rather than sending it empty) got a 400 Bad Request back from SMYTDRYT —
// confirmed by the user diffing our generated URL against theirs.
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
    `&key=${encodeURIComponent(video.key)}` +
    `&excluded_languages=`
  );
}
