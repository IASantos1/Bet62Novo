// PropLine darts — real moneyline (player1/player2, no draw) odds + live
// scores. Single sport key ("darts", confirmed listed in PropLine's own
// enabled-sports documentation — see .env.example's PROPLINE_ENABLED_SPORTS
// comment).
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

export const PROPLINE_DARTS_SPORT_KEY = "darts";

export function extractProplineDartsOdds(bookmakers: ProplineEvent["bookmakers"], player1: string, player2: string) {
  return extractProplineH2HOdds(bookmakers, player1, player2, false);
}

export async function proplineFetchDartsOdds(): Promise<ProplineEvent[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return propline.getOdds(PROPLINE_DARTS_SPORT_KEY, { markets: ["h2h"], oddsFormat: "decimal" }).catch(() => []);
}

export async function proplineFetchDartsLive(): Promise<ProplineScore[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return propline.getScores(PROPLINE_DARTS_SPORT_KEY, { daysFrom: 1 }).catch(() => [] as ProplineScore[]);
}
