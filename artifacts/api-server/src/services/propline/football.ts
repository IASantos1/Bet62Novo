import { CONFIG } from "../../lib/config.js";
import {
  propline,
  ProplineEvent,
  ProplineOddsResponse,
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

export function isFuzzyMatch(candidate: string, needle: string, threshold: number): boolean {
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
