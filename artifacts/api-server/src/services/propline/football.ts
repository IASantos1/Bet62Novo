// PropLine football (soccer) — one /odds call per league returns every
// upcoming AND live event for that league (each event carries its own
// `live` boolean), bookmakers embedded. Every shape below is confirmed
// against a REAL response fetched through the debug route (2026-09-07).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { propLineGet, americanToDecimal } from "./client.js";

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

export type PropLineOutcome = {
  name: string;
  description: string;
  price: number; // American odds — always, confirmed real
  point: number | null;
  book_updated_at?: string | null;
  last_change_at?: string;
  last_seen_at?: string;
  payout_multiplier?: number | null;
  dfs_odds_type?: "standard" | "goblin" | "demon" | null;
};

export type PropLineMarket = {
  key: string; // "h2h" | "spreads" | "totals" | ...
  description?: string;
  team?: string | null;
  last_update: string;
  suspended_at?: string | null;
  outcomes: PropLineOutcome[];
};

export type PropLineBookmaker = {
  key: string;
  title: string;
  markets: PropLineMarket[];
};

export type PropLineEvent = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  home_team_key?: string | null;
  away_team_key?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  commence_time: string;
  live: boolean;
  last_update?: string;
  merged_from_event_ids?: string[] | null;
  // Null on /events (no odds there); populated on /odds. Confirmed real:
  // an event can have zero bookmakers too (line not open yet).
  bookmakers: PropLineBookmaker[] | null;
};

const ODDS_TTL_MS = 90 * 1000;
const oddsCache = new Map<string, { events: PropLineEvent[]; fetchedAt: number }>();
const oddsInFlight = new Map<string, Promise<PropLineEvent[]>>();

/** GET /v1/sports/{sportKey}/odds?markets=h2h,spreads,totals — every event
 * for that league, upcoming AND live together (see `live` per event). 90s
 * cache: cheap per league (one call), but PROPLINE_FOOTBALL_SPORT_KEYS has
 * 24 entries and the account's real daily quota is still unconfirmed (free
 * tier) — see client.ts's propLineQuota for the live budget read-back. */
export async function getPropLineFootballOdds(sportKey: string): Promise<PropLineEvent[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const now = Date.now();
  const cached = oddsCache.get(sportKey);
  if (cached && now - cached.fetchedAt < ODDS_TTL_MS) return cached.events;
  const inFlight = oddsInFlight.get(sportKey);
  if (inFlight) return inFlight;
  const promise = propLineGet<PropLineEvent[]>(`/sports/${sportKey}/odds`, {
    markets: "h2h,spreads,totals",
  })
    .then((events) => {
      oddsCache.set(sportKey, { events: events ?? [], fetchedAt: Date.now() });
      return events ?? [];
    })
    .catch((err) => {
      logger.warn({ err, sportKey }, "[propline] football odds fetch failed");
      return oddsCache.get(sportKey)?.events ?? [];
    })
    .finally(() => {
      oddsInFlight.delete(sportKey);
    });
  oddsInFlight.set(sportKey, promise);
  return promise;
}

// GET /v1/sports/{sportKey}/scores?days_from=N — free tier, no markets
// involved. Confirmed real shape (2026-09-07, tested against baseball_mlb
// AND soccer_epl): {id, sport_key, home_team, away_team, commence_time,
// live, status: "upcoming"|"in_progress"|"final", home_score, away_score,
// period}. For MLB, a real in-progress sample showed home_score/away_score
// populated live and period as a human string ("Bot 3rd") — confirmed
// updating in real time. No in-progress soccer sample has been seen yet
// (nothing was live at test time) — the schema is identical and finished
// soccer games do carry a real final score, but whether `period` (or the
// score itself) actually updates mid-match for soccer specifically is
// UNCONFIRMED; PropLine's own docs hedge this ("outros esportes atualizam
// as estatísticas quando o jogo termina"). Treated defensively below: the
// raw `period` string is shown as-is, never parsed into a minute.
export type PropLineScoreEvent = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  live: boolean;
  status: "upcoming" | "in_progress" | "final" | string;
  home_score: number | null;
  away_score: number | null;
  period: string | null;
};

const SCORES_TTL_MS = 30 * 1000;
const scoresCache = new Map<string, { events: PropLineScoreEvent[]; fetchedAt: number }>();
const scoresInFlight = new Map<string, Promise<PropLineScoreEvent[]>>();

export async function getPropLineFootballScores(sportKey: string): Promise<PropLineScoreEvent[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const now = Date.now();
  const cached = scoresCache.get(sportKey);
  if (cached && now - cached.fetchedAt < SCORES_TTL_MS) return cached.events;
  const inFlight = scoresInFlight.get(sportKey);
  if (inFlight) return inFlight;
  const promise = propLineGet<PropLineScoreEvent[]>(`/sports/${sportKey}/scores`, {
    days_from: 1,
  })
    .then((events) => {
      scoresCache.set(sportKey, { events: events ?? [], fetchedAt: Date.now() });
      return events ?? [];
    })
    .catch((err) => {
      logger.warn({ err, sportKey }, "[propline] football scores fetch failed");
      return scoresCache.get(sportKey)?.events ?? [];
    })
    .finally(() => {
      scoresInFlight.delete(sportKey);
    });
  scoresInFlight.set(sportKey, promise);
  return promise;
}

export type PropLineFootballLeagueScores = { sportKey: string; events: PropLineScoreEvent[] };

export async function getPropLineFootballLiveAllLeagues(): Promise<PropLineFootballLeagueScores[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const perLeague = await Promise.all(
    PROPLINE_FOOTBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineFootballScores(sportKey),
    })),
  );
  return perLeague.map(({ sportKey, events }) => ({
    sportKey,
    events: events.filter((e) => e.status === "in_progress"),
  }));
}

export type PropLineFootballLeagueOdds = { sportKey: string; events: PropLineEvent[] };

/** Fetches every curated league in parallel. Each returned event still
 * carries its own sport_key so callers can look up the league title. */
export async function getPropLineFootballOddsAllLeagues(): Promise<PropLineFootballLeagueOdds[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_FOOTBALL_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineFootballOdds(sportKey),
    })),
  );
}

export type PropLineResultOdds = { home: number; draw: number; away: number };

/** Extracts real 1X2 (h2h market) decimal odds, picking the sharpest
 * available book (Pinnacle first — confirmed present and real for
 * soccer_brasileirao — falling back to whichever real book quoted all 3
 * sides). Only returns a result when all three sides are present, same
 * "never mix real with fake Poisson" rule as every other provider here. */
export function extractPropLineResultOdds(
  bookmakers: PropLineBookmaker[] | null,
  home: string,
  away: string,
): PropLineResultOdds | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const preferredOrder = ["pinnacle", "bovada", "betmgm", "kalshi", "betonlineag", "lowvig"];
  const ordered = [...bookmakers].sort((a, b) => {
    const ai = preferredOrder.indexOf(a.key);
    const bi = preferredOrder.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const bm of ordered) {
    const market = bm.markets.find((m) => m.key === "h2h");
    if (!market) continue;
    let homePrice: number | null = null;
    let awayPrice: number | null = null;
    let drawPrice: number | null = null;
    for (const o of market.outcomes) {
      const name = (o.name || "").toLowerCase();
      if (name === "draw") drawPrice = o.price;
      else if (name === home.toLowerCase() || o.name === home) homePrice = o.price;
      else if (name === away.toLowerCase() || o.name === away) awayPrice = o.price;
    }
    // Team-name matching can miss on a spelling mismatch between PropLine's
    // event-level name and a book's own outcome name (documented real
    // behavior — books write their own spelling) — positional fallback:
    // h2h outcomes are ordered home, away, draw per PropLine's own
    // documented ordering guarantee ("Mercados de equipes — primeiro em
    // casa, depois fora e, por fim, empate").
    if ((homePrice == null || awayPrice == null || drawPrice == null) && market.outcomes.length === 3) {
      const [h, a, d] = market.outcomes;
      if (h && a && d) {
        homePrice ??= h.price;
        awayPrice ??= a.price;
        drawPrice ??= d.price;
      }
    }
    if (homePrice == null || awayPrice == null || drawPrice == null) continue;
    return {
      home: americanToDecimal(homePrice),
      draw: americanToDecimal(drawPrice),
      away: americanToDecimal(awayPrice),
    };
  }
  return null;
}
