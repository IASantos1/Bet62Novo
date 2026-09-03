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
// A WS connection also exists (footballWs.ts, started at boot) and is used
// as a PER-EVENT overlay on top of REST — see getPulseScoreFootballLive
// below for the two prior all-or-nothing attempts that got reverted and why
// this per-event design fixes both.
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
import { getFootballWsEventIfFresh } from "./footballWs.js";

const FOOTBALL_LIVE_TTL_MS = 1_000; // matches the PRO plan's 1 req/s rate limit

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

// PulseScore has no /user-request-count-style endpoint to query usage from
// their side, so we count our own outbound calls instead — resets at UTC
// midnight, the same "requests today" shape the admin usage card shows.
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

// 2026-08-28: football's PulseScore/bwin feed (prematch, live REST, and the
// WS overlay in footballWs.ts) was disabled while switching football to
// SportMonks. RE-ENABLED 2026-08-30 (explicit user report/decision): bet365
// via SportMonks turned out correct but slow to reprice several live
// leagues (confirmed via /api/matches/debug/football-live-odds — fetch
// itself fresh every ~2s, but bet365's own price frozen for many minutes
// on lower-tier fixtures), unlike bwin's confirmed ~1s live cadence used
// here before the migration ("estava a funcionar perfeitamente ontem").
// Prematch football STAYS on SportMonks/1xbet (unaffected, not blocked by
// this flag's callers below) — only the LIVE REST fetch is consumed again,
// by buildFootballLiveFromSportMonks in matches.ts, as a real-time 1X2
// overlay on top of SportMonks' own score/clock/events/corners/cards data.
const FOOTBALL_PULSESCORE_BLOCKED = false;

// Bug report 2026-08-14: a whole league (2. Bundesliga, but "several
// leagues" per the report) showing only a handful of its real live matches
// — e.g. 3 of 10. Root cause: this fetch only ever requested page 1
// (limit=200), never checked `hasNextPage`/`totalPages` on the response,
// unlike fetchAllFootballLeagues below which does loop pages. limit=200
// was sized against an "18 events observed" quiet-moment baseline — but
// worldwide live soccer volume spikes well past 200 at simultaneous-
// kickoff windows (Bundesliga 2's Saturday 15:30 slot lines up with
// EPL/Bundesliga 1/Ligue 2/Serie B and others all kicking off together).
// PulseScore's event ordering isn't grouped by league, so once total live
// events exceed 200 the cutoff falls in the MIDDLE of whichever leagues
// happen to sort near position 200 — losing an arbitrary subset of THEIR
// matches (not all of them, explaining 3-of-10 rather than 0-of-10) and
// hitting several different leagues at once during the same peak
// (explaining "várias assim" rather than one league's config).
const FOOTBALL_LIVE_MAX_PAGES = 3; // 3 * 200 = 600 — comfortable headroom above the busiest realistic simultaneous-kickoff peak, not just the quiet-moment baseline.

async function fetchFootballLive(): Promise<PulseScoreEvent[]> {
  rollUsageDateIfNeeded();
  const events: PulseScoreEvent[] = [];
  let page = 1;
  for (;;) {
    requestsToday += 1;
    // Response is a paginated wrapper ({ total, page, ..., events: [...] }),
    // not a bare array as the public docs' example showed — confirmed via a
    // real authenticated call.
    if (page === 1) {
      // Page 1 keeps the original "let errors propagate" behavior — see
      // getPulseScoreFootballLive's .catch() for why swallowing them here
      // was a real bug, not a safety net. A missing page 1 means we have
      // nothing at all; the caller needs to know that, not silently get an
      // empty list treated as "no live matches right now".
      const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
        `/live-events?sport=soccer&limit=200&page=${page}`,
        undefined,
        FOOTBALL_BOOKMAKER,
      );
      if (Array.isArray(data?.events)) events.push(...data.events);
      if (!data?.hasNextPage || page >= FOOTBALL_LIVE_MAX_PAGES) break;
    } else {
      // Page 2+ is best-effort: a failure here (429 from the shared bwin
      // budget, timeout, ...) shouldn't discard page 1's already-fetched
      // matches or turn a partial success into a total one — keep what we
      // have and stop paging.
      try {
        const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
          `/live-events?sport=soccer&limit=200&page=${page}`,
          undefined,
          FOOTBALL_BOOKMAKER,
        );
        if (Array.isArray(data?.events)) events.push(...data.events);
        if (!data?.hasNextPage || page >= FOOTBALL_LIVE_MAX_PAGES) break;
      } catch (err) {
        logger.warn({ err, page }, "[pulsescore] fetchFootballLive: extra page failed — keeping matches already fetched");
        break;
      }
    }
    page += 1;
  }
  return events;
}

// How fresh a WS-broadcast reading for ONE specific event must be to be
// trusted over REST's own value for that same event. Deliberately tight —
// this only exists to shave the latency between "PulseScore knows" and "we
// show it" for an actively-trading match; a match that hasn't broadcast
// within this window gets REST's own (equally fresh, ~1-2s old) data
// instead, never something stale being passed off as current.
const FOOTBALL_WS_EVENT_FRESHNESS_MS = 4_000;

/** Live football odds from PulseScore (bwin, normalized). REST is always
 * the authoritative source for WHICH matches are live (fixes Attempt 1
 * below — WS never adds or removes a match from this list, only overlays
 * fields onto ones REST already returned) and for every market/odds field.
 * WS (footballWs.ts) is layered on top PER EVENT: an event whose own
 * lastSeenAt is within FOOTBALL_WS_EVENT_FRESHNESS_MS gets its
 * matchClock/score refreshed from the last WS broadcast; any other event —
 * including every event while WS is disconnected entirely — is untouched,
 * identical to pure REST. Empty array if PULSESCORE_API_KEY isn't
 * configured yet, or the upstream REST call fails on the very first
 * attempt (nothing cached yet to fall back to).
 *
 * A WS-preferring version of this function shipped and was reverted TWICE
 * the same day (2026-08-08) before this per-event design:
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
 * matches still showing "A Iniciar". Root cause this time: that version
 * trusted WS as the primary source gated by footballWsIsFresh, tracked PER
 * CONNECTION, not per event — it only asked "did any frame arrive
 * recently", which stayed true as long as OTHER matches kept broadcasting.
 * If PulseScore's frames really are delta-only and only re-broadcast a
 * match when its price moves, a match with quiet odds could go stale
 * (clockSec frozen) for a long time while the connection as a whole looked
 * perfectly healthy — and REST never kicked in to correct that one match
 * specifically, because the freshness check that gated the fallback never
 * saw it as stale, and because WS was the primary list source too, a match
 * missing from WS's own view (e.g. right after (re)connecting, before its
 * first frame) didn't appear at all. This version fixes both: REST is
 * always the list, WS is checked per-event via getFootballWsEventIfFresh,
 * and staleness for one event never affects any other. */
export async function getPulseScoreFootballLive(): Promise<PulseScoreEvent[]> {
  if (FOOTBALL_PULSESCORE_BLOCKED) return [];
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  let events: PulseScoreEvent[];
  if (cache && now - cache.fetchedAt < FOOTBALL_LIVE_TTL_MS) {
    events = cache.events;
  } else if (!inFlight) {
    inFlight = fetchFootballLive()
      .then((fetched) => {
        cache = { events: fetched, fetchedAt: Date.now() };
        return fetched;
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
    events = await inFlight;
  } else {
    events = await inFlight;
  }
  // Defense in depth: an unexpected failure in the WS overlay must never
  // take the whole REST live list down with it.
  try {
    return mergeFootballWsFreshness(events);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[pulsescore] football WS overlay failed — serving REST events unmerged",
    );
    return events;
  }
}

// WS only re-broadcasts an event when PulseScore decides something about it
// changed — it does NOT re-broadcast every second the way REST is polled.
// A WS frame still within FOOTBALL_WS_EVENT_FRESHNESS_MS can therefore be
// for a moment strictly EARLIER than what REST's own most recent fetch
// already has (REST keeps advancing every ~1s regardless of WS activity).
// Reported in production (2026-08-09): the clock visibly ticking backward
// whenever a WS frame landed. Fixed by only ever accepting the WS reading
// if it's at least as advanced as REST's own — same "never regress a
// displayed value" rule already applied to score elsewhere in this
// codebase (see buildFootballLiveFromPulseScore's pulseScoreEventScore
// fallback in matches.ts), just applied at the merge point instead.
function clockSeconds(clock: NonNullable<PulseScoreEvent["matchClock"]>): number {
  return clock.minute * 60 + clock.second;
}

function isWsClockAtLeastAsAdvanced(
  wsClock: PulseScoreEvent["matchClock"],
  restClock: PulseScoreEvent["matchClock"],
): boolean {
  if (!wsClock) return false;
  if (!restClock) return true; // nothing to regress from
  // Different periods (e.g. one source already flipped to "2H", the other
  // still "1H"/"HT") means one side is mid-transition — comparing raw
  // minute:second across periods is meaningless, so don't guess: only trust
  // WS here if REST agrees on the period.
  if (wsClock.period !== restClock.period) return false;
  return clockSeconds(wsClock) >= clockSeconds(restClock);
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

/** Exported only for tests — see getPulseScoreFootballLive's header for the
 * per-event merge rules this implements. */
export function mergeFootballWsFreshness(restEvents: PulseScoreEvent[]): PulseScoreEvent[] {
  return restEvents.map((ev) => {
    if (!ev.eventId) return ev;
    const wsEv = getFootballWsEventIfFresh(ev.eventId, FOOTBALL_WS_EVENT_FRESHNESS_MS);
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
  odds?: { home: number | null; draw: number | null; away: number | null };
  totalGoals?: TotalGoalsOverride;
  // Extended markets — verified against a real GET /live-events?sport=soccer
  // sample (2026-08-08). Each maps 1:1 onto an existing AdvancedMarkets field
  // shape (matches.ts) so buildFootballLiveFromPulseScore can merge it
  // straight in, same as totalGoals above — no new UI needed, just real data
  // replacing the synthetic model wherever PulseScore actually priced it.
  doubleChance?: { homeOrDraw: number | null; awayOrDraw: number | null; homeOrAway: number | null };
  bothTeamsScore?: { yes: number; no: number };
  firstGoal?: { home: number | null; noGoal: number | null; away: number | null };
  drawNoBet?: { home: number | null; away: number | null };
  secondHalf?: { home: number | null; draw: number | null; away: number | null };
  goalOddEven?: { odd: number; even: number };
  cleanSheet?: { home: number | null; away: number | null };
  correctScore?: Record<string, number>;
  teamGoals?: Partial<{
    homeOver05: number; homeUnder05: number;
    homeOver15: number; homeUnder15: number;
    homeOver25: number; homeUnder25: number;
    awayOver05: number; awayUnder05: number;
    awayOver15: number; awayUnder15: number;
    awayOver25: number; awayUnder25: number;
  }>;
  // bwin-only so far: canonicalMarket "OTHER", rawName "Anytime Goalscorer" —
  // one selection per real player name plus a "No goalscorer" row, confirmed
  // against a real live sample (2026-08-08, 51 selections on one match).
  // `player` is exactly the rawName PulseScore sends — settlement.ts's
  // parseSelectionPlayerMarket matches a "pg:{playerName}" selection key
  // against the live goal-incident feed's player names
  // (getFootballGoalEventsFromExtras), so this only ever auto-settles for
  // matches that feed also covers; otherwise it just stays pending, same as
  // any other player-market bet on this codebase already does.
  anytimeGoalscorer?: Array<{ player: string; odds: number }>;
  // First Goalscorer — same shape as anytime: raw player name + odds.
  // 10bet sends canonicalMarket "FIRST_GOALSCORER"; bwin falls back to
  // rawName "First Goalscorer" in the OTHER bucket.
  firstGoalscorer?: Array<{ player: string; odds: number }>;
  // Last Goalscorer — same shape. 10bet canonicalMarket "LAST_GOALSCORER"
  // confirmed in tmp-10bet.json L7230; bwin uses rawName "Last Goalscorer".
  lastGoalscorer?: Array<{ player: string; odds: number }>;
  btts1H?: { yes: number; no: number };
  exactGoals?: {
    g0: number; g1: number; g2: number; g3: number; g4: number; g5plus: number;
  };
  corners?: {
    o85: number; u85: number;
    o95: number; u95: number;
    o105: number; u105: number;
  };
  cards?: { o35: number; u35: number; o45: number; u45: number };
  htft?: {
    hh: number; hd: number; ha: number;
    dh: number; dd: number; da: number;
    ah: number; ad: number; aa: number;
  };
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
// "over/under total goals" added 2026-08-15 after a real bwin sample (5
// live soccer events, /live-events?sport=soccer) showed several leagues
// (Turkey Super League, Bundesliga 2, Romania Liga I, Slovakia Super Liga)
// pricing the exact same canonicalMarket/period/shape (line on the market,
// OVER/UNDER selections at .5 lines) under this longer name instead of the
// previously-confirmed "Total Goals" — meaning isTotalGoalsMarket silently
// returned false and out.totalGoals never got real odds for any event using
// this label, even though bwin had real data. Additive only — "total goals"
// stays in case some leagues still use the shorter form.
const TOTAL_GOALS_RAW_NAMES = new Set([
  "match goals",
  "alternative match goals",
  "total goals",
  "over/under total goals",
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

// bwin-only so far: canonicalMarket "FIRST_TEAM_TO_SCORE", rawName "First
// Team to Score", selections HOME/NEITHER/AWAY ("No goal") — confirmed
// against real live and prematch samples (2026-08-08). Maps directly onto
// the existing AdvancedMarkets.firstGoal field (matches.ts), which every
// match already renders (frontend label "1.º Golo") from a synthetic price
// — this just supplies the real one when bwin has it. Not confirmed for
// bet365 (never seen this canonicalMarket in any bet365 sample).
function isFirstTeamToScoreMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return market.canonicalMarket === "FIRST_TEAM_TO_SCORE";
}

// bwin-only so far: canonicalMarket "OTHER", rawName "Anytime Goalscorer" —
// confirmed against a real live sample (2026-08-08). No canonicalMarket of
// its own (unlike FIRST_TEAM_TO_SCORE), so identified by rawName only, same
// fallback approach already used for bet365's OTHER-bucketed markets above.
function isAnytimeGoalscorerMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  return (market.rawName || "").trim().toLowerCase() === "anytime goalscorer";
}

// First Goalscorer market — covered by:
//   - 10bet: canonicalMarket === "FIRST_GOALSCORER" (own dedicated canonical,
//     confirmed in tmp-10bet.json) — NOT the bookmaker bet62's live football
//     feed actually uses (FOOTBALL_BOOKMAKER is "bwin", see client.ts), so
//     this branch never fires for real traffic on this platform.
//   - bwin: canonicalMarket === "OTHER", rawName === "First Goalscorer" —
//     UNCONFIRMED. Unlike every other bwin rawName check in this file (all
//     say "confirmed against a real live sample"), this one was never
//     actually seen in a real bwin payload — it's a guess by analogy with
//     "Anytime Goalscorer"'s confirmed name. If bwin uses a different label
//     (or doesn't offer this market at all), out.firstGoalscorer stays
//     permanently empty and the frontend's "Primeiro Marcador" section never
//     shows for any real match. See recordUnknownGoalscorerRawName below —
//     it logs bwin's actual rawName the next time a goalscorer-shaped OTHER
//     market slips through unmatched, which is what confirming this needs.
function isFirstGoalscorerMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  const raw = (market.rawName || "").trim().toLowerCase();
  return market.canonicalMarket === "FIRST_GOALSCORER" || raw === "first goalscorer";
}

// Last Goalscorer market — same unconfirmed-bwin-name situation as First
// Goalscorer above; see that function's comment.
//   - 10bet: canonicalMarket === "LAST_GOALSCORER" (confirmed in tmp-10bet.json L7230)
//   - bwin: canonicalMarket === "OTHER", rawName === "Last Goalscorer" — UNCONFIRMED
function isLastGoalscorerMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  const raw = (market.rawName || "").trim().toLowerCase();
  return market.canonicalMarket === "LAST_GOALSCORER" || raw === "last goalscorer";
}

// Diagnostic-only (2026-08-16): fires when an OTHER-bucket market's rawName
// looks like it's some kind of goalscorer market but didn't match any of
// isAnytimeGoalscorerMarket/isFirstGoalscorerMarket/isLastGoalscorerMarket
// above — the exact situation that would happen if bwin's real label for
// First/Last Goalscorer differs from the unconfirmed guess those two use.
// Deliberately separate from recordUnknownCanonicalMarket's dedup (keyed
// only by canonicalMarket, which is "OTHER" for dozens of already-handled
// markets — a goalscorer-shaped miss would be invisible in those logs,
// swallowed by whichever OTHER market got logged first) so the next real
// bwin payload carrying this market leaves a distinguishable trace with its
// actual rawName, giving future work real evidence instead of another guess.
const seenUnknownGoalscorerRawNames = new Set<string>();
function recordUnknownGoalscorerRawName(market: PulseScoreMarket): void {
  const raw = (market.rawName || "").trim();
  if (!raw) return;
  const lower = raw.toLowerCase();
  if (!lower.includes("goal") || !(lower.includes("score") || lower.includes("scorer"))) return;
  if (lower === "anytime goalscorer") return; // already handled — not a miss
  const key = `${market.canonicalMarket}::${raw}`;
  if (seenUnknownGoalscorerRawNames.has(key)) return;
  seenUnknownGoalscorerRawNames.add(key);
  logger.warn(
    { canonicalMarket: market.canonicalMarket, rawName: raw, period: market.period },
    "[pulsescore] goalscorer-shaped market didn't match any known handler — candidate real bwin name for First/Last Goalscorer",
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

// "{Team} Goals" (O/U at .5 lines) — distinct from "{Team} Total Goals"
// (discrete 0/1/2+ buckets under canonicalMarket HOME_OVER_UNDER/
// AWAY_OVER_UNDER, confirmed in the same 2026-08-15 sample below but NOT
// extracted here: no matching AdvancedMarkets field shape exists for a
// discrete per-team distribution, and critically its selections carry no
// `line` at all, so applyTeamGoalsMarket's line-keyed grouping would just
// skip every row anyway — safe by construction, not by this check alone).
//
// "Over/Under {Team} Total Goals" added 2026-08-15 after the same real bwin
// sample that motivated the TOTAL_GOALS_RAW_NAMES widening above showed
// several leagues pricing the identical O/U-at-.5-lines shape (line on the
// market, OVER/UNDER selections) under this longer name instead of the
// previously-confirmed "{Team} Goals" — same gap, same fix shape: additive,
// old name kept in case any league still uses the short form.
function isTeamGoalsMarket(market: PulseScoreMarket, teamName: string): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  const rawName = market.rawName || "";
  return (
    rawName === `${teamName} Goals` || rawName === `Over/Under ${teamName} Total Goals`
  );
}

function applyTeamGoalsMarket(
  market: PulseScoreMarket,
  side: "home" | "away",
  out: PulseScoreFootballOverride,
): void {
  const byLine = new Map<string, { over: number | null; under: number | null }>();
  for (const sel of market.selections ?? []) {
    // bwin puts the line on the market, not the selection — see
    // PulseScoreMarket.line's comment in client.ts. Checking sel.line first
    // keeps this working for bet365's per-selection shape too.
    const line = sel.line ?? market.line;
    if (!sel.isActive || line === undefined) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").toLowerCase();
    const key = String(line);
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

function isBtts1HMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FIRST_HALF") return false;
  if (market.canonicalMarket === "BOTH_TEAMS_TO_SCORE") return true;
  const raw = (market.rawName || "").toLowerCase();
  return raw.includes("both teams to score") && raw.includes("1st") ||
    raw.includes("btts") && raw.includes("first") ||
    raw.includes("ambas marcam") && raw.includes("1") ||
    raw === "both teams to score - first half" ||
    raw.includes("btts 1h");
}

function isExactGoalsMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  const raw = (market.rawName || "").toLowerCase();
  return raw === "total goals exact" ||
    raw === "exact goals" ||
    raw.includes("exact number of goals") ||
    raw === "goals exact" ||
    (market.canonicalMarket === "OTHER" && (raw.includes("exact goals") || raw.includes("goles exactos") || raw.includes("golos exatos")));
}

function isCornersMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  if (market.canonicalMarket === "CORNER_TOTALS" || market.canonicalMarket === "OVER_UNDER_CORNERS") return true;
  const raw = (market.rawName || "").toLowerCase();
  return raw.includes("corners") && (raw.includes("total") || raw === "corners" || raw.includes("match corners"));
}

function isCardsMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  if (market.canonicalMarket === "OVER_UNDER_CARDS" || market.canonicalMarket === "BOOKING_POINTS") return true;
  const raw = (market.rawName || "").toLowerCase();
  return (raw.includes("cards") && (raw.includes("total") || raw === "cards" || raw.includes("match cards"))) ||
    raw.includes("booking") ||
    raw.includes("cartoes") ||
    raw.includes("cartões");
}

function isHtftMarket(market: PulseScoreMarket): boolean {
  if ((market.period || "").toUpperCase() !== "FULL_TIME") return false;
  if (market.canonicalMarket === "HALF_TIME_FULL_TIME") return true;
  const raw = (market.rawName || "").toLowerCase();
  return raw === "half time / full time" ||
    raw === "half-time/full-time" ||
    raw.includes("ht/ft") ||
    raw.includes("intervalo / final") ||
    raw.includes("intervalo/final");
}

function parseHtftSelection(raw: string): keyof NonNullable<PulseScoreFootballOverride["htft"]> | null {
  const r = raw.replace(/\s+/g, "").toLowerCase();
  const norm = (s: string): string =>
    s.replace(/1|home|casa|sevilla|rayo/gi, "h").replace(/2|away|fora|visitante/gi, "a").replace(/x|draw|empate/gi, "d");
  const n = norm(r);
  const nine: Record<string, keyof NonNullable<PulseScoreFootballOverride["htft"]>> = {
    hh: "hh", hd: "hd", ha: "ha",
    dh: "dh", dd: "dd", da: "da",
    ah: "ah", ad: "ad", aa: "aa",
  };
  return nine[n] ?? null;
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
        // Team-name match FIRST — raw names are the ground truth for which
        // side a selection represents, because bwin has been observed sending
        // canonicalOutcome=HOME on the AWAY team's row (and vice-versa) for
        // specific live matches, which flipped every 1X2 price in the UI.
        // The canonical tag is a weak hint that is only trusted if the
        // selection's raw name doesn't explicitly match either team.
        if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
        else if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
        else if (sel.canonicalOutcome === "DRAW") draw = val;
        else {
          const raw = (sel.rawName || "").toLowerCase().trim();
          if (/draw|empate|x\b/.test(raw)) draw = val;
        }
      }
      // Accept PARTIAL results now — previously this required all three
      // sides to be non-null, which meant bwin inactivating just the
      // already-winning side (common in the 2nd half for a decided scoreline)
      // caused the entire real-odds slot to collapse back onto the Poisson
      // synthetic baseline (or stale last-known values), producing the
      // "--" / inverted odds reported in production. Missing pieces are
      // filled in by the builder on the matches.ts side using the Poisson
      // model as a local donor for the individual missing slot.
      if (home !== null || draw !== null || away !== null) {
        out.odds = { home, draw, away };
      }
    } else if (isTotalGoalsMarket(market)) {
      // `line` lives per-selection on bet365 (not per-market as the docs
      // implied) — group selections by line, since one event can carry
      // several O/U lines as separate market entries or within one. bwin is
      // the opposite: every selection in an entire real doc sample (3293
      // market blocks, 2026-08-08/09) carried NO line of its own — it's
      // always on the market instead, one line per market object. Checking
      // sel.line first, falling back to market.line, covers both shapes.
      const byLine = new Map<string, { over: number | null; under: number | null }>();
      for (const sel of market.selections ?? []) {
        const line = sel.line ?? market.line;
        if (!sel.isActive || line === undefined) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const key = String(line);
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
      if (homeOrDraw !== null || awayOrDraw !== null || homeOrAway !== null) {
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
    } else if (isFirstTeamToScoreMarket(market)) {
      let home: number | null = null;
      let noGoal: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        // Name-first ordering, same reasoning as the 1X2 handler above.
        if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
        else if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
        else if (sel.canonicalOutcome === "NEITHER") noGoal = val;
        else {
          const raw = (sel.rawName || "").toLowerCase().trim();
          if (raw.includes("no goal") || raw.includes("sem gol") || raw === "ng") noGoal = val;
        }
      }
      if (home !== null || noGoal !== null || away !== null) {
        out.firstGoal = { home, noGoal, away };
      }
    } else if (isAnytimeGoalscorerMarket(market)) {
      const scorers: Array<{ player: string; odds: number }> = [];
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const player = (sel.rawName || "").trim();
        if (!player || player.toLowerCase() === "no goalscorer") continue;
        scorers.push({ player, odds: val });
      }
      if (scorers.length > 0) out.anytimeGoalscorer = scorers;
    } else if (isFirstGoalscorerMarket(market)) {
      const scorers: Array<{ player: string; odds: number }> = [];
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const player = (sel.rawName || "").trim();
        if (!player || /no (first )?goal(scorer)?/i.test(player)) continue;
        scorers.push({ player, odds: val });
      }
      if (scorers.length > 0) out.firstGoalscorer = scorers;
    } else if (isLastGoalscorerMarket(market)) {
      const scorers: Array<{ player: string; odds: number }> = [];
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const player = (sel.rawName || "").trim();
        if (!player || /no (last )?goal(scorer)?/i.test(player)) continue;
        scorers.push({ player, odds: val });
      }
      if (scorers.length > 0) out.lastGoalscorer = scorers;
    } else if (isDrawNoBetMarket(market)) {
      let home: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        // Name-first ordering, same reasoning as the 1X2 handler above.
        if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
        else if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
      }
      if (home !== null || away !== null) out.drawNoBet = { home, away };
    } else if (isSecondHalfWinnerMarket(market)) {
      let home: number | null = null;
      let draw: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        // Name-first ordering, same reasoning as the 1X2 handler above.
        if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
        else if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
        else if (sel.canonicalOutcome === "DRAW") draw = val;
        else {
          const raw = (sel.rawName || "").toLowerCase().trim();
          if (/draw|empate|x\b/.test(raw)) draw = val;
        }
      }
      if (home !== null || draw !== null || away !== null) {
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
        // Name-first ordering, same reasoning as the 1X2 handler above.
        if (teamNamesMatch(sel.rawName, ev.home)) home = val;
        else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
        else if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
      }
      if (home !== null || away !== null) out.cleanSheet = { home, away };
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
    } else if (isBtts1HMarket(market)) {
      let yes: number | null = null;
      let no: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "YES") yes = val;
        else if (sel.canonicalOutcome === "NO") no = val;
        else {
          const raw = (sel.rawName || "").toLowerCase();
          if (raw === "yes" || raw.includes("sim") || /\by\b/.test(raw)) yes = val;
          else if (raw === "no" || raw.includes("não") || raw.includes("nao") || /\bn\b/.test(raw)) no = val;
        }
      }
      if (yes !== null && no !== null) out.btts1H = { yes, no };
    } else if (isExactGoalsMarket(market)) {
      const g: Record<string, number> = {};
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const raw = (sel.rawName || "").toLowerCase().trim();
        let bucket: string | null = null;
        const single = /^(0|1|2|3|4)(\s*gols?)?$/.exec(raw);
        if (single) bucket = `g${single[1]}`;
        else if (/^(\d)\+(\s*gols?)?$/.test(raw) || /^\s*5\s*\+/.test(raw) || /\b5\+\b/.test(raw) || /^five\+?/.test(raw) || raw.includes("5 or more") || raw.includes("mais de 5") || raw.includes("5+ gols")) bucket = "g5plus";
        else if (/^0\b/.test(raw) || raw.startsWith("no goal") || raw === "sem golos" || raw === "sin goles" || /\bzero\b/.test(raw)) bucket = "g0";
        else if (/^1\b/.test(raw) || raw === "1 gol" || raw === "un gol") bucket = "g1";
        else if (/^2\b/.test(raw) || raw === "2 gols" || raw === "dos goles") bucket = "g2";
        else if (/^3\b/.test(raw) || raw === "3 gols" || raw === "tres goles") bucket = "g3";
        else if (/^4\b/.test(raw) || raw === "4 gols" || raw === "cuatro goles") bucket = "g4";
        if (!bucket) continue;
        g[bucket] = val;
      }
      const need: Array<keyof NonNullable<PulseScoreFootballOverride["exactGoals"]>> = ["g0","g1","g2","g3","g4","g5plus"];
      if (need.every((k) => typeof g[k] === "number")) {
        out.exactGoals = { g0: g.g0!, g1: g.g1!, g2: g.g2!, g3: g.g3!, g4: g.g4!, g5plus: g.g5plus! };
      }
    } else if (isCornersMarket(market)) {
      const byLine = new Map<string, { over: number | null; under: number | null }>();
      for (const sel of market.selections ?? []) {
        const line = sel.line ?? market.line;
        if (!sel.isActive || line === undefined) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const key = String(line);
        const entry = byLine.get(key) ?? { over: null, under: null };
        if (sel.canonicalOutcome === "OVER") entry.over = val;
        else if (sel.canonicalOutcome === "UNDER") entry.under = val;
        else {
          const raw = (sel.rawName || "").toLowerCase();
          if (raw.includes("over") || raw.includes("acima") || raw.includes("mais")) entry.over = val;
          else if (raw.includes("under") || raw.includes("abaixo") || raw.includes("menos")) entry.under = val;
        }
        byLine.set(key, entry);
      }
      const patch: Record<string, number> = {};
      for (const [line, suffix] of [
        ["8.5", "85"], ["9.5", "95"], ["10.5", "105"],
      ] as const) {
        const entry = byLine.get(line);
        if (entry?.over != null) patch[`o${suffix}`] = entry.over;
        if (entry?.under != null) patch[`u${suffix}`] = entry.under;
      }
      if (Object.keys(patch).length > 0) {
        out.corners = { o85: 0, u85: 0, o95: 0, u95: 0, o105: 0, u105: 0, ...patch } as NonNullable<PulseScoreFootballOverride["corners"]>;
      }
    } else if (isCardsMarket(market)) {
      const byLine = new Map<string, { over: number | null; under: number | null }>();
      for (const sel of market.selections ?? []) {
        const line = sel.line ?? market.line;
        if (!sel.isActive || line === undefined) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const key = String(line);
        const entry = byLine.get(key) ?? { over: null, under: null };
        if (sel.canonicalOutcome === "OVER") entry.over = val;
        else if (sel.canonicalOutcome === "UNDER") entry.under = val;
        else {
          const raw = (sel.rawName || "").toLowerCase();
          if (raw.includes("over") || raw.includes("acima") || raw.includes("mais")) entry.over = val;
          else if (raw.includes("under") || raw.includes("abaixo") || raw.includes("menos")) entry.under = val;
        }
        byLine.set(key, entry);
      }
      const patch: Record<string, number> = {};
      for (const [line, suffix] of [["3.5", "35"], ["4.5", "45"]] as const) {
        const entry = byLine.get(line);
        if (entry?.over != null) patch[`o${suffix}`] = entry.over;
        if (entry?.under != null) patch[`u${suffix}`] = entry.under;
      }
      if (Object.keys(patch).length > 0) {
        out.cards = { o35: 0, u35: 0, o45: 0, u45: 0, ...patch } as NonNullable<PulseScoreFootballOverride["cards"]>;
      }
    } else if (isHtftMarket(market)) {
      const htft: Partial<NonNullable<PulseScoreFootballOverride["htft"]>> = {};
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const key = parseHtftSelection(sel.rawName || "");
        if (!key) continue;
        htft[key] = val;
      }
      const need9: Array<keyof NonNullable<PulseScoreFootballOverride["htft"]>> = ["hh","hd","ha","dh","dd","da","ah","ad","aa"];
      if (need9.every((k) => typeof htft[k] === "number")) {
        out.htft = htft as NonNullable<PulseScoreFootballOverride["htft"]>;
      }
    } else {
      recordUnknownGoalscorerRawName(market);
      recordUnknownCanonicalMarket(market.canonicalMarket);
    }
  }
  return out;
}

/** Finds the PulseScore live event matching a tracked match by team name
 * (tolerant cross-provider match, same approach as teamMatch.ts's
 * cross-provider matcher) and returns its market override, if any. `events`
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
  if (FOOTBALL_PULSESCORE_BLOCKED) return [];
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
