// PropLine tennis — real moneyline odds + live scores. One sport key
// ("tennis") covers ATP/WTA/ITF/Challenger together per PropLine's own
// docs — never split into tennis_atp/tennis_wta as if they were separate
// sports (see football.ts's PROPLINE_SPORT_BY_GENERIC comment).
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

export const PROPLINE_TENNIS_SPORT_KEY = "tennis";

export function extractProplineTennisOdds(bookmakers: ProplineEvent["bookmakers"], home: string, away: string) {
  return extractProplineH2HOdds(bookmakers, home, away, false);
}

export async function proplineFetchTennisOdds(): Promise<ProplineEvent[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return propline.getOdds(PROPLINE_TENNIS_SPORT_KEY, { markets: ["h2h"], oddsFormat: "decimal" }).catch(() => []);
}

export async function proplineFetchTennisLive(): Promise<ProplineScore[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return propline.getScores(PROPLINE_TENNIS_SPORT_KEY, { daysFrom: 1 }).catch(() => [] as ProplineScore[]);
}
