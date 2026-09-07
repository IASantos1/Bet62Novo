// PropLine baseball (MLB) — same shared fetch/cache/extract as football.ts
// (see common.ts). MLB is CONFIRMED live-capable with a real sample seen
// during this integration (2026-09-07): a genuine in-progress Padres vs
// Nationals game, real home_score/away_score updating live, period "Bot
// 3rd" — the strongest live-data confirmation of any PropLine sport tried.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, getPropLineScores, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent, PropLineScoreEvent } from "./common.js";

export const PROPLINE_BASEBALL_SPORT_KEYS = ["baseball_mlb"];

export const PROPLINE_BASEBALL_LEAGUE_TITLES: Record<string, string> = {
  baseball_mlb: "MLB",
};

export function extractPropLineBaseballOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export type PropLineBaseballLeagueOdds = { sportKey: string; events: PropLineEvent[] };

export async function getPropLineBaseballOddsAllLeagues(): Promise<PropLineBaseballLeagueOdds[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASEBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineOdds(sportKey),
    })),
  );
}

export type PropLineBaseballLeagueScores = { sportKey: string; events: PropLineScoreEvent[] };

export async function getPropLineBaseballLiveAllLeagues(): Promise<PropLineBaseballLeagueScores[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const perLeague = await Promise.all(
    PROPLINE_BASEBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineScores(sportKey),
    })),
  );
  return perLeague.map(({ sportKey, events }) => ({
    sportKey,
    events: events.filter((e) => e.status === "in_progress"),
  }));
}
