// PropLine MMA/boxing — this app's "mma" sport bucket combines UFC and
// boxing under one tab, so both PropLine sport_keys feed the same builder.
// Live: not in PropLine's confirmed near-real-time sport list, but that
// blanket caveat proved wrong for football in this session's earlier
// PropLine work — kept as an honest candidate rather than assumed dead.
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

export const PROPLINE_MMA_SPORT_KEYS = ["mma_ufc", "boxing"];

export function extractProplineMmaOdds(bookmakers: ProplineEvent["bookmakers"], home: string, away: string) {
  return extractProplineH2HOdds(bookmakers, home, away, false);
}

export type ProplineMmaLeagueOdds = { sportKey: string; events: ProplineEvent[] };

export async function proplineFetchMmaOddsAllLeagues(): Promise<ProplineMmaLeagueOdds[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_MMA_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getOdds(sportKey, { markets: ["h2h"], oddsFormat: "decimal" }).catch(() => []),
    })),
  );
}

export type ProplineMmaLeagueScores = { sportKey: string; events: ProplineScore[] };

export async function proplineFetchMmaLiveAllLeagues(): Promise<ProplineMmaLeagueScores[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_MMA_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getScores(sportKey, { daysFrom: 1 }).catch(() => [] as ProplineScore[]),
    })),
  );
}
