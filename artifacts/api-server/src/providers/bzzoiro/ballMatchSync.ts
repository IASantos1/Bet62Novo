// sports.bzzoiro.com — matches live GOAL API football fixtures against
// bzzoiro's own live events, then subscribes the WebSocket client to each
// matched fixture's real-time `livedata` (real ball x/y + situation),
// writing it into LiveMatchState._ballPosition. Deliberately small: unlike
// PulseScore's shadowMatchSync.ts, there's no odds comparison here — this
// provider's only job is ball position, so once a fixture is matched and
// subscribed, this module's remaining work is just keeping the
// subscription list in sync with which fixtures are still live.
//
// Reuses the same canonical_matches provider-mapping table PulseScore's
// matcher already writes to (attachProviderMapping/
// getUnmatchedGoalApiFootballMatches/getMatchedLiveFootballFixtures) —
// GOAL API stays the sole owner of match identity; this just attaches a
// third provider's mapping alongside PulseScore's.
import { logger } from "../../lib/logger.js";
import { CONFIG } from "../../lib/config.js";
import {
  attachProviderMapping,
  getUnmatchedGoalApiFootballMatches,
  getMatchedLiveFootballFixtures,
} from "../../lib/canonicalMatchCatalog.js";
import { matchGoalApiFixtureToBzzoiro } from "../../matching/bzzoiroMatchEngine.js";
import type { GoalApiFixtureRef } from "../../matching/footballMatchEngine.js";
import { getBzzoiroLiveEvents } from "./client.js";
import {
  startBzzoiroWebSocket,
  subscribeBzzoiroEvent,
  unsubscribeBzzoiroEvent,
  getBzzoiroWsStatus,
} from "./websocketClient.js";
import { liveMatchState, broadcastMatchDelta, type LiveMatchState } from "../../routes/matches.js";
import type { BzzoiroLiveDataFrame } from "./types.js";

const PROVIDER = "bzzoiro";
const SYNC_INTERVAL_MS = 20_000;

// bzzoiro event_id -> "goalapi-football-<id>" liveMatchId, refreshed every
// sync round. This is the routing table the WS handler below uses to know
// which LiveMatchState entry a given event_id's livedata frame belongs to.
let currentSubscriptions = new Map<number, string>();

async function runMatchingPhase(): Promise<{ attempted: number; matched: number }> {
  const unmatched = (await getUnmatchedGoalApiFootballMatches(PROVIDER)).filter(
    (m) => m.status === "live", // bzzoiro's candidate pool below is live-only
  );
  if (unmatched.length === 0) return { attempted: 0, matched: 0 };

  const candidates = await getBzzoiroLiveEvents();
  if (candidates.length === 0) return { attempted: unmatched.length, matched: 0 };

  let matched = 0;
  for (const goalApiMatch of unmatched) {
    const fixture: GoalApiFixtureRef = {
      id: goalApiMatch.providerMatchId,
      homeTeamName: goalApiMatch.home,
      awayTeamName: goalApiMatch.away,
      leagueName: goalApiMatch.leagueName,
      kickoffUtc: goalApiMatch.kickoffUtc ? goalApiMatch.kickoffUtc.toISOString() : null,
    };
    const candidate = matchGoalApiFixtureToBzzoiro(fixture, candidates);
    if (!candidate) continue;
    const ev = candidates.find((e) => e.id === candidate.bzzoiroEventId);
    if (!ev) continue;
    try {
      await attachProviderMapping({
        matchId: goalApiMatch.matchId,
        provider: PROVIDER,
        providerSport: "football",
        providerMatchId: String(candidate.bzzoiroEventId),
        home: ev.home_team,
        away: ev.away_team,
        confidence: candidate.confidence,
      });
      matched++;
    } catch (err) {
      logger.error(
        { err, matchId: goalApiMatch.matchId, bzzoiroEventId: candidate.bzzoiroEventId },
        "[bzzoiro-match] attachProviderMapping failed",
      );
    }
  }
  return { attempted: unmatched.length, matched };
}

async function refreshSubscriptions(): Promise<number> {
  const matched = await getMatchedLiveFootballFixtures(PROVIDER);
  const nextSubscriptions = new Map<number, string>();
  for (const fx of matched) {
    const eventId = Number(fx.otherProviderMatchId);
    if (!Number.isFinite(eventId)) continue;
    nextSubscriptions.set(eventId, `goalapi-football-${fx.goalApiProviderMatchId}`);
  }
  for (const eventId of currentSubscriptions.keys()) {
    if (!nextSubscriptions.has(eventId)) unsubscribeBzzoiroEvent(eventId);
  }
  for (const eventId of nextSubscriptions.keys()) {
    if (!currentSubscriptions.has(eventId)) subscribeBzzoiroEvent(eventId);
  }
  currentSubscriptions = nextSubscriptions;
  return currentSubscriptions.size;
}

function handleLiveData(frame: BzzoiroLiveDataFrame): void {
  const liveMatchId = currentSubscriptions.get(frame.event_id);
  if (!liveMatchId) return; // frame for a match we've already unsubscribed from
  const point = frame.coordinates?.[0];
  if (!point) return;
  const existing = liveMatchState.get(liveMatchId);
  if (!existing) return; // GOAL API no longer tracking this fixture this tick

  const ballPosition: NonNullable<LiveMatchState["_ballPosition"]> = {
    x: point.x,
    y: point.y,
    side: frame.side,
    situation: frame.situation,
    updatedAt: Date.now(),
  };
  liveMatchState.set(liveMatchId, { ...existing, _ballPosition: ballPosition });
  broadcastMatchDelta(liveMatchId, { _ballPosition: ballPosition });
}

let intervalStarted = false;

export async function runBzzoiroBallSyncOnce(): Promise<void> {
  if (!CONFIG.BZZOIRO_API_KEY) return;
  try {
    const matchResult = await runMatchingPhase();
    const subscribedCount = await refreshSubscriptions();
    if (matchResult.attempted > 0 || subscribedCount > 0) {
      logger.info(
        { ...matchResult, subscribed: subscribedCount },
        "[bzzoiro-match] sync round complete",
      );
    }
  } catch (err) {
    logger.error({ err }, "[bzzoiro-match] sync round failed");
  }
}

/** Call once at server startup, gated on CONFIG.BZZOIRO_API_KEY. Starts
 * the shared WebSocket connection and the periodic matching/subscription
 * loop. */
export function startBzzoiroBallSync(): void {
  if (!CONFIG.BZZOIRO_API_KEY) return;
  startBzzoiroWebSocket(handleLiveData);
  if (intervalStarted) return;
  intervalStarted = true;
  runBzzoiroBallSyncOnce().catch(() => {});
  setInterval(() => {
    runBzzoiroBallSyncOnce().catch(() => {});
  }, SYNC_INTERVAL_MS);
}

export function getBzzoiroBallSyncStatus(): { ws: ReturnType<typeof getBzzoiroWsStatus>; subscribedMatches: number } {
  return {
    ws: getBzzoiroWsStatus(),
    subscribedMatches: currentSubscriptions.size,
  };
}
