// PropLine basketball — NBA/WNBA/NCAAB, real 1X2 (moneyline) odds + live
// scores. Basketball IS one of the sports PropLine's own docs confirm gets
// near-real-time (~90s) score updates during play (MLB, WNBA, NFL, NCAAF,
// NBA, NHL), so live is built with the same confidence as pré-jogo here.
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

export const PROPLINE_BASKETBALL_SPORT_KEYS = ["basketball_nba", "basketball_wnba", "basketball_ncaab"];

export const PROPLINE_BASKETBALL_LEAGUE_TITLES: Record<string, string> = {
  basketball_nba: "NBA",
  basketball_wnba: "WNBA",
  basketball_ncaab: "NCAAB",
};

export function extractProplineBasketballOdds(bookmakers: ProplineEvent["bookmakers"], home: string, away: string) {
  return extractProplineH2HOdds(bookmakers, home, away, false);
}

export type ProplineBasketballLeagueOdds = { sportKey: string; events: ProplineEvent[] };

export async function proplineFetchBasketballOddsAllLeagues(): Promise<ProplineBasketballLeagueOdds[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASKETBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getOdds(sportKey, { markets: ["h2h"], oddsFormat: "decimal" }).catch(() => []),
    })),
  );
}

/** Same fetch, scoped to a single period market via PropLine's documented
 * `?period=` filter ("q1" 1st quarter, "h1" 1st half) — a separate request
 * per PropLine's API design (it prices each segment as its own market, not
 * a field on the full-match odds response). Feeds
 * basketballExtra.q1/firstHalf with real bookmaker prices in place of the
 * synthetic Poisson-derived fallback. */
export async function proplineFetchBasketballPeriodOddsAllLeagues(
  period: "q1" | "h1",
): Promise<ProplineBasketballLeagueOdds[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASKETBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getOdds(sportKey, { markets: ["h2h"], oddsFormat: "decimal", period }).catch(() => []),
    })),
  );
}

export type ProplineBasketballLeagueScores = { sportKey: string; events: ProplineScore[] };

export async function proplineFetchBasketballLiveAllLeagues(): Promise<ProplineBasketballLeagueScores[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASKETBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getScores(sportKey, { daysFrom: 1 }).catch(() => [] as ProplineScore[]),
    })),
  );
}
