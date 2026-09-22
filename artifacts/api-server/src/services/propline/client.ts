import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { JsonRecord } from "../goal/client.js";

const cache = new Map<string, { expiresAt: number; value: unknown }>();
let missingKeyLogged = false;

type PropLineSport = { key: string; title: string; active: boolean };
const FOOTBALL_MARKETS =
  "h2h,spreads,totals,double_chance,draw_no_bet,correct_score,btts,h2h_h1,totals_h1,spreads_h1,team_totals";

function marketsForSportKey(sportKey: string): string {
  return sportKey.startsWith("soccer_")
    ? FOOTBALL_MARKETS
    : "h2h,spreads,totals";
}

const SPORT_KEY_PRIORITY: Record<string, string[]> = {
  football: [
    "soccer_epl",
    "soccer_la_liga",
    "soccer_serie_a",
    "soccer_bundesliga",
    "soccer_ligue_1",
    "soccer_primeira_liga",
    "soccer_brasileirao",
    "soccer_argentina_primera",
    "soccer_uefa_champions_league",
    "soccer_uefa_europa_league",
  ],
  basketball: ["basketball_nba", "basketball_wnba", "basketball_ncaab", "basketball_euroleague"],
  tennis: ["tennis"],
  baseball: ["baseball_mlb"],
  hockey: ["hockey_nhl"],
  mma: ["mma_ufc"],
  boxing: ["boxing"],
  cricket: ["cricket"],
  "table-tennis": ["table_tennis"],
  snooker: ["snooker"],
  amfootball: ["football_nfl", "football_ncaaf", "football_cfl"],
  darts: ["darts"],
  volleyball: ["volleyball"],
};

function urlFor(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.replace(/^\/+/, ""), `${CONFIG.PROPLINE_BASE_URL.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestPropLine(path: string, query: Record<string, string | number | boolean | undefined> = {}, ttlMs = 0): Promise<unknown> {
  if (!CONFIG.PROPLINE_API_KEY) {
    if (!missingKeyLogged) {
      logger.warn("[propline] PROPLINE_API_KEY not set — odds integration is disabled");
      missingKeyLogged = true;
    }
    return null;
  }
  const url = urlFor(path, query);
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.SPORTS_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "X-API-Key": CONFIG.PROPLINE_API_KEY, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status !== 404) logger.warn({ status: response.status, path }, "[propline] request failed");
      return null;
    }
    const value = await response.json();
    if (ttlMs > 0) cache.set(url, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (err) {
    logger.warn({ err, path }, "[propline] request error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function propLineEnabled(): boolean {
  return Boolean(CONFIG.PROPLINE_API_KEY);
}

export async function getPropLineEvents(options: {
  sport?: string;
  live?: boolean;
  from?: string;
  to?: string;
} = {}): Promise<unknown> {
  return getPropLineBoard(options);
}

export async function getPropLineOdds(eventId: string, sportKey: string): Promise<unknown> {
  const id = encodeURIComponent(eventId);
  return requestPropLine(
    `/v1/sports/${encodeURIComponent(sportKey)}/events/${id}/odds`,
    { markets: marketsForSportKey(sportKey) },
    CONFIG.SPORTS_API_ODDS_CACHE_MS,
  );
}

async function getSports(): Promise<PropLineSport[]> {
  const raw = await requestPropLine("/v1/sports", {}, 15 * 60_000);
  return unwrapPropLine(raw)
    .map((item) => ({
      key: String(item["key"] ?? ""),
      title: String(item["title"] ?? ""),
      active: item["active"] !== false,
    }))
    .filter((sport) => sport.key && sport.active);
}

function keysForSport(sport: string, available: PropLineSport[]): PropLineSport[] {
  const byKey = new Map(available.map((item) => [item.key, item]));
  const selected = (SPORT_KEY_PRIORITY[sport] ?? [sport])
    .map((key) => byKey.get(key))
    .filter((item): item is PropLineSport => Boolean(item));
  if (sport === "football") {
    const remaining = available.filter(
      (item) =>
        item.key.startsWith("soccer_") &&
        !selected.some((priority) => priority.key === item.key),
    );
    return [...selected, ...remaining];
  }
  if (selected.length) return selected;
  const prefix = sport === "football" ? "soccer_" : `${sport}_`;
  return available
    .filter((item) => item.key === sport || item.key.startsWith(prefix))
    .slice(0, 10);
}

export async function getPropLineBoard(options: {
  sport?: string;
  live?: boolean;
  from?: string;
  to?: string;
} = {}): Promise<unknown> {
  const sports = keysForSport(options.sport ?? "", await getSports());
  const ttl = options.live
    ? Math.max(CONFIG.SPORTS_API_ODDS_CACHE_MS, 15_000)
    : 5 * 60_000;
  const boards = await Promise.all(
    sports.map(async (sport) => {
      const raw = await requestPropLine(
        `/v1/sports/${encodeURIComponent(sport.key)}/odds`,
        { markets: marketsForSportKey(sport.key) },
        ttl,
      );
      return unwrapPropLine(raw).map((event) => ({
        ...event,
        _propLineSportKey: sport.key,
        _propLineSportTitle: sport.title,
      }));
    }),
  );
  const now = Date.now();
  const from = options.from ? Date.parse(options.from) : Number.NaN;
  const to = options.to ? Date.parse(options.to) : Number.NaN;
  return boards.flat().filter((event) => {
    const isLive = event["live"] === true;
    if (options.live !== undefined && isLive !== options.live) return false;
    const kickoff = Date.parse(String(event["commence_time"] ?? ""));
    if (Number.isFinite(from) && Number.isFinite(kickoff) && kickoff < from) return false;
    if (Number.isFinite(to) && Number.isFinite(kickoff) && kickoff > to) return false;
    if (!options.live && Number.isFinite(kickoff) && kickoff < now - 5 * 60_000) return false;
    return true;
  });
}

export function unwrapPropLine(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"));
  if (!value || typeof value !== "object") return [];
  const root = value as JsonRecord;
  for (const key of ["events", "fixtures", "data", "results", "odds", "markets", "bookmakers", "items"]) {
    const candidate = root[key];
    if (Array.isArray(candidate)) return candidate.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"));
    if (candidate && typeof candidate === "object") {
      const nested = unwrapPropLine(candidate);
      if (nested.length) return nested;
    }
  }
  return [root];
}