// PropLine volleyball — same shared fetch/cache/extract as football.ts
// (see common.ts). Single global "volleyball" sport_key (no per-league
// breakdown). No live builder yet — volleyball isn't in PropLine's
// confirmed near-real-time sport list, same caveat as football/tennis.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent } from "./common.js";

export const PROPLINE_VOLLEYBALL_SPORT_KEYS = ["volleyball"];

export function extractPropLineVolleyballOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export async function getPropLineVolleyballOdds(): Promise<PropLineEvent[]> {
  return getPropLineOdds("volleyball");
}
