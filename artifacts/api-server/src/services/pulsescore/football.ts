// Football live odds from PulseScore, polled via REST. Pinned to its own
// "bwin" bookmaker (FOOTBALL_BOOKMAKER below) as of 2026-08-08 — tennis
// (tennis.ts) still uses CONFIG.PULSESCORE_BOOKMAKER ("bet365"), unchanged,
// since bwin's shape is only confirmed for football/soccer so far (its own
// API doc sample never showed a tennis or basketball event, and tennis.ts's
// live set/point/serve tracking depends entirely on bet365-specific
// moreInfo fields this doc never showed at all, for any sport).
// Same in-process cache + in-flight-dedup shape already used throughout
// matches.ts for other ~1s live polls (e.g. TENNIS_LIVE_V1_TTL).
//
// A WS connection also exists (footballWs.ts, started at boot) but is
// deliberately NOT used as a data source here — see getPulseScoreFootballLive
// below for why it was tried and reverted the same day.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

const FOOTBALL_LIVE_TTL_MS = 1_000; // matches the PRO plan's 1 req/s rate limit

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

// PulseScore has no equivalent of Statpal's /user-request-count endpoint to
// query usage from their side, so we count our own outbound calls instead —
// resets at UTC midnight, same "requests today" shape the Statpal usage
// admin card already shows.
let requestsToday = 0;
let usageDate = todayUtc();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollUsageDateIfNeeded(): void {
  const d = todayUtc();
  if (d !== usageDate) {
    usageDate = d;
    requestsToday = 0;
  }
}

export function getPulseScoreFootballUsage(): {
  requestsToday: number;
  date: string;
} {
  rollUsageDateIfNeeded();
  return { requestsToday, date: usageDate };
}

// Football pins its own "bwin" bookmaker explicitly, rather than following
// CONFIG.PULSESCORE_BOOKMAKER (still "bet365" — tennis/basketball stay on
// it, unverified against bwin's shape). Switched 2026-08-08 after bet365
// live coverage proved unreliable for football (see git history: the
// country-glued-to-league-name bug, sparse/checkpoint-only clock updates
// for lower-coverage matches) and a real bwin sample showed both fixed
// (separate `country` field, per-second `matchClock`) — see
// pulseScoreEventMinute/pulseScoreEventClockSec and this file's market
// matchers below for the concrete shape differences that required.
const FOOTBALL_BOOKMAKER = "bwin";

async function fetchFootballLive(): Promise<PulseScoreEvent[]> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  // Response is a paginated wrapper ({ total, page, ..., events: [...] }),
  // not a bare array as the public docs' example showed — confirmed via a
  // real authenticated call. limit=200 comfortably covers real live-soccer
  // volume (18 events observed) in a single request within the 1 req/s
  // PRO-plan rate limit. Lets errors (429s from the shared bookmaker
  // budget, timeouts, ...) propagate — see getPulseScoreFootballLive's
  // .catch() for why swallowing them here was a real bug, not a safety net.
  const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
    "/live-events?sport=soccer&limit=200",
    undefined,
    FOOTBALL_BOOKMAKER,
  );
  return Array.isArray(data?.events) ? data.events : [];
}

/** Live football odds from PulseScore (bwin, normalized), REST-only.
 * Empty array if PULSESCORE_API_KEY isn't configured yet, or the upstream
 * call fails on the very first attempt (nothing cached yet to fall back to).
 *
 * A WS-preferring version of this function has now shipped and been
 * reverted TWICE the same day (2026-08-08):
 *
 * Attempt 1: reports of many live matches missing from the site right
 * after it went out. Suspected cause — applyFrame() in footballWs.ts
 * treated each broadcast frame as a full snapshot (deleting anything
 * absent from that frame), an assumption copied from tennisWs.ts but only
 * ever confirmed for tennis's much lower match volume; if football's
 * frames are delta-only, that logic would purge every untouched match
 * every frame. Fixed by switching applyFrame to a 20s grace period per
 * event instead of deleting on the first absent frame — correct under
 * either snapshot or delta semantics.
 *
 * Attempt 2 (after that fix): reports of stuck clocks (one observed
 * capped at exactly 3:00 — the frontend's own extrapolation ceiling),
 * matches that should have gone live never appearing, and finished
 * matches still showing "A Iniciar". Root cause this time: WS freshness
 * (footballWsIsFresh) is tracked PER CONNECTION, not per event — it only
 * asks "did any frame arrive recently", which stays true as long as OTHER
 * matches keep broadcasting. If PulseScore's frames really are delta-only
 * and only re-broadcast a match when its price moves, a match with quiet
 * odds can go stale (clockSec frozen) for a long time while the
 * connection as a whole looks perfectly healthy — and REST never kicks in
 * to correct that one match specifically, because the freshness check
 * that gates the fallback never sees it as stale. Fixing this for real
 * needs PER-EVENT freshness (e.g. a lastSeenAt timestamp per eventId,
 * falling back to REST for just that match once its own reading goes
 * stale, not an all-or-nothing connection-level check) — not attempted
 * yet. Back to REST-only (known-good) until that exists. The WS
 * connection (footballWs.ts) is still started at boot so its behavior/logs
 * can be observed without being trusted for real data yet — see
 * getFootballWsEvents/footballWsIsFresh, currently unused here. */
export async function getPulseScoreFootballLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  if (cache && now - cache.fetchedAt < FOOTBALL_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchFootballLive()
      .then((events) => {
        cache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        // This used to swallow the error and return [] unconditionally —
        // a transient 429 (bwin's 1 req/s budget collides with football's
        // own background prematch page fetch, which shares it) silently
        // wiped the live football feed to "0 matches" with zero trace
        // anywhere. Log it and keep serving the last good cache instead —
        // only genuinely empty right after boot (cache null).
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] football live fetch failed — serving stale cache",
        );
        return cache?.events ?? [];
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// ── canonicalMarket → our own market shape ──────────────────────────────────
// PulseScore's docs only document two canonicalMarket values by example
// (match_winner, total_goals) — there's no exhaustive list. Rather than
// guess names for the rest (correctScore, handicap, btts, ...) and risk
// silently mis-mapping odds, only these two are wired in for now; any other
// canonicalMarket seen in real traffic is logged once (see
// recordUnknownCanonicalMarket below) so the mapping can be safely extended
// from what PulseScore actually sends, not from guesswork.
export type TotalGoalsOverride = Partial<{
  over05: number; under05: number;
  over15: number; under15: number;
  over25: number; under25: number;
  over35: number; under35: number;
  over45: number; under45: number;
  over55: number; under55: number;
  over65: number; under65: number;
}>;

export type PulseScoreFootballOverride = {
  odds?: { home: number; draw: number; away: number };
  totalGoals?: TotalGoalsOverride;
  // Extended markets — verified against a real GET /live-events?sport=soccer
  // sample (2026-08-08). Each maps 1:1 onto an existing AdvancedMarkets field
  // shape (matches.ts) so buildFootballLiveFromPulseScore can merge it
  // straight in, same as totalGoals above — no new UI needed, just real data
  // replacing the synthetic model wherever PulseScore actually priced it.
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore?: { yes: number; no: number };
  drawNoBet?: { home: number; away: number };
  secondHalf?: { home: number; draw: number; away: number };
  goalOddEven?: { odd: number; even: number };
  cleanSheet?: { home: number; away: number };
  correctScore?: Record<string, number>;
  teamGoals?: Partial<{
    homeOver05: number; homeUnder05: number;
    homeOver15: number; homeUnder15: number;
    homeOver25: number; homeUnder25: number;
    awayOver05: number; awayUnder05: number;
    awayOver15: number; awayUnder15: number;
    awayOver25: number; awayUnder25: number;
  }>;
};

const TOTAL_GOALS_LINE_KEYS: Record<string, { over: keyof TotalGoalsOverride; under: keyof TotalGoalsOverride }> = {
  "0.5": { over: "over05", under: "under05" },
  "1.5": { over: "over15", under: "under15" },
  "2.5": { over: "over25", under: "under25" },
  "3.5": { over: "over35", under: "under35" },
  "4.5": { over: "over45", under: "under45" },
  "5.5": { over: "over55", under: "under55" },
  "6.5": { over: "over65", under: "under65" },
};

const seenUnknownMarkets = new Set<string>();
function recordUnknownCanonicalMarket(canonicalMarket: string): void {
  if (seenUnknownMarkets.has(canonicalMarket)) return;
  seenUnknownMarkets.add(canonicalMarket);
  logger.info(
    { canonicalMarket },
    "[pulsescore] unmapped football canonicalMarket seen — candidate to add to the override mapping",
  );
}

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

// Real bet365-normalized data (verified 2026-08-05) does NOT use the docs'
// documented "match_winner"/"total_goals" canonicalMarket values at all — a
// fulltime 1X2 market showed up as canonicalMarket "OTHER" with
// rawName "Fulltime Result", and goal totals as canonicalMarket
// "OVER_UNDER". Identify by rawName (case-insensitive) rather than trusting
// canonicalMarket alone, per PulseScore's own documented fallback guidance.
const MATCH_WINNER_RAW_NAMES = new Set([
  "fulltime result",
  "full time result",
  "match result",
  "1x2",
]);

function isMatchWinnerMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  if (market.canonicalMarket === "MATCH_RESULT") return true;
  return MATCH_WINNER_RAW_NAMES.has((market.rawName || "").toLowerCase());
}

// Restricted to these two exact names (not just canonicalMarket "OVER_UNDER"
// + FULL_TIME) after a real sample showed a THIRD same-shaped market —
// "Goal Line (H-A)" — sharing the canonicalMarket/period combo. Goal Line
// prices the same numeric lines differently (e.g. one real event: Match
// Goals Over 2.5 @1.8333 vs Goal Line (0-2) Over 2.5 @1.95) — before this
// fix, isTotalGoalsMarket() matched all three, and the byLine Map below
// silently let whichever market happened to appear later in ev.markets
// (API order, not something we control) overwrite the others for any line
// they both covered. "Alternative Match Goals" is kept in because real
// samples show it only ever adds NEW lines Match Goals doesn't have, never
// overlapping — Goal Line is the one that collides. "total goals" is bwin's
// own name for this same market (confirmed against a real bwin
// /live-events?sport=soccer sample, 2026-08-08 — bet365 calls it "Match
// Goals", bwin calls the identical canonicalMarket/period combo "Total
// Goals"); bwin's sample never showed a colliding Goal-Line-style market
// under that name, so no extra disambiguation was needed there.
const TOTAL_GOALS_RAW_NAMES = new Set([
  "match goals",
  "alternative match goals",
  "total goals",
]);

function isTotalGoalsMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  if (market.canonicalMarket !== "OVER_UNDER") return false;
  return TOTAL_GOALS_RAW_NAMES.has((market.rawName || "").toLowerCase());
}

// ── Extended markets — verified against a real GET /live-events?sport=soccer
// sample (2026-08-08). Each identifies its market the same rawName/
// canonicalMarket-fallback way as the two above, per PulseScore's own
// documented guidance (canonicalMarket alone isn't reliable). Comments below
// call out which bookmaker's naming was actually confirmed — bet365 and
// bwin diverge on several of these despite sharing the same canonicalMarket.
function isDoubleChanceMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return (
    market.canonicalMarket === "DOUBLE_CHANCE" ||
    (market.rawName || "").toLowerCase() === "double chance"
  );
}

function isBothTeamsToScoreMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return market.canonicalMarket === "BOTH_TEAMS_TO_SCORE";
}

function isDrawNoBetMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return market.canonicalMarket === "DRAW_NO_BET";
}

// bet365: canonicalMarket "MATCH_RESULT" or rawName "to win 2nd half"
// (unverified naming, never actually seen — kept as a defensive fallback).
// bwin: canonicalMarket "OTHER", rawName "2nd Half Result" — confirmed
// against a real live sample (2026-08-08); doesn't share either bet365
// check, so needed its own clause rather than just widening the existing one.
function isSecondHalfWinnerMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "SECOND_HALF") return false;
  const rawName = (market.rawName || "").toLowerCase();
  return (
    market.canonicalMarket === "MATCH_RESULT" ||
    rawName === "to win 2nd half" ||
    (market.canonicalMarket === "OTHER" && rawName === "2nd half result")
  );
}

// bet365: rawName "goals odd/even" (unverified naming, never actually seen).
// bwin: canonicalMarket "TOTAL_GOALS_ODD_EVEN", rawName "Odd/Even - Total
// Goals" — confirmed against a real live sample (2026-08-08).
function isGoalOddEvenMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return (
    market.canonicalMarket === "TOTAL_GOALS_ODD_EVEN" ||
    (market.rawName || "").toLowerCase() === "goals odd/even"
  );
}

// bet365-only so far — rawName "team clean sheet" was never independently
// confirmed against a real sample, and bwin's own doc sample (2026-08-08,
// 62 real live events) never showed a Clean Sheet market at all. Left
// as-is: a market this doesn't recognize just doesn't populate
// out.cleanSheet, which safely falls back to the synthetic price — no
// crash risk, just needs a real bwin sample before extending.
function isCleanSheetMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return (market.rawName || "").toLowerCase() === "team clean sheet";
}

// bet365: rawName "final score" (unverified naming, never actually seen).
// bwin: rawName "Correct Score" — confirmed against a real live sample
// (2026-08-08).
function isCorrectScoreMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  const rawName = (market.rawName || "").toLowerCase();
  return rawName === "final score" || rawName === "correct score";
}

// "{Team} Goals" (O/U at .5 lines) — distinct from "{Team} Exact Goals"
// (discrete 0/1/2/3+ buckets, not extracted here: no matching AdvancedMarkets
// field shape exists for a discrete per-team distribution).
function isTeamGoalsMarket(market: PulseScoreMarket, teamName: string): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return (market.rawName || "") === `${teamName} Goals`;
}

function applyTeamGoalsMarket(
  market: PulseScoreMarket,
  side: "home" | "away",
  out: PulseScoreFootballOverride,
): void {
  const byLine = new Map<string, { over: number | null; under: number | null }>();
  for (const sel of market.selections ?? []) {
    if (!sel.isActive || sel.line === undefined) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").toLowerCase();
    const key = String(sel.line);
    const entry = byLine.get(key) ?? { over: null, under: null };
    if (raw === "over") entry.over = val;
    else if (raw === "under") entry.under = val;
    byLine.set(key, entry);
  }
  const patch: Record<string, number> = {};
  for (const [line, suffix] of [
    ["0.5", "05"],
    ["1.5", "15"],
    ["2.5", "25"],
  ] as const) {
    const entry = byLine.get(line);
    if (entry?.over != null) patch[`${side}Over${suffix}`] = entry.over;
    if (entry?.under != null) patch[`${side}Under${suffix}`] = entry.under;
  }
  if (Object.keys(patch).length > 0) {
    out.teamGoals = {
      ...out.teamGoals,
      ...patch,
    } as PulseScoreFootballOverride["teamGoals"];
  }
}

/** Builds a market override from one PulseScore event's fulltime match-
 * winner and total-goals markets. Returns an empty object (not null) when
 * the event has neither recognised yet — callers should only apply the
 * fields that are actually present. */
export function extractFootballOverride(ev: PulseScoreEvent): PulseScoreFootballOverride {
  const out: PulseScoreFootballOverride = {};
  for (const market of ev.markets ?? []) {
    if (isMatchWinnerMarket(market)) {
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
        else if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
      }
      if (home !== null && draw !== null && away !== null) {
        out.odds = { home, draw, away };
      }
    } else if (isTotalGoalsMarket(market)) {
      // `line` lives per-selection here (not per-market as the docs
      // implied) — group selections by line, since one event can carry
      // several O/U lines as separate market entries or within one.
      const byLine = new Map<string, { over: number | null; under: number | null }>();
      for (const sel of market.selections ?? []) {
        if (!sel.isActive || sel.line === undefined) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const key = String(sel.line);
        const entry = byLine.get(key) ?? { over: null, under: null };
        if (sel.canonicalOutcome === "OVER") entry.over = val;
        else if (sel.canonicalOutcome === "UNDER") entry.under = val;
        byLine.set(key, entry);
      }
      for (const [line, { over, under }] of byLine) {
        const lineKeys = TOTAL_GOALS_LINE_KEYS[line];
        if (!lineKeys || over === null || under === null) continue;
        out.totalGoals = {
          ...out.totalGoals,
          [lineKeys.over]: over,
          [lineKeys.under]: under,
        };
      }
    } else if (isDoubleChanceMarket(market)) {
      let homeOrDraw: number | null = null;
      let awayOrDraw: number | null = null;
      let homeOrAway: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        // bet365: a moreInfo.N2 code identifies which pair this selection
        // covers ("1X"/"X2"/"12"). bwin: no selection in its whole doc
        // sample (2026-08-08, 62 real live events) ever carried a moreInfo
        // field at all — falls back to parsing the two sides straight out
        // of rawName instead ("{home} or X", "X or {away}", "{home} or
        // {away}"), confirmed against a real bwin sample.
        const code = String(sel.moreInfo?.["N2"] ?? "");
        if (code === "1X") {
          homeOrDraw = val;
          continue;
        }
        if (code === "X2") {
          awayOrDraw = val;
          continue;
        }
        if (code === "12") {
          homeOrAway = val;
          continue;
        }
        const parts = (sel.rawName || "").split(/\s+or\s+/i);
        if (parts.length !== 2) continue;
        const a = parts[0]!.trim();
        const b = parts[1]!.trim();
        const isDrawToken = (s: string) => /^x$/i.test(s) || /^draw$/i.test(s);
        const aIsHome = teamNamesMatch(a, ev.home);
        const aIsAway = !aIsHome && teamNamesMatch(a, ev.away);
        const bIsHome = teamNamesMatch(b, ev.home);
        const bIsAway = !bIsHome && teamNamesMatch(b, ev.away);
        if ((aIsHome && isDrawToken(b)) || (isDrawToken(a) && bIsHome)) homeOrDraw = val;
        else if ((aIsAway && isDrawToken(b)) || (isDrawToken(a) && bIsAway)) awayOrDraw = val;
        else if ((aIsHome && bIsAway) || (aIsAway && bIsHome)) homeOrAway = val;
      }
      if (homeOrDraw !== null && awayOrDraw !== null && homeOrAway !== null) {
        out.doubleChance = { homeOrDraw, awayOrDraw, homeOrAway };
      }
    } else if (isBothTeamsToScoreMarket(market)) {
      let yes: number | null = null;
      let no: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "YES") yes = val;
        else if (sel.canonicalOutcome === "NO") no = val;
      }
      if (yes !== null && no !== null) out.bothTeamsScore = { yes, no };
    } else if (isDrawNoBetMarket(market)) {
      let home: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
      }
      if (home !== null && away !== null) out.drawNoBet = { home, away };
    } else if (isSecondHalfWinnerMarket(market)) {
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
      if (home !== null && draw !== null && away !== null) {
        out.secondHalf = { home, draw, away };
      }
    } else if (isGoalOddEvenMarket(market)) {
      let odd: number | null = null;
      let even: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const raw = (sel.rawName || "").toLowerCase();
        if (raw === "odd") odd = val;
        else if (raw === "even") even = val;
      }
      if (odd !== null && even !== null) out.goalOddEven = { odd, even };
    } else if (isCleanSheetMarket(market)) {
      let home: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        // "Yes" = that team keeps a clean sheet (concedes 0) — the "No"
        // rows share the same HOME/AWAY canonicalOutcome, so HD is the only
        // way to tell which side of the market a row is on.
        if (String(sel.moreInfo?.["HD"] ?? "").toLowerCase() !== "yes") continue;
        if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
      }
      if (home !== null && away !== null) out.cleanSheet = { home, away };
    } else if (isCorrectScoreMarket(market)) {
      const scores: Record<string, number> = {};
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const label = (sel.rawName || "").trim();
        // Skip the placeholder "{home} {away}" summary row (odds:0,
        // isActive:false already filters it, but the label shape check is a
        // second guard) and anything that isn't a plain "H-A" scoreline.
        if (!/^\d+-\d+$/.test(label)) continue;
        scores[label] = val;
      }
      if (Object.keys(scores).length > 0) out.correctScore = scores;
    } else if (isTeamGoalsMarket(market, ev.home)) {
      applyTeamGoalsMarket(market, "home", out);
    } else if (isTeamGoalsMarket(market, ev.away)) {
      applyTeamGoalsMarket(market, "away", out);
    } else {
      recordUnknownCanonicalMarket(market.canonicalMarket);
    }
  }
  return out;
}

/** Finds the PulseScore live event matching a tracked match by team name
 * (tolerant cross-provider match, same approach as the existing Statpal ↔
 * SportScore matcher) and returns its market override, if any. `events`
 * should be one already-fetched getPulseScoreFootballLive() batch — never
 * call this per-match, it would blow the 1 req/s PRO rate limit. */
export function findPulseScoreFootballOverride(
  home: string,
  away: string,
  events: PulseScoreEvent[],
): PulseScoreFootballOverride | null {
  const ev = events.find(
    (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const override = extractFootballOverride(ev);
  const hasAny = Object.keys(override).length > 0;
  return hasAny ? override : null;
}

/** Real match score, read from the {home,away} object (not the docs'
 * assumed "H-A" string) — verified against a real live call 2026-08-05. */
export function pulseScoreEventScore(
  ev: PulseScoreEvent,
): { home: number; away: number } | null {
  const h = Number(ev.score?.home);
  const a = Number(ev.score?.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { home: h, away: a };
}

/** Live clock in minutes. Prefers bwin's normalized `matchClock.minute` —
 * confirmed against real live samples (2026-08-08, values 90-95 lining up
 * with plausible match minutes) — falling back to bet365's raw moreInfo.TM
 * field (no normalized "minute" field exists on that bookmaker) for any
 * event that doesn't carry matchClock.
 *
 * bet365 sends stoppage time as "45+2"/"90+3" — plain Number() on that is
 * NaN, which silently froze the clock at 0 for whichever matches happened
 * to be in injury time (reported as "some clocks not working", since it's
 * only whichever matches are mid-stoppage-time at any given moment). Only
 * the base minute is taken; the "+N" part isn't surfaced separately since
 * the frontend clock just needs a monotonically increasing number. */
export function pulseScoreEventMinute(ev: PulseScoreEvent): number {
  if (ev.matchClock) {
    const m = ev.matchClock.minute;
    return Number.isFinite(m) && m >= 0 ? m : 0;
  }
  const raw = ev.moreInfo?.TM;
  if (raw == null) return 0;
  const m = /^(\d+)/.exec(String(raw).trim());
  if (!m) return 0;
  const tm = Number(m[1]);
  return Number.isFinite(tm) && tm >= 0 ? tm : 0;
}

/** Total elapsed seconds. Prefers bwin's normalized `matchClock.minute`/
 * `.second` (a real per-second reading, confirmed against live samples
 * 2026-08-08 — e.g. {minute:92, second:42}), falling back to bet365's raw
 * TM (minutes) + TS (seconds-within-the-minute) moreInfo fields, which sit
 * right next to each other but are only ever checkpoint/best-effort on that
 * bookmaker (see getPulseScoreFootballLive's header for the production
 * incident — sparse updates for lower-coverage matches — that motivated
 * moving football to bwin in the first place). Feeds
 * LiveMatchState._liveExtra.clockSec, which the frontend already knows how
 * to extrapolate client-side into a running MM:SS clock. */
export function pulseScoreEventClockSec(ev: PulseScoreEvent): number {
  if (ev.matchClock) {
    const minutes = ev.matchClock.minute;
    const seconds = ev.matchClock.second;
    if (!Number.isFinite(minutes) || minutes < 0) return 0;
    const secOk = Number.isFinite(seconds) && seconds >= 0 && seconds < 60;
    return minutes * 60 + (secOk ? seconds : 0);
  }
  const rawTm = ev.moreInfo?.TM;
  if (rawTm == null) return 0;
  const tmMatch = /^(\d+)/.exec(String(rawTm).trim());
  if (!tmMatch) return 0;
  const minutes = Number(tmMatch[1]);
  if (!Number.isFinite(minutes) || minutes < 0) return 0;
  const rawTs = ev.moreInfo?.TS;
  const secondsNum = Number(String(rawTs ?? "0").trim());
  const seconds =
    Number.isFinite(secondsNum) && secondsNum >= 0 && secondsNum < 60 ? secondsNum : 0;
  return minutes * 60 + seconds;
}

/** True only when bwin's own matchClock explicitly reports the match over
 * (`period: "Finished"`, confirmed against a real live sample 2026-08-08) —
 * a verified, immediate signal, unlike matches.ts's staleness-based
 * isFulltimeFreeze heuristic (which still exists for bet365 events that
 * carry no matchClock at all, and as a safety net for any bwin period value
 * this hasn't seen yet). Always false for bet365 events (no matchClock). */
export function pulseScoreEventClockFinished(ev: PulseScoreEvent): boolean {
  return ev.matchClock?.period === "Finished";
}

// ── Prematch (leagues catalog) ──────────────────────────────────────────────
// Verified against a real authenticated GET /api/v3/bet365/leagues call
// (2026-08-06) — this is the FOOTBALL leagues endpoint despite the bare path
// (no "football"/"soccer" segment in the URL, unlike tennis's /tennis/leagues
// or MMA's /mma/leagues) — confirmed by the Swagger description itself
// ("Veja todas as ligas de futebol") and every league/event in the real
// sample carrying sport:"soccer". Same paginated-leagues-with-nested-events
// envelope already confirmed for tennis/MMA (total/page/limit/totalPages/
// hasNextPage/leagues[]). league is "Country||League" (e.g. "Australia||
// Australia Queensland Premier League 3") — same format already handled by
// the live builder's countryForLeagueName/footballLeagueAllowedStrict, reused
// as-is here rather than writing a second parser.
//
// Events carry `startTime` (ISO) and `live` (bool) that the live-events
// PulseScoreEvent shape doesn't — extending it here rather than duplicating
// the whole type, so extractFootballOverride/the catalog filters all work on
// this unchanged. live:true events embedded in this catalog always showed
// markets:[] in the real sample (only /live-events carries live odds,
// already used above) — this endpoint is prematch-only in practice.
export type PulseScorePrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreLeague = {
  name: string;
  sport: string;
  events: PulseScorePrematchEvent[];
  league: string;
  moreInfo?: {
    type?: string;
    live?: number;
    tournament?: string;
    leagueName?: string;
    updatedAtUTC?: number;
  };
  oddsSig?: string;
};

type PulseScoreLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: PulseScoreLeague[];
};

// Prematch doesn't need second-level freshness like the live poller — a
// multi-minute cache keeps this well clear of bwin's 1 req/s budget.
const FOOTBALL_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScorePrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScorePrematchEvent[]> | null = null;

async function fetchAllFootballLeagues(): Promise<PulseScoreLeague[]> {
  const leagues: PulseScoreLeague[] = [];
  let page = 1;
  // Real sample: total 289 leagues at limit=30 (the documented max) -> ~10
  // pages. This shares football's own "bwin" bookmaker budget with the live
  // poller (fetchFootballLive above, ~1 req/s), so pacing this at 1.1s apart
  // — as first written — meant it alone consumed nearly an entire extra
  // req/s for ~16s every FOOTBALL_UPCOMING_TTL_MS, on top of that
  // already-committed live traffic: exactly the kind of burst that starves
  // the live poller into 429s/timeouts, which buildLivePayload() then has no
  // choice but to paper over with sportWithFallback's stale snapshot — i.e.
  // odds/score look frozen. Paced far slower here instead: this fetch only
  // runs once per FOOTBALL_UPCOMING_TTL_MS in the background and nothing
  // user-facing waits on it (served from its own cache), so taking longer
  // wall-clock time to finish costs nothing. (Tennis no longer shares this
  // budget — it stayed on the separate "bet365" bookmaker when football
  // moved to "bwin", and client.ts's throttle is keyed per bookmaker.)
  for (let i = 0; i < 15; i++) {
    // bwin's leagues path is "/soccer/leagues" (confirmed against a real
    // Swagger sample, 2026-08-08: "GET /api/bwin/soccer/leagues") — unlike
    // bet365, which serves this at the bare bookmaker root with no sport
    // segment (see this function's own header comment history). Getting
    // this wrong would 404 the whole prematch fetch for bwin.
    const data = await pulseScoreGetWithRetry<PulseScoreLeaguesResponse>(
      `/soccer/leagues?page=${page}&limit=30`,
      { bookmaker: FOOTBALL_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.leagues)) leagues.push(...data.leagues);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return leagues;
}

async function fetchFootballUpcoming(): Promise<PulseScorePrematchEvent[]> {
  const leagues = await fetchAllFootballLeagues();
  // Seen in production (2026-08-08): despite the header comment above
  // claiming every league/event in the original sample carried
  // sport:"soccer", this bare /leagues endpoint (no ?sport= query param at
  // all, unlike /live-events) sometimes returns OTHER sports' leagues too —
  // basketball fixtures (Uruguay Liga de Ascenso, Chile LNB, WNBA, FIBA 3x3,
  // ...) showed up in the football "Em Breve"/upcoming list. Filter at both
  // the league and event level — same two-layer defense already applied to
  // tennis's WS leak (tennisWs.ts's applyFrame + buildTennisLiveFromPulseScore).
  // live:true entries here never carry markets (see comment above) —
  // getPulseScoreFootballLive() already covers those; keep this prematch-only.
  return leagues
    .filter((l) => l.sport === "soccer")
    .flatMap((l) => l.events ?? [])
    .filter((ev) => !ev.live && ev.sport === "soccer");
}

/** Upcoming football fixtures from PulseScore (bwin), each carrying its
 * MATCH_RESULT prematch odds when bwin has priced it yet. Empty array if
 * PULSESCORE_API_KEY isn't configured, or the upstream call fails on the
 * very first attempt (nothing cached yet to fall back to). */
export async function getPulseScoreFootballUpcoming(): Promise<PulseScorePrematchEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < FOOTBALL_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchFootballUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        // Used to swallow the error and overwrite upcomingCache with []
        // unconditionally — a single transient failure across the ~10-page
        // paginated /leagues fetch (429 collision with the live poller's own
        // bwin budget, a timeout, ...) wiped 5 minutes of prematch listings
        // to empty, which is exactly what shows up on the site as matches
        // "appearing and disappearing". Log it and keep serving whatever was
        // cached instead.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] football upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}
