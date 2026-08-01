import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { fetchBetbyLiveEvents } from "./client.js";
import { setLiveEvents, hydrateLiveEventsFromRedis } from "./state.js";
import { ensureMapping } from "../liveStream/mapping.js";
import { getTrackerForTeams } from "../statpal/liveTracker.js";
import { resolveStatscoreEventId } from "../statscore/resolver.js";
import { getStatscoreTracker } from "../statscore/tracker.js";
import { resolveVideoInfo } from "../smytdryt/resolver.js";
import { buildStreamUrl } from "../smytdryt/stream.js";
import type { LiveEvent } from "./types.js";
import type { MatchTracker } from "../liveStream/trackerTypes.js";

// StatScore (real auth confirmed) is the primary tracker source once an
// admin has mapped a statscoreEventId for this event; Statpal (matched by
// team name, no mapping needed) is the automatic fallback so every live
// event has *some* tracker before that mapping exists.
async function resolveTracker(event: LiveEvent): Promise<MatchTracker | null> {
  const statscoreEventId = await resolveStatscoreEventId(event.betbyEventId).catch(() => null);
  if (statscoreEventId != null) {
    try {
      return await getStatscoreTracker(statscoreEventId);
    } catch (err) {
      logger.error(
        { err, betbyEventId: event.betbyEventId, statscoreEventId },
        "[betby-poller] StatScore tracker fetch failed, falling back to Statpal",
      );
    }
  }
  return getTrackerForTeams(event.home, event.away);
}

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
  // never touches admin-set video fields), then attach whatever's already
  // resolved (tracker via Statpal team-name match, stream via the mapping
  // table) so the frontend gets both in the same /api/live payload without
  // an extra round-trip.
  const enriched = await Promise.all(
    events.map(async (event): Promise<LiveEvent> => {
      try {
        await ensureMapping(event);
      } catch (err) {
        logger.error({ err, betbyEventId: event.betbyEventId }, "[betby-poller] ensureMapping failed");
        return event;
      }

      const [tracker, videoInfo] = await Promise.all([
        resolveTracker(event),
        resolveVideoInfo(event.betbyEventId).catch(() => null),
      ]);

      const out: LiveEvent = { ...event };
      if (tracker) {
        out.eventId = tracker.eventId;
        out.tracker = tracker;
      }
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
