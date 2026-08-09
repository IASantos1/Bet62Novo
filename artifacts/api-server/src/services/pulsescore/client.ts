// Shared HTTP/WS plumbing for PulseScore (api.pulsescore.net) — a normalized
// odds aggregator that exposes the same flat schema (markets[].canonicalMarket,
// markets[].selections[]) for every bookmaker, only the base path differs.
// bet365 alone uses a versioned path (/api/v3/bet365); every other bookmaker
// is /api/{bookmaker} with no version segment — bookmakerPrefix() below is
// the one place that quirk needs to be known.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export function bookmakerPrefix(bookmaker: string = CONFIG.PULSESCORE_BOOKMAKER): string {
  return bookmaker === "bet365" ? "v3/bet365" : bookmaker;
}

export function pulseScoreRestUrl(path: string, bookmaker?: string): string {
  return `${CONFIG.PULSESCORE_BASE_URL}/${bookmakerPrefix(bookmaker)}${path}`;
}

export function pulseScoreWsUrl(sport: string, bookmaker?: string): string {
  const httpBase = CONFIG.PULSESCORE_BASE_URL.replace(/^http/, "ws");
  const key = encodeURIComponent(CONFIG.PULSESCORE_API_KEY);
  return `${httpBase}/${bookmakerPrefix(bookmaker)}/ws/live?key=${key}&sport=${encodeURIComponent(sport)}`;
}

// Every REST caller (football's live poller, tennis's live poller, and both
// sports' background prematch league fetches) hits the SAME shared 1 req/s
// budget whenever they resolve to the bet365 bookmaker — confirmed in
// production (2026-08-08) via a direct probe that returned 200 sometimes and
// 429/401 other times for the exact same key: nothing was serializing these
// callers against each other, so two of them landing in the same ~1s window
// (which happens most cycles — football and tennis are each refreshed on
// their own ~1-1.5s timer, back-to-back) collided and one lost. Queuing here,
// in the one shared entry point every caller already goes through, fixes it
// for all of them at once instead of coordinating each poller individually.
const bookmakerChain = new Map<string, Promise<void>>();
const lastRequestAtByBookmaker = new Map<string, number>();
const MIN_REQUEST_GAP_MS = 1_050; // just over the documented 1 req/s, as a safety margin

function throttleBookmaker(bookmaker: string): Promise<void> {
  const previous = bookmakerChain.get(bookmaker) ?? Promise.resolve();
  const next = previous.then(async () => {
    const last = lastRequestAtByBookmaker.get(bookmaker) ?? 0;
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - last));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAtByBookmaker.set(bookmaker, Date.now());
  });
  bookmakerChain.set(bookmaker, next);
  return next;
}

export async function pulseScoreGet<T>(
  path: string,
  timeoutMs = 4000,
  bookmaker?: string,
): Promise<T> {
  const bookmakerName = bookmaker ?? CONFIG.PULSESCORE_BOOKMAKER;
  await throttleBookmaker(bookmakerName);
  const resp = await fetch(pulseScoreRestUrl(path, bookmaker), {
    headers: { "X-Secret": CONFIG.PULSESCORE_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new Error(`[pulsescore] ${resp.status} on ${path}`);
  }
  return (await resp.json()) as T;
}

// Football/tennis live pollers hit bet365 at ~1 req/s continuously, which is
// the PRO plan's entire budget for that bookmaker (confirmed against the
// docs: "1 requisição/seg" per bookmaker, shared across every consumer, not
// per sport/endpoint). Prematch's paginated fetches (fetchAllFootballLeagues/
// fetchAllTennisEvents/fetchAllBasketballLeagues) are a second consumer of
// that SAME budget, running in the background every few minutes — a single
// page request landing in the same second as a live poll gets a 429 and,
// without this, the whole prematch fetch for that sport silently returns
// nothing (its outer try/catch just gives up). Retrying with backoff gives a
// starved page request more chances to land in a gap between live polls
// instead of losing the entire "Em Breve" list to one unlucky collision.
export async function pulseScoreGetWithRetry<T>(
  path: string,
  opts?: { timeoutMs?: number; bookmaker?: string; retries?: number; retryDelayMs?: number },
): Promise<T | null> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.retryDelayMs ?? 2000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pulseScoreGet<T>(path, opts?.timeoutMs, opts?.bookmaker);
    } catch (err) {
      if (attempt === retries) {
        logger.warn(
          { err, path },
          "[pulsescore] giving up on this page after retries — likely rate-limited by the live poller sharing the same bet365 budget",
        );
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  return null;
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
  // The O/U or handicap line for this market. bwin ALWAYS puts it here, never
  // on the individual selection — confirmed by scanning an entire real doc
  // sample (2026-08-08/09, 3293 market blocks across football and
  // basketball): zero selections carried their own `line`. bet365 apparently
  // puts it per-selection instead (multiple lines packed into one market
  // object) — callers should check `sel.line` first and fall back to this
  // field, which covers both shapes.
  line?: number;
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
  // bet365: observed always "" in practice — don't rely on it there.
  // bwin: populated with the real country name (e.g. "Brazil", "Chile") —
  // confirmed against real /live-events?sport=soccer samples (2026-08-08).
  country?: string;
  home: string;
  away: string;
  score?: { home: string; away: string };
  markets: PulseScoreMarket[];
  // Normalized live match clock — confirmed present on bwin's real
  // /live-events?sport=soccer samples (2026-08-08): { minute: 92, second: 42,
  // period: "2H", running: true }, also seen period: "Finished" for an ended
  // match. Not confirmed for bet365 — that bookmaker instead only exposes
  // the clock via the raw moreInfo.TM/TS fields below (see
  // football.ts::pulseScoreEventMinute/pulseScoreEventClockSec, which prefer
  // this field when present and fall back to moreInfo.TM/TS otherwise).
  matchClock?: {
    minute: number;
    second: number;
    period: string; // seen: "2H", "Finished" — other values (1H/HT?) unconfirmed
    running: boolean;
  };
  // Raw bet365-specific fields preserved alongside the normalized ones. Not
  // confirmed present on bwin — the full bwin API doc sampled 2026-08-08 (62
  // real live-soccer events) never showed a moreInfo object on any event or
  // selection, so treat this as bet365-only until proven otherwise. TM/TS
  // are the only place bet365's live clock is available (no normalized
  // "minute" field exists for that bookmaker) — TM = minutes elapsed, TS =
  // seconds, both as string numbers. Confirmed against real live matches:
  // TM values (92, 68, 45, 90, 71) line up exactly with plausible real match
  // minutes.
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
