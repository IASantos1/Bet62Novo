// Mr. Doge live odds — odds.subscribe is per-match (Business tier), unlike
// matches.subscribeLive which covers every live match in one connection.
// This keeps one active WS subscription per currently-live match this
// codebase actually shows odds for (football only, see common.ts's header),
// opening one the moment a match enters the live set and cancelling it the
// moment it leaves — matching odds.subscribe's own docs ("cancel when
// you're done ... leaking subscriptions eats your tier's concurrent quota").
import { getMrDogeClient } from "./client.js";
import { logger } from "../../lib/logger.js";
import type { Market, Subscription } from "@mrdoge/node";
import { MRDOGE_SOCCER_BET_TYPES } from "./common.js";

const oddsByMatchId = new Map<string, Market[]>();
const subsByMatchId = new Map<string, Subscription<"odds.subscribe">>();
let syncInFlight = false;

export function getMrDogeOdds(matchId: string): Market[] | undefined {
  return oddsByMatchId.get(matchId);
}

function dropSubscription(matchId: string): void {
  subsByMatchId.delete(matchId);
  oddsByMatchId.delete(matchId);
}

/** Call every live-builder tick with the current set of Mr. Doge match ids
 * (raw provider ids, not BET62's prefixed ones) that should have live odds
 * streaming. Idempotent and re-entrancy-guarded — a slow subscribe() call
 * from one tick never overlaps the next tick's sync. */
export function syncMrDogeOddsSubscriptions(liveMatchIds: string[]): void {
  if (syncInFlight) return;
  syncInFlight = true;
  void runSync(liveMatchIds).finally(() => {
    syncInFlight = false;
  });
}

async function runSync(liveMatchIds: string[]): Promise<void> {
  const wanted = new Set(liveMatchIds);
  for (const [matchId, sub] of subsByMatchId) {
    if (wanted.has(matchId)) continue;
    dropSubscription(matchId);
    try {
      await sub.cancel();
    } catch (err) {
      logger.warn({ err, matchId }, "[mrdoge] odds.subscribe cancel failed");
    }
  }

  const mrdoge = getMrDogeClient();
  for (const matchId of liveMatchIds) {
    if (subsByMatchId.has(matchId)) continue;
    try {
      const sub = await mrdoge.odds.subscribe({
        matchId,
        betTypes: [...MRDOGE_SOCCER_BET_TYPES],
      });
      subsByMatchId.set(matchId, sub);
      oddsByMatchId.set(matchId, sub.snapshot);
      sub.on("odds.upd", (markets) => {
        oddsByMatchId.set(matchId, markets);
      });
      sub.on("closed", ({ reason, message }) => {
        logger.warn({ reason, message, matchId }, "[mrdoge] odds.subscribe closed");
        dropSubscription(matchId);
      });
    } catch (err) {
      logger.warn({ err, matchId }, "[mrdoge] odds.subscribe failed");
    }
  }
}
