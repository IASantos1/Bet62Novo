// Basketball prematch odds from PulseScore. Pinned to its own "bwin"
// bookmaker (BASKETBALL_BOOKMAKER below) as of 2026-08-09, mirroring
// football.ts's move — same REST/cache/pacing pattern.
//
// Live: confirmed against a real GET /live-events?sport=basketball sample
// (2026-08-09, bwin) — see getPulseScoreBasketballLive below for the shape
// differences from football's live feed (no per-second clock, score as
// strings).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { getBasketballWsEventIfFresh } from "./basketballWs.js";

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

const seenUnknownMarkets = new Set<string>();
function recordUnknownCanonicalMarket(canonicalMarket: string): void {
  if (seenUnknownMarkets.has(canonicalMarket)) return;
  seenUnknownMarkets.add(canonicalMarket);
  logger.info(
    { canonicalMarket },
    "[pulsescore] unmapped basketball canonicalMarket seen — candidate to add to the override mapping",
  );
}

// ── canonicalMarket → our own market shape ──────────────────────────────────
// Originally verified against a real bet365 GET /basketball/leagues sample
// (2026-08-07): "ASIAN_HANDICAP"/"Spread" (canonicalOutcome HOME/AWAY, each
// selection carrying its OWN `line`), "OVER_UNDER"/"Total" (canonicalOutcome
// OVER/UNDER), "MATCH_RESULT"/"Money Line" (canonicalOutcome HOME/AWAY, no
// draw) — and every sampled bet365 event carried exactly one of each.
//
// Re-verified against a real bwin GET /basketball/leagues sample (2026-08-09)
// — two concrete shape differences, both fixed below:
//   1. bwin calls the handicap market "EUROPEAN_HANDICAP", not
//      "ASIAN_HANDICAP" — both are now accepted.
//   2. bwin puts every event's Money Line / Handicap / Totals markets THREE
//      times each (FULL_TIME, FIRST_HALF, FIRST_QUARTER — all sharing the
//      same canonicalMarket), not once. The old code treated "more than one
//      market of this type" as ambiguous and skipped extraction entirely —
//      on bwin that's not a rare edge case, it's every single event, so real
//      odds would never have been extracted at all. Now filtered to
//      FULL_TIME first, matching the period-scoping pattern already used in
//      football.ts.
// Only these three are mapped for now; anything else seen in real traffic is
// logged once instead of guessed at.
export type PulseScoreBasketballOverride = {
  odds?: { home: number; away: number };
  // `line` is the signed handicap line for the HOME selection (e.g. +1.5 =
  // home receives 1.5 points, i.e. home is the underdog) — callers that want
  // a "home spread magnitude, positive = favoured" number (this codebase's
  // `_spread` convention) must negate it themselves.
  spread?: { line: number; home: number; away: number };
  total?: { line: number; over: number; under: number };
};

function isFullTimeMarket(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FULL_TIME";
}

function extractMoneyline(market: PulseScoreMarket): { home: number; away: number } | null {
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

function extractSpread(market: PulseScoreMarket): { line: number; home: number; away: number } | null {
  let homeOdds: number | null = null;
  let homeLine: number | null = null;
  let awayOdds: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") {
      homeOdds = val;
      // bwin: no per-selection line, only market.line (confirmed against a
      // real sample, 2026-08-09). bet365: per-selection. Check both.
      homeLine = sel.line ?? market.line ?? null;
    } else if (sel.canonicalOutcome === "AWAY") {
      awayOdds = val;
    }
  }
  return homeOdds !== null && awayOdds !== null && homeLine !== null
    ? { line: homeLine, home: homeOdds, away: awayOdds }
    : null;
}

function extractTotal(market: PulseScoreMarket): { line: number; over: number; under: number } | null {
  let over: number | null = null;
  let under: number | null = null;
  let line: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "OVER") {
      over = val;
      line = sel.line ?? market.line ?? null;
    } else if (sel.canonicalOutcome === "UNDER") {
      under = val;
    }
  }
  return over !== null && under !== null && line !== null ? { line, over, under } : null;
}

/** Builds a market override from one PulseScore basketball event's Money
 * Line / Spread / Total markets. Returns an empty object (not null) when
 * none are recognised yet — callers should only apply fields present. */
export function extractBasketballOverride(ev: PulseScoreEvent): PulseScoreBasketballOverride {
  const out: PulseScoreBasketballOverride = {};
  const moneylineMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "MATCH_RESULT" && isFullTimeMarket(m),
  );
  const spreadMarkets = (ev.markets ?? []).filter(
    (m) =>
      (m.canonicalMarket === "ASIAN_HANDICAP" || m.canonicalMarket === "EUROPEAN_HANDICAP") &&
      isFullTimeMarket(m),
  );
  const totalMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isFullTimeMarket(m),
  );

  // If more than one FULL_TIME moneyline/total market still shows up, skip
  // rather than risk mixing them up — same caution as football/
  // genericSportLive. Moneyline/Totals showed exactly one FULL_TIME entry
  // each in every real bwin sample seen so far (2026-08-09).
  if (moneylineMarkets.length === 1) {
    const ml = extractMoneyline(moneylineMarkets[0]!);
    if (ml) out.odds = ml;
  }
  if (totalMarkets.length === 1) {
    const tot = extractTotal(totalMarkets[0]!);
    if (tot) out.total = tot;
  }
  // Handicap is different: bwin lists several alternate FULL_TIME lines per
  // event (confirmed real, 2026-08-09 — one match carried Handicap at -8.5,
  // -9.5, -10.5, -11.5, -12.5 all at once). AdvancedMarkets.spread only holds
  // one line, so pick the one closest to even odds (min |home - away|) as
  // the "main" line — same heuristic tennis.ts's pickMostEvenLine already
  // uses for the same kind of multi-line market, and it lines up with how
  // sportsbooks pick their headline spread (in that sample, -10.5 at
  // 1.85/1.83 was clearly the intended main line vs. -8.5's 1.65/2.05).
  const spreadCandidates = spreadMarkets
    .map((m) => extractSpread(m))
    .filter((sp): sp is { line: number; home: number; away: number } => sp !== null);
  if (spreadCandidates.length > 0) {
    out.spread = spreadCandidates.reduce((best, cur) =>
      Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
    );
  }

  const known = new Set(["MATCH_RESULT", "ASIAN_HANDICAP", "EUROPEAN_HANDICAP", "OVER_UNDER"]);
  for (const market of ev.markets ?? []) {
    if (!known.has(market.canonicalMarket)) recordUnknownCanonicalMarket(market.canonicalMarket);
  }
  return out;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Verified against real /basketball/leagues samples on both bet365
// (2026-08-07) and bwin (2026-08-09) — same paginated-leagues-with-nested-
// events envelope already confirmed for football/tennis (total/page/limit/
// totalPages/hasNextPage/leagues[]), and the same bare, un-prefixed path on
// both bookmakers (no "/soccer/"-style path change needed here, unlike
// football's /leagues -> /soccer/leagues move). Unlike football
// ("Country||League") and tennis ("Tour||League"), basketball's league field
// is a bare string (e.g. "Argentina La Liga Federal") — no pipe-delimited
// country prefix, so no countryForLeagueName lookup is attempted; country is
// hardcoded "Internacional" the same way tennis's builder does it, since
// there's no existing basketball country/catalog table in this codebase to
// reuse (each event does carry its own real `.country` on bwin, same as
// football's, but nothing downstream consumes it yet).
export type PulseScoreBasketballPrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreBasketballLeague = {
  name: string;
  sport: string;
  events: PulseScoreBasketballPrematchEvent[];
  league: string;
};

type PulseScoreBasketballLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreBasketballLeague[];
};

const BASKETBALL_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScoreBasketballPrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScoreBasketballPrematchEvent[]> | null = null;

// Pinned explicitly, same reasoning as football.ts's FOOTBALL_BOOKMAKER —
// basketball has no live poller of its own to share a budget with yet (see
// file header), so this is the only bwin consumer in this file.
const BASKETBALL_BOOKMAKER = "bwin";

async function fetchAllBasketballLeagues(): Promise<PulseScoreBasketballLeague[]> {
  const leagues: PulseScoreBasketballLeague[] = [];
  let page = 1;
  // Real sample: total 33 leagues (bet365) / 24 leagues (bwin) at limit=30 ->
  // 1-2 pages. Paced the same 4s/page as football/tennis's prematch fetch
  // even though basketball's catalog is far smaller — nothing user-facing
  // waits on it (served from its own cache), so there's no cost to keeping
  // the same conservative pacing.
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreBasketballLeaguesResponse>(
      `/basketball/leagues?page=${page}&limit=30`,
      { bookmaker: BASKETBALL_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchBasketballUpcoming(): Promise<PulseScoreBasketballPrematchEvent[]> {
  const leagues = await fetchAllBasketballLeagues();
  // live:true entries here never carry markets (see file header) — keep
  // this prematch-only until a real live-events sample is confirmed.
  return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
}

/** Upcoming basketball fixtures from PulseScore (bwin), each carrying its
 * Money Line / Spread / Total prematch odds when bwin has priced it yet.
 * Empty array if PULSESCORE_API_KEY isn't configured, or the upstream call
 * fails on the very first attempt (nothing cached yet to fall back to). */
export async function getPulseScoreBasketballUpcoming(): Promise<PulseScoreBasketballPrematchEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < BASKETBALL_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchBasketballUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        // Used to swallow the error and overwrite upcomingCache with []
        // unconditionally — a single transient failure across the paginated
        // /leagues fetch (429 from bwin's own budget, a timeout, ...) wiped
        // 5 minutes of prematch listings to empty, which is exactly what
        // shows up on the site as matches "appearing and disappearing". Log
        // it and keep serving whatever was cached instead.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] basketball upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}

// ── Live (REST poll) ─────────────────────────────────────────────────────────
const BASKETBALL_LIVE_TTL_MS = 1_000; // same PRO-plan 1 req/s budget as football
let liveCache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let liveInFlight: Promise<PulseScoreEvent[]> | null = null;

async function fetchBasketballLive(): Promise<PulseScoreEvent[]> {
  // Confirmed real (2026-08-09, bwin): same paginated { total, page, ...,
  // events: [...] } envelope as football's live feed. limit=200 comfortably
  // covers real volume (7 events observed at once). The response also
  // includes events whose matchClock.period is "Not Started" — pre-game
  // fixtures folded into the same feed, not actually live yet; callers must
  // filter those out (see buildBasketballLiveFromPulseScore in matches.ts).
  const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
    "/live-events?sport=basketball&limit=200",
    undefined,
    BASKETBALL_BOOKMAKER,
  );
  return Array.isArray(data?.events) ? data.events : [];
}

// How fresh a WS-broadcast reading for ONE specific event must be to be
// trusted over REST's own value for that same event — see football.ts's
// identical constant for the full reasoning (per-event overlay, never a
// primary source of which matches are live).
const BASKETBALL_WS_EVENT_FRESHNESS_MS = 4_000;

/** Live basketball odds + score from PulseScore (bwin, normalized). REST is
 * always the authoritative source for WHICH matches are live and for every
 * market/odds field; basketballWs.ts is layered on top PER EVENT the same
 * way football.ts's getPulseScoreFootballLive does (see that function's
 * header for the two prior all-or-nothing WS attempts this design avoids).
 * Built 2026-08-09 specifically because basketball's REST poll shares the
 * "bwin" bookmaker's 1 req/s budget with football's own REST poll —
 * confirmed in production causing basketball's odds to go stale under
 * contention even though score/clock kept moving. A dedicated WS connection
 * (one per sport, per real PulseScore plan docs) sidesteps that budget
 * fight entirely for whichever events it has fresh data on.
 * Empty array if PULSESCORE_API_KEY isn't configured, or the upstream call
 * fails on the very first attempt (nothing cached yet to fall back to).
 *
 * Real sample shape (2026-08-09) differs from football/soccer's live feed in
 * two ways callers must account for:
 *   1. `score` is `{home,away}` as STRINGS ("25"/"29"), not numbers.
 *   2. `matchClock` only ever carries `period` — no minute/second/running
 *      fields at all (unlike football's per-second clock). Real period
 *      values seen: "Not Started", "Q1"-"Q4", "Halftime". No
 *      "Finished"-equivalent value observed yet, so end-of-match must be
 *      detected by the match disappearing from this feed (same
 *      disappearance-based pattern every non-football sport used before
 *      football's own immediate-FT fast path was added), not by a status
 *      string.
 * Markets reuse the exact same canonicalMarket shapes already confirmed for
 * prematch (extractBasketballOverride) — a live event's markets array in
 * this sample carried the same MATCH_RESULT/EUROPEAN_HANDICAP/OVER_UNDER
 * FULL_TIME blocks, just alongside extra period-scoped variants
 * (FIRST_QUARTER, THIRD_QUARTER, ...) extractBasketballOverride already
 * ignores. */
export async function getPulseScoreBasketballLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  let events: PulseScoreEvent[];
  if (liveCache && now - liveCache.fetchedAt < BASKETBALL_LIVE_TTL_MS) {
    events = liveCache.events;
  } else if (!liveInFlight) {
    liveInFlight = fetchBasketballLive()
      .then((fetched) => {
        liveCache = { events: fetched, fetchedAt: Date.now() };
        return fetched;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] basketball live fetch failed — serving stale cache",
        );
        return liveCache?.events ?? [];
      })
      .finally(() => {
        liveInFlight = null;
      });
    events = await liveInFlight;
  } else {
    events = await liveInFlight;
  }
  // Defense in depth: an unexpected failure in the WS overlay must never
  // take the whole REST live list down with it (this whole feed going
  // empty is a much worse outcome than one tick without the overlay).
  try {
    return mergeBasketballWsFreshness(events);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[pulsescore] basketball WS overlay failed — serving REST events unmerged",
    );
    return events;
  }
}

// Same reasoning as football.ts's isWsClockAtLeastAsAdvanced: WS only
// re-broadcasts an event when something about it changes, so a frame still
// within BASKETBALL_WS_EVENT_FRESHNESS_MS can be for a moment strictly
// EARLIER than what REST's own most recent fetch already has. Basketball's
// matchClock only ever carries `period` (no minute/second — see this file's
// header), so "advanced" here means later in this local period ordering,
// not a real timestamp comparison. Unknown periods rank last (0) so an
// unrecognized value never wins a comparison it can't actually justify.
const PERIOD_RANK: Record<string, number> = {
  "not started": 0,
  q1: 1,
  q2: 2,
  halftime: 3,
  q3: 4,
  q4: 5,
  ot: 6,
  overtime: 6,
};

function periodRank(period: string | undefined): number {
  if (!period) return -1;
  return PERIOD_RANK[period.toLowerCase()] ?? -1;
}

function isWsClockAtLeastAsAdvanced(
  wsClock: PulseScoreEvent["matchClock"],
  restClock: PulseScoreEvent["matchClock"],
): boolean {
  if (!wsClock) return false;
  if (!restClock) return true;
  const wsRank = periodRank(wsClock.period);
  const restRank = periodRank(restClock.period);
  // Either side using a period this ranking doesn't recognize means we
  // can't safely order them — don't guess, keep REST's own reading.
  if (wsRank < 0 || restRank < 0) return false;
  return wsRank >= restRank;
}

function isWsScoreAtLeastAsAdvanced(
  wsScore: PulseScoreEvent["score"],
  restScore: PulseScoreEvent["score"],
): boolean {
  if (!wsScore) return false;
  if (!restScore) return true;
  const wsHome = Number(wsScore.home);
  const wsAway = Number(wsScore.away);
  const restHome = Number(restScore.home);
  const restAway = Number(restScore.away);
  if ([wsHome, wsAway, restHome, restAway].some((n) => Number.isNaN(n))) return false;
  return wsHome >= restHome && wsAway >= restAway;
}

/** Exported only for tests — mirrors football.ts's mergeFootballWsFreshness. */
export function mergeBasketballWsFreshness(restEvents: PulseScoreEvent[]): PulseScoreEvent[] {
  return restEvents.map((ev) => {
    if (!ev.eventId) return ev;
    const wsEv = getBasketballWsEventIfFresh(ev.eventId, BASKETBALL_WS_EVENT_FRESHNESS_MS);
    if (!wsEv) return ev;
    return {
      ...ev,
      matchClock: isWsClockAtLeastAsAdvanced(wsEv.matchClock, ev.matchClock)
        ? wsEv.matchClock
        : ev.matchClock,
      score: isWsScoreAtLeastAsAdvanced(wsEv.score, ev.score) ? wsEv.score : ev.score,
    };
  });
}
