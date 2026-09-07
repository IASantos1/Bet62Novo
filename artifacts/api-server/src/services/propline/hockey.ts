// PropLine hockey (NHL) — same shared fetch/cache/extract as football.ts
// (see common.ts). NHL is one of the sports PropLine's own docs confirm
// gets near-real-time (~90s) score updates during play, so live is built
// with the same confidence as pré-jogo here.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, getPropLineScores, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent, PropLineScoreEvent } from "./common.js";

export const PROPLINE_HOCKEY_SPORT_KEYS = ["hockey_nhl"];

export const PROPLINE_HOCKEY_LEAGUE_TITLES: Record<string, string> = {
  hockey_nhl: "NHL",
};

export function extractPropLineHockeyOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export type PropLineHockeyLeagueOdds = { sportKey: string; events: PropLineEvent[] };

export async function getPropLineHockeyOddsAllLeagues(): Promise<PropLineHockeyLeagueOdds[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_HOCKEY_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineOdds(sportKey),
    })),
  );
}

export type PropLineHockeyLeagueScores = { sportKey: string; events: PropLineScoreEvent[] };

export async function getPropLineHockeyLiveAllLeagues(): Promise<PropLineHockeyLeagueScores[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const perLeague = await Promise.all(
    PROPLINE_HOCKEY_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineScores(sportKey),
    })),
  );
  return perLeague.map(({ sportKey, events }) => ({
    sportKey,
    events: events.filter((e) => e.status === "in_progress"),
  }));
}
