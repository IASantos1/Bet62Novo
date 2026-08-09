// Basketball prematch odds from PulseScore. Pinned to its own "bwin"
// bookmaker (BASKETBALL_BOOKMAKER below) as of 2026-08-09, mirroring
// football.ts's move — same REST/cache/pacing pattern. Live is NOT
// implemented here yet: no real /live-events?sport=basketball sample has
// been seen for either bookmaker, only the prematch /basketball/leagues
// catalog (whose embedded live:true event carried markets:[], same
// "catalog never carries live odds" pattern already confirmed for
// football/tennis) — needed before that path can be wired up without
// guessing.
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
