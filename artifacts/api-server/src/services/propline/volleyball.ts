// PropLine volleyball — single global "volleyball" sport_key (no
// per-league breakdown). Confirmed real 2026-09-08 (this session's earlier
// PropLine work): its own /scores feed for volleyball never actually
// transitions a match's status to "in_progress" and home_score/away_score
// stay null even for live:true events — PropLine's own near-real-time
// caveat turned out to be correct here (unlike football/basketball/hockey).
// Kept wired anyway as an honest candidate: if that ever changes, this
// starts working without needing a rewrite; until then it correctly stays
// empty rather than fabricating a score.
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

const PROPLINE_VOLLEYBALL_SPORT_KEY = "volleyball";

export function extractProplineVolleyballOdds(bookmakers: ProplineEvent["bookmakers"], home: string, away: string) {
  return extractProplineH2HOdds(bookmakers, home, away, false);
}

export async function proplineFetchVolleyballOdds(): Promise<ProplineEvent[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return propline
    .getOdds(PROPLINE_VOLLEYBALL_SPORT_KEY, { markets: ["h2h"], oddsFormat: "decimal" })
    .catch(() => [] as ProplineEvent[]);
}

export async function proplineFetchVolleyballLive(): Promise<ProplineScore[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return propline
    .getScores(PROPLINE_VOLLEYBALL_SPORT_KEY, { daysFrom: 1 })
    .catch(() => [] as ProplineScore[]);
}
