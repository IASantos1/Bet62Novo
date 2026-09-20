// Mr. Doge live-match state — ONE WebSocket subscription (matches.subscribeLive)
// covers every live match across every sport listed below, pushing deltas as
// they happen (match.upd/match.del). This replaces the old REST-poll-per-tick
// pattern every prior provider in this codebase used: the SDK's own
// reconnect/resubscribe logic (see @mrdoge/node's docs) keeps this map fresh
// without routes/matches.ts's poll loop doing anything beyond reading it.
//
// Football only for now (see lib/config.ts's MRDOGE_API_KEY comment) — add a
// sport to MRDOGE_LIVE_SPORTS once its stats-mapping + odds are wired in
// routes/matches.ts; the subscription itself needs no other change.
import { getMrDogeClient } from "./client.js";
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { Match, Subscription } from "@mrdoge/node";

const MRDOGE_LIVE_SPORTS: string[] = ["soccer"];

const liveMatchesById = new Map<string, Match>();
let subscription: Subscription<"matches.subscribeLive"> | null = null;
let starting = false;

export function getMrDogeLiveMatches(): Match[] {
  return [...liveMatchesById.values()];
}

/** Idempotent — safe to call on every server-startup tick/retry timer. No-ops
 * once a subscription is already active or in the middle of starting. */
export async function startMrDogeLiveSync(): Promise<void> {
  if (!CONFIG.MRDOGE_API_KEY || subscription || starting) return;
  starting = true;
  try {
    const mrdoge = getMrDogeClient();
    const sub = await mrdoge.matches.subscribeLive({ sports: MRDOGE_LIVE_SPORTS });
    liveMatchesById.clear();
    for (const m of sub.snapshot) liveMatchesById.set(m.id, m);
    sub.on("match.upd", (match) => {
      liveMatchesById.set(match.id, match);
    });
    sub.on("match.del", ({ id }) => {
      liveMatchesById.delete(id);
    });
    sub.on("snapshot", (snapshot) => {
      liveMatchesById.clear();
      for (const m of snapshot) liveMatchesById.set(m.id, m);
    });
    sub.on("closed", ({ reason, message }) => {
      logger.warn({ reason, message }, "[mrdoge] matches.subscribeLive closed — will retry on next tick");
      liveMatchesById.clear();
      subscription = null;
    });
    subscription = sub;
    logger.info({ count: sub.snapshot.length, sports: MRDOGE_LIVE_SPORTS }, "[mrdoge] matches.subscribeLive started");
  } catch (err) {
    logger.error({ err }, "[mrdoge] matches.subscribeLive failed to start — will retry on next tick");
  } finally {
    starting = false;
  }
}
