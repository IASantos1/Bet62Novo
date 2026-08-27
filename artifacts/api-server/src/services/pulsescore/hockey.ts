// Ice hockey prematch odds from PulseScore. Pinned to its own bookmaker
// (HOCKEY_BOOKMAKER below) — bwin from 2026-08-09, moved to onexbet (1xBet)
// 2026-08-27 alongside every non-football sport. Built from scratch
// 2026-08-09 — hockey had no PulseScore integration at all before this
// (odds came from a since-disconnected Statpal/SportsAPI Pro feed, with
// most markets synthetic — see matches.ts's makeHockeyMarketsFromTeams).
// Prematch-only here, reading only canonicalMarket/canonicalOutcome (which
// PulseScore documents as identical across bookmakers) — live hockey comes
// from genericSportLive.ts's separate REST poller (also moved to onexbet).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

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
    "[pulsescore] unmapped hockey canonicalMarket seen — candidate to add to the override mapping",
  );
}

// ── canonicalMarket → our own market shape ──────────────────────────────────
// Verified against a real bwin GET /ice-hockey/leagues sample (2026-08-09, 3
// leagues: Australian Ice Hockey League, NHL, Ruslan Salei Cup). Unlike
// football/basketball/tennis, hockey's moneyline is NOT canonicalMarket
// "MATCH_RESULT" — every sampled event carries TWO separate result markets,
// both canonicalMarket "OTHER":
//   "3-Way - Result After Regular Time" — HOME/DRAW/AWAY (a draw is a real
//     regulation-time outcome in hockey), matches this codebase's existing
//     hockey odds shape (home/draw/away, see matches.ts's
//     makeHockeyMarketsFromTeams/HockeyOddsEntry) — used as `odds` below.
//   "2-Way (Incl. Overtime And Penalties)" — decisive winner including
//     OT/shootout, no draw possible — NOT extracted here, out of scope for
//     this first pass (no existing field to put it in without inventing a
//     new one; add when actually requested).
// Selections carry canonicalOutcome HOME/AWAY/DRAW explicitly on some events
// (Australian league) but "OTHER" with just the short team name on others
// (NHL: "Panthers"/"Hurricanes" vs ev.home "Florida Panthers"/ev.away
// "Carolina Hurricanes") — teamNamesMatch's new suffix fallback (added
// alongside this file) handles that case.
// Handicap is canonicalMarket "ASIAN_HANDICAP" (rawName varies: "Handicap
// (regular time)" or "Spread (including overtime and shoot-outs)" — matched
// by canonicalMarket alone, not rawName), `line` on the market like every
// other bwin sport, multiple alternate lines per event (same as
// basketball's Handicap) — picks the most-even-odds line.
// Totals is canonicalMarket "OVER_UNDER" (rawName "Totals (regular time)" /
// "Totals (including overtime and shoot-outs)"), `line` on the market.
export type PulseScoreHockeyOverride = {
  odds?: { home: number; draw: number; away: number };
  // Same convention as basketball.ts's spread: signed line for HOME.
  spread?: { line: number; home: number; away: number };
  total?: { line: number; over: number; under: number };
};

function isFullTimeMarket(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FULL_TIME";
}

function isThreeWayResultMarket(market: PulseScoreMarket): boolean {
  return (
    market.canonicalMarket === "OTHER" &&
    isFullTimeMarket(market) &&
    (market.rawName || "").trim().toLowerCase() === "3-way - result after regular time"
  );
}

function extractMoneyline(
  market: PulseScoreMarket,
  home: string,
  away: string,
): { home: number; draw: number; away: number } | null {
  let homeOdds: number | null = null;
  let drawOdds: number | null = null;
  let awayOdds: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") homeOdds = val;
    else if (sel.canonicalOutcome === "AWAY") awayOdds = val;
    else if (sel.canonicalOutcome === "DRAW") drawOdds = val;
    else if (teamNamesMatch(sel.rawName, home)) homeOdds = val;
    else if (teamNamesMatch(sel.rawName, away)) awayOdds = val;
  }
  return homeOdds !== null && drawOdds !== null && awayOdds !== null
    ? { home: homeOdds, draw: drawOdds, away: awayOdds }
    : null;
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

/** Builds a market override from one PulseScore hockey event's 3-Way Result
 * / Handicap / Totals markets. Returns an empty object (not null) when none
 * are recognised yet — callers should only apply fields present. */
export function extractHockeyOverride(ev: PulseScoreEvent): PulseScoreHockeyOverride {
  const out: PulseScoreHockeyOverride = {};
  const home = ev.home?.trim() ?? "";
  const away = ev.away?.trim() ?? "";
  const moneylineMarkets = (ev.markets ?? []).filter(isThreeWayResultMarket);
  const spreadMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "ASIAN_HANDICAP" && isFullTimeMarket(m),
  );
  const totalMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isFullTimeMarket(m),
  );

  // Every real sample so far carries exactly one 3-Way/Totals market — skip
  // rather than risk mixing them up if that ever isn't true, same caution as
  // football/basketball.
  if (moneylineMarkets.length === 1) {
    const ml = extractMoneyline(moneylineMarkets[0]!, home, away);
    if (ml) out.odds = ml;
  }
  if (totalMarkets.length === 1) {
    const tot = extractTotal(totalMarkets[0]!);
    if (tot) out.total = tot;
  }
  // Handicap: bwin lists several alternate FULL_TIME lines per event (same
  // pattern already confirmed for basketball) — pick the one closest to even
  // odds as the "main" line.
  const spreadCandidates = spreadMarkets
    .map((m) => extractSpread(m))
    .filter((sp): sp is { line: number; home: number; away: number } => sp !== null);
  if (spreadCandidates.length > 0) {
    out.spread = spreadCandidates.reduce((best, cur) =>
      Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
    );
  }

  const known = new Set(["OTHER", "ASIAN_HANDICAP", "OVER_UNDER"]);
  for (const market of ev.markets ?? []) {
    if (!known.has(market.canonicalMarket)) recordUnknownCanonicalMarket(market.canonicalMarket, market.rawName);
  }
  return out;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Same paginated-leagues-with-nested-events envelope already confirmed for
// football/tennis/basketball (total/page/limit/totalPages/hasNextPage/
// leagues[]). Hockey's league field is a bare string (e.g. "NHL",
// "Australian Ice Hockey League") — no pipe-delimited country prefix, same
// as basketball — so country is hardcoded "Internacional" the same way.
export type PulseScoreHockeyPrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreHockeyLeague = {
  name: string;
  sport: string;
  events: PulseScoreHockeyPrematchEvent[];
  league: string;
};

type PulseScoreHockeyLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreHockeyLeague[];
};

const HOCKEY_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScoreHockeyPrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScoreHockeyPrematchEvent[]> | null = null;

// Pinned explicitly, same reasoning as basketball.ts's BASKETBALL_BOOKMAKER —
// hockey has no live poller of its own to share a budget with yet (see file
// header), so this is the only onexbet consumer in this file.
const HOCKEY_BOOKMAKER = "onexbet";

async function fetchAllHockeyLeagues(): Promise<PulseScoreHockeyLeague[]> {
  const leagues: PulseScoreHockeyLeague[] = [];
  let page = 1;
  // Real sample: total 3 leagues at limit=7 -> 1 page. Paced the same
  // 4s/page as football/tennis/basketball's prematch fetch even though
  // hockey's catalog is far smaller — nothing user-facing waits on it
  // (served from its own cache), so there's no cost to keeping the same
  // conservative pacing.
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreHockeyLeaguesResponse>(
      `/ice-hockey/leagues?page=${page}&limit=30`,
      { bookmaker: HOCKEY_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchHockeyUpcoming(): Promise<PulseScoreHockeyPrematchEvent[]> {
  const leagues = await fetchAllHockeyLeagues();
  return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
}

/** Upcoming hockey fixtures from PulseScore (bwin), each carrying its 3-Way
 * Result / Handicap / Totals prematch odds when bwin has priced it yet.
 * Empty array if PULSESCORE_API_KEY isn't configured, or the upstream call
 * fails on the very first attempt (nothing cached yet to fall back to). */
export async function getPulseScoreHockeyUpcoming(): Promise<PulseScoreHockeyPrematchEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < HOCKEY_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchHockeyUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] hockey upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}
