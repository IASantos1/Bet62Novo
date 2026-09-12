// PropLine baseball — MLB, real 1X2 (moneyline) odds + live scores.
// Baseball IS one of the sports PropLine's own docs confirm gets
// near-real-time (~90s) score updates during play (MLB, WNBA, NFL, NCAAF,
// NBA, NHL), same confidence basketball.ts already relies on. .env.example's
// PROPLINE_ENABLED_SPORTS default has always listed baseball_mlb — this
// module was simply never written when basketball/hockey/volleyball were
// restored 2026-09-09, leaving baseball as a permanent dead stub
// (chooseLiveProvider("baseball", []) in routes/matches.ts) even with a
// valid PROPLINE_API_KEY configured.
import { CONFIG } from "../../lib/config.js";
import { propline, ProplineEvent, ProplineScore } from "./index.js";
import { extractProplineH2HOdds } from "./common.js";

export const PROPLINE_BASEBALL_SPORT_KEYS = ["baseball_mlb"];

export const PROPLINE_BASEBALL_LEAGUE_TITLES: Record<string, string> = {
  baseball_mlb: "MLB",
};

export function extractProplineBaseballOdds(bookmakers: ProplineEvent["bookmakers"], home: string, away: string) {
  return extractProplineH2HOdds(bookmakers, home, away, false);
}

export type ProplineBaseballLeagueOdds = { sportKey: string; events: ProplineEvent[] };

export async function proplineFetchBaseballOddsAllLeagues(): Promise<ProplineBaseballLeagueOdds[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASEBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getOdds(sportKey, { markets: ["h2h"], oddsFormat: "decimal" }).catch(() => []),
    })),
  );
}

// F5 (First 5 Innings) real odds via a `?period=` filter, mirroring
// basketball.ts's q1/h1 fetch, is deliberately NOT added here — this
// session has no confirmed real value for that period key against
// PropLine's docs, and guessing one risks silently mis-tagging a request
// (same failure mode already flagged elsewhere this session). mlbExtra.f5*
// keeps using makeMLBMarketsFromTeams's synthetic model until a confirmed
// value is available.

export type ProplineBaseballLeagueScores = { sportKey: string; events: ProplineScore[] };

export async function proplineFetchBaseballLiveAllLeagues(): Promise<ProplineBaseballLeagueScores[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_BASEBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await propline.getScores(sportKey, { daysFrom: 1 }).catch(() => [] as ProplineScore[]),
    })),
  );
}
