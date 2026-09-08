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
  // Confirmed real (2026-09-08, a full /scores sample with dozens of
  // live:true volleyball events): `status` stays "upcoming" forever for
  // this sport — it never transitions to "in_progress" the way it does
  // for tennis/football/basketball/hockey/baseball. Every event in that
  // sample also had home_score/away_score/period null, live:true included,
  // so PropLine currently has no real live scoring data for volleyball at
  // all (its own docs' near-real-time caveat turned out to be correct
  // here, unlike for football). Filtering on live===true + a real score
  // present (not status) is the correct condition going forward if that
  // ever changes — still requires real data, never fabricates a score.
  return events.filter((e) => e.live === true && e.home_score != null && e.away_score != null);
}
