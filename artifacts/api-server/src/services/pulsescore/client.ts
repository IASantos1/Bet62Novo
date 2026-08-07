// Shared HTTP/WS plumbing for PulseScore (api.pulsescore.net) — a normalized
// odds aggregator that exposes the same flat schema (markets[].canonicalMarket,
// markets[].selections[]) for every bookmaker, only the base path differs.
// bet365 alone uses a versioned path (/api/v3/bet365); every other bookmaker
// is /api/{bookmaker} with no version segment — bookmakerPrefix() below is
// the one place that quirk needs to be known.
import { CONFIG } from "../../lib/config.js";

export function bookmakerPrefix(bookmaker: string = CONFIG.PULSESCORE_BOOKMAKER): string {
  return bookmaker === "bet365" ? "v3/bet365" : bookmaker;
}

export function pulseScoreRestUrl(path: string, bookmaker?: string): string {
  return `${CONFIG.PULSESCORE_BASE_URL}/${bookmakerPrefix(bookmaker)}${path}`;
}

export function pulseScoreWsUrl(sport: string): string {
  const httpBase = CONFIG.PULSESCORE_BASE_URL.replace(/^http/, "ws");
  const key = encodeURIComponent(CONFIG.PULSESCORE_API_KEY);
  return `${httpBase}/${bookmakerPrefix()}/ws/live?key=${key}&sport=${encodeURIComponent(sport)}`;
}

export async function pulseScoreGet<T>(
  path: string,
  timeoutMs = 4000,
  bookmaker?: string,
): Promise<T> {
  const resp = await fetch(pulseScoreRestUrl(path, bookmaker), {
    headers: { "X-Secret": CONFIG.PULSESCORE_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new Error(`[pulsescore] ${resp.status} on ${path}`);
  }
  return (await resp.json()) as T;
}

// ── Normalized schema shared by every bookmaker/sport ───────────────────────
// Verified against a real authenticated GET /live-events?sport=soccer call
// (2026-08-05) — the publicly published docs' example shapes were wrong on
// several fields (a bare array vs. this paginated wrapper; a "H-A" score
// string vs. this {home,away} object; selections' name/decimal vs. this
// canonicalOutcome/odds). Trust this file over the docs for field names.

export type PulseScoreSelection = {
  canonicalOutcome: string; // "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER" | "OTHER" | ...
  rawName: string;
  odds: number;
  isActive: boolean;
  line?: number;
  moreInfo?: Record<string, unknown>;
};

export type PulseScoreMarket = {
  canonicalMarket: string; // seen in real data: "OTHER", "OVER_UNDER", "MATCH_RESULT",
  // "EUROPEAN_HANDICAP", "ASIAN_HANDICAP", "CORNERS_OVER_UNDER", "TO_QUALIFY" — the
  // docs only mention "match_winner"/"total_goals" but those were never observed;
  // identify markets by rawName, not by assuming a specific canonicalMarket value.
  rawName: string;
  period: string; // "FULL_TIME" | "SECOND_HALF" | ... (uppercase snake-case, not the docs' lowercase)
  isActive: boolean;
  selections: PulseScoreSelection[];
  marketId: string;
  // Confirmed real (2026-08-07, GET /tennis/events): a market can carry its
  // own top-level moreInfo distinct from each selection's — e.g. SET_BETTING
  // markets use moreInfo.subMarket to name which player that specific
  // market's odds belong to (SET_BETTING splits into one market PER PLAYER,
  // unlike every HOME/AWAY-attributed 2-way market elsewhere in this API).
  marketFI?: string;
  moreInfo?: Record<string, unknown>;
  updatedAt?: string;
};

export type PulseScoreEvent = {
  eventId: string;
  sport: string;
  league: string;
  country?: string; // observed always "" in practice — don't rely on it
  home: string;
  away: string;
  score?: { home: string; away: string };
  markets: PulseScoreMarket[];
  // Raw bet365 fields preserved alongside the normalized ones. TM/TS are the
  // only place the live clock is available (no normalized "minute" field
  // exists) — TM = minutes elapsed, TS = seconds, both as string numbers.
  // Confirmed against real live matches: TM values (92, 68, 45, 90, 71) line
  // up exactly with plausible real match minutes.
  moreInfo?: {
    TM?: string;
    TS?: string;
    TT?: string;
    SS?: string; // score string, e.g. "3-0" — redundant with `score`
    updatedAtUTC?: number;
    [key: string]: unknown;
  };
};

export type PulseScoreLiveEventsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  sport: string;
  events: PulseScoreEvent[];
};
