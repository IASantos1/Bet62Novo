import { CONFIG } from "../../lib/config.js";
import type { VideoInfo } from "./resolver.js";

// Matches the URL template confirmed by the user exactly.
// `excluded_languages` is required even empty: a real captured working URL
// had it as a trailing `&excluded_languages=`, and omitting it entirely
// (rather than sending it empty) got a 400 Bad Request back from SMYTDRYT —
// confirmed by the user diffing our generated URL against theirs.
// video.basePath (the hex segment right after the host) is per-match/stream,
// admin-set — see resolver.ts/lib/config.ts for why it's not a global default.
// video.timestamp is NOT regenerated per call: live testing confirmed the
// key is signed against the exact timestamp it was issued with — a request
// with today's Date.now() and yesterday's key 400s, while replaying the
// original captured timestamp alongside its key works. Both must be
// captured together by the admin and reused verbatim (see the video_key/
// video_timestamp columns in live_stream_mappings).
export function buildStreamUrl(video: VideoInfo): string {
  return (
    `${CONFIG.SMYTDRYT_HOST_URL}/${video.basePath}/playlist.m3u8` +
    `?match_id=${video.matchId}` +
    `&s_id=${video.sportId}` +
    `&t_id=${video.tournamentId}` +
    `&stats=${video.statsHost}` +
    `&timestamp=${video.timestamp}` +
    `&language=FASTEST` +
    `&key=${encodeURIComponent(video.key)}` +
    `&excluded_languages=`
  );
}
