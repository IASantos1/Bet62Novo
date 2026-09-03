// MMA prematch odds from PulseScore (onexbet). New sport, built from scratch
// 2026-08-28 — MMA had no PulseScore integration, and no PulseScore
// integration for ANY combat sport, before this.
//
// Confirmed real (2026-08-28, onexbet GET /mma/leagues-style prematch
// sample, 134 events total across two moreInfo.sportId values — 56 for
// "Combatsport. BFL" cards, 189 for "Road to UFC" — both under the same
// top-level sport: "mma"): every sampled event carries exactly these four
// canonicalMarkets, all period FULL_TIME (MMA fights have no
// quarters/halves/sets/periods, so unlike every other sport this file's
// sibling files handle, there is no period-scoping to do here at all):
//   MATCH_RESULT/"1X2" — HOME/DRAW/AWAY, the standard 3-way shape. A draw
//     (judges' scorecard tie) is a real, if extremely rare, MMA outcome.
//   OTHER/"Win (2Way)" — HOME/AWAY only, no draw. Selections carry
//     canonicalOutcome "OTHER" on both (not HOME/AWAY) with rawName "W1"/
//     "W2" — matched by rawName, same shape as the "3-Way - Result After
//     Regular Time" market hockey.ts already handles. Preferred over 1X2
//     as the primary `odds` field: a clean {home,away} shape needs no
//     draw handling downstream, and settlement's generic home>away/
//     away>home keys only ever need to know who won — a draw pushes only
//     the 1X2 selection specifically, not the vast majority of bets which
//     are 2-way. FULL_TIME 1X2 is kept too (`odds1x2`) since some callers
//     may want the draw price specifically.
//   DOUBLE_CHANCE — HOME_DRAW/DRAW_AWAY/HOME_AWAY, same shape every other
//     sport uses. settlement.ts already grades this generically off a
//     plain home/away/draw comparison — no new settlement code needed.
//   OVER_UNDER/"Total" — round total (e.g. "Over (1.5)"/"Under (1.5)"),
//     OVER/UNDER canonicalOutcome, same shape as every other sport's
//     totals market. UNLIKE every other sport's total, though, this is
//     NOT gradeable by the generic ft.home+ft.away key — MMA's "final
//     score" isn't a home/away tally, it's decided by decision/KO/
//     submission, with the total being about WHICH ROUND the fight ended
//     in. See settlement.ts's mma-round- key for how this is graded (or,
//     honestly, not yet gradeable — see that key's own comment).
//
// A sixth market, OTHER/"Will The Specified Round Start" (a per-round
// yes/no proposition, `line` = round number), is deliberately NOT
// extracted — an exotic prop, out of scope for this first pass.
//
// Three more real, confirmed markets added 2026-08-28 (same onexbet
// /mma/events sample, checked again against a real card): all canonicalMarket
// "OTHER"/period FULL_TIME, same as Win(2Way):
//   "Fight To Go The Distance" — plain Yes/No (rawName "Yes"/"No").
//   "Win Inside The Distance" — plain Yes/No, same shape.
//   "Method Of Victory" — a single combined market covering both fighters:
//     "Decision W1 - Yes"/"- No", "Decision W2 - Yes"/"- No" (win by judges'
//     scorecard), "1 Will Win By KO, TKO, Painful Lock, Chokehold, DQ or
//     Refusal - Yes"/"- No", "2 Will Win By KO, TKO, ... - Yes"/"- No" (win
//     by any finish), and an optional single-priced "Draw Or Technical
//     Draw" (not every sample carried it — a draw-priced fight is rare).
//     W1=home, W2=away, matching this file's existing Win(2Way) convention.
// All three settle the same way this file's header already describes for
// everything else here: manually via the admin panel, since MMA has no
// live/results pipeline yet — not a new gap these three markets introduce.
//
// Also NOT built here: any live-odds or result-finalization pipeline.
// Every other sport in this codebase had a real GET /live-events or
// /results sample to build its live poller and finished-match detection
// against (see e.g. football.ts's isPulseScoreEventFinished callers, or
// hockey.ts's own "Live is NOT implemented here yet... no real sample has
// been seen" history before it got one). No such sample exists yet for
// MMA — every event sampled so far has `live: false`. Wiring up live
// tracking or automatic settlement without a real sample to verify the
// shape against is exactly the kind of guess this codebase's own history
// (see tennis.ts/volleyball.ts's headers) warns against — prematch odds
// here are real and bettable, but a finished MMA fight needs manual
// settlement via the admin panel until a live/results sample lets this
// be built for real.
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
    "[pulsescore] unmapped mma canonicalMarket seen — candidate to add to the override mapping",
  );
}

export type PulseScoreMmaOverride = {
  // Preferred moneyline — "Win (2Way)", no draw. See this file's header.
  odds?: { home: number; away: number };
  // 1X2 including the draw price, kept separate since most callers want
  // the cleaner 2-way `odds` above.
  odds1x2?: { home: number; draw: number; away: number };
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  total?: { line: number; over: number; under: number };
  goTheDistance?: { yes: number; no: number };
  winInsideDistance?: { yes: number; no: number };
  methodOfVictory?: {
    homeDecision?: { yes: number; no: number };
    homeInside?: { yes: number; no: number };
    awayDecision?: { yes: number; no: number };
    awayInside?: { yes: number; no: number };
    draw?: number;
  };
};

function isFullTimeMarket(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FULL_TIME";
}

function isWin2WayMarket(market: PulseScoreMarket): boolean {
  return (
    market.canonicalMarket === "OTHER" &&
    isFullTimeMarket(market) &&
    (market.rawName || "").trim().toLowerCase() === "win (2way)"
  );
}

function extractWin2Way(market: PulseScoreMarket): { home: number; away: number } | null {
  let home: number | null = null;
  let away: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim().toUpperCase();
    if (raw === "W1") home = val;
    else if (raw === "W2") away = val;
  }
  return home !== null && away !== null ? { home, away } : null;
}

function extract1X2(market: PulseScoreMarket): { home: number; draw: number; away: number } | null {
  let home: number | null = null;
  let draw: number | null = null;
  let away: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") home = val;
    else if (sel.canonicalOutcome === "AWAY") away = val;
    else if (sel.canonicalOutcome === "DRAW") draw = val;
  }
  return home !== null && draw !== null && away !== null ? { home, draw, away } : null;
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

/** Plain Yes/No market (canonicalOutcome "OTHER", rawName "Yes"/"No") —
 * used by "Fight To Go The Distance" and "Win Inside The Distance". */
function extractYesNo(market: PulseScoreMarket): { yes: number; no: number } | null {
  let yes: number | null = null;
  let no: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim().toLowerCase();
    if (raw === "yes") yes = val;
    else if (raw === "no") no = val;
  }
  return yes !== null && no !== null ? { yes, no } : null;
}

/** "Method Of Victory" — a single combined market listing Yes/No rows for
 * each fighter's decision/inside-the-distance win, plus an optional
 * single-priced draw row. See this file's header for the exact rawName
 * shapes confirmed real. */
function extractMethodOfVictory(
  market: PulseScoreMarket,
): PulseScoreMmaOverride["methodOfVictory"] | null {
  const out: PulseScoreMmaOverride["methodOfVictory"] = {};
  const pending: Record<string, { yes: number | null; no: number | null }> = {
    homeDecision: { yes: null, no: null },
    awayDecision: { yes: null, no: null },
    homeInside: { yes: null, no: null },
    awayInside: { yes: null, no: null },
  };
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim();
    if (/^draw or technical draw$/i.test(raw)) {
      out.draw = val;
      continue;
    }
    const m = /^(.*)-\s*(Yes|No)$/i.exec(raw);
    if (!m) continue;
    const prefix = m[1]!.trim().toLowerCase();
    const answer = m[2]!.toLowerCase() as "yes" | "no";
    let key: string | null = null;
    if (prefix === "decision w1") key = "homeDecision";
    else if (prefix === "decision w2") key = "awayDecision";
    else if (/^1 will win by ko/i.test(prefix)) key = "homeInside";
    else if (/^2 will win by ko/i.test(prefix)) key = "awayInside";
    if (!key) continue;
    pending[key]![answer] = val;
  }
  for (const key of ["homeDecision", "awayDecision", "homeInside", "awayInside"] as const) {
    const { yes, no } = pending[key]!;
    if (yes !== null && no !== null) out[key] = { yes, no };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Builds a market override from one PulseScore MMA event's Win(2Way) / 1X2 /
 * Double Chance / Total(rounds) markets. Returns an empty object (not null)
 * when none are recognised yet — callers should only apply fields present. */
export function extractMmaOverride(ev: PulseScoreEvent): PulseScoreMmaOverride {
  const out: PulseScoreMmaOverride = {};
  const markets = ev.markets ?? [];

  const win2WayMarkets = markets.filter(isWin2WayMarket);
  if (win2WayMarkets.length === 1) {
    const w2 = extractWin2Way(win2WayMarkets[0]!);
    if (w2) out.odds = w2;
  }

  const matchResultMarkets = markets.filter(
    (m) => m.canonicalMarket === "MATCH_RESULT" && isFullTimeMarket(m),
  );
  if (matchResultMarkets.length === 1) {
    const ml = extract1X2(matchResultMarkets[0]!);
    if (ml) {
      out.odds1x2 = ml;
      if (!out.odds) out.odds = { home: ml.home, away: ml.away };
    }
  }

  const doubleChanceMarkets = markets.filter(
    (m) => m.canonicalMarket === "DOUBLE_CHANCE" && isFullTimeMarket(m),
  );
  if (doubleChanceMarkets.length === 1) {
    const dc = extractDoubleChance(doubleChanceMarkets[0]!);
    if (dc) out.doubleChance = dc;
  }

  const totalMarkets = markets.filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isFullTimeMarket(m),
  );
  if (totalMarkets.length === 1) {
    const tot = extractTotal(totalMarkets[0]!);
    if (tot) out.total = tot;
  }

  const goDistanceMarket = markets.find(
    (m) =>
      m.canonicalMarket === "OTHER" &&
      isFullTimeMarket(m) &&
      (m.rawName || "").trim().toLowerCase() === "fight to go the distance",
  );
  if (goDistanceMarket) {
    const gd = extractYesNo(goDistanceMarket);
    if (gd) out.goTheDistance = gd;
  }

  const winInsideMarket = markets.find(
    (m) =>
      m.canonicalMarket === "OTHER" &&
      isFullTimeMarket(m) &&
      (m.rawName || "").trim().toLowerCase() === "win inside the distance",
  );
  if (winInsideMarket) {
    const wi = extractYesNo(winInsideMarket);
    if (wi) out.winInsideDistance = wi;
  }

  const methodMarket = markets.find(
    (m) =>
      m.canonicalMarket === "OTHER" &&
      isFullTimeMarket(m) &&
      (m.rawName || "").trim().toLowerCase() === "method of victory",
  );
  if (methodMarket) {
    const mov = extractMethodOfVictory(methodMarket);
    if (mov) out.methodOfVictory = mov;
  }

  const known = new Set(["MATCH_RESULT", "OTHER", "DOUBLE_CHANCE", "OVER_UNDER"]);
  for (const market of markets) {
    if (!known.has(market.canonicalMarket)) {
      recordUnknownCanonicalMarket(market.canonicalMarket, market.rawName);
    }
  }
  return out;
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Same paginated-leagues-with-nested-events envelope confirmed for every
// other sport (total/page/limit/totalPages/hasNextPage/leagues[]). MMA's
// league field is a bare string (e.g. "Combatsport. BFL", "Road to UFC") —
// no pipe-delimited country prefix, same as basketball/hockey/volleyball —
// so country is hardcoded "Internacional" the same way.
export type PulseScoreMmaPrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreMmaLeague = {
  name: string;
  sport: string;
  events: PulseScoreMmaPrematchEvent[];
  league: string;
};

type PulseScoreMmaLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreMmaLeague[];
};

const MMA_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScoreMmaPrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScoreMmaPrematchEvent[]> | null = null;

// Same reasoning as hockey.ts's HOCKEY_BOOKMAKER — MMA has no live poller
// of its own to share a budget with, so this is the only onexbet consumer
// in this file.
const MMA_BOOKMAKER = "onexbet";

async function fetchAllMmaLeagues(): Promise<PulseScoreMmaLeague[]> {
  const leagues: PulseScoreMmaLeague[] = [];
  let page = 1;
  // Real sample: 134 total events across two leagues at limit=5 in the
  // sample fetched -> paginate for real use the same conservative 4s/page
  // as every other sport's prematch fetch.
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreMmaLeaguesResponse>(
      `/mma/leagues?page=${page}&limit=30`,
      { bookmaker: MMA_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchMmaUpcoming(): Promise<PulseScoreMmaPrematchEvent[]> {
  const leagues = await fetchAllMmaLeagues();
  return leagues.flatMap((l) => l.events ?? []).filter((ev) => !ev.live);
}

/** Upcoming MMA fights from PulseScore (onexbet), each carrying its Win(2Way)
 * / 1X2 / Double Chance / Total(rounds) prematch odds when priced yet.
 * Empty array if PULSESCORE_API_KEY isn't configured, or the upstream call
 * fails on the very first attempt (nothing cached yet to fall back to). */
export async function getPulseScoreMmaUpcoming(): Promise<PulseScoreMmaPrematchEvent[]> {
  if (!CONFIG.ENABLE_PULSESCORE) return [];
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < MMA_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchMmaUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] mma upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}
