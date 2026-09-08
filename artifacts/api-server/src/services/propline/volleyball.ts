// PropLine volleyball — same shared fetch/cache/extract as football.ts
// (see common.ts). Single global "volleyball" sport_key (no per-league
// breakdown).
//
// Live: same "not in PropLine's confirmed near-real-time list" caveat as
// tennis/football — added anyway as a tri-fallback candidate since that
// caveat already proved unreliable for football (see tennis.ts's header).
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, getPropLineScores, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent, PropLineScoreEvent } from "./common.js";

export const PROPLINE_VOLLEYBALL_SPORT_KEYS = ["volleyball"];

export function extractPropLineVolleyballOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export async function getPropLineVolleyballOdds(): Promise<PropLineEvent[]> {
  return getPropLineOdds("volleyball");
}

export async function getPropLineVolleyballLive(): Promise<PropLineScoreEvent[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const events = await getPropLineScores("volleyball");
  return events.filter((e) => e.status === "in_progress");
}
