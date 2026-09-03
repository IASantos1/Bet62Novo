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
  // Double Chance / odd-even: settlement.ts grades these generically for
  // any sport off plain home/away/draw comparisons and score parity (dc-hd/
  // dc-da/dc-ha, goe-odd/goe-even — see scoreOutcomeForSel), no sport-
  // specific prefix, so no new settlement code needed. Confirmed real
  // (2026-08-27, onexbet GET /live-events?sport=ice_hockey and
  // /ice-hockey/leagues samples). Home team totals/away team totals are
  // NOT extracted here yet — the only existing team-total settlement key
  // (b-tt-home/away) carries a "b-" prefix that's never been confirmed as
  // sport-agnostic rather than basketball-specific; wiring hockey odds into
  // a market with an unconfirmed settlement path risks a bet with nothing
  // correct to grade it, so left out deliberately pending that check.
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  oddEven?: { odd: number; even: number };
  // "Handicap" under canonicalMarket DRAW_NO_BET (not ASIAN_HANDICAP) — the
  // dominant FULL_TIME handicap-like shape in the confirmed 2026-08-28
  // onexbet sample (4 of 6 events; only 2 used a genuine signed-line
  // ASIAN_HANDICAP). A real "draw voids the bet" 2-way, not a spread — kept
  // as its own field rather than folded into `spread` above, which assumes
  // a signed magnitude this market doesn't have. Only one side is
  // guaranteed present in a given real sample (the away leg was simply
  // absent/unpriced in the one checked directly) — extractDrawNoBet below
  // still requires both before returning anything, same conservative rule
  // every other 2-way extractor in this file already follows.
  drawNoBet?: { home: number; away: number };
  // "Correct Score" (canonicalMarket CORRECT_SCORE, FULL_TIME) — confirmed
  // real, rawName is the score text "H-A" (hyphen, home-away — e.g. "3-2"),
  // covering many combinations (not a fixed 6-key shape like volleyball's
  // 3-set correct score) — kept as a flat label/odds list, same convention
  // as tennis's score1st/score2nd.
  correctScore?: Array<{ label: string; odds: number }>;
  // "Next Goal" (canonicalMarket FIRST_TEAM_TO_SCORE — NOT the differently-
  // shaped canonicalMarket "OTHER"/rawName "Next Goal" that some events
  // carry alongside it, which is actually "who scores goal N" for a
  // specific numbered goal via `line` and is NOT extracted here, out of
  // scope): clean HOME/AWAY/NEITHER canonicalOutcome, no `line` — literally
  // "which team scores the match's first goal".
  nextGoal?: { home: number; away: number; none: number };
  // 2nd/3rd-period moneyline and totals — confirmed real (same sample):
  // MATCH_RESULT/rawName "2nd period 1X2"/"3rd period 1X2" at period
  // SECOND_HALF/THIRD_PERIOD respectively (hockey periods 1/2 reuse
  // football's FIRST_HALF/SECOND_HALF period enum, period 3 gets its own
  // THIRD_PERIOD), OVER_UNDER/rawName "2nd period Total"/"3rd period Total"
  // same periods. period1 (FIRST_HALF, rawName "1st period 1X2"/"1st
  // period Total") is real too and included for completeness even though
  // not explicitly asked for — same cost to extract as period2/period3.
  period1?: { home: number; draw: number; away: number };
  period2?: { home: number; draw: number; away: number };
  period3?: { home: number; draw: number; away: number };
  period1Total?: { line: number; over: number; under: number };
  period2Total?: { line: number; over: number; under: number };
  period3Total?: { line: number; over: number; under: number };
};

function isFullTimeMarket(market: PulseScoreMarket): boolean {
  return (market.period || "").toUpperCase() === "FULL_TIME";
}

function isThreeWayResultMarket(market: PulseScoreMarket): boolean {
  if (market.canonicalMarket !== "OTHER" || !isFullTimeMarket(market)) return false;
  const raw = (market.rawName || "").trim().toLowerCase();
  // "3-way - result after regular time" is the bwin-era shape (see
  // isMatchResultMarket's comment below for why MATCH_RESULT/"1X2" is now
  // the primary real shape). "1x2" under canonicalMarket OTHER (not
  // MATCH_RESULT) is a THIRD real shape, confirmed against a live onexbet
  // sample (2026-08-28, GET /live-events?sport=ice_hockey): some events
  // carry the real 3-way 1X2 as canonicalMarket "OTHER" while ALSO
  // carrying a separate canonicalMarket "MATCH_RESULT"/rawName "Team Wins"
  // (a genuinely different, 2-way-only "decisive winner" market, no draw
  // outcome at all) — isMatchResultMarket alone would grab "Team Wins" for
  // these events and extractMoneyline would then correctly return null
  // (no draw price to satisfy the home/draw/away requirement), silently
  // losing the real 3-way price. Matched here too so the real 1X2 wins
  // instead, additively (this "OTHER"/"1x2" shape was NOT seen in every
  // event of the same live sample — some events use plain MATCH_RESULT/
  // "1X2" only, matched by isMatchResultMarket below — so neither check
  // alone covers every real event shape).
  return raw === "3-way - result after regular time" || raw === "1x2";
}

// Real onexbet shape confirmed 2026-08-28 (fresh /ice-hockey/events sample,
// 6 events across several leagues): the moneyline is canonicalMarket
// "MATCH_RESULT"/rawName "1X2", period FULL_TIME, plain HOME/DRAW/AWAY —
// NOT the bwin-era "OTHER"/"3-Way - Result After Regular Time" shape
// isThreeWayResultMarket above was built against. That bwin shape never
// once appeared in this onexbet sample, meaning isMoneylineMarket alone
// was silently matching ZERO real markets since the 2026-08-27 bookmaker
// switch — every hockey prematch match's real moneyline was falling
// through to the synthetic fallback the whole time this bug existed. Kept
// isThreeWayResultMarket too (additive, not a replacement) in case a
// future bookmaker revert brings that shape back — same "don't regress the
// old shape while fixing the new one" precedent as tennis.ts's header.
function isMatchResultMarket(market: PulseScoreMarket): boolean {
  return market.canonicalMarket === "MATCH_RESULT" && isFullTimeMarket(market);
}

function periodFilter(canonicalMarket: string, period: string) {
  return (m: PulseScoreMarket) =>
    m.canonicalMarket === canonicalMarket && (m.period || "").toUpperCase() === period;
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

function extractDrawNoBet(market: PulseScoreMarket): { home: number; away: number } | null {
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

function extractCorrectScore(market: PulseScoreMarket): Array<{ label: string; odds: number }> {
  const out: Array<{ label: string; odds: number }> = [];
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim();
    if (!/^\d+-\d+$/.test(raw)) continue;
    out.push({ label: raw, odds: val });
  }
  return out;
}

function extractNextGoal(
  market: PulseScoreMarket,
): { home: number; away: number; none: number } | null {
  let home: number | null = null;
  let away: number | null = null;
  let none: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") home = val;
    else if (sel.canonicalOutcome === "AWAY") away = val;
    else if (sel.canonicalOutcome === "NEITHER") none = val;
  }
  return home !== null && away !== null && none !== null ? { home, away, none } : null;
}

/** Builds a market override from one PulseScore hockey event's 3-Way Result
 * / Handicap / Totals markets. Returns an empty object (not null) when none
 * are recognised yet — callers should only apply fields present. */
export function extractHockeyOverride(ev: PulseScoreEvent): PulseScoreHockeyOverride {
  const out: PulseScoreHockeyOverride = {};
  const home = ev.home?.trim() ?? "";
  const away = ev.away?.trim() ?? "";
  const moneylineMarkets = (ev.markets ?? []).filter(
    (m) => isThreeWayResultMarket(m) || isMatchResultMarket(m),
  );
  const spreadMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "ASIAN_HANDICAP" && isFullTimeMarket(m),
  );
  const totalMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "OVER_UNDER" && isFullTimeMarket(m),
  );
  const doubleChanceMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "DOUBLE_CHANCE" && isFullTimeMarket(m),
  );
  const oddEvenMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "TOTAL_GOALS_ODD_EVEN" && isFullTimeMarket(m),
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
  if (doubleChanceMarkets.length === 1) {
    const dc = extractDoubleChance(doubleChanceMarkets[0]!);
    if (dc) out.doubleChance = dc;
  }
  if (oddEvenMarkets.length === 1) {
    const oe = extractOddEven(oddEvenMarkets[0]!);
    if (oe) out.oddEven = oe;
  }

  const drawNoBetMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "DRAW_NO_BET" && isFullTimeMarket(m),
  );
  if (drawNoBetMarkets.length === 1) {
    const dnb = extractDrawNoBet(drawNoBetMarkets[0]!);
    if (dnb) out.drawNoBet = dnb;
  }

  const correctScoreMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "CORRECT_SCORE" && isFullTimeMarket(m),
  );
  if (correctScoreMarkets.length === 1) {
    const cs = extractCorrectScore(correctScoreMarkets[0]!);
    if (cs.length > 0) out.correctScore = cs;
  }

  const nextGoalMarkets = (ev.markets ?? []).filter(
    (m) => m.canonicalMarket === "FIRST_TEAM_TO_SCORE" && isFullTimeMarket(m),
  );
  if (nextGoalMarkets.length === 1) {
    const ng = extractNextGoal(nextGoalMarkets[0]!);
    if (ng) out.nextGoal = ng;
  }

  const period1Markets = (ev.markets ?? []).filter(periodFilter("MATCH_RESULT", "FIRST_HALF"));
  if (period1Markets.length === 1) {
    const p1 = extractMoneyline(period1Markets[0]!, home, away);
    if (p1) out.period1 = p1;
  }
  const period2Markets = (ev.markets ?? []).filter(periodFilter("MATCH_RESULT", "SECOND_HALF"));
  if (period2Markets.length === 1) {
    const p2 = extractMoneyline(period2Markets[0]!, home, away);
    if (p2) out.period2 = p2;
  }
  const period3Markets = (ev.markets ?? []).filter(periodFilter("MATCH_RESULT", "THIRD_PERIOD"));
  if (period3Markets.length === 1) {
    const p3 = extractMoneyline(period3Markets[0]!, home, away);
    if (p3) out.period3 = p3;
  }

  const period1TotalMarkets = (ev.markets ?? []).filter(periodFilter("OVER_UNDER", "FIRST_HALF"));
  if (period1TotalMarkets.length === 1) {
    const t1 = extractTotal(period1TotalMarkets[0]!);
    if (t1) out.period1Total = t1;
  }
  const period2TotalMarkets = (ev.markets ?? []).filter(periodFilter("OVER_UNDER", "SECOND_HALF"));
  if (period2TotalMarkets.length === 1) {
    const t2 = extractTotal(period2TotalMarkets[0]!);
    if (t2) out.period2Total = t2;
  }
  const period3TotalMarkets = (ev.markets ?? []).filter(periodFilter("OVER_UNDER", "THIRD_PERIOD"));
  if (period3TotalMarkets.length === 1) {
    const t3 = extractTotal(period3TotalMarkets[0]!);
    if (t3) out.period3Total = t3;
  }

  const known = new Set([
    "OTHER",
    "MATCH_RESULT",
    "ASIAN_HANDICAP",
    "DRAW_NO_BET",
    "OVER_UNDER",
    "DOUBLE_CHANCE",
    "TOTAL_GOALS_ODD_EVEN",
    "CORRECT_SCORE",
    "FIRST_TEAM_TO_SCORE",
  ]);
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
  if (!CONFIG.ENABLE_PULSESCORE) return [];
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
