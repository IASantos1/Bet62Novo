// PropLine football (soccer) — one /odds call per league returns every
// upcoming AND live event for that league (each event carries its own
// `live` boolean), bookmakers embedded. Every shape is confirmed against a
// REAL response fetched through the debug route (2026-09-07), and this
// provider is the first candidate this session to have real Brasileirão
// Série A coverage (21 real upcoming fixtures, real 1X2 odds from up to 9
// bookmakers per match — see services/propline/common.ts for the shared
// fetch/cache/extract logic every PropLine sport module builds on).
import { CONFIG } from "../../lib/config.js";
import {
  getPropLineOdds,
  getPropLineScores,
  extractPropLineH2HOdds,
  type PropLineEvent,
  type PropLineScoreEvent,
} from "./common.js";

export type { PropLineEvent, PropLineScoreEvent, PropLineBookmaker, PropLineMarket, PropLineOutcome, PropLineResultOdds } from "./common.js";

// Confirmed real via GET /v1/sports (2026-09-07) — every soccer_* key that
// account returned, prioritized the same way BET365SOFT_FOOTBALL_LEAGUE_IDS
// used to be: major continental/domestic competitions worth showing.
// Unlike every earlier provider tried this session, soccer_brasileirao
// (Brazil's own Série A) IS in this list — confirmed with 21 real upcoming
// fixtures and real 1X2 odds from up to 9 bookmakers per match.
export const PROPLINE_FOOTBALL_SPORT_KEYS = [
  "soccer_uefa_champions_league",
  "soccer_uefa_europa_league",
  "soccer_uefa_conference_league",
  "soccer_copa_libertadores",
  "soccer_copa_sudamericana",
  "soccer_brasileirao",
  "soccer_epl",
  "soccer_championship",
  "soccer_la_liga",
  "soccer_serie_a",
  "soccer_bundesliga",
  "soccer_ligue_1",
  "soccer_eredivisie",
  "soccer_primeira_liga",
  "soccer_turkey_super_lig",
  "soccer_argentina_primera",
  "soccer_saudi_pro",
  "soccer_mls",
  "soccer_liga_mx",
  "soccer_japan_j_league",
  "soccer_scottish_premiership",
  "soccer_belgium_pro_league",
  "soccer_a_league",
  "soccer_fifa_world_cup",
];

// Display names for the league string shown to the user — PropLine's own
// `title` field from /v1/sports (real, confirmed) rather than guessing a
// translation.
export const PROPLINE_FOOTBALL_LEAGUE_TITLES: Record<string, string> = {
  soccer_uefa_champions_league: "UEFA Champions League",
  soccer_uefa_europa_league: "UEFA Europa League",
  soccer_uefa_conference_league: "UEFA Conference League",
  soccer_copa_libertadores: "Copa Libertadores",
  soccer_copa_sudamericana: "Copa Sudamericana",
  soccer_brasileirao: "Brasileirão",
  soccer_epl: "Premier League",
  soccer_championship: "Championship",
  soccer_la_liga: "La Liga",
  soccer_serie_a: "Serie A",
  soccer_bundesliga: "Bundesliga",
  soccer_ligue_1: "Ligue 1",
  soccer_eredivisie: "Eredivisie",
  soccer_primeira_liga: "Primeira Liga",
  soccer_turkey_super_lig: "Süper Lig",
  soccer_argentina_primera: "Liga Profesional",
  soccer_saudi_pro: "Saudi Pro League",
  soccer_mls: "MLS",
  soccer_liga_mx: "Liga MX",
  soccer_japan_j_league: "J1 League",
  soccer_scottish_premiership: "Scottish Premiership",
  soccer_belgium_pro_league: "Belgian Pro League",
  soccer_a_league: "A-League",
  soccer_fifa_world_cup: "FIFA World Cup",
};

export function extractPropLineResultOdds(
  bookmakers: PropLineEvent["bookmakers"],
  home: string,
  away: string,
) {
  return extractPropLineH2HOdds(bookmakers, home, away, true);
}

export type PropLineFootballLeagueOdds = { sportKey: string; events: PropLineEvent[] };

export async function getPropLineFootballOdds(sportKey: string): Promise<PropLineEvent[]> {
  return getPropLineOdds(sportKey);
}

/** Fetches every curated league in parallel. Each returned event still
 * carries its own sport_key so callers can look up the league title. */
export async function getPropLineFootballOddsAllLeagues(): Promise<PropLineFootballLeagueOdds[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_FOOTBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineOdds(sportKey),
    })),
  );
}

export type PropLineFootballLeagueScores = { sportKey: string; events: PropLineScoreEvent[] };

/** Live (in_progress) events only, per league — see common.ts's
 * PropLineScoreEvent header for the soccer live-update caveat: confirmed
 * real schema, unconfirmed whether it updates mid-match for soccer. */
export async function getPropLineFootballLiveAllLeagues(): Promise<PropLineFootballLeagueScores[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const perLeague = await Promise.all(
    PROPLINE_FOOTBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineScores(sportKey),
    })),
  );
  return perLeague.map(({ sportKey, events }) => ({
    sportKey,
    events: events.filter((e) => e.status === "in_progress"),
  }));
}
