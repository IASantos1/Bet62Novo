// Baseball (MLB/minor league) prematch odds from PulseScore (onexbet).
// Built from scratch 2026-08-28 — baseball had NO PulseScore prematch
// integration before this: prematch odds still came entirely from the old
// StatPal/SportsAPI V2 pipeline (matches.ts's getMLBOdds, since removed
// along with the rest of StatPal), and even baseball's LIVE PulseScore
// integration (genericSportLive.ts's
// pulseScoreBaseball, already on onexbet since 2026-08-27) only ever
// extracted the plain moneyline/total/doubleChance/oddEven generically —
// no run line, no F5, no props, and prematch not touched at all.
//
// Confirmed real against a fresh onexbet GET /baseball/events sample
// (2026-08-28, "Minor League Baseball" league, several events): every
// sampled event carries these canonicalMarkets at period FULL_TIME:
//   MATCH_RESULT/"1X2" — HOME/AWAY only (baseball has no draws at the
//     game level, unlike hockey/football's 3-way).
//   ASIAN_HANDICAP/"Handicap" — the run line, signed, multiple alternate
//     lines per event (same shape already proven for tennis's
//     GAME_HANDICAP/hockey's spread) — picks the most-even-odds line as
//     `runLine`, but ALSO returns every line collected (`runLineLines`)
//     since the existing frontend/settlement convention
//     (mlb-rl-home-1.5/rl-home) expects a fixed ±1.5 split specifically,
//     not just "whichever line the bookmaker considers main".
//   OVER_UNDER/"Total" — run total, multiple alternate lines (same
//     pattern as every other sport's totals market).
//   MATCH_RESULT/"1-5 Inning 1X2" (period FIRST_FIVE_INNINGS) — the F5
//     market. Genuinely 3-way (HOME/DRAW/AWAY) since 5 innings can tie —
//     the existing mlbExtra.f5Result UI/settlement (mlb-f5-home/away,
//     void-on-tie) only ever expected a 2-way home/away shape, which this
//     naturally satisfies (draw price collected too but not surfaced,
//     same as the existing UI has no F5-draw slot).
//   OVER_UNDER/"1-5 Inning Total" (period FIRST_FIVE_INNINGS) — F5 total.
// Per-inning-only markets (1st/2nd inning 1X2/Total/Handicap), team totals
// (HOME_OVER_UNDER/AWAY_OVER_UNDER), odd/even (TOTAL_GOALS_ODD_EVEN), and
// the four game-level props (First Run, Extra Inning, Team To Score Last
// Run, Most Runs In Inning, Highest Scoring Inning) are all real in the
// same sample too but deliberately NOT extracted here — each would need a
// brand new AdvancedMarkets field plus new settlement plus new frontend UI
// (unlike moneyline/run line/total/F5, which slot directly into fields
// that already exist and already settle correctly), out of scope for this
// first pass; add when actually requested.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
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
    "[pulsescore] unmapped baseball canonicalMarket seen — candidate to add to the override mapping",
  );
}

export type PulseScoreBaseballOverride = {
  odds?: { home: number; away: number };
  runLine?: { line: number; home: number; away: number };
  runLineLines?: Array<{ line: number; home: number; away: number }>;
  totalLines?: Array<{ line: number; over: number; under: number }>;
  f5?: { home: number; away: number };
  f5Total?: { line: number; over: number; under: number };
};

function isFullTimeMarket(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FULL_TIME";
}

function isF5Market(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FIRST_FIVE_INNINGS";
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

/** Signed-line handicap (ASIAN_HANDICAP, HOME/AWAY canonicalOutcome).
 * Confirmed real (2026-08-28 sample): a single market can list HOME at BOTH
 * a negative (favorite) line AND a positive (underdog) line simultaneously
 * (e.g. home at -1.5, -1, 1, 1.5, 2, ...), not just one direction like
 * tennis's GAME_HANDICAP sample only ever showed — pairing by matching
 * |line| (tennis's approach) would collide two genuinely different pairs
 * onto the same map key and silently drop one. Pairs HOME's own line X with
 * AWAY's line at exactly -X instead (the real complementary Asian handicap
 * pair), which correctly keeps both directions as distinct lines. Returns
 * every paired line (sorted), not just one picked. */
function extractHandicapLines(
  market: PulseScoreMarket,
): Array<{ line: number; home: number; away: number }> {
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
  for (const [line, homeOdds] of homeByLine) {
    const awayOdds = awayByLine.get(-line);
    if (awayOdds !== undefined) pairs.push({ line, home: homeOdds, away: awayOdds });
  }
  return pairs.sort((a, b) => a.line - b.line);
}

function extractTotalLines(
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

function pickMostEvenLine(
  lines: Array<{ line: number; over: number; under: number }>,
): { line: number; over: number; under: number } | undefined {
  if (lines.length === 0) return undefined;
  return lines.reduce((best, cur) =>
    Math.abs(cur.over - cur.under) < Math.abs(best.over - best.under) ? cur : best,
  );
}

function pickMostEvenHandicap(
  lines: Array<{ line: number; home: number; away: number }>,
): { line: number; home: number; away: number } | undefined {
  if (lines.length === 0) return undefined;
  return lines.reduce((best, cur) =>
    Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
  );
}

/** Builds a market override from one PulseScore baseball event's Match
 * Result / Handicap (run line) / Total / F5 markets. Returns an empty
 * object (not null) when none are recognised yet — callers should only
 * apply fields present. */
export function extractBaseballOverride(ev: PulseScoreEvent): PulseScoreBaseballOverride {
  const out: PulseScoreBaseballOverride = {};
  const markets = ev.markets ?? [];

  const moneylineMarkets = markets.filter(
    (m) => m.canonicalMarket === "MATCH_RESULT" && isFullTimeMarket(m),
  );
  if (moneylineMarkets.length === 1) {
    const ml = extractMoneyline(moneylineMarkets[0]!);
    if (ml) out.odds = ml;
  }

  const handicapMarkets = markets.filter(
    (m) => m.canonicalMarket === "ASIAN_HANDICAP" && isFullTimeMarket(m),
  );
  const runLineLines = handicapMarkets.flatMap((m) => extractHandicapLines(m));
  if (runLineLines.length > 0) {
    out.runLineLines = runLineLines;
    out.runLine = pickMostEvenHandicap(runLineLines);
  }

  const totalMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isFullTimeMarket(m),
  );
  const totalLines = extractTotalLines(totalMarkets);
  if (totalLines.length > 0) out.totalLines = totalLines;

  const f5Markets = markets.filter(
    (m) => m.canonicalMarket === "MATCH_RESULT" && isF5Market(m),
  );
  if (f5Markets.length === 1) {
    const f5 = extractMoneyline(f5Markets[0]!);
    if (f5) out.f5 = f5;
  }

  const f5TotalMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isF5Market(m),
  );
  const f5Total = pickMostEvenLine(extractTotalLines(f5TotalMarkets));
  if (f5Total) out.f5Total = f5Total;

  const known = new Set(["MATCH_RESULT", "ASIAN_HANDICAP", "OVER_UNDER"]);
  for (const market of markets) {
    if (!known.has(market.canonicalMarket)) {
      recordUnknownCanonicalMarket(market.canonicalMarket, market.rawName);
    }
  }
  return out;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Same paginated-leagues-with-nested-events envelope confirmed for every
// other sport (total/page/limit/totalPages/hasNextPage/leagues[]).
// Baseball's league field is a bare string (e.g. "Minor League Baseball")
// — no pipe-delimited country prefix, same as basketball/hockey/volleyball
// — so country is hardcoded "Internacional" the same way.
export type PulseScoreBaseballPrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreBaseballLeague = {
  name: string;
  sport: string;
  events: PulseScoreBaseballPrematchEvent[];
  league: string;
};

type PulseScoreBaseballLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreBaseballLeague[];
};

const BASEBALL_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScoreBaseballPrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScoreBaseballPrematchEvent[]> | null = null;

// Pinned explicitly, same reasoning as hockey.ts's HOCKEY_BOOKMAKER — this
// module is prematch-only, no live poller of its own to share a budget
// with (baseball live stays on genericSportLive.ts's own onexbet consumer).
const BASEBALL_BOOKMAKER = "onexbet";

async function fetchAllBaseballLeagues(): Promise<PulseScoreBaseballLeague[]> {
  const leagues: PulseScoreBaseballLeague[] = [];
  let page = 1;
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreBaseballLeaguesResponse>(
      `/baseball/leagues?page=${page}&limit=30`,
      { bookmaker: BASEBALL_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchBaseballUpcoming(): Promise<PulseScoreBaseballPrematchEvent[]> {
  const leagues = await fetchAllBaseballLeagues();
  return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
}

/** Upcoming baseball fixtures from PulseScore (onexbet), each carrying its
 * Match Result / Handicap (run line) / Total / F5 prematch odds when priced
 * yet. Empty array if PULSESCORE_API_KEY isn't configured, or the upstream
 * call fails on the very first attempt (nothing cached yet to fall back
 * to). */
export async function getPulseScoreBaseballUpcoming(): Promise<PulseScoreBaseballPrematchEvent[]> {
  if (!CONFIG.ENABLE_PULSESCORE) return [];
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < BASEBALL_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchBaseballUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] baseball upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}
