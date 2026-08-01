import { getRedis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import type { LiveEvent } from "./types.js";

// In-memory is the source of truth for reads (routes/liveStream.ts hits
// this directly, no Redis round-trip needed) — Redis just mirrors it so a
// second server instance (or a restart) doesn't start from an empty board.
const liveEvents = new Map<string, LiveEvent>();

const REDIS_KEY = "live_events";

export function setLiveEvents(events: LiveEvent[]): void {
  liveEvents.clear();
  for (const ev of events) liveEvents.set(ev.betbyEventId, ev);
  const redis = getRedis();
  if (redis) {
    redis
      .set(REDIS_KEY, JSON.stringify(events))
      .catch((err: Error) => logger.error({ err }, "[betby-state] Redis snapshot write failed"));
  }
}

export function upsertLiveEvent(event: LiveEvent): void {
  liveEvents.set(event.betbyEventId, event);
}

export function getLiveEvents(): LiveEvent[] {
  return [...liveEvents.values()];
}

export function getLiveEvent(betbyEventId: string): LiveEvent | undefined {
  return liveEvents.get(betbyEventId);
}

// Restores in-memory state from the Redis snapshot on boot, before the
// first poll tick lands — keeps GET /api/live from serving an empty list
// for the first BETBY_POLL_INTERVAL_MS after a restart.
export async function hydrateLiveEventsFromRedis(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return;
    const events = JSON.parse(raw) as LiveEvent[];
    if (Array.isArray(events)) {
      for (const ev of events) liveEvents.set(ev.betbyEventId, ev);
    }
  } catch (err) {
    logger.error({ err }, "[betby-state] Redis snapshot hydrate failed");
  }
}
