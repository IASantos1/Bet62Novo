// PropLine tennis — same shared fetch/cache/extract as football.ts (see
// common.ts). PropLine covers ATP/WTA/ITF/Challenger under one single
// "tennis" sport_key (its own docs: aliases like "tennis_atp" 404 with
// `not_equivalent: true` pointing back at this one key).
//
// Live: tennis isn't in PropLine's own confirmed near-real-time sport list
// (only MLB/WNBA/NFL/NCAAF/NBA/NHL are documented), same caveat football
// had — but that same doc caveat turned out to be WRONG for football
// (confirmed 2026-09-07/08: real in-progress soccer samples DID carry
// live-updating status/period). Built here on the same basis: worth
// trying as a tri-fallback candidate alongside GoalServe/PulseScore rather
// than assuming the docs are right without a real sample to check against.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, getPropLineScores, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent, PropLineScoreEvent } from "./common.js";

export const PROPLINE_TENNIS_SPORT_KEYS = ["tennis"];

export function extractPropLineTennisOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export async function getPropLineTennisOdds(): Promise<PropLineEvent[]> {
  return getPropLineOdds("tennis");
}

export async function getPropLineTennisLive(): Promise<PropLineScoreEvent[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const events = await getPropLineScores("tennis");
  return events.filter((e) => e.status === "in_progress");
}
