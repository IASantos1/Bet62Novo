// Football live odds from PulseScore, polled via REST (the WebSocket's one
// PRO-plan connection is dedicated to tennis instead — see tennisWs.ts).
// Same in-process cache + in-flight-dedup shape already used throughout
// matches.ts for other ~1s live polls (e.g. TENNIS_LIVE_V1_TTL).
import { CONFIG } from "../../lib/config.js";
import { pulseScoreGet, type PulseScoreEvent } from "./client.js";

const FOOTBALL_LIVE_TTL_MS = 1_000; // matches the PRO plan's 1 req/s rate limit

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

async function fetchFootballLive(): Promise<PulseScoreEvent[]> {
  try {
    const data = await pulseScoreGet<PulseScoreEvent[]>(
      "/live-events?sport=soccer",
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Live football odds from PulseScore (bet365, normalized). Empty array if
 * PULSESCORE_API_KEY isn't configured yet or the upstream call fails. */
export async function getPulseScoreFootballLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  if (cache && now - cache.fetchedAt < FOOTBALL_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchFootballLive()
      .then((events) => {
        cache = { events, fetchedAt: Date.now() };
        return events;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
