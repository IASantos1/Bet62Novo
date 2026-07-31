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

export function pulseScoreRestUrl(path: string): string {
  return `${CONFIG.PULSESCORE_BASE_URL}/${bookmakerPrefix()}${path}`;
}

export function pulseScoreWsUrl(sport: string): string {
  const httpBase = CONFIG.PULSESCORE_BASE_URL.replace(/^http/, "ws");
  const key = encodeURIComponent(CONFIG.PULSESCORE_API_KEY);
  return `${httpBase}/${bookmakerPrefix()}/ws/live?key=${key}&sport=${encodeURIComponent(sport)}`;
}

export async function pulseScoreGet<T>(path: string, timeoutMs = 4000): Promise<T> {
  const resp = await fetch(pulseScoreRestUrl(path), {
    headers: { "X-Secret": CONFIG.PULSESCORE_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new Error(`[pulsescore] ${resp.status} on ${path}`);
  }
  return (await resp.json()) as T;
}

// ── Normalized schema shared by every bookmaker/sport ───────────────────────

export type PulseScoreSelection = {
  name: string;
  rawName?: string;
  decimal: string;
};

export type PulseScoreMarket = {
  canonicalMarket: string;
  period: string;
  rawName?: string;
  line?: string;
  selections: PulseScoreSelection[];
};

export type PulseScoreEvent = {
  eventId: string;
  sport: string;
  league: string;
  home: string;
  away: string;
  live: boolean;
  startTime: string;
  score?: string;
  markets: PulseScoreMarket[];
};
