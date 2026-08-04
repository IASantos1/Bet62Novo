import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { fetchBetbyLiveEvents, getCachedExtractedVideo } from "./client.js";
import { setLiveEvents, hydrateLiveEventsFromRedis } from "./state.js";
import { ensureMapping, applyAutoExtractedVideo } from "../liveStream/mapping.js";
import { resolveVideoInfo } from "../smytdryt/resolver.js";
import { buildStreamUrl } from "../smytdryt/stream.js";
import type { LiveEvent } from "./types.js";

// Tracker resolution (StatScore/SportScore/Statpal/PulseScore) used to run
// here too, per BetBY live event, on this poller's 5s interval — moved
// entirely to routes/matches.ts's attachDirectTracker/tickDirectTracker,
// which resolves it directly against our OWN live matches (Statpal-sourced
// names) instead of BetBY's, since BetBY's own naming for a fixture
// routinely diverges from both and was silently blocking matches. Running
// the same SportScore lookups here AND there would double up against
// SportScore's free-tier ~10k req/day/IP cap for no benefit — this poller
// now only handles what's still BetBY-specific: seeding the live-event
// list itself and auto-discovering SMYTDRYT video URLs.
let pollTimer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  let events: LiveEvent[];
  try {
    events = await fetchBetbyLiveEvents();
  } catch (err) {
    logger.error({ err }, "[betby-poller] fetch failed");
    return;
  }
  if (events.length === 0) return;

  // Seed/refresh the mapping table for every live event seen (cheap upsert,
  // never touches admin-set video fields). If the BetBY chunk for this event
  // carried a raw SMYTDRYT playlist URL (deep-scanned in client.ts), try
  // applying it now via applyAutoExtractedVideo() — that helper only writes
  // when the row is still fully auto (no manual videoMatchId/videoKey yet),
  // so an admin's manual work is safe.
  const enriched = await Promise.all(
    events.map(async (event): Promise<LiveEvent> => {
      try {
        await ensureMapping(event);
      } catch (err) {
        logger.error({ err, betbyEventId: event.betbyEventId }, "[betby-poller] ensureMapping failed");
        return event;
      }

      const extracted = getCachedExtractedVideo(event.betbyEventId);
      if (extracted) {
        try {
          await applyAutoExtractedVideo(event.betbyEventId, extracted);
        } catch (err) {
          logger.error(
            { err, betbyEventId: event.betbyEventId },
            "[betby-poller] auto video extraction DB write failed",
          );
        }
      }

      const videoInfo = await resolveVideoInfo(event.betbyEventId).catch(() => null);

      const out: LiveEvent = { ...event };
      if (videoInfo) {
        out.videoMatchId = videoInfo.matchId;
        out.stream = { hls: buildStreamUrl(videoInfo) };
      }
      return out;
    }),
  );

  setLiveEvents(enriched);
}

export async function startBetbyPoller(): Promise<void> {
  await hydrateLiveEventsFromRedis();
  if (pollTimer) return;
  void tick();
  pollTimer = setInterval(() => void tick(), CONFIG.BETBY_POLL_INTERVAL_MS);
}

export function stopBetbyPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
