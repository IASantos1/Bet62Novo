// Basketball prematch odds from PulseScore. Pinned to its own bookmaker
// (BASKETBALL_BOOKMAKER below) — bwin from 2026-08-09, moved to onexbet
// (1xBet) 2026-08-27 alongside every non-football sport, mirroring
// football.ts's move — same REST/cache/pacing pattern. Uses only
// canonicalMarket/canonicalOutcome and score/matchClock, which PulseScore
// documents as identical across bookmakers, so the bwin→onexbet switch
// carries no bookmaker-specific field risk here (unlike tennis.ts).
//
// Live: originally confirmed against a real GET /live-events?sport=basketball
// sample (2026-08-09, bwin) — see getPulseScoreBasketballLive below for the
// shape differences from football's live feed (no per-second clock, score as
// strings). Not yet re-verified against a real onexbet sample.
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
// Only these three FULL_TIME markets, plus the period-scoped extension right
// below, are mapped; anything else seen in real traffic is logged once
// instead of guessed at.
//
// Period-scoped extension (2026-08-15): the FULL_TIME triplication noted
// above (point 2) is itself the evidence — bwin sends the same MATCH_RESULT/
// HANDICAP/OVER_UNDER markets again under FIRST_QUARTER, THIRD_QUARTER and
// FIRST_HALF (confirmed real periods on the same 2026-08-09 sample this
// file's FULL_TIME extraction was built from). SECOND_QUARTER, FOURTH_QUARTER
// and SECOND_HALF were NOT named in that sample — rather than assume a
// standard 4-quarter taxonomy and guess at those, extraction below is
// limited to the three confirmed periods; recordUnknownPeriod() logs any
// OTHER period value actually seen on a known canonicalMarket so those three
// can be added for real once (if) confirmed, the same "log once instead of
// guessed at" discipline as recordUnknownCanonicalMarket above.
export type PulseScoreBasketballPeriodOverride = {
  odds?: { home: number; away: number };
  spread?: { line: number; home: number; away: number };
  total?: { line: number; over: number; under: number };
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  teamTotalHome?: { line: number; over: number; under: number };
  teamTotalAway?: { line: number; over: number; under: number };
  oddEven?: { odd: number; even: number };
};
export type PulseScoreBasketballOverride = {
  odds?: { home: number; away: number };
  // `line` is the signed handicap line for the HOME selection (e.g. +1.5 =
  // home receives 1.5 points, i.e. home is the underdog) — callers that want
  // a "home spread magnitude, positive = favoured" number (this codebase's
  // `_spread` convention) must negate it themselves.
  spread?: { line: number; home: number; away: number };
  total?: { line: number; over: number; under: number };
  // Double Chance / team totals / odd-even: settlement.ts already grades
  // these generically for any sport (dc-hd/dc-da/dc-ha off plain
  // home/away/draw comparisons, goe-odd/goe-even off home+away parity,
  // b-tt-home/away-o/u-<line> off a plain score-vs-line check — see
  // scoreOutcomeForSel) so wiring real odds in needs no new settlement
  // code, unlike spread. Confirmed real (2026-08-27, onexbet
  // GET /live-events?sport=basketball and /basketball/leagues samples).
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  teamTotalHome?: { line: number; over: number; under: number };
  teamTotalAway?: { line: number; over: number; under: number };
  oddEven?: { odd: number; even: number };
  q1?: PulseScoreBasketballPeriodOverride;
  q3?: PulseScoreBasketballPeriodOverride;
  firstHalf?: PulseScoreBasketballPeriodOverride;
  // q2/q4/secondHalf — CONFIRMED real (2026-08-27, onexbet): the original
  // 2026-08-15 comment said these three periods were "not named in that
  // [bwin] sample" so extraction was deliberately limited to q1/q3/
  // firstHalf pending confirmation. A real onexbet sample now shows all
  // seven periods (q1-q4, both halves, full-time) for MATCH_RESULT/
  // OVER_UNDER/ASIAN_HANDICAP, so these three are added the same way.
  q2?: PulseScoreBasketballPeriodOverride;
  q4?: PulseScoreBasketballPeriodOverride;
  secondHalf?: PulseScoreBasketballPeriodOverride;
};

// Period values this file is confident about extracting — see this file's
// header for exactly which were confirmed real and why SECOND_QUARTER/
// FOURTH_QUARTER/SECOND_HALF are deliberately absent from this list.
const KNOWN_PERIODS = new Set([
  "FULL_TIME",
  "FIRST_QUARTER",
  "SECOND_QUARTER",
  "THIRD_QUARTER",
  "FOURTH_QUARTER",
  "FIRST_HALF",
  "SECOND_HALF",
]);

const seenUnknownPeriods = new Set<string>();
function recordUnknownPeriod(canonicalMarket: string, period: string): void {
  const key = `${canonicalMarket}:${period}`;
  if (seenUnknownPeriods.has(key)) return;
  seenUnknownPeriods.add(key);
  logger.info(
    { canonicalMarket, period },
    "[pulsescore] unmapped basketball market period seen — candidate to add once confirmed",
  );
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

function extractDoubleChance(
  market: PulseScoreMarket,
): { homeOrDraw: number; awayOrDraw: number; homeOrAway: number } | null {
  let hd: number | null = null;
  let da: number | null = null;
  let ha: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME_DRAW") hd = val;
    else if (sel.canonicalOutcome === "DRAW_AWAY") da = val;
    else if (sel.canonicalOutcome === "HOME_AWAY") ha = val;
  }
  return hd !== null && da !== null && ha !== null
    ? { homeOrDraw: hd, awayOrDraw: da, homeOrAway: ha }
    : null;
}

function extractOddEven(market: PulseScoreMarket): { odd: number; even: number } | null {
  let odd: number | null = null;
  let even: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "ODD") odd = val;
    else if (sel.canonicalOutcome === "EVEN") even = val;
  }
  return odd !== null && even !== null ? { odd, even } : null;
}

// HOME_OVER_UNDER/AWAY_OVER_UNDER share the exact same over/under selection
// shape as OVER_UNDER (extractTotal above) — just scoped to one team's own
// score instead of the combined total.
const extractTeamTotal = extractTotal;

/** Same extraction logic as the FULL_TIME block below, generalized to any
 * single period string — used both for FULL_TIME (via extractBasketballOverride)
 * and for the confirmed period-scoped blocks (FIRST_QUARTER, THIRD_QUARTER,
 * FIRST_HALF). Picks the most-even-odds line for the handicap/spread market
 * the same way FULL_TIME does, for the same reason (bwin lists several
 * alternate lines per period, not just per event). */
function extractPeriodBlock(
  markets: PulseScoreMarket[],
  period: string,
): PulseScoreBasketballPeriodOverride {
  const isThisPeriod = (m: PulseScoreMarket) => (m.period || "").toUpperCase() === period;
  const out: PulseScoreBasketballPeriodOverride = {};

  const moneylineMarkets = markets.filter(
    (m) => m.canonicalMarket === "MATCH_RESULT" && isThisPeriod(m),
  );
  const totalMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isThisPeriod(m),
  );
  const spreadMarkets = markets.filter(
    (m) =>
      (m.canonicalMarket === "ASIAN_HANDICAP" || m.canonicalMarket === "EUROPEAN_HANDICAP") &&
      isThisPeriod(m),
  );
  const doubleChanceMarkets = markets.filter(
    (m) => m.canonicalMarket === "DOUBLE_CHANCE" && isThisPeriod(m),
  );
  const homeTotalMarkets = markets.filter(
    (m) => m.canonicalMarket === "HOME_OVER_UNDER" && isThisPeriod(m),
  );
  const awayTotalMarkets = markets.filter(
    (m) => m.canonicalMarket === "AWAY_OVER_UNDER" && isThisPeriod(m),
  );
  const oddEvenMarkets = markets.filter(
    (m) => m.canonicalMarket === "TOTAL_GOALS_ODD_EVEN" && isThisPeriod(m),
  );

  if (moneylineMarkets.length === 1) {
    const ml = extractMoneyline(moneylineMarkets[0]!);
    if (ml) out.odds = ml;
  }
  if (totalMarkets.length === 1) {
    const tot = extractTotal(totalMarkets[0]!);
    if (tot) out.total = tot;
  }
  const spreadCandidates = spreadMarkets
    .map((m) => extractSpread(m))
    .filter((sp): sp is { line: number; home: number; away: number } => sp !== null);
  if (spreadCandidates.length > 0) {
    out.spread = spreadCandidates.reduce((best, cur) =>
      Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
    );
  }
  if (doubleChanceMarkets.length === 1) {
    const dc = extractDoubleChance(doubleChanceMarkets[0]!);
    if (dc) out.doubleChance = dc;
  }
  if (homeTotalMarkets.length === 1) {
    const tt = extractTeamTotal(homeTotalMarkets[0]!);
    if (tt) out.teamTotalHome = tt;
  }
  if (awayTotalMarkets.length === 1) {
    const tt = extractTeamTotal(awayTotalMarkets[0]!);
    if (tt) out.teamTotalAway = tt;
  }
  if (oddEvenMarkets.length === 1) {
    const oe = extractOddEven(oddEvenMarkets[0]!);
    if (oe) out.oddEven = oe;
  }
  return out;
}

/** Builds a market override from one PulseScore basketball event's Money
 * Line / Spread / Total markets — FULL_TIME plus the three confirmed
 * period-scoped blocks (q1/q3/firstHalf; see this file's header for why
 * q2/q4/secondHalf aren't included yet). FULL_TIME also carries Double
 * Chance / home+away team totals / odd-even (2026-08-27) — period-scoped
 * versions of those four aren't extracted yet, matches.ts only wires the
 * FULL_TIME ones in for now. Returns an empty object (not null) when none
 * are recognised yet — callers should only apply fields present. */
export function extractBasketballOverride(ev: PulseScoreEvent): PulseScoreBasketballOverride {
  const markets = ev.markets ?? [];
  const out: PulseScoreBasketballOverride = extractPeriodBlock(markets, "FULL_TIME");

  const q1 = extractPeriodBlock(markets, "FIRST_QUARTER");
  if (q1.odds || q1.spread || q1.total) out.q1 = q1;
  const q3 = extractPeriodBlock(markets, "THIRD_QUARTER");
  if (q3.odds || q3.spread || q3.total) out.q3 = q3;
  const firstHalf = extractPeriodBlock(markets, "FIRST_HALF");
  if (firstHalf.odds || firstHalf.spread || firstHalf.total) out.firstHalf = firstHalf;
  const q2 = extractPeriodBlock(markets, "SECOND_QUARTER");
  if (q2.odds || q2.spread || q2.total) out.q2 = q2;
  const q4 = extractPeriodBlock(markets, "FOURTH_QUARTER");
  if (q4.odds || q4.spread || q4.total) out.q4 = q4;
  const secondHalf = extractPeriodBlock(markets, "SECOND_HALF");
  if (secondHalf.odds || secondHalf.spread || secondHalf.total) out.secondHalf = secondHalf;

  const known = new Set([
    "MATCH_RESULT",
    "ASIAN_HANDICAP",
    "EUROPEAN_HANDICAP",
    "OVER_UNDER",
    "DOUBLE_CHANCE",
    "HOME_OVER_UNDER",
    "AWAY_OVER_UNDER",
    "TOTAL_GOALS_ODD_EVEN",
  ]);
  for (const market of markets) {
    if (!known.has(market.canonicalMarket)) {
      recordUnknownCanonicalMarket(market.canonicalMarket);
      continue;
    }
    const period = (market.period || "").toUpperCase();
    if (period && !KNOWN_PERIODS.has(period)) recordUnknownPeriod(market.canonicalMarket, period);
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
// file header), so this is the only onexbet consumer in this file.
const BASKETBALL_BOOKMAKER = "onexbet";

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
 * would sidestep that budget fight entirely for whichever events it has
 * fresh data on — but the real PulseScore docs (confirmed 2026-08-10)
 * settled that connection limits are per PLAN/ACCOUNT, not per sport, so
 * this can't run alongside football's own connection on the current PRO
 * plan (1 concurrent connection total). basketballWs.ts is built and ready
 * but not started — see api/index.ts for why.
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
//
// q1..q4/halftime/ot were bwin's real values. onexbet's real
// GET /live-events?sport=basketball sample (2026-08-27) instead sends full
// words — "1st quarter"/"2nd quarter"/"3rd quarter"/"4th quarter" — added
// below alongside the bwin keys (never seen "halftime"/"overtime" from
// onexbet yet, so those aren't added — an unrecognized period safely falls
// through to periodRank's -1/"keep REST" case above, not a wrong guess).
const PERIOD_RANK: Record<string, number> = {
  "not started": 0,
  q1: 1,
  "1st quarter": 1,
  q2: 2,
  "2nd quarter": 2,
  halftime: 3,
  q3: 4,
  "3rd quarter": 4,
  q4: 5,
  "4th quarter": 5,
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
