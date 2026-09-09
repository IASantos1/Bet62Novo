// PropLine hockey (NHL) — real 1X2 (moneyline) odds + live scores. NHL is
// one of the sports PropLine's own docs confirm gets near-real-time (~90s)
// score updates during play, so live is built with the same confidence as
// pré-jogo here.
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

export const PROPLINE_HOCKEY_SPORT_KEYS = ["hockey_nhl"];

export function extractProplineHockeyOdds(bookmakers: ProplineEvent["bookmakers"], home: string, away: string) {
  return extractProplineH2HOdds(bookmakers, home, away, false);
}

export type ProplineHockeyLeagueOdds = { sportKey: string; events: ProplineEvent[] };

export async function proplineFetchHockeyOddsAllLeagues(): Promise<ProplineHockeyLeagueOdds[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_HOCKEY_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getOdds(sportKey, { markets: ["h2h"], oddsFormat: "decimal" }).catch(() => []),
    })),
  );
}

export type ProplineHockeyLeagueScores = { sportKey: string; events: ProplineScore[] };

export async function proplineFetchHockeyLiveAllLeagues(): Promise<ProplineHockeyLeagueScores[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_HOCKEY_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getScores(sportKey, { daysFrom: 1 }).catch(() => [] as ProplineScore[]),
    })),
  );
}
