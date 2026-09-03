// Volleyball prematch odds from PulseScore. Built from scratch 2026-08-09,
// pinned to bwin (VOLLEYBALL_BOOKMAKER below) — volleyball had no
// PulseScore integration at all before this (odds came from the StatPal
// feed, since fully disconnected and removed — it used to recover final
// scores for old bets via matches.ts's scanVolleyballForFinished, also
// removed along with it — and a computeVolleyballExtras synthetic model
// that was written but never actually wired up anywhere).
//
// Live: originally split onto a separate bookmaker (bwin's volleyball live
// events carried no `score` field at all, only matchClock.period — see git
// history) then Unibet Australia ("unibetau"), which did carry real score/
// matchClock/statistics.sets. Both prematch and live moved to onexbet
// (1xBet) 2026-08-27 alongside every non-football sport — its docs
// explicitly confirm volleyball live events carry score/matchClock and a
// per-set statistics block, same shape unibetau had, so this reunifies
// prematch and live onto one bookmaker again. Not yet re-verified against a
// real onexbet live sample; if it turns out onexbet's volleyball live feed
// is missing score/statistics the way bwin's was, VOLLEYBALL_LIVE_BOOKMAKER
// below is the one line to revert back to "unibetau" — keep prematch and
// live independently overridable for exactly that reason.
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
  // Confirmed real (2026-08-28 onexbet /volleyball/events sample, beach
  // volleyball 4x4): FULL_TIME ASIAN_HANDICAP ("Handicap") — same
  // signed-line/multi-line HOME/AWAY shape already proven for tennis's
  // GAME_HANDICAP (extractGameHandicap in tennis.ts) — maps onto
  // AdvancedMarkets.volleyballExtra's existing handicapPoints field
  // (synthetic-only until now).
  handicapPoints?: { line: number; home: number; away: number };
  // SECOND_SET/THIRD_SET winner — same MATCH_RESULT canonicalMarket as set1
  // (isSet1WinnerMarket), just period SECOND_SET/THIRD_SET. Maps onto
  // volleyballExtra's existing set2/set3 fields (synthetic-only until now).
  set2?: { home: number; away: number };
  set3?: { home: number; away: number };
  // Per-set Total Points (OVER_UNDER, period SECOND_SET/THIRD_SET) — same
  // shape as the whole-match pointsLines, just scoped to one set.
  set2PointsLines?: Array<{ line: number; over: number; under: number }>;
  set3PointsLines?: Array<{ line: number; over: number; under: number }>;
  // Per-set points handicap (ASIAN_HANDICAP, period SECOND_SET/THIRD_SET) —
  // same shape as handicapPoints above, scoped to one set.
  set2HandicapPoints?: { line: number; home: number; away: number };
  set3HandicapPoints?: { line: number; home: number; away: number };
  // "Race To N Points" — a NEW canonicalMarket not seen for any other sport
  // in this codebase: multiple lines (5/10/15/20 points in the real
  // sample), each a HOME/AWAY 2-way ("which side reaches N points first in
  // this set") rather than an Over/Under total — confirmed real for
  // SECOND_SET/THIRD_SET only in the sample (no FULL_TIME/FIRST_SET
  // equivalent seen).
  raceToPointsSet2?: Array<{ line: number; home: number; away: number }>;
  raceToPointsSet3?: Array<{ line: number; home: number; away: number }>;
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

function isWinnerMarketForPeriod(market: PulseScoreMarket, period: string): boolean {
  return (
    market.canonicalMarket === "MATCH_RESULT" &&
    (market.period || "").toUpperCase() === period
  );
}

/** Signed-line handicap (ASIAN_HANDICAP, HOME/AWAY canonicalOutcome) — same
 * pairing/most-even-pick approach as tennis.ts's extractGameHandicap: pairs
 * HOME/AWAY selections by matching |line| and picks the closest-to-even
 * pair as the "main" line when several are offered. */
function extractHandicap(
  market: PulseScoreMarket,
): { line: number; home: number; away: number } | null {
  // Pairs HOME's own line X with AWAY's line at exactly -X rather than
  // matching |line| — a real onexbet baseball sample (2026-08-28,
  // ASIAN_HANDICAP run line) confirmed a single market can list HOME at
  // BOTH a negative AND a positive line simultaneously, which an |line|
  // pairing collides onto the same map key and silently drops one; see
  // baseball.ts's extractHandicapLines for the original bug/fix writeup.
  const homeByLine = new Map<number, number>();
  const awayByLine = new Map<number, number>();
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const line = sel.line ?? market.line;
    if (line === undefined) continue;
    if (sel.canonicalOutcome === "HOME") homeByLine.set(line, val);
    else if (sel.canonicalOutcome === "AWAY") awayByLine.set(line, val);
  }
  const pairs: Array<{ line: number; home: number; away: number }> = [];
  for (const [line, home] of homeByLine) {
    const away = awayByLine.get(-line);
    if (away !== undefined) pairs.push({ line, home, away });
  }
  if (pairs.length === 0) return null;
  return pairs.reduce((best, cur) =>
    Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
  );
}

/** "Race To N Points" — multiple lines (5/10/15/20 in the real sample), each
 * a HOME/AWAY 2-way ("which side reaches N points first"), not an
 * Over/Under total. Collects every line rather than picking one "main"
 * line — unlike a spread/total there's no natural "closest to even" pick,
 * every N is a genuinely distinct bettable market. */
function extractRaceToPoints(
  market: PulseScoreMarket,
): Array<{ line: number; home: number; away: number }> {
  const byLine = new Map<number, { home: number | null; away: number | null }>();
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const line = sel.line ?? market.line;
    if (line === undefined) continue;
    const entry = byLine.get(line) ?? { home: null, away: null };
    if (sel.canonicalOutcome === "HOME") entry.home = val;
    else if (sel.canonicalOutcome === "AWAY") entry.away = val;
    byLine.set(line, entry);
  }
  const out: Array<{ line: number; home: number; away: number }> = [];
  for (const [line, { home, away }] of byLine) {
    if (home !== null && away !== null) out.push({ line, home, away });
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

  const handicapMarket = markets.find(
    (m) => m.canonicalMarket === "ASIAN_HANDICAP" && isFullTimeMarket(m),
  );
  if (handicapMarket) {
    const h = extractHandicap(handicapMarket);
    if (h) out.handicapPoints = h;
  }

  const set2Markets = markets.filter((m) => isWinnerMarketForPeriod(m, "SECOND_SET"));
  if (set2Markets.length === 1) {
    const s2 = extractTwoWay(set2Markets[0]!);
    if (s2) out.set2 = s2;
  }
  const set3Markets = markets.filter((m) => isWinnerMarketForPeriod(m, "THIRD_SET"));
  if (set3Markets.length === 1) {
    const s3 = extractTwoWay(set3Markets[0]!);
    if (s3) out.set3 = s3;
  }

  const set2PointsMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && (m.period || "").toUpperCase() === "SECOND_SET",
  );
  const set2PointsLines = extractPointsLines(set2PointsMarkets);
  if (set2PointsLines.length > 0) out.set2PointsLines = set2PointsLines;
  const set3PointsMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && (m.period || "").toUpperCase() === "THIRD_SET",
  );
  const set3PointsLines = extractPointsLines(set3PointsMarkets);
  if (set3PointsLines.length > 0) out.set3PointsLines = set3PointsLines;

  const set2HandicapMarket = markets.find(
    (m) => m.canonicalMarket === "ASIAN_HANDICAP" && (m.period || "").toUpperCase() === "SECOND_SET",
  );
  if (set2HandicapMarket) {
    const h2 = extractHandicap(set2HandicapMarket);
    if (h2) out.set2HandicapPoints = h2;
  }
  const set3HandicapMarket = markets.find(
    (m) => m.canonicalMarket === "ASIAN_HANDICAP" && (m.period || "").toUpperCase() === "THIRD_SET",
  );
  if (set3HandicapMarket) {
    const h3 = extractHandicap(set3HandicapMarket);
    if (h3) out.set3HandicapPoints = h3;
  }

  const raceToPointsSet2Market = markets.find(
    (m) => m.canonicalMarket === "RACE_TO_POINTS" && (m.period || "").toUpperCase() === "SECOND_SET",
  );
  if (raceToPointsSet2Market) {
    const r2 = extractRaceToPoints(raceToPointsSet2Market);
    if (r2.length > 0) out.raceToPointsSet2 = r2;
  }
  const raceToPointsSet3Market = markets.find(
    (m) => m.canonicalMarket === "RACE_TO_POINTS" && (m.period || "").toUpperCase() === "THIRD_SET",
  );
  if (raceToPointsSet3Market) {
    const r3 = extractRaceToPoints(raceToPointsSet3Market);
    if (r3.length > 0) out.raceToPointsSet3 = r3;
  }

  // .find() here previously grabbed the FIRST CORRECT_SCORE market
  // unconditionally — every sibling extraction above instead uses
  // .filter().length===1 and skips on ambiguity rather than risk mixing up
  // markets (matchResultMarkets/set1Markets, same reasoning football.ts's
  // own isCorrectScoreMarket requires FULL_TIME for). Not confirmed via a
  // real bwin sample whether volleyball's CORRECT_SCORE ever carries a
  // per-set variant alongside a whole-match one, but this brings it in
  // line with the file's own established convention regardless — if bwin
  // ever sends more than one, skip rather than silently pick the wrong
  // one for a real bettable market (audit finding, 2026-08-10).
  const correctScoreMarkets = markets.filter((m) => m.canonicalMarket === "CORRECT_SCORE");
  if (correctScoreMarkets.length === 1) {
    const exactScore = extractExactScore(correctScoreMarkets[0]!);
    if (exactScore) out.exactScore = exactScore;
  }

  const known = new Set([
    "MATCH_RESULT",
    "OVER_UNDER",
    "CORRECT_SCORE",
    "OTHER",
    "ASIAN_HANDICAP",
    "RACE_TO_POINTS",
  ]);
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

// Pinned explicitly, same reasoning as hockey.ts's HOCKEY_BOOKMAKER.
const VOLLEYBALL_BOOKMAKER = "onexbet";

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
  if (!CONFIG.ENABLE_PULSESCORE) return [];
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

// ── Live (REST poll, Unibet Australia) ──────────────────────────────────────
// Neither bwin nor bet365 carry a usable live score for volleyball (both
// tried and reverted 2026-08-09 — see matches.ts's git history). A third
// bookmaker, "unibetau", DOES: confirmed real (2026-08-09) — matchClock has
// a genuine continuous {minute, second, running} clock (no "period" field
// at all, unlike football/basketball), `score` is the CURRENT set's points
// as strings (e.g. "24"/"19" — set 3 in progress at 24-19), and a
// `statistics.sets` block gives the completed sets' scores as parallel
// arrays ({home:[25,25], away:[20,13], homeServe:true}) — i.e. exactly the
// shape LiveMatchState._liveExtra.vollSets/currentPts (matches.ts) and
// home.tsx's "Placar por Set" panel already expected, just never had real
// data to fill them.
export type PulseScoreVolleyballLiveEvent = PulseScoreEvent & {
  matchClock?: { minute: number; second: number; running: boolean };
  statistics?: {
    sets?: {
      home?: number[];
      away?: number[];
      homeServe?: boolean;
    };
  };
};

type UnibetVolleyballLiveResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  sport: string;
  events: PulseScoreVolleyballLiveEvent[];
};

const VOLLEYBALL_LIVE_BOOKMAKER = "onexbet";
const VOLLEYBALL_LIVE_TTL_MS = 1_000; // same PRO-plan 1 req/s budget as other live pollers
let liveCache: { events: PulseScoreVolleyballLiveEvent[]; fetchedAt: number } | null = null;
let liveInFlight: Promise<PulseScoreVolleyballLiveEvent[]> | null = null;

async function fetchVolleyballLive(): Promise<PulseScoreVolleyballLiveEvent[]> {
  const data = await pulseScoreGet<UnibetVolleyballLiveResponse>(
    "/live-events?sport=volleyball&limit=200",
    undefined,
    VOLLEYBALL_LIVE_BOOKMAKER,
  );
  return Array.isArray(data?.events) ? data.events : [];
}

/** Live volleyball score from PulseScore (onexbet), REST-only.
 * Empty array if PULSESCORE_API_KEY isn't configured, or the upstream call
 * fails on the very first attempt (nothing cached yet to fall back to).
 * The live feed's own markets are not re-extracted here — extractVolleyballOverride
 * was built against bwin's "Match Result"/"Set 1 Winner"/"Total Points"/
 * "Correct Score" naming, and this bookmaker's rawName conventions weren't
 * confirmed to line up with it — matches.ts's live builder instead uses the
 * same synthetic-odds fallback prematch already falls back to when its
 * bookmaker hasn't priced a market, until this bookmaker's shapes are mapped
 * separately. Score/clock/sets are the part expected to work (same
 * statistics.sets shape unibetau confirmed real), not yet re-verified
 * against a live onexbet sample though — see this file's header. */
export async function getPulseScoreVolleyballLive(): Promise<PulseScoreVolleyballLiveEvent[]> {
  if (!CONFIG.ENABLE_PULSESCORE) return [];
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
