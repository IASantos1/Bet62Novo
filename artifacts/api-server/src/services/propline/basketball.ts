// PropLine basketball — same shared fetch/cache/extract as football.ts
// (see common.ts). Basketball IS one of the sports PropLine's own docs
// confirm gets near-real-time (~90s) score updates during play (MLB, WNBA,
// NFL, NCAAF, NBA, NHL), so live is built with the same confidence as
// pré-jogo here — unlike football/tennis/volleyball/mma.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, getPropLineScores, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent, PropLineScoreEvent } from "./common.js";

export const PROPLINE_BASKETBALL_SPORT_KEYS = ["basketball_nba", "basketball_wnba", "basketball_ncaab"];

export const PROPLINE_BASKETBALL_LEAGUE_TITLES: Record<string, string> = {
  basketball_nba: "NBA",
  basketball_wnba: "WNBA",
  basketball_ncaab: "NCAAB",
};

export function extractPropLineBasketballOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export type PropLineBasketballLeagueOdds = { sportKey: string; events: PropLineEvent[] };

export async function getPropLineBasketballOddsAllLeagues(): Promise<PropLineBasketballLeagueOdds[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASKETBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineOdds(sportKey),
    })),
  );
}

export type PropLineBasketballLeagueScores = { sportKey: string; events: PropLineScoreEvent[] };

export async function getPropLineBasketballLiveAllLeagues(): Promise<PropLineBasketballLeagueScores[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const perLeague = await Promise.all(
    PROPLINE_BASKETBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineScores(sportKey),
    })),
  );
  return perLeague.map(({ sportKey, events }) => ({
    sportKey,
    events: events.filter((e) => e.status === "in_progress"),
  }));
}
