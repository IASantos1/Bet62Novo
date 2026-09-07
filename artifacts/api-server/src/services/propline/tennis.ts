// PropLine tennis — same shared fetch/cache/extract as football.ts (see
// common.ts). PropLine covers ATP/WTA/ITF/Challenger under one single
// "tennis" sport_key (its own docs: aliases like "tennis_atp" 404 with
// `not_equivalent: true` pointing back at this one key). No live builder
// yet — tennis isn't in PropLine's confirmed near-real-time sport list
// (only MLB/WNBA/NFL/NCAAF/NBA/NHL are), same caveat as football.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent } from "./common.js";

export const PROPLINE_TENNIS_SPORT_KEYS = ["tennis"];

export function extractPropLineTennisOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export async function getPropLineTennisOdds(): Promise<PropLineEvent[]> {
  return getPropLineOdds("tennis");
}
