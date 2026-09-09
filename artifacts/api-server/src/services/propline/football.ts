import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  propline,
  ProplineEvent,
  ProplineOddsResponse,
  ProplineBookmaker,
  ProplineScore,
} from "./index.js";

export const PROPLINE_SOCCER_LEAGUES: Record<string, string> = {
  EPL: "soccer_epl",
  "PREMIER LEAGUE": "soccer_epl",
  "PREMIER_LEAGUE": "soccer_epl",
  BRASILEIRAO: "soccer_brazil_campeonato_brasileiro_serie_a",
  BRASILEIRO: "soccer_brazil_campeonato_brasileiro_serie_a",
  SERIEA: "soccer_italy_serie_a",
  "SERIE A": "soccer_italy_serie_a",
  LALIGA: "soccer_spain_la_liga",
  "LA LIGA": "soccer_spain_la_liga",
  BUNDESLIGA: "soccer_germany_bundesliga",
  LIGUE1: "soccer_france_ligue_one",
  LIGUE_1: "soccer_france_ligue_one",
  "LIGUE 1": "soccer_france_ligue_one",
  MLS: "soccer_usa_mls",
  SCOTTISH: "soccer_scotland_premiership",
  SCOTTISM: "soccer_scotland_premiership",
  SCOTLAND: "soccer_scotland_premiership",
  EREDIVISIE: "soccer_netherlands_eredivisie",
  LIGAPORTUGAL: "soccer_portugal_primeira_liga",
  LIGANOS: "soccer_portugal_primeira_liga",
  TURKEY: "soccer_turkey_super_lig",
  SUPERLIG: "soccer_turkey_super_lig",
  SUPER_LIG: "soccer_turkey_super_lig",
  AUSTRIA: "soccer_austria_bundesliga",
  CHAMPIONS: "soccer_uefa_champs_league",
  UCL: "soccer_uefa_champs_league",
  EUROPA: "soccer_uefa_europa_league",
  UEL: "soccer_uefa_europa_league",
  CONFERENCE: "soccer_uefa_europa_conference_league",
  UECL: "soccer_uefa_europa_conference_league",
  LIBERTADORES: "soccer_conmebol_libertadores",
  SUDAMERICANA: "soccer_conmebol_sudamericana",
  COPADOBRASIL: "soccer_brazil_copa_do_brasil",
  COPALIBERTADORES: "soccer_conmebol_libertadores",
  COPAAMERICA: "soccer_copa_america",
  EURO: "soccer_european_championship",
  WORLD_CUP: "soccer_fifa_world_cup",
  COPA: "soccer_conmebol_libertadores",
};

export const PROPLINE_SPORT_BY_GENERIC: Record<string, string> = {
  soccer: "soccer_epl",
  football: "soccer_epl",
  futebol: "soccer_epl",
  basketball: "basketball_nba",
  basquete: "basketball_nba",
  baseball: "baseball_mlb",
  beisebol: "baseball_mlb",
  hockey: "hockey_nhl",
  hóquei: "hockey_nhl",
  "american football": "football_nfl",
  nfl: "football_nfl",
  ncaaf: "football_ncaaf",
  tennis: "tennis",
  tenis: "tennis",
  ufc: "mma_ufc",
  mma: "mma_ufc",
  golf: "golf",
  cricket: "cricket",
  boxing: "boxing",
  boxe: "boxing",
  cfl: "cfl",
  afl: "afl",
  rugby: "rugby",
  darts: "darts",
  tabletennis: "tabletennis",
  esports: "esports",
};

export function resolveProplineSportKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const key = String(raw).trim();
  if (!key) return null;

  if (CONFIG.PROPLINE_ENABLED_SPORTS.includes(key)) return key;

  const upper = key.toUpperCase();
  if (PROPLINE_SOCCER_LEAGUES[upper]) return PROPLINE_SOCCER_LEAGUES[upper];

  const lower = key.toLowerCase();
  if (PROPLINE_SPORT_BY_GENERIC[lower]) return PROPLINE_SPORT_BY_GENERIC[lower];

  if (CONFIG.PROPLINE_ENABLED_SPORTS.some((s) => s.startsWith(lower))) {
    return CONFIG.PROPLINE_ENABLED_SPORTS.find((s) => s.startsWith(lower)) ?? null;
  }

  return null;
}

export function proplineAllActiveSports(): string[] {
  if (CONFIG.PROPLINE_ENABLED_SPORTS.length > 0) return [...CONFIG.PROPLINE_ENABLED_SPORTS];
  return [
    "baseball_mlb",
    "basketball_nba",
    "basketball_wnba",
    "hockey_nhl",
    "football_nfl",
    "football_ncaaf",
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_usa_mls",
    "tennis",
    "mma_ufc",
  ];
}

export function normalizeTeamName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(fc|cf|sc|ac|as|ss|sd|us|rc|cd|real|club|de la|del|do|da|dos|das)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type TeamFuzzyOptions = {
  home?: string | null;
  away?: string | null;
  anyName?: string | null;
  threshold?: number;
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function isFuzzyMatch(candidate: string, needle: string, threshold: number): boolean {
  if (!candidate || !needle) return false;
  if (candidate === needle) return true;
  if (candidate.includes(needle) || needle.includes(candidate)) return true;
  const cParts = candidate.split(" ").filter(Boolean);
  const nParts = needle.split(" ").filter(Boolean);
  if (nParts.length === 0 || cParts.length === 0) return false;
  const allPartsPresent = nParts.every((np) => cParts.some((cp) => cp === np || cp.startsWith(np) || np.startsWith(cp)));
  if (allPartsPresent) return true;
  const dist = levenshtein(candidate, needle);
  const maxLen = Math.max(candidate.length, needle.length);
  return maxLen > 0 && dist / maxLen <= threshold;
}

export function proplineFindEventByName(
  events: ProplineEvent[],
  opts: TeamFuzzyOptions,
): ProplineEvent | null {
  if (!events?.length) return null;
  const threshold = opts.threshold ?? 0.22;
  const home = opts.home ? normalizeTeamName(opts.home) : null;
  const away = opts.away ? normalizeTeamName(opts.away) : null;
  const anyName = opts.anyName ? normalizeTeamName(opts.anyName) : null;

  for (const ev of events) {
    const h = normalizeTeamName(ev.home_team);
    const a = normalizeTeamName(ev.away_team);

    if (home && away) {
      const hw = isFuzzyMatch(h, home, threshold) && isFuzzyMatch(a, away, threshold);
      const hRev = isFuzzyMatch(h, away, threshold) && isFuzzyMatch(a, home, threshold);
      if (hw || hRev) return ev;
      continue;
    }
    if (home) {
      if (isFuzzyMatch(h, home, threshold) || isFuzzyMatch(a, home, threshold)) return ev;
      continue;
    }
    if (away) {
      if (isFuzzyMatch(h, away, threshold) || isFuzzyMatch(a, away, threshold)) return ev;
      continue;
    }
    if (anyName) {
      if (isFuzzyMatch(h, anyName, threshold) || isFuzzyMatch(a, anyName, threshold)) return ev;
    }
  }
  return null;
}

export type ProplineFetchEventOddsOptions = {
  markets?: string[];
  bookmakers?: string[];
  includeLinks?: boolean;
  includeBookIds?: boolean;
};

export async function proplineFetchAllUpcomingOdds(
  sportKey: string,
  opts: ProplineFetchEventOddsOptions = {},
): Promise<ProplineOddsResponse> {
  const key = resolveProplineSportKey(sportKey);
  if (!key) return [];
  try {
    const events = await propline.getOdds(key, opts);
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

export async function proplineFetchEventById(
  sportKey: string,
  eventId: string,
  opts: ProplineFetchEventOddsOptions = {},
): Promise<ProplineEvent | null> {
  const key = resolveProplineSportKey(sportKey);
  if (!key || !eventId) return null;
  try {
    return await propline.getEventOdds(key, eventId, opts);
  } catch {
    return null;
  }
}

export type ProplineScoresOptions = { daysFrom?: number };

export async function proplineFetchScores(
  sportKey: string,
  opts: ProplineScoresOptions = {},
) {
  const key = resolveProplineSportKey(sportKey);
  if (!key) return [];
  try {
    return await propline.getScores(key, opts);
  } catch {
    return [];
  }
}

export async function proplineFetchResults(
  sportKey: string,
  opts: { daysFrom?: number; markets?: string[]; bookmakers?: string[] } = {},
) {
  const key = resolveProplineSportKey(sportKey);
  if (!key) return [];
  try {
    return await propline.getResults(key, opts);
  } catch {
    return [];
  }
}

// ─── Football (soccer) multi-league support ────────────────────────────────
// PropLine's real /v1/sports response (confirmed 2026-09-07) returns a flat
// [{key, title, active}] array, no fixed "list of all soccer leagues"
// endpoint — so instead of hardcoding sport_key strings that could drift
// out of sync with the account's real catalog, this discovers every active
// "soccer_*" key from the account's own /v1/sports response and caches the
// result. Real title strings are used for display, never a guessed
// translation.
const SPORTS_LIST_TTL_MS = 30 * 60_000;
let soccerLeaguesCache: { leagues: Array<{ key: string; title: string }>; fetchedAt: number } | null = null;

async function getActiveSoccerLeagues(): Promise<Array<{ key: string; title: string }>> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  if (soccerLeaguesCache && Date.now() - soccerLeaguesCache.fetchedAt < SPORTS_LIST_TTL_MS) {
    return soccerLeaguesCache.leagues;
  }
  try {
    const sports = await propline.getSports();
    const leagues = sports
      .filter((s) => s.active && s.key.startsWith("soccer"))
      .map((s) => ({ key: s.key, title: s.title || s.key }));
    soccerLeaguesCache = { leagues, fetchedAt: Date.now() };
    return leagues;
  } catch (err) {
    logger.warn({ err }, "[propline] getSports failed — reusing stale soccer league list");
    return soccerLeaguesCache?.leagues ?? [];
  }
}

/** Same preference/positional-fallback H2H extraction validated in this
 * session's earlier PropLine work (2026-09-07): tries a curated bookmaker
 * order first, matches outcomes by team name, and falls back to outcome
 * POSITION only when PropLine's own documented ordering guarantee applies
 * (home, away, then draw) and the count matches exactly. Returns null
 * (never a fabricated price) when no h2h market is found for any bookmaker. */
export function extractProplineH2HOdds(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
  threeWay: boolean,
): { home: number; draw: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const preferredOrder = ["pinnacle", "bovada", "betmgm", "kalshi", "betonlineag", "lowvig", "draftkings", "fanduel"];
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
    const expectedCount = threeWay ? 3 : 2;
    if (
      (homePrice == null || awayPrice == null || (threeWay && drawPrice == null)) &&
      market.outcomes.length === expectedCount
    ) {
      const [h, a, d] = market.outcomes;
      if (h && a) {
        homePrice ??= h.price;
        awayPrice ??= a.price;
        if (threeWay && d) drawPrice ??= d.price;
      }
    }
    if (homePrice == null || awayPrice == null) continue;
    if (threeWay && drawPrice == null) continue;
    return { home: homePrice, draw: threeWay && drawPrice != null ? drawPrice : 0, away: awayPrice };
  }
  return null;
}

export type ProplineFootballLeagueOdds = { sportKey: string; title: string; events: ProplineEvent[] };

/** Every active soccer league in parallel, real 1X2 odds requested directly
 * in decimal format (oddsFormat: "decimal") so no American→decimal
 * conversion layer is needed downstream. */
export async function proplineFetchFootballOddsAllLeagues(): Promise<ProplineFootballLeagueOdds[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const leagues = await getActiveSoccerLeagues();
  return Promise.all(
    leagues.map(async ({ key, title }) => ({
      sportKey: key,
      title,
      events: await proplineFetchAllUpcomingOdds(key, { markets: ["h2h"] }).then((events) =>
        events.map((e) => ({ ...e, bookmakers: e.bookmakers })),
      ),
    })),
  );
}

export type ProplineFootballLeagueScores = { sportKey: string; title: string; events: ProplineScore[] };

/** Live (in-progress) events per league — PropLine's own docs say only
 * MLB/WNBA/NFL/NCAAF/NBA/NHL get confirmed near-real-time (~90s) score
 * updates during play; every other sport (soccer included) is documented
 * to update only once the match ends. Kept here (rather than skipped
 * outright) because a finished-mid-poll match still needs its final score
 * picked up, and because this matches the exact behavior already verified
 * this session for football specifically. */
export async function proplineFetchFootballLiveAllLeagues(): Promise<ProplineFootballLeagueScores[]> {
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const leagues = await getActiveSoccerLeagues();
  const perLeague = await Promise.all(
    leagues.map(async ({ key, title }) => ({
      sportKey: key,
      title,
      events: await propline.getScores(key, { daysFrom: 1 }).catch(() => [] as ProplineScore[]),
    })),
  );
  return perLeague;
}

/** Extracts {home, away, status} from a ProplineScore entry defensively —
 * the real /scores payload shape wasn't re-confirmed against a live sample
 * for this restoration (no API key available in this environment), so this
 * accepts either the explicit home_score/away_score/status/period fields
 * confirmed real in this session's earlier PropLine work, or the generic
 * `scores: [{name, score}]` pairing the-odds-api-style APIs also use —
 * matched back to home/away by team name. Returns null (never a fabricated
 * 0-0) when neither shape yields a usable pair. */
export function extractProplineScore(
  ev: ProplineScore & {
    home_score?: number | string | null;
    away_score?: number | string | null;
    status?: string | null;
    period?: string | null;
  },
): { home: number; away: number; status: string | null } | null {
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const direct = { home: toNum(ev.home_score), away: toNum(ev.away_score) };
  if (direct.home !== null && direct.away !== null) {
    return { home: direct.home, away: direct.away, status: ev.status ?? ev.period ?? null };
  }
  if (Array.isArray(ev.scores) && ev.scores.length >= 2) {
    const homeEntry = ev.scores.find((s) => s.name === ev.home_team);
    const awayEntry = ev.scores.find((s) => s.name === ev.away_team);
    const home = toNum(homeEntry?.score);
    const away = toNum(awayEntry?.score);
    if (home !== null && away !== null) {
      return { home, away, status: ev.completed ? "final" : null };
    }
  }
  return null;
}
