// Volleyball prematch odds from PulseScore. Built from scratch 2026-08-09,
// pinned to "bwin" (VOLLEYBALL_BOOKMAKER below) — volleyball had no
// PulseScore integration at all before this (odds came from a since-
// disconnected Statpal feed, used today only to recover final scores for
// old bets — see matches.ts's scanVolleyballForFinished — and a
// computeVolleyballExtras synthetic model that was written but never
// actually wired up anywhere).
//
// Live: pinned to bet365 instead (see getPulseScoreVolleyballLive below) —
// a real GET /live-events?sport=volleyball comparison (2026-08-09) showed
// bwin's volleyball live events carry NO score field at all (only
// matchClock.period, e.g. "2nd Set"), while bet365's DO carry a `score`
// object. Every non-volleyball sport in this codebase uses the SAME
// bookmaker for prematch and live — volleyball is the first exception,
// which matters for id/name matching (see matches.ts's
// isUpcomingAlreadyLive: prematch's bwin "Manaus Nilton Lins" vs live's
// bet365 "Nilton Lins" need the fuzzy team-name fallback, not exact string
// match, to recognize the same real match).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

const seenUnknownMarkets = new Set<string>();
function recordUnknownCanonicalMarket(canonicalMarket: string, rawName: string | undefined): void {
  const key = `${canonicalMarket}::${rawName ?? ""}`;
  if (seenUnknownMarkets.has(key)) return;
  seenUnknownMarkets.add(key);
  logger.info(
    { canonicalMarket, rawName },
    "[pulsescore] unmapped volleyball canonicalMarket seen — candidate to add to the override mapping",
  );
}

// ── canonicalMarket → our own market shape ──────────────────────────────────
// Verified against a real bwin GET /volleyball/leagues and /volleyball/events
// sample (2026-08-09, 1 league: "SEA V Cup, Women", 1 event: Thailand vs
// Vietnam). Unlike hockey/tennis, volleyball's Match Result and Set 1 Winner
// are both clean: canonicalMarket "MATCH_RESULT" with explicit HOME/AWAY
// canonicalOutcome, no draw (volleyball can't end level), no name-matching
// fallback needed. Total Points is "OVER_UNDER" with `line` on the market
// (same convention as every other bwin sport) and multiple alternate lines
// per event (139.5/140.5/141.5 in the sample) — all collected, matching the
// existing AdvancedMarkets.volleyballExtra.pointsLines shape (an array, not
// a single picked line). Correct Score is canonicalMarket "CORRECT_SCORE",
// selections labelled "3:0"/"3:1"/.../"0:3" — maps onto the existing
// volleyballExtra.exactScore shape (s30/s31/s32/s03/s13/s23).
// "Total Exact Sets" (3/4/5) and "Total Sets Decided By Extra Points" are
// both canonicalMarket "OTHER" with no matching field in the existing
// AdvancedMarkets.volleyballExtra shape — not extracted, out of scope for
// this first pass. No handicap market (set or points) seen in this single
// sample — setHandicap/handicapPoints stay unextracted too, same as
// GAME_HANDICAP was left for tennis until a real sample justifies it.
export type PulseScoreVolleyballOverride = {
  odds?: { home: number; away: number };
  set1?: { home: number; away: number };
  pointsLines?: Array<{ line: number; over: number; under: number }>;
  exactScore?: {
    s30: number;
    s31: number;
    s32: number;
    s03: number;
    s13: number;
    s23: number;
  };
};

function isFullTimeMarket(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FULL_TIME";
}

function isMatchResultMarket(market: PulseScoreMarket): boolean {
  return market.canonicalMarket === "MATCH_RESULT" && isFullTimeMarket(market);
}

function isSet1WinnerMarket(market: PulseScoreMarket): boolean {
  return (
    market.canonicalMarket === "MATCH_RESULT" &&
    (market.period || "").toUpperCase() === "FIRST_SET"
  );
}

function extractTwoWay(market: PulseScoreMarket): { home: number; away: number } | null {
  let home: number | null = null;
  let away: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") home = val;
    else if (sel.canonicalOutcome === "AWAY") away = val;
  }
  return home !== null && away !== null ? { home, away } : null;
}

function extractPointsLines(
  markets: PulseScoreMarket[],
): Array<{ line: number; over: number; under: number }> {
  const byLine = new Map<number, { over: number | null; under: number | null }>();
  for (const m of markets) {
    for (const sel of m.selections ?? []) {
      if (!sel.isActive) continue;
      const line = sel.line ?? m.line;
      if (line === undefined) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const entry = byLine.get(line) ?? { over: null, under: null };
      if (sel.canonicalOutcome === "OVER") entry.over = val;
      else if (sel.canonicalOutcome === "UNDER") entry.under = val;
      byLine.set(line, entry);
    }
  }
  const out: Array<{ line: number; over: number; under: number }> = [];
  for (const [line, { over, under }] of byLine) {
    if (over !== null && under !== null) out.push({ line, over, under });
  }
  return out.sort((a, b) => a.line - b.line);
}

const CORRECT_SCORE_KEYS: Record<string, keyof NonNullable<PulseScoreVolleyballOverride["exactScore"]>> = {
  "3:0": "s30",
  "3:1": "s31",
  "3:2": "s32",
  "0:3": "s03",
  "1:3": "s13",
  "2:3": "s23",
};

function extractExactScore(
  market: PulseScoreMarket,
): PulseScoreVolleyballOverride["exactScore"] | null {
  const out: Partial<Record<keyof NonNullable<PulseScoreVolleyballOverride["exactScore"]>, number>> = {};
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const key = CORRECT_SCORE_KEYS[(sel.rawName || "").trim()];
    if (key) out[key] = val;
  }
  return out.s30 !== undefined &&
    out.s31 !== undefined &&
    out.s32 !== undefined &&
    out.s03 !== undefined &&
    out.s13 !== undefined &&
    out.s23 !== undefined
    ? (out as NonNullable<PulseScoreVolleyballOverride["exactScore"]>)
    : null;
}

/** Builds a market override from one PulseScore volleyball event's Match
 * Result / Set 1 Winner / Total Points / Correct Score markets. Returns an
 * empty object (not null) when none are recognised yet — callers should
 * only apply fields present. */
export function extractVolleyballOverride(ev: PulseScoreEvent): PulseScoreVolleyballOverride {
  const out: PulseScoreVolleyballOverride = {};
  const markets = ev.markets ?? [];

  const matchResultMarkets = markets.filter(isMatchResultMarket);
  if (matchResultMarkets.length === 1) {
    const ml = extractTwoWay(matchResultMarkets[0]!);
    if (ml) out.odds = ml;
  }

  const set1Markets = markets.filter(isSet1WinnerMarket);
  if (set1Markets.length === 1) {
    const s1 = extractTwoWay(set1Markets[0]!);
    if (s1) out.set1 = s1;
  }

  const totalPointsMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isFullTimeMarket(m),
  );
  const pointsLines = extractPointsLines(totalPointsMarkets);
  if (pointsLines.length > 0) out.pointsLines = pointsLines;

  const correctScoreMarket = markets.find((m) => m.canonicalMarket === "CORRECT_SCORE");
  if (correctScoreMarket) {
    const exactScore = extractExactScore(correctScoreMarket);
    if (exactScore) out.exactScore = exactScore;
  }

  const known = new Set(["MATCH_RESULT", "OVER_UNDER", "CORRECT_SCORE", "OTHER"]);
  for (const market of markets) {
    if (!known.has(market.canonicalMarket)) recordUnknownCanonicalMarket(market.canonicalMarket, market.rawName);
  }
  return out;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Same paginated-leagues-with-nested-events envelope already confirmed for
// football/tennis/basketball/hockey. Volleyball's league field is a bare
// string (e.g. "SEA V Cup, Women") — no pipe-delimited country prefix, same
// as basketball/hockey — so country is hardcoded "Internacional" the same
// way. eventId is NOT a bare numeric string here ("5:1102893", with a colon)
// unlike every other sport sampled so far — kept as an opaque string, no
// parsing attempted.
export type PulseScoreVolleyballPrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreVolleyballLeague = {
  name: string;
  sport: string;
  events: PulseScoreVolleyballPrematchEvent[];
  league: string;
};

type PulseScoreVolleyballLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreVolleyballLeague[];
};

const VOLLEYBALL_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScoreVolleyballPrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScoreVolleyballPrematchEvent[]> | null = null;

// Pinned explicitly, same reasoning as hockey.ts's HOCKEY_BOOKMAKER —
// volleyball has no live poller of its own to share a budget with yet (see
// file header), so this is the only bwin consumer in this file.
const VOLLEYBALL_BOOKMAKER = "bwin";

async function fetchAllVolleyballLeagues(): Promise<PulseScoreVolleyballLeague[]> {
  const leagues: PulseScoreVolleyballLeague[] = [];
  let page = 1;
  // Real sample: total 1 league at limit=5 -> 1 page. Paced the same
  // 4s/page as the other sports' prematch fetch even though volleyball's
  // catalog is tiny right now — nothing user-facing waits on it (served
  // from its own cache), so there's no cost to keeping the same
  // conservative pacing, and the catalog will likely grow once more
  // tournaments are in season.
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreVolleyballLeaguesResponse>(
      `/volleyball/leagues?page=${page}&limit=30`,
      { bookmaker: VOLLEYBALL_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchVolleyballUpcoming(): Promise<PulseScoreVolleyballPrematchEvent[]> {
  const leagues = await fetchAllVolleyballLeagues();
  return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
}

/** Upcoming volleyball fixtures from PulseScore (bwin), each carrying its
 * Match Result / Set 1 Winner / Total Points / Correct Score prematch odds
 * when bwin has priced it yet. Empty array if PULSESCORE_API_KEY isn't
 * configured, or the upstream call fails on the very first attempt (nothing
 * cached yet to fall back to). */
export async function getPulseScoreVolleyballUpcoming(): Promise<PulseScoreVolleyballPrematchEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < VOLLEYBALL_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchVolleyballUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] volleyball upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}

// ── Live (REST poll, bet365) ────────────────────────────────────────────────
const VOLLEYBALL_LIVE_BOOKMAKER = "bet365";
const VOLLEYBALL_LIVE_TTL_MS = 1_000; // same PRO-plan 1 req/s budget as other live pollers
let liveCache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let liveInFlight: Promise<PulseScoreEvent[]> | null = null;

async function fetchVolleyballLive(): Promise<PulseScoreEvent[]> {
  // Confirmed real (2026-08-09, bet365): same paginated { total, page, ...,
  // events: [...] } envelope as every other sport's live feed. `score` is
  // {home,away} as STRINGS when present — sampled matches all read "0"/"0"
  // (unconfirmed whether that's real 0-0 or a not-yet-live entry; bet365
  // carries no matchClock at all for volleyball, only the generic
  // moreInfo.TM/TS/TT/SS raw fields also seen on football/tennis, all "0"/
  // empty in the sample). Markets use different canonicalMarket/rawName
  // shapes than bwin's (extractVolleyballOverride was built against bwin's
  // "Match Result"/"Set 1 Winner"/"Total Points"/"Correct Score" naming) —
  // NOT re-extracted here yet, matches.ts's live builder uses the same
  // synthetic-odds fallback prematch already falls back to when bwin hasn't
  // priced a market, until bet365's volleyball market shapes are confirmed
  // separately.
  const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
    "/live-events?sport=volleyball&limit=200",
    undefined,
    VOLLEYBALL_LIVE_BOOKMAKER,
  );
  return Array.isArray(data?.events) ? data.events : [];
}

/** Live volleyball score from PulseScore (bet365), REST-only. Empty array if
 * PULSESCORE_API_KEY isn't configured, or the upstream call fails on the
 * very first attempt (nothing cached yet to fall back to). See
 * fetchVolleyballLive's header for the real-sample caveats — this is a
 * first pass to confirm whether bet365's score field actually populates
 * once a match is genuinely in progress (still unconfirmed as of
 * 2026-08-09). */
export async function getPulseScoreVolleyballLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (liveCache && now - liveCache.fetchedAt < VOLLEYBALL_LIVE_TTL_MS) return liveCache.events;
  if (!liveInFlight) {
    liveInFlight = fetchVolleyballLive()
      .then((events) => {
        liveCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] volleyball live fetch failed — serving stale cache",
        );
        return liveCache?.events ?? [];
      })
      .finally(() => {
        liveInFlight = null;
      });
  }
  return liveInFlight;
}
