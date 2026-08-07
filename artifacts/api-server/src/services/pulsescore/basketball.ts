// Basketball prematch odds from PulseScore (bet365), REST-polled — same
// bookmaker/cache/pacing pattern as football.ts. Live is NOT implemented here
// yet: the only real sample seen so far is GET /api/v3/bet365/basketball/leagues
// (2026-08-07), whose embedded live:true event carried markets:[] (same
// "catalog never carries live odds" pattern already confirmed for football/
// tennis) — a real /live-events?sport=basketball sample is needed before that
// path can be wired up without guessing.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { pulseScoreGet, type PulseScoreEvent, type PulseScoreMarket } from "./client.js";

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
// Verified against a real authenticated GET /api/v3/bet365/basketball/leagues
// call (2026-08-07): every sampled event carried exactly these three markets,
// each with a stable canonicalMarket name (unlike football, which needed a
// rawName fallback) — "ASIAN_HANDICAP"/"Spread" (canonicalOutcome HOME/AWAY,
// each selection carrying its OWN `line`), "OVER_UNDER"/"Total"
// (canonicalOutcome OVER/UNDER, one line per event), "MATCH_RESULT"/
// "Money Line" (canonicalOutcome HOME/AWAY, no draw). Only these three are
// mapped for now; anything else seen in real traffic is logged once instead
// of guessed at.
export type PulseScoreBasketballOverride = {
  odds?: { home: number; away: number };
  // `line` is bet365's own signed handicap line for the HOME selection (e.g.
  // +1.5 = home receives 1.5 points, i.e. home is the underdog) — callers
  // that want a "home spread magnitude, positive = favoured" number (this
  // codebase's `_spread` convention) must negate it themselves.
  spread?: { line: number; home: number; away: number };
  total?: { line: number; over: number; under: number };
};

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
    if (!sel.isActive || sel.line === undefined) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") {
      homeOdds = val;
      homeLine = sel.line;
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
    if (!sel.isActive || sel.line === undefined) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "OVER") {
      over = val;
      line = sel.line;
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
  const moneylineMarkets = (ev.markets ?? []).filter((m) => m.canonicalMarket === "MATCH_RESULT");
  const spreadMarkets = (ev.markets ?? []).filter((m) => m.canonicalMarket === "ASIAN_HANDICAP");
  const totalMarkets = (ev.markets ?? []).filter((m) => m.canonicalMarket === "OVER_UNDER");

  // If more than one of a market type shows up (e.g. per-period odds
  // alongside the overall match), skip rather than risk mixing them up —
  // same caution as football/genericSportLive.
  if (moneylineMarkets.length === 1) {
    const ml = extractMoneyline(moneylineMarkets[0]!);
    if (ml) out.odds = ml;
  }
  if (spreadMarkets.length === 1) {
    const sp = extractSpread(spreadMarkets[0]!);
    if (sp) out.spread = sp;
  }
  if (totalMarkets.length === 1) {
    const tot = extractTotal(totalMarkets[0]!);
    if (tot) out.total = tot;
  }

  const known = new Set(["MATCH_RESULT", "ASIAN_HANDICAP", "OVER_UNDER"]);
  for (const market of ev.markets ?? []) {
    if (!known.has(market.canonicalMarket)) recordUnknownCanonicalMarket(market.canonicalMarket);
  }
  return out;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Verified against a real authenticated GET /api/v3/bet365/basketball/leagues
// call (2026-08-07) — same paginated-leagues-with-nested-events envelope
// already confirmed for football/tennis (total/page/limit/totalPages/
// hasNextPage/leagues[]). Unlike football ("Country||League") and tennis
// ("Tour||League"), basketball's league field is a bare string (e.g.
// "Argentina La Liga Federal") — no pipe-delimited country prefix, so no
// countryForLeagueName lookup is attempted; country is hardcoded
// "Internacional" the same way tennis's builder does it, since there's no
// existing basketball country/catalog table in this codebase to reuse.
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

async function fetchAllBasketballLeagues(): Promise<PulseScoreBasketballLeague[]> {
  const leagues: PulseScoreBasketballLeague[] = [];
  let page = 1;
  // Real sample: total 33 leagues at limit=30 -> 2 pages. Paced the same
  // 4s/page as football/tennis's prematch fetch even though basketball's
  // catalog is far smaller — this shares bet365's 1 req/s budget with the
  // live pollers, and nothing user-facing waits on it (served from its own
  // cache), so there's no cost to keeping the same conservative pacing.
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGet<PulseScoreBasketballLeaguesResponse>(
      `/basketball/leagues?page=${page}&limit=30`,
    );
    if (Array.isArray(data?.leagues)) leagues.push(...data.leagues);
    if (!data?.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchBasketballUpcoming(): Promise<PulseScoreBasketballPrematchEvent[]> {
  try {
    const leagues = await fetchAllBasketballLeagues();
    // live:true entries here never carry markets (see file header) — keep
    // this prematch-only until a real live-events sample is confirmed.
    return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
  } catch {
    return [];
  }
}

/** Upcoming basketball fixtures from PulseScore (bet365), each carrying its
 * Money Line / Spread / Total prematch odds when bet365 has priced it yet.
 * Empty array if PULSESCORE_API_KEY isn't configured or the upstream call
 * fails. */
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
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}
