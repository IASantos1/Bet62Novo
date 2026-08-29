import { Router, type IRouter, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket as WsClient } from "ws";
import {
  CONFIG,
  FOOTBALL_SUSP_KEYS,
  footballSuspensionDelayMs,
} from "../lib/config.js";
import { logger } from "../lib/logger.js";
import {
  getCompetitionCatalogDecisions,
  syncLiveCompetitionCatalog,
} from "../lib/liveCompetitionCatalog.js";
import {
  buildMatchSettlementJobId,
  enqueueMatchSettlement,
} from "../lib/settlementQueue.js";
import { db, matchResultsTable, apiFootballNameMismatchesTable } from "../../../../lib/db/src/index.js";
import { eq, and, gte, sql } from "drizzle-orm";
import * as http from "http";
import * as net from "net";
import {
  getPulseScoreFootballLive,
  extractFootballOverride,
  pulseScoreEventScore,
  pulseScoreEventMinute,
  pulseScoreEventClockSec,
  pulseScoreEventClockFinished,
  getPulseScoreFootballUpcoming,
} from "../services/pulsescore/football.js";
import {
  getSportMonksFootballUpcoming,
  getSportMonksFootballLive,
  extractSportMonksFootballOverride,
  getSportMonksFixtureScore,
  getSportMonksFixtureMinute,
  isSportMonksFixtureLive,
  isSportMonksFixtureFinished,
  countSportMonksRedCards,
  getSportMonksFixtureCornersCards,
  getSportMonksFixtureById,
  getSportMonksTeamUpcoming,
  getSportMonksTeamHeadToHead,
  isFootballLiveDisplayEvent,
  SPORTMONKS_FOOTBALL_LEAGUE_IDS,
  type SportMonksFixture,
  type SportMonksFootballOverride,
} from "../services/sportmonks/football.js";
import {
  getPulseScoreTennisLive,
  extractTennisOverride,
  getPulseScoreTennisUpcoming,
  extractTennisPrematchExtra,
  extractTennisLiveExtra,
  type PulseScoreTennisLiveExtra,
} from "../services/pulsescore/tennis.js";
import { hasDrawMarket, looksLikeTennisLeague } from "../services/pulsescore/tennisWs.js";
import {
  getPulseScoreBasketballUpcoming,
  getPulseScoreBasketballLive,
  extractBasketballOverride,
  type PulseScoreBasketballOverride,
} from "../services/pulsescore/basketball.js";
import {
  getPulseScoreHockeyUpcoming,
  extractHockeyOverride,
} from "../services/pulsescore/hockey.js";
import {
  getPulseScoreVolleyballUpcoming,
  getPulseScoreVolleyballLive,
  extractVolleyballOverride,
} from "../services/pulsescore/volleyball.js";
import {
  getPulseScoreMmaUpcoming,
  extractMmaOverride,
} from "../services/pulsescore/mma.js";
import {
  getPulseScoreBaseballUpcoming,
  extractBaseballOverride,
  type PulseScoreBaseballPrematchEvent,
} from "../services/pulsescore/baseball.js";
import { pulseScoreHockey, pulseScoreBaseball } from "../services/pulsescore/genericSportLive.js";
import { teamNamesMatch } from "../services/pulsescore/teamMatch.js";
import type { PulseScoreEvent } from "../services/pulsescore/client.js";
import {
  getApiFootballLiveFixtures,
  findApiFootballFixture,
  fixtureHasRedCard,
  fixtureHasVarReview,
  latestGoalScorer,
  latestGoalIsPenalty,
  fixturePenaltyEvents,
  getApiFootballStandingsForLeague,
  getApiFootballFixtureStatistics,
  getApiFootballTeamLogo,
  batchResolveApiFootballTeamLogos,
  getMappedApiFootballFixtureId,
  recordConfirmedFixtureMapping,
  recordConfirmedTeamMapping,
  type ApiFootballFixture,
} from "../services/apiFootball.js";
import {
  getCachedTeamId,
  resolveTeamIdInBackground,
} from "../services/sportsApiTeamLookup.js";

const router: IRouter = Router();

// SportsAPI Pro V2 — real-time live scores (V2 domains, correct paths)
const SAPI_V2_FOOTBALL = "https://v2.football.sportsapipro.com/api";
const SAPI_V2_BASKETBALL = "https://v2.basketball.sportsapipro.com/api";
const SAPI_V2_HOCKEY = "https://v2.hockey.sportsapipro.com/api";
const SAPI_V2_TENNIS = "https://v2.tennis.sportsapipro.com/api";
const SAPI_V2_BASEBALL = "https://v2.baseball.sportsapipro.com/api";
// No V2 volleyball domain is available

// SportsAPI Pro V1 — lower-latency HTTP endpoints (1-2s vs V2's 3-5s)
// IMPORTANT: V1 uses versioned paths /api/v1/{sport}/ — NOT /api/ (which returns 404)
// Tennis is the exception: it still uses /api as base because its own functions
// append /v1/tennis/ manually (e.g. ${SAPI_V1_TENNIS}/v1/tennis/live)
const SAPI_V1_FOOTBALL = "https://v1.football.sportsapipro.com/api/v1/football";
const SAPI_V1_BASKETBALL =
  "https://v1.basketball.sportsapipro.com/api/v1/basketball";
const SAPI_V1_HOCKEY = "https://v1.hockey.sportsapipro.com/api/v1/hockey";
const SAPI_V1_BASEBALL = "https://v1.baseball.sportsapipro.com/api/v1/baseball";
const SAPI_V1_TENNIS = "https://v1.tennis.sportsapipro.com/api";

// Auth headers helper
const sapiHeaders = (): Record<string, string> => ({
  "x-api-key": CONFIG.SPORTSAPI_KEY,
});

type FootballProviderMode = "auto" | "sportsapipro" | "statpal";

function normalizeFootballProviderMode(
  value: string | undefined,
): FootballProviderMode {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "sportsapipro" || raw === "sportsapi") return "sportsapipro";
  if (raw === "statpal" || raw === "statspal") return "statpal";
  return "auto";
}

function statpalHeaders(): Record<string, string> {
  return { Accept: "application/json" };
}

function buildStatpalUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const base = CONFIG.STATPAL_BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  url.searchParams.set("access_key", CONFIG.STATPAL_API_KEY);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function statpalList<T>(raw: T | T[] | null | undefined): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function canUseFootballProvider(
  configured: string | undefined,
  target: "statpal" | "sportsapipro",
): boolean {
  const mode = normalizeFootballProviderMode(configured);
  if (target === "statpal") {
    return mode === "auto" || mode === "statpal";
  }
  return mode === "auto" || mode === "sportsapipro" || mode === "statpal";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AdvancedMarkets = {
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore: { yes: number; no: number };
  totalGoals: {
    over05: number;
    under05: number;
    over15: number;
    under15: number;
    over25: number;
    under25: number;
    over35: number;
    under35: number;
    over45: number;
    under45: number;
    over55: number;
    under55: number;
    over65: number;
    under65: number;
  };
  handicap: {
    homeMinusOne: number;
    awayPlusOne: number;
    homeMinusOneHalf: number;
    awayPlusOneHalf: number;
  };
  halfTime: { home: number; draw: number; away: number };
  firstGoal: { home: number; noGoal: number; away: number };
  // Extended football markets
  drawNoBet?: { home: number; away: number };
  asianHandicap?: { line: number; home: number; away: number };
  asianTotals?: {
    o05: number;
    u05: number;
    o45: number;
    u45: number;
    o55: number;
    u55: number;
    o225: number;
    u225: number;
    o275: number;
    u275: number;
  };
  htft?: {
    hh: number;
    hd: number;
    ha: number;
    dh: number;
    dd: number;
    da: number;
    ah: number;
    ad: number;
    aa: number;
  };
  correctScore?: Record<string, number>;
  // Anytime Goalscorer — one row per real player name, PulseScore/bwin only
  // (confirmed real, 2026-08-08). `player` matches exactly what the frontend
  // must send back as the "pg:{player}" selection key for
  // settlement.ts's parseSelectionPlayerMarket/getFootballGoalEventsFromExtras
  // to auto-settle it against Statpal's own goal-incident player names.
  anytimeGoalscorer?: Array<{ player: string; odds: number }>;
  // First Goalscorer — same shape as anytimeGoalscorer. Selection key prefix
  // `fg:{player}` in the frontend; settlement matches it against goal events
  // in the order they happened (first one wins; no goal → stays open).
  firstGoalscorer?: Array<{ player: string; odds: number }>;
  // Last Goalscorer — same shape. Selection key prefix `lg:{player}`;
  // settlement resolves only when the match ends (last goal wins).
  lastGoalscorer?: Array<{ player: string; odds: number }>;
  corners?: {
    o85: number;
    u85: number;
    o95: number;
    u95: number;
    o105: number;
    u105: number;
  };
  cards?: { o35: number; u35: number; o45: number; u45: number };
  // Sport-specific extras
  _spread?: number;
  _total?: number;
  _total1H?: number;
  _spreadLine?: number;
  // Basketball extended markets
  basketballExtra?: {
    q1: { home: number; away: number };
    q2: { home: number; away: number };
    q3: { home: number; away: number };
    q4: { home: number; away: number };
    q1Total?: { line: number; over: number; under: number };
    q2Total?: { line: number; over: number; under: number };
    q3Total?: { line: number; over: number; under: number };
    q4Total?: { line: number; over: number; under: number };
    q1Spread?: { line: number; home: number; away: number };
    q2Spread?: { line: number; home: number; away: number };
    q3Spread?: { line: number; home: number; away: number };
    q4Spread?: { line: number; home: number; away: number };
    teamTotalHome: { line: number; over: number; under: number };
    teamTotalAway: { line: number; over: number; under: number };
    anyQuarter?: { home: number; away: number };
    allQuarters?: { home: number; away: number };
    firstPoint?: { home: number; away: number };
    nextPoint?: { home: number; away: number };
    nextThree?: { home: number; away: number };
    totalsRange?: Array<{ line: number; over: number; under: number }>;
    // Real bwin data (extractBasketballOverride) overrides q1/q1Total and
    // q3/q3Total above when present — see that function's header for why
    // q2/q4 stay synthetic-only, and applyBasketballPeriodOverrides's header
    // for why q1Spread/q3Spread are deliberately NOT overridden yet (a
    // pre-existing sign-handling bug in spread settlement, found but not
    // fixed while wiring this up). firstHalf/firstHalfTotal below have no
    // synthetic equivalent (added 2026-08-15 alongside the real extraction),
    // so they're simply absent until real data populates them; no
    // firstHalfSpread field for the same reason q1Spread/q3Spread aren't
    // wired yet.
    firstHalf?: { home: number; away: number };
    firstHalfTotal?: { line: number; over: number; under: number };
  };
  // Tennis extended markets
  tennisExtra?: {
    firstSet: { home: number; away: number };
    set2: { home: number; away: number };
    set3: { home: number; away: number };
    exactSets: { h20: number; h21: number; a02: number; a12: number };
    setHandicap: { line: number; home: number; away: number };
    totalGames: { line: number; over: number; under: number };
    totalGamesLines: Array<{ line: number; over: number; under: number }>;
    set1Games: { line: number; over: number; under: number };
    gameHandicap: { line: number; home: number; away: number };
    // Live: exact score market for the current set in progress
    setExactScore?: Record<string, number>;
    set1ExactScore?: Record<string, number>;
    set2ExactScore?: Record<string, number>;
    currentSetNum?: number;
    // Extended pre-match odds fields
    set2Games?: { line: number; over: number; under: number };
    homePlayerGames?: { line: number; over: number; under: number };
    awayPlayerGames?: { line: number; over: number; under: number };
    // 2nd-set versions of gameHandicap/homePlayerGames/awayPlayerGames —
    // real onexbet data (extractTennisPrematchExtra in
    // services/pulsescore/tennis.ts), same canonicalMarkets/shape, period
    // SECOND_SET instead of FULL_TIME.
    gameHandicapSet2?: { line: number; home: number; away: number };
    homePlayerGamesSet2?: { line: number; over: number; under: number };
    awayPlayerGamesSet2?: { line: number; over: number; under: number };
    oddEvenGames?: { odd: number; even: number };
    oddEven1st?: { odd: number; even: number };
    oddEven2nd?: { odd: number; even: number };
    winAtLeast1P1?: { yes: number; no: number };
    winAtLeast1P2?: { yes: number; no: number };
    setMatch?: { h11: number; h12: number; a21: number; a22: number };
    tieBreak?: { yes: number; no: number };
    tieBreak1st?: { yes: number; no: number };
    totalTieBreaks?: { line: number; over: number; under: number };
    highestSetTotal?: { line: number; over: number; under: number };
    setsScoring?: { firstHigher: number; secondHigher: number; equal: number };
    score1st?: Array<{ label: string; odds: number }>;
    score2nd?: Array<{ label: string; odds: number }>;
    score3rd?: Array<{ label: string; odds: number }>;
    // Real PulseScore live markets with no prior equivalent field — see
    // extractTennisLiveExtra in services/pulsescore/tennis.ts.
    totalSets?: { line: number; over: number; under: number };
    straightSetsWinner?: { yes: number; no: number };
    goTheDistance?: { yes: number; no: number };
    finalSetTieBreakOrExtra?: { yes: number; no: number };
  };
  // Hockey extended markets
  hockeyExtra?: {
    period1?: { home: number; draw: number; away: number };
    period2: { home: number; draw: number; away: number };
    period3: { home: number; draw: number; away: number };
    period1Total: { line: number; over: number; under: number };
    period2Total?: { line: number; over: number; under: number };
    period3Total?: { line: number; over: number; under: number };
    bothTeamsScoreGame: { yes: number; no: number };
    shotsOnGoal: { line: number; over: number; under: number };
    // Real onexbet data (extractHockeyOverride in
    // services/pulsescore/hockey.ts).
    drawNoBet?: { home: number; away: number };
    correctScore?: Array<{ label: string; odds: number }>;
    nextGoal?: { home: number; away: number; none: number };
  };
  // Baseball extended markets (First 5 Innings) — was already produced by
  // makeMLBMarketsFromTeams's synthetic model (`as unknown as
  // AdvancedMarkets` cast, never formally typed) before this field existed
  // here; now real onexbet data can override it the same way every other
  // sport's Extra field does.
  mlbExtra?: {
    f5Result?: { home: number; away: number };
    f5Total?: { line: number; over: number; under: number };
  };
  // Volleyball extended markets
  volleyballExtra?: {
    set1: { home: number; away: number };
    set2: { home: number; away: number };
    set3: { home: number; away: number };
    exactScore: {
      s30: number;
      s31: number;
      s32: number;
      s03: number;
      s13: number;
      s23: number;
    };
    setHandicap: { home: number; away: number };
    pointsLines: Array<{ line: number; over: number; under: number }>;
    handicapPoints: { line: number; home: number; away: number };
    // Real onexbet data (extractVolleyballOverride in
    // services/pulsescore/volleyball.ts) — per-set totals, per-set points
    // handicap, and "Race To N Points" (2-way per line, not O/U).
    set2PointsLines?: Array<{ line: number; over: number; under: number }>;
    set3PointsLines?: Array<{ line: number; over: number; under: number }>;
    set2HandicapPoints?: { line: number; home: number; away: number };
    set3HandicapPoints?: { line: number; home: number; away: number };
    raceToPointsSet2?: Array<{ line: number; home: number; away: number }>;
    raceToPointsSet3?: Array<{ line: number; home: number; away: number }>;
  };
  // Second half result (who wins just the 2nd half period)
  secondHalf?: { home: number; draw: number; away: number };
  // Football extra-time markets (shown when match is in ET, minute > 90)
  etExtra?: {
    tieWinner: { home: number; away: number }; // who advances from the knockout tie (no draw)
    etResult: { home: number; draw: number; away: number }; // ET period result (draw means → penalties)
    totalGoals: {
      o05: number;
      u05: number;
      o15: number;
      u15: number;
      o25: number;
      u25: number;
      o35: number;
      u35: number;
      o45: number;
      u45: number;
    };
    nextGoal: { home: number; away: number }; // which team scores next in ET
    // 1st/2nd ET-half result — all-zero (hidden) until that half's goals are
    // known, or if the feed doesn't distinguish ET halves for this match.
    firstHalfResult: { home: number; draw: number; away: number };
    secondHalfResult: { home: number; draw: number; away: number };
    corners: {
      o15: number;
      u15: number;
      o25: number;
      u25: number;
      o35: number;
      u35: number;
    };
    cards: {
      o05: number;
      u05: number;
      o15: number;
      u15: number;
      o25: number;
      u25: number;
    };
    // Exact score of the ET period only, e.g. "0-0", "1-0", ... "outro" (any other combo)
    exactScore: Record<string, number>;
  };
  // Football penalty-shootout markets (shown when m.penalties exists during live)
  penExtra?: {
    winner: { home: number; away: number };
  };
  // Football extra markets derived from Poisson model
  winToNil?: { home: number; away: number };
  cleanSheet?: { home: number; away: number };
  goalOddEven?: { odd: number; even: number };
  exactGoals?: {
    g0: number;
    g1: number;
    g2: number;
    g3: number;
    g4: number;
    g5plus: number;
  };
  btts1H?: { yes: number; no: number };
  btts2H?: { yes: number; no: number };
  toWinBothHalves?: { home: number; away: number };
  highestScoringHalf?: { first: number; second: number; equal: number };
  // Half-time and 2nd-half exact score markets
  htCorrectScore?: Record<string, number>;
  h2CorrectScore?: Record<string, number>;
  // Team goals O/U (each team individually) — kept Partial because providers
  // (bwin) often price only a subset of lines (e.g. just home team O/U or just
  // the 2.5 line); missing lines simply stay unpopulated.
  teamGoals?: Partial<{
    homeOver05: number;
    homeUnder05: number;
    homeOver15: number;
    homeUnder15: number;
    homeOver25: number;
    homeUnder25: number;
    awayOver05: number;
    awayUnder05: number;
    awayOver15: number;
    awayUnder15: number;
    awayOver25: number;
    awayUnder25: number;
  }>;
};

export type LiveMatchState = {
  id: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeImageVersion?: string;
  awayImageVersion?: string;
  // Direct crest URLs from API-Football (football only) — preferred over the
  // homeTeamId/homeImageVersion pair above where present, since those need
  // an extra SportsAPI ID-to-URL construction (buildSportsApiTeamLogoUrl in
  // home.tsx) that can fail to resolve at all for lower-coverage teams,
  // while API-Football already returns the finished URL on the same fixture
  // this file's events/red-card data comes from.
  homeLogoUrl?: string;
  awayLogoUrl?: string;
  league: string;
  country: string;
  sport: string;
  // Football only — market-depth/staking tier (1 = full, 4 = minimal). See
  // footballMarketTier()/filterFootballMarketsByTier() further down.
  matchTier?: FootballMarketTier;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  hasRealOdds: boolean;
  odds: { home: number; draw: number; away: number };
  markets: AdvancedMarkets;
  events: Array<{ type: string; team: string; minute: number; player: string; detail?: string }>;
  // Count of VAR-typed events seen so far (API-Football) — compared tick-to-
  // tick to detect a NEW VAR review vs. one already suspended for, same
  // reasoning as redCardsHome/Away being counts rather than a single flag.
  _apiFootballVarEventCount?: number;
  // Count of penalty-outcome events (scored OR missed) seen so far — same
  // tick-to-tick comparison reasoning, needed to catch a MISSED penalty
  // (goalScored never fires for one, since the score doesn't change).
  _apiFootballPenaltyEventCount?: number;
  // True once apiFixture has been successfully cross-referenced at least
  // ONCE for this match — bug report 2026-08-11 ("todos os jogos ficando
  // suspensos direto"): _apiFootballVarEventCount/redCardsHome/Away/
  // _apiFootballPenaltyEventCount all default to 0 the very first time
  // they're ever read, indistinguishable from "genuinely 0 incidents so
  // far". A match commonly goes several minutes (or longer — see the
  // apifootball-usage admin diagnostic) before its FIRST successful
  // apiFixture cross-reference; if a red card/VAR check/missed penalty
  // already happened in that window, the fixture's real (nonzero) count
  // compared against that untouched "0" baseline read as a brand NEW
  // incident on the very first matched tick — firing an immediate false
  // suspension for something that had already happened, for essentially
  // every match sooner or later. Gates newRedCard/newVarReview/
  // newPenaltyEvent below: on the first-ever matched tick, the real counts
  // still get recorded (so future genuine increases compare correctly),
  // just without treating that initial jump itself as a new incident.
  _apiFootballEverMatched?: boolean;
  // Once findApiFootballFixture resolves a fixture for this PulseScore
  // match, its fixtureId is remembered here and preferred on every later
  // tick (direct id lookup) instead of re-running fuzzy team-name/league/
  // kickoff-time matching from scratch each time — user-requested
  // (2026-08-12) architecture hardening: re-matching by name every ~1-2s
  // tick, even with the league/time disambiguation added the same day, is
  // still probabilistic and was the actual mechanism behind several bugs
  // fixed this session (VAR/red-card counts spuriously resetting, etc.) —
  // an id, once confirmed, is exact and can't independently drift the way
  // two fuzzy string comparisons on two different ticks can. Falls back to
  // fresh fuzzy matching only when this id stops appearing in the live
  // batch (API-Football's own hiccup, or the match genuinely ended there).
  _apiFootballFixtureId?: number;
  // Count of consecutive live-feed ticks where a candidate API-Football
  // fixture's score was cross-validated against PulseScore's own score
  // and both sides matched (or one was null). Used as a confidence gate
  // BEFORE the fixture id is persisted into api_football_fixture_mappings
  // (the cross-session DB table) — user-requested 2026-08-12 fix for a
  // class of "wrong match attached" cases where a very-early-in-match
  // score (0-0 everywhere) looked like it matched from the fuzzer's point
  // of view despite actually pointing at a different 0-0 fixture. Increment
  // resets to 0 on any score DISAGREEMENT (non-null sides differ). Only
  // ticks ≥ 3 are considered trustworthy enough to write to the DB
  // permanently. Hitting ≥ 3 also clears this field on the next tick since
  // the DB table takes over as the primary fixture-id anchor from then on.
  _apiFootballScoreAlignTicks?: number;
  date?: string;
  time?: string;
  // market key → timestamp (ms) when it reopens; absent or past = open
  marketSuspension?: Record<string, number>;
  // Reason for current suspension (displayed in UI)
  _suspensionReason?: string;
  // Timestamp (ms) the goal-confirmation hold (goalUnconfirmedByApiFootball,
  // below) first started re-arming the suspension for the CURRENT
  // unconfirmed goal — cleared once confirmed or once the hard cap trips.
  // Lets the hold give up and fall back to plain timer behavior instead of
  // re-suspending forever if API-Football's own fixture cache ever gets
  // stuck (see GOAL_HOLD_MAX_MS's comment).
  _goalHoldSince?: number;
  // Feed health warning (must not be treated as a market suspension)
  _feedWarning?: string;
  // Statpal league ID — used for player markets (football only)
  leagueId?: string;
  // Red cards per team (football only; 0 = none)
  redCardsHome?: number;
  redCardsAway?: number;
  // Live match statistics (football only) from API-Football's
  // /fixtures/statistics — null per field when that stat wasn't present in
  // the raw response (not yet reported for this match, or an unexpected
  // type-string variant — see apiFootball.ts's STAT_TYPE_MAP), absent
  // entirely when no API-Football fixture was matched at all.
  matchStats?: {
    shotsTotalHome: number | null;
    shotsTotalAway: number | null;
    shotsOnTargetHome: number | null;
    shotsOnTargetAway: number | null;
    possessionHome: number | null;
    possessionAway: number | null;
    cornersHome: number | null;
    cornersAway: number | null;
    foulsHome: number | null;
    foulsAway: number | null;
  };
  // Minutes until match starts (only present for "Em Breve" pre-match entries)
  startsIn?: number;
  // Scheduled kickoff time (HH:MM, Portugal UTC+1) for "Em Breve" entries
  scheduledTime?: string;
  // Scheduled date (DD.MM.YYYY) for "Em Breve" entries
  scheduledDate?: string;
  // Internal tracking for live odds drift engine
  _baseOdds?: { home: number; draw: number; away: number };
  _baseMarkets?: AdvancedMarkets; // anchor for market drift — prevents exponential compounding
  _oddsUpdatedAt?: number;
  _driftPhase?: number;
  // Per-market independent update schedule: key → next allowed update time (ms)
  // Ensures each market group updates at its own cadence, never all at once
  _marketNextUpdate?: Record<string, number>;
  // Timestamps for stale-match expiry
  _firstSeenAt?: number; // ms — when this match first appeared in live feed
  _htStartedAt?: number; // ms — when status first became "HT" (resets on 2H kick-off)
  _lastSeenAt?: number; // ms — last time this match was observed in provider feed
  _missingSinceAt?: number; // ms — when this match first disappeared from provider feed
  // Sport-specific live display data
  _liveExtra?: {
    clockStr?: string; // basketball/hockey: "06:44"
    kickoffSec?: number;
    clockSec?: number;
    clockAtMs?: number;
    clockRunning?: boolean;
    sets?: Array<[number, number]>; // tennis: [[6,3],[4,2]] last entry is in-progress
    currentPoints?: [number | string, number | string]; // tennis: [30, 15] or ["D","D"] or ["AD",40]
    serving?: [boolean, boolean];
    // Real (non-modeled) PulseScore extra markets for this tick — cheap to
    // compute (see extractTennisLiveExtra's own comment), stashed here so
    // GET /live-match/:id can overlay real bookmaker odds on top of
    // computeLiveTennisExtras's synthetic model wherever real data exists.
    realExtra?: PulseScoreTennisLiveExtra;
    currentPts?: [number, number]; // volleyball: current set points [18, 16]
    vollSets?: Array<[number, number]>; // volleyball: completed set scores [[25,18],[22,25]]
    tennisStats?: [TennisStatData, TennisStatData]; // home / away match stats
    periods?: Array<[number, number]>; // hockey: [[P1h,P1a],[P2h,P2a],[P3h,P3a],[OTh,OTa]]
    quarters?: Array<[number, number]>; // basketball: [[Q1h,Q1a],[Q2h,Q2a],[Q3h,Q3a],[Q4h,Q4a],[OTh,OTa]]
    basketballScoringEvents?: Array<{
      seq: number;
      team: "home" | "away";
      points: number;
      isThree: boolean;
    }>;
    innings?: Array<[number, number]>; // baseball: [[I1h,I1a],[I2h,I2a],...,[I9h,I9a]]
    outs?: number; // baseball: current outs (0-2)
    homeHits?: number; // baseball: home team hits
    awayHits?: number; // baseball: away team hits
    homeErrors?: number; // baseball: home team errors
    awayErrors?: number; // baseball: away team errors
    // Football extras from Statpal v2
    htScore?: [number, number]; // football: half-time score [homeHT, awayHT]
    etScore?: [number, number]; // football: extra-time score [homeET, awayET]
    etBaseScore?: [number, number]; // football: cumulative score at start of ET (to compute ET-only goals)
    et2BaseScore?: [number, number]; // football: cumulative score at start of ET's 2nd half
    et1FinalGoals?: [number, number]; // football: ET 1st-half goals (live during 1st half, frozen after)
    etHalf?: 1 | 2; // football: which ET half we're currently in, when the feed distinguishes them
    etKickoffSec?: number; // football: wall-clock time ET started (minute is frozen during ET, see buildFootballLiveV2)
    et2KickoffSec?: number; // football: wall-clock time ET's 2nd half started
    etBaseCorners?: number; // football: match-wide corner count at start of ET (to compute ET-only corners)
    etBaseCards?: number; // football: match-wide card count at start of ET (to compute ET-only cards)
    penScore?: [number, number]; // football: penalty shootout [homePen, awayPen]
    penBaseScore?: [number, number]; // football: score at start of penalty phase (to compute pen goals)
    secondHalfKickoffSec?: number;
    // Live stats — polled from /match/{id}/statistics (background, ~90s TTL)
    cornersTotal?: number; // football: total corners in match so far
    cardsTotal?: number; // football: total cards (yellow+red) in match so far
    // Per-team football stats
    cornersHome?: number;
    cornersAway?: number;
    possessionHome?: number;
    possessionAway?: number;
    shotsTotalHome?: number;
    shotsTotalAway?: number;
    shotsOnTargetHome?: number;
    shotsOnTargetAway?: number;
    shotsOffTargetHome?: number;
    shotsOffTargetAway?: number;
    shotsBlockedHome?: number;
    shotsBlockedAway?: number;
    woodworkHome?: number;
    woodworkAway?: number;
    foulsHome?: number;
    foulsAway?: number;
    yellowCardsHome?: number;
    yellowCardsAway?: number;
    redCardsHomeCount?: number;
    redCardsAwayCount?: number;
    offsidesHome?: number;
    offsidesAway?: number;
    savesHome?: number;
    savesAway?: number;
    dangerousAttacksHome?: number;
    dangerousAttacksAway?: number;
    attacksHome?: number;
    attacksAway?: number;
    xgHome?: number;
    xgAway?: number;
    throwInsHome?: number;
    throwInsAway?: number;
    crossesHome?: number;
    crossesAway?: number;
    passesHome?: number;
    passesAway?: number;
    passAccuracyHome?: number;
    passAccuracyAway?: number;
    // Football goal minute tracking (scored across refreshes)
    homeGoalMinutes?: number[]; // minutes when home team scored
    awayGoalMinutes?: number[]; // minutes when away team scored
  };
  /** Formula 1 only — race winner + podium odds per driver */
  f1Extra?: F1ExtraData;
  /** MMA only — real markets beyond the moneyline (odds.home/away) */
  mmaExtra?: MmaExtraData;
};

export type F1DriverOdd = { name: string; shortName: string; team: string; pos: number; odd: number };
export type F1ExtraData = {
  raceWinner: F1DriverOdd[];
  podium: F1DriverOdd[];
};
export type MmaExtraData = {
  toDistance?: { yes: number; no: number };
  totalRoundsLines?: Array<{ line: number; over: number; under: number }>;
  // Real onexbet data (extractMmaOverride in services/pulsescore/mma.ts) —
  // see that file's header for the confirmed market shapes.
  winInsideDistance?: { yes: number; no: number };
  methodOfVictory?: {
    homeDecision?: { yes: number; no: number };
    homeInside?: { yes: number; no: number };
    awayDecision?: { yes: number; no: number };
    awayInside?: { yes: number; no: number };
    draw?: number;
  };
};

export type UpcomingMatch = {
  id: string;
  home: string;
  away: string;
  league: string;
  country: string;
  time: string;
  date: string;
  sport: string;
  hasRealOdds: boolean;
  odds: { home: number; draw: number; away: number };
  markets: AdvancedMarkets;
  leagueId?: string;
  isWomens?: boolean;
  /** Football only — true when the league is in the curated priority allowlist
   * (footballLeagueAllowedStrict). Drives the default "today + big leagues up
   * to 7 days ahead" vs "?range=month" widening in GET /upcoming. */
  isPriorityLeague?: boolean;
  providerStatusGroup?: number;
  providerStatusText?: string;
  providerWinnerKnown?: boolean;
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  minute?: string | number;
  status?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeImageVersion?: string;
  awayImageVersion?: string;
  // Direct crest URLs from API-Football (football only) — see the same
  // field on LiveMatchState for why this is preferred over homeTeamId/
  // homeImageVersion in getTeamBadgeAsset.
  homeLogoUrl?: string;
  awayLogoUrl?: string;
  /** Formula 1 only — race winner + podium odds per driver */
  f1Extra?: F1ExtraData;
  /** MMA only — real markets beyond the moneyline (odds.home/away) */
  mmaExtra?: MmaExtraData;
};

type SAPIMatchEvent = {
  id?: string;
  type: string;
  team: string;
  minute: string;
  extra_min: string;
  player: string;
  player_id: string;
  assist_player?: string;
  assist_id?: string;
  result?: string; // score at time of event e.g. "[1 - 0]"
};

type SAPIPenaltyEvent = {
  id: string;
  penalty_num: string;
  team: string;
  player: string;
  player_id: string;
  type: string; // "goal" | "miss"
  result: string;
};

type SAPIMatchV2 = {
  main_id: string;
  fallback_id_1: string;
  fallback_id_2: string;
  fallback_id_3: string;
  status: string;
  date: string;
  time: string;
  inj_time: string;
  inj_minute: string;
  venue?: string;
  home: { id: string; name: string; goals: string; win_on_agg?: string };
  away: { id: string; name: string; goals: string; win_on_agg?: string };
  events: null | {
    event: SAPIMatchEvent | SAPIMatchEvent[];
  };
  ht?: { home_goals: number; away_goals: number };
  ft?: { home_goals: number; away_goals: number };
  et?: null | { home_goals: number; away_goals: number };
  penalties?: null | {
    home_pen: number;
    away_pen: number;
    penalty_events: SAPIPenaltyEvent | SAPIPenaltyEvent[];
  };
  has_live_stats?: string; // "True" | "False"
  inplay_odds_running: string;
};

type SAPILeagueV2 = {
  id: string;
  name: string;
  country: string;
  cup: string;
  match: SAPIMatchV2 | SAPIMatchV2[];
};

type StatpalLeagueFeedEnvelope = {
  updated?: string;
  updated_ts?: number;
  league?: SAPILeagueV2 | SAPILeagueV2[];
};

/**
 * Extracts the goal count from a raw team object returned by any Statpal
 * football endpoint.  Different endpoints/subscriptions use different field
 * names for the same datum, so we try all known variants in priority order:
 *
 *   goals       — standard SportsAPI Pro / Statpal v2 field
 *   score       — alternate English name used by some Statpal plans
 *   pontuação   — Portuguese (with accent, UTF-8)
 *   pontuacao   — Portuguese (without accent, ASCII-safe)
 *   gols        — Portuguese word for "goals"
 *   goal        — singular variant
 *
 * If none are found the match-level `placar` / `score` / `resultado` string
 * ("2:1") is split and the correct half is returned.
 */
function extractStatpalTeamGoals(
  team: Record<string, unknown>,
  matchRaw: Record<string, unknown>,
  side: "home" | "away",
): string {
  const direct =
    team["goals"] ??
    team["score"] ??
    team["pontuação"] ??
    team["pontuacao"] ??
    team["gols"] ??
    team["goal"];
  if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
    return String(direct);
  }
  // Fall back to a match-level "placar"/"score" string like "2:1"
  const placar = String(
    matchRaw["placar"] ?? matchRaw["score"] ?? matchRaw["resultado"] ?? "",
  );
  if (placar && /\d/.test(placar)) {
    const sep = placar.includes(":") ? ":" : placar.includes("-") ? "-" : null;
    if (sep) {
      const parts = placar.split(sep);
      return side === "home"
        ? (parts[0]?.trim() ?? "0")
        : (parts[1]?.trim() ?? "0");
    }
  }
  return "0";
}

function normalizeStatpalMatch(raw: Partial<SAPIMatchV2>): SAPIMatchV2 {
  const rawMap = raw as Record<string, unknown>;
  const home =
    raw.home && typeof raw.home === "object"
      ? (raw.home as Record<string, unknown>)
      : ({ id: "", name: "Unknown", goals: "0" } as Record<string, unknown>);
  const away =
    raw.away && typeof raw.away === "object"
      ? (raw.away as Record<string, unknown>)
      : ({ id: "", name: "Unknown", goals: "0" } as Record<string, unknown>);

  const homeGoals = extractStatpalTeamGoals(home, rawMap, "home");
  const awayGoals = extractStatpalTeamGoals(away, rawMap, "away");

  return {
    main_id: String(raw.main_id ?? ""),
    fallback_id_1: String(raw.fallback_id_1 ?? ""),
    fallback_id_2: String(raw.fallback_id_2 ?? ""),
    fallback_id_3: String(raw.fallback_id_3 ?? ""),
    status: String(raw.status ?? ""),
    date: String(raw.date ?? ""),
    time: String(raw.time ?? ""),
    inj_time: String(raw.inj_time ?? ""),
    inj_minute: String(raw.inj_minute ?? ""),
    venue: raw.venue,
    home: {
      id: String(home["id"] ?? ""),
      name: String(home["name"] ?? "Unknown"),
      goals: homeGoals,
      win_on_agg: home["win_on_agg"] as string | undefined,
    },
    away: {
      id: String(away["id"] ?? ""),
      name: String(away["name"] ?? "Unknown"),
      goals: awayGoals,
      win_on_agg: away["win_on_agg"] as string | undefined,
    },
    events: raw.events ?? null,
    ht: raw.ht,
    ft: raw.ft,
    et: raw.et ?? null,
    penalties: raw.penalties ?? null,
    has_live_stats: raw.has_live_stats,
    inplay_odds_running: String(raw.inplay_odds_running ?? "False"),
  };
}

function normalizeStatpalLeagues(
  leaguesRaw: SAPILeagueV2 | SAPILeagueV2[] | null | undefined,
): SAPILeagueV2[] {
  return statpalList(leaguesRaw)
    .filter((league): league is SAPILeagueV2 => !!league)
    .map((league) => ({
      id: String(league.id ?? ""),
      name: String(league.name ?? ""),
      country: String(league.country ?? ""),
      cup: String(league.cup ?? "False"),
      match: statpalList(league.match).map((match) =>
        normalizeStatpalMatch(match),
      ),
    }));
}

function extractStatpalLeagueFeed(
  raw: Record<string, unknown>,
  preferredRoot?: string,
): { leagues: SAPILeagueV2[]; updatedTs: number } {
  const isLeagueFeedEnvelope = (v: unknown): v is StatpalLeagueFeedEnvelope =>
    !!v && typeof v === "object" && !Array.isArray(v);

  // 1. Try the preferred root key (e.g. "live_matches")
  const preferred =
    preferredRoot && isLeagueFeedEnvelope(raw[preferredRoot])
      ? (raw[preferredRoot] as StatpalLeagueFeedEnvelope)
      : undefined;

  // 2. Fallback: scan all top-level keys for a league-feed envelope.
  //    Previously this only matched /^matches_/i — widened to also catch
  //    keys like "live_matches", "matches", "livescores", etc. so that a
  //    Statpal response-shape change doesn't silently return zero leagues.
  const dynamic = preferred
    ? undefined
    : (Object.entries(raw).find(
        ([key, value]) =>
          (/^matches_/i.test(key) ||
            /^live_/i.test(key) ||
            key === "matches" ||
            key === "livescores") &&
          isLeagueFeedEnvelope(value),
      )?.[1] as StatpalLeagueFeedEnvelope | undefined);

  const payload = preferred ?? dynamic;
  return {
    leagues: normalizeStatpalLeagues(payload?.league),
    updatedTs:
      typeof payload?.updated_ts === "number" && Number.isFinite(payload.updated_ts)
        ? payload.updated_ts
        : 0,
  };
}

async function fetchStatpalFootballDailyLeagues(): Promise<SAPILeagueV2[]> {
  if (!CONFIG.STATPAL_API_KEY) throw new Error("STATPAL_API_KEY is not configured");

  const mergeLeagues = (target: Map<string, SAPILeagueV2>, incoming: SAPILeagueV2[]) => {
    for (const league of incoming) {
      const key = `${league.id}|${league.country}|${league.name}`;
      const existing = target.get(key);
      const incomingMatches = statpalList(league.match);
      if (!existing) {
        target.set(key, { ...league, match: incomingMatches });
        continue;
      }
      const seenIds = new Set(statpalList(existing.match).map((match) => match.main_id));
      const mergedMatches = [...statpalList(existing.match)];
      for (const match of incomingMatches) {
        if (seenIds.has(match.main_id)) continue;
        seenIds.add(match.main_id);
        mergedMatches.push(match);
      }
      target.set(key, { ...existing, match: mergedMatches });
    }
  };

  const merged = new Map<string, SAPILeagueV2>();
  for (const offset of [0, -1]) {
    try {
      const resp = await fetch(
        buildStatpalUrl("/v2/soccer/matches/daily", { offset }),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (!resp.ok) continue;
      const raw = (await resp.json()) as Record<string, unknown>;
      mergeLeagues(merged, extractStatpalLeagueFeed(raw).leagues);
    } catch {}
  }

  return Array.from(merged.values());
}

async function fetchSportsApiFootballDailyLeagues(): Promise<SAPILeagueV2[]> {
  if (!CONFIG.SPORTSAPI_KEY) throw new Error("SPORTSAPI_KEY is not configured");

  const resp = await fetch(
    `${SAPI_V2_FOOTBALL}/v2/soccer/matches/daily?offset=-1`,
    {
      signal: AbortSignal.timeout(8_000),
      headers: sapiHeaders(),
    },
  );
  if (!resp.ok) throw new Error(`SportsApiPro daily HTTP ${resp.status}`);

  const raw = (await resp.json()) as Record<string, unknown>;
  return extractStatpalLeagueFeed(raw).leagues;
}

// v1 odds types
// Root double-wrapper: response is { example: { odds_feed: {...} } } OR { odds_feed: {...} }
// getOddsMap() already handles both via: raw?.example?.odds_feed ?? raw?.odds_feed
type OddsOdd = { name: string; value: string };
type OddsTotal = {
  name: string;
  stop?: string;
  ismain?: string;
  odd: OddsOdd | OddsOdd[];
};
type OddsHandicap = {
  name: string;
  stop?: string;
  ismain?: string;
  odd: OddsOdd | OddsOdd[];
};
type OddsBookmaker = {
  id: string;
  name: string;
  stop?: string;
  ts?: string;
  odd?: OddsOdd | OddsOdd[]; // 1x2, Correct Score, BTTS, Double Chance
  total?: OddsTotal | OddsTotal[]; // Over/Under lines
  handicap?: OddsHandicap | OddsHandicap[]; // Asian Handicap lines (was unknown[])
};
type OddsType = {
  name: string;
  stop?: string;
  bookmaker: OddsBookmaker | OddsBookmaker[];
};
type OddsMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2?: string;
  static_id?: string;
  date?: string;
  time?: string;
  status: string;
  venue?: string;
  home: { id: string; name: string; alternate_id?: string };
  away: { id: string; name: string; alternate_id?: string };
  odds?: { type: OddsType | OddsType[] };
};
type OddsLeague = {
  id: string;
  gid?: string;
  name: string;
  country: string;
  sub_id?: string;
  match: OddsMatch | OddsMatch[];
};

// ─── Priority leagues ─────────────────────────────────────────────────────────
// ORDERING RULE: more-specific patterns MUST come before less-specific ones
// within the same country (e.g. "laliga2" before "laliga", "2. bundesliga"
// before "bundesliga") because matching uses String.includes().

// International tournaments shown regardless of country
const INTL_TOURNAMENTS = [
  "champions league",
  "europa league",
  "conference league",
  "uefa super cup",
  "uefa european championship",
  "european championship",
  "nations league",
  "fifa world cup",
  "copa libertadores",
  "copa sudamericana",
  "concacaf gold cup",
  "gold cup",
  "africa cup of nations",
  "african cup of nations",
  "afc asian cup",
  "asian cup",
  "copa america",
  "world cup",
  "international friendly",
  "international friendlies",
  "amistosos internacionais",
  "club friendly",
  "amistoso de clubes",
  "amistosos de clubes",
  "club friendlies",
  "leagues cup",
];

// Bug report 2026-08-13: no Europa League matches showing at all during a
// real qualifying-round window. This gate gets bypassed-around (see its
// call sites: any league name it returns false for falls through to the
// per-country allowlist, which has no entries for the small nations that
// populate early qualifying rounds \u2014 Kazakhstan, Andorra, Gibraltar, San
// Marino, Faroe Islands, etc. \u2014 so a false negative here silently drops
// the match instead of just mis-sorting it). Previously only checked the
// text BEFORE the first " - ", on the assumption the round/stage
// descriptor is always a SUFFIX ("Europa League - Qualifying Round 3").
// The only confirmed real bwin sample for this competition (apiFootball.ts)
// predates this season's qualifiers, so that assumption is unverified for
// the actual round-naming bwin uses right now \u2014 and if it's ever reversed
// for some competition/provider combination ("Qualifying Round 3 - Europa
// League"), the old code would silently misclassify it as domestic. INTL_
// TOURNAMENTS entries are specific multi-word competition names, not
// generic words, so checking the whole string instead of just one half of
// it is safe: there's no real risk of a domestic league's name spuriously
// containing "europa league" or "champions league" as a substring.
function isIntlTournamentName(leagueName: string): boolean {
  const full = String(leagueName ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!full) return false;
  return INTL_TOURNAMENTS.some((p) => full.includes(p));
}

// DOMESTIC_PRIORITY: [pattern, priority]
// priority < 100 → shown; ≥ 100 → filtered out
//
// Bands mirror how the big sportsbooks (Bet365, Betano, Pinnacle…) tier
// competitions — a lower number here always means higher priority (shown
// first, sorted first, longer live-disappear grace via
// isCatalogPriorityLeague). International tournaments (Champions League,
// World Cup, ...) are ranked separately by list position in INTL_TOURNAMENTS
// above and always outrank every domestic entry below.
//
//   Tier 1  ( 1– 9): the handful of leagues with the highest betting volume/liquidity
//   Tier 2  (10–19): strong secondary leagues — still heavily bet on
//   Tier 3  (20–39): domestic 2nd divisions of Tier 1/2 countries + solid 1st divisions elsewhere
//   Cups    (40–59): domestic cups & super cups (all countries) — own band for
//                     display-order purposes, but footballMarketTier() below
//                     maps this band to market Tier 4 (minimal market set /
//                     lowest stake headroom), same as prio ≥60.
//   Tier 4  (60–98): remaining 1st divisions, smaller confederations, minor 2nd divisions
//   999: filtered out entirely (youth/women/reserve/amateur, or a specific
//        league excluded on purpose — see the block below)
const DOMESTIC_PRIORITY: Array<[string, number]> = [
  // ── TIER 1 — highest volume/liquidity ──────────────────────────────────────
  // ⚠ More-specific patterns FIRST within each country — see ordering rules above
  ["england: premier league", 1],
  ["spain: laliga2", 31], // ⚠ BEFORE "laliga" ("laliga2" ⊃ "laliga")
  ["spain: laliga", 2],
  ["germany: 3. liga", 999], // ⚠ BEFORE "bundesliga"
  ["germany: 2. bundesliga", 32], // ⚠ BEFORE "bundesliga"
  ["germany: bundesliga", 3],
  ["italy: serie a", 4],
  ["france: ligue 1", 5],
  ["brazil: série b", 35], // ⚠ BEFORE "brasileiro" catch-all
  ["brazil: serie b", 35],
  ["brazil: brasileirão série b", 35],
  ["brazil: brasileirao serie b", 35],
  ["brazil: betano - série b", 35], // Statpal with Betano sponsor
  ["brazil: betano - serie b", 35],
  ["brazil: série a", 6],
  ["brazil: serie a", 6],
  ["brazil: brasileirão série a", 6],
  ["brazil: brasileirao serie a", 6],
  ["brazil: betano - série a", 6], // Statpal with Betano sponsor
  ["brazil: betano - serie a", 6],
  ["brazil: betano", 6], // fallback for any "brazil: betano …" variant
  ["brazil: brasileiro", 6], // catch-all for other Brasileirão variants
  ["argentina: liga profesional", 7],
  ["argentina: primera división", 7],
  ["argentina: primera division", 7],
  ["portugal: liga portugal 2", 50], // ⚠ BEFORE "liga portugal" ("liga portugal 2" ⊃ "liga portugal")
  ["portugal: segunda liga", 50],
  ["portugal: liga portugal", 8], // promoted to Tier 1 per BET62 tiering
  ["portugal: primeira liga", 8],
  ["portugal: liga bwin", 8],

  // ── TIER 2 — strong secondary leagues ──────────────────────────────────────
  ["netherlands: eredivisie", 10],
  ["belgium: pro league", 11],
  ["belgium: jupiler", 11],
  ["usa: mls", 12],
  ["usa: major league soccer", 12],
  ["mexico: liga mx", 13],
  ["saudi arabia: saudi pro league", 14],
  ["saudi arabia: pro league", 14],

  // ── TIER 3 — 2nd divisions of Tier 1/2 countries + other strong 1st divisions ──
  ["england: championship", 20],
  ["italy: serie b", 21],
  ["france: ligue 2", 22],
  ["argentina: primera nacional", 23],
  ["turkey: süper lig", 24],
  ["turkey: super lig", 24],
  ["japan: j1 league", 25],
  ["japan: j.league", 25],
  ["south korea: k league 1", 26],
  ["korea: k league 1", 26],
  ["sweden: allsvenskan", 27],
  ["norway: eliteserien", 28],
  ["australia: a league", 29],
  ["australia: a-league", 29],
  ["australia: isuzu ute a league", 29],
  // Spain's "segunda división", Germany's "2. bundesliga" and Brazil's
  // "série b" (all priority 31/32/35) are declared up in the Tier 1 block
  // above — they must precede their parent-league patterns for .includes().
  ["spain: segunda division", 31],

  // ── CUPS & SUPER CUPS (all countries) ──────────────────────────────────────
  ["england: fa cup", 40],
  ["england: carabao cup", 41],
  ["england: efl cup", 41],
  ["england: league cup", 41],
  ["england: community shield", 42],
  ["spain: copa del rey", 43],
  ["spain: supercopa", 44],
  ["germany: dfb-pokal", 45],
  ["germany: dfb pokal", 45],
  ["germany: supercup", 46],
  ["italy: coppa italia", 47],
  ["italy: supercoppa", 48],
  ["france: coupe de france", 49],
  ["france: trophée des champions", 50],
  ["france: trophee des champions", 50],
  ["brazil: copa do brasil", 51],
  ["brazil: supercopa", 52],
  ["brazil: paulist", 53], // Paulistão / Paulista
  ["brazil: carioca", 54],
  ["brazil: mineiro", 55],
  ["brazil: gaúcho", 56],
  ["brazil: gaucho", 56],
  ["argentina: copa argentina", 57],
  ["argentina: supercopa", 58],
  ["portugal: taça de portugal", 59],
  ["portugal: taca de portugal", 59],

  // ── TIER 4 — remaining 1st divisions, smaller confederations, minor 2nd divisions ──
  ["portugal: supertaça", 60],
  ["portugal: supertaca", 60],
  ["netherlands: eerste divisie", 61],
  ["netherlands: keuken", 61],
  ["netherlands: knvb", 62],
  ["netherlands: johan cruyff", 63],
  ["netherlands: super cup", 63],
  ["belgium: challenger", 64],
  ["belgium: belgian cup", 64],
  ["belgium: super cup", 65],
  ["turkey: 1. lig", 66],
  ["turkey: tff 1. lig", 66],
  ["turkey: turkish cup", 67],
  ["turkey: türkiye kupası", 67],
  ["turkey: super cup", 68],
  ["mexico: liga de expansión", 69],
  ["mexico: liga de expansion", 69],
  ["mexico: ascenso", 69],
  ["mexico: copa mx", 70],
  ["mexico: campeón de campeones", 71],
  ["mexico: campeon de campeones", 71],
  ["usa: usl championship", 72],
  ["usa: u.s. open cup", 73],
  ["usa: us open cup", 73],
  ["usa: open cup", 73],
  ["japan: j2 league", 74],
  ["japan: emperor", 75], // Emperor's Cup
  ["japan: super cup", 76],
  ["south korea: k league 2", 77],
  ["korea: k league 2", 77],
  ["south korea: korean fa cup", 78],
  ["south korea: fa cup", 78],
  ["korea: korean fa cup", 78],
  ["korea: fa cup", 78],
  ["croatia: hnl", 80],
  ["croatia: supersport", 80],
  ["serbia: superliga", 81],
  ["denmark: superliga", 82],
  ["chile: primera división", 83],
  ["chile: primera division", 83],
  ["colombia: categoría primera a", 84],
  ["colombia: categoria primera a", 84],
  ["colombia: primera a", 84],
  ["colombia: categoría primera b", 96], // 2nd division
  ["colombia: categoria primera b", 96],
  ["colombia: primera b", 96],
  ["ecuador: liga pro", 85],
  ["ecuador: liga betcris", 85],
  ["ecuador: segunda categoría", 999], // 2nd div — skip
  ["ecuador: segunda categoria", 999],
  ["ecuador: copa", 86],
  ["bolivia: división de honor", 93],
  ["bolivia: division de honor", 93],
  ["bolivia: división profesional", 93],
  ["bolivia: division profesional", 93],
  ["bolivia: liga boliviana", 93],
  ["peru: liga 1", 87],
  ["peru: primera liga", 87],
  ["peru: apertura", 87],
  ["peru: copa", 92],
  ["uruguay: primera división", 88],
  ["uruguay: primera division", 88],
  ["uruguay: serie a", 88],
  ["uruguay: apertura", 88],
  ["uruguay: copa", 93],
  ["paraguay: primera división", 89],
  ["paraguay: primera division", 89],
  ["paraguay: apertura", 89],
  ["venezuela: liga futve", 95],
  ["venezuela: primera división", 95],
  ["venezuela: primera division", 95],
  ["venezuela: apertura", 95],
  ["thailand: thai league 1", 90],
  ["thailand: thai league", 90],
  ["india: indian super league", 91],
  ["india: isl", 91],
  ["scotland: premiership", 92],
  ["scotland: championship", 97],
  ["russia: premier league", 93],
  ["ukraine: premier league", 94],
  ["greece: super league", 95],
  ["austria: bundesliga", 96], // ⚠ before generic "bundesliga" — safe (prefixed by "austria:")
  ["switzerland: super league", 96],
  ["poland: ekstraklasa", 97],
  ["romania: superliga", 97],
  // Newly added per BET62 tiering request — patterns are best-effort guesses
  // at Statpal's exact league-name strings and have not been verified against
  // live data yet; report back if any of these still don't show up.
  ["hungary: nb i", 96],
  ["hungary: nemzeti bajnoksag i", 96],
  ["hungary: otp bank liga", 96],
  ["bulgaria: first league", 96],
  ["bulgaria: parva liga", 96],
  ["bulgaria: efbet liga", 96],
  ["slovakia: super liga", 97],
  ["slovakia: nike liga", 97],
  ["slovenia: prvaliga", 97],
  ["slovenia: prva liga", 97],
  ["egypt: premier league", 92],
  ["egypt: egyptian premier league", 92],
  ["morocco: botola", 93],
  ["south africa: premiership", 92],
  ["south africa: dstv premiership", 92],
  ["south africa: psl", 92],
  ["tunisia: ligue professionnelle 1", 94],
  ["tunisia: ligue 1", 94],
  ["uae: pro league", 93],
  ["uae: arabian gulf league", 93],
  ["uae: adnoc pro league", 93],
  ["qatar: stars league", 93],
  ["qatar: qsl", 93],

  // ── Block lower divisions / amateur / regional ─────────────────────────────
  ["spain: primera rfef", 999],
  ["spain: segunda rfef", 999],
  ["spain: tercera rfef", 999],
  ["spain: rfef", 999],
  ["england: league one", 999],
  ["england: league two", 999],
  ["england: national league", 999],
  ["italy: serie c", 999],
  ["italy: serie d", 999],
  ["france: national", 999],
  ["germany: bundesliga women", 999],
  // China's top flight stays blocked as before — this was a deliberate
  // earlier exclusion, not an oversight; ask before adding it to the tiers.
  ["china: super league", 999],
  ["china: chinese super league", 999],
  ["indonesia: liga 1", 999],
  ["indonesia: bri liga 1", 999],
];

// ─── Minor 2nd/3rd-division suppression (Pré-Jogos only) ──────────────────────
// Bug report 2026-08-15: too many small Division B/C matches cluttering
// "Pré-Jogos". Deliberately NARROW — only the genuinely minor lower
// divisions below (low betting interest, buried in Tier 4 alongside
// smaller countries' legitimate top flights) get suppressed, and only on
// a day that already has real coverage from a bigger competition. The
// well-followed 2nd divisions that live in Tier 3 (Championship, Serie B,
// Ligue 2, LaLiga2, 2. Bundesliga, Série B) are explicitly EXCLUDED from
// this list — confirmed with the user (2026-08-15) they want those always
// visible, which matches the very fix that landed the day before for
// 2. Bundesliga specifically (fetchFootballLive pagination). Smaller
// countries' TOP-flight leagues (Uruguay, Croatia, Ecuador, ...) are also
// excluded on purpose — confirmed with the user they shouldn't be treated
// the same as an actual 2nd/3rd division just because they share Tier 4's
// numeric priority band for display-order purposes.
const MINOR_LOWER_DIVISION_PATTERNS: string[] = [
  "netherlands: eerste divisie",
  "netherlands: keuken",
  "belgium: challenger",
  "turkey: 1. lig", // TFF 1. Lig — Turkey's 2nd tier despite the "1" in the name
  "turkey: tff 1. lig",
  "mexico: liga de expansion",
  "mexico: ascenso",
  "japan: j2 league",
  "south korea: k league 2",
  "korea: k league 2",
  "colombia: categoria primera b",
  "colombia: primera b",
  "scotland: championship",
];

function isMinorLowerDivisionLeague(
  countryKey: string | null | undefined,
  leagueDisplayName: string,
): boolean {
  const key = `${countryKey ?? ""}: ${leagueDisplayName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const mainPart = key.split(" - ")[0];
  return MINOR_LOWER_DIVISION_PATTERNS.some((p) => mainPart.includes(p));
}

// Below this priority, a match counts as "real coverage" for a day — big
// domestic top flights, well-followed 2nd divisions (Tier ≤3) and cups
// (40-59) all count; only Tier 4 (≥60, where the minor lower divisions
// above live) does not. Kept as its own named constant rather than
// inlining 60 at each call site since it's the exact boundary
// isMinorLowerDivisionLeague's suppression logic is built around.
const BIG_LEAGUE_DAY_PRIORITY_THRESHOLD = 60;

// League name → country, derived from DOMESTIC_PRIORITY rather than
// hand-maintained separately (would drift out of sync otherwise). Needed
// for any fixture source whose schema doesn't carry a country field of its
// own — PulseScore's normalized event schema is exactly that case: it only
// has a flat `league` string, no country, while our whole catalog (league
// priority, blocking, market tier) is keyed by "country: league".
//
// Only leagues whose bare name (country prefix stripped) is unambiguous
// across the whole table are included — if the same bare name is paired
// with more than one country (e.g. a generic "super league" used by
// several countries), it's deliberately left out rather than guessing one
// country at random and mis-tagging it some of the time.
const LEAGUE_NAME_TO_COUNTRY: Map<string, string> = (() => {
  const byLeague = new Map<string, Set<string>>();
  for (const [key] of DOMESTIC_PRIORITY) {
    const idx = key.indexOf(": ");
    if (idx < 0) continue;
    const country = key.slice(0, idx);
    const league = key.slice(idx + 2);
    if (!byLeague.has(league)) byLeague.set(league, new Set());
    byLeague.get(league)!.add(country);
  }
  const out = new Map<string, string>();
  for (const [league, countries] of byLeague) {
    if (countries.size === 1) out.set(league, [...countries][0]!);
  }
  return out;
})();

// PulseScore's /live-events league string embeds the country name as a
// plain word prefix with NO delimiter — confirmed against real samples
// (2026-08-08): "USA MLS", "Dominica Premier League", "El Salvador
// Apertura", "Peru Liga 1", "Guatemala Liga Nacional", "Paraguay Women
// League". This is a different shape from the "Country||League" pipe
// format documented for the separate /leagues (prematch catalog) endpoint.
// countryForLeagueName's plain bare-name lookup below (LEAGUE_NAME_TO_COUNTRY,
// expects NO country word at all) only ever matched PulseScore's live
// league strings by pure coincidence — confirmed in production (2026-08-08):
// only 1 of dozens of real live matches was making it onto the site,
// because every other league's country came back null and got silently
// hidden as "unknown" by buildFootballLiveFromPulseScore.
//
// Only lists countries this site actually shows (LIVE_FOOTBALL_COUNTRY_ALLOW)
// — no point guessing a label for a country that would be filtered out even
// if correctly identified. These labels are this codebase's own English
// country names / common bet365 conventions, confirmed against PulseScore
// for "usa" only (the real "USA MLS" sample); the rest are unverified best
// guesses. A wrong guess here is harmless — it just leaves that country
// filtered out exactly as it does today, never a false positive, since the
// resolved key still has to pass LIVE_FOOTBALL_COUNTRY_ALLOW AND the full
// original league string (country word included) still has to match a real
// DOMESTIC_PRIORITY pattern afterwards.
const PULSESCORE_COUNTRY_PREFIXES = [
  ["south korea", "south korea"],
  ["korea republic", "south korea"],
  ["saudi arabia", "saudi arabia"],
  ["south africa", "south africa"],
  ["czech republic", "czechia"],
  ["czechia", "czechia"],
  ["united arab emirates", "uae"],
  ["united states", "usa"],
  ["usa", "usa"], // confirmed real: "USA MLS"
  ["england", "england"],
  ["spain", "spain"],
  ["germany", "germany"],
  ["italy", "italy"],
  ["france", "france"],
  ["portugal", "portugal"],
  ["netherlands", "netherlands"],
  ["belgium", "belgium"],
  ["turkey", "turkey"],
  ["greece", "greece"],
  ["austria", "austria"],
  ["scotland", "scotland"],
  ["switzerland", "switzerland"],
  ["denmark", "denmark"],
  ["norway", "norway"],
  ["sweden", "sweden"],
  ["croatia", "croatia"],
  ["serbia", "serbia"],
  ["poland", "poland"],
  ["russia", "russia"],
  ["ukraine", "ukraine"],
  ["hungary", "hungary"],
  ["romania", "romania"],
  ["bulgaria", "bulgaria"],
  ["israel", "israel"],
  ["brazil", "brazil"],
  ["argentina", "argentina"],
  ["mexico", "mexico"],
  ["chile", "chile"],
  ["colombia", "colombia"],
  ["japan", "japan"],
  ["thailand", "thailand"],
  ["india", "india"],
  ["australia", "australia"],
  ["slovakia", "slovakia"],
  ["slovenia", "slovenia"],
  ["egypt", "egypt"],
  ["morocco", "morocco"],
  ["tunisia", "tunisia"],
  ["qatar", "qatar"],
] as Array<[string, string]>;
// Longest label first — e.g. "south korea" must be tried before any
// single-word country that could otherwise falsely prefix-match its first
// word alone.
PULSESCORE_COUNTRY_PREFIXES.sort((a, b) => b[0].length - a[0].length);

/** Best-effort country lookup for a league name. Tries stripping a known
 * country name off the front first (PulseScore's actual live-event format —
 * see PULSESCORE_COUNTRY_PREFIXES above), then falls back to an exact
 * bare-name match (no country prefix at all), e.g. "premier league" →
 * "england" — kept for any league that genuinely has no country word
 * attached. Returns null when neither matches — callers should treat null
 * as "unknown", never guess. */
export function countryForLeagueName(leagueName: string): string | null {
  const lower = leagueName.trim().toLowerCase();
  for (const [prefix, country] of PULSESCORE_COUNTRY_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix} `)) return country;
  }
  return LEAGUE_NAME_TO_COUNTRY.get(lower) ?? null;
}

// Bug report 2026-08-12 (recurring — home.tsx's getLeagueLogo already
// carries a 2026-08-09 fix comment for half of this same problem): bwin
// sometimes reports Brazil's top flight as bare "Serie A"/"Série A" with
// no qualifying word at all — textually identical to Italy's league name,
// distinguished only by the separate country field bwin also sends.
// Confirmed real: DOMESTIC_PRIORITY below already needs explicit
// "brazil: serie a"/"brazil: série a" entries alongside the expected
// "brazil: brasileirão série a" ones, which wouldn't be necessary if bwin
// never actually sent the bare form. The frontend's league icon/label
// lookups (getLeagueLogo/leaguePt, home.tsx) work from this league string
// ALONE, with no country parameter — so a bare "Serie A" reaching them
// for a Brazilian match renders Italy's crest and Italy's name, no matter
// how correct `country` is elsewhere on the same match object.
// Disambiguated once, here, using the country already resolved for this
// event — cheaper and more robust than teaching every frontend league
// lookup about country too. Scoped to the display value only: the raw
// `ev.league` string is still used unchanged for priority/tier/allow-list
// matching elsewhere, which already expects (and handles) the bare form.
function normalizeBrazilLeagueDisplayName(
  leagueName: string,
  countryKey: string | null,
): string {
  if (countryKey !== "brazil") return leagueName;
  const bare = leagueName.trim().toLowerCase();
  if (bare === "serie a" || bare === "série a") return "Brasileirão Série A";
  return leagueName;
}

/** Country lookup for a PulseScore football event, preferring the event's
 * own `country` field (bwin populates this with a real value — "Brazil",
 * "Chile", ... — confirmed against a real /live-events?sport=soccer sample,
 * 2026-08-08) over the country-in-league-name guesswork above. bet365 always
 * sends `country: ""`, so this transparently falls back to
 * countryForLeagueName(league) for that bookmaker exactly as before — this
 * only changes behavior for events that actually carry a country. Uses the
 * same PULSESCORE_COUNTRY_PREFIXES label→key table as an exact lookup (not
 * a prefix strip, since `country` here is already just the bare country
 * name) so both paths resolve to the same key vocabulary. */
function countryForPulseScoreFootballEvent(ev: { country?: string; league?: string }): string | null {
  const raw = (ev.country || "").trim().toLowerCase();
  if (raw) {
    for (const [label, key] of PULSESCORE_COUNTRY_PREFIXES) {
      if (raw === label) return key;
    }
  }
  return countryForLeagueName(ev.league || "");
}

// All countries with explicit domestic league entries (used to detect intl tournaments)
const ALL_DOMESTIC_COUNTRIES = new Set([
  // Europe
  "england",
  "spain",
  "germany",
  "italy",
  "france",
  "portugal",
  "netherlands",
  "scotland",
  "belgium",
  "turkey",
  "greece",
  "austria",
  "switzerland",
  "russia",
  "ukraine",
  "poland",
  "czechia",
  "denmark",
  "sweden",
  "norway",
  "croatia",
  "serbia",
  "romania",
  "hungary",
  "slovakia",
  "bulgaria",
  "slovenia",
  "finland",
  "israel",
  "cyprus",
  "andorra",
  "albania",
  "moldova",
  "ireland",
  "wales",
  "luxembourg",
  "latvia",
  "estonia",
  "lithuania",
  "bosnia",
  "montenegro",
  "north macedonia",
  "kosovo",
  "iceland",
  "malta",
  "georgia",
  "armenia",
  "azerbaijan",
  "faroe islands",
  "slovakia",
  "slovenia",
  // Americas
  "brazil",
  "argentina",
  "mexico",
  "usa",
  "chile",
  "colombia",
  "ecuador",
  "bolivia",
  "peru",
  "uruguay",
  "paraguay",
  "venezuela",
  // Asia / Middle East
  "japan",
  "south korea",
  "korea",
  "saudi arabia",
  "thailand",
  "india",
  "egypt",
  "morocco",
  "south africa",
  "tunisia",
  "uae",
  "qatar",
]);

function normalizeCountryKey(country?: string): string {
  const raw = (country ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!raw) return "";
  if (
    raw === "us" ||
    raw === "usa" ||
    raw === "united states" ||
    raw.includes("united states")
  )
    return "usa";
  if (raw === "ru" || raw === "russian federation") return "russia";
  if (raw === "ua") return "ukraine";
  if (raw === "gb" || raw === "uk" || raw === "united kingdom")
    return "england";
  if (raw === "pt") return "portugal";
  if (raw === "es") return "spain";
  if (raw === "de") return "germany";
  if (raw === "it") return "italy";
  if (raw === "fr") return "france";
  if (raw === "nl") return "netherlands";
  if (raw === "be") return "belgium";
  if (raw === "tr") return "turkey";
  if (raw === "gr") return "greece";
  if (raw === "at") return "austria";
  if (raw === "ch") return "switzerland";
  if (raw === "dk") return "denmark";
  if (raw === "no") return "norway";
  if (raw === "se") return "sweden";
  if (raw === "hr") return "croatia";
  if (raw === "rs") return "serbia";
  if (raw === "pl") return "poland";
  if (raw === "cz" || raw === "czech republic" || raw.includes("czech"))
    return "czechia";
  if (raw === "hu") return "hungary";
  if (raw === "ro") return "romania";
  if (raw === "bg") return "bulgaria";
  if (raw === "il" || raw === "israel") return "israel";
  if (raw === "br") return "brazil";
  if (raw === "ar") return "argentina";
  if (raw === "mx") return "mexico";
  if (raw === "cl") return "chile";
  if (raw === "co") return "colombia";
  if (raw === "sa") return "saudi arabia";
  if (raw === "jp") return "japan";
  if (raw === "kr" || raw === "korea republic" || raw === "korea")
    return "south korea";
  if (raw === "th") return "thailand";
  if (raw === "in") return "india";
  if (raw === "sk") return "slovakia";
  if (raw === "si") return "slovenia";
  if (raw === "eg") return "egypt";
  if (raw === "ma") return "morocco";
  if (raw === "za" || raw === "rsa") return "south africa";
  if (raw === "tn") return "tunisia";
  if (raw === "ae" || raw === "united arab emirates") return "uae";
  if (raw === "qa") return "qatar";
  return raw;
}

const LIVE_FOOTBALL_COUNTRY_ALLOW = new Set([
  "england",
  "spain",
  "germany",
  "italy",
  "france",
  "portugal",
  "netherlands",
  "belgium",
  "turkey",
  "greece",
  "austria",
  "scotland",
  "switzerland",
  "denmark",
  "norway",
  "sweden",
  "croatia",
  "serbia",
  "poland",
  "czechia",
  "russia",
  "ukraine",
  "hungary",
  "romania",
  "bulgaria",
  "israel",
  "brazil",
  "argentina",
  "mexico",
  "chile",
  "colombia",
  "usa",
  "saudi arabia",
  "japan",
  "south korea",
  "thailand",
  "india",
  "australia",
  "slovakia",
  "slovenia",
  "egypt",
  "morocco",
  "south africa",
  "tunisia",
  "uae",
  "qatar",
]);

const LIVE_FOOTBALL_FIRST_DIV_ONLY = new Set([
  "india",
  "thailand",
  "south korea",
  "japan",
  "saudi arabia",
  "colombia",
  "chile",
  "usa",
  "mexico",
  "australia",
]);

const LIVE_FOOTBALL_FIRST_DIV_PATTERNS: Record<string, string[]> = {
  india: ["india: indian super league", "india: isl"],
  thailand: ["thailand: thai league 1", "thailand: thai league"],
  "south korea": ["south korea: k league 1", "korea: k league 1"],
  japan: ["japan: j1 league", "japan: j.league"],
  "saudi arabia": [
    "saudi arabia: saudi pro league",
    "saudi arabia: pro league",
  ],
  colombia: [
    "colombia: categoria primera a",
    "colombia: categoría primera a",
    "colombia: primera a",
  ],
  chile: ["chile: primera division", "chile: primera división"],
  usa: ["usa: mls", "usa: major league soccer"],
  mexico: ["mexico: liga mx"],
  australia: [
    "australia: a league",
    "australia: a-league",
    "australia: isuzu ute a league",
  ],
};

function isLeagueUniversallyBlocked(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\bu(1[0-9]|2[0-3])\b/.test(lower)) return true;
  if (/\b(under[ -]?\d{2})\b/.test(lower)) return true;
  if (
    /\b(women|woman|feminine|femenin[ao]|feminino|feminina|ladies|dames|femmes)\b/.test(
      lower,
    )
  )
    return true;
  if (
    /\b(reserv[ae]s?|b-team|youth|juniores?|juvenil|amateur|futsal|beach|indoor|sala)\b/.test(
      lower,
    )
  )
    return true;
  if (lower.includes("next pro")) return true;
  if (lower.includes("premier league cup")) return true;
  if (
    lower.includes("league cup") &&
    lower.includes("play offs") &&
    !lower.includes("carabao") &&
    !lower.includes("efl")
  )
    return true;
  return false;
}

function footballLeagueAllowedStrict(
  countryRaw: string,
  leagueDisplayName: string,
): boolean {
  const countryKey = normalizeCountryKey(countryRaw);
  const key = `${countryKey}: ${leagueDisplayName}`.toLowerCase();
  const prio = leaguePriority(key, countryKey);
  if (prio < 100 && isIntlTournamentName(leagueDisplayName)) return true;
  if (!LIVE_FOOTBALL_COUNTRY_ALLOW.has(countryKey)) return false;
  if (LIVE_FOOTBALL_FIRST_DIV_ONLY.has(countryKey)) {
    const allow = LIVE_FOOTBALL_FIRST_DIV_PATTERNS[countryKey] ?? [];
    return allow.some((p) => key.includes(p));
  }
  return prio < 100;
}

function leaguePriority(name: string, country?: string): number {
  const lowerRaw = name.toLowerCase();
  const lower = lowerRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const lowerCountry = String(country ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // ── Block youth / women / reserve / amateur / futsal leagues universally ──────
  // These keywords in the league name ALWAYS indicate a non-main competition.
  // Pattern must precede parent-league match (e.g. "liga mx u21" ⊃ "liga mx").
  if (/\bu(1[0-9]|2[0-3])\b/.test(lower)) return 999; // U17, U20, U21, U23…
  if (/\b(under[ -]?\d{2})\b/.test(lower)) return 999; // Under-21, Under 23…
  if (
    /\b(women|woman|feminine|femenin[ao]|feminino|feminina|ladies|dames|femmes)\b/.test(
      lower,
    )
  )
    return 999;
  if (
    /\b(reserv[ae]s?|b-team|youth|juniores?|juvenil|amateur|futsal|beach|indoor|sala)\b/.test(
      lower,
    )
  )
    return 999;
  // Specific leagues that slip through keyword checks
  if (lower.includes("next pro")) return 999; // MLS Next Pro (development)
  if (lower.includes("premier league cup")) return 999; // England U21 PL Cup
  if (
    lower.includes("league cup") &&
    lower.includes("play offs") &&
    !lower.includes("carabao") &&
    !lower.includes("efl")
  )
    return 999;

  // Checked against the FULL lowercased name, not just the part before the
  // first " - " — see isIntlTournamentName's own comment for why: the only
  // confirmed real bwin sample for these competitions predates this
  // season's qualifying rounds, so which side of a " - " the round/stage
  // descriptor lands on for a competition like Europa League qualifiers
  // isn't something this codebase can assume either way, and a false
  // negative here silently drops the match (falls through to the
  // domestic-country allowlist, which has no entries for the small
  // nations early qualifying rounds are full of) rather than just
  // mis-sorting it.
  for (let i = 0; i < INTL_TOURNAMENTS.length; i++) {
    if (lower.includes(INTL_TOURNAMENTS[i])) return i;
  }

  // Main part of league name (before first " - "), lowercased — used only
  // for the domestic-league lookup below, where patterns like "primeira
  // liga" are short enough that checking the full string (instead of just
  // the league-name portion before a stage/round suffix) risks a spurious
  // match inside unrelated composite league strings.
  const mainPart = lower.split(" - ")[0];

  // Domestic leagues — first match wins (order matters for specificity)
  for (const [pattern, rank] of DOMESTIC_PRIORITY) {
    const p = pattern.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (mainPart.includes(p)) return rank;
  }

  // Unknown league → filter out
  return 999;
}

const DEFAULT_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS = 130 * 60 * 1000;
const PRIORITY_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS = 180 * 60 * 1000;

function isCatalogPriorityLeague(prio: number): boolean {
  return prio < 100;
}

function getFootballLiveDisappearGraceMs(
  state: Pick<LiveMatchState, "league" | "country" | "minute" | "status">,
): number {
  // Matches clearly at/past full-time: short 3-minute grace so they disappear quickly.
  // Covers both normal FT (90+) and extra-time (105+, 120+).
  const statusLow = (state.status ?? "").toLowerCase();
  const isLateGame =
    (state.minute ?? 0) >= 88 &&
    (statusLow.includes("2nd half") ||
      statusLow.includes("2ª parte") ||
      statusLow.includes("extra time") ||
      statusLow.includes("tempo extra") ||
      statusLow.includes("overtime") ||
      statusLow.includes("penalties") ||
      statusLow.includes("penalty") ||
      // PulseScore football only ever sets status to the coarse "LIVE"/"HT"
      // (see buildFootballLiveFromPulseScore) — none of the descriptive
      // phrases above, written for the old Statpal pipeline, ever match it.
      // Confirmed in production (2026-08-08): without this, a PulseScore
      // match minute 88+ that vanishes from the feed (finished) never got
      // the fast grace and instead sat for up to 130-180 minutes before
      // finalizeStaleLiveMatch/settlement ever ran. "HT" deliberately
      // excluded — a match reported paused isn't a finish candidate.
      statusLow === "live");
  if (isLateGame) return 3 * 60 * 1000;

  const countryKey = normalizeCountryKey(state.country);
  const leagueKey = countryKey
    ? `${countryKey}: ${state.league}`
    : state.league;
  const prio = leaguePriority(leagueKey, countryKey);
  return isCatalogPriorityLeague(prio)
    ? PRIORITY_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS
    : DEFAULT_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS;
}

// ─── Market tier: how much market depth / staking headroom a league gets ──────
// Distinct from leaguePriority()'s display-order ranking (though it reuses the
// same DOMESTIC_PRIORITY numbers) — this drives which markets are shown and
// how big a live stake is allowed, mirroring how Bet365/Betano vary coverage
// by competition. Tier 1 = full market set, Tier 4 = 1x2 + basic over/under
// only. Confirmed with the user before building this.
export type FootballMarketTier = 1 | 2 | 3 | 4;

const FRIENDLY_INTL_NAMES = new Set([
  "international friendly",
  "international friendlies",
  "amistosos internacionais",
  "club friendly",
  "amistoso de clubes",
  "amistosos de clubes",
  "club friendlies",
]);

export function footballMarketTier(
  leagueDisplayName: string,
  countryRaw: string,
): FootballMarketTier {
  const base = String(leagueDisplayName ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(" - ")[0]
    .trim();
  if (FRIENDLY_INTL_NAMES.has(base)) return 3; // friendlies: low real market depth in practice
  if (isIntlTournamentName(leagueDisplayName)) return 1; // Champions/Europa/World Cup/Euros/Copa América/Libertadores…

  const countryKey = normalizeCountryKey(countryRaw);
  const key = `${countryKey}: ${leagueDisplayName}`.toLowerCase();
  const prio = leaguePriority(key, countryKey);
  if (prio < 10) return 1; // Tier 1 domestic
  if (prio < 20) return 2; // Tier 2 domestic
  if (prio < 40) return 3; // Tier 3 domestic
  // Domestic cups (40-59) used to get near-Tier-2 depth; per BET62's
  // 2026-08-07 tiering pass they're grouped with Tier 4 instead (minimal
  // market set / lowest stake headroom), same as any other prio ≥40 league.
  return 4;
}

const ZERO_TOTAL_GOALS: AdvancedMarkets["totalGoals"] = {
  over05: 0,
  under05: 0,
  over15: 0,
  under15: 0,
  over25: 0,
  under25: 0,
  over35: 0,
  under35: 0,
  over45: 0,
  under45: 0,
  over55: 0,
  under55: 0,
  over65: 0,
  under65: 0,
};

/**
 * Narrows an already-computed AdvancedMarkets object down to what a given
 * market tier should expose. Zeroes out (rather than deletes) the required
 * base fields — the frontend already treats all-zero odds as "market not
 * available" (see the `firstGoal` settled-market comment elsewhere in this
 * file) — and deletes the optional extended-market fields outright.
 */
export function filterFootballMarketsByTier(
  markets: AdvancedMarkets,
  tier: FootballMarketTier,
): AdvancedMarkets {
  if (tier === 1) return markets;

  const out: AdvancedMarkets = { ...markets };
  // Tier 2/3/4 all drop the more "exotic" extended markets. anytimeGoalscorer
  // was here too until 2026-08-09 — user-reported it wasn't showing on ANY
  // match, including lower-tier leagues, and confirmed they want it
  // available regardless of tier (unlike correctScore/htft/etc., which stay
  // tier-1-only by design). Kept in `out` at every tier now — if bwin
  // genuinely has no real goalscorer odds for a given league, the market
  // just stays absent on its own (extractFootballOverride only ever
  // populates it from real data), so this can't show a fabricated market
  // where none exists.
  delete out.correctScore;
  delete out.htft;
  delete out.asianTotals;
  delete out.corners;
  delete out.cards;
  delete out.secondHalf;

  if (tier === 2) return out;

  // Tier 3: core markets only — 1x2 (separate from `markets`), over/under
  // (all lines), both teams to score, double chance.
  delete out.drawNoBet;
  delete out.asianHandicap;
  out.handicap = {
    homeMinusOne: 0,
    awayPlusOne: 0,
    homeMinusOneHalf: 0,
    awayPlusOneHalf: 0,
  };
  out.halfTime = { home: 0, draw: 0, away: 0 };
  out.firstGoal = { home: 0, noGoal: 0, away: 0 };

  if (tier === 3) return out;

  // Tier 4: minimal — 1x2 + basic over/under 2.5 only.
  out.totalGoals = { ...ZERO_TOTAL_GOALS, over25: markets.totalGoals.over25, under25: markets.totalGoals.under25 };
  out.doubleChance = { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 };
  out.bothTeamsScore = { yes: 0, no: 0 };
  return out;
}

// Stake headroom by market tier — a multiplier applied on top of the admin's
// global max stake (never above it). Tier 4 caps exposure on leagues nobody
// is really betting big on; Tier 1 gets the full admin-configured ceiling.
const MARKET_TIER_STAKE_MULTIPLIER: Record<FootballMarketTier, number> = {
  1: 1,
  2: 0.75,
  3: 0.5,
  4: 0.25,
};

export function footballMarketTierMaxStake(
  tier: FootballMarketTier,
  globalMaxStake: number,
): number {
  return Math.round(globalMaxStake * MARKET_TIER_STAKE_MULTIPLIER[tier] * 100) / 100;
}

// ─── League name normalisation ─────────────────────────────────────────────────
// Strips sponsor/betting-company names and maps to canonical display names.
// Statpal format: "Country: [Sponsor - ]LeagueName"

// Sponsor words that must be removed globally (case-insensitive)
const SPONSOR_STRIP_RE =
  /\b(betano|betcris|bet365|sportingbet|sportbet|betnacional|betul|bmóvel|bmovel|brb|neoenergia|binance|ebetul|betsson|pinnacle)\b/gi;

// Canonical display names (matched against "country: rawname" in lower-case)
// More-specific entries first.
const CANONICAL_LEAGUES: Array<[RegExp, string]> = [
  // ── Brazil ──────────────────────────────────────────────────────────────────
  [
    /brazil:.*s[eé]rie\s*b|brazil:.*brasileir[aã]o.*s[eé]rie\s*b/i,
    "Brasileirão Série B",
  ],
  [
    /brazil:.*s[eé]rie\s*a|brazil:.*brasileir[aã]o|brazil:.*betano/i,
    "Brasileirão",
  ],
  [/brazil:.*copa\s*do\s*brasil/i, "Copa do Brasil"],
  [/brazil:.*supercopa/i, "Supercopa do Brasil"],
  [/brazil:.*paulist/i, "Paulistão"],
  [/brazil:.*carioca/i, "Carioca"],
  [/brazil:.*mineiro/i, "Campeonato Mineiro"],
  [/brazil:.*ga[uú]cho/i, "Gauchão"],
  // ── Ecuador ─────────────────────────────────────────────────────────────────
  [/ecuador:.*liga\s*(pro|betcris)/i, "Liga Pro"],
  // ── Colombia ────────────────────────────────────────────────────────────────
  [
    /colombia:.*categor[ií]a\s*primera\s*a|colombia:.*primera\s*a/i,
    "Categoría Primera A",
  ],
  // ── Portugal ────────────────────────────────────────────────────────────────
  [
    /portugal:.*liga\s*portugal\s*2|portugal:.*segunda\s*liga/i,
    "Liga Portugal 2",
  ],
  [
    /portugal:.*liga\s*portugal|portugal:.*primeira\s*liga|portugal:.*liga\s*bwin/i,
    "Liga Portugal",
  ],
  [/portugal:.*ta[cç]a\s*de\s*portugal/i, "Taça de Portugal"],
  [/portugal:.*supertar[cç]a|portugal:.*supertaca/i, "Supertaça"],
];

/**
 * Returns a clean display name for a football league, stripping sponsor names
 * and mapping to canonical names where known.
 * `rawName` is the Statpal league name (format: "Country: [Sponsor - ]LeagueName").
 */
function normalizeLeagueName(rawName: string, country?: string): string {
  const combined = rawName.toLowerCase();

  // 1. Try canonical map first (country-prefixed match)
  for (const [pattern, canonical] of CANONICAL_LEAGUES) {
    if (pattern.test(combined)) return canonical;
  }

  // 2. Strip "Country: " prefix from display name
  let clean = rawName;
  const colonIdx = rawName.indexOf(": ");
  if (
    colonIdx !== -1 &&
    country &&
    rawName.slice(0, colonIdx).toLowerCase() === country.toLowerCase()
  ) {
    clean = rawName.slice(colonIdx + 2);
  }

  // 3. Remove sponsor words
  clean = clean.replace(SPONSOR_STRIP_RE, "");

  // 4. Clean up dash/whitespace artifacts left by removal
  clean = clean
    .replace(/\s*-\s*-+\s*/g, " ") // "- - " → " "
    .replace(/^\s*[-–]\s*/, "") // leading " - "
    .replace(/\s*[-–]\s*$/, "") // trailing " - "
    .replace(/\s{2,}/g, " ")
    .trim();

  return clean || rawName;
}

// ─── Odds helpers ──────────────────────────────────────────────────────────────

function parseFloat2(v: string | undefined): number {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ─── Probabilistic odds engine ─────────────────────────────────────────────────

const mc = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const mr = (n: number) => Math.round(n * 100) / 100;

function probsToDecimalOdds(probs: number[], overround: number): number[] {
  const s = probs.reduce((a, b) => a + b, 0);
  const base =
    s > 0 ? probs.map((p) => p / s) : probs.map(() => 1 / probs.length);
  return base.map((p) => mr(mc(1 / Math.max(1e-9, p * overround), 1.01, 100)));
}

function modelErf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + modelErf(z / Math.SQRT2));
}

function poissonPmf(lambda: number, maxK: number): number[] {
  const out = new Array<number>(maxK + 1).fill(0);
  if (!Number.isFinite(lambda) || lambda < 0) return out;
  out[0] = Math.exp(-lambda);
  for (let k = 1; k <= maxK; k++) out[k] = (out[k - 1]! * lambda) / k;
  return out;
}

function poissonCdf(lambda: number, k: number): number {
  return poissonPmf(lambda, Math.max(0, Math.floor(k))).reduce(
    (a, b) => a + b,
    0,
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seed: string): (n: number) => number {
  const h = hashStr(seed);
  return (n: number) => {
    const x = Math.sin((h + n) * 9999) * 10000;
    return x - Math.floor(x);
  };
}

function canonName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getTeamElo(name: string): number {
  const n = canonName(name);
  const known: Record<string, number> = {
    "manchester city": 1910,
    "man city": 1910,
    "manchester utd": 1760,
    "manchester united": 1760,
    "man utd": 1760,
    liverpool: 1860,
    arsenal: 1830,
    chelsea: 1760,
    tottenham: 1750,
    "tottenham hotspur": 1750,
    spurs: 1750,
    newcastle: 1740,
    "newcastle united": 1740,
    "aston villa": 1710,
    everton: 1630,
    "west ham": 1670,
    "west ham united": 1670,
    brighton: 1680,
    wolves: 1620,
    wolverhampton: 1620,
    "wolverhampton wanderers": 1620,
    "nottingham forest": 1600,
    brentford: 1610,
    fulham: 1610,
    "crystal palace": 1600,
    bournemouth: 1580,
    burnley: 1540,
    "sheffield united": 1520,
    luton: 1500,
    leicester: 1580,
    "real madrid": 1910,
    barcelona: 1880,
    "atletico madrid": 1820,
    "atletico de madrid": 1820,
    sevilla: 1760,
    "real sociedad": 1730,
    villarreal: 1720,
    "athletic bilbao": 1700,
    "athletic club": 1700,
    "real betis": 1690,
    valencia: 1670,
    osasuna: 1620,
    "bay munich": 1910,
    "bayern munich": 1910,
    "fc bayern": 1910,
    "borussia dortmund": 1810,
    "bayer leverkusen": 1800,
    "rb leipzig": 1790,
    "eintracht frankfurt": 1750,
    "sc freiburg": 1710,
    "union berlin": 1690,
    "vfb stuttgart": 1720,
    "borussia monchengladbach": 1680,
    psg: 1890,
    "paris saint germain": 1890,
    "paris sg": 1890,
    "olympique marseille": 1760,
    "as monaco": 1770,
    "olympique lyonnais": 1740,
    lille: 1740,
    rennes: 1700,
    nice: 1690,
    juventus: 1800,
    inter: 1830,
    internazionale: 1830,
    "inter milan": 1830,
    "ac milan": 1810,
    milan: 1810,
    napoli: 1770,
    "ss lazio": 1740,
    "as roma": 1730,
    atalanta: 1780,
    fiorentina: 1700,
    benfica: 1760,
    porto: 1760,
    sporting: 1740,
    "sporting cp": 1740,
    braga: 1680,
    "vitoria guimaraes": 1620,
    ajax: 1750,
    psv: 1720,
    feyenoord: 1710,
    celtic: 1700,
    rangers: 1690,
    anderlecht: 1650,
    "club brugge": 1680,
    galatasaray: 1680,
    fenerbahce: 1650,
    besiktas: 1620,
    trabzonspor: 1580,
    başakşehir: 1610,
    "istanbul basaksehir": 1610,
    "adana demirspor": 1540,
    konyaspor: 1530,
    sivasspor: 1520,
    antalyaspor: 1510,
    kasimpasa: 1500,
    "gaziantep fk": 1490,
    ankaragücü: 1490,
    hearts: 1640,
    "heart of midlothian": 1640,
    hibernian: 1620,
    aberdeen: 1600,
    "dundee united": 1560,
    motherwell: 1540,
    "st mirren": 1520,
    "beijing guoan": 1640,
    "shanghai port": 1660,
    "shandong taishan": 1650,
    "guangzhou fc": 1580,
    "wuhan three towns": 1600,
    "shenzhen fc": 1550,
    "shanghai shenhua": 1590,
    "tianjin jinmen tiger": 1540,
    "persija jakarta": 1600,
    "persebaya surabaya": 1590,
    "psm makassar": 1580,
    "bali united": 1570,
    "persib bandung": 1610,
    "arema fc": 1560,
    "borneo fc": 1550,
    "bhayangkara fc": 1540,
    "crvena zvezda": 1660,
    "red star belgrade": 1660,
    salzburg: 1700,
    "rb salzburg": 1700,
    flamengo: 1750,
    palmeiras: 1750,
    "atletico mineiro": 1730,
    corinthians: 1650,
    "sao paulo": 1650,
    "são paulo": 1650,
    gremio: 1620,
    grêmio: 1620,
    internacional: 1630,
    botafogo: 1640,
    fluminense: 1650,
    vasco: 1590,
    cruzeiro: 1620,
    "atletico go": 1560,
    "boca juniors": 1730,
    "river plate": 1760,
    independiente: 1660,
    "racing club": 1660,
    "san lorenzo": 1640,
    america: 1690,
    chivas: 1680,
    "cruz azul": 1650,
    pumas: 1630,
    leon: 1620,
    monterrey: 1650,
    tigres: 1660,
    // ── Georgia — Erovnuli Liga ─────────────────────────────────────────────────
    "dinamo tbilisi": 1730,
    "fc dinamo tbilisi": 1730,
    "locomotive tbilisi": 1700,
    lokomotivi: 1700,
    "fc lokomotivi": 1700,
    "dinamo batumi": 1670,
    "fc dinamo batumi": 1670,
    saburtalo: 1650,
    "fc saburtalo": 1650,
    "fc iberia 1999": 1800,
    "iberia 1999": 1800,
    "fc iberia": 1760,
    gagra: 1630,
    "fc gagra": 1630,
    telavi: 1610,
    "fc telavi": 1610,
    "sioni bolnisi": 1590,
    "fc sioni": 1590,
    "wit georgia": 1570,
    "fc wit georgia": 1570,
    rustavi: 1560,
    "fc rustavi": 1560,
    spaeri: 1430,
    "spaeri fc": 1430,
    "fc spaeri": 1430,
    "merani martvili": 1520,
    merani: 1520,
    "dila gori": 1580,
    "fc dila": 1580,
    // ── Tanzania — Ligi Kuu Bara ──────────────────────────────────────────────
    "simba sc": 1710,
    simba: 1700,
    "young africans": 1700,
    yanga: 1700,
    "azam fc": 1660,
    azam: 1650,
    "namungo fc": 1570,
    namungo: 1560,
    "coastal union": 1550,
    "fountain gate": 1520,
    "fountain gate fc": 1520,
    "mbeya city": 1530,
    "ihefu fc": 1510,
    "geita gold": 1510,
    "biashara united": 1540,
    "tanzania prisons": 1520,
    // ── Lebanon — Premier League ──────────────────────────────────────────────
    ansar: 1650,
    "al ansar": 1650,
    nejmeh: 1640,
    "nejmeh sc": 1640,
    "al ahed": 1660,
    ahed: 1660,
    safa: 1600,
    "safa sc": 1600,
    "al hikma": 1540,
    hikma: 1540,
    "al abbassieh": 1540,
    abbassieh: 1540,
    "shabab al sahel": 1570,
    "al sahel": 1570,
    "racing beirut": 1560,
    "olympic beirut": 1550,
    // ── Latvia — Virslīga ────────────────────────────────────────────────────
    "fk riga": 1660,
    "riga fc": 1660,
    rfs: 1640,
    "riga fc rfs": 1640,
    "fk liepaja": 1620,
    liepaja: 1610,
    "fk ventspils": 1590,
    ventspils: 1590,
    "riga united": 1550,
    "super nova": 1540,
    "super nova fc": 1540,
    "fk jelgava": 1520,
    jelgava: 1520,
    // ── Lithuania — A Lyga ───────────────────────────────────────────────────
    zalgiris: 1660,
    "fk zalgiris": 1660,
    "kauno zalgiris": 1620,
    panevezys: 1580,
    "fk panevezys": 1580,
    "tauras taurage": 1530,
    "be1 nfa": 1570,
    // ── Armenia — Premier League ─────────────────────────────────────────────
    alashkert: 1640,
    "fc alashkert": 1640,
    pyunik: 1660,
    "fc pyunik": 1660,
    urartu: 1620,
    "fc urartu": 1620,
    banants: 1580,
    // ── Tajikistan ───────────────────────────────────────────────────────────
    "fc istiqlol": 1640,
    istiqlol: 1640,
    "cska pomir": 1590,
    "fc cska pomir": 1590,
    parvoz: 1550,
    "fc parvoz": 1550,
    // ── Morocco — Botola Pro ─────────────────────────────────────────────────
    wydad: 1690,
    wac: 1690,
    "wydad athletic club": 1690,
    "raja casablanca": 1680,
    raja: 1680,
    "fus rabat": 1660,
    fus: 1660,
    "renaissance berkane": 1640,
    "maghreb fes": 1530,
    "moghreb fes": 1530,
    "difaa el jadida": 1550,
    "el jadida": 1540,
    "olympique dcheira": 1510,
    dcheira: 1510,
    // ── Peru — Liga 1 ────────────────────────────────────────────────────────
    universitario: 1670,
    "universitario de deportes": 1670,
    "alianza lima": 1660,
    "sporting cristal": 1650,
    melgar: 1610,
    "adt tarma": 1530,
    adt: 1530,
    "union minas": 1560,
    "unión minas": 1560,
    foutoua: 1590,
    "al karamah": 1520,
    // ── National teams — FIFA World Cup 2026 participants (based on FIFA ranking) ─
    argentina: 1965,
    france: 1950,
    england: 1940,
    spain: 1935,
    brazil: 1930,
    portugal: 1915,
    netherlands: 1905,
    germany: 1890,
    belgium: 1885,
    colombia: 1865,
    croatia: 1845,
    uruguay: 1835,
    morocco: 1810,
    mexico: 1795,
    usa: 1800,
    "united states": 1800,
    switzerland: 1782,
    japan: 1775,
    senegal: 1758,
    ecuador: 1755,
    australia: 1712,
    "south korea": 1716,
    iran: 1700,
    serbia: 1698,
    austria: 1682,
    scotland: 1675,
    turkiye: 1662,
    turkey: 1662,
    canada: 1742,
    norway: 1668,
    sweden: 1652,
    algeria: 1622,
    czechia: 1632,
    "czech republic": 1632,
    paraguay: 1598,
    romania: 1618,
    egypt: 1562,
    "cote d ivoire": 1582,
    "ivory coast": 1582,
    "côte d'ivoire": 1582,
    ghana: 1538,
    tunisia: 1538,
    "dr congo": 1542,
    congo: 1542,
    iraq: 1572,
    jordan: 1565,
    uzbekistan: 1582,
    "saudi arabia": 1552,
    qatar: 1512,
    panama: 1542,
    "south africa": 1538,
    "new zealand": 1498,
    "cabo verde": 1522,
    curaçao: 1452,
    curacao: 1452,
    haiti: 1458,
    "bosnia & herzegovina": 1558,
    bosnia: 1558,
    "bosnia and herzegovina": 1558,
  };
  if (known[n] !== undefined) return known[n]!;
  const h = hashStr(`elo:${n}`);
  return Math.round(1500 + ((h % 1000) / 1000 - 0.5) * 700);
}

function soccerPoissonModel(homeName: string, awayName: string) {
  const homeElo = getTeamElo(homeName);
  const awayElo = getTeamElo(awayName);
  const diff = homeElo + 60 - awayElo;
  const pHomeVsAway = 1 / (1 + Math.exp(-diff / 200));
  const draw = mc(0.25 - Math.abs(diff) / 1000, 0.11, 0.27);
  const rem = mc(1 - draw, 0.01, 0.99);
  const pHome = mc(rem * pHomeVsAway, 0.01, 0.98);
  const pAway = mc(1 - draw - pHome, 0.01, 0.98);
  const goalDiff = mc(diff / 400, -1.2, 1.2);
  const totalLambda = mc(
    2.55 + Math.min(0.45, Math.abs(goalDiff) * 0.22),
    1.8,
    3.8,
  );
  const lambdaHome = mc(totalLambda / 2 + goalDiff / 2, 0.2, 3.2);
  const lambdaAway = mc(totalLambda / 2 - goalDiff / 2, 0.2, 3.2);

  const maxG = 10;
  const pH = poissonPmf(lambdaHome, maxG);
  const pA = poissonPmf(lambdaAway, maxG);
  let pHW = 0,
    pD = 0,
    pAW = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = pH[i]! * pA[j]!;
      if (i > j) pHW += p;
      else if (i < j) pAW += p;
      else pD += p;
    }
  }
  const s = pHW + pD + pAW;
  return {
    lambdaHome,
    lambdaAway,
    pHomeWin: s > 0 ? pHW / s : pHome,
    pDraw: s > 0 ? pD / s : draw,
    pAwayWin: s > 0 ? pAW / s : pAway,
  };
}

function makeOddsFromTeams(
  homeName: string,
  awayName: string,
): { home: number; draw: number; away: number } {
  const m = soccerPoissonModel(homeName, awayName);
  const [h, d, a] = probsToDecimalOdds([m.pHomeWin, m.pDraw, m.pAwayWin], 1.06);
  return { home: h!, draw: d!, away: a! };
}

// ─── Football extra-time / penalty-shootout synthetic markets ─────────────
// AdvancedMarkets.etExtra/penExtra (below, in this file's type section) and
// the frontend's full "Prorrogação"/"Penáltis" UI (home.tsx's showET/
// showPen) both already existed, but nothing ever populated either field —
// confirmed via a full-file search, 2026-08-11 — so a knockout match tied
// after 90' had no ET markets to show even on ticks where it correctly
// stayed live (see buildFootballLiveFromPulseScore's ET-detection changes
// for the other half of this bug: it usually didn't even stay live that
// long). Reuses soccerPoissonModel — extra time is a shorter window for the
// same two teams' scoring rates, not a different game needing its own model.
function computeFootballEtExtra(
  homeName: string,
  awayName: string,
): NonNullable<AdvancedMarkets["etExtra"]> {
  const m = soccerPoissonModel(homeName, awayName);
  // 30 real minutes vs. a full match's ~97 effective playing minutes (90 +
  // typical stoppage time) — scales the full-match goal expectancy down
  // proportionally rather than inventing a separate ET-specific rate with
  // no real data to calibrate it against.
  const scale = 30 / 97;
  const lambdaHome = mc(m.lambdaHome * scale, 0.05, 1.6);
  const lambdaAway = mc(m.lambdaAway * scale, 0.05, 1.6);
  const maxG = 4;
  const pH = poissonPmf(lambdaHome, maxG);
  const pA = poissonPmf(lambdaAway, maxG);
  let pHW = 0,
    pD = 0,
    pAW = 0;
  const scoreProbs: Record<string, number> = {};
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = pH[i]! * pA[j]!;
      if (i > j) pHW += p;
      else if (i < j) pAW += p;
      else pD += p;
      const label = i === maxG || j === maxG ? "outro" : `${i}-${j}`;
      scoreProbs[label] = (scoreProbs[label] ?? 0) + p;
    }
  }
  const s = pHW + pD + pAW;
  const pHomeEt = s > 0 ? pHW / s : 0.4;
  const pDrawEt = s > 0 ? pD / s : 0.2;
  const pAwayEt = s > 0 ? pAW / s : 0.4;

  const [etrH, etrD, etrA] = probsToDecimalOdds([pHomeEt, pDrawEt, pAwayEt], 1.08);
  // Tie-winner (who advances) — a draw after ET goes to penalties, a
  // genuine coin-flip this model has no real signal to bias beyond overall
  // team strength, so the draw probability is split evenly between both
  // sides rather than modeled separately.
  const pHomeAdvance = mc(pHomeEt + pDrawEt / 2, 0.05, 0.95);
  const [twH, twA] = probsToDecimalOdds([pHomeAdvance, 1 - pHomeAdvance], 1.05);

  const totalLambda = lambdaHome + lambdaAway;
  const ouLine = (line: number): number[] => {
    const pUnder = poissonCdf(totalLambda, line);
    return probsToDecimalOdds([mc(1 - pUnder, 0.02, 0.98), mc(pUnder, 0.02, 0.98)], 1.07);
  };
  const [o05, u05] = ouLine(0);
  const [o15, u15] = ouLine(1);
  const [o25, u25] = ouLine(2);
  const [o35, u35] = ouLine(3);
  const [o45, u45] = ouLine(4);

  const pNextHome = mc(lambdaHome / Math.max(0.001, totalLambda), 0.05, 0.95);
  const [ngH, ngA] = probsToDecimalOdds([pNextHome, 1 - pNextHome], 1.06);

  const exactScore: Record<string, number> = {};
  for (const [label, p] of Object.entries(scoreProbs)) {
    if (p <= 0) continue;
    exactScore[label] = mr(mc(1 / Math.max(1e-9, p * 1.15), 1.01, 100));
  }

  // Corners/cards — no reusable per-team ET-specific rate model exists
  // elsewhere in this file, so these are flat, conservative estimates
  // scaled to ET's shorter window rather than reusing full-match lines
  // unscaled (which would overstate both markets for a 30-minute period).
  const ouFromMean = (line: number, mean: number): number[] => {
    const pUnder = poissonCdf(mean, line);
    return probsToDecimalOdds([mc(1 - pUnder, 0.03, 0.97), mc(pUnder, 0.03, 0.97)], 1.08);
  };
  const [co15, cu15] = ouFromMean(1, 2.6);
  const [co25, cu25] = ouFromMean(2, 2.6);
  const [co35, cu35] = ouFromMean(3, 2.6);
  const [cdo05, cdu05] = ouFromMean(0, 1.1);
  const [cdo15, cdu15] = ouFromMean(1, 1.1);
  const [cdo25, cdu25] = ouFromMean(2, 1.1);

  return {
    tieWinner: { home: twH!, away: twA! },
    etResult: { home: etrH!, draw: etrD!, away: etrA! },
    totalGoals: {
      o05: o05!, u05: u05!,
      o15: o15!, u15: u15!,
      o25: o25!, u25: u25!,
      o35: o35!, u35: u35!,
      o45: o45!, u45: u45!,
    },
    nextGoal: { home: ngH!, away: ngA! },
    // All-zero (hidden by the frontend) — API-Football's fixture status
    // ("ET") doesn't distinguish ET's 1st/2nd half, and this codebase has no
    // other signal for it either, matching AdvancedMarkets.etExtra's own
    // documented convention for feeds that don't carry this split.
    firstHalfResult: { home: 0, draw: 0, away: 0 },
    secondHalfResult: { home: 0, draw: 0, away: 0 },
    corners: { o15: co15!, u15: cu15!, o25: co25!, u25: cu25!, o35: co35!, u35: cu35! },
    cards: { o05: cdo05!, u05: cdu05!, o15: cdo15!, u15: cdu15!, o25: cdo25!, u25: cdu25! },
    exactScore,
  };
}

// Penalty-shootout winner — deliberately compressed close to 50/50 (unlike
// etExtra's full-strength Poisson lean): open-play scoring-rate differences
// between two teams carry only weak signal for who wins a shootout, so the
// same model's lean is kept but heavily dampened rather than carried over
// at full magnitude.
function computeFootballPenExtra(
  homeName: string,
  awayName: string,
): NonNullable<AdvancedMarkets["penExtra"]> {
  const m = soccerPoissonModel(homeName, awayName);
  const pHomeRaw = m.pHomeWin + m.pDraw / 2;
  const pHome = mc(0.5 + (pHomeRaw - 0.5) * 0.3, 0.42, 0.58);
  const [h, a] = probsToDecimalOdds([pHome, 1 - pHome], 1.05);
  return { winner: { home: h!, away: a! } };
}

function makeAdvancedMarketsFromTeams(
  homeName: string,
  awayName: string,
): AdvancedMarkets {
  const m = soccerPoissonModel(homeName, awayName);
  const { lambdaHome, lambdaAway, pHomeWin, pDraw, pAwayWin } = m;
  const maxG = 10;
  const pH = poissonPmf(lambdaHome, maxG);
  const pA = poissonPmf(lambdaAway, maxG);

  // Double Chance — computed directly from true combined probability (NOT via
  // probsToDecimalOdds which normalises by sum; DC probs sum to 2, which would
  // halve each probability and produce odds ~2× too high).
  const dcMargin = 1.065;
  const dcHD = mr(
    mc(1 / Math.max(1e-9, (pHomeWin + pDraw) * dcMargin), 1.01, 50),
  );
  const dcDA = mr(
    mc(1 / Math.max(1e-9, (pDraw + pAwayWin) * dcMargin), 1.01, 50),
  );
  const dcHA = mr(
    mc(1 / Math.max(1e-9, (pHomeWin + pAwayWin) * dcMargin), 1.01, 50),
  );

  // BTTS
  const pBttsYes = mc(
    (1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway)),
    0.02,
    0.98,
  );
  const [bttsYes, bttsNo] = probsToDecimalOdds([pBttsYes, 1 - pBttsYes], 1.06);

  // Total Goals
  const lambda = lambdaHome + lambdaAway;
  const [o15, u15] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 1), 0.02, 0.98),
      mc(poissonCdf(lambda, 1), 0.02, 0.98),
    ],
    1.06,
  );
  const [o25, u25] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 2), 0.02, 0.98),
      mc(poissonCdf(lambda, 2), 0.02, 0.98),
    ],
    1.06,
  );
  const [o35, u35] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 3), 0.02, 0.98),
      mc(poissonCdf(lambda, 3), 0.02, 0.98),
    ],
    1.06,
  );

  // Handicap -1 and -1.5 for home team
  let pHomeCover1 = 0,
    pAwayCover1 = 0;
  let pHomeCover15 = 0,
    pAwayCover15 = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = pH[i]! * pA[j]!;
      if (i - 1 > j) pHomeCover1 += p;
      else if (i - 1 < j) pAwayCover1 += p;
      if (i - 1.5 > j) pHomeCover15 += p;
      else pAwayCover15 += p;
    }
  }
  const push1 = mc(1 - pHomeCover1 - pAwayCover1, 0, 1);
  const denom1 = mc(1 - push1, 1e-9, 1);
  const [hm1H, hm1A] = probsToDecimalOdds(
    [pHomeCover1 / denom1, pAwayCover1 / denom1],
    1.07,
  );
  const [hm15H, hm15A] = probsToDecimalOdds(
    [mc(pHomeCover15, 0.02, 0.98), mc(pAwayCover15, 0.02, 0.98)],
    1.07,
  );

  // Half-time (lambda scaled by 0.45)
  const htPH = poissonPmf(lambdaHome * 0.45, maxG);
  const htPA = poissonPmf(lambdaAway * 0.45, maxG);
  let htHW = 0,
    htD = 0,
    htAW = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = htPH[i]! * htPA[j]!;
      if (i > j) htHW += p;
      else if (i < j) htAW += p;
      else htD += p;
    }
  }
  const htS = htHW + htD + htAW;
  const [htH, htX, htA] = probsToDecimalOdds(
    [htHW / htS, htD / htS, htAW / htS],
    1.08,
  );

  // First Goal
  const pNoGoal = mc(Math.exp(-(lambdaHome + lambdaAway)), 0.01, 0.2);
  const pFGHome = mc(
    (lambdaHome / (lambdaHome + lambdaAway + 1e-9)) * (1 - pNoGoal),
    0.02,
    0.9,
  );
  const pFGAway = mc(
    (lambdaAway / (lambdaHome + lambdaAway + 1e-9)) * (1 - pNoGoal),
    0.02,
    0.9,
  );
  const [fgH, fgNG, fgA] = probsToDecimalOdds(
    [pFGHome, pNoGoal, pFGAway],
    1.08,
  );

  // ── Extended markets ────────────────────────────────────────────────────────

  // Draw No Bet
  const pDnbH = pHomeWin / Math.max(1e-9, pHomeWin + pAwayWin);
  const [dnbH, dnbA] = probsToDecimalOdds([pDnbH, 1 - pDnbH], 1.05);

  // Asian Totals
  const pmfTotal = poissonPmf(lambda, maxG);
  const pEx2 = pmfTotal[2] ?? 0;
  const pEx3 = pmfTotal[3] ?? 0;
  const pO2 = mc(1 - poissonCdf(lambda, 2), 0.02, 0.98);
  const pO3 = mc(1 - poissonCdf(lambda, 3), 0.02, 0.98);
  const pA225 = mc(pO2 + 0.5 * pEx2, 0.02, 0.98);
  const pA275 = mc(pO3 + 0.5 * pEx3, 0.02, 0.98);
  const [o05, u05] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 0), 0.02, 0.98),
      mc(poissonCdf(lambda, 0), 0.02, 0.98),
    ],
    1.05,
  );
  const [o45, u45] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 4), 0.02, 0.98),
      mc(poissonCdf(lambda, 4), 0.02, 0.98),
    ],
    1.06,
  );
  const [o55, u55] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 5), 0.02, 0.98),
      mc(poissonCdf(lambda, 5), 0.02, 0.98),
    ],
    1.06,
  );
  const [o65, u65] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambda, 6), 0.02, 0.98),
      mc(poissonCdf(lambda, 6), 0.02, 0.98),
    ],
    1.06,
  );
  const [o225, u225] = probsToDecimalOdds([pA225, 1 - pA225], 1.05);
  const [o275, u275] = probsToDecimalOdds([pA275, 1 - pA275], 1.05);

  // Asian Handicap — line based on Poisson expected goal difference
  const goalDiff = lambdaHome - lambdaAway;
  const ahLineRaw = Math.round(goalDiff * 2) / 2;
  const ahLine = -ahLineRaw;
  let pAHHome = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = pH[i]! * pA[j]!;
      if (i - ahLine > j) pAHHome += p;
    }
  }
  const [ahH, ahA] = probsToDecimalOdds(
    [mc(pAHHome, 0.05, 0.95), mc(1 - pAHHome, 0.05, 0.95)],
    1.05,
  );

  // HT/FT — joint model via two independent halves
  const h1PH = poissonPmf(lambdaHome * 0.45, 7);
  const h1PA = poissonPmf(lambdaAway * 0.45, 7);
  const h2PH = poissonPmf(lambdaHome * 0.55, 7);
  const h2PA = poissonPmf(lambdaAway * 0.55, 7);
  let hftHH = 0,
    hftHD = 0,
    hftHA = 0;
  let hftDH = 0,
    hftDD = 0,
    hftDA = 0;
  let hftAH = 0,
    hftAD = 0,
    hftAA = 0;
  for (let i1 = 0; i1 <= 7; i1++) {
    for (let j1 = 0; j1 <= 7; j1++) {
      const pHT = (h1PH[i1] ?? 0) * (h1PA[j1] ?? 0);
      const htR = i1 > j1 ? 1 : i1 < j1 ? -1 : 0;
      for (let i2 = 0; i2 <= 7; i2++) {
        for (let j2 = 0; j2 <= 7; j2++) {
          const pFT = (h2PH[i2] ?? 0) * (h2PA[j2] ?? 0);
          const pJoint = pHT * pFT;
          const ftR = i1 + i2 > j1 + j2 ? 1 : i1 + i2 < j1 + j2 ? -1 : 0;
          if (htR === 1 && ftR === 1) hftHH += pJoint;
          else if (htR === 1 && ftR === 0) hftHD += pJoint;
          else if (htR === 1 && ftR === -1) hftHA += pJoint;
          else if (htR === 0 && ftR === 1) hftDH += pJoint;
          else if (htR === 0 && ftR === 0) hftDD += pJoint;
          else if (htR === 0 && ftR === -1) hftDA += pJoint;
          else if (htR === -1 && ftR === 1) hftAH += pJoint;
          else if (htR === -1 && ftR === 0) hftAD += pJoint;
          else hftAA += pJoint;
        }
      }
    }
  }
  const htftProbs = [
    hftHH,
    hftHD,
    hftHA,
    hftDH,
    hftDD,
    hftDA,
    hftAH,
    hftAD,
    hftAA,
  ];
  const htftTotal = htftProbs.reduce((a, b) => a + b, 0);
  const htftOdds = probsToDecimalOdds(
    htftProbs.map((p) => mc(p / Math.max(1e-9, htftTotal), 0.005, 0.8)),
    1.12,
  );

  // Second Half Result — marginalise over 2nd-half Poisson distributions (h2PH / h2PA)
  let sh2H = 0,
    sh2X = 0,
    sh2A = 0;
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      const p = (h2PH[i] ?? 0) * (h2PA[j] ?? 0);
      if (i > j) sh2H += p;
      else if (i === j) sh2X += p;
      else sh2A += p;
    }
  }
  const [sh2OddsH, sh2OddsX, sh2OddsA] = probsToDecimalOdds(
    [mc(sh2H, 0.02, 0.96), mc(sh2X, 0.02, 0.96), mc(sh2A, 0.02, 0.96)],
    1.08,
  );

  // Correct Score — top 14 scorelines + Other
  const scores: Array<[string, number]> = [];
  let pOther = 0;
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      scores.push([`${i}-${j}`, (pH[i] ?? 0) * (pA[j] ?? 0)]);
    }
  }
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      if (i > 5 || j > 5) pOther += (pH[i] ?? 0) * (pA[j] ?? 0);
    }
  }
  scores.sort((a, b) => b[1] - a[1]);
  const topScores = scores.slice(0, 14);
  const topTotal = topScores.reduce((a, b) => a + b[1], 0) + pOther;
  const csOdds = probsToDecimalOdds(
    topScores.map((s) => mc(s[1] / topTotal, 0.005, 0.6)),
    1.18,
  );
  const correctScore: Record<string, number> = {};
  topScores.forEach(([score], idx) => {
    correctScore[score] = csOdds[idx]!;
  });
  correctScore["Outro"] = mr(
    mc(1 / mc(pOther / topTotal / 1.18, 0.005, 0.6), 1.01, 500),
  );

  // Corners — Poisson model: λ ≈ 9.5 + attacking proxy
  const lambdaCorners = mc(9.5 + (lambdaHome + lambdaAway) * 0.85, 7, 14);
  const [oc85, uc85] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambdaCorners, 8), 0.02, 0.98),
      mc(poissonCdf(lambdaCorners, 8), 0.02, 0.98),
    ],
    1.06,
  );
  const [oc95, uc95] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambdaCorners, 9), 0.02, 0.98),
      mc(poissonCdf(lambdaCorners, 9), 0.02, 0.98),
    ],
    1.06,
  );
  const [oc105, uc105] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambdaCorners, 10), 0.02, 0.98),
      mc(poissonCdf(lambdaCorners, 10), 0.02, 0.98),
    ],
    1.06,
  );

  // Cards — Poisson model: λ ≈ 4.0 + competitive pressure
  const lambdaCards = mc(4.0 + Math.abs(lambdaHome - lambdaAway) * 0.7, 2.5, 7);
  const [ocard35, ucard35] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambdaCards, 3), 0.02, 0.98),
      mc(poissonCdf(lambdaCards, 3), 0.02, 0.98),
    ],
    1.06,
  );
  const [ocard45, ucard45] = probsToDecimalOdds(
    [
      mc(1 - poissonCdf(lambdaCards, 4), 0.02, 0.98),
      mc(poissonCdf(lambdaCards, 4), 0.02, 0.98),
    ],
    1.06,
  );

  // ── New football markets derived from existing Poisson λH/λA ─────────────
  // Win to Nil: team wins AND opponent scores 0 at full time
  const pWTNHome = mc(
    (1 - Math.exp(-lambdaHome)) * Math.exp(-lambdaAway),
    0.02,
    0.75,
  );
  const pWTNAway = mc(
    Math.exp(-lambdaHome) * (1 - Math.exp(-lambdaAway)),
    0.02,
    0.75,
  );
  const wtnHOdds = mr(mc(1 / (pWTNHome * 0.935), 1.01, 50));
  const wtnAOdds = mr(mc(1 / (pWTNAway * 0.935), 1.01, 50));

  // Clean Sheet: team's goal tally for opponent is 0 at FT
  const pCSHome = mc(Math.exp(-lambdaAway), 0.03, 0.97);
  const pCSAway = mc(Math.exp(-lambdaHome), 0.03, 0.97);
  const csHOdds = mr(mc(1 / (pCSHome * 0.935), 1.01, 20));
  const csAOdds = mr(mc(1 / (pCSAway * 0.935), 1.01, 20));

  // Odd/Even total goals
  let pOddG = 0,
    pEvenG = 0;
  for (let k = 0; k <= maxG; k++) {
    if (k % 2 === 0) pEvenG += pmfTotal[k]!;
    else pOddG += pmfTotal[k]!;
  }
  const [goalOddO, goalEvenO] = probsToDecimalOdds(
    [mc(pOddG, 0.3, 0.7), mc(pEvenG, 0.3, 0.7)],
    1.06,
  );

  // Exact Goals (0 / 1 / 2 / 3 / 4 / 5+)
  const pG5plus = mc(1 - poissonCdf(lambda, 4), 0.005, 0.9);
  const egProbs = [
    mc(pmfTotal[0] ?? 0, 0.005, 0.8),
    mc(pmfTotal[1] ?? 0, 0.005, 0.8),
    mc(pmfTotal[2] ?? 0, 0.005, 0.8),
    mc(pmfTotal[3] ?? 0, 0.005, 0.8),
    mc(pmfTotal[4] ?? 0, 0.005, 0.8),
    pG5plus,
  ];
  const egOddsArr = probsToDecimalOdds(egProbs, 1.15);

  // BTTS in 1st half
  const pBtts1HYes = mc(
    (1 - Math.exp(-lambdaHome * 0.45)) * (1 - Math.exp(-lambdaAway * 0.45)),
    0.02,
    0.85,
  );
  const [b1HYes, b1HNo] = probsToDecimalOdds(
    [pBtts1HYes, 1 - pBtts1HYes],
    1.07,
  );

  // Win Both Halves — team wins 1st half AND 2nd half (using h1/h2 PMFs above)
  let pHWin1H = 0,
    pAWin1H = 0,
    pHWin2H = 0,
    pAWin2H = 0;
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      const p1 = (h1PH[i] ?? 0) * (h1PA[j] ?? 0);
      if (i > j) pHWin1H += p1;
      else if (j > i) pAWin1H += p1;
      const p2 = (h2PH[i] ?? 0) * (h2PA[j] ?? 0);
      if (i > j) pHWin2H += p2;
      else if (j > i) pAWin2H += p2;
    }
  }
  const pHomeBothH = mc(pHWin1H * pHWin2H, 0.01, 0.8);
  const pAwayBothH = mc(pAWin1H * pAWin2H, 0.01, 0.8);
  const wbhHOdds = mr(mc(1 / (pHomeBothH * 0.935), 1.01, 100));
  const wbhAOdds = mr(mc(1 / (pAwayBothH * 0.935), 1.01, 100));

  // Highest Scoring Half — independent Poisson for H1 and H2 total goals
  const pmf1H = poissonPmf(lambda * 0.45, maxG);
  const pmf2H = poissonPmf(lambda * 0.55, maxG);
  let pHSFirst = 0,
    pHSSecond = 0,
    pHSEqual = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = (pmf1H[i] ?? 0) * (pmf2H[j] ?? 0);
      if (i > j) pHSFirst += p;
      else if (j > i) pHSSecond += p;
      else pHSEqual += p;
    }
  }
  const hsfTot = Math.max(1e-9, pHSFirst + pHSSecond + pHSEqual);
  const [hsfFirstO, hsfSecondO, hsfEqualO] = probsToDecimalOdds(
    [
      mc(pHSFirst / hsfTot, 0.05, 0.7),
      mc(pHSSecond / hsfTot, 0.05, 0.7),
      mc(pHSEqual / hsfTot, 0.05, 0.6),
    ],
    1.1,
  );

  // ── HT Correct Score ─────────────────────────────────────────────────────
  // Uses htPH/htPA (λ*0.45): scores 0-0..3-3 + Other; top 9 + Other
  const htCSScores: Array<[string, number]> = [];
  let htCSOther = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = (htPH[i] ?? 0) * (htPA[j] ?? 0);
      if (i <= 3 && j <= 3) htCSScores.push([`${i}-${j}`, p]);
      else htCSOther += p;
    }
  }
  htCSScores.sort((a, b) => b[1] - a[1]);
  const htCSTop = htCSScores.slice(0, 9);
  const htCSTotal = Math.max(
    1e-9,
    htCSTop.reduce((s, x) => s + x[1], 0) + htCSOther,
  );
  const htCSodds = probsToDecimalOdds(
    htCSTop.map((s) => mc(s[1] / htCSTotal, 0.005, 0.7)),
    1.14,
  );
  const htCorrectScore: Record<string, number> = {};
  htCSTop.forEach(([score], idx) => {
    htCorrectScore[score] = htCSodds[idx]!;
  });
  htCorrectScore["Outro"] = mr(
    mc(1 / mc(htCSOther / htCSTotal / 1.14, 0.005, 0.6), 1.01, 500),
  );

  // ── 2nd Half Correct Score ────────────────────────────────────────────────
  // Uses h2PH/h2PA (λ*0.55, size 8): scores 0-0..3-3 + Other
  const h2CSScores: Array<[string, number]> = [];
  let h2CSOther = 0;
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      const p = (h2PH[i] ?? 0) * (h2PA[j] ?? 0);
      if (i <= 3 && j <= 3) h2CSScores.push([`${i}-${j}`, p]);
      else h2CSOther += p;
    }
  }
  h2CSScores.sort((a, b) => b[1] - a[1]);
  const h2CSTop = h2CSScores.slice(0, 9);
  const h2CSTotal = Math.max(
    1e-9,
    h2CSTop.reduce((s, x) => s + x[1], 0) + h2CSOther,
  );
  const h2CSodds = probsToDecimalOdds(
    h2CSTop.map((s) => mc(s[1] / h2CSTotal, 0.005, 0.7)),
    1.14,
  );
  const h2CorrectScore: Record<string, number> = {};
  h2CSTop.forEach(([score], idx) => {
    h2CorrectScore[score] = h2CSodds[idx]!;
  });
  h2CorrectScore["Outro"] = mr(
    mc(1 / mc(h2CSOther / h2CSTotal / 1.14, 0.005, 0.6), 1.01, 500),
  );

  // ── Team Goals O/U ────────────────────────────────────────────────────────
  const tgPair = (pOver: number): [number, number] => {
    const safe = mc(pOver, 0.02, 0.98);
    const r = probsToDecimalOdds([safe, 1 - safe], 1.065);
    return [r[0]!, r[1]!];
  };
  const [tgHo05, tgHu05] = tgPair(1 - Math.exp(-lambdaHome));
  const [tgHo15, tgHu15] = tgPair(1 - poissonCdf(lambdaHome, 1));
  const [tgHo25, tgHu25] = tgPair(1 - poissonCdf(lambdaHome, 2));
  const [tgAo05, tgAu05] = tgPair(1 - Math.exp(-lambdaAway));
  const [tgAo15, tgAu15] = tgPair(1 - poissonCdf(lambdaAway, 1));
  const [tgAo25, tgAu25] = tgPair(1 - poissonCdf(lambdaAway, 2));

  return {
    doubleChance: { homeOrDraw: dcHD!, awayOrDraw: dcDA!, homeOrAway: dcHA! },
    bothTeamsScore: { yes: bttsYes!, no: bttsNo! },
    totalGoals: {
      over05: o05!,
      under05: u05!,
      over15: o15!,
      under15: u15!,
      over25: o25!,
      under25: u25!,
      over35: o35!,
      under35: u35!,
      over45: o45!,
      under45: u45!,
      over55: o55!,
      under55: u55!,
      over65: o65!,
      under65: u65!,
    },
    handicap: {
      homeMinusOne: hm1H!,
      awayPlusOne: hm1A!,
      homeMinusOneHalf: hm15H!,
      awayPlusOneHalf: hm15A!,
    },
    halfTime: { home: htH!, draw: htX!, away: htA! },
    secondHalf: { home: sh2OddsH!, draw: sh2OddsX!, away: sh2OddsA! },
    firstGoal: { home: fgH!, noGoal: fgNG!, away: fgA! },
    drawNoBet: { home: dnbH!, away: dnbA! },
    asianHandicap: { line: ahLine, home: ahH!, away: ahA! },
    asianTotals: {
      o05: o05!,
      u05: u05!,
      o45: o45!,
      u45: u45!,
      o55: o55!,
      u55: u55!,
      o225: o225!,
      u225: u225!,
      o275: o275!,
      u275: u275!,
    },
    htft: {
      hh: htftOdds[0]!,
      hd: htftOdds[1]!,
      ha: htftOdds[2]!,
      dh: htftOdds[3]!,
      dd: htftOdds[4]!,
      da: htftOdds[5]!,
      ah: htftOdds[6]!,
      ad: htftOdds[7]!,
      aa: htftOdds[8]!,
    },
    correctScore,
    corners: {
      o85: oc85!,
      u85: uc85!,
      o95: oc95!,
      u95: uc95!,
      o105: oc105!,
      u105: uc105!,
    },
    cards: { o35: ocard35!, u35: ucard35!, o45: ocard45!, u45: ucard45! },
    winToNil: { home: wtnHOdds, away: wtnAOdds },
    cleanSheet: { home: csHOdds, away: csAOdds },
    goalOddEven: { odd: goalOddO!, even: goalEvenO! },
    exactGoals: {
      g0: egOddsArr[0]!,
      g1: egOddsArr[1]!,
      g2: egOddsArr[2]!,
      g3: egOddsArr[3]!,
      g4: egOddsArr[4]!,
      g5plus: egOddsArr[5]!,
    },
    btts1H: { yes: b1HYes!, no: b1HNo! },
    btts2H: { yes: b1HYes!, no: b1HNo! },
    toWinBothHalves: { home: wbhHOdds, away: wbhAOdds },
    highestScoringHalf: {
      first: hsfFirstO!,
      second: hsfSecondO!,
      equal: hsfEqualO!,
    },
    htCorrectScore,
    h2CorrectScore,
    teamGoals: {
      homeOver05: tgHo05,
      homeUnder05: tgHu05,
      homeOver15: tgHo15,
      homeUnder15: tgHu15,
      homeOver25: tgHo25,
      homeUnder25: tgHu25,
      awayOver05: tgAo05,
      awayUnder05: tgAu05,
      awayOver15: tgAo15,
      awayUnder15: tgAu15,
      awayOver25: tgAo25,
      awayUnder25: tgAu25,
    },
  };
}

// ─── Tennis extras helper ─────────────────────────────────────────────────────
function computeTennisExtras(
  p: number,
  overrides?: {
    set1H?: number;
    set1A?: number;
    oSets?: number;
    uSets?: number;
    set2H?: number;
    set2A?: number;
    xh20?: number;
    xh21?: number;
    xa02?: number;
    xa12?: number;
    gamesLine?: number;
    gamesLineRound?: number;
    oGames?: number;
    uGames?: number;
    hcapH?: number;
    hcapA?: number;
  },
) {
  p = Math.min(0.92, Math.max(0.08, p));
  const sp = Math.min(0.88, Math.max(0.12, 0.5 + (p - 0.5) * 1.25));
  const sp3 = Math.min(0.82, Math.max(0.18, 0.5 + (p - 0.5) * 0.75));

  const raw20 = sp * sp;
  const raw21 = Math.max(0.005, p - raw20);
  const raw02 = (1 - sp) * (1 - sp);
  const raw12 = Math.max(0.005, 1 - p - raw02);
  const pThreeSets = raw21 + raw12;

  const ssTotal = raw20 + raw21 + raw02 + raw12;
  const [es20, es21, es02, es12] = probsToDecimalOdds(
    [raw20 / ssTotal, raw21 / ssTotal, raw02 / ssTotal, raw12 / ssTotal],
    1.1,
  );

  const [fsh, fsa] = probsToDecimalOdds(
    [mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)],
    1.06,
  );
  const [s2h, s2a] = probsToDecimalOdds(
    [mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)],
    1.07,
  );
  const [s3h, s3a] = probsToDecimalOdds(
    [mc(sp3, 0.08, 0.92), mc(1 - sp3, 0.08, 0.92)],
    1.09,
  );
  const [shhm15, shaw15] = probsToDecimalOdds(
    [mc(raw20, 0.02, 0.98), mc(1 - raw20, 0.02, 0.98)],
    1.06,
  );

  const expGames = 21 * (1 - pThreeSets) + 32 * pThreeSets;
  const logCdfG = (x: number) => 1 / (1 + Math.exp(-(x - expGames) / 4.5));
  const gLines = [19.5, 20.5, 21.5, 22.5, 23.5];
  const totalGamesLines = gLines.map((line) => {
    const pU = logCdfG(line);
    const [o, u] = probsToDecimalOdds(
      [mc(1 - pU, 0.02, 0.98), mc(pU, 0.02, 0.98)],
      1.07,
    );
    return { line, over: o!, under: u! };
  });
  const mainGamesLine = totalGamesLines[2]!;

  const set1LineApprox =
    Math.round((9.5 + (1 - Math.abs(sp - 0.5) * 2) * 2) * 2) / 2;
  const pS1Over = mc(0.35 + (0.5 - Math.abs(sp - 0.5)) * 0.3, 0.1, 0.9);
  const [s1go, s1gu] = probsToDecimalOdds([pS1Over, 1 - pS1Over], 1.07);

  const gameDiff = (sp - 0.5) * 8;
  const ghLine = Math.round(gameDiff * 2) / 2;
  const pGHHome = mc(0.5 + (sp - 0.5) * 0.3, 0.05, 0.95);
  const [ghH, ghA] = probsToDecimalOdds([pGHHome, 1 - pGHHome], 1.06);

  // Calculate pGameHomeWin: given pSetHomeWin, estimate probability of winning a single game
  // Using the relation between set win probability and game win probability
  const calculatePGameFromPSet = (pSet: number): number => {
    let low = 0.01, high = 0.99;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const prob = calculateSetWinProbability(mid);
      if (prob < pSet) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (low + high) / 2;
  };

  const calculateSetWinProbability = (pGame: number): number => {
    let p = 0;
    // Probability of winning 6-0 to 6-4
    for (let k = 0; k <= 4; k++) {
      p += comb(5 + k, k) * Math.pow(pGame, 6) * Math.pow(1 - pGame, k);
    }
    // Probability of winning 7-5
    // First reach 5-5, then win 2 games in a row
    p += comb(10, 5) * Math.pow(pGame, 5) * Math.pow(1 - pGame, 5) * pGame * pGame;
    // Probability of winning 7-6
    // First reach 6-6 (each wins 6 out of first 12 games), then win the tiebreak
    // For tiebreak, assume pGame is the probability of winning a tiebreak point, so overall
    // probability of winning tiebreak is approximately (pGame^2) / (pGame^2 + (1-pGame)^2)
    // but let's use a simple approximation: pGame (for simplicity)
    const p66 = comb(12, 6) * Math.pow(pGame, 6) * Math.pow(1 - pGame, 6);
    // Probability of winning tiebreak from 6-6: assume pTiebreak = pGame (simplified)
    const pTiebreak = pGame;
    p += p66 * pTiebreak;
    return p;
  };

  const pGameHome = calculatePGameFromPSet(sp);

  // Pre-match exact set score odds
  const preMatchSetExactScore = computeSetExactScoreOdds(0, 0, sp, 0.27, pGameHome);
  const preMatchScoreList = canonicalTennisSetScoreOrder(
    Object.entries(preMatchSetExactScore).map(([label, odds]) => ({
      label,
      odds,
    })),
  );

  return {
    firstSet: {
      home: overrides?.set1H ?? fsh!,
      away: overrides?.set1A ?? fsa!,
    },
    set2: { home: overrides?.set2H ?? s2h!, away: overrides?.set2A ?? s2a! },
    set3: { home: s3h!, away: s3a! },
    exactSets: {
      h20: overrides?.xh20 ?? es20!,
      h21: overrides?.xh21 ?? es21!,
      a02: overrides?.xa02 ?? es02!,
      a12: overrides?.xa12 ?? es12!,
    },
    setHandicap: { home: shhm15!, away: shaw15! },
    totalGames: {
      line: overrides?.gamesLineRound ?? mainGamesLine.line,
      over: overrides?.oGames ?? mainGamesLine.over,
      under: overrides?.uGames ?? mainGamesLine.under,
    },
    totalGamesLines: totalGamesLines.map((entry) =>
      capTennisLiveOverUnderOdds(entry),
    ),
    set1Games: { line: set1LineApprox, over: s1go!, under: s1gu! },
    setExactScore: preMatchSetExactScore,
    set1ExactScore: preMatchSetExactScore,
    set2ExactScore: computeSetExactScoreOdds(0, 0, sp, 0.27, pGameHome),
    score1st: preMatchScoreList,
    score2nd: preMatchScoreList,
    gameHandicap: {
      line: overrides?.gamesLine ?? ghLine,
      home: overrides?.hcapH ?? ghH!,
      away: overrides?.hcapA ?? ghA!,
    },
  };
}

function tennisPointValue(value: number | string | undefined): number {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "AD" || normalized === "A") return 4;
  if (normalized === "D" || normalized === "40A") return 3;
  if (normalized === "40") return 3;
  if (normalized === "30") return 2;
  if (normalized === "15") return 1;
  return 0;
}

function getTennisLivePointContext(
  currentPoints?: [number | string, number | string],
  serving?: [boolean, boolean],
): {
  homePoints: number;
  awayPoints: number;
  pointDiff: number;
  servingBias: number;
  pressure: number;
  swing: number;
  homeTrailing: boolean;
  awayTrailing: boolean;
} {
  const homePoints = tennisPointValue(currentPoints?.[0]);
  const awayPoints = tennisPointValue(currentPoints?.[1]);
  const pointDiff = homePoints - awayPoints;
  const servingBias = serving?.[0] ? 0.35 : serving?.[1] ? -0.35 : 0;
  const pressure =
    homePoints >= 3 || awayPoints >= 3
      ? 1.2
      : homePoints + awayPoints >= 4
        ? 1.08
        : 1;
  const swing = mc(
    (pointDiff * 0.052 + servingBias * 0.026) * pressure,
    -0.22,
    0.22,
  );
  return {
    homePoints,
    awayPoints,
    pointDiff,
    servingBias,
    pressure,
    swing,
    homeTrailing: pointDiff < 0,
    awayTrailing: pointDiff > 0,
  };
}

function computeTennisFallbackLiveOdds(
  baseOdds: { home: number; draw: number; away: number },
  sets: Array<[number, number]>,
  homeScore: number,
  awayScore: number,
  currentPoints?: [number | string, number | string],
  serving?: [boolean, boolean],
): { home: number; draw: number; away: number } {
  const currentSet =
    sets.length > 0 ? (sets[sets.length - 1] ?? [0, 0]) : [0, 0];
  const gamesDiff = (currentSet[0] ?? 0) - (currentSet[1] ?? 0);
  const setsDiff = homeScore - awayScore;

  // A flat per-game weight badly under-reacts once a player is close to
  // converting the current set (e.g. leading 5-3): being 1 game from taking
  // a set that would decide the match is worth far more than an early 2-0
  // lead, even though both are "2 games ahead". Scale the game-lead term by
  // how close the leader is to the 6-game threshold to capture that.
  const leaderGames = Math.max(currentSet[0] ?? 0, currentSet[1] ?? 0);
  const gamesToClose = Math.max(1, 6 - leaderGames);
  const closingBoost = gamesDiff !== 0 ? 1 / gamesToClose : 0;

  // Point/serve context is handled entirely by computeTennisPointAdjustedOdds
  // (applied right after this), so it's intentionally not folded in here too
  // — doing it in both places double-counted the same signal.
  // 1 set > proximity-weighted games. This keeps live tennis prices moving
  // on game-by-game progress without creating wild jumps every rally.
  const advantage =
    setsDiff * 0.22 + gamesDiff * 0.042 + gamesDiff * 0.1 * closingBoost;
  const factor = Math.min(0.55, Math.abs(advantage));

  if (factor <= 0) return baseOdds;
  if (advantage > 0) {
    return {
      home: Math.max(1.01, +(baseOdds.home * (1 - factor)).toFixed(2)),
      draw: 0,
      away: Math.min(50, +(baseOdds.away * (1 + factor)).toFixed(2)),
    };
  }
  return {
    home: Math.min(50, +(baseOdds.home * (1 + factor)).toFixed(2)),
    draw: 0,
    away: Math.max(1.01, +(baseOdds.away * (1 - factor)).toFixed(2)),
  };
}

function computeTennisPointAdjustedOdds(
  anchorOdds: { home: number; draw: number; away: number },
  currentPoints?: [number | string, number | string],
  serving?: [boolean, boolean],
): { home: number; draw: number; away: number } {
  const hPt = tennisPointValue(currentPoints?.[0]);
  const aPt = tennisPointValue(currentPoints?.[1]);
  const ptDiff = hPt - aPt;
  const servingBonus = serving?.[0] ? 0.6 : serving?.[1] ? -0.6 : 0;
  const pressure = hPt >= 3 || aPt >= 3 ? 1.15 : 1;
  const factor = Math.min(
    0.12,
    Math.abs(ptDiff * 0.018 + servingBonus * 0.01) * pressure,
  );

  if (factor <= 0) return anchorOdds;
  if (ptDiff + servingBonus > 0) {
    return {
      home: Math.max(1.01, +(anchorOdds.home * (1 - factor)).toFixed(2)),
      draw: 0,
      away: Math.min(50, +(anchorOdds.away * (1 + factor)).toFixed(2)),
    };
  }
  return {
    home: Math.min(50, +(anchorOdds.home * (1 + factor)).toFixed(2)),
    draw: 0,
    away: Math.max(1.01, +(anchorOdds.away * (1 - factor)).toFixed(2)),
  };
}

function capTennisLiveOdd(rawOdd: number, allowExtended = false): number {
  if (!Number.isFinite(rawOdd) || rawOdd <= 0) return 0;
  const odd = Math.max(1.01, +rawOdd.toFixed(2));
  const cap = allowExtended ? 20 : 10;
  return odd <= cap ? odd : cap;
}

function capTennisLiveHomeAwayOdds(
  market: { home: number; away: number },
  homeExtended: boolean,
  awayExtended: boolean,
): { home: number; away: number } {
  return {
    home: capTennisLiveOdd(market.home, homeExtended),
    away: capTennisLiveOdd(market.away, awayExtended),
  };
}

function computeTennisLiveOdds(
  baseOdds: { home: number; draw: number; away: number },
  sets: Array<[number, number]>,
  homeScore: number,
  awayScore: number,
  currentPoints?: [number | string, number | string],
  serving?: [boolean, boolean],
  realLiveOdds?: { home: number; away: number },
): {
  odds: { home: number; draw: number; away: number };
  hasRealOdds: boolean;
} {
  const pointCtx = getTennisLivePointContext(currentPoints, serving);
  if (realLiveOdds && realLiveOdds.home > 1.001 && realLiveOdds.away > 1.001) {
    // Provider live odds already include current point/server context; do not
    // apply the point-adjustment layer a second time or prices become distorted.
    const cappedProviderOdds = capTennisLiveHomeAwayOdds(
      {
        home: +realLiveOdds.home.toFixed(2),
        away: +realLiveOdds.away.toFixed(2),
      },
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    );
    return {
      odds: {
        home: cappedProviderOdds.home,
        draw: 0,
        away: cappedProviderOdds.away,
      },
      hasRealOdds: true,
    };
  }

  const anchorOdds = computeTennisFallbackLiveOdds(
    baseOdds,
    sets,
    homeScore,
    awayScore,
    currentPoints,
    serving,
  );
  const adjustedOdds = computeTennisPointAdjustedOdds(
    anchorOdds,
    currentPoints,
    serving,
  );
  const cappedOdds = capTennisLiveHomeAwayOdds(
    adjustedOdds,
    pointCtx.homeTrailing,
    pointCtx.awayTrailing,
  );
  return {
    odds: { home: cappedOdds.home, draw: 0, away: cappedOdds.away },
    hasRealOdds: false,
  };
}

function capTennisLiveOverUnderOdds(
  market: { line: number; over: number; under: number },
  overExtended = false,
  underExtended = false,
): { line: number; over: number; under: number } {
  return {
    line: market.line,
    over: capTennisLiveOdd(market.over, overExtended),
    under: capTennisLiveOdd(market.under, underExtended),
  };
}

function capTennisLiveYesNoOdds(
  market: { yes: number; no: number },
  yesExtended = false,
  noExtended = false,
): { yes: number; no: number } {
  return {
    yes: capTennisLiveOdd(market.yes, yesExtended),
    no: capTennisLiveOdd(market.no, noExtended),
  };
}

function capTennisLiveOddEvenOdds(market: { odd: number; even: number }): {
  odd: number;
  even: number;
} {
  return {
    odd: capTennisLiveOdd(market.odd),
    even: capTennisLiveOdd(market.even),
  };
}

function capTennisLiveScoreMap(
  scores: Record<string, number>,
  _homeExtended: boolean,
  _awayExtended: boolean,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(scores).map(([label, odd]) => [
      label,
      clampTennisSetCorrectScoreOdd(odd),
    ]),
  );
}

function capTennisLiveScoreList(
  scores: Array<{ label: string; odds: number }>,
  _homeExtended: boolean,
  _awayExtended: boolean,
): Array<{ label: string; odds: number }> {
  return scores.map((entry) => ({
    ...entry,
    odds: clampTennisSetCorrectScoreOdd(entry.odds),
  }));
}

// ─── Tennis Set Exact Score helper ────────────────────────────────────────────
// Computes exact-score odds for the CURRENT tennis set given the current game
// score (hg home games won, ag away games won in this set).  Uses a negative-
// binomial "race to win" model where each game is an independent Bernoulli
// trial with P(home wins game) = pGame.  Scores already ruled out by the
// current score are excluded and remaining probabilities are renormalised.
const TENNIS_SET_CORRECT_SCORE_HARD_CAP = 100;

function clampTennisSetCorrectScoreOdd(rawOdd: number): number {
  const odd = Math.max(1.01, +rawOdd.toFixed(2));
  if (odd <= 50) return odd;
  // Soft compression above 50: allows extreme scores (6-0 for underdog) to reach ~100-150
  // 60→54  80→63  100→70  150→87  250→107  500→130  cap 150
  const compressed = 50 + (odd - 50) * (100 / (100 + (odd - 50)));
  return +Math.min(TENNIS_SET_CORRECT_SCORE_HARD_CAP, compressed).toFixed(2);
}

const TENNIS_SET_SCORE_HOME_TEMPLATE: Array<{
  score: [number, number];
  weight: number;
}> = [
  // Calibrated to match real bookmaker distributions (reference: 39.5% overround market).
  // Within winner block: 6-3/6-4 most common; 7-6 (tiebreak) more common than 7-5.
  { score: [6, 0], weight: 0.04 },
  { score: [6, 1], weight: 0.12 },
  { score: [6, 2], weight: 0.18 },
  { score: [6, 3], weight: 0.22 },
  { score: [6, 4], weight: 0.21 },
  { score: [7, 5], weight: 0.08 },
  { score: [7, 6], weight: 0.15 },
];

const TENNIS_SET_SCORE_AWAY_TEMPLATE: Array<{
  score: [number, number];
  weight: number;
}> = TENNIS_SET_SCORE_HOME_TEMPLATE.map((entry) => ({
  score: [entry.score[1], entry.score[0]],
  weight: entry.weight,
}));

function buildTennisSetScoreTemplate(
  baseTemplate: Array<{ score: [number, number]; weight: number }>,
  pWinner: number,
  currentGamesWon: number,
  currentGamesLost: number,
  winnerMomentum = 0,
): Array<{ score: [number, number]; weight: number }> {
  const dominance = mc(Math.abs(pWinner - 0.5) * 2, 0, 1);
  const setProgress = mc((currentGamesWon + currentGamesLost) / 12, 0, 1);
  const scoreTightness = mc(
    1 - Math.abs(currentGamesWon - currentGamesLost) / 4,
    0,
    1,
  );
  const closeSetBias = mc(scoreTightness * 0.65 + setProgress * 0.35, 0, 1);
  const momentumBias = mc(winnerMomentum, -0.18, 0.18);

  return baseTemplate.map((entry) => {
    const [winnerGames, loserGames] = entry.score;
    const margin = winnerGames - loserGames;
    const isTiebreak = winnerGames === 7 && loserGames === 6;
    const isSevenFive = winnerGames === 7 && loserGames === 5;
    const isStraightBeatdown = winnerGames === 6 && loserGames <= 2;
    const isBalancedWin =
      winnerGames === 6 && (loserGames === 3 || loserGames === 4);
    const isControlledWin = winnerGames === 6 && loserGames === 3;

    let multiplier = 1;
    if (isStraightBeatdown)
      multiplier *= 1 + dominance * 0.95 - closeSetBias * 0.35;
    else if (margin === 3)
      multiplier *= 1 + dominance * 0.45 - closeSetBias * 0.15;
    else if (isBalancedWin) multiplier *= 1 + closeSetBias * 0.18;
    else if (isSevenFive)
      multiplier *= 1 + closeSetBias * 0.45 - dominance * 0.12;
    else if (isTiebreak)
      multiplier *= 1 + closeSetBias * 0.62 - dominance * 0.18;
    else if (margin === 1)
      multiplier *= 1 + closeSetBias * 0.35 - dominance * 0.08;

    if (currentGamesWon >= 4 && currentGamesLost >= 4) {
      if (isSevenFive) multiplier *= 1.12;
      if (isTiebreak) multiplier *= 1.18;
      if (isStraightBeatdown) multiplier *= 0.9;
    }

    if (momentumBias > 0) {
      if (isStraightBeatdown) multiplier *= 1 + momentumBias * 1.1;
      else if (isControlledWin) multiplier *= 1 + momentumBias * 0.75;
      else if (winnerGames === 6 && loserGames === 4)
        multiplier *= 1 + momentumBias * 0.25;
      else if (isSevenFive) multiplier *= 1 - momentumBias * 0.08;
      else if (isTiebreak) multiplier *= 1 - momentumBias * 0.16;
    } else if (momentumBias < 0) {
      const antiMomentum = Math.abs(momentumBias);
      if (isSevenFive) multiplier *= 1 + antiMomentum * 0.16;
      if (isTiebreak) multiplier *= 1 + antiMomentum * 0.22;
      if (isStraightBeatdown) multiplier *= 1 - antiMomentum * 0.28;
    }

    return { ...entry, weight: Math.max(0.0001, entry.weight * multiplier) };
  });
}

function getTennisCompletedSetMomentum(
  sets: Array<[number, number]>,
  completedSetCount: number,
): number {
  const completed = sets.slice(0, Math.min(completedSetCount, sets.length));
  if (completed.length === 0) return 0;

  let momentum = 0;
  completed.forEach(([homeGames, awayGames], index) => {
    const winner = homeGames > awayGames ? 1 : awayGames > homeGames ? -1 : 0;
    if (winner === 0) return;

    const maxGames = Math.max(homeGames, awayGames);
    const minGames = Math.min(homeGames, awayGames);
    const margin = maxGames - minGames;
    const recencyWeight =
      0.7 + (index / Math.max(1, completed.length - 1)) * 0.45;
    const marginWeight =
      minGames <= 1
        ? 1.2
        : minGames === 2
          ? 0.95
          : minGames === 3
            ? 0.6
            : minGames === 4
              ? 0.35
              : minGames === 5
                ? 0.18
                : 0.1;
    const dominanceBoost =
      maxGames === 6 && minGames <= 2
        ? 0.05
        : maxGames === 6 && minGames === 3
          ? 0.025
          : 0;

    momentum +=
      winner * recencyWeight * (margin * 0.018 + marginWeight + dominanceBoost);
  });

  return mc(momentum, -0.18, 0.18);
}

function isFinishedTennisSetScore(
  homeGames: number,
  awayGames: number,
): boolean {
  if (homeGames > 7 || awayGames > 7) return false;
  if (homeGames === 7 || awayGames === 7) {
    return (
      (homeGames === 7 && (awayGames === 5 || awayGames === 6)) ||
      (awayGames === 7 && (homeGames === 5 || homeGames === 6))
    );
  }
  return (
    (homeGames === 6 && awayGames <= 4) || (awayGames === 6 && homeGames <= 4)
  );
}

/**
 * Calculate combination (n choose k)
 */
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}

function computeSetExactScoreTemplateDistribution(
  hg: number,
  ag: number,
  pSetHomeWin: number,
  homeMomentum = 0,
  awayMomentum = 0,
): Record<string, number> {
  const probs: Record<string, number> = {};
  const canStillFinishAs = ([homeFinal, awayFinal]: [
    number,
    number,
  ]): boolean => homeFinal >= hg && awayFinal >= ag;

  const homeTemplate = buildTennisSetScoreTemplate(
    TENNIS_SET_SCORE_HOME_TEMPLATE,
    pSetHomeWin,
    hg,
    ag,
    homeMomentum,
  );
  const awayTemplate = buildTennisSetScoreTemplate(
    TENNIS_SET_SCORE_AWAY_TEMPLATE,
    1 - pSetHomeWin,
    ag,
    hg,
    awayMomentum,
  );
  const validHomeScores = homeTemplate.filter((entry) =>
    canStillFinishAs(entry.score),
  );
  const validAwayScores = awayTemplate.filter((entry) =>
    canStillFinishAs(entry.score),
  );
  const homeWeightTotal = validHomeScores.reduce(
    (acc, entry) => acc + entry.weight,
    0,
  );
  const awayWeightTotal = validAwayScores.reduce(
    (acc, entry) => acc + entry.weight,
    0,
  );
  const homeBlockProb = mc(pSetHomeWin, 0.001, 0.999);
  const awayBlockProb = 1 - homeBlockProb;

  for (const entry of validHomeScores) {
    if (homeWeightTotal <= 0) break;
    const label = `${entry.score[0]}-${entry.score[1]}`;
    probs[label] = homeBlockProb * (entry.weight / homeWeightTotal);
  }
  for (const entry of validAwayScores) {
    if (awayWeightTotal <= 0) break;
    const label = `${entry.score[0]}-${entry.score[1]}`;
    probs[label] = awayBlockProb * (entry.weight / awayWeightTotal);
  }

  const total = Object.values(probs).reduce((acc, prob) => acc + prob, 0);
  if (total <= 0) return {};
  return Object.fromEntries(
    Object.entries(probs).map(([label, prob]) => [label, prob / total]),
  );
}

/**
 * Calculate exact set score probabilities from first principles using game probabilities
 */
function calculateExactSetScoreProbs(
  currentHg: number,
  currentAg: number,
  pGameHome: number,
): Record<string, number> {
  const memo = new Map<string, Record<string, number>>();

  const dp = (hg: number, ag: number): Record<string, number> => {
    const key = `${hg}-${ag}`;
    if (memo.has(key)) return memo.get(key)!;

    if (isFinishedTennisSetScore(hg, ag)) {
      const res = { [`${hg}-${ag}`]: 1 };
      memo.set(key, res);
      return res;
    }

    // Safety valve: a set can never reach 8+ games without being finished
    // (isFinishedTennisSetScore always resolves by 7-6). Malformed/unexpected
    // provider input (fractional or out-of-range scores) must never recurse
    // unbounded and crash the process — bail out with an empty distribution.
    if (hg > 7 || ag > 7) {
      memo.set(key, {});
      return {};
    }

    const result: Record<string, number> = {};
    const homeProbs = dp(hg + 1, ag);
    for (const [score, prob] of Object.entries(homeProbs)) {
      result[score] = (result[score] || 0) + prob * pGameHome;
    }
    const awayProbs = dp(hg, ag + 1);
    for (const [score, prob] of Object.entries(awayProbs)) {
      result[score] = (result[score] || 0) + prob * (1 - pGameHome);
    }

    memo.set(key, result);
    return result;
  };

  return dp(currentHg, currentAg);
}

function blendSetExactScoreDistributions(
  templateDist: Record<string, number>,
  pathDist: Record<string, number>,
  hg: number,
  ag: number,
): Record<string, number> {
  const labels = new Set([
    ...Object.keys(templateDist),
    ...Object.keys(pathDist),
  ]);
  if (labels.size === 0) return {};

  const gamesPlayed = hg + ag;
  const leaderGames = Math.max(hg, ag);
  const gameDiff = Math.abs(hg - ag);
  const progress = mc(gamesPlayed / 12, 0, 1);
  const lateSet = mc((leaderGames - 3) / 2, 0, 1);
  const closeoutWindow = mc(leaderGames - 4, 0, 1);
  const leadPressure = mc(gameDiff / 3, 0, 1);

  const stateBias = mc(
    progress * 0.24 +
      lateSet * 0.32 +
      closeoutWindow * 0.26 +
      leadPressure * 0.18,
    0,
    1,
  );

  const pathWeight =
    leaderGames >= 5
      ? mc(0.80 + stateBias * 0.15, 0.80, 0.95)
      : leaderGames === 4
        ? mc(0.65 + stateBias * 0.20, 0.65, 0.85)
        : mc(0.65 + stateBias * 0.20, 0.65, 0.85);

  const blended: Record<string, number> = {};
  for (const label of labels) {
    const templateProb = templateDist[label] ?? 0;
    const pathProb = pathDist[label] ?? 0;
    const prob = templateProb * (1 - pathWeight) + pathProb * pathWeight;
    if (prob > 0) blended[label] = prob;
  }

  const total = Object.values(blended).reduce((acc, prob) => acc + prob, 0);
  if (total <= 0) return {};
  return Object.fromEntries(
    Object.entries(blended).map(([label, prob]) => [label, prob / total]),
  );
}

function estimateTennisLiveGameWinProb(
  liveHomeP: number,
  currentPoints?: [number | string, number | string],
  serving?: [boolean, boolean],
): number {
  const pointCtx = getTennisLivePointContext(currentPoints, serving);
  return Math.min(
    0.85,
    Math.max(0.15, 0.5 + (liveHomeP - 0.5) * 0.8 + pointCtx.swing * 0.7),
  );
}

function computeSetExactScoreDistribution(
  hg: number,
  ag: number,
  pSetHomeWin: number,
  pGameHomeWin?: number,
  homeMomentum = 0,
  awayMomentum = 0,
): Record<string, number> {
  const templateDist = computeSetExactScoreTemplateDistribution(
    hg,
    ag,
    pSetHomeWin,
    homeMomentum,
    awayMomentum,
  );
  if (pGameHomeWin == null) return templateDist;
  const pathDist = calculateExactSetScoreProbs(hg, ag, mc(pGameHomeWin, 0.05, 0.95));
  if (Object.keys(pathDist).length === 0) return templateDist;
  return blendSetExactScoreDistributions(templateDist, pathDist, hg, ag);
}

function computeLiveTennisExtras(
  liveHomeP: number,
  sets: Array<[number, number]>,
  homeSetsWon: number,
  awaySetsWon: number,
  setNum: number,
  currentPoints?: [number | string, number | string],
  serving?: [boolean, boolean],
): AdvancedMarkets["tennisExtra"] {
  const baseExtras = computeTennisExtras(liveHomeP);
  const pointCtx = getTennisLivePointContext(currentPoints, serving);
  const completedSetMomentum = getTennisCompletedSetMomentum(
    sets,
    homeSetsWon + awaySetsWon,
  );
  const homeSetScoreMomentum = Math.max(0, completedSetMomentum);
  const awaySetScoreMomentum = Math.max(0, -completedSetMomentum);
  const pFreshSetHome = Math.min(
    0.88,
    Math.max(
      0.12,
      0.5 +
        (liveHomeP - 0.5) * 1.25 +
        pointCtx.swing * 0.35 +
        completedSetMomentum,
    ),
  );
  const pGame = estimateTennisLiveGameWinProb(
    liveHomeP,
    currentPoints,
    serving,
  );
  const liveSetWinProb = (hG: number, aG: number, base: number): number =>
    Math.min(
      0.97,
      Math.max(
        0.03,
        0.5 +
          (base - 0.5) * 0.55 +
          (hG - aG) * 0.055 +
          pointCtx.swing * 0.45 +
          completedSetMomentum * (hG === 0 && aG === 0 ? 0.7 : 0.35),
      ),
    );
  const probToHomeAway = (
    probHome: number,
    margin: number,
  ): { home: number; away: number } => {
    const [home, away] = probsToDecimalOdds(
      [mc(probHome, 0.02, 0.98), mc(1 - probHome, 0.02, 0.98)],
      margin,
    );
    return { home: home!, away: away! };
  };
  const probToYesNo = (
    probYes: number,
    margin: number,
  ): { yes: number; no: number } => {
    const [yes, no] = probsToDecimalOdds(
      [mc(probYes, 0.02, 0.98), mc(1 - probYes, 0.02, 0.98)],
      margin,
    );
    return { yes: yes!, no: no! };
  };
  const currentSetIndex = Math.max(
    0,
    Math.min(sets.length - 1, homeSetsWon + awaySetsWon),
  );
  const currentSetGames = sets[currentSetIndex] ?? ([0, 0] as [number, number]);
  const currentSetHomeWinProb = liveSetWinProb(
    currentSetGames[0],
    currentSetGames[1],
    liveHomeP,
  );
  const currentSetDist = computeSetExactScoreDistribution(
    currentSetGames[0],
    currentSetGames[1],
    currentSetHomeWinProb,
    pGame,
    homeSetScoreMomentum,
    awaySetScoreMomentum,
  );
  const currentSetScore = computeSetExactScoreOdds(
    currentSetGames[0],
    currentSetGames[1],
    currentSetHomeWinProb,
    0.22,
    pGame,
    homeSetScoreMomentum,
    awaySetScoreMomentum,
  );
  const expectedCurrentSetTotalGames =
    Object.keys(currentSetDist).length > 0
      ? Object.entries(currentSetDist).reduce((acc, [label, prob]) => {
          const [h, a] = label.split("-").map(Number);
          return acc + ((h ?? 0) + (a ?? 0)) * prob;
        }, 0)
      : Math.max(currentSetGames[0] + currentSetGames[1] + 2, 9.5);
  const expectedCurrentSetHomeGames =
    Object.keys(currentSetDist).length > 0
      ? Object.entries(currentSetDist).reduce((acc, [label, prob]) => {
          const [h] = label.split("-").map(Number);
          return acc + (h ?? 0) * prob;
        }, 0)
      : expectedCurrentSetTotalGames * (0.5 + (pFreshSetHome - 0.5) * 0.55);
  const expectedCurrentSetAwayGames = Math.max(
    0,
    expectedCurrentSetTotalGames - expectedCurrentSetHomeGames,
  );
  const freshSetExpectedGames = Math.max(
    8.5,
    Number(baseExtras.set1Games.line) || 9.5,
  );
  const freshSetHomeGames =
    freshSetExpectedGames * (0.5 + (pFreshSetHome - 0.5) * 0.55);
  const freshSetAwayGames = Math.max(
    0,
    freshSetExpectedGames - freshSetHomeGames,
  );
  const completedGamesBeforeCurrent = sets
    .slice(0, Math.min(homeSetsWon + awaySetsWon, sets.length))
    .reduce((acc, [h, a]) => acc + h + a, 0);
  const completedHomeGames = sets
    .slice(0, Math.min(homeSetsWon + awaySetsWon, sets.length))
    .reduce((acc, [h]) => acc + h, 0);
  const completedAwayGames = sets
    .slice(0, Math.min(homeSetsWon + awaySetsWon, sets.length))
    .reduce((acc, [, a]) => acc + a, 0);

  let exactSetsProbs = { h20: 0, h21: 0, a02: 0, a12: 0 };
  if (homeSetsWon >= 2) {
    exactSetsProbs =
      awaySetsWon === 0
        ? { h20: 1, h21: 0, a02: 0, a12: 0 }
        : { h20: 0, h21: 1, a02: 0, a12: 0 };
  } else if (awaySetsWon >= 2) {
    exactSetsProbs =
      homeSetsWon === 0
        ? { h20: 0, h21: 0, a02: 1, a12: 0 }
        : { h20: 0, h21: 0, a02: 0, a12: 1 };
  } else if (homeSetsWon === 0 && awaySetsWon === 0) {
    const pc = currentSetHomeWinProb;
    const pf = pFreshSetHome;
    exactSetsProbs = {
      h20: pc * pf,
      h21: pc * (1 - pf) * pf + (1 - pc) * pf * pf,
      a02: (1 - pc) * (1 - pf),
      a12: pc * (1 - pf) * (1 - pf) + (1 - pc) * pf * (1 - pf),
    };
  } else if (homeSetsWon === 1 && awaySetsWon === 0) {
    const pc = currentSetHomeWinProb;
    const pf = pFreshSetHome;
    exactSetsProbs = {
      h20: pc,
      h21: (1 - pc) * pf,
      a02: 0,
      a12: (1 - pc) * (1 - pf),
    };
  } else if (homeSetsWon === 0 && awaySetsWon === 1) {
    const pc = currentSetHomeWinProb;
    const pf = pFreshSetHome;
    exactSetsProbs = { h20: 0, h21: pc * pf, a02: 1 - pc, a12: pc * (1 - pf) };
  } else if (homeSetsWon === 1 && awaySetsWon === 1) {
    exactSetsProbs = {
      h20: 0,
      h21: currentSetHomeWinProb,
      a02: 0,
      a12: 1 - currentSetHomeWinProb,
    };
  }
  const exactTotal =
    Object.values(exactSetsProbs).reduce((a, b) => a + b, 0) || 1;
  const [xh20, xh21, xa02, xa12] = probsToDecimalOdds(
    [
      mc(exactSetsProbs.h20 / exactTotal, 0.001, 0.999),
      mc(exactSetsProbs.h21 / exactTotal, 0.001, 0.999),
      mc(exactSetsProbs.a02 / exactTotal, 0.001, 0.999),
      mc(exactSetsProbs.a12 / exactTotal, 0.001, 0.999),
    ],
    1.1,
  );

  // Total Sets Over/Under 2.5 — this model only ever produces a 2-set or
  // 3-set match (h20/a02 = 2 sets, h21/a12 = 3 sets; best-of-3 is the only
  // shape exactSetsProbs above computes), so "under 2.5" is exactly
  // h20+a02 and "over 2.5" is exactly h21+a12, reusing the same
  // probabilities already computed for the exact-sets market instead of a
  // separate model. This previously fell through unchanged from
  // computeTennisExtras's static pre-match estimate (spread via
  // ...baseExtras below) — frozen for the entire live match regardless of
  // score, which is why it stayed near a coinflip price even with a player
  // one point from closing the match in straight sets, or a set from
  // forcing a decider. Reported in production (2026-08-10).
  const pUnder25Sets = mc(
    (exactSetsProbs.h20 + exactSetsProbs.a02) / exactTotal,
    0.02,
    0.98,
  );
  const pOver25Sets = mc(
    (exactSetsProbs.h21 + exactSetsProbs.a12) / exactTotal,
    0.02,
    0.98,
  );
  const [over25Sets, under25Sets] = probsToDecimalOdds(
    [pOver25Sets, pUnder25Sets],
    1.07,
  );

  const futureSetsAfterCurrent =
    homeSetsWon === 0 && awaySetsWon === 0
      ? 1 +
        currentSetHomeWinProb * (1 - pFreshSetHome) +
        (1 - currentSetHomeWinProb) * pFreshSetHome
      : homeSetsWon === 1 && awaySetsWon === 0
        ? 1 - currentSetHomeWinProb
        : homeSetsWon === 0 && awaySetsWon === 1
          ? currentSetHomeWinProb
          : 0;
  const expectedTotalGames =
    completedGamesBeforeCurrent +
    expectedCurrentSetTotalGames +
    futureSetsAfterCurrent * freshSetExpectedGames;
  const expectedHomeGames =
    completedHomeGames +
    expectedCurrentSetHomeGames +
    futureSetsAfterCurrent * freshSetHomeGames;
  const expectedAwayGames =
    completedAwayGames +
    expectedCurrentSetAwayGames +
    futureSetsAfterCurrent * freshSetAwayGames;
  const totalGamesLines = baseExtras.totalGamesLines.map((entry) => {
    const pUnder =
      1 / (1 + Math.exp(-(entry.line - expectedTotalGames) / 2.15));
    const [over, under] = probsToDecimalOdds(
      [mc(1 - pUnder, 0.02, 0.98), mc(pUnder, 0.02, 0.98)],
      1.07,
    );
    return { line: entry.line, over: over!, under: under! };
  });
  const totalGames =
    totalGamesLines.find((entry) => entry.line === 21.5) ??
    totalGamesLines[Math.floor(totalGamesLines.length / 2)]!;
  const set1GamesLine = Number(baseExtras.set1Games.line) || 9.5;
  const set2GamesLine = Math.max(
    8.5,
    Math.round((freshSetExpectedGames - 0.5) * 2) / 2,
  );
  const set1GamesProbOver =
    currentSetIndex === 0
      ? Object.entries(currentSetDist).reduce((acc, [label, prob]) => {
          const [h, a] = label.split("-").map(Number);
          return acc + ((h ?? 0) + (a ?? 0) > set1GamesLine ? prob : 0);
        }, 0.5)
      : sets[0]
        ? sets[0][0] + sets[0][1] > set1GamesLine
          ? 0.99
          : 0.01
        : 0.5;
  const set2GamesProbOver =
    currentSetIndex === 1
      ? Object.entries(currentSetDist).reduce((acc, [label, prob]) => {
          const [h, a] = label.split("-").map(Number);
          return acc + ((h ?? 0) + (a ?? 0) > set2GamesLine ? prob : 0);
        }, 0.5)
      : sets[1]
        ? sets[1][0] + sets[1][1] > set2GamesLine
          ? 0.99
          : 0.01
        : 0.5;
  const [s1go, s1gu] = probsToDecimalOdds(
    [mc(set1GamesProbOver, 0.02, 0.98), mc(1 - set1GamesProbOver, 0.02, 0.98)],
    1.07,
  );
  const [s2go, s2gu] = probsToDecimalOdds(
    [mc(set2GamesProbOver, 0.02, 0.98), mc(1 - set2GamesProbOver, 0.02, 0.98)],
    1.07,
  );

  const homePlayerLine = Math.max(6.5, Math.round(expectedHomeGames * 2) / 2);
  const awayPlayerLine = Math.max(6.5, Math.round(expectedAwayGames * 2) / 2);
  const homePlayerProbOver =
    1 / (1 + Math.exp(-(expectedHomeGames - homePlayerLine) / 1.4));
  const awayPlayerProbOver =
    1 / (1 + Math.exp(-(expectedAwayGames - awayPlayerLine) / 1.4));
  const [hpgOver, hpgUnder] = probsToDecimalOdds(
    [
      mc(homePlayerProbOver, 0.02, 0.98),
      mc(1 - homePlayerProbOver, 0.02, 0.98),
    ],
    1.07,
  );
  const [apgOver, apgUnder] = probsToDecimalOdds(
    [
      mc(awayPlayerProbOver, 0.02, 0.98),
      mc(1 - awayPlayerProbOver, 0.02, 0.98),
    ],
    1.07,
  );

  const parityProb = (value: number): number => {
    const rounded = Math.round(value);
    const closeness = Math.max(0, 0.5 - Math.abs(value - rounded));
    const bias = 0.04 + closeness * 0.18;
    return mc(0.5 + (rounded % 2 === 1 ? bias : -bias), 0.18, 0.82);
  };
  const oddEvenGamesProb = parityProb(expectedTotalGames);
  const oddEven1stProb = parityProb(
    currentSetIndex === 0
      ? expectedCurrentSetTotalGames
      : (sets[0]?.[0] ?? 0) + (sets[0]?.[1] ?? 0),
  );
  const oddEven2ndProb = parityProb(
    currentSetIndex === 1
      ? expectedCurrentSetTotalGames
      : (sets[1]?.[0] ?? 0) + (sets[1]?.[1] ?? 0),
  );

  const winAtLeast1P1Prob =
    homeSetsWon >= 1 ? 0.99 : awaySetsWon >= 2 ? 0.01 : 1 - exactSetsProbs.a02;
  const winAtLeast1P2Prob =
    awaySetsWon >= 1 ? 0.99 : homeSetsWon >= 2 ? 0.01 : 1 - exactSetsProbs.h20;

  const firstSetCompleted =
    sets[0] &&
    (((sets[0][0] >= 6 || sets[0][1] >= 6) &&
      Math.abs(sets[0][0] - sets[0][1]) >= 2) ||
      sets[0][0] === 7 ||
      sets[0][1] === 7);
  const firstSetHomeWon = firstSetCompleted ? sets[0]![0] > sets[0]![1] : null;
  let setMatchProbs = { h11: 0, h12: 0, a21: 0, a22: 0 };
  if (firstSetHomeWon === null) {
    const pHomeAfterSet1 = pFreshSetHome * (2 - pFreshSetHome);
    setMatchProbs = {
      h11: currentSetHomeWinProb * pHomeAfterSet1,
      h12: currentSetHomeWinProb * (1 - pHomeAfterSet1),
      a21: (1 - currentSetHomeWinProb) * pFreshSetHome * pFreshSetHome,
      a22: (1 - currentSetHomeWinProb) * (1 - pFreshSetHome * pFreshSetHome),
    };
  } else if (firstSetHomeWon) {
    const pHomeMatch =
      homeSetsWon >= 2
        ? 0.99
        : awaySetsWon >= 2
          ? 0.01
          : homeSetsWon === 1 && awaySetsWon === 1
            ? currentSetHomeWinProb
            : currentSetHomeWinProb +
              (1 - currentSetHomeWinProb) * pFreshSetHome;
    setMatchProbs = { h11: pHomeMatch, h12: 1 - pHomeMatch, a21: 0, a22: 0 };
  } else {
    const pHomeMatch =
      homeSetsWon >= 2
        ? 0.99
        : awaySetsWon >= 2
          ? 0.01
          : homeSetsWon === 1 && awaySetsWon === 1
            ? currentSetHomeWinProb
            : pFreshSetHome * currentSetHomeWinProb;
    setMatchProbs = { h11: 0, h12: 0, a21: pHomeMatch, a22: 1 - pHomeMatch };
  }
  const setMatchTotal =
    Object.values(setMatchProbs).reduce((a, b) => a + b, 0) || 1;
  const [smH11, smH12, smA21, smA22] = probsToDecimalOdds(
    [
      mc(setMatchProbs.h11 / setMatchTotal, 0.001, 0.999),
      mc(setMatchProbs.h12 / setMatchTotal, 0.001, 0.999),
      mc(setMatchProbs.a21 / setMatchTotal, 0.001, 0.999),
      mc(setMatchProbs.a22 / setMatchTotal, 0.001, 0.999),
    ],
    1.08,
  );

  const scoreEntry = (
    setScore: [number, number] | undefined,
  ): Array<{ label: string; odds: number }> =>
    setScore ? [{ label: `${setScore[0]}-${setScore[1]}`, odds: 1.01 }] : [];
  const score1st =
    currentSetIndex === 0
      ? canonicalTennisSetScoreOrder(
          Object.entries(currentSetScore).map(([label, odds]) => ({
            label,
            odds,
          })),
        )
      : scoreEntry(sets[0]);
  const score2nd =
    currentSetIndex === 1
      ? canonicalTennisSetScoreOrder(
          Object.entries(currentSetScore).map(([label, odds]) => ({
            label,
            odds,
          })),
        )
      : scoreEntry(sets[1]);
  const score3rd =
    currentSetIndex === 2
      ? canonicalTennisSetScoreOrder(
          Object.entries(currentSetScore).map(([label, odds]) => ({
            label,
            odds,
          })),
        )
      : scoreEntry(sets[2]);

  const liveFirstSet =
    homeSetsWon + awaySetsWon === 0
      ? probToHomeAway(currentSetHomeWinProb, 1.06)
      : baseExtras.firstSet;
  const liveSet2 =
    homeSetsWon + awaySetsWon === 1
      ? probToHomeAway(currentSetHomeWinProb, 1.07)
      : baseExtras.set2;
  const liveSet3 =
    homeSetsWon + awaySetsWon === 2
      ? probToHomeAway(currentSetHomeWinProb, 1.09)
      : baseExtras.set3;
  const liveSetHandicap = probToHomeAway(exactSetsProbs.h20, 1.06);
  const liveGameHandicap = {
    line: Math.round((expectedHomeGames - expectedAwayGames) * 2) / 2,
    ...probToHomeAway(
      mc(0.5 + (expectedHomeGames - expectedAwayGames) * 0.025, 0.05, 0.95),
      1.06,
    ),
  };
  const liveExactSets = {
    h20: capTennisLiveOdd(xh20!, pointCtx.homeTrailing),
    h21: capTennisLiveOdd(xh21!, pointCtx.homeTrailing),
    a02: capTennisLiveOdd(xa02!, pointCtx.awayTrailing),
    a12: capTennisLiveOdd(xa12!, pointCtx.awayTrailing),
  };
  const liveSetMatch = {
    h11: capTennisLiveOdd(smH11!, pointCtx.homeTrailing),
    h12: capTennisLiveOdd(smH12!, pointCtx.homeTrailing),
    a21: capTennisLiveOdd(smA21!, pointCtx.awayTrailing),
    a22: capTennisLiveOdd(smA22!, pointCtx.awayTrailing),
  };

  return {
    ...baseExtras,
    firstSet: capTennisLiveHomeAwayOdds(
      liveFirstSet,
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    set2: capTennisLiveHomeAwayOdds(
      liveSet2,
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    set3: capTennisLiveHomeAwayOdds(
      liveSet3,
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    exactSets: liveExactSets,
    totalSets: capTennisLiveOverUnderOdds({
      line: 2.5,
      over: over25Sets!,
      under: under25Sets!,
    }),
    setHandicap: {
      // liveSetHandicap is priced off exactSetsProbs.h20 (probability home
      // sweeps 2-0) — the exact probability a -1.5 sets line needs, so that
      // fixed line is the correct synthetic default (real data overrides
      // this whenever PulseScore actually prices Sets Handicap for this
      // match — see extractSetHandicap). Missing this field entirely
      // silently rendered "Casa +undefined" in the UI (TS would have
      // caught it — esbuild's build step doesn't type-check, only tsc
      // does; confirmed via `pnpm typecheck`).
      line: -1.5,
      ...capTennisLiveHomeAwayOdds(
        liveSetHandicap,
        pointCtx.homeTrailing,
        pointCtx.awayTrailing,
      ),
    },
    totalGames: capTennisLiveOverUnderOdds(totalGames),
    totalGamesLines,
    set1Games: capTennisLiveOverUnderOdds({
      line: set1GamesLine,
      over: s1go!,
      under: s1gu!,
    }),
    set2Games: capTennisLiveOverUnderOdds({
      line: set2GamesLine,
      over: s2go!,
      under: s2gu!,
    }),
    gameHandicap: {
      line: liveGameHandicap.line,
      ...capTennisLiveHomeAwayOdds(
        liveGameHandicap,
        pointCtx.homeTrailing,
        pointCtx.awayTrailing,
      ),
    },
    homePlayerGames: capTennisLiveOverUnderOdds(
      { line: homePlayerLine, over: hpgOver!, under: hpgUnder! },
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    awayPlayerGames: capTennisLiveOverUnderOdds(
      { line: awayPlayerLine, over: apgOver!, under: apgUnder! },
      pointCtx.awayTrailing,
      pointCtx.homeTrailing,
    ),
    oddEvenGames: capTennisLiveOddEvenOdds({
      odd: probToYesNo(oddEvenGamesProb, 1.06).yes,
      even: probToYesNo(oddEvenGamesProb, 1.06).no,
    }),
    oddEven1st: capTennisLiveOddEvenOdds({
      odd: probToYesNo(oddEven1stProb, 1.06).yes,
      even: probToYesNo(oddEven1stProb, 1.06).no,
    }),
    oddEven2nd: capTennisLiveOddEvenOdds({
      odd: probToYesNo(oddEven2ndProb, 1.06).yes,
      even: probToYesNo(oddEven2ndProb, 1.06).no,
    }),
    winAtLeast1P1: capTennisLiveYesNoOdds(
      probToYesNo(winAtLeast1P1Prob, 1.06),
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    winAtLeast1P2: capTennisLiveYesNoOdds(
      probToYesNo(winAtLeast1P2Prob, 1.06),
      pointCtx.awayTrailing,
      pointCtx.homeTrailing,
    ),
    setMatch: liveSetMatch,
    setExactScore: capTennisLiveScoreMap(
      currentSetScore,
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    set1ExactScore:
      currentSetIndex === 0
        ? capTennisLiveScoreMap(
            currentSetScore,
            pointCtx.homeTrailing,
            pointCtx.awayTrailing,
          )
        : sets[0]
          ? { [`${sets[0][0]}-${sets[0][1]}`]: 1.01 }
          : undefined,
    set2ExactScore:
      currentSetIndex === 1
        ? capTennisLiveScoreMap(
            currentSetScore,
            pointCtx.homeTrailing,
            pointCtx.awayTrailing,
          )
        : sets[1]
          ? { [`${sets[1][0]}-${sets[1][1]}`]: 1.01 }
          : undefined,
    currentSetNum: setNum,
    score1st: capTennisLiveScoreList(
      score1st,
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    score2nd: capTennisLiveScoreList(
      score2nd,
      pointCtx.homeTrailing,
      pointCtx.awayTrailing,
    ),
    ...(score3rd.length > 0
      ? {
          score3rd: capTennisLiveScoreList(
            score3rd,
            pointCtx.homeTrailing,
            pointCtx.awayTrailing,
          ),
        }
      : {}),
  };
}

// ─── Tennis Set Exact Score helper ────────────────────────────────────────────
// Computes exact-score odds for the CURRENT tennis set given the current game
// score (hg home games won, ag away games won in this set).  Uses a negative-
// binomial "race to win" model where each game is an independent Bernoulli
// trial with P(home wins game) = pGame.  Scores already ruled out by the
// current score are excluded and remaining probabilities are renormalised.
function computeSetExactScoreOdds(
  hg: number,
  ag: number,
  pSetHomeWin: number,
  margin = 0.065,
  pGameHomeWin?: number,
  homeMomentum = 0,
  awayMomentum = 0,
): Record<string, number> {
  const probs = computeSetExactScoreDistribution(
    hg,
    ag,
    pSetHomeWin,
    pGameHomeWin,
    homeMomentum,
    awayMomentum,
  );
  if (Object.keys(probs).length === 0) return {};
  const result: Record<string, number> = {};
  for (const [label, prob] of Object.entries(probs)) {
    result[label] = clampTennisSetCorrectScoreOdd((1 - margin) / prob);
  }
  return result;
}

// ─── Volleyball extras helper ─────────────────────────────────────────────────
function computeVolleyballExtras(
  pSetHomeWin: number,
  overrides?: {
    vs1H?: number;
    vs1A?: number;
    vs2H?: number;
    vs2A?: number;
    vs3H?: number;
    vs3A?: number;
    ptsDiffLine?: number;
    ptsHcapH?: number;
    ptsHcapA?: number;
  },
) {
  const sp = Math.min(0.86, Math.max(0.14, pSetHomeWin));
  const raw30 = sp ** 3;
  const raw31 = 3 * sp ** 3 * (1 - sp);
  const raw32 = 6 * sp ** 3 * (1 - sp) ** 2;
  const raw03 = (1 - sp) ** 3;
  const raw13 = 3 * (1 - sp) ** 3 * sp;
  const raw23 = 6 * (1 - sp) ** 3 * sp ** 2;
  const esTotal = raw30 + raw31 + raw32 + raw03 + raw13 + raw23;
  const [vs30, vs31, vs32, vs03, vs13, vs23] = probsToDecimalOdds(
    [
      raw30 / esTotal,
      raw31 / esTotal,
      raw32 / esTotal,
      raw03 / esTotal,
      raw13 / esTotal,
      raw23 / esTotal,
    ],
    1.12,
  );

  const pHomeMinus15 = mc(raw30 + raw31, 0.02, 0.98);
  const [shh, sha] = probsToDecimalOdds([pHomeMinus15, 1 - pHomeMinus15], 1.06);

  const [s1h, s1a] = probsToDecimalOdds(
    [mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)],
    1.06,
  );
  const [s2h, s2a] = probsToDecimalOdds(
    [mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)],
    1.07,
  );
  const sp3 = Math.min(0.82, Math.max(0.18, 0.5 + (sp - 0.5) * 0.9));
  const [s3h, s3a] = probsToDecimalOdds(
    [mc(sp3, 0.08, 0.92), mc(1 - sp3, 0.08, 0.92)],
    1.08,
  );

  const expSets =
    3 * (raw30 + raw03) + 4 * (raw31 + raw13) + 5 * (raw32 + raw23);
  const expPts = expSets * 50;
  const logCdfP = (x: number) => 1 / (1 + Math.exp(-(x - expPts) / 15));
  const ptLineNums = [145.5, 150.5, 155.5, 160.5, 165.5];
  const pointsLines = ptLineNums.map((line) => {
    const pU = logCdfP(line);
    const [o, u] = probsToDecimalOdds(
      [mc(1 - pU, 0.02, 0.98), mc(pU, 0.02, 0.98)],
      1.07,
    );
    return { line, over: o!, under: u! };
  });

  return {
    set1: { home: overrides?.vs1H ?? s1h!, away: overrides?.vs1A ?? s1a! },
    set2: { home: overrides?.vs2H ?? s2h!, away: overrides?.vs2A ?? s2a! },
    set3: { home: overrides?.vs3H ?? s3h!, away: overrides?.vs3A ?? s3a! },
    exactScore: {
      s30: vs30!,
      s31: vs31!,
      s32: vs32!,
      s03: vs03!,
      s13: vs13!,
      s23: vs23!,
    },
    setHandicap: { home: shh!, away: sha! },
    pointsLines,
    handicapPoints: {
      line: overrides?.ptsDiffLine ?? 0,
      home: overrides?.ptsHcapH ?? s1h!,
      away: overrides?.ptsHcapA ?? s1a!,
    },
  };
}

// Estimate of P(home wins the CURRENT set), used only when unibetau hasn't
// priced a real "Match Odds" market for a live volleyball match (see
// buildVolleyballLiveFromPulseScore below and volleyball.ts's header for why
// that's the common case, not the exception, right now). Two components:
// a Beta(1,1)-smoothed read of the sets record so far (mean-reverts to 0.5
// with no sets played, shifts toward whoever's leading as sets accumulate),
// blended with the CURRENT set's live point differential via a logistic
// curve (momentum inside the set in progress). Deliberately conservative —
// clamped to [0.12, 0.88] — since this feeds real-money odds with no
// bookmaker price backing it at all, unlike computeTennisLiveOdds's fallback
// which at least anchors to a real prematch bwin/bet365 price.
function estimateVolleyballSetWinProb(
  homeSetsWon: number,
  awaySetsWon: number,
  homePts: number,
  awayPts: number,
): number {
  const recordProb = (homeSetsWon + 1) / (homeSetsWon + awaySetsWon + 2);
  const ptsDiff = homePts - awayPts;
  const pointProb = 1 / (1 + Math.exp(-ptsDiff / 6));
  const blended = recordProb * 0.65 + pointProb * 0.35;
  return mc(blended, 0.12, 0.88);
}

// P(home wins the MATCH) given a fixed per-set win probability `sp` and the
// sets already won by each side, via the standard race-to-N recursive
// formula (best-of-5: first to 3 sets). f(h, a) = probability home wins
// from a state where home still needs `h` more set wins and away needs `a`
// more — f(0, a) = 1 (home already there), f(h, 0) = 0 (away already
// there), f(h, a) = sp*f(h-1, a) + (1-sp)*f(h, a-1) otherwise. `sp` is
// treated as constant across the remaining sets — a simplification (real
// teams' per-set edge isn't perfectly stationary), but the same one
// computeVolleyballExtras above already makes for its own exact-score
// distribution, so this stays consistent with it.
function volleyballMatchWinProbFromSets(
  sp: number,
  homeSetsWon: number,
  awaySetsWon: number,
): number {
  const h = Math.max(0, 3 - homeSetsWon);
  const a = Math.max(0, 3 - awaySetsWon);
  if (h === 0) return 1;
  if (a === 0) return 0;
  const memo = new Map<string, number>();
  function f(hh: number, aa: number): number {
    if (hh === 0) return 1;
    if (aa === 0) return 0;
    const key = `${hh}:${aa}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const result = sp * f(hh - 1, aa) + (1 - sp) * f(hh, aa - 1);
    memo.set(key, result);
    return result;
  }
  return f(h, a);
}

// ─── Sport-specific market builders for live matches ─────────────────────────

function makeBasketballMarketsFromTeams(
  home: string,
  away: string,
): AdvancedMarkets {
  const sr = seededRng(`bball-live:${home}:${away}`);
  const marginMean = mc((sr(1) - 0.5) * 14 + 2, -18, 18);
  const marginSd = mc(11 + sr(2) * 3, 9, 16);
  const mean = mc(215 + (sr(3) - 0.5) * 30, 170, 250);
  const sd = mc(14 + sr(4) * 4, 10, 22);
  const split = mc(0.51 + (sr(5) - 0.5) * 0.14, 0.35, 0.65);

  const pHomeML = mc(1 - normalCdf(-marginMean / marginSd), 0.05, 0.95);
  const mean1H = mean * 0.5;
  const sd1H = sd * 0.72;
  const totalLine = Math.round(mean / 5) * 5;
  const total1HLine = Math.round(mean1H / 5) * 5;
  const spreadLine =
    Math.round(mean * 0.01 + Math.abs(marginMean) * 0.5) *
    (marginMean >= 0 ? -1 : 1);
  const spread = Math.abs(Math.round(marginMean * 0.8));

  const [oTotal, uTotal] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine - mean) / sd), 0.05, 0.95),
      mc(normalCdf((totalLine - mean) / sd), 0.05, 0.95),
    ],
    1.06,
  );
  const [oTotal1H, uTotal1H] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((total1HLine - mean1H) / sd1H), 0.05, 0.95),
      mc(normalCdf((total1HLine - mean1H) / sd1H), 0.05, 0.95),
    ],
    1.06,
  );

  const meanHome = mean * split;
  const meanAway = mean * (1 - split);
  const sdTeam = sd * 0.85;
  const teamTotalLine = Math.round(meanHome / 5) * 5;
  const awayTotalLine = Math.round(meanAway / 5) * 5;
  const [oHT, uHT] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((teamTotalLine - meanHome) / sdTeam), 0.05, 0.95),
      mc(normalCdf((teamTotalLine - meanHome) / sdTeam), 0.05, 0.95),
    ],
    1.06,
  );
  const [oAT, uAT] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((awayTotalLine - meanAway) / sdTeam), 0.05, 0.95),
      mc(normalCdf((awayTotalLine - meanAway) / sdTeam), 0.05, 0.95),
    ],
    1.06,
  );
  const [spreadH, spreadA] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((-spread - marginMean) / marginSd), 0.05, 0.95),
      mc(normalCdf((-spread - marginMean) / marginSd), 0.05, 0.95),
    ],
    1.06,
  );

  const pHalfHome = mc(0.5 + (pHomeML - 0.5) * 0.75, 0.15, 0.85);
  const [halfH, halfA] = probsToDecimalOdds([pHalfHome, 1 - pHalfHome], 1.06);
  const [q1H, q1A] = probsToDecimalOdds(
    [
      mc(0.5 + (pHomeML - 0.5) * 0.55, 0.25, 0.75),
      mc(0.5 - (pHomeML - 0.5) * 0.55, 0.25, 0.75),
    ],
    1.07,
  );
  const [q2H, q2A] = probsToDecimalOdds(
    [
      mc(0.5 + (pHomeML - 0.5) * 0.5, 0.25, 0.75),
      mc(0.5 - (pHomeML - 0.5) * 0.5, 0.25, 0.75),
    ],
    1.07,
  );
  const [q3H, q3A] = probsToDecimalOdds(
    [
      mc(0.5 + (pHomeML - 0.5) * 0.48, 0.25, 0.75),
      mc(0.5 - (pHomeML - 0.5) * 0.48, 0.25, 0.75),
    ],
    1.07,
  );
  const [q4H, q4A] = probsToDecimalOdds(
    [
      mc(0.5 + (pHomeML - 0.5) * 0.52, 0.25, 0.75),
      mc(0.5 - (pHomeML - 0.5) * 0.52, 0.25, 0.75),
    ],
    1.07,
  );
  const qHomeWinPs = [
    mc(0.5 + (pHomeML - 0.5) * 0.55, 0.25, 0.75),
    mc(0.5 + (pHomeML - 0.5) * 0.5, 0.25, 0.75),
    mc(0.5 + (pHomeML - 0.5) * 0.48, 0.25, 0.75),
    mc(0.5 + (pHomeML - 0.5) * 0.52, 0.25, 0.75),
  ];

  const quarterMean = mean / 4;
  const quarterSd = mc(sd * 0.46, 5, 11);
  const quarterTotalLine = Math.floor(quarterMean) + 0.5;
  const quarterTotalLines = [
    quarterTotalLine,
    quarterTotalLine,
    quarterTotalLine,
    quarterTotalLine,
  ].map((line, idx) => {
    const adjMean = quarterMean + (idx - 1.5) * 0.4;
    const [over, under] = probsToDecimalOdds(
      [
        mc(1 - normalCdf((line - adjMean) / quarterSd), 0.05, 0.95),
        mc(normalCdf((line - adjMean) / quarterSd), 0.05, 0.95),
      ],
      1.06,
    );
    return { line, over: over!, under: under! };
  });

  const quarterSpreadBase = Math.max(
    0.5,
    Math.round((Math.abs(marginMean) / 4) * 2) / 2,
  );
  const quarterSpreadLines = [
    quarterSpreadBase,
    quarterSpreadBase,
    quarterSpreadBase,
    quarterSpreadBase,
  ].map((line, idx) => {
    const pHomeQuarter = qHomeWinPs[idx] ?? 0.5;
    const [homeCover, awayCover] = probsToDecimalOdds(
      [pHomeQuarter, 1 - pHomeQuarter],
      1.06,
    );
    return { line, home: homeCover!, away: awayCover! };
  });

  const pHomeAnyQuarter = mc(
    1 - qHomeWinPs.reduce((acc, p) => acc * (1 - p), 1),
    0.08,
    0.98,
  );
  const pAwayAnyQuarter = mc(
    1 - qHomeWinPs.reduce((acc, p) => acc * p, 1),
    0.08,
    0.98,
  );
  const [anyQuarterHome, anyQuarterAway] = probsToDecimalOdds(
    [pHomeAnyQuarter, pAwayAnyQuarter],
    1.07,
  );
  const pHomeAllQuarters = mc(
    qHomeWinPs.reduce((acc, p) => acc * p, 1),
    0.01,
    0.75,
  );
  const pAwayAllQuarters = mc(
    qHomeWinPs.reduce((acc, p) => acc * (1 - p), 1),
    0.01,
    0.75,
  );
  const [allQuarterHome, allQuarterAway] = probsToDecimalOdds(
    [pHomeAllQuarters, pAwayAllQuarters],
    1.08,
  );
  const pHomeFirstPoint = mc(0.5 + (pHomeML - 0.5) * 0.32, 0.18, 0.82);
  const [firstPointHome, firstPointAway] = probsToDecimalOdds(
    [pHomeFirstPoint, 1 - pHomeFirstPoint],
    1.07,
  );
  const pHomeNextPoint = mc(0.5 + (pHomeML - 0.5) * 0.22, 0.2, 0.8);
  const [nextPointHome, nextPointAway] = probsToDecimalOdds(
    [pHomeNextPoint, 1 - pHomeNextPoint],
    1.07,
  );
  const pHomeNextThree = mc(0.5 + (pHomeML - 0.5) * 0.16, 0.18, 0.82);
  const [nextThreeHome, nextThreeAway] = probsToDecimalOdds(
    [pHomeNextThree, 1 - pHomeNextThree],
    1.08,
  );

  // Multiple game-total O/U lines: main line ±15 at 2.5-pt increments (13 lines)
  const totalsRange: { line: number; over: number; under: number }[] = [];
  for (let off = -15; off <= 15; off += 2.5) {
    const line = Math.round((totalLine + off) * 10) / 10;
    const [oL, uL] = probsToDecimalOdds(
      [
        mc(1 - normalCdf((line - mean) / sd), 0.02, 0.98),
        mc(normalCdf((line - mean) / sd), 0.02, 0.98),
      ],
      1.06,
    );
    totalsRange.push({ line, over: oL!, under: uL! });
  }

  return {
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: 0, no: 0 },
    totalGoals: {
      over05: 0,
      under05: 0,
      over15: 0,
      under15: 0,
      over25: oTotal!,
      under25: uTotal!,
      over35: 0,
      under35: 0,
      over45: 0,
      under45: 0,
      over55: 0,
      under55: 0,
      over65: 0,
      under65: 0,
    },
    handicap: {
      homeMinusOne: spreadH!,
      awayPlusOne: spreadA!,
      homeMinusOneHalf: oHT!,
      awayPlusOneHalf: uHT!,
    },
    halfTime: { home: halfH!, draw: 0, away: halfA! },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    _spread: spread,
    _total: totalLine,
    _total1H: total1HLine,
    _spreadLine: spreadLine,
    basketballExtra: {
      q1: { home: q1H!, away: q1A! },
      q2: { home: q2H!, away: q2A! },
      q3: { home: q3H!, away: q3A! },
      q4: { home: q4H!, away: q4A! },
      q1Total: quarterTotalLines[0]!,
      q2Total: quarterTotalLines[1]!,
      q3Total: quarterTotalLines[2]!,
      q4Total: quarterTotalLines[3]!,
      q1Spread: quarterSpreadLines[0]!,
      q2Spread: quarterSpreadLines[1]!,
      q3Spread: quarterSpreadLines[2]!,
      q4Spread: quarterSpreadLines[3]!,
      teamTotalHome: { line: teamTotalLine, over: oHT!, under: uHT! },
      teamTotalAway: { line: awayTotalLine, over: oAT!, under: uAT! },
      anyQuarter: { home: anyQuarterHome!, away: anyQuarterAway! },
      allQuarters: { home: allQuarterHome!, away: allQuarterAway! },
      firstPoint: { home: firstPointHome!, away: firstPointAway! },
      nextPoint: { home: nextPointHome!, away: nextPointAway! },
      nextThree: { home: nextThreeHome!, away: nextThreeAway! },
      totalsRange,
    },
    _extraUsed: { oTotal1H, uTotal1H, oAT, uAT },
  } as unknown as AdvancedMarkets;
}

// Basketball moneyline, derived from the same margin model used for the
// spread/quarter markets above (same seed, so it stays internally
// consistent with them) — previously the moneyline reused the football
// Elo/Poisson model via makeOddsFromTeams(), which doesn't know basketball
// team names and produced near-random, badly-calibrated prices.
function makeBasketballMoneylineFromTeams(
  home: string,
  away: string,
): { home: number; away: number } {
  const sr = seededRng(`bball-live:${home}:${away}`);
  const marginMean = mc((sr(1) - 0.5) * 14 + 2, -18, 18);
  const marginSd = mc(11 + sr(2) * 3, 9, 16);
  const pHomeML = mc(1 - normalCdf(-marginMean / marginSd), 0.05, 0.95);
  const [oddsHome, oddsAway] = probsToDecimalOdds(
    [pHomeML, 1 - pHomeML],
    1.06,
  );
  return { home: oddsHome, away: oddsAway };
}

function makeHockeyMarketsFromTeams(
  home: string,
  away: string,
): AdvancedMarkets {
  const sr = seededRng(`hockey-live:${home}:${away}`);
  const isNHL = ![
    "Moscow",
    "Kazan",
    "SKA",
    "Metallurg",
    "Dynamo",
    "CSKA",
    "Ak Bars",
  ].some((k) => home.includes(k) || away.includes(k));
  const meanTotal = mc((isNHL ? 6.1 : 5.6) + (sr(1) - 0.5) * 1.6, 4.5, 8.0);
  const marginMean = mc((sr(2) - 0.5) * 2.2 + 0.15, -2.5, 2.5);
  const marginSd = mc(2.0 + sr(3) * 0.8, 1.6, 3.2);
  const pHomeML = mc(1 - normalCdf(-marginMean / marginSd), 0.08, 0.92);
  const [plH, plA] = probsToDecimalOdds([pHomeML, 1 - pHomeML], 1.05);

  const totalLine = Math.round(meanTotal * 2) / 2;
  const totalSd = mc(1.6 + sr(4) * 0.6, 1.2, 2.4);
  const [oTotal, uTotal] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95),
    ],
    1.06,
  );
  const [oAlt1, uAlt1] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95),
    ],
    1.06,
  );
  const [oAlt2, uAlt2] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95),
    ],
    1.06,
  );

  const mean1P = meanTotal / 3;
  const mkPeriod = (hMult: number, aMult: number, si: number) => {
    const lH = mc(mean1P * 0.5 + marginMean * hMult, 0.3, 2.5);
    const lA = mc(mean1P * 0.5 - marginMean * aMult, 0.3, 2.5);
    const pH = poissonPmf(lH, 5);
    const pA = poissonPmf(lA, 5);
    let hw = 0,
      d = 0,
      aw = 0;
    for (let gi = 0; gi <= 5; gi++)
      for (let gj = 0; gj <= 5; gj++) {
        const p = (pH[gi] ?? 0) * (pA[gj] ?? 0);
        if (gi > gj) hw += p;
        else if (gi < gj) aw += p;
        else d += p;
      }
    const s = hw + d + aw;
    const [h, dx, a] = probsToDecimalOdds([hw / s, d / s, aw / s], 1.08);
    return { home: h!, draw: dx!, away: a!, _si: si };
  };
  const p1 = mkPeriod(0.35, 0.35, 5);
  const p2 = mkPeriod(0.2, 0.2, 6);
  const p3 = mkPeriod(0.1, 0.1, 7);

  const per1TotalLine = Math.round(mean1P * 2) / 2;
  const per1TotalSd = mc(0.9 + sr(15) * 0.4, 0.6, 1.5);
  const [oPer1T, uPer1T] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((per1TotalLine - mean1P) / per1TotalSd), 0.05, 0.95),
      mc(normalCdf((per1TotalLine - mean1P) / per1TotalSd), 0.05, 0.95),
    ],
    1.06,
  );

  const pBTS = mc(0.7 + (sr(16) - 0.5) * 0.18, 0.45, 0.92);
  const [btsYes, btsNo] = probsToDecimalOdds([pBTS, 1 - pBTS], 1.06);
  const shotsLine = mc((isNHL ? 60.5 : 55.5) + (sr(17) - 0.5) * 8, 48.5, 72.5);
  const [oShots, uShots] = probsToDecimalOdds(
    [
      mc(0.5 + (sr(18) - 0.5) * 0.12, 0.38, 0.62),
      mc(0.5 - (sr(18) - 0.5) * 0.12, 0.38, 0.62),
    ],
    1.06,
  );

  const per2TotalSd = mc(per1TotalSd * (0.88 + sr(19) * 0.22), 0.5, 1.6);
  const per3TotalSd = mc(per1TotalSd * (0.8 + sr(20) * 0.2), 0.5, 1.6);
  const [oPer2T, uPer2T] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((per1TotalLine - mean1P) / per2TotalSd), 0.05, 0.95),
      mc(normalCdf((per1TotalLine - mean1P) / per2TotalSd), 0.05, 0.95),
    ],
    1.06,
  );
  const [oPer3T, uPer3T] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((per1TotalLine - mean1P) / per3TotalSd), 0.05, 0.95),
      mc(normalCdf((per1TotalLine - mean1P) / per3TotalSd), 0.05, 0.95),
    ],
    1.06,
  );

  return {
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: btsYes!, no: btsNo! },
    totalGoals: {
      over05: 0,
      under05: 0,
      over15: oAlt1!,
      under15: uAlt1!,
      over25: oTotal!,
      under25: uTotal!,
      over35: oAlt2!,
      under35: uAlt2!,
      over45: 0,
      under45: 0,
      over55: 0,
      under55: 0,
      over65: 0,
      under65: 0,
    },
    handicap: {
      homeMinusOne: plH!,
      awayPlusOne: plA!,
      homeMinusOneHalf: 0,
      awayPlusOneHalf: 0,
    },
    halfTime: { home: p1.home, draw: p1.draw, away: p1.away },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    _spread: 1.5,
    _total: totalLine,
    hockeyExtra: {
      period2: { home: p2.home, draw: p2.draw, away: p2.away },
      period3: { home: p3.home, draw: p3.draw, away: p3.away },
      period1Total: { line: per1TotalLine, over: oPer1T!, under: uPer1T! },
      period2Total: { line: per1TotalLine, over: oPer2T!, under: uPer2T! },
      period3Total: { line: per1TotalLine, over: oPer3T!, under: uPer3T! },
      bothTeamsScoreGame: { yes: btsYes!, no: btsNo! },
      shotsOnGoal: { line: shotsLine, over: oShots!, under: uShots! },
    },
  } as unknown as AdvancedMarkets;
}

// makeHockeyMarketsFromTeams above computes a full-match moneyline internally
// (plH/plA) but only exposes it repurposed as the synthetic handicap odds —
// no full-match home/draw/away triple is returned anywhere. Needed as the
// synthetic fallback for buildHockeyUpcomingFromPulseScore when bwin hasn't
// priced an event's 3-Way Result market yet, mirroring
// makeBasketballMoneylineFromTeams's role for basketball but modeling a real
// regulation-time draw (impossible in basketball, routine in hockey) via the
// same Poisson-goal approach mkPeriod already uses per-period inside
// makeHockeyMarketsFromTeams, just for the full match total instead of a
// third of it.
function makeHockeyMoneylineFromTeams(
  home: string,
  away: string,
): { home: number; draw: number; away: number } {
  const sr = seededRng(`hockey-ml:${home}:${away}`);
  const isNHL = ![
    "Moscow",
    "Kazan",
    "SKA",
    "Metallurg",
    "Dynamo",
    "CSKA",
    "Ak Bars",
  ].some((k) => home.includes(k) || away.includes(k));
  const meanTotal = mc((isNHL ? 6.1 : 5.6) + (sr(1) - 0.5) * 1.6, 4.5, 8.0);
  const marginMean = mc((sr(2) - 0.5) * 2.2 + 0.15, -2.5, 2.5);
  const lH = mc(meanTotal / 2 + marginMean / 2, 0.5, 7);
  const lA = mc(meanTotal / 2 - marginMean / 2, 0.5, 7);
  const pH = poissonPmf(lH, 8);
  const pA = poissonPmf(lA, 8);
  let hw = 0,
    d = 0,
    aw = 0;
  for (let gi = 0; gi <= 8; gi++)
    for (let gj = 0; gj <= 8; gj++) {
      const p = (pH[gi] ?? 0) * (pA[gj] ?? 0);
      if (gi > gj) hw += p;
      else if (gi < gj) aw += p;
      else d += p;
    }
  const s = hw + d + aw;
  const [h, dx, a] = probsToDecimalOdds([hw / s, d / s, aw / s], 1.08);
  return { home: h!, draw: dx!, away: a! };
}

function makeMLBMarketsFromTeams(
  home: string,
  away: string,
  realHomeOdds?: number,
  realAwayOdds?: number,
): AdvancedMarkets {
  const sr = seededRng(`mlb-mkt:${home}:${away}`);
  const meanTotal = mc(8.5 + (sr(1) - 0.5) * 3.0, 6.5, 12.0);
  const totalLine = Math.round(meanTotal * 2) / 2;
  const totalSd = mc(2.5 + sr(2) * 1.0, 1.8, 3.5);
  const [oTotal, uTotal] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95),
    ],
    1.06,
  );
  const [oAlt1, uAlt1] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95),
    ],
    1.06,
  );
  const [oAlt2, uAlt2] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95),
    ],
    1.06,
  );
  // Anchor run-line direction from real moneyline odds when available
  let marginMean = mc((sr(3) - 0.5) * 2.0, -2.0, 2.0);
  if (realHomeOdds && realAwayOdds && realHomeOdds > 1 && realAwayOdds > 1) {
    const implH = 1 / realHomeOdds;
    const implA = 1 / realAwayOdds;
    const pHome = mc(implH / (implH + implA), 0.15, 0.85);
    marginMean = mc((pHome - 0.5) * 5.0 + (sr(3) - 0.5) * 0.4, -3.0, 3.0);
  }
  const marginSd = mc(2.8 + sr(4) * 0.8, 2.2, 4.0);
  const pHomeRL = mc(1 - normalCdf((-1.5 - marginMean) / marginSd), 0.05, 0.95);
  const [rlH, rlA] = probsToDecimalOdds([pHomeRL, 1 - pHomeRL], 1.06);

  // First 5 innings (F5) markets — starters pitch ~5 innings; smaller run total
  const f5MeanTotal = mc(meanTotal * (5 / 9), 2.5, 7.0);
  const f5TotalLine = Math.round(f5MeanTotal * 2) / 2;
  const f5TotalSd = mc(totalSd * 0.72, 1.0, 2.5);
  const [oF5T, uF5T] = probsToDecimalOdds(
    [
      mc(1 - normalCdf((f5TotalLine - f5MeanTotal) / f5TotalSd), 0.05, 0.95),
      mc(normalCdf((f5TotalLine - f5MeanTotal) / f5TotalSd), 0.05, 0.95),
    ],
    1.06,
  );
  const f5MarginMean = mc(marginMean * 0.65 + (sr(5) - 0.5) * 0.5, -2.0, 2.0);
  const f5MarginSd = mc(marginSd * 0.9, 2.0, 3.5);
  const f5HomeP = mc(normalCdf(f5MarginMean / f5MarginSd), 0.25, 0.75);
  const [f5H, f5A] = probsToDecimalOdds([f5HomeP, 1 - f5HomeP], 1.06);

  return {
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: 0, no: 0 },
    totalGoals: {
      over05: 0,
      under05: 0,
      over15: 0,
      under15: 0,
      over25: oAlt1!,
      under25: uAlt1!,
      over35: oTotal!,
      under35: uTotal!,
      over45: oAlt2!,
      under45: uAlt2!,
      over55: 0,
      under55: 0,
      over65: 0,
      under65: 0,
    },
    handicap: {
      homeMinusOne: rlH!,
      awayPlusOne: rlA!,
      homeMinusOneHalf: 0,
      awayPlusOneHalf: 0,
    },
    halfTime: { home: 0, draw: 0, away: 0 },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    _spread: 1.5,
    _total: totalLine,
    mlbExtra: {
      f5Result: { home: f5H!, away: f5A! },
      f5Total: { line: f5TotalLine, over: oF5T!, under: uF5T! },
    },
  } as unknown as AdvancedMarkets;
}

// ─── SportsAPI Pro V2 Live Response Types ─────────────────────────────────────

type SAPIV2ScoreObj = {
  current?: number;
  display?: number;
  period1?: number;
  period2?: number;
  period3?: number;
  period4?: number;
  innings?: Record<string, { run?: number | null }>;
  inningsBaseball?: { run?: number; hits?: number; errors?: number };
  /** Tennis only: current game score — "0" | "15" | "30" | "40" | "AD" | "D" */
  point?: string;
};
type SAPIV2StatusObj = { code?: number; description?: string; type?: string };
type SAPIV2TournObj = {
  id?: number;
  name?: string;
  slug?: string;
  category?: {
    name?: string;
    slug?: string;
    id?: number;
    country?: { name?: string; alpha2?: string };
  };
};

function tennisTierRank(name: string): number {
  const n = String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, " ") // normalise slugs: "atp-250-s-hertogenbosch" → "atp 250 s hertogenbosch"
    .trim();
  if (!n) return 999;

  if (
    n.includes("wimbledon") ||
    n.includes("roland garros") ||
    n.includes("french open") ||
    n.includes("australian open") ||
    n.includes("us open") ||
    n.includes("grand slam")
  )
    return 1;

  if (
    n.includes("atp finals") ||
    n.includes("nitto") ||
    n.includes("wta finals")
  )
    return 2;

  if (
    n.includes("masters 1000") ||
    n.includes("atp masters") ||
    n.includes("wta 1000") ||
    /\b(m1000)\b/.test(n)
  )
    return 3;

  if (n.includes("atp 500") || n.includes("wta 500")) return 4;
  if (n.includes("atp 250") || n.includes("wta 250")) return 5;

  if (
    n.includes("challenger") ||
    n.includes("wta 125") ||
    n.includes("wta-125")
  )
    return 6;

  if (
    n.includes("itf") ||
    n.includes("world tennis tour") ||
    /\b(w|m)\d{2,3}\b/.test(n)
  )
    return 7;

  return 999;
}

function tennisTournamentSearchText(
  tournament: string | SAPIV2TournObj | undefined,
): string {
  if (!tournament) return "";
  if (typeof tournament === "string") return tournament;
  const uniqueTournament = (
    tournament as SAPIV2TournObj & {
      uniqueTournament?: { name?: string; slug?: string };
    }
  ).uniqueTournament;
  return [
    tournament.name,
    tournament.slug,
    tournament.category?.name,
    tournament.category?.slug,
    uniqueTournament?.name,
    uniqueTournament?.slug,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Tournament name patterns that are always excluded (doubles, wheelchair, juniors, etc.) */
function isTennisExcludedName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("doubles") ||
    n.includes("wheelchair") ||
    n.includes("quad") ||
    n.includes("junior") ||
    n.includes("boys") ||
    n.includes("girls") ||
    n.includes("legends") ||
    n.includes("exhibition") ||
    n.includes("utr") ||
    n.includes("mc finals")
  );
}

function isTennisFinishedStatusText(status: string | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return (
    s.includes("ended") ||
    s.includes("finished") ||
    s.includes("complete") ||
    s.includes("retired") ||
    s.includes("walkover") ||
    s.includes("default") ||
    s.includes("abandon") ||
    s.includes("cancel") ||
    s.includes("awarded")
  );
}

function isTennisV1GameFinished(
  game: Pick<
    V1TennisGame,
    "statusGroup" | "statusText" | "homeCompetitor" | "awayCompetitor"
  >,
): boolean {
  // V1 tennis statusGroup: 2=Scheduled, 3=Live/in-play ("Set 1"/"Set 3"), 4=Finished/Cancelled
  if (game.statusGroup === 4) return true;
  if (isTennisFinishedStatusText(game.statusText)) return true;
  return !!game.homeCompetitor?.isWinner || !!game.awayCompetitor?.isWinner;
}

type SAPIV2TeamObj = { id?: number; name: string };

type SAPIV2Event = {
  id: number;
  slug?: string;
  tournament: string | SAPIV2TournObj;
  homeTeam: string | SAPIV2TeamObj;
  awayTeam: string | SAPIV2TeamObj;
  homeScore: number | SAPIV2ScoreObj;
  awayScore: number | SAPIV2ScoreObj;
  status: string | SAPIV2StatusObj;
  statusCode?: number;
  startTimestamp?: number;
  tournamentId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  roundInfo?: { round?: number };
  /** true when the API is only showing the final score — match has ended */
  finalResultOnly?: boolean;
  /** true when the live feed is locked (match ended/suspended by API) */
  feedLocked?: boolean;
};

async function fetchFootballExtras(
  id: number,
): Promise<FootballExtras | null> {
  try {
    const resp = await fetch(`${SAPI_V2_FOOTBALL}/match/${id}/statistics`, {
      signal: AbortSignal.timeout(9000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    const get = (o: unknown, path: string[]): unknown => {
      let cur: unknown = o;
      for (const k of path) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[k];
      }
      return cur;
    };
    const toNum = (v: unknown): number | undefined => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    };
    const toBool = (v: unknown): boolean => {
      if (typeof v === "boolean") return v;
      const raw = String(v ?? "")
        .trim()
        .toLowerCase();
      return raw === "true" || raw === "1" || raw === "yes";
    };
    // Helper: try multiple paths and return first numeric hit
    const getNum = (paths: string[][]): number | undefined => {
      for (const path of paths) {
        const v = toNum(get(data, path));
        if (v !== undefined) return v;
      }
      return undefined;
    };

    const cornersHome =
      getNum([["team_stats", "home", "corners", "total"], ["team_stats", "home", "corners"]]) ?? 0;
    const cornersAway =
      getNum([["team_stats", "away", "corners", "total"], ["team_stats", "away", "corners"]]) ?? 0;
    const cornersTotal = cornersHome + cornersAway;

    // Possession
    const possessionHome = getNum([
      ["team_stats", "home", "possession", "percentage"],
      ["team_stats", "home", "ball_possession", "percentage"],
      ["team_stats", "home", "possession"],
    ]);
    const possessionAway = getNum([
      ["team_stats", "away", "possession", "percentage"],
      ["team_stats", "away", "ball_possession", "percentage"],
      ["team_stats", "away", "possession"],
    ]);

    // Shots
    const shotsTotalHome = getNum([
      ["team_stats", "home", "shots", "total"],
      ["team_stats", "home", "shots_total"],
    ]);
    const shotsTotalAway = getNum([
      ["team_stats", "away", "shots", "total"],
      ["team_stats", "away", "shots_total"],
    ]);
    const shotsOnTargetHome = getNum([
      ["team_stats", "home", "shots", "ontarget"],
      ["team_stats", "home", "shots", "on_target"],
      ["team_stats", "home", "shots_on_target"],
    ]);
    const shotsOnTargetAway = getNum([
      ["team_stats", "away", "shots", "ontarget"],
      ["team_stats", "away", "shots", "on_target"],
      ["team_stats", "away", "shots_on_target"],
    ]);
    const shotsOffTargetHome = getNum([
      ["team_stats", "home", "shots", "offtarget"],
      ["team_stats", "home", "shots", "off_target"],
      ["team_stats", "home", "shots_off_target"],
    ]);
    const shotsOffTargetAway = getNum([
      ["team_stats", "away", "shots", "offtarget"],
      ["team_stats", "away", "shots", "off_target"],
      ["team_stats", "away", "shots_off_target"],
    ]);
    const shotsBlockedHome = getNum([
      ["team_stats", "home", "shots", "blocked"],
      ["team_stats", "home", "shots_blocked"],
    ]);
    const shotsBlockedAway = getNum([
      ["team_stats", "away", "shots", "blocked"],
      ["team_stats", "away", "shots_blocked"],
    ]);
    const woodworkHome = getNum([
      ["team_stats", "home", "shots", "woodwork"],
      ["team_stats", "home", "hit_woodwork"],
      ["team_stats", "home", "shots_woodwork"],
    ]);
    const woodworkAway = getNum([
      ["team_stats", "away", "shots", "woodwork"],
      ["team_stats", "away", "hit_woodwork"],
      ["team_stats", "away", "shots_woodwork"],
    ]);

    // Fouls
    const foulsHome = getNum([
      ["team_stats", "home", "fouls", "committed"],
      ["team_stats", "home", "fouls", "total"],
      ["team_stats", "home", "fouls"],
    ]);
    const foulsAway = getNum([
      ["team_stats", "away", "fouls", "committed"],
      ["team_stats", "away", "fouls", "total"],
      ["team_stats", "away", "fouls"],
    ]);

    // Offsides
    const offsidesHome = getNum([
      ["team_stats", "home", "offsides", "total"],
      ["team_stats", "home", "offsides"],
    ]);
    const offsidesAway = getNum([
      ["team_stats", "away", "offsides", "total"],
      ["team_stats", "away", "offsides"],
    ]);

    // Saves
    const savesHome = getNum([
      ["team_stats", "home", "saves", "total"],
      ["team_stats", "home", "saves"],
    ]);
    const savesAway = getNum([
      ["team_stats", "away", "saves", "total"],
      ["team_stats", "away", "saves"],
    ]);

    // Attacks / Dangerous attacks
    const dangerousAttacksHome = getNum([
      ["team_stats", "home", "dangerous_attacks", "total"],
      ["team_stats", "home", "dangerous_attacks"],
    ]);
    const dangerousAttacksAway = getNum([
      ["team_stats", "away", "dangerous_attacks", "total"],
      ["team_stats", "away", "dangerous_attacks"],
    ]);
    const attacksHome = getNum([
      ["team_stats", "home", "attacks", "total"],
      ["team_stats", "home", "attacks"],
    ]);
    const attacksAway = getNum([
      ["team_stats", "away", "attacks", "total"],
      ["team_stats", "away", "attacks"],
    ]);

    // xG
    const xgHome = getNum([
      ["team_stats", "home", "xg", "total"],
      ["team_stats", "home", "expected_goals", "total"],
      ["team_stats", "home", "xg"],
    ]);
    const xgAway = getNum([
      ["team_stats", "away", "xg", "total"],
      ["team_stats", "away", "expected_goals", "total"],
      ["team_stats", "away", "xg"],
    ]);

    // Throw-ins
    const throwInsHome = getNum([
      ["team_stats", "home", "throw_ins", "total"],
      ["team_stats", "home", "throw_ins"],
    ]);
    const throwInsAway = getNum([
      ["team_stats", "away", "throw_ins", "total"],
      ["team_stats", "away", "throw_ins"],
    ]);

    // Crosses
    const crossesHome = getNum([
      ["team_stats", "home", "crosses", "total"],
      ["team_stats", "home", "crosses"],
    ]);
    const crossesAway = getNum([
      ["team_stats", "away", "crosses", "total"],
      ["team_stats", "away", "crosses"],
    ]);

    // Passes
    const passesHome = getNum([
      ["team_stats", "home", "passes", "total"],
      ["team_stats", "home", "passes"],
    ]);
    const passesAway = getNum([
      ["team_stats", "away", "passes", "total"],
      ["team_stats", "away", "passes"],
    ]);
    const passAccuracyHome = getNum([
      ["team_stats", "home", "passes", "accuracy"],
      ["team_stats", "home", "pass_accuracy"],
    ]);
    const passAccuracyAway = getNum([
      ["team_stats", "away", "passes", "accuracy"],
      ["team_stats", "away", "pass_accuracy"],
    ]);

    const ev = get(data, ["event_summary"]) as
      | Record<string, unknown>
      | undefined;
    const toArr = (v: unknown): Record<string, unknown>[] => {
      if (!v) return [];
      if (Array.isArray(v))
        return v.filter((x) => x && typeof x === "object") as Record<
          string,
          unknown
        >[];
      if (typeof v === "object") return [v as Record<string, unknown>];
      return [];
    };
    const countYellowCards = (side: "home" | "away"): number => {
      const s = ev?.[side] as Record<string, unknown> | undefined;
      return toArr((s?.["yellowcards"] as Record<string, unknown> | undefined)?.["event"]).length;
    };
    const countRedCards = (side: "home" | "away"): number => {
      const s = ev?.[side] as Record<string, unknown> | undefined;
      return toArr((s?.["redcards"] as Record<string, unknown> | undefined)?.["event"]).length;
    };
    const countCards = (side: "home" | "away"): number =>
      countYellowCards(side) + countRedCards(side);
    const cardsTotal = countCards("home") + countCards("away");

    const yellowCardsHome = countYellowCards("home");
    const yellowCardsAway = countYellowCards("away");
    const redCardsHomeCount = countRedCards("home");
    const redCardsAwayCount = countRedCards("away");

    const parseMinute = (e: Record<string, unknown>): number => {
      const m = toNum(e["minute"]) ?? 0;
      const ex = toNum(e["extra_min"]) ?? 0;
      return m * 100 + ex;
    };
    const mapGoalEvents = (
      side: "home" | "away",
    ): Array<{
      team: "home" | "away";
      minute: number;
      extraMinute?: number;
      playerName: string;
      assistName?: string;
      ownGoal?: boolean;
      penalty?: boolean;
      varCancelled?: boolean;
    }> => {
      const s = ev?.[side] as Record<string, unknown> | undefined;
      const goals = toArr(
        (s?.["goals"] as Record<string, unknown> | undefined)?.["event"],
      );
      return goals.map((goal) => {
        const minute = toNum(goal["minute"]) ?? 0;
        const extraMinute = toNum(goal["extra_min"]);
        const playerName = String(
          goal["player_name"] ?? goal["player"] ?? "",
        ).trim();
        const assistName = String(
          goal["assist_player_name"] ?? goal["assist_player"] ?? "",
        ).trim();
        return {
          team: side,
          minute,
          ...(extraMinute != null ? { extraMinute } : {}),
          playerName,
          ...(assistName ? { assistName } : {}),
          ...(toBool(goal["own_goal"]) ? { ownGoal: true } : {}),
          ...(toBool(goal["penalty"]) ? { penalty: true } : {}),
          ...(toBool(goal["var_cancelled"]) ? { varCancelled: true } : {}),
        };
      });
    };
    const mapCardEvents = (
      side: "home" | "away",
      cardType: "yellow" | "red",
    ): Array<{
      team: "home" | "away";
      minute: number;
      extraMinute?: number;
      playerName: string;
      cardType: "yellow" | "red";
    }> => {
      const s = ev?.[side] as Record<string, unknown> | undefined;
      const cards = toArr(
        (
          s?.[cardType === "yellow" ? "yellowcards" : "redcards"] as
            | Record<string, unknown>
            | undefined
        )?.["event"],
      );
      return cards.map((card) => {
        const minute = toNum(card["minute"]) ?? 0;
        const extraMinute = toNum(card["extra_min"]);
        const playerName = String(
          card["player_name"] ?? card["player"] ?? "",
        ).trim();
        return {
          team: side,
          minute,
          ...(extraMinute != null ? { extraMinute } : {}),
          playerName,
          cardType,
        };
      });
    };
    const minOrNull = (vals: number[]): number | null =>
      vals.length ? vals.reduce((a, b) => Math.min(a, b), vals[0]!) : null;
    const homeGoalsArr = (() => {
      const s = ev?.["home"] as Record<string, unknown> | undefined;
      const goals = toArr(
        (s?.["goals"] as Record<string, unknown> | undefined)?.["event"],
      );
      return goals.map(parseMinute).filter((n) => Number.isFinite(n));
    })();
    const awayGoalsArr = (() => {
      const s = ev?.["away"] as Record<string, unknown> | undefined;
      const goals = toArr(
        (s?.["goals"] as Record<string, unknown> | undefined)?.["event"],
      );
      return goals.map(parseMinute).filter((n) => Number.isFinite(n));
    })();
    const fgH = minOrNull(homeGoalsArr);
    const fgA = minOrNull(awayGoalsArr);
    const firstGoal =
      fgH == null && fgA == null
        ? "none"
        : fgH != null && fgA == null
          ? "home"
          : fgH == null && fgA != null
            ? "away"
            : (fgH as number) <= (fgA as number)
              ? "home"
              : "away";
    const goalEvents = [
      ...mapGoalEvents("home"),
      ...mapGoalEvents("away"),
    ].sort(
      (a, b) =>
        a.minute * 100 +
        (a.extraMinute ?? 0) -
        (b.minute * 100 + (b.extraMinute ?? 0)),
    );
    const cardEvents = [
      ...mapCardEvents("home", "yellow"),
      ...mapCardEvents("away", "yellow"),
      ...mapCardEvents("home", "red"),
      ...mapCardEvents("away", "red"),
    ].sort(
      (a, b) =>
        a.minute * 100 +
        (a.extraMinute ?? 0) -
        (b.minute * 100 + (b.extraMinute ?? 0)),
    );

    const maybeNum = (n: number | undefined): number | undefined =>
      n !== undefined && Number.isFinite(n) ? n : undefined;

    return {
      cornersTotal: maybeNum(cornersTotal),
      cardsTotal: maybeNum(cardsTotal),
      firstGoal,
      // Per-team stats
      cornersHome: maybeNum(cornersHome),
      cornersAway: maybeNum(cornersAway),
      possessionHome: maybeNum(possessionHome),
      possessionAway: maybeNum(possessionAway),
      shotsTotalHome: maybeNum(shotsTotalHome),
      shotsTotalAway: maybeNum(shotsTotalAway),
      shotsOnTargetHome: maybeNum(shotsOnTargetHome),
      shotsOnTargetAway: maybeNum(shotsOnTargetAway),
      shotsOffTargetHome: maybeNum(shotsOffTargetHome),
      shotsOffTargetAway: maybeNum(shotsOffTargetAway),
      shotsBlockedHome: maybeNum(shotsBlockedHome),
      shotsBlockedAway: maybeNum(shotsBlockedAway),
      woodworkHome: maybeNum(woodworkHome),
      woodworkAway: maybeNum(woodworkAway),
      foulsHome: maybeNum(foulsHome),
      foulsAway: maybeNum(foulsAway),
      yellowCardsHome: maybeNum(yellowCardsHome),
      yellowCardsAway: maybeNum(yellowCardsAway),
      redCardsHomeCount: maybeNum(redCardsHomeCount),
      redCardsAwayCount: maybeNum(redCardsAwayCount),
      offsidesHome: maybeNum(offsidesHome),
      offsidesAway: maybeNum(offsidesAway),
      savesHome: maybeNum(savesHome),
      savesAway: maybeNum(savesAway),
      dangerousAttacksHome: maybeNum(dangerousAttacksHome),
      dangerousAttacksAway: maybeNum(dangerousAttacksAway),
      attacksHome: maybeNum(attacksHome),
      attacksAway: maybeNum(attacksAway),
      xgHome: maybeNum(xgHome),
      xgAway: maybeNum(xgAway),
      throwInsHome: maybeNum(throwInsHome),
      throwInsAway: maybeNum(throwInsAway),
      crossesHome: maybeNum(crossesHome),
      crossesAway: maybeNum(crossesAway),
      passesHome: maybeNum(passesHome),
      passesAway: maybeNum(passesAway),
      passAccuracyHome: maybeNum(passAccuracyHome),
      passAccuracyAway: maybeNum(passAccuracyAway),
      ...(goalEvents.length > 0 || cardEvents.length > 0
        ? {
            football: {
              ...(goalEvents.length > 0 ? { goals: goalEvents } : {}),
              ...(cardEvents.length > 0 ? { cards: cardEvents } : {}),
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

// Normaliser helpers
function v2TeamName(t: string | SAPIV2TeamObj | undefined): string {
  if (!t) return "Unknown";
  return typeof t === "string" ? t : (t.name ?? "Unknown");
}
function v2CurrentScore(s: number | SAPIV2ScoreObj | undefined): number {
  if (s === undefined || s === null) return 0;
  return typeof s === "number" ? s : (s.current ?? 0);
}
function v2StatusStr(s: string | SAPIV2StatusObj | undefined): string {
  if (!s) return "";
  return typeof s === "string" ? s : (s.description ?? "");
}
function v2StatusCode(ev: SAPIV2Event): number | undefined {
  const s = ev.status;
  if (typeof s === "object" && s.code !== undefined) return s.code;
  return ev.statusCode;
}

/** Returns the current Europe/Lisbon UTC offset in hours (+0 WET winter, +1 WEST summer). */
function lisbonOffsetHours(): number {
  const now = new Date();
  const utcH = now.getUTCHours();
  let lisbonH = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Lisbon",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (lisbonH === 24) lisbonH = 0;
  let diff = lisbonH - utcH;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff; // typically +0 (Nov–Mar) or +1 (Mar–Oct)
}

/**
 * Extract country name from a SportsAPI V2 event's tournament.
 * Prefers category.country.name (most specific), falls back to category.name.
 */
function v2TournCountry(ev: SAPIV2Event): string {
  const t = ev.tournament;
  if (typeof t === "object") {
    const cat = t.category;
    if (cat?.country?.name) return cat.country.name.toLowerCase();
    if (cat?.country?.alpha2) return cat.country.alpha2.toLowerCase();
    if (cat?.name) return cat.name.toLowerCase();
  }
  return "";
}
function cleanLeagueName(raw: string): string {
  // Remove duplicated round segments: "Ilkley - Round of 32 Round of 32 Round" → "Ilkley - Round of 32"
  let s = raw.replace(/(Round of \d+)(?:\s+\1)+(?:\s+Round)?\b/gi, "$1");
  // Remove orphan trailing " Round" after a dash/hyphen: "City - Round of 32 Round" → "City - Round of 32"
  s = s.replace(/(\bRound of \d+)\s+Round\b/gi, "$1");
  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function v2TournName(t: string | SAPIV2TournObj | undefined): string {
  if (!t) return "Unknown";
  const raw = typeof t === "string" ? t : (t.name ?? "Unknown");
  return cleanLeagueName(raw);
}

/**
 * Builds a user-facing league label for a V2 tennis tournament object.
 * Returns labels like "ATP 250 · S-Hertogenbosch", "WTA 500 · London", etc.
 * Falls back to plain v2TournName when category info is missing.
 */
// City-based tier fallback for when the V2 API slugs don't encode tier explicitly.
// Rank values match tennisTierRank: 3=1000, 4=500, 5=250, 6=Challenger.
const ATP_CITY_TIER: Record<string, number> = {
  // Masters 1000
  "indian wells": 3,
  miami: 3,
  "monte carlo": 3,
  "monte-carlo": 3,
  madrid: 3,
  rome: 3,
  canada: 3,
  montreal: 3,
  toronto: 3,
  cincinnati: 3,
  paris: 3,
  shanghai: 3,
  // ATP 500
  rotterdam: 4,
  dubai: 4,
  acapulco: 4,
  barcelona: 4,
  halle: 4,
  queen: 4,
  queens: 4,
  hamburg: 4,
  beijing: 4,
  tokyo: 4,
  vienna: 4,
  basel: 4,
  washington: 4,
  rio: 4,
  "rio de janeiro": 4,
  // ATP 250
  "s-hertogenbosch": 5,
  hertogenbosch: 5,
  eastbourne: 5,
  nottingham: 5,
  stuttgart: 5,
  lyon: 5,
  geneva: 5,
  munich: 5,
  marrakech: 5,
  estoril: 5,
  bucharest: 5,
  umag: 5,
  bastad: 5,
  gstaad: 5,
  newport: 5,
  kitzbuhel: 5,
  "winston-salem": 5,
  "winston salem": 5,
  chengdu: 5,
  hangzhou: 5,
  sofia: 5,
  antwerp: 5,
  montpellier: 5,
  cordoba: 5,
  quito: 5,
  dallas: 5,
  auckland: 5,
  adelaide: 5,
  doha: 5,
  pune: 5,
  "newport beach": 5,
  "san jose": 5,
  ilkley: 5,
  surbiton: 5,
  rosmalen: 5,
};
const WTA_CITY_TIER: Record<string, number> = {
  // WTA 1000 / Grand Slam host cities
  wimbledon: 1,
  // WTA 500 — named tournaments
  rothesay: 4,
  cinch: 4,
  // WTA 1000
  "indian wells": 3,
  miami: 3,
  madrid: 3,
  rome: 3,
  montreal: 3,
  toronto: 3,
  cincinnati: 3,
  wuhan: 3,
  beijing: 3,
  // WTA 500
  "abu dhabi": 4,
  doha: 4,
  dubai: 4,
  strasbourg: 4,
  berlin: 4,
  eastbourne: 4,
  "san jose": 4,
  guangzhou: 4,
  guangdong: 4,
  guadalajara: 4,
  ostrava: 4,
  london: 4,
  // WTA 250
  "s-hertogenbosch": 5,
  hertogenbosch: 5,
  nottingham: 5,
  birmingham: 5,
  stuttgart: 5,
  lyon: 5,
  budapest: 5,
  bogota: 5,
  lausanne: 5,
  hamburg: 5,
  palermo: 5,
  "montreal wta": 5,
  nanchang: 5,
  ilkley: 5,
  bratislava: 5,
  surbiton: 5,
  rosmalen: 5,
  "bad homburg": 5,
};

function tennisTournLabel(
  tournament: string | SAPIV2TournObj | undefined,
): string {
  const base = v2TournName(tournament);
  if (!tournament || typeof tournament === "string") return base;
  const t = tournament as SAPIV2TournObj;
  const catRaw = (t.category?.name ?? "").trim().toUpperCase();
  const catSlug = (t.category?.slug ?? "").toLowerCase();
  const cat =
    catRaw === "ATP"
      ? "ATP"
      : catRaw === "WTA"
        ? "WTA"
        : catSlug.startsWith("atp")
          ? "ATP"
          : catSlug.startsWith("wta")
            ? "WTA"
            : catRaw;
  if (cat !== "ATP" && cat !== "WTA") return base;

  // Strip ", Country" suffix for a cleaner display name
  // e.g. "S-Hertogenbosch, Netherlands" → "S-Hertogenbosch"
  const displayBase = base.includes(",") ? base.split(",")[0]!.trim() : base;

  const searchText = tennisTournamentSearchText(tournament);
  let rank = tennisTierRank(searchText);

  // Fallback: look up by normalised city name when tier not found in search text
  if (rank === 999) {
    const cityNorm = displayBase
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/-/g, " ")
      .trim();
    const cityMap = cat === "ATP" ? ATP_CITY_TIER : WTA_CITY_TIER;
    for (const [city, r] of Object.entries(cityMap)) {
      if (cityNorm.includes(city) || city.includes(cityNorm)) {
        rank = r;
        break;
      }
    }
  }

  let tier = "";
  if (rank === 1) tier = "Grand Slam";
  else if (rank === 2) tier = `${cat} Finals`;
  else if (rank === 3) tier = `${cat} 1000`;
  else if (rank === 4) tier = `${cat} 500`;
  else if (rank === 5) tier = `${cat} 250`;
  else if (rank === 6) tier = "Challenger";
  else tier = cat;
  return tier ? `${tier} · ${displayBase}` : displayBase;
}

// ── V1 tennis league label cache ─────────────────────────────────────────────
// Populated from V2 today/live events; maps normalized base name → full tier label.
// Used to enrich V1 game league labels that only carry city names.
const _tennisV2LeagueLabelByCompName = new Map<string, string>();

function refreshTennisV2LeagueCache(events: SAPIV2Event[]): void {
  for (const ev of events) {
    if (!ev.tournament || typeof ev.tournament === "string") continue;
    const label = tennisTournLabel(ev.tournament);
    const base = v2TournName(ev.tournament);
    if (!base || base === "Unknown" || label === base) continue;
    const norm = base
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (!_tennisV2LeagueLabelByCompName.has(norm)) {
      _tennisV2LeagueLabelByCompName.set(norm, label);
    }
  }
}

/**
 * Returns true if the raw event (Record<string, unknown>) belongs to the primary
 * competition we show for a given sport.  Used by getV2TournamentIds and
 * getUpcomingLeagueEventsV2 to exclude non-target tournaments.
 */
function isMainLeagueEventRaw(
  sport: SportKey,
  e: Record<string, unknown>,
): boolean {
  if (sport === "football") return true;
  const t = e["tournament"] as Record<string, unknown> | undefined;
  const slug = String(t?.["slug"] ?? "").toLowerCase();
  const name = String(t?.["name"] ?? "").toLowerCase();
  switch (sport) {
    case "basketball":
      // Match NBA or NBA Playoffs; exclude WNBA (slug/name contains "nba" but also "wnba")
      return (
        (slug.includes("nba") || name.includes("nba")) &&
        !slug.includes("wnba") &&
        !name.includes("wnba")
      );
    case "hockey":
      return slug.includes("nhl") || name.includes("nhl");
    case "baseball":
      return slug.includes("mlb") || name.includes("mlb");
    case "tennis": {
      const cat = String(
        (t?.["category"] as Record<string, unknown> | undefined)?.["name"] ??
          "",
      );
      if (cat !== "ATP" && cat !== "WTA") return false;
      // The V2 API may have wrong slugs for doubles/qualifying — check the name too
      if (name.includes("double") || name.includes("qualifying")) return false;
      if (slug.includes("double") || slug.includes("qualifying")) return false;
      return true;
    }
    default:
      return true;
  }
}

// ─── Caches ───────────────────────────────────────────────────────────────────

// Track Statpal's own updated_ts so we can detect a frozen feed
let liveFeedUpdatedTs = 0;

// ─── SSE + WebSocket clients ───────────────────────────────────────────────────
interface SSEClient {
  write: (chunk: string) => boolean;
}
const sseClients = new Set<SSEClient>();
const wsLiveClients = new Set<WsClient>();
let broadcastInProgress = false;
// When a score patch arrives while a broadcast is already running, set this flag
// so the broadcast runs again immediately after finishing (instead of being dropped).
let broadcastPending = false;
let consecutiveEmptyBroadcasts = 0;
let lastBroadcastAt = 0;

// Global buffer for delta updates — collected over 40ms and flushed in a single packet (MAX plan tuned)
let pendingBatchUpdates: Array<{
  matchId: string;
  delta: Partial<LiveMatchState>;
}> = [];
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatchUpdates(): void {
  if (batchFlushTimer) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
  }
  if (pendingBatchUpdates.length === 0) return;

  const updates = [...pendingBatchUpdates];
  pendingBatchUpdates = [];

  // Deduplicate: only send the latest delta for each matchId in this batch
  const latestByMatch = new Map<string, Partial<LiveMatchState>>();
  for (const { matchId, delta } of updates) {
    const existing = latestByMatch.get(matchId) || {};
    latestByMatch.set(matchId, { ...existing, ...delta });
  }

  const finalUpdates = Array.from(latestByMatch.entries()).map(
    ([matchId, delta]) => ({ matchId, delta }),
  );
  _executeBroadcastBatch(finalUpdates);
}

function _executeBroadcastBatch(
  updates: Array<{ matchId: string; delta: Partial<LiveMatchState> }>,
): void {
  if (updates.length === 0) return;
  if (sseClients.size === 0 && wsLiveClients.size === 0) return;

  const msgObj = { type: "batch_update", updates };
  const jsonStr = JSON.stringify(msgObj);

  // 1. WebSocket clients
  if (wsLiveClients.size > 0) {
    for (const ws of wsLiveClients) {
      try {
        if (ws.readyState === 1) ws.send(jsonStr);
        else wsLiveClients.delete(ws);
      } catch {
        wsLiveClients.delete(ws);
      }
    }
  }

  // 2. SSE clients
  if (sseClients.size > 0) {
    const sseChunk = `data: ${jsonStr}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(sseChunk);
      } catch {
        sseClients.delete(client);
      }
    }
  }
}

setInterval(() => {
  if (sseClients.size === 0 && wsLiveClients.size === 0) return;
  broadcastLive().catch(() => {});
}, CONFIG.LIVE_UPDATE_INTERVAL);

// ─── Volleyball score delta poller — REMOVED ──────────────────────────────────
// Used to poll Statpal's volleyball live endpoint every 3s independently of
// buildLivePayload (so removing volleyball from the live pipeline didn't stop
// this — it kept calling Statpal on its own timer). Volleyball has no live
// data source at all now (explicit user decision, 2026-08-06: PulseScore-only
// on the live page); removed outright rather than left polling a provider
// with nothing to broadcast to.

// Proactively keep the live payload cache warm even with no SSE/WS clients
// connected (e.g. right after a server restart, or while everyone is on the
// pre-match/main tabs). Without this, the cache goes stale after
// LIVE_PAYLOAD_CACHE_TTL_MS and the next hit to GET /live pays the full
// multi-second upstream build cost synchronously — the "Ao Vivo" tab taking
// much longer to load than the pre-match tab. Runs at the same cadence as the
// cache TTL so a request almost never lands on a cold cache.
// NOTE: LIVE_PAYLOAD_CACHE_TTL_MS is declared later in this file; that's fine
// for values only *read* inside a callback (evaluated at call time, well
// after module init), but it must never be used as the interval's delay
// argument itself, since that's evaluated immediately at module load — before
// the const exists — and would throw. Use a literal delay here instead.
setInterval(() => {
  getLivePayloadCached().catch(() => {});
}, 900);

// v2/daily today: cache 5min
let dailyCache: SAPILeagueV2[] | null = null;
let dailyFetchedAt = 0;

// Ground-truth scheduled kickoff (epoch seconds) per football event id, captured
// from the pre-match schedule feed (getUpcomingEventsV2) *before* the match ever
// appears live. The live feed's own self-reported startTimestamp can be wrong —
// some providers report a fixture's date/time as already-past in lockstep with a
// fake early "live" status, which defeats a guard that only trusts the live feed.
// This map is populated purely from the schedule/upcoming source, so it can't be
// corrupted by a bad live-status glitch, and is used to gate when a match is
// allowed to actually enter the live list.
const footballScheduledKickoffSec = new Map<number, number>();

// V2 /api/today cache — 60s TTL (includes not-started + live events for the current day)
let tennisTodayV2Cache: SAPIV2Event[] | null = null;
let tennisTodayV2FetchedAt = 0;
const TODAY_V2_TTL = 60_000;

// v1 odds: map from match numeric ID → real odds; cache 10min
type RealOdds = { home: number; draw: number; away: number; types: OddsType[] };
let oddsMap: Map<string, RealOdds> | null = null;
let oddsFetchedAt = 0;

// NHL livescores cache (30s)
type NHLGoalEvent = {
  min: string;
  player: string;
  playerid: string;
  result: string;
  team: string;
  type: string;
  assist: string;
  comment: string;
};
type NHLPeriodData = { score?: string; event?: NHLGoalEvent | NHLGoalEvent[] };
type NHLMatch = {
  id: string;
  fix_id: string;
  status: string;
  time: string;
  timer: string;
  date?: string;
  home: { id: string; name: string; totalscore: string };
  away: { id: string; name: string; totalscore: string };
  events?: {
    firstperiod?: NHLPeriodData;
    secondperiod?: NHLPeriodData;
    thirdperiod?: NHLPeriodData;
    overtime?: NHLPeriodData;
    penalties?: NHLPeriodData;
  };
};
type NHLTournament = {
  country: string;
  gid: string;
  id: string;
  league: string;
  match: NHLMatch | NHLMatch[];
};
let nhlLiveCache: NHLTournament[] | null = null;
let nhlLiveFetchedAt = 0;

// ─── MLB (Baseball) types ─────────────────────────────────────────────────────
type MLBTeam = {
  id: string;
  name: string;
  totalscore: string;
  r: string;
  hits: string;
  errors: string;
  in1: string;
  in2: string;
  in3: string;
  in4: string;
  in5: string;
  in6: string;
  in7: string;
  in8: string;
  in9: string;
};
type MLBMatch = {
  id: string;
  status: string;
  time: string;
  date?: string;
  datetime_utc?: string;
  venue_name?: string;
  outs?: string;
  home: MLBTeam;
  away: MLBTeam;
  starting_pitchers?: {
    home?: { player?: { id: string; name: string } };
    away?: { player?: { id: string; name: string } };
  };
};
type MLBTournament = {
  country: string;
  id: string;
  league: string;
  match: MLBMatch | MLBMatch[];
};
let mlbLiveCache: MLBTournament[] | null = null;
let mlbLiveFetchedAt = 0;
// Raw odds map (home|away → real odds) kept across cache refreshes — includes games already started
const mlbRawOddsMap = new Map<string, { h: number; a: number }>();
// Sticky live: once a game is seen as live, keep it in the feed for up to 4 min
// even if the API temporarily returns a non-live status (between-inning transitions, API glitches)
const mlbLiveStickyMap = new Map<
  string,
  { match: LiveMatchState; lastSeenMs: number }
>();
const MLB_STICKY_TTL_MS = 4 * 60 * 1_000; // 4 minutes grace period

type NBAMatch = {
  id: string;
  stats_id?: string;
  status: string;
  time: string;
  timer: string;
  date?: string;
  home: {
    id: string;
    name: string;
    ot?: string;
    q1?: string;
    q2?: string;
    q3?: string;
    q4?: string;
    totalscore: string;
  };
  away: {
    id: string;
    name: string;
    ot?: string;
    q1?: string;
    q2?: string;
    q3?: string;
    q4?: string;
    totalscore: string;
  };
};
type NBATournament = {
  country: string;
  gid: string;
  id: string;
  league: string;
  match: NBAMatch | NBAMatch[];
};
let nbaLiveCache: NBATournament[] | null = null;
let nbaLiveFetchedAt = 0;

// Tennis livescores cache (30s)
type TennisPlayer = {
  id: string;
  name: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  game_score: string; // "0" | "15" | "30" | "40" | "AD" | ""
  serve: string; // "True" | "False"
  totalscore: string; // sets won
  winner: string;
  dp1?: string;
  dp2?: string;
};
type TennisMatch = {
  id: string;
  status: string;
  time: string;
  date: string;
  tb: string;
  player: TennisPlayer | TennisPlayer[];
};
type TennisTournament = {
  id: string;
  name: string;
  match: TennisMatch | TennisMatch[];
};
let tennisLiveCache: TennisTournament[] | null = null;
let tennisLiveFetchedAt = 0;
const TENNIS_LIVE_CACHE_TTL = 2_000; // 2s — real-time tennis points

// Tennis match stats (parsed from livestats endpoint)
type TennisStatData = {
  aces: number;
  doubleFaults: number;
  firstServePct: string; // e.g. "66%"
  winners: number;
  unforcedErrors: number;
};

type FootballExtras = {
  cornersTotal?: number;
  cardsTotal?: number;
  firstGoal?: "home" | "away" | "none";
  // per-team live stats from /match/{id}/statistics
  cornersHome?: number;
  cornersAway?: number;
  possessionHome?: number;
  possessionAway?: number;
  shotsTotalHome?: number;
  shotsTotalAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHomeCount?: number;
  redCardsAwayCount?: number;
  offsidesHome?: number;
  offsidesAway?: number;
  savesHome?: number;
  savesAway?: number;
  dangerousAttacksHome?: number;
  dangerousAttacksAway?: number;
  attacksHome?: number;
  attacksAway?: number;
  xgHome?: number;
  xgAway?: number;
  throwInsHome?: number;
  throwInsAway?: number;
  crossesHome?: number;
  crossesAway?: number;
  passesHome?: number;
  passesAway?: number;
  passAccuracyHome?: number;
  passAccuracyAway?: number;
  shotsOffTargetHome?: number;
  shotsOffTargetAway?: number;
  shotsBlockedHome?: number;
  shotsBlockedAway?: number;
  woodworkHome?: number;
  woodworkAway?: number;
  football?: {
    goals?: Array<{
      team: "home" | "away";
      minute: number;
      extraMinute?: number;
      playerName: string;
      assistName?: string;
      ownGoal?: boolean;
      penalty?: boolean;
      varCancelled?: boolean;
    }>;
    cards?: Array<{
      team: "home" | "away";
      minute: number;
      extraMinute?: number;
      playerName: string;
      cardType: "yellow" | "red";
    }>;
  };
};

// Volleyball livescores cache (30s)
type VolleyTeam = {
  id: string;
  name: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  totalscore: string;
};
type VolleyMatch = {
  id: string;
  status: string;
  time: string;
  date: string;
  home: VolleyTeam;
  away: VolleyTeam;
};
type VolleyTournament = {
  id: string;
  gid: string;
  country: string;
  league: string;
  match: VolleyMatch | VolleyMatch[];
};
let volleyLiveCache: VolleyTournament[] | null = null;
let volleyLiveFetchedAt = 0;
// Was 4s — matched to the ~1s SSE broadcast tick (CONFIG.LIVE_UPDATE_INTERVAL)
// like football/tennis, since polling slower than the broadcast cadence just
// adds latency for no benefit (each broadcast tick would serve stale data
// until the next poll anyway).
const VOLLEY_LIVE_TTL = CONFIG.LIVE_UPDATE_INTERVAL;

// SportsAPI Pro V2 live fetch timestamps — the V2 live builders that used to
// populate these (and the parallel *LiveV2Cache arrays) were deleted when all
// sports data providers were disconnected from live (2026-08-06); these stay
// at 0 forever now, which /feed-status reports honestly as "not connected".
let footballLiveV2FetchedAt = 0;
let basketballLiveV2FetchedAt = 0;
let hockeyLiveV2FetchedAt = 0;
let baseballLiveV2FetchedAt = 0;
let tennisLiveV2FetchedAt = 0;

const v2FootballOddsCache = new Map<
  string,
  { home: number; draw: number; away: number }
>();
const V2_FOOTBALL_ODDS_TTL = 30 * 60_000;

// V1 tennis native format (all endpoint — different schema from SAPIV2Event)
interface V1TennisStage {
  id: number;
  name: string;
  shortName?: string;
  homeCompetitorScore: number;
  awayCompetitorScore: number;
  isLive?: boolean;
  isEnded?: boolean;
}

interface V1TennisGame {
  id: number;
  competitionId?: number;
  competitionDisplayName?: string;
  startTime: string;
  statusGroup?: number; // 1=live, 2=scheduled, 3=finished
  statusText?: string;
  homeCompetitor?: {
    id?: number;
    name?: string;
    score?: number;
    isWinner?: boolean;
  };
  awayCompetitor?: {
    id?: number;
    name?: string;
    score?: number;
    isWinner?: boolean;
  };
  stageName?: string;
  roundName?: string;
  // stages: per-set (and game-level) breakdown — present when API returns detail
  stages?: V1TennisStage[];
}
let _tennisAllV1Cache: V1TennisGame[] | null = null;
let _tennisAllV1FetchedAt = 0;

// Tennis daily results (d-1 = yesterday) — longer TTL (yesterday won't change)
type TennisDailyResult = {
  id: string;
  home: string;
  away: string;
  sets: Array<[number, number]>;
  homeWon: boolean;
  status: string; // "Finished" | "Retired" | "Walkover"
  tournament: string;
  date: string;
  time: string;
};
let tennisResultsCache: TennisDailyResult[] | null = null;
let tennisResultsFetchedAt = 0;
const RESULTS_CACHE_TTL = 5 * 60 * 1000; // 5 min

// Volleyball yesterday results
type VolleyDailyResult = {
  id: string;
  home: string;
  away: string;
  homeSets: number;
  awaySets: number;
  sets: Array<[number, number]>;
  homeWon: boolean;
  league: string;
  country: string;
  date: string;
  time: string;
};
let volleyResultsCache: VolleyDailyResult[] | null = null;
let volleyResultsFetchedAt = 0;

// NHL season schedule
type NHLTeamStats = {
  shotsOnGoal: number;
  savesPct: number;
  ppGoals: number;
  ppPct: number;
  penKillPct: number;
  faceoffPct: number;
  penaltyMinutes: number;
};
type HockeyScheduleMatch = {
  id: string;
  date: string;
  time: string;
  status: string;
  venue?: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  periods: Array<[number, number]>;
  homeWon?: boolean;
  teamStats?: { home: NHLTeamStats; away: NHLTeamStats };
};
type HockeyScheduleData = {
  league: string;
  season: string;
  upcomingMatches: HockeyScheduleMatch[];
  recentMatches: HockeyScheduleMatch[];
};
let hockeyScheduleCache: HockeyScheduleData | null = null;
let hockeyScheduleFetchedAt = 0;
const HOCKEY_SCHEDULE_TTL = 30 * 60 * 1000;

type MLBScheduleMatch = {
  id: string;
  date: string;
  time: string;
  status: string;
  venue?: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeWon?: boolean;
};
type MLBScheduleData = {
  league: string;
  season: string;
  upcomingMatches: MLBScheduleMatch[];
  recentMatches: MLBScheduleMatch[];
};
let mlbScheduleCache: MLBScheduleData | null = null;
let mlbScheduleFetchedAt = 0;
const MLB_SCHEDULE_TTL = 30 * 60 * 1000;

type BasketballScheduleMatch = {
  id: string;
  date: string;
  time: string;
  status: string;
  venue?: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  quarters: Array<[number, number]>;
  homeWon?: boolean;
};
type BasketballScheduleData = {
  league: string;
  season: string;
  upcomingMatches: BasketballScheduleMatch[];
  recentMatches: BasketballScheduleMatch[];
};
let basketballScheduleCache: BasketballScheduleData | null = null;
let basketballScheduleFetchedAt = 0;
const BBALL_SCHEDULE_TTL = 30 * 60 * 1000;

// NHL yesterday results
type HockeyDailyResult = {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  periods: Array<[number, number]>; // P1, P2, P3, [OT], [SO]
  homeWon: boolean;
  league: string;
  country: string;
  date: string;
  time: string;
};
let hockeyResultsCache: HockeyDailyResult[] | null = null;
let hockeyResultsFetchedAt = 0;

type MLBDailyResult = {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  innings: Array<[number | null, number | null]>; // null = inning not played (walk-off)
  hasExtra: boolean;
  homeWon: boolean;
  league: string;
  country: string;
  date: string;
  time: string;
};
let mlbResultsCache: MLBDailyResult[] | null = null;
let mlbResultsFetchedAt = 0;

type BasketballDailyResult = {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  quarters: Array<[number, number]>; // Q1, Q2, Q3, Q4, [OT]
  homeWon: boolean;
  league: string;
  country: string;
  date: string;
  time: string;
};
let basketballResultsCache: BasketballDailyResult[] | null = null;
let basketballResultsFetchedAt = 0;

// NHL standings
type NHLStandingsTeam = {
  id: string;
  name: string;
  abbr: string;
  position: number;
  gp: number;
  won: number;
  lost: number;
  otLosses: number;
  points: number;
  gf: number;
  ga: number;
  diff: string;
  streak: string;
  lastTen: string;
  homeRecord: string;
  roadRecord: string;
};
type NHLStandingsDivision = { name: string; teams: NHLStandingsTeam[] };
type NHLStandingsConference = {
  name: string;
  divisions: NHLStandingsDivision[];
};
type NHLStandingsData = {
  season: string;
  conferences: NHLStandingsConference[];
};
let hockeyStandingsCache: NHLStandingsData | null = null;
let hockeyStandingsFetchedAt = 0;
const HOCKEY_STANDINGS_TTL = 30 * 60 * 1000;

// MLB standings
type MLBStandingsTeam = {
  id: string;
  name: string;
  position: number;
  won: number;
  lost: number;
  gamesBack: string;
  streak: string;
  homeRecord: string;
  awayRecord: string;
  runsScored: number;
  runsAllowed: number;
  runsDiff: string;
};
type MLBStandingsDivision = { name: string; teams: MLBStandingsTeam[] };
type MLBStandingsLeague = { name: string; divisions: MLBStandingsDivision[] };
type MLBStandingsData = { season: string; leagues: MLBStandingsLeague[] };
let mlbStandingsCache: MLBStandingsData | null = null;
let mlbStandingsFetchedAt = 0;
const MLB_STANDINGS_TTL = 30 * 60 * 1000;

// MLB roster
type MLBRosterPlayer = {
  id: string;
  name: string;
  number: string;
  age: number;
  position: string;
  height: string;
  weight: string;
  bats: string;
  throws: string;
  salary: string;
};
type MLBRosterPosition = { name: string; players: MLBRosterPlayer[] };
type MLBRosterData = {
  teamName: string;
  abbreviation: string;
  season: string;
  positions: MLBRosterPosition[];
};
const mlbRosterCache = new Map<string, MLBRosterData>();
const mlbRosterFetchedAt = new Map<string, number>();
const MLB_ROSTER_TTL = 60 * 60 * 1000;

const MLB_ABBR: Record<string, string> = {
  "Arizona Diamondbacks": "ari",
  "Atlanta Braves": "atl",
  "Baltimore Orioles": "bal",
  "Boston Red Sox": "bos",
  "Chicago Cubs": "chc",
  "Chicago White Sox": "cws",
  "Cincinnati Reds": "cin",
  "Cleveland Guardians": "cle",
  "Colorado Rockies": "col",
  "Detroit Tigers": "det",
  "Houston Astros": "hou",
  "Kansas City Royals": "kc",
  "Los Angeles Angels": "laa",
  "Los Angeles Dodgers": "lad",
  "Miami Marlins": "mia",
  "Milwaukee Brewers": "mil",
  "Minnesota Twins": "min",
  "New York Mets": "nym",
  "New York Yankees": "nyy",
  "Oakland Athletics": "oak",
  "Sacramento Athletics": "oak",
  "Philadelphia Phillies": "phi",
  "Pittsburgh Pirates": "pit",
  "San Diego Padres": "sd",
  "San Francisco Giants": "sf",
  "Seattle Mariners": "sea",
  "St. Louis Cardinals": "stl",
  "Tampa Bay Rays": "tb",
  "Texas Rangers": "tex",
  "Toronto Blue Jays": "tor",
  "Washington Nationals": "wsh",
};

// NBA roster abbreviations (empirically matching Statpal's URL parameter)
// Standard NBA 3-letter codes (lowercase) — some may differ from Statpal's actual routing
const NBA_ABBR: Record<string, string> = {
  "Atlanta Hawks": "atl",
  "Boston Celtics": "bos",
  "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha",
  "Chicago Bulls": "chi",
  "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Detroit Pistons": "det",
  "Golden State Warriors": "gsw",
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "Los Angeles Clippers": "lac",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "nop",
  "New York Knicks": "nyk",
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sas",
  "Toronto Raptors": "tor",
  "Utah Jazz": "uta",
  "Washington Wizards": "was",
};

type NBAStandingsTeam = {
  id: string;
  name: string;
  abbr: string;
  position: number;
  won: number;
  lost: number;
  pct: string;
  gb: string;
  streak: string;
  lastTen: string;
  homeRecord: string;
  roadRecord: string;
  ppg: string;
  papg: string;
  diff: string;
};
type NBAStandingsDivision = { name: string; teams: NBAStandingsTeam[] };
type NBAStandingsConference = {
  name: string;
  divisions: NBAStandingsDivision[];
};
type NBAStandingsData = {
  season: string;
  conferences: NBAStandingsConference[];
};
let nbaStandingsCache: NBAStandingsData | null = null;
let nbaStandingsFetchedAt = 0;
const NBA_STANDINGS_TTL = 30 * 60 * 1000;

// NHL rosters
// Abbreviations as accepted by the Statpal roster endpoint (empirically verified)
const NHL_ABBR: Record<string, string> = {
  "Anaheim Ducks": "ana",
  "Boston Bruins": "bos",
  "Buffalo Sabres": "buf",
  "Calgary Flames": "cgy",
  "Carolina Hurricanes": "car",
  "Chicago Blackhawks": "chi",
  "Colorado Avalanche": "col",
  "Columbus Blue Jackets": "cbj",
  "Dallas Stars": "dal",
  "Detroit Red Wings": "det",
  "Edmonton Oilers": "edm",
  "Florida Panthers": "fla",
  "Los Angeles Kings": "la",
  "Minnesota Wild": "min",
  "Montreal Canadiens": "mtl",
  "Nashville Predators": "nsh",
  "New Jersey Devils": "nj",
  "New York Islanders": "nyi",
  "New York Rangers": "nyr",
  "Ottawa Senators": "ott",
  "Philadelphia Flyers": "phi",
  "Pittsburgh Penguins": "pit",
  "San Jose Sharks": "sj",
  "St. Louis Blues": "stl",
  "Tampa Bay Lightning": "tb",
  "Toronto Maple Leafs": "tor",
  "Vancouver Canucks": "van",
  "Washington Capitals": "wsh",
  "Winnipeg Jets": "wpg",
  // Teams without working roster endpoints on Statpal:
  // Vegas Golden Knights, Seattle Kraken, Arizona Coyotes, Utah Hockey Club
};
type NHLRosterPlayer = {
  id: string;
  name: string;
  number: string;
  age: number;
  birthPlace: string;
  height: string;
  weight: string;
  shot: string;
  salary: string;
};
type NHLRosterPosition = { name: string; players: NHLRosterPlayer[] };
type NHLRosterData = {
  teamName: string;
  abbreviation: string;
  season: string;
  positions: NHLRosterPosition[];
};
const hockeyRosterCache = new Map<string, NHLRosterData>();
const hockeyRosterFetchedAt = new Map<string, number>();
const HOCKEY_ROSTER_TTL = 60 * 60 * 1000;

// Volleyball season schedule
type VolleyScheduleMatch = {
  id: string;
  status: string;
  date: string;
  time: string;
  home: VolleyTeam;
  away: VolleyTeam;
};
type VolleyScheduleWeek = {
  number: string;
  match: VolleyScheduleMatch | VolleyScheduleMatch[];
};
type VolleyLeague = {
  id: string;
  gid: string;
  league: string;
  country: string;
};
type VolleyScheduleEntry = {
  id: string;
  home: string;
  away: string;
  homeSets: number;
  awaySets: number;
  sets: Array<[number, number]>;
  homeWon: boolean;
  date: string;
  time: string;
};
type VolleyScheduleData = {
  id: string;
  league: string;
  season: string;
  country: string;
  recentWeeks: Array<{ number: string; matches: VolleyScheduleEntry[] }>;
  nextWeek: {
    number: string;
    matches: Array<{
      id: string;
      home: string;
      away: string;
      date: string;
      time: string;
    }>;
  } | null;
};
const volleyScheduleCache = new Map<
  string,
  { data: VolleyScheduleData; at: number }
>();
const VOLLEY_SCHEDULE_TTL = 5 * 60 * 1000;

// Volleyball standings
type VolleyStandingTeam = {
  id: string;
  name: string;
  pos: string;
  gp: string;
  w: string;
  l: string;
  pts: string;
  points_for: string;
  points_against: string;
  recent_form: string;
  description?: { value: string } | string;
};
type VolleyStandingsData = {
  id: string;
  name: string;
  season: string;
  country: string;
  teams: VolleyStandingTeam[];
};
const volleyStandingsCache = new Map<
  string,
  { data: VolleyStandingsData; at: number }
>();
const VOLLEY_STANDINGS_TTL = 15 * 60 * 1000;

// Tennis tournament list (ATP + WTA) — active tournaments today
type TournamentRaw = {
  id: string;
  name: string;
  category: string;
  surface: string;
  location: string;
  date_start: string;
  date_end: string;
  prize_money: string;
};
type ActiveTournament = TournamentRaw & { tour: "atp" | "wta" };
let tourListCache: ActiveTournament[] | null = null;
let tourListFetchedAt = 0;
const TOUR_CACHE_TTL = 30 * 60 * 1000; // 30 min

// Live state: stable odds across refreshes
//
// Football's automatic settlement trigger (buildFootballLiveFromPulseScore's
// disappearance-based grace-period GC calling finalizeStaleLiveMatch — see
// that function) was temporarily gone between the 2026-08-06 provider
// disconnect and football's 2026-08-07 PulseScore re-instatement. Restored
// now — football bets settle the same way they did before the disconnect.
// settlement.ts's separate scan chain (scanVolleyballForFinished/
// scanTennisV1ForFinished/scanNHLForFinished/scanNBAForFinished/
// scanMLBForFinished) never covered football either way; this GC path is
// football's only settlement trigger, same as it's always been.
export const liveMatchState = new Map<string, LiveMatchState>();

// Finished football match results — populated when matches leave liveMatchState
// and from the daily feed scan. Consumed by the bet auto-settlement worker.
export const finishedMatchResults = new Map<
  string,
  {
    home: number;
    away: number;
    htHome?: number; // half-time goals (home) — populated when available
    htAway?: number; // half-time goals (away)
    homeTeam: string;
    awayTeam: string;
    status?: string; // match status (e.g. "FT", "Postponed", "Cancelled")
    cornersTotal?: number;
    cardsTotal?: number;
    firstGoal?: "home" | "away" | "none";
    extras?: unknown;
    finishedAt: number; // ms
  }
>();

function _pruneFinishedResults(): void {
  const cutoff = Date.now() - 96 * 60 * 60 * 1000;
  for (const [id, r] of finishedMatchResults.entries()) {
    if (r.finishedAt < cutoff) finishedMatchResults.delete(id);
  }
}

function extractFinishedTennisSets(
  hS: SAPIV2ScoreObj | null,
  aS: SAPIV2ScoreObj | null,
): Array<[number, number]> {
  const sets: Array<[number, number]> = [];
  if (!hS || !aS) return sets;
  (
    ["period1", "period2", "period3", "period4", "period5"] as Array<
      keyof SAPIV2ScoreObj
    >
  ).forEach((p) => {
    const h = hS[p] as number | undefined;
    const a = aS[p] as number | undefined;
    if (h !== undefined && a !== undefined) sets.push([h, a]);
  });
  return sets;
}

function volleyballMatchFinished(match: VolleyMatch): boolean {
  const status = String(match.status ?? "")
    .trim()
    .toLowerCase();
  const homeSets = parseInt(match.home.totalscore || "0", 10) || 0;
  const awaySets = parseInt(match.away.totalscore || "0", 10) || 0;
  return (
    homeSets >= 3 ||
    awaySets >= 3 ||
    status.includes("finished") ||
    status.includes("encerr") ||
    status === "ft"
  );
}

function extractFinishedVolleyballSets(
  match: VolleyMatch,
): Array<[number, number]> {
  const sets: Array<[number, number]> = [];
  for (const key of ["s1", "s2", "s3", "s4", "s5"] as const) {
    const homeValue = String(match.home[key] ?? "").trim();
    const awayValue = String(match.away[key] ?? "").trim();
    if (homeValue === "" || awayValue === "") continue;
    const home = Number(homeValue);
    const away = Number(awayValue);
    if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
    sets.push([home, away]);
  }
  return sets;
}

function buildVolleyballFinishedRecord(
  tournament: Pick<VolleyTournament, "league" | "country">,
  match: VolleyMatch,
): {
  home: number;
  away: number;
  status: string;
  homeTeam: string;
  awayTeam: string;
  extras: Record<string, unknown>;
  finishedAt: number;
} {
  const sets = extractFinishedVolleyballSets(match);
  const homeSets =
    parseInt(match.home.totalscore || "0", 10) ||
    sets.filter(([h, a]) => h > a).length;
  const awaySets =
    parseInt(match.away.totalscore || "0", 10) ||
    sets.filter(([h, a]) => a > h).length;
  const homeScore: Record<string, number> = { current: homeSets };
  const awayScore: Record<string, number> = { current: awaySets };

  sets.forEach(([home, away], index) => {
    homeScore[`period${index + 1}`] = home;
    awayScore[`period${index + 1}`] = away;
  });

  return {
    home: homeSets,
    away: awaySets,
    status: "Finished",
    homeTeam: match.home.name,
    awayTeam: match.away.name,
    extras: {
      homeScore,
      awayScore,
      volleyball: {
        sets,
        league: tournament.league,
        country: tournament.country,
      },
    },
    finishedAt: Date.now(),
  };
}

async function persistFinishedMatchRecord(
  matchId: string,
  sport: string,
  record: {
    home: number;
    away: number;
    htHome?: number | null;
    htAway?: number | null;
    status?: string;
    homeTeam: string;
    awayTeam: string;
    // Football only (see finalizeStaleLiveMatch) — real corner/card totals
    // from SportMonks statistics, sourced via _liveExtra. Previously always
    // hardcoded to null below regardless of what the caller passed, which
    // silently discarded these values on the DB-recovery path even after
    // finalizeStaleLiveMatch started setting them on the in-memory record
    // (audit finding, 2026-08-29 — see finalizeStaleLiveMatch's own comment).
    cornersTotal?: number | null;
    cardsTotal?: number | null;
    extras?: unknown;
    finishedAt: number;
  },
): Promise<void> {
  try {
    if (!db) return;
    await db
      .insert(matchResultsTable)
      .values({
        matchId,
        sport,
        home: record.home,
        away: record.away,
        htHome:
          typeof record.htHome === "number" && Number.isFinite(record.htHome)
            ? record.htHome
            : null,
        htAway:
          typeof record.htAway === "number" && Number.isFinite(record.htAway)
            ? record.htAway
            : null,
        status: record.status ?? null,
        homeTeam: record.homeTeam,
        awayTeam: record.awayTeam,
        cornersTotal:
          typeof record.cornersTotal === "number" && Number.isFinite(record.cornersTotal)
            ? record.cornersTotal
            : null,
        cardsTotal:
          typeof record.cardsTotal === "number" && Number.isFinite(record.cardsTotal)
            ? record.cardsTotal
            : null,
        firstGoal: null,
        extras: (record.extras as Record<string, unknown> | undefined) ?? null,
        finishedAt: new Date(record.finishedAt),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: matchResultsTable.matchId,
        set: {
          home: record.home,
          away: record.away,
          htHome: null,
          htAway: null,
          status: record.status ?? null,
          homeTeam: record.homeTeam,
          awayTeam: record.awayTeam,
          cornersTotal:
            typeof record.cornersTotal === "number" && Number.isFinite(record.cornersTotal)
              ? record.cornersTotal
              : null,
          cardsTotal:
            typeof record.cardsTotal === "number" && Number.isFinite(record.cardsTotal)
              ? record.cardsTotal
              : null,
          firstGoal: null,
          extras:
            (record.extras as Record<string, unknown> | undefined) ?? null,
          finishedAt: new Date(record.finishedAt),
          updatedAt: new Date(),
        },
      });
  } catch {}
}

async function finalizeStaleLiveMatch(state: LiveMatchState): Promise<void> {
  const finishedAt = Date.now();
  const htScore = state._liveExtra?.htScore;
  // Tennis/basketball/volleyball can never legitimately end 0-0 (sets or
  // points) — state.homeScore/awayScore still sitting at the initial
  // placeholder zero, with no real per-set data ever recorded either, means
  // this match was NEVER actually tracked with real data before
  // disappearing from the live feed (poor provider coverage for an obscure
  // fixture — confirmed real for low-tier ITF tennis, PulseScore's own
  // "occasional checkpoint updates" behavior for those). Settling that as a
  // genuine "lost" for whatever was bet on it is provably wrong. Reported
  // in production (2026-08-10): 3 different obscure ITF matches in one
  // ticket all finalized as "0 - 0 em sets" and the whole multi got marked
  // LOST the moment any one of them settled that way, despite the matches
  // never having played a single game — an early parlay-loss determination
  // built on fabricated data. Marking these "abandoned" instead of
  // "finished" routes them through the existing
  // IMMEDIATE_VOID_SETTLEMENT_STATUSES path (settlement.ts) — voided (that
  // leg's stake refunded), not falsely lost. This also correctly covers a
  // genuine early walkover/retirement, which would show the same
  // no-real-data signature and should be voided anyway. Football is
  // deliberately excluded — a real 0-0 draw is a completely normal
  // outcome there, unlike a real 0-0 result in any of these three sports.
  //
  // Tennis specifically needs a WIDER net than plain 0-0: reported again
  // the same day with "1 - 0" and "1 - 1" both shown as "Final" — neither
  // is a legitimate finished tennis match. A real win requires the winner
  // to have at least 2 sets (true for every real format: best-of-3 ends at
  // 2-0/2-1, and even a best-of-5 retirement can only end early once the
  // leader reaches 2), and a tie (1-1, 2-2) is by definition mid-match, not
  // final. Whether the underlying cause is missing data (as with the 0-0
  // cases) or a genuine early retirement we have no clean signal to
  // distinguish from missing data, voiding is the correct call either way
  // — a real early retirement's markets should mostly void too, and we
  // can't safely tell the two cases apart from what we have.
  // Hockey/baseball added defensively (audit finding, 2026-08-10): neither
  // currently has a live pipeline that ever calls this function with
  // state.sport==="hockey"/"baseball" (hockey only has a PulseScore
  // PREMATCH builder; baseball has no PulseScore integration at all —
  // both sports' actual live data comes from Statpal's own NHL/MLB feeds
  // through a separate cache, never through liveMatchState). So this isn't
  // an active bug today, but the exact same fabricated-0-0 gap tennis/
  // basketball/volleyball had would apply the moment either sport gets a
  // live pipeline built on this same disappearance-based pattern — cheap
  // to close now rather than rediscover later.
  const tennisSetsWon = [state.homeScore, state.awayScore];
  const looksLikeNeverTracked =
    (state.sport === "tennis" &&
      (tennisSetsWon[0] === tennisSetsWon[1] || Math.max(...tennisSetsWon) < 2)) ||
    ((state.sport === "basketball" ||
      state.sport === "volleyball" ||
      state.sport === "hockey" ||
      state.sport === "baseball") &&
      state.homeScore === 0 &&
      state.awayScore === 0);
  const footballExtras =
    state.sport === "football"
      ? {
          football: {
            ftHome: state.homeScore,
            ftAway: state.awayScore,
            ...(Array.isArray(htScore) &&
            typeof htScore[0] === "number" &&
            typeof htScore[1] === "number"
              ? {
                  htHome: htScore[0],
                  htAway: htScore[1],
                  htScore: [htScore[0], htScore[1]] as [number, number],
                }
              : {}),
          },
        }
      : {};
  const record = {
    home: state.homeScore,
    away: state.awayScore,
    ...(Array.isArray(htScore) &&
    typeof htScore[0] === "number" &&
    typeof htScore[1] === "number"
      ? { htHome: htScore[0], htAway: htScore[1] }
      : {}),
    // Football corners/cards O/U settlement (settlement.ts reads these two
    // TOP-LEVEL fields, same shape as a match_results DB row) — sourced from
    // state._liveExtra, populated tick-by-tick in buildFootballLiveFromSportMonks
    // from real SportMonks CORNERS/YELLOWCARDS statistics + REDCARD events.
    // Previously never set here at all (audit finding, 2026-08-29): these two
    // markets were exposed to bettors but had no code path that could ever
    // populate them, so a bet on either always stayed pending forever rather
    // than settling. Reading the LAST live tick's total is correct, not an
    // early/risky read: a corner/card count is final and can't change once
    // the match reaches FT, unlike the "wrongly settled early" risk the
    // deliberately-null mid-match live path in settlement.ts's early-settle
    // helper guards against (see that function's own corners/cards comment).
    ...(state.sport === "football" && typeof state._liveExtra?.cornersTotal === "number"
      ? { cornersTotal: state._liveExtra.cornersTotal }
      : {}),
    ...(state.sport === "football" && typeof state._liveExtra?.cardsTotal === "number"
      ? { cardsTotal: state._liveExtra.cardsTotal }
      : {}),
    status: looksLikeNeverTracked ? "abandoned" : "finished",
    homeTeam: state.home,
    awayTeam: state.away,
    extras: {
      ...(state.sport === "hockey" && state._liveExtra?.periods
        ? { hockey: { periods: state._liveExtra.periods } }
        : {}),
      ...(state.sport === "basketball" && state._liveExtra?.quarters
        ? { basketball: { quarters: state._liveExtra.quarters } }
        : {}),
      ...(state.sport === "baseball" && state._liveExtra?.innings
        ? { baseball: { innings: state._liveExtra.innings } }
        : {}),
      ...(state.sport === "tennis" && state._liveExtra?.sets
        ? { tennis: { sets: state._liveExtra.sets } }
        : {}),
      ...(state.sport === "volleyball" && state._liveExtra?.sets
        ? {
            volleyball: {
              sets: state._liveExtra.sets,
              ...(state._liveExtra.currentPoints
                ? { currentPoints: state._liveExtra.currentPoints }
                : {}),
            },
          }
        : {}),
      ...footballExtras,
    },
    finishedAt,
  };
  finishedMatchResults.set(state.id, record);
  await enqueueMatchSettlement({
    matchId: state.id,
    jobId: buildMatchSettlementJobId({
      matchId: state.id,
      home: record.home,
      away: record.away,
      ...(typeof record.htHome === "number" ? { htHome: record.htHome } : {}),
      ...(typeof record.htAway === "number" ? { htAway: record.htAway } : {}),
    }),
  });
  await persistFinishedMatchRecord(state.id, state.sport, record);
}

function extractFinishedBasketballQuarters(
  hS: SAPIV2ScoreObj | null,
  aS: SAPIV2ScoreObj | null,
): Array<[number, number]> {
  const quarters: Array<[number, number]> = [];
  if (!hS || !aS) return quarters;
  (
    ["period1", "period2", "period3", "period4"] as Array<keyof SAPIV2ScoreObj>
  ).forEach((p) => {
    const h = hS[p] as number | undefined;
    const a = aS[p] as number | undefined;
    if ((h ?? 0) > 0 || (a ?? 0) > 0) quarters.push([h ?? 0, a ?? 0]);
  });
  return quarters;
}

function extractFinishedBaseballInnings(
  hS: SAPIV2ScoreObj | null,
  aS: SAPIV2ScoreObj | null,
): Array<[number, number]> {
  const innings: Array<[number, number]> = [];
  if (!hS || !aS) return innings;
  for (let i = 1; i <= 12; i++) {
    const key = `period${i}` as keyof SAPIV2ScoreObj;
    const h = hS[key];
    const a = aS[key];
    if (typeof h !== "number" && typeof a !== "number") break;
    innings.push([typeof h === "number" ? h : 0, typeof a === "number" ? a : 0]);
  }
  return innings;
}

function buildFinishedResultExtrasFromV2Event(
  sport: SportKey,
  ev: SAPIV2Event,
  hS: SAPIV2ScoreObj | null,
  aS: SAPIV2ScoreObj | null,
): Record<string, unknown> {
  const extras: Record<string, unknown> = {
    homeScore: ev.homeScore,
    awayScore: ev.awayScore,
  };
  if (sport === "tennis") {
    const sets = extractFinishedTennisSets(hS, aS);
    if (sets.length > 0) extras["tennis"] = { sets };
  } else if (sport === "basketball") {
    const quarters = extractFinishedBasketballQuarters(hS, aS);
    if (quarters.length > 0) extras["basketball"] = { quarters };
  } else if (sport === "baseball") {
    const innings = extractFinishedBaseballInnings(hS, aS);
    if (innings.length > 0) extras["baseball"] = { innings };
  }
  return extras;
}

function finishedResultHasSettlementExtras(
  sport: SportKey,
  extras: unknown,
): boolean {
  if (sport === "tennis") {
    const tennis = (extras as Record<string, unknown> | undefined)?.[
      "tennis"
    ] as Record<string, unknown> | undefined;
    return Array.isArray(tennis?.["sets"]);
  }
  if (sport === "basketball") {
    const basketball = (extras as Record<string, unknown> | undefined)?.[
      "basketball"
    ] as Record<string, unknown> | undefined;
    return Array.isArray(basketball?.["quarters"]);
  }
  return true;
}

export async function ensureFinishedMatchResult(
  matchId: string,
): Promise<boolean> {
  if (!matchId) return false;

  const volleyballMatch = matchId.match(/^volley-(live|odds)-(\d+)$/);
  if (volleyballMatch) {
    try {
      const providerId = volleyballMatch[2]!;
      const tournaments = await getVolleyballLive();
      for (const tournament of tournaments) {
        const matches = Array.isArray(tournament.match)
          ? tournament.match
          : [tournament.match];
        for (const match of matches) {
          if (String(match.id) !== providerId) continue;
          if (!volleyballMatchFinished(match)) return false;

          const record = buildVolleyballFinishedRecord(tournament, match);
          for (const alias of [
            `volley-live-${providerId}`,
            `volley-odds-${providerId}`,
          ]) {
            finishedMatchResults.set(alias, record);
            await enqueueMatchSettlement({
              matchId: alias,
              jobId: buildMatchSettlementJobId({
                matchId: alias,
                home: record.home,
                away: record.away,
              }),
            });
            await persistFinishedMatchRecord(alias, "volleyball", record);
          }
          _pruneFinishedResults();
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  // ── Tennis V1 match IDs (tennis-v1-{id}) ──────────────────────────────────
  const tennisV1Match = matchId.match(/^tennis-v1-(\d+)$/);
  if (tennisV1Match) {
    const providerId = Number(tennisV1Match[1]);
    const cached = finishedMatchResults.get(matchId);
    if (cached && typeof cached.home === "number" && typeof cached.away === "number" && cached.home + cached.away > 0)
      return true;

    // Check DB
    try {
      if (db) {
        const [row] = await db
          .select()
          .from(matchResultsTable)
          .where(eq(matchResultsTable.matchId, matchId))
          .limit(1);
        if (row && typeof row.home === "number" && typeof row.away === "number" && row.home + row.away > 0) {
          const dbExtras = row.extras as Record<string, unknown> | null | undefined;
          const hasSetData =
            dbExtras != null &&
            Array.isArray((dbExtras["tennis"] as Record<string, unknown> | undefined)?.["sets"]) &&
            ((dbExtras["tennis"] as Record<string, unknown>)["sets"] as unknown[]).length > 0;

          if (!hasSetData) {
            // DB record has no per-set scores — try to get them from the live feed
            // (finished matches linger briefly; stages carry set-by-set data needed for sc1-/sc2-/sc3-)
            try {
              const games = await getTennisLiveV1();
              for (const g of games) {
                if (Number(g.id) !== providerId) continue;
                const _stages = (g as any).stages ?? [];
                const _setSets: [number, number][] = _stages
                  .filter((s: any) => /^set \d+$/i.test(String(s.name ?? "")) && s.homeCompetitorScore >= 0 && s.awayCompetitorScore >= 0)
                  .map((s: any): [number, number] => [Math.max(0, s.homeCompetitorScore), Math.max(0, s.awayCompetitorScore)]);
                if (_setSets.length > 0) {
                  const refreshedExtras = { tennis: { sets: _setSets } };
                  const record = {
                    home: row.home,
                    away: row.away,
                    homeTeam: row.homeTeam ?? "",
                    awayTeam: row.awayTeam ?? "",
                    status: row.status ?? "finished",
                    finishedAt: row.finishedAt ? row.finishedAt.getTime() : Date.now(),
                    extras: refreshedExtras,
                  };
                  finishedMatchResults.set(matchId, record);
                  // Persist updated record so future server restarts retain set data
                  await persistFinishedMatchRecord(matchId, "tennis", record);
                  return true;
                }
                break; // found the game but no stage data available yet
              }
            } catch { /* live feed unavailable — fall through with DB record as-is */ }
          }

          finishedMatchResults.set(matchId, {
            home: row.home,
            away: row.away,
            homeTeam: row.homeTeam ?? "",
            awayTeam: row.awayTeam ?? "",
            status: row.status ?? undefined,
            extras: row.extras ?? undefined,
            finishedAt: row.finishedAt ? row.finishedAt.getTime() : Date.now(),
          });
          return true;
        }
      }
    } catch {}

    // Fallback: call V1 live feed and look for this game (finished games stay in the live feed briefly)
    try {
      const games = await getTennisLiveV1();
      for (const g of games) {
        if (Number(g.id) !== providerId) continue;
        if (!isTennisV1GameFinished(g)) return false;
        const home = Math.max(0, g.homeCompetitor?.score ?? 0);
        const away = Math.max(0, g.awayCompetitor?.score ?? 0);
        if (home === 0 && away === 0) return false;
        // Extract per-set scores so sc1-/sc2-/sc3- bets can settle in the finished-match path
        const _stages = (g as any).stages ?? [];
        const _setSets: [number, number][] = _stages
          .filter((s: any) => /^set \d+$/i.test(String(s.name ?? "")) && s.homeCompetitorScore >= 0 && s.awayCompetitorScore >= 0)
          .map((s: any): [number, number] => [Math.max(0, s.homeCompetitorScore), Math.max(0, s.awayCompetitorScore)]);
        const _extras: Record<string, unknown> | undefined =
          _setSets.length > 0 ? { tennis: { sets: _setSets } } : undefined;
        const record = {
          home,
          away,
          homeTeam: g.homeCompetitor?.name?.trim() ?? "",
          awayTeam: g.awayCompetitor?.name?.trim() ?? "",
          status: "finished",
          finishedAt: Date.now(),
          extras: _extras,
        };
        finishedMatchResults.set(matchId, record);
        await enqueueMatchSettlement({
          matchId,
          jobId: buildMatchSettlementJobId({ matchId, home, away }),
        });
        await persistFinishedMatchRecord(matchId, "tennis", record);
        _pruneFinishedResults();
        return true;
      }
    } catch {}
    return false;
  }

  // ── PulseScore football/tennis/basketball/volleyball match IDs
  // (pulsescore-{sport}-{id}) ──────────────────────────────────────────────
  // DB-only recovery path: finalizeStaleLiveMatch() already writes a
  // complete record (score + sport-specific extras) via
  // persistFinishedMatchRecord the moment one of these matches finishes
  // while the server is running, so this only matters after a restart wipes
  // the in-memory finishedMatchResults cache before a pending bet's
  // settlement cycle gets to it. Confirmed missing entirely for football/
  // tennis (2026-08-08 audit) — isProviderManagedMatchId() never recognized
  // this prefix, so this function was never even called for these ids from
  // the settlement cycle's ensure-loop; a bet on a match that finished
  // across a restart had no way to recover its result. basketball/
  // volleyball had the IDENTICAL gap (2026-08-11 audit, triggered by a user
  // asking whether volleyball settlement was even configured) — their
  // pulsescore-basketball-/pulsescore-volleyball- ids were never added to
  // isProviderManagedMatchId at all when those two sports' PulseScore live
  // pipelines shipped (2026-08-08/09), so this branch is now generalized to
  // cover all four instead of being duplicated per sport. No live-feed
  // fallback needed here (unlike tennis-v1 above) since finalizeStaleLiveMatch
  // already persists the full record (including extras.basketball.quarters/
  // extras.volleyball.sets, same shape read back below) up front.
  if (/^pulsescore-(football|tennis|basketball|volleyball)-.+$/.test(matchId)) {
    const cached = finishedMatchResults.get(matchId);
    if (
      cached &&
      typeof cached.home === "number" &&
      typeof cached.away === "number"
    )
      return true;
    try {
      if (db) {
        const [row] = await db
          .select()
          .from(matchResultsTable)
          .where(eq(matchResultsTable.matchId, matchId))
          .limit(1);
        if (row && typeof row.home === "number" && typeof row.away === "number") {
          const record = {
            home: row.home,
            away: row.away,
            htHome: row.htHome ?? undefined,
            htAway: row.htAway ?? undefined,
            homeTeam: row.homeTeam ?? "",
            awayTeam: row.awayTeam ?? "",
            status: row.status ?? undefined,
            cornersTotal: row.cornersTotal ?? undefined,
            cardsTotal: row.cardsTotal ?? undefined,
            firstGoal:
              (row.firstGoal as "home" | "away" | "none" | null) ?? undefined,
            extras: row.extras ?? undefined,
            finishedAt: row.finishedAt ? row.finishedAt.getTime() : Date.now(),
          };
          finishedMatchResults.set(matchId, record);
          return true;
        }
      }
    } catch {}
    return false;
  }

  // Fetching is done via top-level fetchFootballExtras function

  const parse = (): { sport: SportKey; prefix: string; id: number } | null => {
    const m = matchId.match(
      /^(football-v2|bball-v2|hockey-v2|tennis-v2|baseball-v2|mlb-v2)-(\d+)$/,
    );
    if (!m) return null;
    const prefix = m[1]!;
    const id = Number(m[2]);
    if (!Number.isFinite(id) || id <= 0) return null;
    const sport =
      prefix === "football-v2"
        ? "football"
        : prefix === "bball-v2"
          ? "basketball"
          : prefix === "hockey-v2"
            ? "hockey"
            : prefix === "tennis-v2"
              ? "tennis"
              : "baseball";
    return { sport, prefix, id };
  };

  const parsed = parse();
  if (!parsed) return false;
  const cached = finishedMatchResults.get(matchId);
  let hadResult = false;
  if (cached) {
    hadResult = true;
    if (finishedResultHasSettlementExtras(parsed.sport, cached.extras))
      return true;
  }

  try {
    if (db) {
      const [row] = await db
        .select()
        .from(matchResultsTable)
        .where(eq(matchResultsTable.matchId, matchId))
        .limit(1);
      if (row && typeof row.home === "number" && typeof row.away === "number") {
        const record = {
          home: row.home,
          away: row.away,
          htHome: row.htHome ?? undefined,
          htAway: row.htAway ?? undefined,
          homeTeam: row.homeTeam ?? "",
          awayTeam: row.awayTeam ?? "",
          status: row.status ?? undefined,
          cornersTotal: row.cornersTotal ?? undefined,
          cardsTotal: row.cardsTotal ?? undefined,
          firstGoal:
            (row.firstGoal as "home" | "away" | "none" | null) ?? undefined,
          extras: row.extras ?? undefined,
          finishedAt: row.finishedAt ? row.finishedAt.getTime() : Date.now(),
        };
        finishedMatchResults.set(matchId, record);
        hadResult = true;
        if (finishedResultHasSettlementExtras(parsed.sport, record.extras))
          return true;
      }
    }
  } catch {}

  const now = Date.now();
  const tryEvents = async (events: unknown[]): Promise<boolean> => {
    for (const raw of events) {
      const ev = raw as SAPIV2Event;
      if (Number(ev.id) !== parsed.id) continue;
      const st = ev.status as Record<string, unknown> | null | undefined;
      const stType =
        typeof st?.["type"] === "string"
          ? (st["type"] as string).toLowerCase()
          : "";
      const code = v2StatusCode(ev);
      const isFinished =
        stType === "finished" ||
        code === 100 ||
        (typeof st?.["short"] === "string" &&
          SAPI_FINISHED_STATUSES.has(st["short"]));
      if (!isFinished) return false;

      const hS =
        typeof ev.homeScore === "object" && ev.homeScore !== null
          ? (ev.homeScore as SAPIV2ScoreObj)
          : null;
      const aS =
        typeof ev.awayScore === "object" && ev.awayScore !== null
          ? (ev.awayScore as SAPIV2ScoreObj)
          : null;
      const home = hS?.current ?? v2CurrentScore(ev.homeScore) ?? 0;
      const away = aS?.current ?? v2CurrentScore(ev.awayScore) ?? 0;
      const htHome =
        parsed.sport === "football"
          ? typeof hS?.["period1"] === "number"
            ? (hS["period1"] as number)
            : undefined
          : undefined;
      const htAway =
        parsed.sport === "football"
          ? typeof aS?.["period1"] === "number"
            ? (aS["period1"] as number)
            : undefined
          : undefined;

      const extras =
        parsed.sport === "football"
          ? await fetchFootballExtras(parsed.id)
          : null;
      const basketballIncidentSummary =
        parsed.sport === "basketball"
          ? await getBasketballIncidentSummaryV2(parsed.id).catch(() => null)
          : null;

      const p = (obj: SAPIV2ScoreObj | null, n: number): number | null => {
        const v = obj?.[`period${n}` as keyof SAPIV2ScoreObj];
        return typeof v === "number" ? (v as number) : null;
      };

      const p1H = parsed.sport === "football" ? p(hS, 1) : null;
      const p1A = parsed.sport === "football" ? p(aS, 1) : null;
      const p2H = parsed.sport === "football" ? p(hS, 2) : null;
      const p2A = parsed.sport === "football" ? p(aS, 2) : null;
      const p3H = parsed.sport === "football" ? p(hS, 3) : null;
      const p3A = parsed.sport === "football" ? p(aS, 3) : null;
      const p4H = parsed.sport === "football" ? p(hS, 4) : null;
      const p4A = parsed.sport === "football" ? p(aS, 4) : null;

      const ftHome =
        parsed.sport === "football" ? (p1H ?? 0) + (p2H ?? 0) : null;
      const ftAway =
        parsed.sport === "football" ? (p1A ?? 0) + (p2A ?? 0) : null;
      const etHome =
        parsed.sport === "football" ? (p3H ?? 0) + (p4H ?? 0) : null;
      const etAway =
        parsed.sport === "football" ? (p3A ?? 0) + (p4A ?? 0) : null;

      const baseNoPensHome =
        parsed.sport === "football" ? (ftHome ?? 0) + (etHome ?? 0) : 0;
      const baseNoPensAway =
        parsed.sport === "football" ? (ftAway ?? 0) + (etAway ?? 0) : 0;
      const penHome =
        parsed.sport === "football" ? Math.max(0, home - baseNoPensHome) : null;
      const penAway =
        parsed.sport === "football" ? Math.max(0, away - baseNoPensAway) : null;
      const baseFinishedExtras = buildFinishedResultExtrasFromV2Event(
        parsed.sport,
        ev,
        hS,
        aS,
      );
      const baseBasketballExtras =
        parsed.sport === "basketball"
          ? ((baseFinishedExtras["basketball"] as
              | Record<string, unknown>
              | undefined) ?? {})
          : undefined;

      const fullRecord = {
        home,
        away,
        htHome,
        htAway,
        status: (typeof st?.["short"] === "string"
          ? st["short"]
          : "Finished") as string,
        homeTeam: v2TeamName(ev.homeTeam),
        awayTeam: v2TeamName(ev.awayTeam),
        cornersTotal: extras?.cornersTotal,
        cardsTotal: extras?.cardsTotal,
        firstGoal: extras?.firstGoal,
        extras: {
          ...baseFinishedExtras,
          ...(parsed.sport === "football"
            ? {
                football: {
                  ftHome,
                  ftAway,
                  etHome,
                  etAway,
                  penHome,
                  penAway,
                  ...(((extras?.football as
                    | Record<string, unknown>
                    | undefined) ?? {}) as Record<string, unknown>),
                },
              }
            : {}),
          ...(parsed.sport === "basketball"
            ? {
                basketball: {
                  ...baseBasketballExtras,
                  ...((basketballIncidentSummary?.scoringEvents.length ?? 0) > 0
                    ? {
                        scoringEvents: basketballIncidentSummary!.scoringEvents,
                      }
                    : {}),
                },
              }
            : {}),
        },
        finishedAt: now,
      };

      finishedMatchResults.set(matchId, fullRecord);
      await enqueueMatchSettlement({
        matchId,
        jobId: buildMatchSettlementJobId({
          matchId,
          home: fullRecord.home,
          away: fullRecord.away,
          htHome: fullRecord.htHome,
          htAway: fullRecord.htAway,
        }),
      });
      try {
        if (db) {
          await db
            .insert(matchResultsTable)
            .values({
              matchId,
              sport: parsed.sport,
              home: fullRecord.home,
              away: fullRecord.away,
              htHome: fullRecord.htHome ?? null,
              htAway: fullRecord.htAway ?? null,
              status: fullRecord.status ?? null,
              homeTeam: fullRecord.homeTeam,
              awayTeam: fullRecord.awayTeam,
              cornersTotal: fullRecord.cornersTotal ?? null,
              cardsTotal: fullRecord.cardsTotal ?? null,
              firstGoal: fullRecord.firstGoal ?? null,
              extras: fullRecord.extras ?? null,
              finishedAt: new Date(fullRecord.finishedAt),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: matchResultsTable.matchId,
              set: {
                home: fullRecord.home,
                away: fullRecord.away,
                htHome: fullRecord.htHome ?? null,
                htAway: fullRecord.htAway ?? null,
                status: fullRecord.status ?? null,
                homeTeam: fullRecord.homeTeam,
                awayTeam: fullRecord.awayTeam,
                cornersTotal: fullRecord.cornersTotal ?? null,
                cardsTotal: fullRecord.cardsTotal ?? null,
                firstGoal: fullRecord.firstGoal ?? null,
                extras: fullRecord.extras ?? null,
                finishedAt: new Date(fullRecord.finishedAt),
                updatedAt: new Date(),
              },
            });
        }
      } catch {}
      _pruneFinishedResults();
      return true;
    }
    return false;
  };

  const last = await getV2EventsLast(parsed.sport, 120).catch(() => []);
  if (await tryEvents(last)) return true;

  const todayStr = new Date().toISOString().slice(0, 10);
  const schedToday = await getScheduleV2(parsed.sport, todayStr).catch(
    () => [],
  );
  if (await tryEvents(schedToday as unknown[])) return true;

  const y = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const schedY = await getScheduleV2(parsed.sport, y).catch(() => []);
  if (await tryEvents(schedY as unknown[])) return true;

  // For tennis: also try the day before yesterday (matches that started late may have ended 2 days after)
  // AND try a direct per-event fetch by V2 event ID as the final fallback
  if (parsed.sport === "tennis") {
    const y2 = new Date(Date.now() - 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const schedY2 = await getScheduleV2(parsed.sport, y2).catch(() => []);
    if (await tryEvents(schedY2 as unknown[])) return true;

    // Direct per-event fetch — SportsAPI Pro V2 exposes /api/event/{id} for all sports
    try {
      const tDomain = WS_DOMAINS["tennis"];
      const evResp = await fetch(`https://${tDomain}/api/event/${parsed.id}`, {
        signal: AbortSignal.timeout(5000),
        headers: sapiHeaders(),
      });
      if (evResp.ok) {
        const evData = (await evResp.json()) as Record<string, unknown>;
        const rawEv: unknown =
          evData["event"] ??
          (evData["data"] as Record<string, unknown> | undefined)?.[
            "event"
          ] ??
          (evData["data"] as unknown);
        if (rawEv) {
          if (await tryEvents([rawEv])) return true;
        }
      }
    } catch {}
  }

  // For all non-tennis sports: direct per-event fetch as final V2 fallback.
  // SportsAPI Pro V2 exposes /api/event/{id} for all sports.
  if (parsed.sport !== "tennis") {
    try {
      const domain = WS_DOMAINS[parsed.sport];
      const evResp = await fetch(
        `https://${domain}/api/event/${parsed.id}`,
        { signal: AbortSignal.timeout(5000), headers: sapiHeaders() },
      );
      if (evResp.ok) {
        const evData = (await evResp.json()) as Record<string, unknown>;
        const rawEv: unknown =
          evData["event"] ??
          (evData["data"] as Record<string, unknown> | undefined)?.[
            "event"
          ] ??
          (evData["data"] as unknown);
        if (rawEv) {
          if (await tryEvents([rawEv])) return true;
        }
      }
    } catch {}
  }

  // For football: V1 daily-feed fallback matched by team names.
  // Covers leagues absent from V2 schedule (Erovnuli Liga 2, Club Friendlies, etc.)
  if (parsed.sport === "football") {
    const liveState = liveMatchState.get(matchId);
    if (liveState?.home && liveState?.away) {
      try {
        const norm = (s: string) =>
          String(s ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        const normH = norm(liveState.home);
        const normA = norm(liveState.away);
        const leagues = await getDailyLeagues();
        for (const league of leagues) {
          const raw = league.match;
          if (!raw) continue;
          const dailyMatches: SAPIMatchV2[] = Array.isArray(raw)
            ? raw
            : [raw];
          for (const m of dailyMatches) {
            if (!SAPI_FINISHED_STATUSES.has(m.status)) continue;
            const mH = norm(m.home.name);
            const mA = norm(m.away.name);
            if (
              (mH.includes(normH) || normH.includes(mH)) &&
              (mA.includes(normA) || normA.includes(mA))
            ) {
              const home = parseInt(m.home.goals) || 0;
              const away = parseInt(m.away.goals) || 0;
              const htHome =
                typeof m.ht?.home_goals === "number"
                  ? m.ht.home_goals
                  : undefined;
              const htAway =
                typeof m.ht?.away_goals === "number"
                  ? m.ht.away_goals
                  : undefined;
              const rec = {
                home,
                away,
                htHome,
                htAway,
                homeTeam: m.home.name,
                awayTeam: m.away.name,
                status: m.status,
                finishedAt: now,
              };
              finishedMatchResults.set(matchId, rec);
              await enqueueMatchSettlement({
                matchId,
                jobId: buildMatchSettlementJobId({
                  matchId,
                  home: rec.home,
                  away: rec.away,
                  htHome: rec.htHome,
                  htAway: rec.htAway,
                }),
              });
              try {
                if (db) {
                  await db
                    .insert(matchResultsTable)
                    .values({
                      matchId,
                      sport: "football",
                      home: rec.home,
                      away: rec.away,
                      htHome: rec.htHome ?? null,
                      htAway: rec.htAway ?? null,
                      status: rec.status ?? null,
                      homeTeam: rec.homeTeam,
                      awayTeam: rec.awayTeam,
                      cornersTotal: null,
                      cardsTotal: null,
                      firstGoal: null,
                      extras: null,
                      finishedAt: new Date(rec.finishedAt),
                      updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                      target: matchResultsTable.matchId,
                      set: {
                        home: rec.home,
                        away: rec.away,
                        htHome: rec.htHome ?? null,
                        htAway: rec.htAway ?? null,
                        status: rec.status ?? null,
                        homeTeam: rec.homeTeam,
                        awayTeam: rec.awayTeam,
                        finishedAt: new Date(rec.finishedAt),
                        updatedAt: new Date(),
                      },
                    });
                }
              } catch {}
              _pruneFinishedResults();
              return true;
            }
          }
        }
      } catch {}
    }
  }

  return false;
}

export async function scanVolleyballForFinished(): Promise<void> {
  try {
    const tournaments = await getVolleyballLive();
    for (const tournament of tournaments) {
      const matches = Array.isArray(tournament.match)
        ? tournament.match
        : [tournament.match];
      for (const match of matches) {
        if (!volleyballMatchFinished(match)) continue;
        const providerId = String(match.id ?? "").trim();
        if (!providerId) continue;

        const record = buildVolleyballFinishedRecord(tournament, match);
        for (const alias of [
          `volley-live-${providerId}`,
          `volley-odds-${providerId}`,
        ]) {
          const existing = finishedMatchResults.get(alias);
          const unchanged =
            existing &&
            existing.home === record.home &&
            existing.away === record.away &&
            existing.homeTeam === record.homeTeam &&
            existing.awayTeam === record.awayTeam;
          if (unchanged) continue;

          finishedMatchResults.set(alias, record);
          await enqueueMatchSettlement({
            matchId: alias,
            jobId: buildMatchSettlementJobId({
              matchId: alias,
              home: record.home,
              away: record.away,
            }),
          });
          await persistFinishedMatchRecord(alias, "volleyball", record);
        }
      }
    }
    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanVolleyballForFinished failed");
  }
}

export async function scanTennisV1ForFinished(): Promise<void> {
  try {
    // 1. Check BOTH the live feed (in-progress/just-finished) AND the /all feed
    //    (all of today's games — finished matches remain here for hours).
    const [liveGames, allGames] = await Promise.all([
      getTennisLiveV1(),
      getTennisAllV1(),
    ]);

    // Deduplicate by game id (live feed may subset all feed)
    const seenIds = new Set<string>();
    const games: V1TennisGame[] = [];
    for (const g of [...liveGames, ...allGames]) {
      if (!g?.id) continue;
      const id = String(g.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      games.push(g);
    }

    for (const g of games) {
      if (!isTennisV1GameFinished(g)) continue;
      const providerId = String(g.id);
      const matchId = `tennis-v1-${providerId}`;
      if (finishedMatchResults.has(matchId)) continue;

      const home = Math.max(0, g.homeCompetitor?.score ?? 0);
      const away = Math.max(0, g.awayCompetitor?.score ?? 0);
      if (home === 0 && away === 0) continue; // score data not yet available

      const homeTeam = g.homeCompetitor?.name?.trim() ?? "";
      const awayTeam = g.awayCompetitor?.name?.trim() ?? "";

      // Extract per-set game scores from stages (e.g. "Set 1": [6,3], "Set 2": [4,6])
      // Required to settle correct-score-of-set markets (sc1-, sc2-, sc3-, ses-)
      const stages = g.stages ?? [];
      const setSets: [number, number][] = stages
        .filter(
          (s) =>
            /^set \d+$/i.test(s.name) &&
            s.homeCompetitorScore >= 0 &&
            s.awayCompetitorScore >= 0,
        )
        .map((s): [number, number] => [
          Math.max(0, s.homeCompetitorScore),
          Math.max(0, s.awayCompetitorScore),
        ]);

      const extras: Record<string, unknown> | undefined =
        setSets.length > 0 ? { tennis: { sets: setSets } } : undefined;

      const record = {
        home,
        away,
        homeTeam,
        awayTeam,
        status: "finished",
        finishedAt: Date.now(),
        extras,
      };
      finishedMatchResults.set(matchId, record);
      await enqueueMatchSettlement({
        matchId,
        jobId: buildMatchSettlementJobId({ matchId, home, away }),
      });
      await persistFinishedMatchRecord(matchId, "tennis", record);
    }

    // 2. DB recovery pass — reload tennis results that were stored before the current
    //    server session (e.g. after a restart). Finished matches leave the live feed
    //    within minutes, so without this, pending bets from yesterday or earlier
    //    would never settle even though the result is in the DB.
    if (db) {
      try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
        const rows = await db
          .select()
          .from(matchResultsTable)
          .where(
            and(
              sql`${matchResultsTable.sport} = 'tennis'`,
              gte(matchResultsTable.finishedAt, cutoff),
            ),
          )
          .limit(500);

        for (const row of rows) {
          if (finishedMatchResults.has(row.matchId)) continue;
          if (typeof row.home !== "number" || typeof row.away !== "number") continue;
          finishedMatchResults.set(row.matchId, {
            home: row.home,
            away: row.away,
            homeTeam: row.homeTeam ?? "",
            awayTeam: row.awayTeam ?? "",
            status: row.status ?? "finished",
            extras: row.extras ?? undefined,
            finishedAt: row.finishedAt ? row.finishedAt.getTime() : Date.now(),
          });
          // Re-enqueue so the settlement worker picks it up for any pending bets
          await enqueueMatchSettlement({
            matchId: row.matchId,
            jobId: buildMatchSettlementJobId({ matchId: row.matchId, home: row.home, away: row.away }),
          });
        }
      } catch (dbErr) {
        logger.warn({ err: dbErr }, "scanTennisV1ForFinished: DB recovery failed");
      }
    }

    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanTennisV1ForFinished failed");
  }
}

// ─── Statpal-only scan functions: NHL / NBA / MLB ─────────────────────────────
// These replace the old scanV2AllSportsForFinished() which relied on SportsAPI Pro.
// They use the same Statpal live feeds already powering the live match display,
// plus the daily (d-1) results feed for yesterday's completed games.
// matchId format must match the live match IDs: `nhl-${id}`, `nba-${id}`, `mlb-${id}`

const NHL_FINISHED_STATUSES = new Set([
  "FT", "Finished", "Final", "Ended", "Complete", "Closed",
  "After OT", "After SO", "AET", "AOT",
  "Awarded",
]);
const NBA_FINISHED_STATUSES = new Set([
  "Finished", "Final", "Ended", "Closed", "Complete",
  "After OT", "After SO", "FT", "AET", "AOT",
]);
const MLB_FINISHED_STATUSES = new Set([
  "Final", "Game Over", "Complete", "Finished", "Ended", "Closed",
  "Completed Early", "F",
]);

export async function scanNHLForFinished(): Promise<void> {
  if (!CONFIG.STATPAL_API_KEY) return;
  try {
    // 1. Live feed — catches matches that just ended
    const tournaments = await getNHLLive();
    const parseScore = (s?: string): [number, number] | null => {
      if (!s?.trim()) return null;
      const parts = s.split(" - ");
      if (parts.length !== 2) return null;
      const h = parseInt(parts[0]!), a = parseInt(parts[1]!);
      return isNaN(h) || isNaN(a) ? null : [h, a];
    };
    for (const t of tournaments) {
      const matches: NHLMatch[] = Array.isArray(t.match) ? t.match : [t.match];
      for (const m of matches) {
        if (!m?.status || !NHL_FINISHED_STATUSES.has(m.status)) continue;
        const matchId = `nhl-${m.id}`;
        if (finishedMatchResults.has(matchId)) continue;
        const home = parseInt(m.home.totalscore) || 0;
        const away = parseInt(m.away.totalscore) || 0;
        const periods: Array<[number, number]> = [];
        for (const pd of [m.events?.firstperiod, m.events?.secondperiod, m.events?.thirdperiod, m.events?.overtime, m.events?.penalties]) {
          const sc = parseScore(pd?.score);
          if (sc) periods.push(sc);
        }
        const record = {
          home, away,
          homeTeam: m.home.name, awayTeam: m.away.name,
          status: "finished",
          extras: periods.length > 0 ? { hockey: { periods } } : {},
          finishedAt: Date.now(),
        };
        finishedMatchResults.set(matchId, record);
        await enqueueMatchSettlement({ matchId, jobId: buildMatchSettlementJobId({ matchId, home, away }) });
        await persistFinishedMatchRecord(matchId, "hockey", record);
      }
    }
    // 2. Daily results feed (yesterday's games)
    const daily = await getHockeyDailyResults();
    for (const r of daily) {
      const matchId = `nhl-${r.id}`;
      if (finishedMatchResults.has(matchId)) continue;
      const record = {
        home: r.homeScore, away: r.awayScore,
        homeTeam: r.home, awayTeam: r.away,
        status: "finished",
        extras: r.periods.length > 0 ? { hockey: { periods: r.periods } } : {},
        finishedAt: Date.now(),
      };
      finishedMatchResults.set(matchId, record);
      await enqueueMatchSettlement({ matchId, jobId: buildMatchSettlementJobId({ matchId, home: r.homeScore, away: r.awayScore }) });
      await persistFinishedMatchRecord(matchId, "hockey", record);
    }
    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanNHLForFinished failed");
  }
}

export async function scanNBAForFinished(): Promise<void> {
  if (!CONFIG.STATPAL_API_KEY) return;
  try {
    // 1. Live feed — catches matches that just ended
    const tournaments = await getNBALive();
    for (const t of tournaments) {
      const matches: NBAMatch[] = Array.isArray(t.match) ? t.match : [t.match];
      for (const m of matches) {
        if (!m?.status || !NBA_FINISHED_STATUSES.has(m.status)) continue;
        const matchId = `nba-${m.id}`;
        if (finishedMatchResults.has(matchId)) continue;
        const home = parseInt(m.home.totalscore) || 0;
        const away = parseInt(m.away.totalscore) || 0;
        const quarters: Array<[number, number]> = [];
        for (const [hv, av] of [
          [m.home.q1, m.away.q1], [m.home.q2, m.away.q2],
          [m.home.q3, m.away.q3], [m.home.q4, m.away.q4],
          [m.home.ot, m.away.ot],
        ] as [string|undefined, string|undefined][]) {
          const h = parseInt(hv ?? ""), a = parseInt(av ?? "");
          if (!isNaN(h) && !isNaN(a) && (h > 0 || a > 0)) quarters.push([h, a]);
        }
        const record = {
          home, away,
          homeTeam: m.home.name, awayTeam: m.away.name,
          status: "finished",
          extras: quarters.length > 0 ? { basketball: { quarters } } : {},
          finishedAt: Date.now(),
        };
        finishedMatchResults.set(matchId, record);
        await enqueueMatchSettlement({ matchId, jobId: buildMatchSettlementJobId({ matchId, home, away }) });
        await persistFinishedMatchRecord(matchId, "basketball", record);
      }
    }
    // 2. Daily results feed (yesterday's games)
    const daily = await getBasketballDailyResults();
    for (const r of daily) {
      const matchId = `nba-${r.id}`;
      if (finishedMatchResults.has(matchId)) continue;
      const record = {
        home: r.homeScore, away: r.awayScore,
        homeTeam: r.home, awayTeam: r.away,
        status: "finished",
        extras: r.quarters.length > 0 ? { basketball: { quarters: r.quarters } } : {},
        finishedAt: Date.now(),
      };
      finishedMatchResults.set(matchId, record);
      await enqueueMatchSettlement({ matchId, jobId: buildMatchSettlementJobId({ matchId, home: r.homeScore, away: r.awayScore }) });
      await persistFinishedMatchRecord(matchId, "basketball", record);
    }
    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanNBAForFinished failed");
  }
}

export async function scanMLBForFinished(): Promise<void> {
  if (!CONFIG.STATPAL_API_KEY) return;
  try {
    // 1. Live feed — catches matches that just ended
    const tournaments = await getMLBLive();
    for (const t of tournaments) {
      const matches: MLBMatch[] = Array.isArray(t.match) ? t.match : [t.match];
      for (const m of matches) {
        if (!m?.status || !MLB_FINISHED_STATUSES.has(m.status)) continue;
        const matchId = `mlb-${m.id}`;
        if (finishedMatchResults.has(matchId)) continue;
        const home = parseInt(m.home.r || m.home.totalscore) || 0;
        const away = parseInt(m.away.r || m.away.totalscore) || 0;
        const innings: Array<[number, number]> = [];
        const inKeys = ["in1","in2","in3","in4","in5","in6","in7","in8","in9"] as const;
        for (const key of inKeys) {
          const h = parseInt(m.home[key]), a = parseInt(m.away[key]);
          if (!isNaN(h) && !isNaN(a)) innings.push([h, a]);
        }
        const record = {
          home, away,
          homeTeam: m.home.name, awayTeam: m.away.name,
          status: "finished",
          extras: innings.length > 0 ? { baseball: { innings } } : {},
          finishedAt: Date.now(),
        };
        finishedMatchResults.set(matchId, record);
        await enqueueMatchSettlement({ matchId, jobId: buildMatchSettlementJobId({ matchId, home, away }) });
        await persistFinishedMatchRecord(matchId, "baseball", record);
      }
    }
    // 2. Daily results feed (yesterday's games)
    const daily = await getMLBDailyResults();
    for (const r of daily) {
      const matchId = `mlb-${r.id}`;
      if (finishedMatchResults.has(matchId)) continue;
      const record = {
        home: r.homeScore, away: r.awayScore,
        homeTeam: r.home, awayTeam: r.away,
        status: "finished",
        extras: r.innings.length > 0
          ? { baseball: { innings: r.innings.map(([h, a]) => [h ?? 0, a ?? 0] as [number, number]) } }
          : {},
        finishedAt: Date.now(),
      };
      finishedMatchResults.set(matchId, record);
      await enqueueMatchSettlement({ matchId, jobId: buildMatchSettlementJobId({ matchId, home: r.homeScore, away: r.awayScore }) });
      await persistFinishedMatchRecord(matchId, "baseball", record);
    }
    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanMLBForFinished failed");
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getDailyLeagues(): Promise<SAPILeagueV2[]> {
  const now = Date.now();
  if (dailyCache && now - dailyFetchedAt < CONFIG.DAILY_CACHE_TTL) {
    return dailyCache;
  }

  const dailyProvider = normalizeFootballProviderMode(
    CONFIG.FOOTBALL_DAILY_PROVIDER,
  );
  const sportsApiMissing = !CONFIG.SPORTSAPI_KEY;
  const canUseStatpal =
    !!CONFIG.STATPAL_API_KEY &&
    (dailyProvider === "auto" ||
      dailyProvider === "statpal" ||
      (dailyProvider === "sportsapipro" && sportsApiMissing));
  const canUseSportsApi =
    !!CONFIG.SPORTSAPI_KEY &&
    (dailyProvider === "auto" ||
      dailyProvider === "sportsapipro" ||
      dailyProvider === "statpal");

  if (canUseStatpal) {
    try {
      dailyCache = await fetchStatpalFootballDailyLeagues();
      dailyFetchedAt = now;
      return dailyCache;
    } catch (err) {
      logger.warn(
        { err, provider: "statpal" },
        "Football daily provider failed; falling back",
      );
    }
  }

  if (canUseSportsApi) {
    try {
      dailyCache = await fetchSportsApiFootballDailyLeagues();
      dailyFetchedAt = now;
      return dailyCache;
    } catch (err) {
      logger.warn(
        { err, provider: "sportsapipro" },
        "Football daily fallback failed",
      );
    }
  }

  return dailyCache ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// LIVE PROBABILITY ENGINE  — sportsbook-grade 1x2 calculation
// Ref: Probability → Normalise → Apply margin (6%) → Odds
// ────────────────────────────────────────────────────────────────────────────
const LIVE_MARGIN = 0.06; // 6% house margin (vig)

function calculateLive1x2(state: {
  minute: number;
  homeGoals: number;
  awayGoals: number;
  redCardsHome: number;
  redCardsAway: number;
  baseHome: number; // starting odds for this match (model/real)
  baseDraw: number;
  baseAway: number;
}): { home: number; draw: number; away: number } {
  const r = (n: number) => Math.round(n * 100) / 100;
  const vigFactor = 1 - LIVE_MARGIN;

  // 1. Fair pre-match probabilities from odds (normalised)
  const invH = state.baseHome > 1.01 ? 1 / state.baseHome : 0.33;
  const invD = state.baseDraw > 1.01 ? 1 / state.baseDraw : 0.33;
  const invA = state.baseAway > 1.01 ? 1 / state.baseAway : 0.33;
  const invSum = Math.max(1e-6, invH + invD + invA);
  const pHome0 = invH / invSum;
  const pDraw0 = invD / invSum;
  const pAway0 = invA / invSum;

  // 2. Estimate pre-match lambdas via team-strength split
  //    Total ~2.6 expected goals; each team's share proportional to (win + 45% draw) prob
  const totalLambda = 2.6;
  const homeStr = pHome0 + pDraw0 * 0.45;
  const awayStr = pAway0 + pDraw0 * 0.45;
  const lambdaHome = totalLambda * (homeStr / (homeStr + awayStr)) * 1.08; // slight home advantage
  const lambdaAway = totalLambda * (awayStr / (homeStr + awayStr)) * 0.92;

  // 3. Scale to remaining time
  const remainingFrac = Math.max(0.01, (90 - Math.min(state.minute, 89)) / 90);

  // 4. Red card adjustments (each RC: own attack −12%, opponent attack +4%)
  const muH =
    lambdaHome *
    remainingFrac *
    Math.max(0.4, 1 - 0.12 * state.redCardsHome + 0.04 * state.redCardsAway);
  const muA =
    lambdaAway *
    remainingFrac *
    Math.max(0.4, 1 - 0.12 * state.redCardsAway + 0.04 * state.redCardsHome);

  // 5. Poisson convolution over remaining goals, conditioned on current score
  //    This guarantees P(Draw) ≥ P(losing team wins) by construction — because
  //    to draw from N goals down requires N net goals; to win requires N+1 net goals.
  const MAX_G = 8;
  const pH = poissonPmf(muH, MAX_G);
  const pA = poissonPmf(muA, MAX_G);
  const diff = state.homeGoals - state.awayGoals; // positive = home leading

  let pHomeWin = 0,
    pDraw = 0,
    pAwayWin = 0;
  for (let kH = 0; kH <= MAX_G; kH++) {
    for (let kA = 0; kA <= MAX_G; kA++) {
      const p = pH[kH]! * pA[kA]!;
      const net = diff + kH - kA;
      if (net > 0) pHomeWin += p;
      else if (net === 0) pDraw += p;
      else pAwayWin += p;
    }
  }

  // 6. Normalise and apply margin
  const total = pHomeWin + pDraw + pAwayWin;
  pHomeWin /= total;
  pDraw /= total;
  pAwayWin /= total;

  // Global hard cap: no 1X2 odd exceeds 30.00.
  // Late-game draw rule: at 80+ min with a level score, cap further at 10.00.
  const isLevelLate = state.minute >= 80 && state.homeGoals === state.awayGoals;
  const cap = isLevelLate ? 10.0 : 30.0;
  return {
    home: Math.min(cap, Math.max(1.04, r((1 / pHomeWin) * vigFactor))),
    draw:
      pDraw > 0.005
        ? Math.min(cap, Math.max(1.04, r((1 / pDraw) * vigFactor)))
        : 0,
    away: Math.min(cap, Math.max(1.04, r((1 / pAwayWin) * vigFactor))),
  };
}

// Count red cards from events array
function countRedCards(
  events: Array<{ type: string; team: string }>,
  team: "home" | "away",
): number {
  return events.filter(
    (e) => e.type?.toLowerCase().includes("red") && e.team === team,
  ).length;
}

// ─── Tiered Market Drift Engine ─────────────────────────────────────────────
// Professional sportsbooks update each market family at different speeds.
// Tier 1 (1X2, Over/Under, Handicap)      : fast oscillation
// Tier 2 (HalfTime, HT/FT, CorrectScore)  : medium oscillation
// Tier 3 (Corners, Cards)                 : slow independent drift
//
// CRITICAL: all market odds are computed from _baseMarkets (the anchor set at
// score-change time), NOT from state.markets. This prevents exponential
// compounding — directional biases applied to the current value each 2s cycle
// would cause Under 3.5 to reach 1000+ within minutes.
function applyTieredMarketDrift(
  state: LiveMatchState,
  now: number,
): LiveMatchState {
  const { minute = 0, homeScore = 0, awayScore = 0 } = state;
  const baseOdds = state._baseOdds ?? state.odds;
  const bm = state._baseMarkets ?? state.markets;
  const phase = (state._driftPhase ?? 0) + 1;
  const t = now / 1000;
  const diff = homeScore - awayScore;
  const timePressure = Math.max(0, (minute - 55) / 60) * 0.04;
  const r = (n: number) => Math.round(n * 100) / 100;

  // ── Per-market independent update schedule ──────────────────────────────────
  // Each market group has its own timer so they NEVER all change at the same time.
  // Match-ID hash gives every match a unique phase offset (0-29 000ms) so even
  // the same market on different matches updates at slightly different moments.
  const idHash =
    parseInt(state.id.replace(/\D/g, "").slice(-5) || "12345", 10) % 30_000;
  const sched = state._marketNextUpdate ?? {};
  const newSched: Record<string, number> = { ...sched };

  // Returns true and schedules next window only when this market is due for refresh.
  // minMs/maxMs define the random window between updates.
  const due = (key: string, minMs: number, maxMs: number): boolean => {
    if (!sched[key]) {
      // First-time init: spread initial firings across the first minMs window
      // using match-hash + key-hash so no two markets fire simultaneously
      const keyOff = (key.charCodeAt(0) + key.charCodeAt(key.length - 1)) % 10;
      newSched[key] = now + (idHash % minMs) + keyOff * 1_500;
      return false; // don't fire on very first cycle
    }
    if (now >= sched[key]) {
      newSched[key] = now + minMs + Math.random() * (maxMs - minMs);
      return true;
    }
    return false;
  };

  // ── Main 1X2 odds (highest priority, 8–15s cadence for live feel) ──────────
  // For football, re-anchor to score-aware Poisson model every tick so that a
  // team winning 5-0 always has very low odds — not the pre-match line.
  const liveAnchor: { home: number; draw: number; away: number } =
    state.sport === "football"
      ? calculateLive1x2({
          minute,
          homeGoals: homeScore,
          awayGoals: awayScore,
          redCardsHome: state.redCardsHome ?? 0,
          redCardsAway: state.redCardsAway ?? 0,
          baseHome: baseOdds.home,
          baseDraw: baseOdds.draw,
          baseAway: baseOdds.away,
        })
      : baseOdds;

  const oddsOscH =
    Math.sin(t * 0.31 + phase * 0.7) * 0.018 + Math.cos(t * 0.17) * 0.009;
  const oddsOscD =
    Math.cos(t * 0.23 + phase * 0.5) * 0.014 + Math.sin(t * 0.11) * 0.007;
  const oddsOscA =
    Math.sin(t * 0.27 + phase * 0.9) * 0.018 + Math.cos(t * 0.19) * 0.009;
  // Hard caps: global max = 30.00; at 80+ min with level score → max = 10.00
  const _isLevelLate = minute >= 80 && homeScore === awayScore;
  const _oddsCap = _isLevelLate ? 10.0 : 30.0;

  const newOdds = due("odds", 8_000, 15_000)
    ? {
        home: Math.max(
          1.04,
          Math.min(_oddsCap, r(liveAnchor.home * (1 + oddsOscH))),
        ),
        draw:
          liveAnchor.draw > 0
            ? Math.max(
                1.04,
                Math.min(_oddsCap, r(liveAnchor.draw * (1 + oddsOscD))),
              )
            : 0,
        away: Math.max(
          1.04,
          Math.min(_oddsCap, r(liveAnchor.away * (1 + oddsOscA))),
        ),
      }
    : state.odds; // not due yet → unchanged (no arrow on frontend)

  // ── Oscillator values — computed fresh each cycle but only APPLIED when due ─
  const osc1 =
    Math.sin(t * 0.29 + phase * 0.8) * 0.013 +
    Math.cos(t * 0.13 + phase * 0.4) * 0.006;
  const osc2 =
    Math.sin(t * 0.11 + phase * 0.35) * 0.007 +
    Math.cos(t * 0.07 + phase * 0.2) * 0.003;
  const osc3 =
    Math.sin(t * 0.04 + phase * 0.15) * 0.003 +
    Math.cos(t * 0.025 + phase * 0.1) * 0.0015;

  const s1 = (n: number) =>
    n <= 0 ? n : r(Math.min(30.0, Math.max(1.01, n * (1 + osc1))));
  const s2 = (n: number) =>
    n <= 0 ? n : r(Math.min(30.0, Math.max(1.01, n * (1 + osc2))));
  const s3 = (n: number) =>
    n <= 0 ? n : r(Math.min(30.0, Math.max(1.01, n * (1 + osc3))));

  // Carry through already-settled zeros (filterLiveMarkets output)
  const keep0 = (cur: number, base: number, fn: (n: number) => number) =>
    cur <= 0 ? 0 : fn(base);
  const tg = state.markets.totalGoals;
  const btg = bm.totalGoals;

  // ── Tier 1 markets — each on its own 12–25s schedule ──────────────────────
  const dcDue = due("doubleChance", 12_000, 25_000);
  const btsDue = due("bothTeamsScore", 15_000, 30_000);
  const tgDue = due("totalGoals", 18_000, 35_000);
  const hcDue = due("handicap", 20_000, 40_000);
  const dnbDue = due("drawNoBet", 22_000, 45_000);
  const atDue = due("asianTotals", 25_000, 50_000);

  // ── Tier 2 markets — 40–80s ───────────────────────────────────────────────
  const htDue = due("halfTime", 40_000, 80_000);
  const fgDue = due("firstGoal", 45_000, 90_000);
  const ahDue = due("asianHandicap", 50_000, 100_000);
  const htftDue = due("htft", 60_000, 120_000);
  const csDue = due("correctScore", 65_000, 130_000);
  const htCSDue = due("htCorrectScore", 50_000, 100_000);
  const h2CSDue = due("h2CorrectScore", 50_000, 100_000);

  // ── Tier 3 markets — 80–150s ──────────────────────────────────────────────
  const cornDue = due("corners", 80_000, 150_000);
  const cardDue = due("cards", 90_000, 160_000);

  const newMarkets: AdvancedMarkets = {
    ...state.markets, // default: keep ALL current values (no change = no arrow)

    doubleChance: dcDue
      ? {
          homeOrDraw: s1(bm.doubleChance.homeOrDraw),
          awayOrDraw: s1(bm.doubleChance.awayOrDraw),
          homeOrAway: s1(bm.doubleChance.homeOrAway),
        }
      : state.markets.doubleChance,

    bothTeamsScore: btsDue
      ? (() => {
          const live = recalcLiveBothTeamsScore(
            state.home,
            state.away,
            state.homeScore ?? 0,
            state.awayScore ?? 0,
            state.minute ?? 0,
            state.status,
            state.markets.bothTeamsScore,
          );
          if (!live || live.yes <= 0) return state.markets.bothTeamsScore;
          return { yes: s1(live.yes), no: s1(live.no) };
        })()
      : state.markets.bothTeamsScore,

    totalGoals: tgDue
      ? (() => {
          // Recalculate from current game state (remaining time + score), then apply a tiny oscillation
          const live = recalcLiveTotalGoals(
            state.home,
            state.away,
            (state.homeScore ?? 0) + (state.awayScore ?? 0),
            state.minute ?? 0,
            state.status,
            state.markets.totalGoals,
          );
          return {
            over05: live.over05 > 0 ? Math.min(5.0, s1(live.over05)) : 0,
            under05: live.under05 > 0 ? s1(live.under05) : 0,
            over15: live.over15 > 0 ? Math.min(49.99, s1(live.over15)) : 0,
            under15: live.under15 > 0 ? s1(live.under15) : 0,
            over25: live.over25 > 0 ? Math.min(49.99, s1(live.over25)) : 0,
            under25: live.under25 > 0 ? s1(live.under25) : 0,
            over35: live.over35 > 0 ? Math.min(49.99, s1(live.over35)) : 0,
            under35: live.under35 > 0 ? s1(live.under35) : 0,
            over45: live.over45 > 0 ? Math.min(49.99, s1(live.over45)) : 0,
            under45: live.under45 > 0 ? s1(live.under45) : 0,
            over55: live.over55 > 0 ? Math.min(49.99, s1(live.over55)) : 0,
            under55: live.under55 > 0 ? s1(live.under55) : 0,
            over65: live.over65 > 0 ? Math.min(49.99, s1(live.over65)) : 0,
            under65: live.under65 > 0 ? s1(live.under65) : 0,
          };
        })()
      : state.markets.totalGoals,

    teamGoals:
      tgDue && state.markets.teamGoals
        ? (() => {
            const live = recalcLiveTeamGoals(
              state.home,
              state.away,
              state.homeScore ?? 0,
              state.awayScore ?? 0,
              state.minute ?? 0,
              state.status,
              state.markets.teamGoals,
            );
            return {
              homeOver05: live.homeOver05 > 0 ? s1(live.homeOver05) : 0,
              homeUnder05: live.homeUnder05 > 0 ? s1(live.homeUnder05) : 0,
              homeOver15: live.homeOver15 > 0 ? s1(live.homeOver15) : 0,
              homeUnder15: live.homeUnder15 > 0 ? s1(live.homeUnder15) : 0,
              homeOver25: live.homeOver25 > 0 ? s1(live.homeOver25) : 0,
              homeUnder25: live.homeUnder25 > 0 ? s1(live.homeUnder25) : 0,
              awayOver05: live.awayOver05 > 0 ? s1(live.awayOver05) : 0,
              awayUnder05: live.awayUnder05 > 0 ? s1(live.awayUnder05) : 0,
              awayOver15: live.awayOver15 > 0 ? s1(live.awayOver15) : 0,
              awayUnder15: live.awayUnder15 > 0 ? s1(live.awayUnder15) : 0,
              awayOver25: live.awayOver25 > 0 ? s1(live.awayOver25) : 0,
              awayUnder25: live.awayUnder25 > 0 ? s1(live.awayUnder25) : 0,
            };
          })()
        : state.markets.teamGoals,

    handicap: hcDue
      ? {
          homeMinusOne: s1(bm.handicap.homeMinusOne),
          awayPlusOne: s1(bm.handicap.awayPlusOne),
          homeMinusOneHalf: s1(bm.handicap.homeMinusOneHalf),
          awayPlusOneHalf: s1(bm.handicap.awayPlusOneHalf),
        }
      : state.markets.handicap,

    drawNoBet:
      dnbDue && bm.drawNoBet
        ? { home: s1(bm.drawNoBet.home), away: s1(bm.drawNoBet.away) }
        : state.markets.drawNoBet,

    asianTotals:
      atDue && bm.asianTotals
        ? {
            o05: s1(bm.asianTotals.o05),
            u05: s1(bm.asianTotals.u05),
            o45: s1(bm.asianTotals.o45),
            u45: s1(bm.asianTotals.u45),
            o55: s1(bm.asianTotals.o55),
            u55: s1(bm.asianTotals.u55),
            o225: s1(bm.asianTotals.o225),
            u225: s1(bm.asianTotals.u225),
            o275: s1(bm.asianTotals.o275),
            u275: s1(bm.asianTotals.u275),
          }
        : state.markets.asianTotals,

    halfTime: htDue
      ? recalcLiveHalfTime(
          state.home,
          state.away,
          state.homeScore ?? 0,
          state.awayScore ?? 0,
          state.minute ?? 0,
          state.status,
          state.markets.halfTime,
        )
      : state.markets.halfTime,

    secondHalf: htDue
      ? recalcLiveSecondHalf(
          state.home,
          state.away,
          state.homeScore ?? 0,
          state.awayScore ?? 0,
          (state._liveExtra?.htScore ?? null) as [number, number] | null,
          state.minute ?? 0,
          state.status,
          state.markets.secondHalf,
        )
      : state.markets.secondHalf,

    firstGoal: fgDue
      ? state.markets.firstGoal && state.markets.firstGoal.home > 0
        ? {
            home: s2(bm.firstGoal!.home),
            noGoal: s2(bm.firstGoal!.noGoal),
            away: s2(bm.firstGoal!.away),
          }
        : state.markets.firstGoal
      : state.markets.firstGoal,

    asianHandicap:
      ahDue && bm.asianHandicap
        ? {
            ...bm.asianHandicap,
            home: s2(bm.asianHandicap.home),
            away: s2(bm.asianHandicap.away),
          }
        : state.markets.asianHandicap,

    htft:
      htftDue && bm.htft
        ? {
            hh: s2(bm.htft.hh),
            hd: s2(bm.htft.hd),
            ha: s2(bm.htft.ha),
            dh: s2(bm.htft.dh),
            dd: s2(bm.htft.dd),
            da: s2(bm.htft.da),
            ah: s2(bm.htft.ah),
            ad: s2(bm.htft.ad),
            aa: s2(bm.htft.aa),
          }
        : state.markets.htft,

    correctScore:
      csDue && state.sport === "football"
        ? recalcLiveCorrectScore(
            state.home,
            state.away,
            homeScore,
            awayScore,
            minute,
            state.status,
            state.markets.correctScore,
          )
        : csDue && bm.correctScore
          ? Object.fromEntries(
              Object.entries(bm.correctScore).map(([k, v]) => {
                const cur = state.markets.correctScore?.[k] ?? 0;
                return [k, keep0(cur, v, s2)];
              }),
            )
          : state.markets.correctScore,

    htCorrectScore:
      htCSDue && state.sport === "football"
        ? recalcLiveHtCorrectScore(
            state.home,
            state.away,
            homeScore,
            awayScore,
            (state._liveExtra as any)?.htScore ?? null,
            minute,
            state.status,
            state.markets.htCorrectScore as Record<string, number> | undefined,
          )
        : state.markets.htCorrectScore,

    h2CorrectScore:
      h2CSDue && state.sport === "football"
        ? recalcLiveH2CorrectScore(
            state.home,
            state.away,
            homeScore,
            awayScore,
            (state._liveExtra as any)?.htScore ?? null,
            minute,
            state.status,
            state.markets.h2CorrectScore as Record<string, number> | undefined,
          )
        : state.markets.h2CorrectScore,

    corners:
      cornDue && bm.corners
        ? {
            o85: s3(bm.corners.o85),
            u85: s3(bm.corners.u85),
            o95: s3(bm.corners.o95),
            u95: s3(bm.corners.u95),
            o105: s3(bm.corners.o105),
            u105: s3(bm.corners.u105),
          }
        : state.markets.corners,

    cards:
      cardDue && bm.cards
        ? {
            o35: s3(bm.cards.o35),
            u35: s3(bm.cards.u35),
            o45: s3(bm.cards.o45),
            u45: s3(bm.cards.u45),
          }
        : state.markets.cards,
  };

  return {
    ...state,
    odds: newOdds,
    markets: newMarkets,
    _driftPhase: phase,
    _marketNextUpdate: newSched,
  };
}

// Recalculate open (non-settled) total goals lines using live-adjusted expected goals.
// λ_remaining = λ_total × (remainingMins / 90); each open line is repriced from remaining need.
function recalcLiveTotalGoals(
  home: string,
  away: string,
  currentGoals: number,
  minute: number,
  status: string,
  settled: AdvancedMarkets["totalGoals"],
): AdvancedMarkets["totalGoals"] {
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaTotal = lambdaHome + lambdaAway;
  const isHT = status === "HT";
  // Remaining minutes: HT → 45 still to play; otherwise 90 − minute, floor at 1
  const remainingMins = isHT ? 45 : Math.max(1, 90 - Math.min(90, minute));
  const lambdaRem = lambdaTotal * (remainingMins / 90);

  // For a given line (e.g. 2.5), needed = goals still required to win Over
  // If already settled (cur ≤ 0 from filterLiveMarkets) → keep 0
  // Keep mathematically open lines visible for longer so 5.5/6.5 don't disappear
  // too early after a high-scoring match reaches 4 or 5 goals.
  const recalcLine = (cur: number, targetTotal: number): [number, number] => {
    if (cur <= 0) return [0, 0];
    const needed = Math.max(1, targetTotal - currentGoals);
    const pOverRaw = 1 - poissonCdf(lambdaRem, needed - 1);
    if (pOverRaw < 0.001) return [0, 0]; // effectively impossible — hide line
    const pOver = mc(pOverRaw, 0.01, 0.99);
    const pUnder = mc(1 - pOver, 0.01, 0.99);
    const [oOdds, uOdds] = probsToDecimalOdds([pOver, pUnder], 1.06);
    return [oOdds!, uOdds!];
  };

  const [o05, u05] = recalcLine(settled.over05, 1);
  const [o15, u15] = recalcLine(settled.over15, 2);
  const [o25, u25] = recalcLine(settled.over25, 3);
  const [o35, u35] = recalcLine(settled.over35, 4);
  const [o45, u45] = recalcLine(settled.over45, 5);
  const [o55, u55] = recalcLine(settled.over55, 6);
  const [o65, u65] = recalcLine(settled.over65, 7);

  return {
    over05: o05,
    under05: u05,
    over15: o15,
    under15: u15,
    over25: o25,
    under25: u25,
    over35: o35,
    under35: u35,
    over45: o45,
    under45: u45,
    over55: o55,
    under55: u55,
    over65: o65,
    under65: u65,
  };
}

// Per-team goal O/U live recalculation using remaining Poisson lambda per team
function recalcLiveTeamGoals(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  minute: number,
  status: string,
  settled: NonNullable<AdvancedMarkets["teamGoals"]>,
): NonNullable<AdvancedMarkets["teamGoals"]> {
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const isHT = status === "HT";
  const remainingMins = isHT ? 45 : Math.max(1, 90 - Math.min(90, minute));
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const recalcTeamLine = (
    cur: number,
    targetTotal: number,
    teamScore: number,
    lambdaRem: number,
  ): [number, number] => {
    if (cur <= 0) return [0, 0];
    const needed = Math.max(1, targetTotal - teamScore);
    const pOverRaw = 1 - poissonCdf(lambdaRem, needed - 1);
    if (pOverRaw < 0.01) return [0, 0]; // effectively impossible — hide line
    const pOver = mc(pOverRaw, 0.01, 0.99);
    const pUnder = mc(1 - pOver, 0.01, 0.99);
    const [oOdds, uOdds] = probsToDecimalOdds([pOver, pUnder], 1.06);
    return [oOdds!, uOdds!];
  };

  const [hO05, hU05] = recalcTeamLine(
    settled.homeOver05,
    1,
    homeScore,
    lambdaRemH,
  );
  const [hO15, hU15] = recalcTeamLine(
    settled.homeOver15,
    2,
    homeScore,
    lambdaRemH,
  );
  const [hO25, hU25] = recalcTeamLine(
    settled.homeOver25,
    3,
    homeScore,
    lambdaRemH,
  );
  const [aO05, aU05] = recalcTeamLine(
    settled.awayOver05,
    1,
    awayScore,
    lambdaRemA,
  );
  const [aO15, aU15] = recalcTeamLine(
    settled.awayOver15,
    2,
    awayScore,
    lambdaRemA,
  );
  const [aO25, aU25] = recalcTeamLine(
    settled.awayOver25,
    3,
    awayScore,
    lambdaRemA,
  );

  return {
    homeOver05: hO05,
    homeUnder05: hU05,
    homeOver15: hO15,
    homeUnder15: hU15,
    homeOver25: hO25,
    homeUnder25: hU25,
    awayOver05: aO05,
    awayUnder05: aU05,
    awayOver15: aO15,
    awayUnder15: aU15,
    awayOver25: aO25,
    awayUnder25: aU25,
  };
}

// Live "Ambas Marcam" recalculation: accounts for which teams have already scored.
function recalcLiveBothTeamsScore(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  minute: number,
  status: string,
  settled: AdvancedMarkets["bothTeamsScore"],
): AdvancedMarkets["bothTeamsScore"] {
  if (!settled || settled.yes <= 0) return settled;
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const isHT = status === "HT";
  const remainingMins = isHT ? 45 : Math.max(1, 90 - Math.min(90, minute));
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);
  // P(team scores ≥1 from now) = 1 − e^(−λ_rem)
  const pHomeSc = 1 - Math.exp(-lambdaRemH);
  const pAwaySc = 1 - Math.exp(-lambdaRemA);
  let pYes: number;
  if (homeScore >= 1 && awayScore >= 1)
    return { yes: 0, no: 0 }; // already settled
  else if (homeScore >= 1)
    pYes = pAwaySc; // only away needs to score
  else if (awayScore >= 1)
    pYes = pHomeSc; // only home needs to score
  else pYes = pHomeSc * pAwaySc; // both must still score
  pYes = mc(pYes, 0.02, 0.98);
  const [yes, no] = probsToDecimalOdds([pYes, 1 - pYes], 1.06);
  return { yes: yes!, no: no! };
}

/**
 * Recalculate the "Resultado 1º Tempo" market live.
 * Remaining first-half goals are Poisson(λ * remainingMins/90).
 * Score added to current 1st-half score to get final 1st-half outcome.
 */
function recalcLiveHalfTime(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  minute: number,
  status: string,
  current: AdvancedMarkets["halfTime"],
): AdvancedMarkets["halfTime"] {
  if (!current) return current;
  const isHT = status === "HT";
  const inSecondHalf = !isHT && minute > 45;

  // After HT, 1st half result is settled — show winner at near-certain odds, losers at 0
  if (isHT || inSecondHalf) {
    if (homeScore > awayScore) return { home: 1.01, draw: 0, away: 0 };
    if (awayScore > homeScore) return { home: 0, draw: 0, away: 1.01 };
    return { home: 0, draw: 1.01, away: 0 };
  }

  // 1st half in progress: remaining minutes until whistle
  const remainingMins = Math.max(1, 45 - Math.min(45, minute));
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const maxAdd = 6;
  const pAddH = poissonPmf(lambdaRemH, maxAdd);
  const pAddA = poissonPmf(lambdaRemA, maxAdd);

  let pH = 0,
    pD = 0,
    pA = 0;
  for (let addH = 0; addH <= maxAdd; addH++) {
    for (let addA = 0; addA <= maxAdd; addA++) {
      const p = (pAddH[addH] ?? 0) * (pAddA[addA] ?? 0);
      const finalH = homeScore + addH;
      const finalA = awayScore + addA;
      if (finalH > finalA) pH += p;
      else if (finalH === finalA) pD += p;
      else pA += p;
    }
  }
  const total = pH + pD + pA;
  if (total < 1e-9) return current;
  const [h, d, a] = probsToDecimalOdds(
    [
      mc(pH / total, 0.01, 0.99),
      mc(pD / total, 0.01, 0.99),
      mc(pA / total, 0.01, 0.99),
    ],
    1.08,
  );
  return { home: h!, draw: d!, away: a! };
}

/**
 * Recalculate the "Resultado 2º Tempo" market live.
 * Uses the 2nd-half partial score (total − HT score) + remaining Poisson goals.
 * During 1st half / HT, the base pre-match odds are returned unchanged.
 */
function recalcLiveSecondHalf(
  home: string,
  away: string,
  homeScoreTotal: number,
  awayScoreTotal: number,
  htScore: [number, number] | null,
  minute: number,
  status: string,
  current: AdvancedMarkets["secondHalf"],
): AdvancedMarkets["secondHalf"] {
  if (!current) return current;
  const isHT = status === "HT";
  const inFirstHalf = !isHT && minute <= 45;

  // 2nd half not yet started → keep pre-match distribution unchanged
  if (inFirstHalf || isHT) return current;

  // 2nd-half score = total match score minus half-time score
  const htH = htScore ? htScore[0] : 0;
  const htA = htScore ? htScore[1] : 0;
  const h2H = Math.max(0, homeScoreTotal - htH);
  const h2A = Math.max(0, awayScoreTotal - htA);

  const remainingMins = Math.max(1, 90 - Math.min(90, minute));
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const maxAdd = 6;
  const pAddH = poissonPmf(lambdaRemH, maxAdd);
  const pAddA = poissonPmf(lambdaRemA, maxAdd);

  let pH = 0,
    pD = 0,
    pA = 0;
  for (let addH = 0; addH <= maxAdd; addH++) {
    for (let addA = 0; addA <= maxAdd; addA++) {
      const p = (pAddH[addH] ?? 0) * (pAddA[addA] ?? 0);
      const finalH = h2H + addH;
      const finalA = h2A + addA;
      if (finalH > finalA) pH += p;
      else if (finalH === finalA) pD += p;
      else pA += p;
    }
  }
  const total = pH + pD + pA;
  if (total < 1e-9) return current;
  const [h, d, a] = probsToDecimalOdds(
    [
      mc(pH / total, 0.01, 0.99),
      mc(pD / total, 0.01, 0.99),
      mc(pA / total, 0.01, 0.99),
    ],
    1.08,
  );
  return { home: h!, draw: d!, away: a! };
}

// ─── Live correct-score recalculation (Poisson remaining time) ────────────────

/**
 * Reprices the full-match correct score market live.
 * Each still-reachable score gets a fresh probability from Poisson(λ_rem).
 * Settled (zeroed) entries stay at 0; "Outro" absorbs all untracked scorelines.
 */
function recalcLiveCorrectScore(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  minute: number,
  status: string,
  current: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!current || Object.keys(current).length === 0) return current;
  const isHT = status === "HT";
  const remainingMins = isHT ? 45 : Math.max(1, 90 - Math.min(90, minute));
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const maxAdd = 6;
  const pAddH = poissonPmf(lambdaRemH, maxAdd);
  const pAddA = poissonPmf(lambdaRemA, maxAdd);

  const scoreProbs = new Map<string, number>();
  let pOther = 0;
  for (let addH = 0; addH <= maxAdd; addH++) {
    for (let addA = 0; addA <= maxAdd; addA++) {
      const p = (pAddH[addH] ?? 0) * (pAddA[addA] ?? 0);
      const key = `${homeScore + addH}-${awayScore + addA}`;
      if (current[key] !== undefined)
        scoreProbs.set(key, (scoreProbs.get(key) ?? 0) + p);
      else pOther += p;
    }
  }

  const total =
    Array.from(scoreProbs.values()).reduce((s, v) => s + v, 0) + pOther;
  if (total < 1e-9) return current;

  const result: Record<string, number> = {};
  for (const [score, p] of scoreProbs) {
    if ((current[score] ?? 0) <= 0) {
      result[score] = 0;
      continue;
    }
    // Direct single-outcome odds: 1 / (prob × margin). Calling probsToDecimalOdds
    // with a single element always normalises it to 1.0 and returns the margin floor
    // (≈0.89 → clamped to 1.01), so we compute directly instead.
    const prob = mc(p / total, 0.003, 0.97);
    result[score] = Math.max(1.01, mr(1 / (prob * 1.12)));
  }
  if ("Outro" in current && (current["Outro"] ?? 0) > 0) {
    const pOtherProb = mc(pOther / total, 0.003, 0.97);
    result["Outro"] = Math.max(1.01, mr(1 / (pOtherProb * 1.12)));
  }
  return result;
}

/**
 * Reprices the HT correct score market live.
 * During 1st half: Poisson for remaining 1st-half minutes.
 * After HT: settled — show actual HT score at 1.01, rest at 0.
 */
function recalcLiveHtCorrectScore(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  htScore: [number, number] | null,
  minute: number,
  status: string,
  current: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!current || Object.keys(current).length === 0) return current;
  const isHT = status === "HT";
  const inSecondHalf = !isHT && minute > 45;

  if (isHT || inSecondHalf) {
    const finalH = htScore ? htScore[0] : homeScore;
    const finalA = htScore ? htScore[1] : awayScore;
    const settledKey = `${finalH}-${finalA}`;
    const result: Record<string, number> = {};
    for (const k of Object.keys(current))
      (result as any)[k] = k === settledKey ? 1.01 : 0;
    return result;
  }

  const remainingMins = Math.max(1, 45 - Math.min(45, minute));
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const maxAdd = 5;
  const pAddH = poissonPmf(lambdaRemH, maxAdd);
  const pAddA = poissonPmf(lambdaRemA, maxAdd);

  const scoreProbs = new Map<string, number>();
  let pOther = 0;
  for (let addH = 0; addH <= maxAdd; addH++) {
    for (let addA = 0; addA <= maxAdd; addA++) {
      const p = (pAddH[addH] ?? 0) * (pAddA[addA] ?? 0);
      const key = `${homeScore + addH}-${awayScore + addA}`;
      if (current[key] !== undefined)
        scoreProbs.set(key, (scoreProbs.get(key) ?? 0) + p);
      else pOther += p;
    }
  }

  const total =
    Array.from(scoreProbs.values()).reduce((s, v) => s + v, 0) + pOther;
  if (total < 1e-9) return current;

  const result: Record<string, number> = {};
  for (const [score, p] of scoreProbs) {
    if ((current[score] ?? 0) <= 0) {
      result[score] = 0;
      continue;
    }
    // Direct single-outcome odds: 1 / (prob × margin). Calling probsToDecimalOdds
    // with a single element always normalises it to 1.0 and returns the margin floor
    // (≈0.89 → clamped to 1.01), so we compute directly instead.
    const prob = mc(p / total, 0.003, 0.97);
    result[score] = Math.max(1.01, mr(1 / (prob * 1.12)));
  }
  if ("Outro" in current && (current["Outro"] ?? 0) > 0) {
    const pOtherProb = mc(pOther / total, 0.003, 0.97);
    result["Outro"] = Math.max(1.01, mr(1 / (pOtherProb * 1.12)));
  }
  return result;
}

/**
 * Reprices the 2nd-half correct score market live.
 * Uses current 2nd-half partial score (total minus HT score) + remaining time.
 * During 1st half / HT: returns pre-match odds unchanged.
 */
function recalcLiveH2CorrectScore(
  home: string,
  away: string,
  homeScoreTotal: number,
  awayScoreTotal: number,
  htScore: [number, number] | null,
  minute: number,
  status: string,
  current: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!current || Object.keys(current).length === 0) return current;
  const isHT = status === "HT";
  const inFirstHalf = !isHT && minute <= 45;
  if (inFirstHalf || isHT) return current;

  const htH = htScore ? htScore[0] : 0;
  const htA = htScore ? htScore[1] : 0;
  const h2H = Math.max(0, homeScoreTotal - htH);
  const h2A = Math.max(0, awayScoreTotal - htA);

  const remainingMins = Math.max(1, 90 - Math.min(90, minute));
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const maxAdd = 5;
  const pAddH = poissonPmf(lambdaRemH, maxAdd);
  const pAddA = poissonPmf(lambdaRemA, maxAdd);

  const scoreProbs = new Map<string, number>();
  let pOther = 0;
  for (let addH = 0; addH <= maxAdd; addH++) {
    for (let addA = 0; addA <= maxAdd; addA++) {
      const p = (pAddH[addH] ?? 0) * (pAddA[addA] ?? 0);
      const key = `${h2H + addH}-${h2A + addA}`;
      if (current[key] !== undefined)
        scoreProbs.set(key, (scoreProbs.get(key) ?? 0) + p);
      else pOther += p;
    }
  }

  const total =
    Array.from(scoreProbs.values()).reduce((s, v) => s + v, 0) + pOther;
  if (total < 1e-9) return current;

  const result: Record<string, number> = {};
  for (const [score, p] of scoreProbs) {
    if ((current[score] ?? 0) <= 0) {
      result[score] = 0;
      continue;
    }
    // Direct single-outcome odds: 1 / (prob × margin). Calling probsToDecimalOdds
    // with a single element always normalises it to 1.0 and returns the margin floor
    // (≈0.89 → clamped to 1.01), so we compute directly instead.
    const prob = mc(p / total, 0.003, 0.97);
    result[score] = Math.max(1.01, mr(1 / (prob * 1.12)));
  }
  if ("Outro" in current && (current["Outro"] ?? 0) > 0) {
    const pOtherProb = mc(pOther / total, 0.003, 0.97);
    result["Outro"] = Math.max(1.01, mr(1 / (pOtherProb * 1.12)));
  }
  return result;
}

// Remove/zero out market lines that are already settled or impossible given the current live score
function filterLiveMarkets(
  markets: AdvancedMarkets,
  homeScore: number,
  awayScore: number,
  status?: string,
): AdvancedMarkets {
  const m: AdvancedMarkets = {
    ...markets,
    totalGoals: { ...markets.totalGoals },
    ...(markets.teamGoals ? { teamGoals: { ...markets.teamGoals } } : {}),
    ...(markets.exactGoals ? { exactGoals: { ...markets.exactGoals } } : {}),
  };
  const totalGoals = homeScore + awayScore;

  // Correct Score: only keep scorelines that are still achievable (both sides >= current score)
  if (m.correctScore) {
    const filtered: Record<string, number> = {};
    for (const [score, odd] of Object.entries(m.correctScore)) {
      if (score === "Outro") {
        filtered[score] = odd;
        continue;
      }
      const [hs, as_] = score.split("-").map(Number);
      if (
        hs !== undefined &&
        as_ !== undefined &&
        hs >= homeScore &&
        as_ >= awayScore
      ) {
        filtered[score] = odd;
      }
    }
    m.correctScore = Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  // Total Goals: zero out lines already settled by the current goal tally
  const tg = m.totalGoals;
  if (totalGoals >= 1) {
    tg.over05 = 0;
    tg.under05 = 0;
  }
  if (totalGoals >= 2) {
    tg.over15 = 0;
    tg.under15 = 0;
  }
  if (totalGoals >= 3) {
    tg.over25 = 0;
    tg.under25 = 0;
  }
  if (totalGoals >= 4) {
    tg.over35 = 0;
    tg.under35 = 0;
  }
  if (totalGoals >= 5) {
    tg.over45 = 0;
    tg.under45 = 0;
  }
  if (totalGoals >= 6) {
    tg.over55 = 0;
    tg.under55 = 0;
  }

  // First Goal: settled once any goal has been scored
  if (totalGoals > 0) {
    m.firstGoal = { home: 0, noGoal: 0, away: 0 };
  }

  // Both Teams Score: settled when both have scored already
  if (homeScore > 0 && awayScore > 0) {
    m.bothTeamsScore = { yes: 0, no: 0 };
  }

  // Win to Nil / Clean Sheet: impossible once the opposing team has scored
  if (awayScore > 0) {
    m.winToNil = { home: 0, away: m.winToNil?.away ?? 0 };
    m.cleanSheet = { home: 0, away: m.cleanSheet?.away ?? 0 };
  }
  if (homeScore > 0) {
    m.winToNil = { home: m.winToNil?.home ?? 0, away: 0 };
    m.cleanSheet = { home: m.cleanSheet?.home ?? 0, away: 0 };
  }

  // Exact Goals: zero out impossible totals below current score
  if (m.exactGoals && totalGoals > 0) {
    if (totalGoals > 0) m.exactGoals.g0 = 0;
    if (totalGoals > 1) m.exactGoals.g1 = 0;
    if (totalGoals > 2) m.exactGoals.g2 = 0;
    if (totalGoals > 3) m.exactGoals.g3 = 0;
    if (totalGoals > 4) m.exactGoals.g4 = 0;
  }

  // HT Correct Score: filter out scorelines below current (during 1st half these ARE the HT scores)
  if (m.htCorrectScore) {
    const filtered: Record<string, number> = {};
    for (const [score, odd] of Object.entries(m.htCorrectScore)) {
      if (score === "Outro") {
        filtered[score] = odd;
        continue;
      }
      const [hs, as_] = score.split("-").map(Number);
      if (
        hs !== undefined &&
        as_ !== undefined &&
        hs >= homeScore &&
        as_ >= awayScore
      ) {
        filtered[score] = odd;
      }
    }
    m.htCorrectScore = Object.keys(filtered).length > 1 ? filtered : undefined;
  }

  // Team Goals: zero out settled lines when a team reaches the threshold
  if (m.teamGoals) {
    const tg = m.teamGoals;
    if (homeScore >= 1) {
      tg.homeOver05 = 0;
      tg.homeUnder05 = 0;
    }
    if (homeScore >= 2) {
      tg.homeOver15 = 0;
      tg.homeUnder15 = 0;
    }
    if (homeScore >= 3) {
      tg.homeOver25 = 0;
      tg.homeUnder25 = 0;
    }
    if (awayScore >= 1) {
      tg.awayOver05 = 0;
      tg.awayUnder05 = 0;
    }
    if (awayScore >= 2) {
      tg.awayOver15 = 0;
      tg.awayUnder15 = 0;
    }
    if (awayScore >= 3) {
      tg.awayOver25 = 0;
      tg.awayUnder25 = 0;
    }
  }

  // ── Status-based filtering: settle 1st-half markets at HT or 2nd half ───────
  const isPostHT = status === "HT" || status === "2nd half" || status === "ET";
  const is1stHalf = !isPostHT && status === "1st half";

  if (isPostHT) {
    // 1T result market settled at HT — zero it so frontend hides the buttons
    m.halfTime = { home: 0, draw: 0, away: 0 };
    // HT correct score settled (result is known)
    m.htCorrectScore = undefined;
    // BTTS 1st half market settled (yes or no — either way it's done)
    m.btts1H = { yes: 0, no: 0 };
    // htft combos: 1st leg is locked, only 2nd leg still open — zero out
    // (keep htft as-is; frontend already gates it behind show1tempo)
  }

  if (is1stHalf && homeScore > 0 && awayScore > 0) {
    // Both teams already scored in 1st half → BTTS 1T settled as "yes"
    m.btts1H = { yes: 0, no: 0 };
  }

  // btts2H: only reveal from HT onwards; hide during 1st half
  if (is1stHalf) {
    m.btts2H = undefined;
  }

  return m;
}

// Statpal /v1/nhl/livescores — was 30s then 5s; matched to the ~1s SSE
// broadcast tick like football/tennis, since polling slower than the
// broadcast cadence just adds latency for no benefit.
const NHL_LIVE_TTL = CONFIG.LIVE_UPDATE_INTERVAL;

async function getNHLLive(): Promise<NHLTournament[]> {
  const now = Date.now();
  if (nhlLiveCache && now - nhlLiveFetchedAt < NHL_LIVE_TTL) return nhlLiveCache;
  if (!CONFIG.STATPAL_API_KEY) return nhlLiveCache ?? [];

  try {
    const resp = await fetch(buildStatpalUrl("/v1/nhl/livescores"), {
      signal: AbortSignal.timeout(8_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) return nhlLiveCache ?? [];
    const payload = (await resp.json()) as {
      livescores?: { tournament?: NHLTournament | NHLTournament[] };
    };
    nhlLiveCache = statpalList(payload.livescores?.tournament);
    nhlLiveFetchedAt = now;
    return nhlLiveCache;
  } catch {
    return nhlLiveCache ?? [];
  }

  return nhlLiveCache ?? [];
}

// ─── MLB live feed ────────────────────────────────────────────────────────────
// Statpal /v1/mlb/livescores — real-time MLB scores with inning-by-inning
// breakdown, starting pitchers, venue info, hits, errors, outs.
// Runs/hits/outs change far more often than innings do, so tie the TTL to
// the ~1s SSE broadcast tick like football/tennis (was 5s — polling slower
// than the broadcast cadence just adds latency for no benefit).
const MLB_LIVE_TTL = CONFIG.LIVE_UPDATE_INTERVAL;

async function getMLBLive(): Promise<MLBTournament[]> {
  const now = Date.now();
  if (mlbLiveCache && now - mlbLiveFetchedAt < MLB_LIVE_TTL)
    return mlbLiveCache;

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/mlb/livescores"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          livescores?: { tournament?: MLBTournament | MLBTournament[] };
        };
        const tournaments = statpalList(payload.livescores?.tournament);
        if (tournaments.length > 0 || mlbLiveCache == null) {
          mlbLiveCache = tournaments;
          mlbLiveFetchedAt = now;
        }
        return mlbLiveCache ?? [];
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "MLB livescores fetch failed");
    }
  }

  return mlbLiveCache ?? [];
}

// Statpal /v1/nba/livescores — quarter-by-quarter scores with OT support.
// Points change on almost every possession, so tie the TTL to the ~1s SSE
// broadcast tick like football/tennis (was 5s — polling slower than the
// broadcast cadence just adds latency for no benefit).
const NBA_LIVE_TTL = CONFIG.LIVE_UPDATE_INTERVAL;

async function getNBALive(): Promise<NBATournament[]> {
  const now = Date.now();
  if (nbaLiveCache && now - nbaLiveFetchedAt < NBA_LIVE_TTL)
    return nbaLiveCache;

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nba/livescores"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          livescores?: { tournament?: NBATournament | NBATournament[] };
        };
        const tournaments = statpalList(payload.livescores?.tournament);
        if (tournaments.length > 0 || nbaLiveCache == null) {
          nbaLiveCache = tournaments;
          nbaLiveFetchedAt = now;
        }
        return nbaLiveCache ?? [];
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NBA livescores fetch failed");
    }
  }

  return nbaLiveCache ?? [];
}

async function getVolleyballLive(): Promise<VolleyTournament[]> {
  const now = Date.now();
  if (volleyLiveCache && now - volleyLiveFetchedAt < VOLLEY_LIVE_TTL)
    return volleyLiveCache;
  if (!CONFIG.STATPAL_API_KEY) return volleyLiveCache ?? [];

  try {
    const resp = await fetch(buildStatpalUrl("/v1/volleyball/livescores"), {
      signal: AbortSignal.timeout(8_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) return volleyLiveCache ?? [];
    const payload = (await resp.json()) as {
      livescores?: { tournament?: VolleyTournament | VolleyTournament[] };
    };
    volleyLiveCache = statpalList(payload.livescores?.tournament);
    volleyLiveFetchedAt = now;
    return volleyLiveCache;
  } catch (err) {
    logger.warn({ err, provider: "statpal" }, "Volleyball livescores provider failed");
    return volleyLiveCache ?? [];
  }
}

// ─── SportsAPI Pro V2 Live Fetch Functions ────────────────────────────────────
// A Statpal rate-limit (429) backoff routinely outlasts 30s, and wiping the
// live cache to empty during that window causes the live section to go
// completely blank until it recovers — worse, any match that first turns
// live during the outage then reads as "already stale" once the feed comes
// back (see the evAgeSeconds > 20min gate below), permanently excluding it.
// Ride out longer outages with stale-but-present data instead.
const V2_LIVE_MAX_STALE_MS = 5 * 60_000;
const WS_PREFERRED_MAX_STALE_MS = 10_000;

/** Race V1 vs V2 HTTP — whichever resolves first wins. V1 = 1-2s, V2 = 3-5s. */
// V1 live game shape (football / basketball) — different from V2
type V1LiveGame = {
  id: number;
  competitionDisplayName?: string;
  competitionId?: number;
  startTime?: string;
  statusGroup?: number;
  statusText?: string;
  gameTime?: number;
  homeCompetitor?: {
    id?: number;
    name?: string;
    score?: number;
    imageVersion?: number | string;
  };
  awayCompetitor?: {
    id?: number;
    name?: string;
    score?: number;
    imageVersion?: number | string;
  };
};

// SportKey is still used as a parameter type by many still-alive V2 helpers
// below (getScheduleV2, getUpcomingEventsV2, getV2TournamentIds, etc.) even
// though the SportsAPI Pro V2/V1 WebSocket layer that used to populate
// wsConnected/v1WsConnected/wsLastMessageAt was deleted (all sports data
// providers disconnected from live, 2026-08-06). These three are kept as
// permanently-empty state purely so the /feed-status diagnostic route below
// still compiles and honestly reports "not connected" for every sport,
// rather than needing its response shape rewritten for this.
type SportKey = "football" | "basketball" | "hockey" | "baseball" | "tennis";
const WS_DOMAINS: Record<SportKey, string> = {
  football: "v2.football.sportsapipro.com",
  basketball: "v2.basketball.sportsapipro.com",
  hockey: "v2.hockey.sportsapipro.com",
  baseball: "v2.baseball.sportsapipro.com",
  tennis: "v2.tennis.sportsapipro.com",
};
const wsConnected = new Set<SportKey>();
const wsLastMessageAt = new Map<SportKey, number>();
const v1WsConnected = new Set<SportKey>();

// ─── V2 /api/schedule/:date — multi-day upcoming events ──────────────────────

// Per-(sport,date) cache — schedule data for future days changes rarely (30min TTL)
type ScheduleV2Entry = { events: SAPIV2Event[]; fetchedAt: number };
const scheduleV2Cache = new Map<string, ScheduleV2Entry>();
const SCHEDULE_V2_TTL = 30 * 60_000;

/** Fetch all events scheduled for `date` (YYYY-MM-DD) from the given sport. */
async function getScheduleV2(
  sport: SportKey,
  date: string,
): Promise<SAPIV2Event[]> {
  const cacheKey = `${sport}:${date}`;
  const cached = scheduleV2Cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SCHEDULE_V2_TTL)
    return cached.events;
  const domain = WS_DOMAINS[sport]; // "v2.football.sportsapipro.com" etc.
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const resp = await fetch(`https://${domain}/api/schedule/${date}`, {
      signal: AbortSignal.timeout(9000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) {
      // Fallback to /api/today when schedule endpoint fails, but only for today's date
      if (date === todayStr) {
        const todayResp = await fetch(`https://${domain}/api/today`, {
          signal: AbortSignal.timeout(6000),
          headers: sapiHeaders(),
        }).catch(() => null);
        if (todayResp?.ok) {
          const todayData = (await todayResp.json()) as {
            success?: boolean;
            data?: { events?: SAPIV2Event[] };
            events?: SAPIV2Event[];
          };
          const todayEvents =
            todayData.data?.events ?? (todayData as any).events ?? [];
          if (todayEvents.length > 0) {
            scheduleV2Cache.set(cacheKey, {
              events: todayEvents,
              fetchedAt: Date.now(),
            });
            return todayEvents;
          }
        }
      }
      return cached?.events ?? [];
    }
    const data = (await resp.json()) as {
      success?: boolean;
      data?: { events?: SAPIV2Event[] };
    };
    // Only cache non-empty successful responses
    if (data.success === false) return cached?.events ?? [];
    const events = data.data?.events ?? [];
    if (events.length > 0)
      scheduleV2Cache.set(cacheKey, { events, fetchedAt: Date.now() });
    return events.length > 0 ? events : (cached?.events ?? []);
  } catch {
    return cached?.events ?? [];
  }
}

/**
 * Returns upcoming (not-yet-started) events across the next `days` calendar days
 * for the given sport, sorted by startTimestamp ascending.
 * Filters out events with status.type === "finished" and startTimestamp <= now.
 */
async function getUpcomingEventsV2(
  sport: SportKey,
  days = 7,
  graceSec = 5 * 60,
): Promise<SAPIV2Event[]> {
  const dates: string[] = [];
  const nowMs = Date.now();
  for (let i = 0; i < days; i++) {
    const d = new Date(nowMs + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }
  const allDays = await Promise.all(
    dates.map((dt) =>
      getScheduleV2(sport, dt).catch(() => [] as SAPIV2Event[]),
    ),
  );
  const nowSec = nowMs / 1000;
  return allDays
    .flat()
    .filter((ev) => {
      if (!ev.startTimestamp || ev.startTimestamp < nowSec - graceSec)
        return false;
      // Exclude already-finished events that the schedule may still list
      const st = ev.status;
      if (!st) return true;
      const statusType = typeof st === "object" ? (st.type ?? "") : "";
      const statusStr = typeof st === "string" ? st.toLowerCase() : "";
      // Exclude live/inprogress events — they belong in the live feed only
      if (
        statusType === "inprogress" ||
        statusStr === "inprogress" ||
        statusStr === "live" ||
        statusStr === "in progress"
      )
        return false;
      if (typeof st === "object" && statusType === "finished") return false;
      return true;
    })
    .sort((a, b) => (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0));
}

/**
 * Like getUpcomingEventsV2 but filtered to the primary competition for this sport:
 * NBA (basketball), NHL (hockey), MLB (baseball), ATP/WTA main draw (tennis).
 * Also deduplicates by event ID (same event may appear in multiple days' schedules).
 */
async function getUpcomingLeagueEventsV2(
  sport: SportKey,
  days = 7,
): Promise<SAPIV2Event[]> {
  const events = await getUpcomingEventsV2(sport, days);
  const seen = new Set<number>();
  const filtered: SAPIV2Event[] = [];
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    if (
      sport !== "football" &&
      !isMainLeagueEventRaw(sport, ev as unknown as Record<string, unknown>)
    )
      continue;
    filtered.push(ev);
  }
  return filtered;
}

// ─── V2 Pre-Match Odds ─────────────────────────────────────────────────────────

type V2RawMarket = {
  marketName: string;
  marketGroup: string;
  choices: Array<{ name: string; fractionalValue: string }>;
};

type V2PreMatchOdds = {
  home: number;
  draw: number;
  away: number;
  bttsYes?: number;
  bttsNo?: number;
  over25?: number;
  under25?: number;
  firstSetHome?: number;
  firstSetAway?: number;
  score1st?: Array<{ label: string; odds: number }>;
  score2nd?: Array<{ label: string; odds: number }>;
  score3rd?: Array<{ label: string; odds: number }>;
};

function fractionalToDecimal(frac: string): number {
  const parts = frac.split("/");
  if (parts.length !== 2) return 0;
  const num = parseFloat(parts[0]!);
  const den = parseFloat(parts[1]!);
  if (!den || isNaN(num) || isNaN(den)) return 0;
  return Math.round((num / den + 1) * 100) / 100;
}

function normalizeOddsMarketText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTennisSetOrdinal(value: string): number | null {
  const normalized = normalizeOddsMarketText(value);
  const numeric = normalized.match(/(?:^|\b)set\s*(\d)(?:\b|[^0-9])/);
  if (numeric) return Number(numeric[1]);
  if (
    normalized.includes("first set") ||
    normalized.includes("1st set") ||
    normalized.includes("set one")
  )
    return 1;
  if (
    normalized.includes("second set") ||
    normalized.includes("2nd set") ||
    normalized.includes("set two")
  )
    return 2;
  if (
    normalized.includes("third set") ||
    normalized.includes("3rd set") ||
    normalized.includes("set three")
  )
    return 3;
  return null;
}

function canonicalTennisSetScoreOrder(
  entries: Array<{ label: string; odds: number }>,
): Array<{ label: string; odds: number }> {
  const order = new Map([
    ["6-0", 0],
    ["6-1", 1],
    ["6-2", 2],
    ["6-3", 3],
    ["6-4", 4],
    ["7-5", 5],
    ["7-6", 6],
    ["0-6", 7],
    ["1-6", 8],
    ["2-6", 9],
    ["3-6", 10],
    ["4-6", 11],
    ["5-7", 12],
    ["6-7", 13],
  ]);
  return [...entries].sort(
    (a, b) => (order.get(a.label) ?? 999) - (order.get(b.label) ?? 999),
  );
}

function parseTennisSetCorrectScoreChoices(
  choices: Array<{ name: string; fractionalValue: string }>,
): Array<{ label: string; odds: number }> {
  const out: Array<{ label: string; odds: number }> = [];
  for (const choice of choices) {
    const score = String(choice?.name ?? "").replace(/\s+/g, "");
    if (!/^\d-\d$/.test(score)) continue;
    const [homeGames, awayGames] = score.split("-").map(Number);
    const maxGames = Math.max(homeGames, awayGames);
    const minGames = Math.min(homeGames, awayGames);
    const valid =
      (maxGames === 6 && minGames <= 4) ||
      (homeGames === 7 && awayGames === 5) ||
      (homeGames === 7 && awayGames === 6) ||
      (awayGames === 7 && homeGames === 5) ||
      (awayGames === 7 && homeGames === 6);
    if (!valid) continue;
    const odds = fractionalToDecimal(choice.fractionalValue);
    if (!(odds > 1.001)) continue;
    out.push({
      label: `${homeGames}-${awayGames}`,
      odds: clampTennisSetCorrectScoreOdd(odds),
    });
  }
  return canonicalTennisSetScoreOrder(out);
}

function parseV2PreMatchOdds(markets: V2RawMarket[]): V2PreMatchOdds | null {
  let home = 0,
    draw = 0,
    away = 0;
  let bttsYes = 0,
    bttsNo = 0,
    over25 = 0,
    under25 = 0;
  let firstSetHome = 0,
    firstSetAway = 0;
  let score1st: Array<{ label: string; odds: number }> = [];
  let score2nd: Array<{ label: string; odds: number }> = [];
  let score3rd: Array<{ label: string; odds: number }> = [];

  for (const mkt of markets) {
    const grp = mkt.marketGroup ?? "";
    const name = mkt.marketName ?? "";
    const choices = mkt.choices ?? [];
    const combinedText = `${grp} ${name}`;
    const normalizedText = normalizeOddsMarketText(combinedText);

    if (grp === "1X2" && name === "Full time") {
      for (const c of choices) {
        const v = fractionalToDecimal(c.fractionalValue);
        if (c.name === "1") home = v;
        else if (c.name === "X") draw = v;
        else if (c.name === "2") away = v;
      }
    }
    if (grp === "Home/Away" && name === "Full time") {
      for (const c of choices) {
        const v = fractionalToDecimal(c.fractionalValue);
        if (c.name === "1") home = v;
        else if (c.name === "2") away = v;
      }
    }
    if (name === "Both teams to score") {
      for (const c of choices) {
        if (c.name === "Yes") bttsYes = fractionalToDecimal(c.fractionalValue);
        else if (c.name === "No")
          bttsNo = fractionalToDecimal(c.fractionalValue);
      }
    }
    if (name.includes("2.5")) {
      for (const c of choices) {
        const v = fractionalToDecimal(c.fractionalValue);
        if (c.name?.startsWith("Over")) over25 = v;
        else if (c.name?.startsWith("Under")) under25 = v;
      }
    }
    if (name === "First set winner") {
      for (const c of choices) {
        const v = fractionalToDecimal(c.fractionalValue);
        if (c.name === "1") firstSetHome = v;
        else if (c.name === "2") firstSetAway = v;
      }
    }

    const looksLikeSetCorrectScore =
      (normalizedText.includes("correct score") ||
        normalizedText.includes("exact score") ||
        normalizedText.includes("set score")) &&
      normalizedText.includes("set");
    if (looksLikeSetCorrectScore) {
      const parsedChoices = parseTennisSetCorrectScoreChoices(choices);
      if (parsedChoices.length > 0) {
        const setNum = parseTennisSetOrdinal(combinedText);
        if (setNum === 1) score1st = parsedChoices;
        else if (setNum === 2) score2nd = parsedChoices;
        else if (setNum === 3) score3rd = parsedChoices;
      }
    }
  }

  const hasAny =
    home > 0 ||
    draw > 0 ||
    away > 0 ||
    bttsYes > 0 ||
    bttsNo > 0 ||
    over25 > 0 ||
    under25 > 0 ||
    firstSetHome > 0 ||
    firstSetAway > 0 ||
    score1st.length > 0 ||
    score2nd.length > 0 ||
    score3rd.length > 0;
  if (!hasAny) return null;
  return {
    home,
    draw,
    away,
    bttsYes,
    bttsNo,
    over25,
    under25,
    firstSetHome,
    firstSetAway,
    ...(score1st.length > 0 ? { score1st } : {}),
    ...(score2nd.length > 0 ? { score2nd } : {}),
    ...(score3rd.length > 0 ? { score3rd } : {}),
  };
}

type PreMatchOddsEntry = { odds: V2PreMatchOdds; fetchedAt: number };
const preMatchOddsV2Cache = new Map<string, PreMatchOddsEntry>();
const PRE_MATCH_ODDS_TTL = 15 * 60_000;

async function getPreMatchOddsV2(
  sport: SportKey,
  matchId: number,
): Promise<V2PreMatchOdds | null> {
  const key = `${sport}:${matchId}`;
  const cached = preMatchOddsV2Cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PRE_MATCH_ODDS_TTL)
    return cached.odds;
  const domain = WS_DOMAINS[sport];
  try {
    const resp = await fetch(
      `https://${domain}/api/match/${matchId}/odds/pre-match`,
      {
        signal: AbortSignal.timeout(5000),
        headers: sapiHeaders(),
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      success?: boolean;
      data?: { markets?: V2RawMarket[] };
    };
    if (!data.success || !data.data?.markets?.length) return null;
    const parsed = parseV2PreMatchOdds(data.data.markets);
    if (parsed)
      preMatchOddsV2Cache.set(key, { odds: parsed, fetchedAt: Date.now() });
    return parsed;
  } catch {
    return null;
  }
}

// ─── League Filters ────────────────────────────────────────────────────────────

/** Returns true for youth leagues (U15–U21, U23) or blocked tournaments that should be hidden. */
function isBlockedLeague(name: string): boolean {
  const n = name.toLowerCase();
  if (/\bu(1[5-9]|2[013])\b/.test(n)) return true;
  if (/\bunder[- ]?(1[5-9]|2[013])\b/.test(n)) return true;
  if (
    /\bjuniors?\b|\byouth\b/.test(n) &&
    !/women|feminine|feminino|frauen|femenin/i.test(n)
  )
    return true;
  // Specific blocked preseason / youth tournaments
  if (n.includes("trofeo dossena")) return true;
  if (n.includes("int.p")) return true;
  return false;
}

/** Returns true for women's football leagues (kept but flagged for frontend). */
function isWomensLeague(name: string): boolean {
  return /women|feminine|féminin|feminino|frauen|femenin|damall|nwsl|wsl/i.test(
    name,
  );
}

/** Remove redundant "(Women)", "(Men)", "(Women's)", "(Men's)" suffixes from
 *  team names so narrow UI buttons don't truncate to just "(Women)".
 *  These suffixes are always redundant because the league name already shows
 *  "- Women" / "- Men" in the header above the match card. */
function stripGenderTeamSuffix(name: string | null | undefined): string | null {
  if (name == null) return null;
  const n = name.trim();
  if (!n) return n;
  return n
    .replace(/\s*\((Women|Women's|Women’s|Men|Men's|Men’s|U-?\d{1,2})\)\s*$/i, "")
    .trim();
}

/** REMOÇÃO IMEDIATA de jogos do feed AO VIVO no EXATO INSTANTE em que o provedor
 *  sinaliza término (bwin period="Finished"/"FT" · onexbet ice-hockey
 *  period="Game finished", confirmed real 2026-08-27 · matchClock.finished === true).
 *  Requisito P60 (user): jogos terminados em Ao Vivo têm de ser retirado já.
 *  Antes esta remoção só acontecia via GC missing_ids (desaparecer do feed + grace de
 *  3min futebol / 15s basquete etc.). Valores cobertos: Finished, FT, Full Time,
 *  Game Finished, AET, After Extra Time, After Penalties, PEN, Final, Ended,
 *  Complete, Completed. */
function isPulseScoreEventFinished(ev: PulseScoreEvent): boolean {
  if (ev.matchClock && (ev.matchClock as any).finished === true) return true;
  const period = String(ev.matchClock?.period ?? "").toLowerCase().trim();
  if (!period) return false;
  if (period === "finished" || period === "ft" || period === "full time") return true;
  if (period === "game finished") return true;
  if (period === "aet") return true;
  if (period.startsWith("after extra") || period.startsWith("after penalties")) return true;
  if (period === "pen" || period === "final" || period === "ended" || period === "complete" || period === "completed") return true;
  return false;
}

/** Simulated/eSoccer football (e.g. "Esoccer Battle Volta - 6 Mins Play",
 * "Esoccer H2H GG League - 8 Mins Play") — not a real match, block outright.
 * "X Mins Play" is included as a secondary signal since it's specific to
 * these fast-paced virtual formats (real football is never labelled by a
 * short fixed play length). */
function isVirtualFootballLeague(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("esoccer") ||
    n.includes("e-soccer") ||
    n.includes("cyber football") ||
    n.includes("virtual football") ||
    n.includes("fifa virtual") ||
    /\bmins?\s*play\b/.test(n)
  );
}

// REVERTED 2026-08-18: the theory below (a celebrity-name eFootball
// simulation product squatting on real competition names) turned out to be
// WRONG. The user clarified these are REAL matches: they show correctly
// with real team names when a match first goes live, then get overwritten
// with the two involved players' names once an incident (goal, card) fires
// — and never revert back. That's a display bug in how incident/event data
// gets merged onto the match's home/away fields (likely in the football WS
// live-update path, which replaces an event's entire cached object on every
// frame — see footballWs.ts's applyFrame), NOT a separate fake-match
// product to filter out. The blocklist below was actively hiding real
// Champions League/Copa Argentina/Libertadores/Sul-Americana matches from
// real bettors and has been removed. Find and fix the actual field-merge
// bug instead of filtering by league name.

// Explicit allowlist for PulseScore-sourced live football (buildFootballLiveFromPulseScore
// below) — add league names here to show ONLY those leagues; every other real league gets
// hidden (virtual/eSoccer stays blocked either way via isVirtualFootballLeague above).
// Leave EMPTY to show every real league PulseScore sends (current behavior).
// Matching is case-insensitive substring against the league name PulseScore sends
// (the `league` field on each live event — e.g. "England: Premier League",
// "Spain: LaLiga", "Brazil: Brasileirão Série A"). One entry per line, e.g.:
//   "premier league",
//   "laliga",
//   "brasileirao serie a",
const PULSESCORE_FOOTBALL_LEAGUE_ALLOWLIST: string[] = [
  // Add the leagues you want to show here — leave empty for "show all".
];

// Explicit blocklist — leagues hidden regardless of the allowlist above.
// Matching is the same case-insensitive substring check against the league
// name PulseScore sends. Add one entry per line.
const PULSESCORE_FOOTBALL_LEAGUE_BLOCKLIST: string[] = [
  "nb iii", // Hungary NB III (3rd division) — user-requested block, 2026-08-09
];

function isAllowedFootballLeague(name: string): boolean {
  const n = name.toLowerCase();
  if (PULSESCORE_FOOTBALL_LEAGUE_BLOCKLIST.some((p) => n.includes(p.toLowerCase())))
    return false;
  if (PULSESCORE_FOOTBALL_LEAGUE_ALLOWLIST.length === 0) return true;
  return PULSESCORE_FOOTBALL_LEAGUE_ALLOWLIST.some((p) =>
    n.includes(p.toLowerCase()),
  );
}

// ─── V2 /api/today fetch helpers ──────────────────────────────────────────────

async function getTennisTodayV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if (tennisTodayV2Cache && now - tennisTodayV2FetchedAt < TODAY_V2_TTL)
    return tennisTodayV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_TENNIS}/today`, {
      signal: AbortSignal.timeout(3000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return tennisTodayV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    tennisTodayV2Cache = data.events ?? [];
    tennisTodayV2FetchedAt = now;
    return tennisTodayV2Cache;
  } catch {
    return tennisTodayV2Cache ?? [];
  }
}

// ─── V1 Tennis: native API (v1.tennis.sportsapipro.com) ───────────────────────
// Tennis uses a completely different API schema from other sports (no v2 live/today).
// The /all endpoint returns all today+tomorrow games; /live returns in-progress ones.

async function getTennisAllV1(): Promise<V1TennisGame[]> {
  const now = Date.now();
  if (_tennisAllV1Cache && now - _tennisAllV1FetchedAt < TODAY_V2_TTL)
    return _tennisAllV1Cache;
  try {
    const resp = await fetch(`${SAPI_V1_TENNIS}/v1/tennis/all`, {
      signal: AbortSignal.timeout(9000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return _tennisAllV1Cache ?? [];
    const data = (await resp.json()) as { data?: { games?: V1TennisGame[] } };
    _tennisAllV1Cache = data.data?.games ?? [];
    _tennisAllV1FetchedAt = now;
    return _tennisAllV1Cache;
  } catch {
    return _tennisAllV1Cache ?? [];
  }
}

// Tennis is point-by-point, so keep the V1 live cache tight.
// The SSE/broadcast layer already smooths fan-out; this TTL must stay tight
// enough that our scoreboard does not trail the large books by several seconds.
// This same constant gates TWO independent, stacked caching layers — the raw
// getTennisLiveV1() fetch (_tennisLiveV1Cache) AND the state-building wrapper
// on top of it (buildTennisLiveV1Cached's _tennisLiveV1StateCache) — so the
// worst case is roughly double this value before a point change is even
// picked up, before the live-payload cache (1.5s) and SSE broadcast (1s) add
// their own delay on top. Lowered from 1000ms after a reported ~5s lag
// suspending at 40/Advantage — this halves the two-layer contribution to
// that stacked delay.
const TENNIS_LIVE_V1_TTL = 500;
let _tennisLiveV1Cache: { games: V1TennisGame[]; fetchedAt: number } | null =
  null;
let _tennisLiveV1InFlight: Promise<V1TennisGame[]> | null = null;

async function fetchTennisLiveV1(): Promise<V1TennisGame[]> {
  try {
    const resp = await fetch(`${SAPI_V1_TENNIS}/v1/tennis/live`, {
      signal: AbortSignal.timeout(4000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { data?: { games?: V1TennisGame[] } };
    return data.data?.games ?? [];
  } catch {
    return [];
  }
}

async function getTennisLiveV1(): Promise<V1TennisGame[]> {
  const now = Date.now();
  if (
    _tennisLiveV1Cache &&
    now - _tennisLiveV1Cache.fetchedAt < TENNIS_LIVE_V1_TTL
  )
    return _tennisLiveV1Cache.games;
  if (_tennisLiveV1Cache) {
    if (!_tennisLiveV1InFlight) {
      _tennisLiveV1InFlight = fetchTennisLiveV1()
        .then((games) => {
          _tennisLiveV1Cache = { games, fetchedAt: Date.now() };
          return games;
        })
        .finally(() => {
          _tennisLiveV1InFlight = null;
        });
    }
    return (
      (await Promise.race([
        _tennisLiveV1InFlight,
        waitMs(700).then(() => null),
      ])) ?? _tennisLiveV1Cache.games
    );
  }
  if (!_tennisLiveV1InFlight) {
    _tennisLiveV1InFlight = fetchTennisLiveV1()
      .then((games) => {
        _tennisLiveV1Cache = { games, fetchedAt: Date.now() };
        return games;
      })
      .finally(() => {
        _tennisLiveV1InFlight = null;
      });
  }
  return _tennisLiveV1InFlight;
}

// Shared helper: convert a SAPIV2Event startTimestamp to date/time strings (Europe/Lisbon)
/** Calendar-day key (YYYY-MM-DD) for a unix-seconds timestamp, in Europe/Lisbon. */
function lisbonDateKey(tsSec: number): string {
  if (!tsSec) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(tsSec * 1000));
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}

function v2EventDateTime(ev: SAPIV2Event): { date: string; time: string } {
  const ts = ev.startTimestamp;
  if (!ts) return { date: "", time: "" };
  const d = new Date(ts * 1000);
  // Use "en-US" for predictable formatToParts field names (avoids pt-PT locale quirks
  // in some Node environments where hour/minute keys may differ).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  // hour12:false may give "24" at midnight in some environments
  const hh = p["hour"] === "24" ? "00" : (p["hour"] ?? "00");
  const mm = p["minute"] ?? "00";
  return {
    date: `${p["day"] ?? "01"}.${p["month"] ?? "01"}.${p["year"] ?? "2025"}`,
    time: `${hh}:${mm}`,
  };
}

// ─── V2 Tournament/Season ID Cache ────────────────────────────────────────────
const v2TournIdCache = new Map<
  string,
  { tid: number; sid: number; fetchedAt: number }
>();
const V2_TOURN_ID_TTL = 30 * 60_000;

/** Resolves the dominant tournament+season IDs for a sport from V2 live or schedule. */
async function getV2TournamentIds(
  sport: SportKey,
): Promise<{ tid: number; sid: number } | null> {
  const cached = v2TournIdCache.get(sport);
  if (cached && Date.now() - cached.fetchedAt < V2_TOURN_ID_TTL) return cached;
  const domain = WS_DOMAINS[sport];

  const extractIds = (
    events: unknown[],
  ): { tid: number; sid: number } | null => {
    const countMap = new Map<string, { tid: number; sid: number; n: number }>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      // Only count events that belong to the primary league for this sport
      if (!isMainLeagueEventRaw(sport, e)) continue;
      const tourn = e["tournament"] as Record<string, unknown> | undefined;
      const uniq = tourn?.["uniqueTournament"] as
        | Record<string, unknown>
        | undefined;
      const tid = Number(
        e["tournamentId"] ?? uniq?.["id"] ?? tourn?.["id"] ?? 0,
      );
      const season = e["season"] as Record<string, unknown> | undefined;
      const sid = Number(e["seasonId"] ?? season?.["id"] ?? 0);
      if (!tid || !sid) continue;
      const key = `${tid}:${sid}`;
      const ex = countMap.get(key);
      if (ex) ex.n++;
      else countMap.set(key, { tid, sid, n: 1 });
    }
    let best: { tid: number; sid: number } | null = null;
    let bestN = 0;
    for (const entry of countMap.values()) {
      if (entry.n > bestN) {
        bestN = entry.n;
        best = { tid: entry.tid, sid: entry.sid };
      }
    }
    return best;
  };

  // Try V2 live first (flat event structure)
  try {
    const r = await fetch(`https://${domain}/api/live`, {
      signal: AbortSignal.timeout(7000),
      headers: sapiHeaders(),
    });
    if (r.ok) {
      const d = (await r.json()) as Record<string, unknown>;
      const evts = (d["events"] ??
        (d["data"] as Record<string, unknown>)?.["events"] ??
        []) as unknown[];
      const ids = extractIds(evts);
      if (ids) {
        v2TournIdCache.set(sport, { ...ids, fetchedAt: Date.now() });
        return ids;
      }
    }
  } catch {}

  // Fall back to today's schedule (nested data.events structure)
  const todayStr = new Date().toISOString().slice(0, 10);
  const scheduleEvts = await getScheduleV2(sport, todayStr).catch(
    () => [] as SAPIV2Event[],
  );
  const ids2 = extractIds(scheduleEvts as unknown[]);
  if (ids2) {
    v2TournIdCache.set(sport, { ...ids2, fetchedAt: Date.now() });
    return ids2;
  }
  return cached ?? null;
}

// ─── V2 Events/Last Cache ──────────────────────────────────────────────────────
const v2EventsLastMap = new Map<
  string,
  { events: unknown[]; fetchedAt: number }
>();
const V2_EVENTS_LAST_TTL = 5 * 60_000;

async function getV2EventsLast(sport: SportKey, n = 30): Promise<unknown[]> {
  const ids = await getV2TournamentIds(sport);
  if (!ids) return [];
  const cacheKey = `${sport}:${ids.tid}:${ids.sid}:${n}`;
  const cached = v2EventsLastMap.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_EVENTS_LAST_TTL)
    return cached.events;
  const domain = WS_DOMAINS[sport];
  try {
    const resp = await fetch(
      `https://${domain}/api/tournament/${ids.tid}/season/${ids.sid}/events/last/${n}`,
      { signal: AbortSignal.timeout(9000), headers: sapiHeaders() },
    );
    if (!resp.ok) return cached?.events ?? [];
    const d = (await resp.json()) as Record<string, unknown>;
    const events = ((d["data"] as Record<string, unknown>)?.["events"] ??
      []) as unknown[];
    v2EventsLastMap.set(cacheKey, { events, fetchedAt: Date.now() });
    return events;
  } catch {
    return cached?.events ?? [];
  }
}

// ─── V2 Standings Rows ─────────────────────────────────────────────────────────
type V2StandingRow = {
  position: number;
  team: { id: number; name: string; nameCode: string };
  matches: number;
  wins: number;
  losses: number;
  draws?: number;
  points?: number;
  percentage?: number;
  gamesBehind?: number;
  streak?: number;
  normaltimeLosses?: number;
  overtimeLosses?: number;
  scoresFor?: number;
  scoresAgainst?: number;
  scoreDiffFormatted?: string;
};

const v2StandingsRowCache = new Map<
  string,
  { rows: V2StandingRow[]; fetchedAt: number }
>();
const V2_STANDINGS_ROWS_TTL = 30 * 60_000;

async function getV2StandingRows(sport: SportKey): Promise<V2StandingRow[]> {
  const ids = await getV2TournamentIds(sport);
  if (!ids) return [];
  const cacheKey = `${sport}:${ids.tid}:${ids.sid}`;
  const cached = v2StandingsRowCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_STANDINGS_ROWS_TTL)
    return cached.rows;
  const domain = WS_DOMAINS[sport];
  try {
    const resp = await fetch(
      `https://${domain}/api/tournament/${ids.tid}/season/${ids.sid}/standings`,
      { signal: AbortSignal.timeout(9000), headers: sapiHeaders() },
    );
    if (!resp.ok) return cached?.rows ?? [];
    const d = (await resp.json()) as Record<string, unknown>;
    const standings = ((d["data"] as Record<string, unknown>)?.["standings"] ??
      []) as Array<{ type: string; rows?: V2StandingRow[] }>;
    const total = standings.find((s) => s.type === "total") ?? standings[0];
    const rows = (total?.rows ?? []) as V2StandingRow[];
    v2StandingsRowCache.set(cacheKey, { rows, fetchedAt: Date.now() });
    return rows;
  } catch {
    return cached?.rows ?? [];
  }
}

// ─── Match builders ────────────────────────────────────────────────────────────

// Additional FINISHED statuses Statpal may return when slow to update
const SAPI_FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "AP",
  "Pen",
  "Full Time",
  "After ET",
  "After Pens",
  "Finished",
  "Ended",
  "Abandoned",
  "Postponed",
  "Cancelled",
  "Susp",
  "Delayed",
  "Interrupted",
  "Cancl.",
  "Abd",
  "Postp.",
  "Susp.",
]);

// Fetch window wide enough to cover the "?range=month" filter; the default
// prematch view narrows this back down to today + 7 days for priority
// leagues (see GET /upcoming). Fetches are per-day-cached (SCHEDULE_V2_TTL),
// so widening this doesn't multiply live request volume.
const FOOTBALL_UPCOMING_FETCH_DAYS = 30;
// Bounds how many priority-league fixtures we carry through odds enrichment;
// generous enough for a full month of top leagues worldwide.
const FOOTBALL_UPCOMING_PRIORITY_CAP = 400;
// Non-priority ("fallback") leagues only ever show for today, so this just
// bounds how many today-only small-league fixtures we carry.
const FOOTBALL_UPCOMING_FALLBACK_TODAY_CAP = 60;

async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  const events = await getUpcomingEventsV2(
    "football",
    FOOTBALL_UPCOMING_FETCH_DAYS,
  );
  if (events.length === 0) return buildFootballUpcomingV1();
  // Capture ground-truth scheduled kickoff for every fixture seen here, before
  // any league/team filtering — this is our only trustworthy source, since it
  // comes from the schedule feed rather than the live feed's self-reported time.
  for (const ev of events) {
    if (ev.startTimestamp) footballScheduledKickoffSec.set(ev.id, ev.startTimestamp);
  }
  const todayKey = lisbonDateKey(Date.now() / 1000);
  const seen = new Set<string>();
  const priorityIds = new Set<number>();
  const primary: SAPIV2Event[] = [];
  const fallback: SAPIV2Event[] = [];

  for (const ev of events) {
    const home = v2TeamName(ev.homeTeam);
    const away = v2TeamName(ev.awayTeam);
    if (home === "Unknown" || away === "Unknown") continue;
    const countryRaw = v2TournCountry(ev);
    const countryKey = normalizeCountryKey(countryRaw);
    const leagueRaw = countryKey
      ? `${countryKey}: ${v2TournName(ev.tournament)}`
      : v2TournName(ev.tournament);
    const leagueName = normalizeLeagueName(leagueRaw, countryKey);
    if (isBlockedLeague(`${leagueName} ${home} ${away}`)) continue;
    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (footballLeagueAllowedStrict(countryRaw, leagueName)) {
      if (primary.length < FOOTBALL_UPCOMING_PRIORITY_CAP) {
        priorityIds.add(ev.id);
        primary.push(ev);
      }
    } else if (!isLeagueUniversallyBlocked(`${leagueName} ${home} ${away}`)) {
      // Small/non-priority leagues: now shown up to 7 days ahead by default
      // (user request 2026-08-13). Previously only today was shown to avoid
      // flooding the prematch view with minor-league fixtures weeks out; the
      // 7-day window still keeps it manageable while giving users visibility
      // into upcoming regional/small-league fixtures.
      const evStartMs = (ev.startTimestamp ?? 0) * 1000;
      const daysAhead = Math.floor(
        (evStartMs - Date.now()) / (24 * 60 * 60 * 1000),
      );
      if (
        fallback.length < FOOTBALL_UPCOMING_FALLBACK_TODAY_CAP &&
        daysAhead >= 0 &&
        daysAhead <= 7
      )
        fallback.push(ev);
    }
  }
  // Combine and re-sort chronologically — priority leagues can span the full
  // fetch window, today-only fallback leagues interleave with them.
  const filtered = [...primary, ...fallback].sort(
    (a, b) => (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0),
  );

  const oddsResults: Array<V2PreMatchOdds | null> = new Array(
    filtered.length,
  ).fill(null);
  const maxOddsLookups = Math.min(filtered.length, 30);
  const batchSize = 10;
  for (let i = 0; i < maxOddsLookups; i += batchSize) {
    const slice = filtered.slice(i, i + batchSize);
    const out = await Promise.all(
      slice.map((ev) => getPreMatchOddsV2("football", ev.id).catch(() => null)),
    );
    for (let j = 0; j < out.length; j++) oddsResults[i + j] = out[j] ?? null;
  }

  // ── Statpal league-level prematch odds (DC, BTTS, O/U, HT, DNB) ──────────
  // Fetch by league in parallel — one request covers all matches in that league.
  const leagueIds = [
    ...new Set(
      filtered
        .map((ev) => (ev.tournamentId ? String(ev.tournamentId) : null))
        .filter((id): id is string => id != null),
    ),
  ];
  const statpalLeagueOdds = new Map<string, FootballOddsEntry[]>();
  await Promise.all(
    leagueIds.map(async (leagueId) => {
      try {
        const { odds } = await getFootballLeagueOdds(leagueId);
        statpalLeagueOdds.set(leagueId, odds);
      } catch {
        /* skip leagues where prematch odds are unavailable */
      }
    }),
  );

  /** Normalise a team name for fuzzy matching across providers. */
  const normTeam = (s: string) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const results: UpcomingMatch[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const ev = filtered[i]!;
    const home = v2TeamName(ev.homeTeam);
    const away = v2TeamName(ev.awayTeam);
    const countryRaw = v2TournCountry(ev);
    const countryKey = normalizeCountryKey(countryRaw);
    const leagueRaw = countryKey
      ? `${countryKey}: ${v2TournName(ev.tournament)}`
      : v2TournName(ev.tournament);
    const leagueName = normalizeLeagueName(leagueRaw, countryKey);
    const { date, time } = v2EventDateTime(ev);
    const realOdds = oddsResults[i] ?? null;
    const isWomens = isWomensLeague(v2TournName(ev.tournament));

    let odds: { home: number; draw: number; away: number };
    let markets: AdvancedMarkets;
    let hasRealOdds: boolean;

    const baseOdds = makeOddsFromTeams(home, away);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    markets = {
      ...baseMarkets,
      ...(realOdds?.bttsYes
        ? {
            bothTeamsScore: { yes: realOdds.bttsYes, no: realOdds.bttsNo ?? 0 },
          }
        : {}),
      ...(realOdds?.over25
        ? {
            totalGoals: {
              ...baseMarkets.totalGoals,
              over25: realOdds.over25,
              under25: realOdds.under25 ?? 0,
            },
          }
        : {}),
    };
    const hasFull1x2 = !!(
      realOdds &&
      realOdds.home > 0 &&
      realOdds.draw > 0 &&
      realOdds.away > 0
    );
    odds = hasFull1x2
      ? { home: realOdds!.home, draw: realOdds!.draw, away: realOdds!.away }
      : baseOdds;
    hasRealOdds = hasFull1x2;

    // ── Enrich with Statpal league prematch odds ───────────────────────────
    // Supplements the per-match SportsAPI odds with Double Chance, BTTS,
    // Over/Under lines, Half Time, Draw No Bet, and Asian Handicap from the
    // Statpal prematch feed.  Also provides 1x2 as a fallback.
    const leagueIdStr = ev.tournamentId ? String(ev.tournamentId) : null;
    if (leagueIdStr) {
      const leagueEntries = statpalLeagueOdds.get(leagueIdStr) ?? [];
      const normHome = normTeam(home);
      const normAway = normTeam(away);
      const statpalMatch = leagueEntries.find(
        (e) =>
          normTeam(e.homeTeam.name) === normHome ||
          normTeam(e.awayTeam.name) === normAway ||
          (normTeam(e.homeTeam.name).includes(normHome.split(" ")[0]!) &&
            normTeam(e.awayTeam.name).includes(normAway.split(" ")[0]!)),
      );
      if (statpalMatch) {
        // 1x2 fallback when SportsAPI didn't supply it
        if (
          !hasRealOdds &&
          statpalMatch.homeOdds > 0 &&
          statpalMatch.drawOdds > 0 &&
          statpalMatch.awayOdds > 0
        ) {
          odds = {
            home: statpalMatch.homeOdds,
            draw: statpalMatch.drawOdds,
            away: statpalMatch.awayOdds,
          };
          hasRealOdds = true;
        }
        // Merge enriched markets — Statpal data wins when no existing value
        if (statpalMatch.markets) {
          const sm = statpalMatch.markets;
          if (sm.doubleChance?.homeOrDraw && !markets.doubleChance?.homeOrDraw)
            markets = { ...markets, doubleChance: sm.doubleChance };
          if (sm.bothTeamsScore?.yes && !markets.bothTeamsScore?.yes)
            markets = { ...markets, bothTeamsScore: sm.bothTeamsScore };
          if (sm.halfTime?.home && !markets.halfTime?.home)
            markets = { ...markets, halfTime: sm.halfTime };
          if (sm.drawNoBet?.home && !markets.drawNoBet?.home)
            markets = { ...markets, drawNoBet: sm.drawNoBet };
          if (sm.asianHandicap?.home && !markets.asianHandicap?.home)
            markets = { ...markets, asianHandicap: sm.asianHandicap };
          if (sm.firstGoal?.home && !markets.firstGoal?.home)
            markets = { ...markets, firstGoal: sm.firstGoal };
          // Merge O/U lines individually — Statpal may fill lines SportsAPI missed
          if (sm.totalGoals) {
            const tg = markets.totalGoals;
            markets = {
              ...markets,
              totalGoals: {
                ...tg,
                ...(sm.totalGoals.over05 && !tg.over05
                  ? { over05: sm.totalGoals.over05, under05: sm.totalGoals.under05 }
                  : {}),
                ...(sm.totalGoals.over15 && !tg.over15
                  ? { over15: sm.totalGoals.over15, under15: sm.totalGoals.under15 }
                  : {}),
                ...(sm.totalGoals.over25 && !tg.over25
                  ? { over25: sm.totalGoals.over25, under25: sm.totalGoals.under25 }
                  : {}),
                ...(sm.totalGoals.over35 && !tg.over35
                  ? { over35: sm.totalGoals.over35, under35: sm.totalGoals.under35 }
                  : {}),
                ...(sm.totalGoals.over45 && !tg.over45
                  ? { over45: sm.totalGoals.over45, under45: sm.totalGoals.under45 }
                  : {}),
              },
            };
          }
        }
      }
    }

    results.push({
      id: `fb-v2-${ev.id}`,
      home,
      away,
      homeTeamId: ev.homeTeamId != null ? String(ev.homeTeamId) : undefined,
      awayTeamId: ev.awayTeamId != null ? String(ev.awayTeamId) : undefined,
      league: leagueName,
      country: countryRaw,
      time,
      date,
      sport: "football",
      hasRealOdds,
      odds,
      markets,
      isWomens,
      leagueId: ev.tournamentId ? String(ev.tournamentId) : undefined,
      isPriorityLeague: priorityIds.has(ev.id),
    });
  }

  return results;
}

/**
 * Returns true if the match's scheduled date+time is already in the past.
 * Handles both DD.MM.YYYY and YYYY-MM-DD date formats.
 * A match is considered past as soon as its scheduled minute begins.
 */
function isMatchTimePast(dateStr: string, timeStr: string): boolean {
  if (!dateStr || !timeStr) return false;
  try {
    let isoDate: string;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
      const [dd, mm, yyyy] = dateStr.split(".");
      isoDate = `${yyyy}-${mm}-${dd}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      isoDate = dateStr;
    } else {
      return false;
    }
    // timeStr is Europe/Lisbon local time — convert to UTC before comparing
    const offsetH = lisbonOffsetHours();
    const [hStr, mStr] = timeStr.split(":");
    const hUtc = (parseInt(hStr!) - offsetH + 24) % 24;
    const scheduledMs = new Date(
      `${isoDate}T${String(hUtc).padStart(2, "0")}:${mStr}:00Z`,
    ).getTime();
    return Date.now() >= scheduledMs;
  } catch {
    return false;
  }
}

/**
 * Returns minutes until match starts (negative = already started).
 * `displayTimeStr` is UTC+1 (Portugal) — already addOneHour'd from raw Statpal UTC.
 */
function matchStartsInMinutes(dateStr: string, displayTimeStr: string): number {
  try {
    let isoDate: string;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
      const [dd, mm, yyyy] = dateStr.split(".");
      isoDate = `${yyyy}-${mm}-${dd}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      isoDate = dateStr;
    } else {
      return Infinity;
    }
    if (!/^\d{2}:\d{2}$/.test(displayTimeStr)) return Infinity;
    // displayTimeStr is Europe/Lisbon local time — convert to UTC dynamically
    const offsetH = lisbonOffsetHours();
    const [hStr, mStr] = displayTimeStr.split(":");
    const hUtc = (parseInt(hStr!) - offsetH + 24) % 24;
    const matchMs = new Date(
      `${isoDate}T${String(hUtc).padStart(2, "0")}:${mStr}:00Z`,
    ).getTime();
    return (matchMs - Date.now()) / 60000;
  } catch {
    return Infinity;
  }
}

/** Adds 1 hour to a "HH:MM" string (UTC → Portugal UTC+1). Wraps at midnight. */
function addOneHour(timeStr: string): string {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  const [hStr, mStr] = timeStr.split(":");
  const h = (parseInt(hStr!) + 1) % 24;
  return `${String(h).padStart(2, "0")}:${mStr}`;
}

/**
 * Like addOneHour but also rolls the date forward when time crosses midnight
 * (e.g. 23:00 UTC → 00:00 PT on the next calendar day).
 * Returns spread-compatible { date, time } so callers can do: ...shiftHour(d, t)
 */
function shiftHour(
  dateStr: string,
  timeStr: string,
): { date: string; time: string } {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return { date: dateStr, time: timeStr };
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr!);
  const newH = (h + 1) % 24;
  const newTime = `${String(newH).padStart(2, "0")}:${mStr}`;
  if (h !== 23) return { date: dateStr, time: newTime };
  // Midnight rollover — advance date by 1 calendar day
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split(".");
    const d = new Date(parseInt(yyyy!), parseInt(mm!) - 1, parseInt(dd!));
    d.setDate(d.getDate() + 1);
    const nd = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    return { date: nd, time: newTime };
  }
  return { date: dateStr, time: newTime };
}

// Pre-match tennis odds cache: keyed by sorted-surname pair so live matches
// can use the last known real odds even after status changes to "Set 1" etc.
const _tennisPreMatchOdds = new Map<string, { home: number; away: number }>();
const _tennisPreMatchSetScoreOdds = new Map<
  string,
  {
    score1st?: Array<{ label: string; odds: number }>;
    score2nd?: Array<{ label: string; odds: number }>;
    score3rd?: Array<{ label: string; odds: number }>;
  }
>();
function _tennisSurname(n: string): string {
  return n
    .replace(/^([A-Z]\.\s*)+/, "")
    .trim()
    .toLowerCase();
}
function _tennisPairKey(n0: string, n1: string): string {
  return [_tennisSurname(n0), _tennisSurname(n1)].sort().join("|");
}

function makeTennisBaseOdds(
  home: string,
  away: string,
): { home: number; draw: number; away: number } {
  const key = _tennisPairKey(home, away);
  const cached = _tennisPreMatchOdds.get(key);
  if (cached && cached.home > 1.01 && cached.away > 1.01) {
    return { home: cached.home, draw: 0, away: cached.away };
  }
  // Neutral tennis odds — better than a soccer Poisson model on player name hashes
  return { home: 1.85, draw: 0, away: 1.85 };
}

function tennisSetLabel(n: number): string {
  if (n === 1) return "1st set";
  if (n === 2) return "2nd set";
  if (n === 3) return "3rd set";
  return `Set ${n}`;
}

export { buildUpcomingMatches, getUpcomingAll };

/** ISO-datetime equivalent of v2EventDateTime — PulseScore's `startTime` is a
 * real ISO string, not SportsAPI V2's UNIX-seconds `startTimestamp`. */
function pulseScoreEventDateTime(startTime: string): { date: string; time: string } {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const hh = p["hour"] === "24" ? "00" : (p["hour"] ?? "00");
  const mm = p["minute"] ?? "00";
  return {
    date: `${p["day"] ?? "01"}.${p["month"] ?? "01"}.${p["year"] ?? "2025"}`,
    time: `${hh}:${mm}`,
  };
}

/**
 * Football prematch, sourced entirely from PulseScore (getPulseScoreFootballUpcoming).
 * Reuses the exact catalog filtering (isVirtualFootballLeague/isAllowedFootballLeague/
 * footballLeagueAllowedStrict/leaguePriority) and odds extraction (extractFootballOverride)
 * already proven in buildFootballLiveFromPulseScore(), and the same
 * `pulsescore-football-${eventId}` id scheme so a match's card doesn't change identity
 * when it goes live. Confirmed against a real GET /api/v3/bet365/leagues sample
 * (2026-08-07) — canonicalMarket:"MATCH_RESULT"/rawName:"main" matches
 * isMatchWinnerMarket exactly, no changes needed to football.ts.
 */
async function buildFootballUpcomingFromPulseScore(): Promise<UpcomingMatch[]> {
  const events = [...(await getPulseScoreFootballUpcoming())].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  // Tracks each pushed match's priority/minor-lower-division status
  // alongside `results` (same index) purely for the suppression pass below
  // — kept out of the UpcomingMatch objects themselves since neither field
  // is part of that public shape.
  const meta: Array<{ prio: number; isMinor: boolean }> = [];
  const results: UpcomingMatch[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    // Second layer of defense against sport-tag contamination (see
    // fetchFootballUpcoming in football.ts for the full story — the bare
    // /leagues endpoint has no ?sport= param and leaked basketball fixtures
    // into football's upcoming list). Checking here too means this loop is
    // safe regardless of whether a bad league slipped past the first filter.
    if (ev.sport !== "soccer") continue;
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    if (isVirtualFootballLeague(ev.league || "")) continue;
    if (!isAllowedFootballLeague(ev.league || "")) continue;

    const leagueName = ev.league || "";
    const isIntl = isIntlTournamentName(leagueName);
    const countryKey = countryForPulseScoreFootballEvent(ev);
    if (!isIntl && !(countryKey && footballLeagueAllowedStrict(countryKey, leagueName)))
      continue;
    const country = countryKey ?? "Internacional";
    const prioKey = countryKey ? `${countryKey}: ${leagueName}` : leagueName;
    const prio = leaguePriority(prioKey, countryKey ?? undefined);

    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { date, time } = pulseScoreEventDateTime(ev.startTime);
    const override = extractFootballOverride(ev);
    const baseOdds = makeOddsFromTeams(home, away);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    const markets: AdvancedMarkets = (() => {
      const m: AdvancedMarkets = override?.totalGoals
        ? { ...baseMarkets, totalGoals: { ...baseMarkets.totalGoals, ...override.totalGoals } }
        : baseMarkets;
      if (override?.anytimeGoalscorer) m.anytimeGoalscorer = override.anytimeGoalscorer;
      if (override?.firstGoalscorer) m.firstGoalscorer = override.firstGoalscorer;
      if (override?.lastGoalscorer) m.lastGoalscorer = override.lastGoalscorer;
      if (override?.doubleChance) Object.assign(m.doubleChance, override.doubleChance);
      if (override?.bothTeamsScore) Object.assign(m.bothTeamsScore, override.bothTeamsScore);
      if (override?.firstGoal) Object.assign(m.firstGoal, override.firstGoal);
      if (override?.drawNoBet) m.drawNoBet = override.drawNoBet as any;
      if (override?.secondHalf) m.secondHalf = override.secondHalf as any;
      if (override?.goalOddEven) m.goalOddEven = override.goalOddEven;
      if (override?.cleanSheet) m.cleanSheet = override.cleanSheet as any;
      if (override?.correctScore) m.correctScore = { ...(m.correctScore ?? {}), ...override.correctScore };
      if (override?.teamGoals) m.teamGoals = { ...(m.teamGoals ?? {}), ...override.teamGoals };
      if (override?.corners) m.corners = override.corners;
      if (override?.cards) m.cards = override.cards;
      if (override?.htft) m.htft = override.htft;
      if (override?.exactGoals) m.exactGoals = override.exactGoals;
      if (override?.btts1H) m.btts1H = override.btts1H;
      return m;
    })();
    const odds = override?.odds ?? baseOdds;
    const isWomens = isWomensLeague(leagueName);

    results.push({
      id: `pulsescore-football-${ev.eventId}`,
      home,
      away,
      league: normalizeBrazilLeagueDisplayName(leagueName, countryKey),
      country,
      time,
      date,
      sport: "football",
      hasRealOdds: !!override?.odds,
      odds,
      markets,
      isWomens,
      isPriorityLeague: prio > 0,
    });
    meta.push({
      prio,
      isMinor: isMinorLowerDivisionLeague(countryKey, leagueName),
    });
  }

  // ── Suppress minor 2nd/3rd-division leagues on days that already have
  // real top-flight/cup/well-followed-2nd-division coverage — see
  // isMinorLowerDivisionLeague's own header comment for exactly which
  // leagues this narrow list covers and why (bug report 2026-08-15).
  // Grouped by `date` (not global) so a quiet Tuesday with only Eerste
  // Divisie on the schedule still shows it — this only kicks in once a
  // given day already has somewhere else to bet on.
  const bigLeagueDayHasCoverage = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    if (meta[i]!.prio < BIG_LEAGUE_DAY_PRIORITY_THRESHOLD) {
      bigLeagueDayHasCoverage.add(results[i]!.date);
    }
  }
  const suppressed: UpcomingMatch[] = [];
  for (let i = 0; i < results.length; i++) {
    if (meta[i]!.isMinor && bigLeagueDayHasCoverage.has(results[i]!.date)) continue;
    suppressed.push(results[i]!);
  }
  results.length = 0;
  results.push(...suppressed);

  // Team crests — batched once per rebuild cycle (not per match) so
  // MAX_NEW_TEAM_LOOKUPS_PER_BATCH applies across the whole prematch list,
  // not per team; see batchResolveApiFootballTeamLogos's own comment for why
  // this is a separate lookup from the live cross-reference (a prematch
  // match has no live fixture to match against). A team not yet resolved
  // this cycle (deferred by the batch cap on a cold cache) just has no logo
  // until a later cycle picks it up — same graceful "not yet available"
  // degradation as everywhere else this integration touches.
  const teamNames = new Set<string>();
  for (const r of results) {
    teamNames.add(r.home);
    teamNames.add(r.away);
  }
  const logosByTeam = await batchResolveApiFootballTeamLogos(teamNames);
  for (const r of results) {
    const homeLogo = logosByTeam.get(r.home.trim().toLowerCase());
    const awayLogo = logosByTeam.get(r.away.trim().toLowerCase());
    if (homeLogo) r.homeLogoUrl = homeLogo;
    if (awayLogo) r.awayLogoUrl = awayLogo;
  }
  return results;
}

/** Strips null/undefined values out of a partial nullable numeric object —
 * SportMonksFootballOverride's fields (odds, doubleChance, drawNoBet) allow
 * a side to be null when that specific selection didn't resolve to a
 * number, but AdvancedMarkets' fields are all non-nullable numbers. Spread
 * this onto the synthetic baseline instead of the raw override so a
 * partially-real market (e.g. home/draw real, away still null) still
 * improves on the fully-synthetic default rather than falling back to it
 * entirely. */
function nonNullPatch<T extends Record<string, number | null | undefined>>(
  obj: T | undefined,
): Partial<Record<keyof T, number>> {
  if (!obj) return {};
  const out: Partial<Record<keyof T, number>> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    const v = obj[key];
    if (v !== null && v !== undefined) out[key] = v;
  }
  return out;
}

/** Merges a SportMonksFootballOverride onto an already-synthetic
 * AdvancedMarkets object (mutates and returns `markets`) — shared between
 * the prematch and live SportMonks builders so the two never drift. Real
 * data only ever patches the specific sub-fields it actually priced,
 * leaving the Poisson-model baseline in place everywhere else (same
 * "real data patches synthetic" pattern buildFootballUpcomingFromPulseScore
 * already used with bwin's broader market set). */
function applySportMonksFootballOverride(
  markets: AdvancedMarkets,
  baseMarkets: AdvancedMarkets,
  override: SportMonksFootballOverride,
): AdvancedMarkets {
  markets.doubleChance = { ...baseMarkets.doubleChance, ...nonNullPatch(override.doubleChance) };
  markets.totalGoals = override.totalGoals
    ? { ...baseMarkets.totalGoals, ...override.totalGoals }
    : baseMarkets.totalGoals;
  markets.corners = override.corners ? { ...baseMarkets.corners, ...override.corners } : baseMarkets.corners;
  markets.cards = override.cards ? { ...baseMarkets.cards, ...override.cards } : baseMarkets.cards;
  if (override.bothTeamsScore) markets.bothTeamsScore = override.bothTeamsScore;
  if (override.drawNoBet?.home != null && override.drawNoBet?.away != null) {
    markets.drawNoBet = { home: override.drawNoBet.home, away: override.drawNoBet.away };
  }
  if (override.halfTime) {
    markets.halfTime = { ...baseMarkets.halfTime, ...nonNullPatch(override.halfTime) };
  }
  if (override.secondHalf) {
    markets.secondHalf = { ...(baseMarkets.secondHalf ?? { home: 0, draw: 0, away: 0 }), ...nonNullPatch(override.secondHalf) };
  }
  if (override.correctScore) {
    markets.correctScore = { ...(markets.correctScore ?? {}), ...override.correctScore };
  }
  if (override.htft) {
    markets.htft = { ...(baseMarkets.htft ?? {}), ...override.htft } as AdvancedMarkets["htft"];
  }
  if (override.goalOddEven) markets.goalOddEven = override.goalOddEven;
  if (override.teamGoals) {
    markets.teamGoals = { ...(markets.teamGoals ?? {}), ...override.teamGoals } as AdvancedMarkets["teamGoals"];
  }
  if (override.btts1H) markets.btts1H = override.btts1H;
  if (override.btts2H) markets.btts2H = override.btts2H;
  if (override.highestScoringHalf) {
    markets.highestScoringHalf = {
      ...(baseMarkets.highestScoringHalf ?? { first: 0, second: 0, equal: 0 }),
      ...nonNullPatch(override.highestScoringHalf),
    };
  }
  return markets;
}

/**
 * Football prematch, sourced from SportMonks (getSportMonksFootballUpcoming)
 * — replacing PulseScore/bwin (blocked 2026-08-28, see
 * pulsescore/football.ts's FOOTBALL_PULSESCORE_BLOCKED) as football's odds
 * provider. Bookmaker: 1xbet (explicit user decision, 2026-08-29), same
 * brand every other sport already standardized on. Only the 7 markets
 * extractSportMonksFootballOverride covers so far get real data — everything
 * else in AdvancedMarkets stays the synthetic Poisson-model baseline, same
 * "real data patches synthetic" pattern buildFootballUpcomingFromPulseScore
 * already uses. Logos come straight from SportMonks' own participant
 * image_path (confirmed present on every real sample) rather than the
 * separate API-Football crest lookup the PulseScore builder needs.
 */
async function buildFootballUpcomingFromSportMonks(): Promise<UpcomingMatch[]> {
  const leagueResults = await getSportMonksFootballUpcoming(SPORTMONKS_FOOTBALL_LEAGUE_IDS);
  const results: UpcomingMatch[] = [];
  const seen = new Set<string>();

  for (const { league, fixtures } of leagueResults) {
    const leagueName = league?.name || "";
    const countryName = league?.country?.name || "";
    const isWomens = isWomensLeague(leagueName);

    for (const fx of fixtures) {
      // state_id 1 = not started (confirmed real, 2026-08-29) — prematch
      // only; live/finished fixtures from this same round are picked up by
      // the live builder instead.
      if (fx.state_id !== 1) continue;

      const homeP = fx.participants?.find((p) => p.meta?.location === "home");
      const awayP = fx.participants?.find((p) => p.meta?.location === "away");
      if (!homeP || !awayP) continue;
      const home = stripGenderTeamSuffix(homeP.name);
      const away = stripGenderTeamSuffix(awayP.name);
      if (!home || !away) continue;

      const key = `${home}|${away}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const override = extractSportMonksFootballOverride(fx);
      const baseOdds = makeOddsFromTeams(home, away);
      const baseMarkets = makeAdvancedMarketsFromTeams(home, away);

      const odds = { ...baseOdds, ...nonNullPatch(override.odds) };
      const markets: AdvancedMarkets = applySportMonksFootballOverride(
        { ...baseMarkets },
        baseMarkets,
        override,
      );

      const { date, time } = pulseScoreEventDateTime(
        new Date(fx.starting_at_timestamp * 1000).toISOString(),
      );

      results.push({
        id: `sportmonks-football-${fx.id}`,
        home,
        away,
        league: normalizeBrazilLeagueDisplayName(
          leagueName,
          countryName.toLowerCase() === "brazil" ? "brazil" : null,
        ),
        country: countryName || "Internacional",
        time,
        date,
        sport: "football",
        hasRealOdds: !!override.odds,
        odds,
        markets,
        isWomens,
        isPriorityLeague: true,
        homeLogoUrl: homeP.image_path,
        awayLogoUrl: awayP.image_path,
      });
    }
  }

  results.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return results;
}

/**
 * Tennis prematch, sourced entirely from PulseScore (getPulseScoreTennisUpcoming).
 * Confirmed against a real GET /api/v3/bet365/tennis/leagues sample (2026-08-07) —
 * same envelope as football's /leagues, league format "Tour||League" (e.g.
 * "ATP Tour||ATP Montreal") instead of football's "Country||League", match-winner
 * market canonicalMarket:"DRAW_NO_BET"/rawName:"main" already handled by
 * isMatchWinnerMarket in tennis.ts. No catalog/league filtering — mirrors the
 * live builder's approach (buildTennisLiveFromPulseScore shows every league
 * PulseScore sends, hardcoded country:"Internacional", no allowlist), so a
 * league isn't shown live but hidden prematch or vice versa. Same
 * `pulsescore-tennis-${eventId}` id scheme as the live builder so a match's
 * identity doesn't change when it goes live.
 */
async function buildTennisUpcomingFromPulseScore(): Promise<UpcomingMatch[]> {
  const events = [...(await getPulseScoreTennisUpcoming())].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  const results: UpcomingMatch[] = [];
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;

    // bet365 sometimes lists the same real match twice under different tour/
    // category groupings, each with its own name-string variant (e.g. "Arina
    // Bulatova (RUS)" under one grouping vs "Arina Bulatova" under another)
    // and different, often stale, odds — reported in production 2026-08-09:
    // duplicate tennis entries with conflicting prices, and one of the two
    // never recognized as "now live" once the match starts (see the
    // liveTeamPairs comment in buildLivePayload), leaving it stuck showing
    // "A Iniciar" for up to 3h. An exact `${home}|${away}` string key let
    // both variants through; teamNamesMatch recognizes them as the same
    // match. Linear scan against results-so-far is fine — this list rarely
    // exceeds a few hundred entries per poll.
    const isDuplicate = results.some(
      (r) => teamNamesMatch(r.home, home) && teamNamesMatch(r.away, away),
    );
    if (isDuplicate) continue;

    const leagueName = ev.league || "Ténis";
    const { date, time } = pulseScoreEventDateTime(ev.startTime);
    const override = extractTennisOverride(ev);
    const baseOdds = makeTennisBaseOdds(home, away);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    const odds = override?.odds
      ? { home: override.odds.home, draw: 0, away: override.odds.away }
      : baseOdds;
    const isWomens = leagueName.toLowerCase().includes("wta");

    // Real tennis-specific prematch markets beyond the moneyline (set
    // winner, total games, exact set score, game handicap, per-player game
    // totals) — see extractTennisPrematchExtra for exactly which markets
    // these come from and why setHandicap/set2/set3 stay zeroed (no safe
    // HOME/AWAY attribution or no real data available at all). Zero is this
    // codebase's existing "not priced" signal (same convention already used
    // for football's Em Breve markets) — the frontend already hides/
    // disables a market whose odds are 0.
    const prematchExtra = extractTennisPrematchExtra(ev);
    const tennisExtra: NonNullable<AdvancedMarkets["tennisExtra"]> = {
      firstSet: prematchExtra.firstSet ?? { home: 0, away: 0 },
      set2: { home: 0, away: 0 },
      set3: { home: 0, away: 0 },
      exactSets: prematchExtra.exactSets ?? { h20: 0, h21: 0, a02: 0, a12: 0 },
      setHandicap: prematchExtra.setHandicap ?? { line: 0, home: 0, away: 0 },
      totalGames: prematchExtra.totalGames ?? { line: 0, over: 0, under: 0 },
      totalGamesLines: prematchExtra.totalGamesLines ?? [],
      set1Games: prematchExtra.set1Games ?? { line: 0, over: 0, under: 0 },
      gameHandicap: prematchExtra.gameHandicap ?? { line: 0, home: 0, away: 0 },
      homePlayerGames: prematchExtra.homePlayerGames,
      awayPlayerGames: prematchExtra.awayPlayerGames,
      gameHandicapSet2: prematchExtra.gameHandicapSet2,
      homePlayerGamesSet2: prematchExtra.homePlayerGamesSet2,
      awayPlayerGamesSet2: prematchExtra.awayPlayerGamesSet2,
      score1st: prematchExtra.score1st,
      score2nd: prematchExtra.score2nd,
      oddEvenGames: prematchExtra.oddEvenGames ?? { odd: 0, even: 0 },
      setMatch: prematchExtra.setMatch,
      tieBreak: prematchExtra.tieBreak,
      tieBreak1st: prematchExtra.tieBreak1st,
      totalTieBreaks: prematchExtra.totalTieBreaks,
      totalSets: prematchExtra.totalSets,
      highestSetTotal: prematchExtra.highestSetTotal,
      setsScoring: prematchExtra.setsScoring,
    };
    const markets: AdvancedMarkets = { ...baseMarkets, tennisExtra };

    results.push({
      id: `pulsescore-tennis-${ev.eventId}`,
      home,
      away,
      league: leagueName,
      country: "Internacional",
      time,
      date,
      sport: "tennis",
      hasRealOdds: !!override?.odds,
      odds,
      markets,
      isWomens,
    });
  }
  return results;
}

// Applies extractBasketballOverride's confirmed-real per-period blocks on
// top of an already-built (synthetic) basketballExtra object — same "real
// wins, synthetic fills the gap" pattern as spread/total above. q2/q4 added
// 2026-08-27 (a real onexbet sample now confirms all four quarters, unlike
// the original 2026-08-15 bwin sample that only named q1/q3/firstHalf) —
// settlement.ts's q([1-4])-/q([1-4])t- branches are already fully generic
// across all four quarters (q1/q3 were never special-cased), so this is
// pure data-availability, not a settlement change. secondHalf is
// deliberately NOT wired here even though extractBasketballOverride now
// computes it too: the only "second half" settlement key that exists
// (2h-home/2h-away/2h-draw) reads football's ht/ft halftime-score split,
// which basketball doesn't have — it uses a `quarters` array instead (see
// the q([1-4])- branches). There is no basketball-quarters-based "second
// half = Q3+Q4" settlement key yet, so wiring odds for a market with
// nothing correct to grade them would be worse than not showing it; needs
// its own settlement key (e.g. h2-home/h2-away off quarters[2]+quarters[3])
// before this can be turned on.
//
// Deliberately excludes spread/handicap (q1Spread/q3Spread/q2Spread/
// q4Spread/firstHalfSpread) even though extractBasketballOverride already
// computes it: while wiring q1/q3 up, b-spread-home/b-spread-away's
// settlement (settlement.ts) was found to silently discard the spread's
// sign and effectively assume home was always the favorite — since fixed
// (2026-08-27, see settlement.ts's b-spread- branch) for the FULL-GAME
// market. The period-scoped equivalent (q1s-/q3s-, quarters[]-based) was
// separately checked and found to already be correct (it captures a signed
// line directly from the key, using its own self-consistent "positive =
// favorite" convention) — but extractSpread here pulls PulseScore's real
// line in the OPPOSITE, standard sportsbook convention ("negative =
// favorite"), so wiring it in as-is would silently invert every period
// spread bet. Needs the sign flipped at the point a q1s-/q2s-/q3s-/q4s-
// selection key gets built from this override, not just here — left
// synthetic-only until that's done deliberately, not by oversight.
function applyBasketballPeriodOverrides(
  markets: AdvancedMarkets,
  override: PulseScoreBasketballOverride,
): void {
  const extra = markets.basketballExtra;
  if (!extra) return;
  if (override.q1?.odds) extra.q1 = override.q1.odds;
  if (override.q1?.total) extra.q1Total = override.q1.total;
  if (override.q3?.odds) extra.q3 = override.q3.odds;
  if (override.q3?.total) extra.q3Total = override.q3.total;
  if (override.firstHalf?.odds) extra.firstHalf = override.firstHalf.odds;
  if (override.firstHalf?.total) extra.firstHalfTotal = override.firstHalf.total;
  if (override.q2?.odds) extra.q2 = override.q2.odds;
  if (override.q2?.total) extra.q2Total = override.q2.total;
  if (override.q4?.odds) extra.q4 = override.q4.odds;
  if (override.q4?.total) extra.q4Total = override.q4.total;
}

/**
 * Basketball prematch, sourced entirely from PulseScore (getPulseScoreBasketballUpcoming).
 * Confirmed against a real GET /api/v3/bet365/basketball/leagues sample (2026-08-07) —
 * same envelope as football's/tennis's /leagues, league is a bare string (no
 * "Country||League"/"Tour||League" prefix), so no catalog/league filtering is
 * applied and country is hardcoded "Internacional" — mirrors tennis's
 * no-catalog approach since there's no existing basketball country table to
 * reuse. Money Line / Spread / Total all confirmed real (extractBasketballOverride);
 * q1/q3/firstHalf are now real too (2026-08-15) via
 * applyBasketballPeriodOverrides — q2/q4 stay synthetic-only, no real
 * per-quarter sample confirmed for those yet. Same `pulsescore-basketball-${eventId}` id
 * scheme as football/tennis so a match's identity doesn't change if a live
 * pipeline is added later.
 */
async function buildBasketballUpcomingFromPulseScore(): Promise<UpcomingMatch[]> {
  const events = [...(await getPulseScoreBasketballUpcoming())].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  const results: UpcomingMatch[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;

    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const leagueName = ev.league || "Basquetebol";
    const { date, time } = pulseScoreEventDateTime(ev.startTime);
    const override = extractBasketballOverride(ev);
    const baseMarkets = makeBasketballMarketsFromTeams(home, away);
    const markets: AdvancedMarkets = { ...baseMarkets };
    if (override.spread) {
      markets.handicap = {
        ...markets.handicap,
        homeMinusOne: override.spread.home,
        awayPlusOne: override.spread.away,
      };
      markets._spread = -override.spread.line;
      markets._spreadLine = -override.spread.line;
    }
    if (override.total) {
      markets.totalGoals = {
        ...markets.totalGoals,
        over25: override.total.over,
        under25: override.total.under,
      };
      markets._total = override.total.line;
    }
    // Double Chance / team totals / odd-even: real onexbet FULL_TIME data
    // overrides basketball's all-zero synthetic doubleChance and
    // Poisson-derived teamTotalHome/teamTotalAway when present, same
    // "real wins, synthetic fills the gap" pattern as spread/total above.
    // No new settlement code needed for any of these three — see
    // extractBasketballOverride's own header.
    if (override.doubleChance) markets.doubleChance = override.doubleChance;
    if (override.teamTotalHome) {
      markets.basketballExtra = { ...markets.basketballExtra!, teamTotalHome: override.teamTotalHome };
    }
    if (override.teamTotalAway) {
      markets.basketballExtra = { ...markets.basketballExtra!, teamTotalAway: override.teamTotalAway };
    }
    if (override.oddEven) markets.goalOddEven = override.oddEven;
    applyBasketballPeriodOverrides(markets, override);
    const odds = override.odds
      ? { home: override.odds.home, draw: 0, away: override.odds.away }
      : { ...makeBasketballMoneylineFromTeams(home, away), draw: 0 };

    results.push({
      id: `pulsescore-basketball-${ev.eventId}`,
      home,
      away,
      league: leagueName,
      country: "Internacional",
      time,
      date,
      sport: "basketball",
      hasRealOdds: !!override.odds,
      odds,
      markets,
    });
  }
  return results;
}

// Coarse per-quarter minute ESTIMATE for the progress bar only — bwin gives
// no running clock for basketball at all (see getPulseScoreBasketballLive's
// header comment), unlike football/soccer's per-second matchClock. The UI's
// actual displayed label is `status` (the raw period string below), not
// this number.
// Same disappearance-based finish detection as tennis (see
// TENNIS_DISAPPEAR_GRACE_MS's comment) and for the same reason: bwin gives
// basketball no "Finished" signal to fast-path on. This sport was wrongly
// reusing getFootballLiveDisappearGraceMs (130-180 MINUTES) until an audit
// (2026-08-10) found its only fast path can never fire here — it requires
// minute >= 88, but estimateBasketballMinute() below caps out at 46 even in
// overtime, so every finished basketball match sat in "Ao Vivo" unsettled
// for up to 3 hours after it actually ended. 15s (same value tennis uses,
// ~15x BASKETBALL_LIVE_TTL_MS's 1s) still tolerates a run of transient poll
// misses without treating them as a finish.
const BASKETBALL_DISAPPEAR_GRACE_MS = 15_000;

function estimateBasketballMinute(period: string): number {
  const p = period.toLowerCase();
  if (p === "q1" || p.includes("1st quarter")) return 6;
  if (p === "q2" || p.includes("2nd quarter")) return 18;
  if (p.includes("half")) return 24;
  if (p === "q3" || p.includes("3rd quarter")) return 30;
  if (p === "q4" || p.includes("4th quarter")) return 42;
  if (p.includes("ot") || p.includes("overtime")) return 46;
  return 0;
}

/**
 * Basketball live odds + score, sourced entirely from PulseScore
 * (getPulseScoreBasketballLive, bwin). Confirmed against a real GET
 * /live-events?sport=basketball sample (2026-08-09) — score is
 * {home,away} as STRINGS, matchClock only ever carries `period` (no
 * minute/second/running fields), and pre-game fixtures are folded into the
 * same feed with period "Not Started" (filtered out below, not live yet).
 * No confirmed "Finished"-equivalent period value exists for basketball —
 * unlike football's immediate-FT fast path, end-of-match here is detected
 * purely by disappearance from the feed (finalizeStaleLiveMatch +
 * getFootballLiveDisappearGraceMs, reused as-is — both are sport-agnostic,
 * same pattern buildFootballLiveFromPulseScore's own GC loop uses). Same
 * `pulsescore-basketball-${eventId}` id scheme as the prematch builder so a
 * match's identity carries over once it goes live, and the same
 * liveMatchState.set() call so settlement.ts/cash-out pick it up the same
 * way football's live matches already do.
 */
async function buildBasketballLiveFromPulseScore(): Promise<LiveMatchState[]> {
  const events = await getPulseScoreBasketballLive();
  const currentIds = new Set<string>();
  const results: LiveMatchState[] = [];
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    const period = ev.matchClock?.period ?? "";
    if (!period || period.toLowerCase().includes("not started")) continue;
    if (isPulseScoreEventFinished(ev)) {
      const idDone = `pulsescore-basketball-${ev.eventId}`;
      currentIds.add(idDone);
      const existing = liveMatchState.get(idDone);
      if (existing) {
        try { await finalizeStaleLiveMatch(existing); } catch (err) {
          logger.error({ err, id: idDone }, "[pulsescore] basketball immediate finalize failed");
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }

    const id = `pulsescore-basketball-${ev.eventId}`;
    currentIds.add(id);
    const existing = liveMatchState.get(id);
    const homeScore = Number(ev.score?.home ?? existing?.homeScore ?? 0);
    const awayScore = Number(ev.score?.away ?? existing?.awayScore ?? 0);

    const override = extractBasketballOverride(ev);
    const baseMarkets = makeBasketballMarketsFromTeams(home, away);
    const markets: AdvancedMarkets = { ...baseMarkets };
    if (override.spread) {
      markets.handicap = {
        ...markets.handicap,
        homeMinusOne: override.spread.home,
        awayPlusOne: override.spread.away,
      };
      markets._spread = -override.spread.line;
      markets._spreadLine = -override.spread.line;
    }
    if (override.total) {
      markets.totalGoals = {
        ...markets.totalGoals,
        over25: override.total.over,
        under25: override.total.under,
      };
      markets._total = override.total.line;
    }
    // Same real-overrides-synthetic wiring as the prematch builder above —
    // see that function's comment.
    if (override.doubleChance) markets.doubleChance = override.doubleChance;
    if (override.teamTotalHome) {
      markets.basketballExtra = { ...markets.basketballExtra!, teamTotalHome: override.teamTotalHome };
    }
    if (override.teamTotalAway) {
      markets.basketballExtra = { ...markets.basketballExtra!, teamTotalAway: override.teamTotalAway };
    }
    if (override.oddEven) markets.goalOddEven = override.oddEven;
    applyBasketballPeriodOverrides(markets, override);
    const odds = override.odds
      ? { home: override.odds.home, draw: 0, away: override.odds.away }
      : { ...makeBasketballMoneylineFromTeams(home, away), draw: 0 };

    // Score-change market suspension (audit finding, 2026-08-10): basketball
    // had NO suspension mechanism at all despite having real live odds
    // (override.odds, from bwin) — a bettor could back the moneyline/
    // handicap/total right after a basket at odds that hadn't repriced yet,
    // a direct financial exposure to the house. Deliberately simple (one
    // flat window, not football's per-market delay table — there's no
    // equivalent tuned-by-risk data for basketball yet): any point change
    // suspends "result"/"handicap"/"totalGoals" for 8s, which the frontend's
    // generic marketSuspension["result"] fallback already turns into a
    // full match-lock banner (home.tsx, SuspensionBanner).
    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension ? { ...existing.marketSuspension } : undefined;
    if (marketSuspension) {
      const active = Object.fromEntries(
        Object.entries(marketSuspension).filter(([, ts]) => ts > Date.now()),
      );
      marketSuspension = Object.keys(active).length > 0 ? active : undefined;
    }
    let suspensionReason = marketSuspension ? existing?._suspensionReason : undefined;
    const pointsScored =
      !!existing && (homeScore !== existing.homeScore || awayScore !== existing.awayScore);
    if (pointsScored) {
      const now = Date.now();
      marketSuspension = {
        result: now + 8_000,
        handicap: now + 8_000,
        totalGoals: now + 8_000,
        // Double Chance, team totals, and odd-even are all just as
        // repriced by a basket as the three markets above — added
        // 2026-08-27 alongside wiring real odds in for them, same
        // stale-price exposure this mechanism exists to prevent.
        doubleChance: now + 8_000,
        goalOddEven: now + 8_000,
      };
      suspensionReason = "PONTOS!";
    }

    const state: LiveMatchState = {
      id,
      home,
      away,
      league: ev.league || "Basquetebol",
      country: ev.country || "Internacional",
      sport: "basketball",
      homeScore,
      awayScore,
      minute: estimateBasketballMinute(period),
      status: period,
      hasRealOdds: !!override.odds,
      odds,
      markets,
      events: [],
      _lastSeenAt: Date.now(),
      marketSuspension,
      _suspensionReason: suspensionReason,
    };
    liveMatchState.set(id, state);
    results.push(state);
  }

  // Garbage-collect matches that stopped appearing in the feed — short,
  // basketball-specific grace (BASKETBALL_DISAPPEAR_GRACE_MS), NOT the
  // football-tuned getFootballLiveDisappearGraceMs (see that constant's
  // comment for why reusing it here was a real bug).
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("pulsescore-basketball-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (Date.now() - missingSince > BASKETBALL_DISAPPEAR_GRACE_MS) {
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error({ err, id }, "[pulsescore] basketball finalizeStaleLiveMatch failed");
      }
      liveMatchState.delete(id);
    }
  }

  return results;
}

/** Upcoming hockey fixtures from PulseScore (bwin), each carrying its 3-Way
 * Result / Handicap / Totals prematch odds when bwin has priced it yet, with
 * makeHockeyMarketsFromTeams's synthetic model still filling every market
 * this builder doesn't have a real source for yet (period-level markets,
 * shots on goal, both-teams-to-score — no real per-period sample seen for
 * hockey, same gap basketball's basketballExtra has). Same
 * `pulsescore-hockey-${eventId}` id scheme as the other PulseScore sports so
 * a match's identity doesn't change if a live pipeline is added later. */
async function buildHockeyUpcomingFromPulseScore(): Promise<UpcomingMatch[]> {
  const events = [...(await getPulseScoreHockeyUpcoming())].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  const results: UpcomingMatch[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;

    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const leagueName = ev.league || "Hóquei no Gelo";
    const { date, time } = pulseScoreEventDateTime(ev.startTime);
    const override = extractHockeyOverride(ev);
    const markets = makeHockeyMarketsFromTeams(home, away);
    if (override.spread) {
      markets.handicap = {
        ...markets.handicap,
        homeMinusOne: override.spread.home,
        awayPlusOne: override.spread.away,
      };
      markets._spread = -override.spread.line;
      markets._spreadLine = -override.spread.line;
    }
    if (override.total) {
      markets.totalGoals = {
        ...markets.totalGoals,
        over25: override.total.over,
        under25: override.total.under,
      };
      markets._total = override.total.line;
    }
    // Double Chance / odd-even: settlement.ts already grades these
    // generically for any sport (see extractHockeyOverride's header) —
    // real onexbet odds override the synthetic placeholders directly.
    if (override.doubleChance) markets.doubleChance = override.doubleChance;
    if (override.oddEven) markets.goalOddEven = override.oddEven;
    if (markets.hockeyExtra) {
      markets.hockeyExtra = {
        ...markets.hockeyExtra,
        ...(override.period1 ? { period1: override.period1 } : {}),
        ...(override.period2 ? { period2: override.period2 } : {}),
        ...(override.period3 ? { period3: override.period3 } : {}),
        ...(override.period1Total ? { period1Total: override.period1Total } : {}),
        ...(override.period2Total ? { period2Total: override.period2Total } : {}),
        ...(override.period3Total ? { period3Total: override.period3Total } : {}),
        ...(override.drawNoBet ? { drawNoBet: override.drawNoBet } : {}),
        ...(override.correctScore ? { correctScore: override.correctScore } : {}),
        ...(override.nextGoal ? { nextGoal: override.nextGoal } : {}),
      };
    }
    const odds = override.odds ?? makeHockeyMoneylineFromTeams(home, away);

    results.push({
      id: `pulsescore-hockey-${ev.eventId}`,
      home,
      away,
      league: leagueName,
      country: "Internacional",
      time,
      date,
      sport: "hockey",
      hasRealOdds: !!override.odds,
      odds,
      markets,
    });
  }
  return results;
}

// MMA has no goals/points/quarters — a fight is decided by decision/KO/
// submission, not a running score — so unlike every other makeXMarketsFromTeams
// helper here, there's no Poisson goal model to build a synthetic price
// from. A flat, seeded-per-matchup ~50/50 price (same probsToDecimalOdds
// fair-price helper every other synthetic model uses) is the honest
// placeholder until real onexbet odds arrive — no fight-specific stats
// exist to weight it by. AdvancedMarkets' required generic fields
// (bothTeamsScore/totalGoals/handicap/halfTime/firstGoal) don't apply to
// MMA at all — zeroed, matching this codebase's "0 odds = not priced,
// frontend hides it" convention already used for every other placeholder
// market.
function makeMmaMoneylineFromTeams(home: string, away: string): { home: number; away: number } {
  const sr = seededRng(`mma-ml:${home}:${away}`);
  const pHome = mc(0.5 + (sr(1) - 0.5) * 0.3, 0.15, 0.85);
  const [oddsHome, oddsAway] = probsToDecimalOdds([pHome, 1 - pHome], 1.06);
  return { home: oddsHome!, away: oddsAway! };
}

function makeMmaMarketsFromTeams(home: string, away: string): AdvancedMarkets {
  const ml = makeMmaMoneylineFromTeams(home, away);
  return {
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: 0, no: 0 },
    totalGoals: {
      over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0,
      over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0,
      over65: 0, under65: 0,
    },
    handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
    halfTime: { home: 0, draw: 0, away: 0 },
    firstGoal: { home: ml.home, noGoal: 0, away: ml.away },
  };
}

/**
 * MMA prematch, sourced entirely from PulseScore (getPulseScoreMmaUpcoming).
 * New sport (2026-08-28) — see mma.ts's header for the real market shapes
 * confirmed against a real onexbet sample and exactly what isn't built yet
 * (live odds, automatic result detection/settlement — no real live/results
 * MMA sample exists to build either against safely). `odds` prefers the
 * "Win (2Way)" 2-way price (no draw ambiguity); `mmaExtra.totalRoundsLines`
 * carries the round total when priced. Same `pulsescore-mma-${eventId}` id
 * scheme as every other PulseScore sport.
 */
async function buildMmaUpcomingFromPulseScore(): Promise<UpcomingMatch[]> {
  const events = [...(await getPulseScoreMmaUpcoming())].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  const results: UpcomingMatch[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;

    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const leagueName = ev.league || "MMA";
    const { date, time } = pulseScoreEventDateTime(ev.startTime);
    const override = extractMmaOverride(ev);
    const markets = makeMmaMarketsFromTeams(home, away);
    if (override.doubleChance) markets.doubleChance = override.doubleChance;
    const mmaExtra: MmaExtraData = {
      toDistance: override.goTheDistance ?? { yes: 0, no: 0 },
      totalRoundsLines: override.total ? [override.total] : [],
      winInsideDistance: override.winInsideDistance,
      methodOfVictory: override.methodOfVictory,
    };
    const odds = override.odds
      ? { home: override.odds.home, draw: 0, away: override.odds.away }
      : { ...makeMmaMoneylineFromTeams(home, away), draw: 0 };

    results.push({
      id: `pulsescore-mma-${ev.eventId}`,
      home,
      away,
      league: leagueName,
      country: "Internacional",
      time,
      date,
      sport: "mma",
      hasRealOdds: !!override.odds,
      odds,
      markets,
      mmaExtra,
    });
  }
  return results;
}

/** Upcoming volleyball fixtures from PulseScore (bwin), each carrying its
 * Match Result / Set 1 Winner / Total Points / Correct Score prematch odds
 * when bwin has priced it yet, merged into the existing (previously dead —
 * see volleyball.ts's header) AdvancedMarkets.volleyballExtra shape. Fields
 * with no real source yet (set2, set3, setHandicap, handicapPoints) stay
 * zeroed, this codebase's existing "not priced" convention (same one
 * tennis's builder uses for its own not-yet-real markets) — the frontend
 * already hides/disables a market whose odds are 0. Same
 * `pulsescore-volleyball-${eventId}` id scheme as the other PulseScore
 * sports so a match's identity doesn't change if a live pipeline is added
 * later. */
async function buildVolleyballUpcomingFromPulseScore(): Promise<UpcomingMatch[]> {
  const events = [...(await getPulseScoreVolleyballUpcoming())].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  const results: UpcomingMatch[] = [];
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;

    const isDuplicate = results.some(
      (r) => teamNamesMatch(r.home, home) && teamNamesMatch(r.away, away),
    );
    if (isDuplicate) continue;

    const leagueName = ev.league || "Voleibol";
    const { date, time } = pulseScoreEventDateTime(ev.startTime);
    const override = extractVolleyballOverride(ev);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    const volleyballExtra: NonNullable<AdvancedMarkets["volleyballExtra"]> = {
      set1: override.set1 ?? { home: 0, away: 0 },
      set2: override.set2 ?? { home: 0, away: 0 },
      set3: override.set3 ?? { home: 0, away: 0 },
      exactScore: override.exactScore ?? {
        s30: 0,
        s31: 0,
        s32: 0,
        s03: 0,
        s13: 0,
        s23: 0,
      },
      setHandicap: { home: 0, away: 0 },
      pointsLines: override.pointsLines ?? [],
      handicapPoints: override.handicapPoints ?? { line: 0, home: 0, away: 0 },
      set2PointsLines: override.set2PointsLines,
      set3PointsLines: override.set3PointsLines,
      set2HandicapPoints: override.set2HandicapPoints,
      set3HandicapPoints: override.set3HandicapPoints,
      raceToPointsSet2: override.raceToPointsSet2,
      raceToPointsSet3: override.raceToPointsSet3,
    };
    const markets: AdvancedMarkets = { ...baseMarkets, volleyballExtra };
    // Flat neutral fallback, not makeAdvancedMarketsFromTeams's internal
    // odds — that model is a football/soccer goals-based Poisson estimate
    // (see soccerPoissonModel), meaningless for volleyball. Same reasoning
    // as tennis's makeTennisBaseOdds ("better than a soccer Poisson model on
    // player name hashes") — volleyball has no existing calibrated
    // synthetic model of its own to lean on instead.
    const odds = override.odds
      ? { home: override.odds.home, draw: 0, away: override.odds.away }
      : { home: 1.85, draw: 0, away: 1.85 };

    results.push({
      id: `pulsescore-volleyball-${ev.eventId}`,
      home,
      away,
      league: leagueName,
      country: "Internacional",
      time,
      date,
      sport: "volleyball",
      hasRealOdds: !!override.odds,
      odds,
      markets,
    });
  }
  return results;
}

/**
 * Volleyball live score, sourced from PulseScore's "unibetau" (Unibet
 * Australia) feed — a THIRD bookmaker, different from the bwin-sourced
 * prematch builder above. Neither bwin (no score field at all) nor bet365
 * (score field present but stuck at 0-0/empty even for genuinely in-play
 * matches) worked — both tried and reverted the same day (2026-08-09).
 * unibetau's real sample DOES carry a working live signal: a genuine
 * continuous matchClock {minute, second, running}, `score` as the CURRENT
 * set's points (e.g. "24"/"19"), and `statistics.sets.{home,away}` as
 * parallel arrays of each COMPLETED set's final score (e.g. [25,25] /
 * [20,13]) plus `homeServe`. Feeds LiveMatchState._liveExtra.vollSets/
 * currentPts, which home.tsx's "Placar por Set" panel and VolleyScore
 * header already render — those fields existed with zero real source until
 * now. Markets/odds stay synthetic: unibetau's real sample showed some
 * markets that LOOK like they'd match extractVolleyballOverride's filters
 * (e.g. canonicalMarket "OVER_UNDER" / period "FULL_TIME" for a market
 * actually named "Total Points - Set 3") but aren't semantically the same
 * thing that field means elsewhere (whole-match total, not one set's) —
 * risky to wire blindly for a real-money market, deliberately left
 * synthetic-only until mapped carefully as its own pass. Same
 * `pulsescore-volleyball-${eventId}` id prefix as prematch even though the
 * eventId SPACE differs per bookmaker (bwin's are colon-containing like
 * "5:1106680", unibetau's are bare numeric like "1028651154" — never
 * collide), kept for consistency with every other sport's id scheme.
 */
// Same disappearance-based finish detection as tennis/basketball — no
// "Finished" signal from the feed to fast-path on. Volleyball's `status`
// is always the synthetic `Set ${n}` string set below, which never matches
// any of getFootballLiveDisappearGraceMs's football-specific substrings
// ("2nd half", "overtime", etc.), so that function's fast path could never
// fire here either — it was silently falling through to the 130-180
// MINUTE football default, same bug class as basketball's (audit,
// 2026-08-10). 15s matches tennis/basketball's own short grace.
const VOLLEYBALL_DISAPPEAR_GRACE_MS = 15_000;

async function buildVolleyballLiveFromPulseScore(): Promise<LiveMatchState[]> {
  const events = await getPulseScoreVolleyballLive();
  const currentIds = new Set<string>();
  const results: LiveMatchState[] = [];
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    // matchClock is this feed's actual "is this genuinely live" signal —
    // confirmed real samples always carried it for in-play matches.
    if (!ev.matchClock) continue;
    if (isPulseScoreEventFinished(ev)) {
      const idDone = `pulsescore-volleyball-${ev.eventId}`;
      currentIds.add(idDone);
      const existing = liveMatchState.get(idDone);
      if (existing) {
        try { await finalizeStaleLiveMatch(existing); } catch (err) {
          logger.error({ err, id: idDone }, "[pulsescore] volleyball immediate finalize failed");
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }

    const id = `pulsescore-volleyball-${ev.eventId}`;
    currentIds.add(id);
    const existing = liveMatchState.get(id);

    const setsHomeRaw = ev.statistics?.sets?.home ?? [];
    const setsAwayRaw = ev.statistics?.sets?.away ?? [];
    const vollSets: Array<[number, number]> = setsHomeRaw.map((h, i) => [h, setsAwayRaw[i] ?? 0]);
    const homeScore = vollSets.filter(([h, a]) => h > a).length;
    const awayScore = vollSets.filter(([h, a]) => a > h).length;
    const currentPts: [number, number] = [
      Number(ev.score?.home ?? existing?._liveExtra?.currentPts?.[0] ?? 0),
      Number(ev.score?.away ?? existing?._liveExtra?.currentPts?.[1] ?? 0),
    ];
    const minute = ev.matchClock?.minute ?? existing?.minute ?? 0;

    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    // Real moneyline only — unibetau's "Match Odds" market (canonicalMarket
    // MATCH_RESULT, period FULL_TIME) is unambiguously the whole-match
    // winner, confirmed real (2026-08-09: Argentina 3.20 / Brazil 1.32,
    // matching a match Brazil was already leading) — safe to wire, unlike
    // the per-set-labelled-as-whole-match markets this function's header
    // warns about. extractVolleyballOverride's set1/pointsLines/exactScore
    // extraction either targets a different period (set1) or a differently-
    // formatted selection name unibetau doesn't use ("3-1" vs the "3:1"
    // extractExactScore requires) — those naturally come back empty rather
    // than wrong, so they still fall through to the computed model below.
    const override = extractVolleyballOverride(ev);
    // sp/pHomeMatch: the score-aware synthetic model this used to be missing
    // entirely — a flat, unmoving `1.85/1.85` regardless of team or score
    // (bug report 2026-08-11: a match already 2 sets to 0 still showed even
    // odds on both sides, an obvious real-money exploit for anyone watching
    // the score). unibetau doesn't price Match Odds for every league (most
    // notably lower-tier/international-friendly fixtures — exactly the case
    // reported), so this fallback is the COMMON case here, not a rare edge,
    // unlike tennis's equivalent fallback which only kicks in when bet365's
    // real live price is briefly missing for one tick. Reuses
    // computeVolleyballExtras (built 2026-08-09, never wired to a real
    // caller until now — see volleyball.ts's header) for the full set of
    // sub-markets instead of leaving them zeroed, and derives its single
    // `pSetHomeWin` input from the actual sets record + current in-set point
    // differential via estimateVolleyballSetWinProb, rather than treating
    // every match as a coin flip regardless of the score on screen.
    const sp = estimateVolleyballSetWinProb(homeScore, awayScore, currentPts[0], currentPts[1]);
    const computedExtras = computeVolleyballExtras(sp);
    const volleyballExtra: NonNullable<AdvancedMarkets["volleyballExtra"]> = {
      set1: override.set1 ?? computedExtras.set1,
      set2: override.set2 ?? computedExtras.set2,
      set3: override.set3 ?? computedExtras.set3,
      exactScore: override.exactScore ?? computedExtras.exactScore,
      setHandicap: computedExtras.setHandicap,
      pointsLines: override.pointsLines ?? computedExtras.pointsLines,
      handicapPoints: override.handicapPoints ?? computedExtras.handicapPoints,
      set2PointsLines: override.set2PointsLines,
      set3PointsLines: override.set3PointsLines,
      set2HandicapPoints: override.set2HandicapPoints,
      set3HandicapPoints: override.set3HandicapPoints,
      raceToPointsSet2: override.raceToPointsSet2,
      raceToPointsSet3: override.raceToPointsSet3,
    };
    const markets: AdvancedMarkets = { ...baseMarkets, volleyballExtra };
    const odds = override.odds
      ? { home: override.odds.home, draw: 0, away: override.odds.away }
      : (() => {
          const pHomeMatch = volleyballMatchWinProbFromSets(sp, homeScore, awayScore);
          const [h, a] = probsToDecimalOdds(
            [mc(pHomeMatch, 0.02, 0.98), mc(1 - pHomeMatch, 0.02, 0.98)],
            1.08,
          );
          return { home: h!, draw: 0, away: a! };
        })();

    // Set-win market suspension (audit finding, 2026-08-10): volleyball had
    // NO suspension mechanism despite the real "Match Result" moneyline
    // above (override.odds, from unibetau) — a completed set is the single
    // biggest whole-match win-probability swing in volleyball, and this
    // module's own comment above already explains override.odds is
    // genuinely real, not synthetic. Triggered on homeScore/awayScore
    // (sets won, not points — see vollSets above) rather than every point,
    // since individual points barely move the whole-match price and
    // suspending on every one would make live volleyball near-unbettable.
    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension ? { ...existing.marketSuspension } : undefined;
    if (marketSuspension) {
      const active = Object.fromEntries(
        Object.entries(marketSuspension).filter(([, ts]) => ts > Date.now()),
      );
      marketSuspension = Object.keys(active).length > 0 ? active : undefined;
    }
    let suspensionReason = marketSuspension ? existing?._suspensionReason : undefined;
    const setWon =
      !!existing && (homeScore !== existing.homeScore || awayScore !== existing.awayScore);
    if (setWon) {
      const now = Date.now();
      marketSuspension = { result: now + 10_000 };
      suspensionReason = "FIM DE SET!";
    }

    const state: LiveMatchState = {
      id,
      home,
      away,
      league: ev.league || "Voleibol",
      country: ev.country || "Internacional",
      sport: "volleyball",
      homeScore,
      awayScore,
      minute,
      status: `Set ${vollSets.length + 1}`,
      hasRealOdds: !!override.odds,
      odds,
      markets,
      events: [],
      _lastSeenAt: Date.now(),
      marketSuspension,
      _suspensionReason: suspensionReason,
      _liveExtra: { vollSets, currentPts },
    };
    liveMatchState.set(id, state);
    results.push(state);
  }

  // Garbage-collect matches that stopped appearing in the feed — short,
  // volleyball-specific grace (VOLLEYBALL_DISAPPEAR_GRACE_MS), NOT the
  // football-tuned getFootballLiveDisappearGraceMs (see that constant's
  // comment for why reusing it here was a real bug).
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("pulsescore-volleyball-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (Date.now() - missingSince > VOLLEYBALL_DISAPPEAR_GRACE_MS) {
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error({ err, id }, "[pulsescore] volleyball finalizeStaleLiveMatch failed");
      }
      liveMatchState.delete(id);
    }
  }

  return results;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// ── Upcoming matches cache (Em Breve section) ─────────────────────────────────
// Upcoming matches change slowly (every few minutes), so we cache them for 30s.
// Live score data is always rebuilt fresh (pure in-memory, sub-millisecond).
// This means a V1 score patch triggers a broadcast in ~5ms instead of ~200ms.
let _allUpcomingCache: UpcomingMatch[] = [];
let _allUpcomingCacheBuiltAt = 0;
const UPCOMING_CACHE_TTL_MS = 30_000;
let _upcomingRebuildInProgress = false;

// Last good per-sport slice — kept separately from _allUpcomingCache so a
// single sport's builder throwing (a bug in the per-event transform, not
// just a network hiccup — the underlying getPulseScoreXUpcoming() fetchers
// already fall back to their own stale cache on error, see football.ts/
// tennis.ts/basketball.ts) doesn't wipe that sport's "Em Breve" listings to
// empty for this whole 30s cache window. That wipe-then-refill cycle is
// exactly what showed up on the site as prematch matches "appearing and
// disappearing".
let _lastGoodFootballUpcoming: UpcomingMatch[] = [];
let _lastGoodTennisUpcoming: UpcomingMatch[] = [];
let _lastGoodBasketballUpcoming: UpcomingMatch[] = [];
let _lastGoodHockeyUpcoming: UpcomingMatch[] = [];
let _lastGoodVolleyballUpcoming: UpcomingMatch[] = [];
let _lastGoodMmaUpcoming: UpcomingMatch[] = [];

async function rebuildUpcomingCache(): Promise<void> {
  if (_upcomingRebuildInProgress) return;
  _upcomingRebuildInProgress = true;
  try {
    // ── Sports data providers still disconnected from pré-jogo, except
    // football, tennis, basketball, hockey and volleyball ───────────────────
    // Same rebuild-from-scratch effort as the live side: football
    // (2026-08-07), tennis (2026-08-07), basketball (2026-08-07), hockey and
    // volleyball (both 2026-08-09, built from scratch — neither had any
    // prior PulseScore integration) prematch are all on PulseScore, each
    // confirmed against a real /leagues sample. Every other sport's prematch
    // remains disconnected pending its own real confirmed sample.
    let football: UpcomingMatch[];
    try {
      football = await buildFootballUpcomingFromSportMonks();
      _lastGoodFootballUpcoming = football;
    } catch (err) {
      logger.error(
        { err },
        "[sportmonks] buildFootballUpcomingFromSportMonks failed this cycle — keeping last good prematch list",
      );
      football = _lastGoodFootballUpcoming;
    }
    let tennis: UpcomingMatch[];
    try {
      tennis = await buildTennisUpcomingFromPulseScore();
      _lastGoodTennisUpcoming = tennis;
    } catch (err) {
      logger.error(
        { err },
        "[pulsescore] buildTennisUpcomingFromPulseScore failed this cycle — keeping last good prematch list",
      );
      tennis = _lastGoodTennisUpcoming;
    }
    let basketball: UpcomingMatch[];
    try {
      basketball = await buildBasketballUpcomingFromPulseScore();
      _lastGoodBasketballUpcoming = basketball;
    } catch (err) {
      logger.error(
        { err },
        "[pulsescore] buildBasketballUpcomingFromPulseScore failed this cycle — keeping last good prematch list",
      );
      basketball = _lastGoodBasketballUpcoming;
    }
    let hockey: UpcomingMatch[];
    try {
      hockey = await buildHockeyUpcomingFromPulseScore();
      _lastGoodHockeyUpcoming = hockey;
    } catch (err) {
      logger.error(
        { err },
        "[pulsescore] buildHockeyUpcomingFromPulseScore failed this cycle — keeping last good prematch list",
      );
      hockey = _lastGoodHockeyUpcoming;
    }
    let volleyball: UpcomingMatch[];
    try {
      volleyball = await buildVolleyballUpcomingFromPulseScore();
      _lastGoodVolleyballUpcoming = volleyball;
    } catch (err) {
      logger.error(
        { err },
        "[pulsescore] buildVolleyballUpcomingFromPulseScore failed this cycle — keeping last good prematch list",
      );
      volleyball = _lastGoodVolleyballUpcoming;
    }
    let mma: UpcomingMatch[];
    try {
      mma = await buildMmaUpcomingFromPulseScore();
      _lastGoodMmaUpcoming = mma;
    } catch (err) {
      logger.error(
        { err },
        "[pulsescore] buildMmaUpcomingFromPulseScore failed this cycle — keeping last good prematch list",
      );
      mma = _lastGoodMmaUpcoming;
    }
    const all = [...football, ...tennis, ...basketball, ...hockey, ...volleyball, ...mma];
    rememberUpcomingFootballEligibility(football);
    rememberUpcomingEligibility(all);
    _allUpcomingCache = all;
    _allUpcomingCacheBuiltAt = Date.now();
  } catch {
    /* keep stale */
  } finally {
    _upcomingRebuildInProgress = false;
  }
}

// Dedupes the "[DIAG apifootball-miss]" log+persist site below to once per
// match id per process, instead of once per ~1-2s tick for the whole
// match's lifetime — the api_football_name_mismatches row it upserts
// already tracks repeat occurrences across restarts, so this Set only
// needs to prevent same-process log/write spam.
const HOCKEY_DISAPPEAR_GRACE_MS = 15_000;
const BASEBALL_DISAPPEAR_GRACE_MS = 15_000;

/** Hockey live odds + score, sourced from PulseScore generic REST live source
 * (ice-hockey, bookmaker=bwin — independent rate-limit budget). Uses the same
 * `pulsescore-hockey-${eventId}` id scheme as buildHockeyUpcomingFromPulseScore
 * so prematch/live identity carries over. Odds use extractHockeyOverride (hockey.ts)
 * when available, falling back to makeHockeyMarketsFromTeams's calibrated synthetic
 * model (identical to the prematch builder's pattern above). Finalized via the
 * same finalizeStaleLiveMatch + 15s disappear grace pattern as basketball/volleyball. */
async function buildHockeyLiveFromPulseScore(): Promise<LiveMatchState[]> {
  const events = await pulseScoreHockey.getLive();
  const currentIds = new Set<string>();
  const results: LiveMatchState[] = [];
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    const period = ev.matchClock?.period ?? "";
    if (!period || period.toLowerCase().includes("not started")) continue;
    if (isPulseScoreEventFinished(ev)) {
      const idDone = `pulsescore-hockey-${ev.eventId}`;
      currentIds.add(idDone);
      const existing = liveMatchState.get(idDone);
      if (existing) {
        try { await finalizeStaleLiveMatch(existing); } catch (err) {
          logger.error({ err, id: idDone }, "[pulsescore] hockey immediate finalize failed");
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }

    const id = `pulsescore-hockey-${ev.eventId}`;
    currentIds.add(id);
    const existing = liveMatchState.get(id);
    const homeScore = Number(ev.score?.home ?? existing?.homeScore ?? 0);
    const awayScore = Number(ev.score?.away ?? existing?.awayScore ?? 0);

    const override = extractHockeyOverride(ev);
    const baseMarkets = makeHockeyMarketsFromTeams(home, away);
    const markets: AdvancedMarkets = { ...baseMarkets };
    if (override.spread) {
      markets.handicap = {
        ...markets.handicap,
        homeMinusOne: override.spread.home,
        awayPlusOne: override.spread.away,
      };
      markets._spread = -override.spread.line;
      markets._spreadLine = -override.spread.line;
    }
    if (override.total) {
      markets.totalGoals = {
        ...markets.totalGoals,
        over25: override.total.over,
        under25: override.total.under,
      };
      markets._total = override.total.line;
    }
    if (override.doubleChance) markets.doubleChance = override.doubleChance;
    if (override.oddEven) markets.goalOddEven = override.oddEven;
    if (markets.hockeyExtra) {
      markets.hockeyExtra = {
        ...markets.hockeyExtra,
        ...(override.period1 ? { period1: override.period1 } : {}),
        ...(override.period2 ? { period2: override.period2 } : {}),
        ...(override.period3 ? { period3: override.period3 } : {}),
        ...(override.period1Total ? { period1Total: override.period1Total } : {}),
        ...(override.period2Total ? { period2Total: override.period2Total } : {}),
        ...(override.period3Total ? { period3Total: override.period3Total } : {}),
        ...(override.drawNoBet ? { drawNoBet: override.drawNoBet } : {}),
        ...(override.correctScore ? { correctScore: override.correctScore } : {}),
        ...(override.nextGoal ? { nextGoal: override.nextGoal } : {}),
      };
    }
    const odds = override.odds ?? makeHockeyMoneylineFromTeams(home, away);

    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension ? { ...existing.marketSuspension } : undefined;
    if (marketSuspension) {
      const active = Object.fromEntries(
        Object.entries(marketSuspension).filter(([, ts]) => ts > Date.now()),
      );
      marketSuspension = Object.keys(active).length > 0 ? active : undefined;
    }
    let suspensionReason = marketSuspension ? existing?._suspensionReason : undefined;
    const pointsScored =
      !!existing && (homeScore !== existing.homeScore || awayScore !== existing.awayScore);
    if (pointsScored) {
      const now = Date.now();
      marketSuspension = {
        result: now + 8_000,
        handicap: now + 8_000,
        totalGoals: now + 8_000,
        // Double Chance/odd-even reprice on every goal too — added
        // 2026-08-27 alongside wiring real odds in for them, same
        // reasoning as basketball's equivalent suspension extension.
        doubleChance: now + 8_000,
        goalOddEven: now + 8_000,
      };
      suspensionReason = "GOL!";
    }

    const state: LiveMatchState = {
      id,
      home,
      away,
      league: ev.league || "Hóquei no Gelo",
      country: ev.country || "Internacional",
      sport: "hockey",
      homeScore,
      awayScore,
      minute: 0,
      status: period,
      hasRealOdds: !!override.odds,
      odds,
      markets,
      events: [],
      _lastSeenAt: Date.now(),
      marketSuspension,
      _suspensionReason: suspensionReason,
    };
    liveMatchState.set(id, state);
    results.push(state);
  }

  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("pulsescore-hockey-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (Date.now() - missingSince > HOCKEY_DISAPPEAR_GRACE_MS) {
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error({ err, id }, "[pulsescore] hockey finalizeStaleLiveMatch failed");
      }
      liveMatchState.delete(id);
    }
  }

  return results;
}

/** Baseball live odds + score, sourced from PulseScore generic REST live source
 * (baseball, bookmaker=draftkings — independent rate-limit budget under MAX plan).
 * No dedicated extractBaseballOverride exists — the safe
 * pulseScoreBaseball.findOverride(home,away,events) only maps MATCH_RESULT
 * (moneyline) odds, all other markets (handicap/totals/innings) use the
 * calibrated makeBasketballMarketsFromTeams synthetic seed with
 * makeBasketballMoneylineFromTeams fallbacks. Same disappear grace GC as
 * basketball. */
async function buildBaseballLiveFromPulseScore(): Promise<LiveMatchState[]> {
  const events = await pulseScoreBaseball.getLive();
  const currentIds = new Set<string>();
  const results: LiveMatchState[] = [];
  for (const ev of events) {
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    const period = ev.matchClock?.period ?? "";
    if (!period || period.toLowerCase().includes("not started")) continue;
    if (isPulseScoreEventFinished(ev)) {
      const idDone = `pulsescore-baseball-${ev.eventId}`;
      currentIds.add(idDone);
      const existing = liveMatchState.get(idDone);
      if (existing) {
        try { await finalizeStaleLiveMatch(existing); } catch (err) {
          logger.error({ err, id: idDone }, "[pulsescore] baseball immediate finalize failed");
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }

    const id = `pulsescore-baseball-${ev.eventId}`;
    currentIds.add(id);
    const existing = liveMatchState.get(id);
    const homeScore = Number(ev.score?.home ?? existing?.homeScore ?? 0);
    const awayScore = Number(ev.score?.away ?? existing?.awayScore ?? 0);

    const override = pulseScoreBaseball.findOverride(home, away, events);
    const baseMarkets = makeBasketballMarketsFromTeams(home, away);
    const markets: AdvancedMarkets = { ...baseMarkets };
    // Total / Double Chance / odd-even: settlement.ts grades these
    // generically for any sport off the plain final score, and for
    // baseball `ft` genuinely is runs — see genericSportLive.ts's
    // GenericMoneylineOverride comment for why this needed no new
    // settlement code and no sport-specific extraction file.
    if (override?.total) {
      markets.totalGoals = {
        ...markets.totalGoals,
        over25: override.total.over,
        under25: override.total.under,
      };
      markets._total = override.total.line;
    }
    if (override?.doubleChance) markets.doubleChance = override.doubleChance;
    if (override?.oddEven) markets.goalOddEven = override.oddEven;
    const odds = override?.odds
      ? { home: override.odds.home, draw: override.odds.draw ?? 0, away: override.odds.away }
      : { ...makeBasketballMoneylineFromTeams(home, away), draw: 0 };

    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension ? { ...existing.marketSuspension } : undefined;
    if (marketSuspension) {
      const active = Object.fromEntries(
        Object.entries(marketSuspension).filter(([, ts]) => ts > Date.now()),
      );
      marketSuspension = Object.keys(active).length > 0 ? active : undefined;
    }
    let suspensionReason = marketSuspension ? existing?._suspensionReason : undefined;
    const pointsScored =
      !!existing && (homeScore !== existing.homeScore || awayScore !== existing.awayScore);
    if (pointsScored) {
      const now = Date.now();
      marketSuspension = {
        result: now + 8_000,
        handicap: now + 8_000,
        totalGoals: now + 8_000,
        doubleChance: now + 8_000,
        goalOddEven: now + 8_000,
      };
      suspensionReason = "RUN!";
    }

    const state: LiveMatchState = {
      id,
      home,
      away,
      league: ev.league || "Beisebol",
      country: ev.country || "Internacional",
      sport: "baseball",
      homeScore,
      awayScore,
      minute: 0,
      status: period,
      hasRealOdds: !!override?.odds,
      odds,
      markets,
      events: [],
      _lastSeenAt: Date.now(),
      marketSuspension,
      _suspensionReason: suspensionReason,
    };
    liveMatchState.set(id, state);
    results.push(state);
  }

  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("pulsescore-baseball-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (Date.now() - missingSince > BASEBALL_DISAPPEAR_GRACE_MS) {
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error({ err, id }, "[pulsescore] baseball finalizeStaleLiveMatch failed");
      }
      liveMatchState.delete(id);
    }
  }

  return results;
}

const _apiFootballMissLogged = new Set<string>();

async function buildFootballLiveFromPulseScore(): Promise<LiveMatchState[]> {
  // Helpers for PARTIAL PulseScore overrides: each selection slot can come
  // back null individually (bwin 2H inactivates the winning side, canonical
  // flips on some live matches, etc.). Instead of all-or-nothing (which
  // collapsed every real-odds slot back onto Poisson the moment a single
  // selection went dark, producing the "--" and flipped odds reported in
  // production), we copy only the fields that the override actually priced,
  // falling back per-slot to existing last-known-real then to the Poisson
  // synthetic baseline for anything still missing.
  type DefinedKeys<T> = { [K in keyof T]?: Exclude<T[K], null | undefined> };
  const assignNonNull = <T extends Record<string, any>>(
    target: T,
    patch: DefinedKeys<T> | null | undefined,
  ): T => {
    if (!patch) return target;
    for (const k of Object.keys(patch) as Array<keyof T>) {
      const v = patch[k];
      if (v !== null && v !== undefined) target[k] = v as any;
    }
    return target;
  };
  const hasAnyReal = (
    patch: Record<string, number | null | undefined> | null | undefined,
  ): boolean => {
    if (!patch) return false;
    for (const v of Object.values(patch)) if (v !== null && v !== undefined) return true;
    return false;
  };
  // GET /live-events?sport=soccer already returns only live events — no
  // separate `live` boolean field exists on each event to filter by.
  const events = await getPulseScoreFootballLive();
  // API-Football (api-sports.io) — real match events (goals w/ scorer name,
  // cards, subs, VAR when one occurs). One request per tick covers every
  // live fixture worldwide (see apiFootball.ts's own caching), so fetching
  // it once here and reusing the same batch for every match below costs
  // nothing extra as more matches get tracked. Empty array (not an error)
  // when API_FOOTBALL_KEY isn't configured — every use below degrades to
  // "no extra data available" rather than breaking football's own live feed.
  const apiFootballFixtures = await getApiFootballLiveFixtures();
  const ranked: Array<{ state: LiveMatchState; prio: number }> = [];
  const currentIds = new Set<string>();
  for (const ev of events) {
    // Defense in depth, same reasoning as the prematch builder just below —
    // ?sport=soccer scopes this REST endpoint, but PulseScore's own
    // sport-tag scoping has now proven unreliable on multiple endpoints
    // (tennis WS, this endpoint's prematch counterpart). Cheap to check.
    if (ev.sport !== "soccer") continue;
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    if (isVirtualFootballLeague(ev.league || "")) continue;
    if (!isAllowedFootballLeague(ev.league || "")) continue;

    const leagueName = ev.league || "";
    const isIntl = isIntlTournamentName(leagueName);
    const countryKey = countryForPulseScoreFootballEvent(ev);
    // Curated competition catalog — same allow-list/priority table the old
    // Statpal pipeline used (already tuned for BET62: which countries are
    // shown, first-division-only countries, etc.). A league PulseScore sends
    // that isn't in our table at all (countryKey null) is hidden rather than
    // shown as generic "Internacional" — PulseScore does no catalog
    // filtering of its own, so without this every obscure/regional league it
    // happens to carry would show up in Ao Vivo.
    if (
      !isIntl &&
      !(countryKey && footballLeagueAllowedStrict(countryKey, leagueName))
    )
      continue;
    const country = countryKey ?? "Internacional";
    if (isPulseScoreEventFinished(ev)) {
      const idDone = `pulsescore-football-${ev.eventId}`;
      currentIds.add(idDone);
      const existing = liveMatchState.get(idDone);
      if (existing) {
        try { await finalizeStaleLiveMatch(existing); } catch (err) {
          logger.error({ err, id: idDone }, "[pulsescore] football immediate finalize failed");
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }
    const prioKey = countryKey ? `${countryKey}: ${leagueName}` : leagueName;
    const prio = leaguePriority(prioKey, countryKey ?? undefined);
    const tier = footballMarketTier(leagueName, country);

    // Extract directly from `ev` — this loop is iterating PulseScore's own
    // event list, so the override we want IS `ev`, not some other event that
    // fuzzy-matches its team names. findPulseScoreFootballOverride() (an
    // O(n) fuzzy Levenshtein scan per call) exists for cross-provider lookups
    // (a Statpal/SportsAPI match hunting for its PulseScore counterpart) —
    // using it here turned this loop O(n²) (up to ~20k fuzzy string
    // comparisons for 200 live matches, redone every 1-2s broadcast tick),
    // which was blocking the event loop long enough to freeze the live page
    // and stall odds-market requests.
    const override = extractFootballOverride(ev);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    const rawMarkets: AdvancedMarkets = { ...baseMarkets };
    // Real PulseScore prices override the synthetic model WHERE THEY ACTUALLY
    // PRICED. assignNonNull ignores null slots (individual selections inactivated by bwin mid-2H
    // or canonical-tag flip events) instead of overwriting good Poisson defaults with null,
    // which previously produced "--" / empty rows when 1 selection went dark.
    if (override?.totalGoals) {
      assignNonNull(rawMarkets.totalGoals, override.totalGoals);
    }
    if (override?.doubleChance) {
      assignNonNull(rawMarkets.doubleChance, override.doubleChance);
    }
    if (override?.bothTeamsScore) {
      Object.assign(rawMarkets.bothTeamsScore, override.bothTeamsScore);
    }
    if (override?.firstGoal) {
      assignNonNull(rawMarkets.firstGoal, override.firstGoal);
    }
    if (override?.anytimeGoalscorer) {
      rawMarkets.anytimeGoalscorer = override.anytimeGoalscorer;
    }
    if (override?.firstGoalscorer) {
      rawMarkets.firstGoalscorer = override.firstGoalscorer;
    }
    if (override?.lastGoalscorer) {
      rawMarkets.lastGoalscorer = override.lastGoalscorer;
    }
    if (override?.drawNoBet) {
      assignNonNull(rawMarkets.drawNoBet, override.drawNoBet);
    }
    if (override?.secondHalf) {
      assignNonNull(rawMarkets.secondHalf, override.secondHalf);
    }
    if (override?.goalOddEven) {
      Object.assign(rawMarkets.goalOddEven, override.goalOddEven);
    }
    if (override?.cleanSheet) {
      assignNonNull(rawMarkets.cleanSheet, override.cleanSheet);
    }
    if (override?.correctScore) {
      Object.assign(rawMarkets.correctScore ??= {}, override.correctScore);
    }
    if (override?.teamGoals) {
      rawMarkets.teamGoals = { ...rawMarkets.teamGoals, ...override.teamGoals };
    }
    if (override?.btts1H) {
      Object.assign(rawMarkets.btts1H, override.btts1H);
    }
    if (override?.exactGoals) {
      Object.assign(rawMarkets.exactGoals, override.exactGoals);
    }
    if (override?.corners) {
      Object.assign(rawMarkets.corners, override.corners);
    }
    if (override?.cards) {
      Object.assign(rawMarkets.cards, override.cards);
    }
    if (override?.htft) {
      Object.assign(rawMarkets.htft, override.htft);
    }
    const id = `pulsescore-football-${ev.eventId}`;
    const existing = liveMatchState.get(id);
    // Same "don't regenerate from a default, keep the last known real value"
    // protection already applied to odds above — pulseScoreEventScore(ev)
    // returns null whenever ev.score is transiently missing/malformed for a
    // single poll tick (plausible exactly at the moment a goal is being
    // confirmed upstream, when PulseScore's own state is also mid-update).
    // Falling back to a hard 0 here (as this used to) meant a single glitchy
    // tick made the score visibly flash back to 0-0 AND made goalScored
    // below fire a false positive (homeScore/awayScore momentarily != the
    // real existing score) — resetting the goal-suspension window for no
    // real goal, then firing AGAIN when the score corrected itself next
    // tick. Reported in production as a match repeatedly flashing
    // "suspended" and its odds disappearing/reappearing around a goal
    // instead of one clean ~20s suspension. Falling back to the existing
    // score instead means a genuinely missing reading just holds steady.
    const score = pulseScoreEventScore(ev);
    const homeScore = score?.home ?? existing?.homeScore ?? 0;
    const awayScore = score?.away ?? existing?.awayScore ?? 0;

    // API-Football cross-reference — tolerant team-name match against
    // whatever fixtures came back this tick (empty array, hence null here,
    // whenever API_FOOTBALL_KEY isn't configured or that fetch failed; every
    // use below already treats null as "no extra data" and falls back to
    // PulseScore-only behavior, same as before this integration existed).
    // League + approximate kickoff time passed as extra disambiguation
    // signals (2026-08-12, user-requested: matching on team names alone
    // occasionally collides when a fuzzy name match satisfies more than one
    // live fixture) — ev.league is PulseScore's own bare league name for
    // this event; approxKickoffMs is derived with the best available signal
    // in priority order:
    //
    //   1. ev.startTime (ISO string, present when bwin leaks the prematch
    //      startTime into a live event or the event arrived from a path
    //      that actually includes it — matches.ts handles this with a
    //      defensive opt-in cast, PulseScoreEvent's type doesn't formally
    //      declare it because the upstream docs don't list it).
    //   2. ev.moreInfo.updatedAtUTC (seconds, a real-world proxy that
    //      drifts but is still a better anchor than a pure computed value
    //      when a match is in its very first minutes and the elapsed
    //      time is near zero so "now - 0" collapses every fresh match into
    //      the exact same window).
    //   3. Date.now() - minute * 60000 fallback as before, used only when
    //      the two stronger anchors are missing.
    const approxFromElapsed = Date.now() - pulseScoreEventMinute(ev) * 60_000;
    const startTimeIso =
      (ev as PulseScoreEvent & { startTime?: string }).startTime || null;
    const updatedAtSec =
      (ev.moreInfo?.updatedAtUTC as number | undefined) &&
      Number.isFinite(ev.moreInfo.updatedAtUTC as number)
        ? (ev.moreInfo.updatedAtUTC as number)
        : null;
    const approxKickoffMs = startTimeIso
      ? (Number.isFinite(Date.parse(startTimeIso)) ? Date.parse(startTimeIso) : approxFromElapsed)
      : updatedAtSec !== null
        ? updatedAtSec * 1000 - pulseScoreEventMinute(ev) * 60_000
        : approxFromElapsed;
    // Persistent remembered fixtureId (DB table api_football_fixture_mappings,
    // cross-session, survives process restart — see apiFootballFixtureMappings.ts
    // header for rationale). Tried BEFORE the in-memory LiveMatchState field
    // because the DB table is the "ground truth" that outlives any individual
    // process instance; in-memory field stays as a per-process performance
    // anchor for the common case where this same instance saw the match before.
    const persistentFixtureId = getMappedApiFootballFixtureId(id);
    const rememberedFixtureId =
      persistentFixtureId !== null ? persistentFixtureId : existing?._apiFootballFixtureId;
    let apiFixture =
      (rememberedFixtureId !== undefined
        ? apiFootballFixtures.find((f) => f.fixtureId === rememberedFixtureId)
        : undefined) ??
      findApiFootballFixture(home, away, apiFootballFixtures, {
        league: ev.league,
        approxKickoffMs,
      });
    // Cross-validation gate before trusting a NEW (first-time for this
    // process) apiFixture enough to persist its id in the DB for future
    // restarts. Scoring-rule agreement (the most obvious, most failure-
    // resistant cross-check we have — PulseScore's score text field AND the
    // API-Football goals.home/away numbers both describe the same real
    // match). Two non-null values that DISAGREE on either side means the
    // fixture mapping is almost certainly wrong; in that case discard the
    // match as if it wasn't found (falls back to PulseScore-only behavior,
    // which doesn't enrich but also can't mis-attribute a rival's goals/
    // cards to this match). Persistent DB write (recordConfirmedFixtureMapping)
    // only happens AFTER 3 ticks in a row with ALIGNED scores (or when
    // existing?._apiFootballEverMatched already reached "once trusted,
    // trusted forever" — the DB write is the same threshold so a process
    // restart doesn't make us re-run the confidence check from scratch).
    let tickAlignment = existing?._apiFootballScoreAlignTicks ?? 0;
    if (apiFixture) {
      const psHome = Number(score?.home ?? null);
      const psAway = Number(score?.away ?? null);
      const afHome = typeof apiFixture.goalsHome === "number" ? apiFixture.goalsHome : null;
      const afAway = typeof apiFixture.goalsAway === "number" ? apiFixture.goalsAway : null;
      const scoreAligns =
        psHome === null || afHome === null || psHome === afHome ?
          (psAway === null || afAway === null || psAway === afAway) :
          false;
      if (scoreAligns) {
        tickAlignment += 1;
      } else {
        // Clear mismatch — throw away fixture, don't re-count a mismatched tick
        logger.warn(
          {
            id,
            home, away,
            pulseScore: { home: psHome, away: psAway },
            apiFootball: { home: afHome, away: afAway, fixtureId: apiFixture.fixtureId },
          },
          "[api-football] score mismatch — discarding candidate fixture (did not reach 3 consecutive aligned ticks)",
        );
        apiFixture = null;
        tickAlignment = 0;
      }
    }
    const canPersistFixture =
      !!apiFixture && tickAlignment >= 3 && !persistentFixtureId;
    if (canPersistFixture) {
      recordConfirmedFixtureMapping({
        pulsescoreMatchId: id,
        pulsescoreEventId: ev.eventId,
        apiFootballFixtureId: apiFixture!.fixtureId,
        homeTeam: home,
        awayTeam: away,
        league: ev.league || null,
        kickoffMs: Number.isFinite(approxKickoffMs) ? approxKickoffMs : null,
      });
      recordConfirmedTeamMapping(home, apiFixture!.home.id, apiFixture!.home.name);
      recordConfirmedTeamMapping(away, apiFixture!.away.id, apiFixture!.away.name);
    }
    // Originally a TEMPORARY diagnostic (2026-08-09) for a user report that
    // goal/VAR/card/penalty enrichment "still wasn't coming through
    // correctly" — need to know WHY apiFixture stays unmatched for a given
    // match: a team-name mismatch between PulseScore/bwin and API-Football,
    // or API-Football simply not covering that particular league live.
    // Kept, and now also persisted to api_football_name_mismatches (not
    // just logged) so the Pré-Jogo Agent (lib/aiAgents/roles/preMatch.ts)
    // can tell a one-off/league-not-covered miss apart from a pair that
    // keeps failing across restarts and is actually worth fixing in
    // teamNamesMatch. Still only once per match id per process (not every
    // ~1-2s tick), only when API-Football's own live batch came back
    // non-empty (rules out "key missing"/"fetch failed this tick" as the
    // cause) but this specific match — one bet365/bwin has real priced
    // odds for, i.e. one that actually matters — wasn't in it.
    if (!apiFixture && apiFootballFixtures.length > 0 && override?.odds && !_apiFootballMissLogged.has(id)) {
      _apiFootballMissLogged.add(id);
      const candidateNames = apiFootballFixtures.map((f) => `${f.home.name} v ${f.away.name}`);
      logger.warn(
        {
          id,
          home,
          away,
          league: ev.league,
          apiFootballFixtureCount: apiFootballFixtures.length,
          apiFootballTeamNames: candidateNames,
        },
        "[DIAG apifootball-miss] no API-Football fixture matched this PulseScore match — check team-name spelling above against apiFootballTeamNames",
      );
      db.insert(apiFootballNameMismatchesTable)
        .values({ matchId: id, homeTeam: home, awayTeam: away, league: ev.league || null, apiFootballCandidateNames: candidateNames })
        .onConflictDoUpdate({
          target: apiFootballNameMismatchesTable.matchId,
          set: {
            occurrenceCount: sql`${apiFootballNameMismatchesTable.occurrenceCount} + 1`,
            lastSeenAt: new Date(),
            apiFootballCandidateNames: candidateNames,
          },
        })
        .catch((err) => logger.warn({ err, id }, "[api-football] failed to persist name mismatch"));
    }
    // Team-search fallback for when this match's live fixture wasn't found
    // above (name-matching miss, or API-Football just doesn't carry this
    // particular match live) — getApiFootballTeamLogo has its own 7-day
    // per-team cache, so this is a real network call only the first time
    // either team is seen, same reasoning as the prematch batch resolver.
    const homeLogoUrl = apiFixture?.home.logo ?? (await getApiFootballTeamLogo(home)) ?? undefined;
    const awayLogoUrl = apiFixture?.away.logo ?? (await getApiFootballTeamLogo(away)) ?? undefined;
    // Per-fixture request (unlike the single apiFootballFixtures fetch
    // above) — cheap here because getApiFootballFixtureStatistics caches
    // per fixtureId with its own 30s TTL, so this only actually hits the
    // network once per match per 30s regardless of how often this tick
    // runs. Null (not fetched at all) whenever there's no matched fixture,
    // rather than guessing at a stale one.
    const apiFootballStats = apiFixture
      ? await getApiFootballFixtureStatistics(apiFixture.fixtureId)
      : null;
    // Counts, not booleans — fixtureHasRedCard/fixtureHasVarReview would stay
    // true for the rest of the match after a single occurrence (the events
    // array only grows), so comparing against the PREVIOUS tick's count is
    // what actually detects a NEW red card/VAR review this tick rather than
    // re-suspending forever after the first one. Counted directly here
    // (not via fixtureHasRedCard, a plain boolean) since the count itself is
    // what needs to persist tick-to-tick.
    const redCardEvents = apiFixture
      ? apiFixture.events.filter((e) => e.type === "Card" && e.detail.toLowerCase().includes("red card"))
      : [];
    // Bug report 2026-08-11: "revisão VAR aparecendo aleatoriamente" — the
    // VAR banner was re-triggering repeatedly for the SAME already-shown
    // review. Root cause: unlike redCardsHome/Away just below (which
    // correctly fall back to the last known count when apiFixture briefly
    // fails to cross-reference this tick — a real, common occurrence, see
    // findApiFootballFixture's own "skip on ambiguity" comment and the
    // apifootball-usage admin diagnostic built for this same investigation),
    // varEventCount used to hard-reset to 0 on every unmatched tick and get
    // written straight back to _apiFootballVarEventCount. The very next tick
    // that matched again and correctly reported the real (nonzero) count
    // then read as "count WENT UP from 0" — a false "new VAR review" every
    // time the cross-reference merely flickered, not just when a review
    // actually happened. Same fix as redCardsHome/Away: hold the last known
    // count instead of zeroing it.
    const varEventCount = apiFixture
      ? apiFixture.events.filter((e) => e.type.toLowerCase() === "var").length
      : (existing?._apiFootballVarEventCount ?? 0);
    const redCardsHome = apiFixture
      ? redCardEvents.filter((e) => e.teamId === apiFixture.home.id).length
      : (existing?.redCardsHome ?? 0);
    const redCardsAway = apiFixture
      ? redCardEvents.filter((e) => e.teamId === apiFixture.away.id).length
      : (existing?.redCardsAway ?? 0);
    const prevRedCardTotal = (existing?.redCardsHome ?? 0) + (existing?.redCardsAway ?? 0);
    const prevVarEventCount = existing?._apiFootballVarEventCount ?? 0;
    // wasEverMatchedBefore: see _apiFootballEverMatched's own comment on the
    // LiveMatchState type for the bug this guards against (a fixture's
    // pre-existing incident count read as "new" on its first-ever match).
    const wasEverMatchedBefore = !!existing?._apiFootballEverMatched;
    const newRedCard =
      apiFixture && wasEverMatchedBefore && redCardsHome + redCardsAway > prevRedCardTotal;
    const newVarReview =
      apiFixture && wasEverMatchedBefore && varEventCount > prevVarEventCount;
    // Penalty (scored OR missed) — see fixturePenaltyEvents's own comment for
    // why a missed one needed its own trigger (goalScored never covers it).
    // Same hold-last-known-count fix as varEventCount above — this had the
    // identical reset-to-zero-on-unmatched-tick bug (only its length is used
    // below, never the events themselves, so a plain count is enough here).
    const penaltyEventCount = apiFixture
      ? fixturePenaltyEvents(apiFixture).length
      : (existing?._apiFootballPenaltyEventCount ?? 0);
    const prevPenaltyEventCount = existing?._apiFootballPenaltyEventCount ?? 0;
    const newPenaltyEvent =
      apiFixture && wasEverMatchedBefore && penaltyEventCount > prevPenaltyEventCount;
    // Real match events (goals/cards/subs, and VAR if present) for the live
    // event timeline — LiveMatchState.events already existed with this exact
    // shape (see its own comment) but had no data source until now.
    const apiFootballEvents: LiveMatchState["events"] = apiFixture
      ? apiFixture.events.map((e) => ({
          type: e.type,
          team: e.teamId === apiFixture.home.id ? home : away,
          minute: e.minute,
          player: e.playerName ?? "",
          detail: e.detail,
        }))
      : [];

    // Feeds the frontend's existing clockSec-based MM:SS ticking clock
    // (getFootballClockLabel/getDisplayMinute in home.tsx) — already built
    // for other live sources, just never wired up for PulseScore football,
    // which only ever supplied the coarse whole-minute `minute` field above.
    // TS (seconds-within-the-minute) sits right next to TM in PulseScore's
    // own moreInfo and was simply never read until now.
    //
    // clockAtMs is the anchor the frontend extrapolates client-side seconds
    // forward from (Date.now() - clockAtMs) — it must only move when
    // clockSec itself actually changes. Stamping Date.now() here
    // unconditionally on every ~1s tick (regardless of whether PulseScore
    // sent a fresh TM/TS reading) reset that anchor constantly, which
    // silently defeats the whole extrapolation: whenever PulseScore's own
    // clock for a given match updates slower than our poll, the frontend's
    // "how long since we last confirmed this" math was always ~0, so it
    // never extrapolated forward and the display just sat on the stale
    // value, drifting further behind the longer PulseScore's own reading
    // stayed stuck.
    //
    // Computed here (before filterLiveMarkets below), not just at the end
    // where the rest of `state` is built — filterLiveMarkets has its own
    // dead-until-now status-based logic (settle 1st-half markets at HT) that
    // needs the REAL status, not the hardcoded "LIVE" it used to get passed,
    // which meant that logic could never fire even once wired up.
    // Pre-existing user report ("relógio salta valores estranhos" — the
    // clock jumping to weird values, distinct from the sparse-update
    // staleness class of bug the comment below already covers): bwin's raw
    // per-tick TM/TS-or-matchClock reading has no protection against a
    // single glitchy tick reporting a wrong value — e.g. a brief mix-up
    // with a stale/incorrect period reading — and unlike homeScore/
    // awayScore just above (guarded against ever regressing), clockSec had
    // no such floor at all. A jump FORWARD is always legitimate here (see
    // the Vicenza v Catania case below — a real checkpoint feed can and
    // does leap whole minutes ahead in one tick), but a jump BACKWARD
    // within the same tracked match can never be: a live match clock does
    // not run in reverse. Discarding a backward reading and holding the
    // last known-good value instead — same "advance-only" rule already
    // applied to score in this same builder — turns a corrupted one-tick
    // glitch into a brief (sub-second, corrects on the very next real
    // reading) hold instead of a visible jump to a wrong number.
    const rawClockSec = pulseScoreEventClockSec(ev);
    const prevClockSec = existing?._liveExtra?.clockSec;
    const clockSec =
      prevClockSec !== undefined && rawClockSec < prevClockSec
        ? prevClockSec
        : rawClockSec;
    const clockAtMs =
      prevClockSec === clockSec && existing?._liveExtra?.clockAtMs
        ? existing._liveExtra.clockAtMs
        : Date.now();
    // Stale-reading guard: confirmed in production (2026-08-08, Vicenza v
    // Catania, a lower-coverage Coppa Italia preliminary-round match) that
    // PulseScore doesn't refresh TM/TS continuously for every match — this
    // one sat at exactly 45:00 for many minutes (well past any real
    // halftime) and then jumped straight to 90:00 with nothing in between,
    // meaning that match only gets occasional checkpoint snapshots, not a
    // real per-second feed. clockRunning was hardcoded true regardless, so
    // the frontend spent that whole gap extrapolating forward from a
    // reading that was never actually advancing, hit its own +3min safety
    // cap, and displayed a frozen wrong number that looked like a stuck
    // clock. clockAtMs only moves when clockSec changes (above), so "how
    // long has this exact value been sitting" is just Date.now() -
    // clockAtMs — no extra state to track. Generic on purpose (any stuck
    // value, not just 45:00/90:00): well-covered matches update every ~1-2s
    // so this practically never fires for them, while lower-coverage
    // matches can freeze at any point, not only the half/full-time marks.
    const isClockStale = Date.now() - clockAtMs > 20_000;
    // "HT"/"FT" are claimed for the two freeze points that are actually
    // meaningful to label — sitting elsewhere just holds the last known
    // minute (clockRunning: false below) without guessing a phase.
    //
    // A ±60s tolerance around 45:00 (not an exact clockSec === 2700 match)
    // is required here: a real production reading (2026-08-08, eventId
    // 199102620) froze at 45:01 — one second off the exact mark — and an
    // exact-match check silently missed it, leaving the match labeled
    // "LIVE" with a clock that just stopped advancing instead of "HT".
    // Real in-play readings pass through this ±60s window in a couple of
    // ticks (well-covered matches update every ~1-2s), so widening it this
    // much still can't misfire on a genuinely advancing clock — only a
    // reading that's actually stuck for the full 20s (isClockStale) lands
    // here at all.
    const HALFTIME_MARK_SEC = 45 * 60;
    const FULLTIME_MARK_SEC = 90 * 60;
    const FREEZE_TOLERANCE_SEC = 60;
    const isHalftimeFreeze =
      isClockStale && Math.abs(clockSec - HALFTIME_MARK_SEC) <= FREEZE_TOLERANCE_SEC;
    // Same reasoning applied to the OTHER freeze point PulseScore's own
    // production incident described (that same match "jumped straight to
    // 90:00" next): a match whose clock is stuck anywhere from 89:00 onward
    // has, in practice, ended — real stoppage time varies (a match can
    // legitimately finish at 90:00, 93:47, or later), so this is a
    // lower-bound check (>=), not another ±60s window, deliberately wide
    // enough to also catch a match that got stuck mid-stoppage-time rather
    // than exactly on the whistle.
    // pulseScoreEventClockFinished(ev) short-circuits this for bwin events:
    // its matchClock.period reports "Finished" directly and immediately
    // (confirmed real, 2026-08-08), no need to wait out the 20s staleness
    // window below — that heuristic stays as the only signal for bet365
    // events (no matchClock) and as a safety net for any other terminal
    // bwin period value this hasn't seen yet.
    const bwinHeuristicFulltimeFreeze =
      pulseScoreEventClockFinished(ev) ||
      (isClockStale &&
        !isHalftimeFreeze &&
        clockSec >= FULLTIME_MARK_SEC - FREEZE_TOLERANCE_SEC);
    // API-Football cross-reference for extra time / penalties (bug report
    // 2026-08-11: "prorrogação não está a entrar" — a knockout match tied
    // after 90' never transitioned into extra time at all). The bwin-clock
    // heuristic above has no concept of extra time — bwin's own
    // matchClock.period has never been confirmed to report anything besides
    // "2H"/"Finished" (see client.ts's PulseScoreEvent.matchClock comment)
    // — and a tied knockout match's clock genuinely DOES freeze around
    // 90:00 for the real few-minute break before extra time kicks off,
    // which is exactly what the clock-stale branch above was built to
    // detect as "match over". Left unchecked, that fired (and immediately
    // settled + deleted the match — see the finalize block below) during
    // that pre-ET break, before extra time ever had a chance to start.
    // API-Football's fixture status codes are a documented, stable contract
    // (1H/HT/2H/ET/BT/P/FT/AET/PEN/...) that DOES distinguish extra time
    // and penalties from a genuine finish — when a fixture is cross-
    // referenced (apiFixture, the same one already used for VAR/red-card/
    // stats above), it's authoritative over the bwin-only heuristic for
    // this decision: never let a stuck bwin clock finalize a match
    // API-Football itself still reports as live in any form, extra time or
    // penalties included. Only when there's NO cross-reference at all does
    // this fall back to the bwin-only heuristic, same residual risk (no
    // better signal available) the disappearance-based GC loop below
    // already exists to catch eventually.
    const API_FOOTBALL_FINISHED_STATUSES = new Set([
      "FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO",
    ]);
    const API_FOOTBALL_ET_STATUSES = new Set(["ET", "BT", "P"]);
    const apiFootballConfirmsFinished =
      !!apiFixture && API_FOOTBALL_FINISHED_STATUSES.has(apiFixture.statusShort);
    const apiFootballConfirmsEt =
      !!apiFixture && API_FOOTBALL_ET_STATUSES.has(apiFixture.statusShort);
    const apiFootballConfirmsPen = !!apiFixture && apiFixture.statusShort === "P";
    const isFulltimeFreeze = apiFixture
      ? apiFootballConfirmsFinished
      : bwinHeuristicFulltimeFreeze;
    const liveStatus = isHalftimeFreeze
      ? "HT"
      : apiFootballConfirmsEt
        ? "ET"
        : isFulltimeFreeze
          ? "FT"
          : "LIVE";
    // Half-time score, captured the moment HT is first confirmed and carried
    // forward unchanged for the rest of the match — settlement.ts's
    // liveDefinitiveOutcomeForSel() already knows how to settle ht-home/
    // ht-away/ht-draw, 1H BTTS, and HT/FT combo bets the instant this is
    // populated (fully pre-existing logic, provider-agnostic), but it was
    // never reachable for PulseScore football since nothing here ever set
    // it. The score at the exact tick HT is confirmed IS the HT score by
    // definition, so no separate lookup is needed.
    const htScore: [number, number] | undefined = existing?._liveExtra?.htScore
      ? existing._liveExtra.htScore
      : isHalftimeFreeze
        ? [homeScore, awayScore]
        : undefined;

    // filterLiveMarkets zeroes out (hides) any line/scoreline the current
    // score has already settled — e.g. "Over 0.5" once any goal has been
    // scored, or a correct-score entry below the actual score. Existed in
    // this file already (written for the old Statpal pipeline, per its own
    // status-string checks) but was never actually called from anywhere —
    // dead code. Real bet365 lines get the same treatment as the synthetic
    // fallback here: if bet365 itself already pulled a settled line
    // (common — it stops offering "Over 0.5" once it's guaranteed), the
    // synthetic fallback that fills the gap needs this too, or it'd show a
    // live-looking price for an already-decided outcome.
    const settledMarkets = filterLiveMarkets(rawMarkets, homeScore, awayScore, liveStatus);
    const markets = filterFootballMarketsByTier(settledMarkets, tier);
    // Populate the Prorrogação/Penáltis markets the moment API-Football
    // confirms the match is actually in that phase (apiFootballConfirmsEt/
    // Pen above) — computeFootballEtExtra/computeFootballPenExtra's own
    // header explains why nothing populated these before now.
    if (apiFootballConfirmsEt) {
      markets.etExtra = computeFootballEtExtra(home, away);
      if (apiFootballConfirmsPen) markets.penExtra = computeFootballPenExtra(home, away);
    }
    // Real sample (2026-08-08, eventId 199102620): a match that had a full
    // slate of active markets 5 minutes earlier came back with just one dead
    // market (isActive:false, odds:0 throughout) while its clock (TM/TS) sat
    // frozen at the exact same reading — PulseScore had effectively stopped
    // pricing it without it leaving the live-events list. Falling back to
    // makeOddsFromTeams() here (fully synthetic, computer-generated odds)
    // in that situation meant the site could keep taking real-money bets
    // against invented numbers for a match no bookmaker was actually
    // pricing. Now: once a match has shown real odds at least once, losing
    // them doesn't regenerate synthetic ones — the last known real odds
    // stay on screen (below) and betting gets suspended (see oddsWentDark
    // below) until PulseScore prices it again or the match leaves the live
    // list. Only a match that has NEVER had real odds (still bootstrapping
    // right after it appeared) gets the synthetic starting price.
    // PER-SLOT real-odds merge: odds are no longer all-or-nothing. Each
    // individual side (home/draw/away) cascades through 3 donors in order:
    //   1. fresh PulseScore real price THIS TICK (if non-null)
    //   2. last-known real price carried in existing.odds (if the match once had real odds)
    //   3. Poisson synthetic baseline as final guaranteed fallback — NEVER null.
    // This eliminates "--" rows from matches where bwin inactivates just the
    // already-winning side in 2H (common when a match is effectively decided),
    // while still preferring real prices everywhere they actually exist.
    const poissonOdds = makeOddsFromTeams(home, away);
    const hasRealOddsNow = hasAnyReal(override?.odds);
    const odds = {
      home: (override?.odds?.home as number | undefined) ??
        (existing?.hasRealOdds ? (existing.odds.home as number | undefined) : undefined) ??
        poissonOdds.home,
      draw: (override?.odds?.draw as number | undefined) ??
        (existing?.hasRealOdds ? (existing.odds.draw as number | undefined) : undefined) ??
        poissonOdds.draw,
      away: (override?.odds?.away as number | undefined) ??
        (existing?.hasRealOdds ? (existing.odds.away as number | undefined) : undefined) ??
        poissonOdds.away,
    };
    // Same 3-donor cascade for the slot-based markets that can carry partial
    // data (doubleChance / firstGoal / drawNoBet / secondHalf / cleanSheet).
    // If no real data exists anywhere we just leave the Poisson-merged value
    // already computed into rawMarkets above — nothing to override.
    if (existing?.hasRealOdds || hasRealOddsNow) {
      const dc = rawMarkets.doubleChance;
      if (dc) {
        dc.homeOrDraw =
          (override?.doubleChance?.homeOrDraw as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.doubleChance?.homeOrDraw as number | undefined) : undefined) ??
          dc.homeOrDraw;
        dc.awayOrDraw =
          (override?.doubleChance?.awayOrDraw as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.doubleChance?.awayOrDraw as number | undefined) : undefined) ??
          dc.awayOrDraw;
        dc.homeOrAway =
          (override?.doubleChance?.homeOrAway as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.doubleChance?.homeOrAway as number | undefined) : undefined) ??
          dc.homeOrAway;
      }
      const fg = rawMarkets.firstGoal;
      if (fg) {
        fg.home =
          (override?.firstGoal?.home as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.firstGoal?.home as number | undefined) : undefined) ??
          fg.home;
        fg.noGoal =
          (override?.firstGoal?.noGoal as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.firstGoal?.noGoal as number | undefined) : undefined) ??
          fg.noGoal;
        fg.away =
          (override?.firstGoal?.away as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.firstGoal?.away as number | undefined) : undefined) ??
          fg.away;
      }
      const dnb = rawMarkets.drawNoBet;
      if (dnb) {
        dnb.home =
          (override?.drawNoBet?.home as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.drawNoBet?.home as number | undefined) : undefined) ??
          dnb.home;
        dnb.away =
          (override?.drawNoBet?.away as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.drawNoBet?.away as number | undefined) : undefined) ??
          dnb.away;
      }
      const sh = rawMarkets.secondHalf;
      if (sh) {
        sh.home =
          (override?.secondHalf?.home as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.secondHalf?.home as number | undefined) : undefined) ??
          sh.home;
        sh.draw =
          (override?.secondHalf?.draw as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.secondHalf?.draw as number | undefined) : undefined) ??
          sh.draw;
        sh.away =
          (override?.secondHalf?.away as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.secondHalf?.away as number | undefined) : undefined) ??
          sh.away;
      }
      const cs = rawMarkets.cleanSheet;
      if (cs) {
        cs.home =
          (override?.cleanSheet?.home as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.cleanSheet?.home as number | undefined) : undefined) ??
          cs.home;
        cs.away =
          (override?.cleanSheet?.away as number | undefined) ??
          (existing?.hasRealOdds ? (existing.markets.cleanSheet?.away as number | undefined) : undefined) ??
          cs.away;
      }
    }

    // Goal-based market suspension — same trigger condition and delay table
    // the (now-dead) Statpal football builder used (FOOTBALL_SUSP_KEYS /
    // footballSuspensionDelayMs, both provider-agnostic). PulseScore gives us
    // no VAR/red-card signal, so only the goal trigger is covered here —
    // narrower than before, but still closes the main window where a stale
    // price could be backed right after a goal.
    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension ? { ...existing.marketSuspension } : undefined;
    if (marketSuspension) {
      const active = Object.fromEntries(
        Object.entries(marketSuspension).filter(([, ts]) => ts > Date.now()),
      );
      marketSuspension = Object.keys(active).length > 0 ? active : undefined;
    }
    let suspensionReason = marketSuspension ? existing?._suspensionReason : undefined;
    const goalScored =
      !!existing &&
      (homeScore !== existing.homeScore || awayScore !== existing.awayScore);
    if (goalScored) {
      const now = Date.now();
      marketSuspension = Object.fromEntries(
        FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("goal", k)]),
      );
      // Enriched with the scorer's name (and "DE PÊNALTI" when the last goal
      // event's own detail says so) when API-Football has already picked up
      // the goal event by this same tick (its own ~12s cache can lag a
      // PulseScore score change by a few seconds) — falls back to the plain
      // "GOLO!" banner PulseScore-only matches already had otherwise.
      const scorer = apiFixture ? latestGoalScorer(apiFixture) : null;
      const isPenaltyGoal = apiFixture ? latestGoalIsPenalty(apiFixture) : false;
      const goalLabel = isPenaltyGoal ? "GOLO DE PÊNALTI!" : "GOLO!";
      suspensionReason = scorer ? `${goalLabel} ${scorer}` : goalLabel;
      // TEMPORARY diagnostic (remove once answered): does bet365's own feed
      // flip a market's/selection's isActive to false when IT suspends for
      // this goal, independent of our own synthetic delay-based suspension
      // above? If so, mirroring that per-market instead of guessing a fixed
      // delay would also cover VAR/penalty/card — PulseScore gives no
      // explicit event type for those, but if bet365's live suspension state
      // is visible in isActive, we don't need to know WHICH incident caused
      // it. No extra API calls — this piggybacks on the tick already in
      // flight. Logs once per goal; grep prod logs for "[DIAG goal]".
      logger.warn(
        {
          eventId: ev.eventId,
          home,
          away,
          homeScore,
          awayScore,
          // Skip player-prop markets (Goalscorer/Assists/Multi Scorers can
          // carry 50-100+ selection rows each) — not what we extract, and
          // would bloat this log for no benefit to the question being asked.
          markets: (ev.markets ?? [])
            .filter((m) => (m.selections ?? []).length <= 25)
            .map((m) => ({
              rawName: m.rawName,
              canonicalMarket: m.canonicalMarket,
              marketIsActive: m.isActive,
              selections: (m.selections ?? []).map((s) => ({
                raw: s.rawName,
                outcome: s.canonicalOutcome,
                active: s.isActive,
                odds: s.odds,
              })),
            })),
        },
        "[DIAG goal] raw PulseScore markets at moment of goal — checking whether bet365's own isActive flips on suspension",
      );
    }
    // Red-card / VAR-review / missed-penalty suspension — closes the gap
    // PulseScore alone can't (see apiFootball.ts's header): it has no signal
    // for any of these, only the goal-based score-diff trigger above (which
    // itself never fires for a MISSED penalty, since the score doesn't
    // change — that's what newPenaltyEvent covers here). Uses the "var"
    // delay tier (20-45s, longer than a goal's 12-25s) for all three, since
    // none has its own tier in footballSuspensionDelayMs and each plausibly
    // involves a longer real-world stoppage than a routine goal
    // confirmation. Does NOT overwrite a goal suspension that just fired
    // this same tick (checked via `!goalScored`) — the goal trigger already
    // suspends everything for its own window, and API-Football's events
    // array often lists the goal and a related card together, which would
    // otherwise downgrade a fresh "GOLO!" reason to a less specific one on
    // the very tick it's set. A SCORED penalty also never reaches this
    // branch — goalScored is already true for it, handled above instead.
    if (!goalScored && (newRedCard || newVarReview || newPenaltyEvent)) {
      const now = Date.now();
      marketSuspension = Object.fromEntries(
        FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("var", k)]),
      );
      suspensionReason = newVarReview ? "VAR" : newRedCard ? "CARTÃO VERMELHO" : "PÊNALTI PERDIDO";
    }
    // Odds-unavailable suspension — separate from the goal trigger above
    // (which already suspends everything for its own delay window and takes
    // priority when both happen on the same tick). Re-applied fresh every
    // tick this condition holds, so it stays suspended for as long as
    // PulseScore keeps not pricing this match, and clears itself within a
    // few seconds of real odds coming back (nothing renews it once
    // hasRealOddsNow is true again). See the odds computation above for the
    // production incident this covers.
    const oddsWentDark = !hasRealOddsNow && !!existing?.hasRealOdds;
    if (oddsWentDark && !goalScored) {
      const now = Date.now();
      marketSuspension = Object.fromEntries(
        FOOTBALL_SUSP_KEYS.map((k) => [k, now + 5_000]),
      );
      suspensionReason = "ODDS INDISPONÍVEIS";
    }

    // Hold the goal suspension open until API-Football actually confirms
    // the goal — not just until the fixed delay above elapses. Reported in
    // production (2026-08-10): the suspension/GOLO banner would disappear
    // and then reappear moments later for the same goal. Root cause —
    // API-Football's own cache is ~12s (LIVE_TTL_MS, apiFootball.ts), and
    // the "result" market's own goal-suspension delay is ALSO 12s
    // (REOPEN_DELAY_GOAL_LOW) — so the fixed timer regularly expired before
    // API-Football's fixture had even caught up to PulseScore's score. Once
    // it finally did catch up, it often carried a routine automatic VAR
    // check alongside the goal (standard even for goals that stand, not a
    // sign of anything under review) — newVarReview above saw that as a
    // brand new incident and re-suspended under a different label ("VAR")
    // seconds after the goal's own suspension had already cleared, reading
    // to the user as the suspension flickering off then back on.
    // goalUnconfirmedByApiFootball is true exactly while API-Football's own
    // recorded goal tally hasn't reached PulseScore's yet — for as long as
    // that holds, keep refreshing the suspension under the goal's own
    // reason instead of letting it lapse or relabeling to "VAR" for what's
    // really the same goal's aftermath. A match with no API-Football
    // coverage at all (apiFixture null) has no confirmation signal to wait
    // for, so it's untouched — pure timer-based behavior, same as before.
    const apiFootballGoalTotal = apiFixture
      ? (apiFixture.goalsHome ?? 0) + (apiFixture.goalsAway ?? 0)
      : null;
    const goalUnconfirmedByApiFootball =
      apiFootballGoalTotal !== null && apiFootballGoalTotal < homeScore + awayScore;
    // Hard cap on how long the hold can keep re-arming itself (audit finding,
    // 2026-08-10): apiFootball.ts's getApiFootballLiveFixtures serves the
    // last successful cache on any upstream failure, so if API-Football has
    // an outage after already caching a pre-goal snapshot, apiFootballGoalTotal
    // freezes below the real score and this hold would otherwise re-suspend
    // every tick for the rest of the match — a bettor unable to touch this
    // match's main markets at all. 90s is generously above any real
    // confirmation lag seen (API-Football's own cache is ~12s), so tripping
    // this means confirmation has genuinely stalled, not just a slow tick.
    const GOAL_HOLD_MAX_MS = 90_000;
    let goalHoldSince = existing?._goalHoldSince;
    // Skip the hold entirely when a genuinely NEW, independent incident
    // (red card / VAR review / missed penalty) fired THIS tick — audit
    // finding, 2026-08-10: without this guard, the hold ran unconditionally
    // whenever an earlier goal was still unconfirmed and stomped that fresh
    // incident's "VAR"/"CARTÃO VERMELHO" reason and longer var-tier window
    // straight back down to "GOLO!" on the shorter goal-tier window, even
    // though the two incidents are unrelated. Doesn't affect the original
    // flicker fix this hold exists for (a routine VAR check bundled with the
    // SAME goal's own confirmation) — that case turns
    // goalUnconfirmedByApiFootball false on the very tick the VAR event
    // shows up, so the hold was never going to fire on that tick anyway.
    const newIndependentIncident = newRedCard || newVarReview || newPenaltyEvent;
    if (goalUnconfirmedByApiFootball && !newIndependentIncident) {
      const now = Date.now();
      if (!goalHoldSince) goalHoldSince = now;
      if (now - goalHoldSince < GOAL_HOLD_MAX_MS) {
        marketSuspension = Object.fromEntries(
          FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("goal", k)]),
        );
        if (!suspensionReason || !suspensionReason.startsWith("GOLO")) {
          suspensionReason = existing?._suspensionReason?.startsWith("GOLO")
            ? existing._suspensionReason
            : "GOLO!";
        }
      }
      // else: cap tripped — stop re-arming, let whatever's already in
      // marketSuspension expire normally so the market reopens instead of
      // staying locked for the rest of the match.
    } else {
      goalHoldSince = undefined;
    }

    // PulseScore only ever gives us team NAMES (no id field anywhere in its
    // schema — confirmed against a real event dump). Resolve a real crest
    // via SportsAPI Pro's /search endpoint, cached and fire-and-forget
    // (see sportsApiTeamLookup.ts) so this never blocks the ~1s live tick:
    // the first tick for a new match has no logo, a later tick picks it up
    // once the background lookup resolves.
    resolveTeamIdInBackground("football", home);
    resolveTeamIdInBackground("football", away);
    const homeTeamId = getCachedTeamId("football", home) ?? undefined;
    const awayTeamId = getCachedTeamId("football", away) ?? undefined;

    const state: LiveMatchState = {
      id,
      home,
      away,
      homeTeamId,
      awayTeamId,
      homeLogoUrl,
      awayLogoUrl,
      league: normalizeBrazilLeagueDisplayName(ev.league || "Futebol", countryKey),
      country,
      sport: "football",
      homeScore,
      awayScore,
      // During extra time bwin's own clock has never been confirmed to keep
      // advancing past 90' (see the ET-detection comment above) — prefer
      // API-Football's `elapsed` whenever it reads further along than
      // bwin's, same "never regress a monotonic value, prefer whichever
      // reading is more advanced" rule this codebase already applies to
      // WS/REST merges elsewhere (footballWs.ts et al.), so a frozen bwin
      // reading can't hold the displayed minute back once API-Football
      // confirms play has moved on. Also floored against existing.minute
      // (not just the two live readings against each other) — same
      // backward-glitch protection as clockSec above, since a corrupted
      // one-tick bwin reading could otherwise pull the displayed minute
      // backward even with apiFixture.elapsed in the mix.
      minute: Math.max(
        pulseScoreEventMinute(ev),
        apiFixture?.elapsed ?? 0,
        existing?.minute ?? 0,
      ),
      status: liveStatus,
      hasRealOdds: hasRealOddsNow,
      odds,
      markets,
      matchTier: tier,
      events: apiFootballEvents,
      redCardsHome,
      redCardsAway,
      matchStats: apiFootballStats
        ? {
            shotsTotalHome: apiFootballStats.home?.shotsTotal ?? null,
            shotsTotalAway: apiFootballStats.away?.shotsTotal ?? null,
            shotsOnTargetHome: apiFootballStats.home?.shotsOnTarget ?? null,
            shotsOnTargetAway: apiFootballStats.away?.shotsOnTarget ?? null,
            possessionHome: apiFootballStats.home?.possessionPct ?? null,
            possessionAway: apiFootballStats.away?.possessionPct ?? null,
            cornersHome: apiFootballStats.home?.corners ?? null,
            cornersAway: apiFootballStats.away?.corners ?? null,
            foulsHome: apiFootballStats.home?.fouls ?? null,
            foulsAway: apiFootballStats.away?.fouls ?? null,
          }
        : undefined,
      _apiFootballVarEventCount: varEventCount,
      _apiFootballPenaltyEventCount: penaltyEventCount,
      _apiFootballEverMatched: wasEverMatchedBefore || !!apiFixture,
      _apiFootballFixtureId: apiFixture?.fixtureId ?? rememberedFixtureId,
      _apiFootballScoreAlignTicks: tickAlignment,
      marketSuspension,
      _suspensionReason: suspensionReason,
      _goalHoldSince: goalHoldSince,
      // clockRunning gates whether the frontend extrapolates this clock
      // forward client-side between server updates (see getFootballClockLabel/
      // getDisplayMinute in home.tsx). This used to be tied to isClockStale
      // alone (>20s since PulseScore's own TM/TS reading last changed) — but
      // PulseScore routinely goes well past 20s between real updates even for
      // ordinary in-play matches (that's the whole reason the frontend
      // extrapolates locally in the first place, capped at its own +180s
      // safety net). Gating on isClockStale meant the clock froze solid every
      // time PulseScore's own feed paused for more than 20s, then jumped
      // straight to whatever the next real reading was — reported as the
      // clock going "0 → freeze → jump to 45 → HT → 45 → freeze → jump to
      // 90" instead of visibly ticking second by second. The clock should
      // only actually stop where the match itself stops: half-time and
      // full-time, both already detected above.
      _liveExtra: {
        clockSec,
        clockAtMs,
        clockRunning: !isHalftimeFreeze && !isFulltimeFreeze,
        htScore,
        // Feeds the existing "Força"/v2-statistics stat-bar UI (built for
        // Statpal, never previously fed for PulseScore-sourced matches) —
        // same _liveExtra.*Home/Away fields that pipeline already reads.
        ...(apiFootballStats
          ? {
              possessionHome: apiFootballStats.home?.possessionPct ?? undefined,
              possessionAway: apiFootballStats.away?.possessionPct ?? undefined,
              shotsTotalHome: apiFootballStats.home?.shotsTotal ?? undefined,
              shotsTotalAway: apiFootballStats.away?.shotsTotal ?? undefined,
              shotsOnTargetHome: apiFootballStats.home?.shotsOnTarget ?? undefined,
              shotsOnTargetAway: apiFootballStats.away?.shotsOnTarget ?? undefined,
              foulsHome: apiFootballStats.home?.fouls ?? undefined,
              foulsAway: apiFootballStats.away?.fouls ?? undefined,
              cornersHome: apiFootballStats.home?.corners ?? undefined,
              cornersAway: apiFootballStats.away?.corners ?? undefined,
              cornersTotal: (apiFootballStats.home?.corners ?? 0) + (apiFootballStats.away?.corners ?? 0),
              offsidesHome: apiFootballStats.home?.offsides ?? undefined,
              offsidesAway: apiFootballStats.away?.offsides ?? undefined,
              yellowCardsHome: apiFootballStats.home?.yellowCards ?? undefined,
              yellowCardsAway: apiFootballStats.away?.yellowCards ?? undefined,
              cardsTotal:
                (apiFootballStats.home?.yellowCards ?? 0) +
                (apiFootballStats.away?.yellowCards ?? 0) +
                redCardsHome +
                redCardsAway,
              redCardsHomeCount: redCardsHome,
              redCardsAwayCount: redCardsAway,
            }
          : {}),
      },
    };
    // Leave "Ao Vivo" the instant FT is detected, instead of sitting there
    // with a frozen "FT" badge until PulseScore stops returning the event
    // AND the long disappear-grace-period (130-180 min, see the GC loop
    // below) elapses — user-reported 2026-08-09: finished matches lingered
    // in the live section far too long. isFulltimeFreeze is trustworthy
    // enough to freeze the display on already (see its own comment above —
    // bwin's matchClock.period "Finished" is immediate and confirmed real,
    // and now also gated behind API-Football's own status whenever a
    // fixture is cross-referenced, so a stuck bwin clock alone can no
    // longer finalize a match that's actually in extra time or penalties —
    // see this function's ET-detection comment further up), so it's
    // trustworthy enough to finalize on too. Guarded on
    // finishedMatchResults so a match PulseScore keeps reporting as
    // "Finished" for several more ticks after the first one only finalizes
    // (and enqueues settlement) ONCE, not on every tick it's still present.
    if (isFulltimeFreeze) {
      if (!finishedMatchResults.has(id)) {
        try {
          await finalizeStaleLiveMatch(state);
        } catch (err) {
          logger.error({ err, id }, "[pulsescore] football finalizeStaleLiveMatch (FT) failed");
        }
      }
      liveMatchState.delete(id);
      continue;
    }
    currentIds.add(id);
    // liveMatchState is what settlement.ts (in-play resolution + cash-out
    // suspension) and ensureFinishedMatchResult read from — this loop used to
    // only return `result` without ever writing here, which meant no
    // football bet placed since the PulseScore switch could ever be
    // auto-settled (nothing marked matches as finished) or suspended after a
    // goal. Mirrors the same liveMatchState.set() every other sport's live
    // builder already does.
    liveMatchState.set(id, state);
    ranked.push({ state, prio });
  }

  // Garbage-collect: a match that was live and then disappears from
  // PulseScore's feed is treated as finished after a grace period, same
  // disappearance-based pattern already used by the Statpal live pipelines
  // (finalizeStaleLiveMatch + getFootballLiveDisappearGraceMs, reused as-is —
  // both are sport-agnostic and only need the LiveMatchState shape, not a
  // specific provider). This is what actually triggers settlement
  // (enqueueMatchSettlement, called inside finalizeStaleLiveMatch) for
  // PulseScore-sourced football matches once they end.
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("pulsescore-football-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (Date.now() - missingSince > getFootballLiveDisappearGraceMs(state)) {
      // buildLivePayload() awaits this whole function — an uncaught failure
      // here would freeze live odds for every sport, not just football,
      // until the next tick (or, without the global unhandledRejection
      // guard added in api/index.ts, crash the process entirely). Deletes
      // either way, same as before this try/catch existed.
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error(
          { err, id },
          "[pulsescore] football finalizeStaleLiveMatch failed",
        );
      }
      liveMatchState.delete(id);
    }
  }

  // Big leagues first — same priority ranking (DOMESTIC_PRIORITY /
  // INTL_TOURNAMENTS) the catalog filter and market-tier calc above already
  // use, so display order agrees with market depth/stake headroom.
  ranked.sort((a, b) => a.prio - b.prio);
  return ranked.map((r) => r.state);
}

/**
 * Football live, sourced from SportMonks (getSportMonksFootballLive) —
 * replacing PulseScore/bwin's live pipeline the same way
 * buildFootballUpcomingFromSportMonks already replaced its prematch one.
 *
 * The PulseScore+API-Football version above needs its elaborate
 * cross-referencing (fuzzy team-name matching, a persisted fixture-id
 * mapping, confidence-tick gating, a goal-confirmation hold with a hard
 * cap...) because PulseScore's own odds feed carries NO signal at all for
 * red cards/VAR/missed penalties — that whole apparatus exists purely to
 * infer "something happened" from a SEPARATE provider (API-Football) and
 * approximate a suspension window with fixed timers. SportMonks needs none
 * of it: the SAME fixture object carries odds, real events (goals/cards/
 * subs — confirmed real developer_names GOAL/OWNGOAL/SUBSTITUTION/
 * YELLOWCARD/REDCARD), state, and score together, and every odd already
 * carries its OWN live `suspended` flag straight from the bookmaker — a
 * direct signal, not an inferred one. Suspension here is driven by three
 * real, independent triggers instead: a new goal (score increased since
 * the last tick), a new red card (REDCARD event count increased), or the
 * bookmaker itself marking the main result market suspended. All three
 * reuse the SAME footballSuspensionDelayMs/FOOTBALL_SUSP_KEYS tiering the
 * PulseScore builder already uses, so both providers suspend for
 * comparable windows.
 *
 * VAR: SportMonks' own events did carry a REDCARD type (confirmed real,
 * 2026-08-29) but no VAR-review type occurred in the sample checked — so
 * unlike the PulseScore+API-Football version, there is no VAR-specific
 * trigger here yet. Not a silent gap: a VAR review typically also produces
 * either a goal (reviewed and given) or nothing at all (reviewed and
 * waved away with no score change) — the former already triggers the goal
 * suspension above; the latter is the one real case this doesn't yet
 * cover, pending a confirmed real sample of that event type.
 */
async function buildFootballLiveFromSportMonks(): Promise<LiveMatchState[]> {
  const fixtures = await getSportMonksFootballLive();
  const ranked: Array<{ state: LiveMatchState; prio: number }> = [];
  const currentIds = new Set<string>();

  for (const fx of fixtures) {
    if (isSportMonksFixtureFinished(fx)) {
      const idDone = `sportmonks-football-${fx.id}`;
      currentIds.add(idDone);
      const existingDone = liveMatchState.get(idDone);
      if (existingDone) {
        try {
          await finalizeStaleLiveMatch(existingDone);
        } catch (err) {
          logger.error(
            { err, id: idDone },
            "[sportmonks] football finalize on FT failed",
          );
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }
    if (!isSportMonksFixtureLive(fx)) continue; // NS or an unconfirmed/unknown state

    const homeP = fx.participants?.find((p) => p.meta?.location === "home");
    const awayP = fx.participants?.find((p) => p.meta?.location === "away");
    if (!homeP || !awayP) continue;
    const home = stripGenderTeamSuffix(homeP.name);
    const away = stripGenderTeamSuffix(awayP.name);
    if (!home || !away) continue;

    const score = getSportMonksFixtureScore(fx);
    if (!score) continue; // no CURRENT score row yet — nothing safe to show

    const id = `sportmonks-football-${fx.id}`;
    currentIds.add(id);
    const existing = liveMatchState.get(id);

    const leagueName = fx.league?.name || "";
    const countryName = fx.league?.country?.name || "";
    const isIntl = isIntlTournamentName(leagueName);
    const countryKey = countryName ? countryName.toLowerCase() : null;
    const country = countryName || "Internacional";
    const prioKey = countryKey ? `${countryKey}: ${leagueName}` : leagueName;
    const prio = leaguePriority(prioKey, countryKey ?? undefined);
    const tier = footballMarketTier(leagueName, country);

    const override = extractSportMonksFootballOverride(fx);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    const markets: AdvancedMarkets = applySportMonksFootballOverride(
      { ...baseMarkets },
      baseMarkets,
      override,
    );
    const baseOdds = makeOddsFromTeams(home, away);
    const odds = { ...baseOdds, ...nonNullPatch(override.odds) };
    const hasRealOddsNow = !!override.odds;

    const redCardsHome = countSportMonksRedCards(fx, "home");
    const redCardsAway = countSportMonksRedCards(fx, "away");
    const newGoal =
      !!existing && (score.home > existing.homeScore || score.away > existing.awayScore);
    const newRedCard =
      !!existing &&
      redCardsHome + redCardsAway > (existing.redCardsHome ?? 0) + (existing.redCardsAway ?? 0);
    const resultOdds = (fx.odds ?? []).filter(
      (o) => o.market?.developer_name === "FULLTIME_RESULT" && o.bookmaker_id === 35,
    );
    const bookmakerSuspended =
      resultOdds.length > 0 && resultOdds.every((o) => o.suspended);

    let marketSuspension = existing?.marketSuspension;
    let suspensionReason = existing?._suspensionReason;
    if (newGoal) {
      const now = Date.now();
      marketSuspension = Object.fromEntries(
        FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("goal", k)]),
      );
      suspensionReason = "GOLO!";
    } else if (newRedCard) {
      const now = Date.now();
      marketSuspension = Object.fromEntries(
        FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("var", k)]),
      );
      suspensionReason = "CARTÃO VERMELHO";
    } else if (bookmakerSuspended) {
      const now = Date.now();
      marketSuspension = Object.fromEntries(FOOTBALL_SUSP_KEYS.map((k) => [k, now + 5_000]));
      suspensionReason = "SUSPENSO PELA CASA";
    }

    const events: LiveMatchState["events"] = (fx.events ?? [])
      .filter((e) => isFootballLiveDisplayEvent(e.type?.developer_name))
      .map((e) => {
        const participant = fx.participants?.find((p) => p.id === e.participant_id);
        return {
          type: e.type.name,
          team: participant?.id === homeP.id ? home : away,
          minute: e.minute,
          player: e.player_name ?? "",
          detail: e.info ?? e.addition ?? undefined,
        };
      });

    // Real corners/cards stats (CORNERS/YELLOWCARDS statistics + confirmed
    // REDCARD events) — kept in _liveExtra the same way every other sport's
    // live stats are, so finalizeStaleLiveMatch can copy the final tick's
    // totals into the finished-match record settlement.ts reads
    // extra.cornersTotal/cardsTotal from (see getSportMonksFixtureCornersCards's
    // own comment: null, not 0, until SportMonks actually reports a stat).
    const cornersCards = getSportMonksFixtureCornersCards(fx);

    ranked.push({
      prio,
      state: {
        id,
        home,
        away,
        homeLogoUrl: homeP.image_path,
        awayLogoUrl: awayP.image_path,
        league: leagueName,
        country,
        sport: "football",
        matchTier: tier,
        homeScore: score.home,
        awayScore: score.away,
        minute: getSportMonksFixtureMinute(fx),
        status: fx.state?.developer_name ?? "",
        hasRealOdds: hasRealOddsNow,
        odds,
        markets,
        events,
        redCardsHome,
        redCardsAway,
        marketSuspension,
        _suspensionReason: suspensionReason,
        _liveExtra: {
          ...(existing?._liveExtra ?? {}),
          ...(cornersCards.cornersTotal != null ? { cornersTotal: cornersCards.cornersTotal } : {}),
          ...(cornersCards.cornersHome != null ? { cornersHome: cornersCards.cornersHome } : {}),
          ...(cornersCards.cornersAway != null ? { cornersAway: cornersCards.cornersAway } : {}),
          ...(cornersCards.cardsTotal != null ? { cardsTotal: cornersCards.cardsTotal } : {}),
          ...(cornersCards.yellowCardsHome != null
            ? { yellowCardsHome: cornersCards.yellowCardsHome }
            : {}),
          ...(cornersCards.yellowCardsAway != null
            ? { yellowCardsAway: cornersCards.yellowCardsAway }
            : {}),
          redCardsHomeCount: redCardsHome,
          redCardsAwayCount: redCardsAway,
        },
      },
    });
  }

  // GC: a match that stops appearing in the live feed at all (network hiccup
  // aside — LIVE_TTL_MS's own stale-cache fallback already covers that)
  // without ever showing state FT — same disappearance-grace pattern the
  // PulseScore builder above uses, as a safety net for whatever real state
  // this hasn't seen confirmed yet (postponed, abandoned, ...).
  const now = Date.now();
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("sportmonks-football-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? now;
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (now - missingSince > 60_000) {
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error({ err, id }, "[sportmonks] football finalizeStaleLiveMatch failed");
      }
      liveMatchState.delete(id);
    }
  }

  ranked.sort((a, b) => a.prio - b.prio);
  for (const r of ranked) liveMatchState.set(r.state.id, r.state);
  return ranked.map((r) => r.state);
}

// Shortened from 3 minutes (2026-08-09, user request: finished matches
// should leave "Ao Vivo" immediately, for every sport, not just football).
// Football gets a real, immediate "Finished" signal from bwin's
// matchClock.period (see isFulltimeFreeze in buildFootballLiveFromPulseScore)
// and finalizes the instant that fires. Tennis has no equivalent — bet365
// (tennis's bookmaker since the 2026-08-09 revert) carries no matchClock at
// all, and homeSetsWon/awaySetsWon reaching a "match over" count can't be
// trusted as that signal either: it would require knowing whether THIS match
// is best-of-3 or best-of-5 (Grand Slam men's/Davis Cup), which isn't
// present anywhere in the real samples seen this session — guessing best-
// of-3 would cut a live best-of-5 match at 2 sets to 1, incorrectly
// declaring it finished (and settling bets) while it's still being played,
// a worse failure mode than lingering. So this stays disappearance-based —
// only shortened, not replaced. 15s still tolerates ~10 missed poll cycles
// (TENNIS_LIVE_TTL_MS is 1.5s) before treating a real gap as finished, so a
// single transient API hiccup still can't cause a flicker.
const TENNIS_DISAPPEAR_GRACE_MS = 15_000;
// Bug report 2026-08-12 (recurrence of the exact incident TENNIS_DISAPPEAR_
// GRACE_MS's own 15s value was tuned against — see this file's stickyLiveTtlMs
// comment for "ticket BT62-000074": a real, still-in-progress match went
// quiet on bet365's feed and got voided): a bettor placed a leg on
// Hiromi Abe v Katarina Kujovic at real odds (1.04), the match was mid
// 2nd set (1 set already completed, 0-1) — genuinely being played, not
// abandoned — and it was voided within roughly 15 seconds of one gap in
// bet365's feed. finalizeStaleLiveMatch's own tennis-specific
// looksLikeNeverTracked check (routes/matches.ts) is deliberately
// conservative about calling a match "finished" (needs a winner with 2+
// sets, per this function's header above) — but it has ONLY that one
// signal once disappearance triggers it at all, so a match that's simply
// mid-way through set 2 (1 set won, 0 by the other side — exactly this
// case) always reads as "looks never tracked" the instant 15s of silence
// elapses, indistinguishable from a match that genuinely never started.
// 15s is a reasonable bar for REMOVING a clearly-finished match from Ao
// Vivo quickly (this constant's original 2026-08-09 goal), but far too
// short a bar for VOIDING REAL MONEY on a match that's merely between
// polls on a sparsely-covered feed — those are different decisions with
// very different acceptable error costs, and this file has repeated,
// explicit evidence (Vicenza v Catania; this exact BT62-000074 class)
// that bet365/bwin/PulseScore's coverage gaps for lower-tier matches can
// run far longer than 15s. Split into two grace windows: a match that
// hasn't yet reached ANY legitimate finishing signal (no side has won 2+
// sets — the exact ambiguous state a coverage gap and a genuine early
// end both produce) gets this much longer window before finalizing,
// giving a sparse feed real time to resume; a match that already shows a
// clear winner keeps the original fast 15s removal.
const TENNIS_AMBIGUOUS_DISAPPEAR_GRACE_MS = 6 * 60_000;
// Bug report 2026-08-12: "M15 Trier" (Chazal 6-3/6-3 over Mathes — a clear
// 2-0 finish) stayed in Ao Vivo, still bettable at 1.01, because bet365 kept
// reporting the event as live on every tick. Nothing above helps there — the
// disappearance-based finalize loop only ever fires once a match STOPS being
// reported at all, and this one never did. TENNIS_DISAPPEAR_GRACE_MS's own
// header explains why sets-won was never trusted as a same-tick finish
// signal on its own: 2 sets to 0/1 means "over" in best-of-3 but only
// "one set from over" in best-of-5 (Grand Slam men's singles, Davis Cup),
// and nothing in the live event carried that distinction. The league name
// does, though, for the two real best-of-5 contexts that exist — matching
// against those lets the overwhelming majority (every ITF/Challenger/WTA/
// ATP-non-Slam match, which is what M15/M25/W15/W35-tier events like this
// one always are) be finalized the instant a side reaches 2 sets, without
// waiting for the feed to go quiet at all. Grand Slam-named leagues
// (women's included, since gender isn't reliably distinguishable from the
// league string either) stay on the conservative disappearance path.
const TENNIS_BEST_OF_FIVE_LEAGUE_PATTERNS = [
  "australian open",
  "roland garros",
  "french open",
  "wimbledon",
  "us open",
  "davis cup",
];
function isTennisBestOfFiveLeague(leagueName: string): boolean {
  const lower = (leagueName || "").toLowerCase();
  return TENNIS_BEST_OF_FIVE_LEAGUE_PATTERNS.some((p) => lower.includes(p));
}

async function buildTennisLiveFromPulseScore(): Promise<LiveMatchState[]> {
  const events = await getPulseScoreTennisLive();
  const result: LiveMatchState[] = [];
  const currentIds = new Set<string>();
  for (const ev of events) {
   try {
    // Second layer of defense against sport-tag contamination (see
    // tennisWs.ts's applyFrame for the full story — the WS connection is
    // shared/multiplexed and has leaked football/esoccer/ebasketball
    // events tagged with the wrong or missing sport). Checking here too,
    // not just at the WS layer, means this loop is safe regardless of
    // whether a bad event slipped in via WS or REST.
    if (ev.sport !== "tennis") continue;
    // hasDrawMarket catches the remaining case the exact-tag check above
    // can't see: an event mistagged "tennis" already at the source (seen
    // 2026-08-08 — a football match with ev.sport === "tennis" verbatim,
    // rendered with tennis's set-score format and two-way odds instead of
    // 1X2). No real tennis match ever has a draw market.
    if (hasDrawMarket(ev)) {
      logger.warn(
        { eventId: ev.eventId, home: ev.home, away: ev.away, league: ev.league },
        "[pulsescore] tennis live event has a draw market — skipping as mistagged non-tennis contamination",
      );
      continue;
    }
    // looksLikeTennisLeague catches contamination hasDrawMarket can't see —
    // sports with no draw outcome of their own (seen 2026-08-08: an MLB
    // baseball match leaked through this same socket). Confirms the league
    // name actually matches a known tennis tour naming convention instead
    // of trying to exclude every other sport one at a time.
    if (!looksLikeTennisLeague(ev.league)) {
      logger.warn(
        { eventId: ev.eventId, home: ev.home, away: ev.away, league: ev.league },
        "[pulsescore] tennis live event's league doesn't match a known tennis tour naming pattern — skipping as likely non-tennis contamination",
      );
      continue;
    }
    const home = stripGenderTeamSuffix(ev.home);
    const away = stripGenderTeamSuffix(ev.away);
    if (!home || !away) continue;
    if (isPulseScoreEventFinished(ev)) {
      const idDone = `pulsescore-tennis-${ev.eventId}`;
      currentIds.add(idDone);
      const existing = liveMatchState.get(idDone);
      if (existing) {
        try { await finalizeStaleLiveMatch(existing); } catch (err) {
          logger.error({ err, id: idDone }, "[pulsescore] tennis immediate finalize failed");
        }
        liveMatchState.delete(idDone);
      }
      continue;
    }
    const override = extractTennisOverride(ev);
    const baseOdds = makeTennisBaseOdds(home, away);
    const sets = override.sets.length > 0 ? override.sets : [[0, 0] as [number, number]];
    // Without a real per-match price, every live tennis match previously
    // fell back to the same flat neutral 1.85/1.85 baseOdds regardless of
    // who's actually ahead — both buttons showing an identical price reads
    // as a bug. Now driven by the real set/point/serve data above; real
    // provider price ("To Win" market) is still used outright when active.
    const liveOddsState = computeTennisLiveOdds(
      baseOdds,
      sets,
      override.homeSetsWon,
      override.awaySetsWon,
      override.currentPoints,
      override.serving,
      override.odds,
    );
    const odds = liveOddsState.odds;
    // Deliberately NOT computing tennisExtra here (computeLiveTennisExtras
    // is a heavy, many-step probability model) — this function reruns for
    // EVERY live tennis match on EVERY 1s broadcast tick
    // (LIVE_UPDATE_INTERVAL), so with 15-30+ concurrent tennis matches that
    // was 15-30+ full recomputations a second, server-side, plus a much
    // bigger JSON payload pushed to every connected client every second —
    // the real cause of the live page freezing after today's earlier fix.
    // makeAdvancedMarketsFromTeams alone already satisfies the actual
    // requirement (a fully-shaped AdvancedMarkets so the modal's generic
    // m.handicap.homeMinusOne-style unguarded reads never crash); the
    // tennis-specific market groups (set handicap, game handicap, etc.)
    // fall back to their existing "not available" state instead of populating
    // for now — computeLiveTennisExtras is computed on demand instead, only
    // for the single match a user opens (see GET /live-match/:id below).
    const markets: AdvancedMarkets = makeAdvancedMarketsFromTeams(home, away);
    const id = `pulsescore-tennis-${ev.eventId}`;
    const existing = liveMatchState.get(id);

    // Set-win market suspension, gated on hasRealOdds only (audit finding,
    // 2026-08-10): when a real bet365 "To Win" price is active, it has the
    // same stale-price-after-a-big-event risk as any other bookmaker feed.
    // When it's NOT active, odds instead come from computeTennisLiveOdds — a
    // model recomputed from the score on every tick, so there's no separate
    // feed to go stale relative to; suspending there would only block
    // betting with no real financial-safety benefit. Triggered on a set
    // changing hands (the biggest single win-probability swing), not every
    // point/game, for the same reason volleyball's trigger is set-level.
    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension ? { ...existing.marketSuspension } : undefined;
    if (marketSuspension) {
      const active = Object.fromEntries(
        Object.entries(marketSuspension).filter(([, ts]) => ts > Date.now()),
      );
      marketSuspension = Object.keys(active).length > 0 ? active : undefined;
    }
    let suspensionReason = marketSuspension ? existing?._suspensionReason : undefined;
    const setWon =
      liveOddsState.hasRealOdds &&
      !!existing &&
      (override.homeSetsWon !== existing.homeScore || override.awaySetsWon !== existing.awayScore);
    if (setWon) {
      const now = Date.now();
      marketSuspension = { result: now + 10_000 };
      suspensionReason = "FIM DE SET!";
    }

    const state: LiveMatchState = {
      id,
      home,
      away,
      league: ev.league || "Ténis",
      country: "Internacional",
      sport: "tennis",
      homeScore: override.homeSetsWon,
      awayScore: override.awaySetsWon,
      minute: 0,
      status: tennisSetLabel(Math.max(1, sets.length)),
      hasRealOdds: liveOddsState.hasRealOdds,
      odds,
      markets,
      events: [],
      marketSuspension,
      _suspensionReason: suspensionReason,
      _liveExtra: {
        sets,
        ...(override.currentPoints ? { currentPoints: override.currentPoints } : {}),
        ...(override.serving ? { serving: override.serving } : {}),
        // Cheap field lookups (no probability model) — safe every tick,
        // unlike computeLiveTennisExtras. See extractTennisLiveExtra's
        // header comment for exactly which markets this covers.
        realExtra: extractTennisLiveExtra(ev),
      },
    };
    // Immediate same-tick finish check (see TENNIS_BEST_OF_FIVE_LEAGUE_
    // PATTERNS's header) — a decisive 2-set lead in a league that isn't a
    // known best-of-5 context means the match is over right now, even
    // though the provider is still reporting it as live. Finalize and drop
    // it here instead of publishing one more live tick and waiting for the
    // disappearance loop below to eventually catch it.
    const decisiveSetLead =
      override.homeSetsWon !== override.awaySetsWon &&
      Math.max(override.homeSetsWon, override.awaySetsWon) >= 2;
    if (decisiveSetLead && !isTennisBestOfFiveLeague(ev.league || "")) {
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error(
          { err, id },
          "[pulsescore] tennis immediate-finish finalizeStaleLiveMatch failed",
        );
      }
      liveMatchState.delete(id);
      continue;
    }
    currentIds.add(id);
    // Same liveMatchState wiring football needed from the start — settlement
    // (ensureFinishedMatchResult / in-play resolution) and cash-out both
    // read this map, and it's the ONLY thing that makes a match "exist" for
    // those purposes now that nothing else populates it for tennis.
    liveMatchState.set(id, state);
    result.push(state);
   } catch (err) {
    // computeLiveTennisExtras (and everything feeding it) is a large,
    // arithmetic-heavy model that a single real live event with an
    // edge-case shape it doesn't expect must never be allowed to throw out
    // of this loop: since buildLivePayload() awaits every sport's builder
    // in the same call, an uncaught error here previously broke the ENTIRE
    // live feed (every sport, not just tennis) for as long as that one
    // match stayed live. Skip just this event and keep going.
    logger.error(
      { err, eventId: ev.eventId, home: ev.home, away: ev.away },
      "[pulsescore] tennis live event failed to process — skipped",
    );
   }
  }

  // Same disappearance+grace-period finalization football uses — a fixed
  // grace window here instead of football's league-priority-based one,
  // since tennis has no equivalent tiering table.
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("pulsescore-tennis-")) continue;
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    // See TENNIS_AMBIGUOUS_DISAPPEAR_GRACE_MS's own comment: only a match
    // that's already reached a real finishing signal (someone has won 2+
    // sets) gets the fast 15s grace: it's SAFE to be quick there, no
    // ambiguity left to protect against. A match still short of that gets
    // the much longer window before this loop is trusted to void it —
    // this is the ONLY thing standing between a sparse-coverage gap and a
    // real-money bet getting wrongly voided, so it errs toward patience.
    const setsWonSoFar = [state.homeScore, state.awayScore];
    const hasLegitimateFinishSignal =
      setsWonSoFar[0] !== setsWonSoFar[1] && Math.max(...setsWonSoFar) >= 2;
    const graceMs = hasLegitimateFinishSignal
      ? TENNIS_DISAPPEAR_GRACE_MS
      : TENNIS_AMBIGUOUS_DISAPPEAR_GRACE_MS;
    if (Date.now() - missingSince > graceMs) {
      // Same reasoning as the per-event try/catch above: this awaits
      // DB/settlement writes, and buildLivePayload() awaits this whole
      // function — an uncaught failure here (not just a bad live event)
      // would just as easily freeze every sport's odds, not only tennis's.
      // Deletes either way (same as before this try/catch existed) — a
      // record that fails once here isn't retried forever, since the
      // underlying cause is almost always something about that specific
      // match's data, not a transient one.
      try {
        await finalizeStaleLiveMatch(state);
      } catch (err) {
        logger.error(
          { err, id },
          "[pulsescore] tennis finalizeStaleLiveMatch failed",
        );
      }
      liveMatchState.delete(id);
    }
  }

  return result;
}

// Shared payload builder — used by both /live HTTP route and SSE broadcast
async function buildLivePayload(): Promise<{ matches: LiveMatchState[] }> {
  const now = Date.now();
  // Warm the upcoming cache in the background — never block the live path.
  // On cold start the cache is empty; upcoming-based fallbacks simply won't fire
  // until the first background rebuild completes (~1-2 s later).
  if (
    _allUpcomingCacheBuiltAt === 0 ||
    Date.now() - _allUpcomingCacheBuiltAt > UPCOMING_CACHE_TTL_MS
  ) {
    rebuildUpcomingCache().catch(() => {});
  }
  const allUpcoming = _allUpcomingCache;

  // ── Fast path: live data from in-memory WS caches (sub-ms each) ──────────
  // Statpal and SportsAPI Pro were removed from the live pipeline entirely
  // (explicit user decision, 2026-08-06) — basketball, hockey, baseball,
  // volleyball, boxing, cricket, handball, and Formula 1 all sourced their
  // live data from one or the other and now have none, until each is
  // migrated to PulseScore individually (needs a real authenticated live
  // sample per sport first — same discipline football/tennis went through,
  // not guessed). Football and tennis are unaffected, both already 100%
  // PulseScore. getTennisTodayV2() is kept — it only feeds prematch tennis
  // league labels, unrelated to live data or Statpal/SportsAPI.
  const tennisTodayEvents = await getTennisTodayV2();
  // Populate V1 tennis league label cache from V2 today events (city → "ATP 250 · City")
  if (tennisTodayEvents && tennisTodayEvents.length > 0) {
    refreshTennisV2LeagueCache(tennisTodayEvents);
  }
  // Fire-and-forget prematch odds cache warmers — unrelated to the live
  // pipeline above (these feed prematch tennis/baseball listings, which
  // weren't part of today's live-only removal), don't block the broadcast path
  getTennisOdds().catch(() => {});
  getMLBOdds().catch(() => {});
  // Apply per-sport anti-flicker: if a sport's API temporarily returns empty,
  // keep the last good data for up to SPORT_FALLBACK_TTL_MS (35s).
  //
  // buildFootballLiveFromPulseScore/buildTennisLiveFromPulseScore are each
  // wrapped in their own try/catch below — this whole function is awaited
  // as a single unit by refreshLivePayloadInBackground(), with no catch of
  // its own (see that function's header), so an uncaught exception from
  // EITHER would previously abort the entire buildLivePayload() call —
  // freezing every other sport's odds too, not just the one that actually
  // failed, since none of them would ever reach their own sportWithFallback
  // call. Catching here and falling through with an empty array lets
  // sportWithFallback do what it already does for a temporarily-empty
  // upstream response — serve the last good snapshot for just that sport —
  // while every other sport keeps updating normally.
  // ── Sports data providers still disconnected from live, except football ────
  // Explicit user decision, 2026-08-06: after repeated live-page issues,
  // every sports data provider was disconnected (Statpal, SportsAPI Pro,
  // PulseScore) and is being rebuilt from scratch, sport by sport, against
  // real confirmed API samples — starting with football (2026-08-07), whose
  // real /live-events sample matched exactly what was already implemented in
  // services/pulsescore/football.ts, so buildFootballLiveFromPulseScore below
  // is a straight re-instatement, not a rewrite. Every other sport still
  // shows zero matches in Ao Vivo until it gets the same treatment.
  let footballLiveRaw: LiveMatchState[] = [];
  try {
    footballLiveRaw = await buildFootballLiveFromSportMonks();
  } catch (err) {
    logger.error(
      { err },
      "[sportmonks] buildFootballLiveFromSportMonks failed this tick",
    );
  }
  const footballLive = sportWithFallback("football", footballLiveRaw);
  let basketballLiveRaw: LiveMatchState[] = [];
  try {
    basketballLiveRaw = await buildBasketballLiveFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildBasketballLiveFromPulseScore failed this tick",
    );
  }
  const basketballLive = sportWithFallback("basketball", basketballLiveRaw);
  let hockeyLiveRaw: LiveMatchState[] = [];
  try {
    hockeyLiveRaw = await buildHockeyLiveFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildHockeyLiveFromPulseScore failed this tick",
    );
  }
  const hockeyLive = sportWithFallback("hockey", hockeyLiveRaw);
  let baseballLiveRaw: LiveMatchState[] = [];
  try {
    baseballLiveRaw = await buildBaseballLiveFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildBaseballLiveFromPulseScore failed this tick",
    );
  }
  const baseballLive = sportWithFallback("baseball", baseballLiveRaw);
  // Re-enabled 2026-08-09 on a THIRD bookmaker ("unibetau") after bwin (no
  // score field) and bet365 (score stuck at 0-0/empty even when genuinely
  // in-play) both failed and were reverted the same day — see
  // buildVolleyballLiveFromPulseScore's own header for the confirmed real
  // sample that made this one work (genuine matchClock + per-set scores).
  let volleyballLiveRaw: LiveMatchState[] = [];
  try {
    volleyballLiveRaw = await buildVolleyballLiveFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildVolleyballLiveFromPulseScore failed this tick",
    );
  }
  const volleyballLiveItems = sportWithFallback("volleyball", volleyballLiveRaw);
  let tennisLiveRaw: LiveMatchState[] = [];
  try {
    tennisLiveRaw = await buildTennisLiveFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildTennisLiveFromPulseScore failed this tick",
    );
  }
  const tennisLive = sportWithFallback("tennis", tennisLiveRaw);
  const boxingLive: LiveMatchState[] = [];
  const cricketLive: LiveMatchState[] = [];
  const handballLive: LiveMatchState[] = [];
  const formula1Live: LiveMatchState[] = [];

  // ── Live feed order (explicit request): Futebol → Ténis → Basquete →
  // Hóquei de Gelo → Beisebol → Voleibol → Handebol → Críquete → outros
  // mergeStickyLive: re-injects any match seen in the last 5 min that the API
  // temporarily omitted. Fresh data always wins; injected matches use last-known
  // score/status so the match never disappears mid-game.
  const livePart = mergeStickyLive([
    ...footballLive,
    ...tennisLive,
    ...basketballLive,
    ...hockeyLive,
    ...baseballLive,
    ...volleyballLiveItems,
    ...handballLive,
    ...cricketLive,
    ...boxingLive,
    ...formula1Live,
  ]);

  const liveIds = new Set(livePart.map((m) => String(m.id)));
  // Deduplicate by team pair — prevents upcoming duplicating a match already in the live feed
  const liveTeamPairs = new Set(livePart.map((m) => `${m.home}|${m.away}`));
  // Tennis-only fuzzy fallback for the exact-string check above. bet365's own
  // team-name string sometimes differs between its prematch and live tennis
  // feeds (country suffix present/absent, initials vs full name — same class
  // of variance tennis.ts's own extraction already handles via
  // teamNamesMatch). Without this, a tennis match whose live-feed name
  // string doesn't exactly match its prematch string is never recognized as
  // "now live", so it keeps showing "A Iniciar" for up to 3h after kickoff
  // even though it's genuinely live — reported in production 2026-08-09.
  // Scoped to tennis only (linear scan, not folded into the Set above) to
  // avoid changing well-tested exact-match behavior for every other sport;
  // tennis rarely has more than a couple dozen concurrent live matches, so
  // this is cheap per tick.
  const liveTennisMatches = livePart.filter((m) => m.sport === "tennis");
  // Same fuzzy fallback, now also needed for volleyball (2026-08-09):
  // prematch is bwin-sourced ("Manaus Nilton Lins") but live is bet365-
  // sourced ("Nilton Lins") — bwin's the only one with a live score field
  // for basketball but NOT volleyball, so volleyball's live builder pins
  // bet365 specifically for its score field, unlike every other sport
  // where live/prematch share one bookmaker. Without this, the same exact-
  // string-only gap tennis had (fixed 2026-08-09) reappears for volleyball.
  const liveVolleyballMatches = livePart.filter((m) => m.sport === "volleyball");
  function isUpcomingAlreadyLive(m: UpcomingMatch): boolean {
    if (liveTeamPairs.has(`${m.home}|${m.away}`)) return true;
    if (m.sport === "tennis") {
      return liveTennisMatches.some(
        (lm) => teamNamesMatch(m.home, lm.home) && teamNamesMatch(m.away, lm.away),
      );
    }
    if (m.sport === "volleyball") {
      return liveVolleyballMatches.some(
        (lm) => teamNamesMatch(m.home, lm.home) && teamNamesMatch(m.away, lm.away),
      );
    }
    return false;
  }

  // Max minutes ahead a match can be to appear as "Em Breve", per sport
  const SOON_WINDOW: Record<string, number> = {
    football: 3,
    soccer: 3,   // só aparecem em "Em Breve" a ≤ 3 min do início
    basketball: 3,
    hockey: 3,
    tennis: 3,
  };
  const DEFAULT_SOON_WINDOW = 3; // ≤ 3 min antes do início para todos os desportos
  const startingSoonCandidates = allUpcoming
    .filter((m) => {
      // Tennis always has computed odds even without a real bookmaker price — allow all.
      // Other sports require real odds to avoid showing matches with no betting context.
      if (m.sport !== "tennis" && !m.hasRealOdds) return false;
      const si = matchStartsInMinutes(m.date, m.time);
      const maxSi = SOON_WINDOW[m.sport] ?? DEFAULT_SOON_WINDOW;
      return (
        isFinite(si) &&
        si >= -180 && // extended from -60: keeps matches visible for up to 3 h after kickoff
                      // so API lag can't cause them to vanish without ever going live
        si <= maxSi &&
        !liveIds.has(String(m.id)) &&
        !isUpcomingAlreadyLive(m) &&
        // A match that has EVER gone live stays in liveMatchState for up to
        // getFootballLiveDisappearGraceMs (130-180 min) after it stops
        // appearing in the live feed — well past mergeStickyLive's 5-minute
        // sticky window that backs liveIds/isUpcomingAlreadyLive above. In
        // that gap, a finished match (the overwhelmingly common reason a
        // match stops appearing in the live feed for that long) satisfied
        // every other condition here — si stayed within the 3h post-kickoff
        // window and it was no longer "live" by the checks above — so it
        // reappeared in "Em Breve" right after finishing. Reported in
        // production 2026-08-09. Any match tracked in liveMatchState has, by
        // definition, already gone live at least once and can never be
        // "still upcoming" again.
        !liveMatchState.has(String(m.id)) &&
        // Football no longer stays in liveMatchState at all once FT is
        // detected — it's deleted immediately (see isFulltimeFreeze in
        // buildFootballLiveFromPulseScore, added right after the fix above)
        // so it leaves "Ao Vivo" right away instead of lingering. That
        // silently broke the liveMatchState check just above: the instant a
        // football match finished, it vanished from liveMatchState too,
        // re-satisfying every condition here and reappearing in "Em Breve"
        // again — reported in production a second time, 2026-08-09.
        // finishedMatchResults is what finalizeStaleLiveMatch (called at the
        // moment of that same immediate deletion) writes to, and it's kept
        // for 96h (_pruneFinishedResults), long past any realistic "Em
        // Breve" window — checking it here catches exactly the match the
        // liveMatchState check above no longer can.
        !finishedMatchResults.has(String(m.id))
      );
    })
    .sort(
      (a, b) =>
        matchStartsInMinutes(a.date, a.time) -
        matchStartsInMinutes(b.date, b.time),
    )
    .slice(0, 50);

  // Both bridges below used to promote an "Em Breve" (prematch/SportsAPI-
  // sourced) candidate straight into the live section with a fabricated
  // 0-0 / "Em Jogo" / "1st set" placeholder whenever the real live feed
  // hadn't picked the match up yet — for tennis specifically, that was a
  // stand-in for PulseScore lag that no longer exists now that tennis has
  // its own real PulseScore live builder; for every other sport it was
  // fabricating a "live" match out of prematch data from a provider
  // (Statpal/SportsAPI) that's since been removed from the live pipeline
  // entirely. Removed outright (explicit user decision, 2026-08-06: only
  // PulseScore-sourced data belongs on the live page) — a match now only
  // ever appears live once PulseScore's own feed actually reports it live,
  // no fabricated bridge. promotedTennis stays declared (always empty) since
  // syncLiveCompetitionCatalog/getCompetitionCatalogDecisions below still
  // reference it structurally.
  const promotedTennis: LiveMatchState[] = [];
  const startingSoonFinal: LiveMatchState[] = [];
  for (const m of startingSoonCandidates) {
    const realStartsIn = matchStartsInMinutes(m.date, m.time);
    const startsIn = Math.max(
      0,
      Math.round(realStartsIn <= 2 ? 0 : realStartsIn),
    );
    startingSoonFinal.push({
      id: m.id,
      home: m.home,
      away: m.away,
      league: m.league,
      country: m.country,
      sport: m.sport,
      homeScore: 0,
      awayScore: 0,
      minute: 0,
      status: "Em Breve",
      hasRealOdds: m.hasRealOdds,
      odds: m.odds,
      markets: m.markets,
      events: [],
      date: m.date,
      time: m.time,
      startsIn,
      scheduledTime: m.time,
      scheduledDate: m.date,
    });
  }

  syncLiveCompetitionCatalog([
    ...livePart.map((m) => ({
      eventId: String(m.id),
      providerEventId: String(m.id),
      sport: m.sport,
      name: m.league,
      country: m.country,
      provider: "sportsapi_live",
      status: m.status,
      suspensionReason: m._suspensionReason ?? null,
    })),
    ...promotedTennis.map((m) => ({
      eventId: String(m.id),
      providerEventId: String(m.id),
      sport: m.sport,
      name: m.league,
      country: m.country,
      provider: "sportsapi_live",
      status: m.status,
      suspensionReason: m._suspensionReason ?? null,
    })),
    ...startingSoonFinal.map((m) => ({
      eventId: String(m.id),
      providerEventId: String(m.id),
      sport: m.sport,
      name: m.league,
      country: m.country,
      provider: "sportsapi_upcoming",
      status: m.status,
      suspensionReason: null,
    })),
  ]);

  const liveDecisions = await getCompetitionCatalogDecisions(
    [...livePart, ...promotedTennis].map((m) => ({
      eventId: String(m.id),
      sport: m.sport,
      league: m.league,
      country: m.country,
    })),
    "live",
  );
  const prematchDecisions = await getCompetitionCatalogDecisions(
    startingSoonFinal.map((m) => ({
      eventId: String(m.id),
      sport: m.sport,
      league: m.league,
      country: m.country,
    })),
    "prematch",
  );

  const sortByCatalogPriority = (
    matches: LiveMatchState[],
    decisions: Map<string, { priority: number | null }>,
    fallbackSort?: (a: LiveMatchState, b: LiveMatchState) => number,
  ): LiveMatchState[] => {
    return matches
      .map((match, index) => ({
        match,
        index,
        priority: decisions.get(String(match.id))?.priority ?? null,
      }))
      .sort((a, b) => {
        const aPrio = a.priority ?? 999;
        const bPrio = b.priority ?? 999;
        if (aPrio !== bPrio) return aPrio - bPrio;
        if (fallbackSort) {
          const fallback = fallbackSort(a.match, b.match);
          if (fallback !== 0) return fallback;
        }
        return a.index - b.index;
      })
      .map((entry) => entry.match);
  };

  const filteredLive = sortByCatalogPriority(
    [...livePart, ...promotedTennis].filter(
      (m) => liveDecisions.get(String(m.id))?.visible ?? true,
    ),
    liveDecisions,
  );
  const filteredPrematch = sortByCatalogPriority(
    startingSoonFinal.filter(
      (m) => prematchDecisions.get(String(m.id))?.visible ?? true,
    ),
    prematchDecisions,
    (a, b) =>
      matchStartsInMinutes(a.date ?? "", a.time ?? "") -
      matchStartsInMinutes(b.date ?? "", b.time ?? ""),
  );

  const applyOperationalDecision = (
    match: LiveMatchState,
    decision?: {
      state: string | null;
      tradingStatus: string | null;
      suspensionReason: string | null;
    },
  ): LiveMatchState => {
    if (!decision) return match;
    const mustSuspend =
      decision.state === "SUSPENDED" ||
      decision.state === "TRADING_RESTRICTED" ||
      decision.tradingStatus === "manual_suspend" ||
      decision.tradingStatus === "trading_restricted" ||
      decision.tradingStatus === "restricted";
    if (!mustSuspend) return match;
    return {
      ...match,
      marketSuspension: {
        ...(match.marketSuspension ?? {}),
        __admin__: Date.now() + 24 * 60 * 60 * 1000,
      },
      _suspensionReason: decision.suspensionReason ?? "SUSPENSO MANUALMENTE",
    };
  };

  const dedupedLive = dedupeLiveMatchesByIdentity(
    filteredLive.map((match) =>
      applyOperationalDecision(match, liveDecisions.get(String(match.id))),
    ),
  );
  const dedupedPrematch = dedupeLiveMatchesByIdentity(
    filteredPrematch.map((match) =>
      applyOperationalDecision(match, prematchDecisions.get(String(match.id))),
    ),
  ).filter(
    (prematch) =>
      !dedupedLive.some(
        (live) => liveMatchIdentityKey(live) === liveMatchIdentityKey(prematch),
      ),
  );

  const result = {
    matches: [...dedupedLive, ...dedupedPrematch],
  };
  if (result.matches.length > 0) {
    livePayloadFallbackCache = { payload: result, builtAt: Date.now() };
  }
  return result;
}

const LIVE_PAYLOAD_FALLBACK_TTL_MS = 45_000;
let livePayloadFallbackCache: {
  payload: { matches: LiveMatchState[] };
  builtAt: number;
} | null = null;
// Matches CONFIG.LIVE_UPDATE_INTERVAL (the broadcastLive() tick itself) —
// this cache used to outlive the tick that reads it (1.5s cache vs 1s tick),
// so every other broadcast could serve payload up to 500ms stale on top of
// the tick's own 1s cadence. Aligning it removes that extra lag layer.
const LIVE_PAYLOAD_CACHE_TTL_MS = 700;
let livePayloadCache: {
  payload: { matches: LiveMatchState[] };
  builtAt: number;
} | null = null;
let livePayloadInFlight: Promise<{ matches: LiveMatchState[] }> | null = null;

// Per-sport last-good-data anti-flicker caches.
// When a sport's live API returns empty (transient failure/rate-limit), use the last
// non-empty result for up to SPORT_FALLBACK_TTL_MS before showing an empty section.
const SPORT_FALLBACK_TTL_MS = 35_000;
const _lastGoodSport = new Map<
  string,
  { matches: LiveMatchState[]; savedAt: number }
>();

function sportWithFallback(
  sport: string,
  fresh: LiveMatchState[],
): LiveMatchState[] {
  const now = Date.now();
  if (fresh.length > 0) {
    _lastGoodSport.set(sport, { matches: fresh, savedAt: now });
    return fresh;
  }
  const cached = _lastGoodSport.get(sport);
  if (cached && now - cached.savedAt < SPORT_FALLBACK_TTL_MS)
    return cached.matches;
  return fresh; // genuinely empty — nothing cached or cache expired
}

// ── Per-match sticky live cache ───────────────────────────────────────────────
// Once a match enters the live feed it stays for its TTL even when the API
// temporarily omits it (API hiccup, rate-limit, V1 rotation). Score/status
// shown is the last known snapshot — better than making the match disappear
// and reappear mid-game.
const STICKY_LIVE_TTL_MS = 5 * 60_000; // 5 minutes since last seen — default
const _stickyLive = new Map<
  string,
  { match: LiveMatchState; lastSeenAt: number }
>();

// Real incident, 2026-08-11 (ticket BT62-000074): a 3-leg tennis multi got
// accepted and voided within the same minute, on 3 different obscure ITF
// matches. Root cause was this cache's flat 5-minute TTL applying to EVERY
// sport, including tennis/basketball/volleyball — whose own disappearance-
// based finish detection (TENNIS_DISAPPEAR_GRACE_MS / BASKETBALL_.../
// VOLLEYBALL_..., all 15s) considers a match that vanished from the feed
// as good as over, poor-coverage sports where "missing" essentially never
// means "temporary hiccup". With the sticky cache keeping that same vanished
// match visible and BETTABLE on the frontend for up to 5 more minutes, a bet
// could be placed on a match the backend had already started (or was about
// to start) voiding — accepted correctly (finalizeStaleLiveMatch hadn't run
// yet), then voided moments later once it did. Football is unaffected (its
// own GC grace is 130-180 MINUTES — far longer than 5 minutes, so the sticky
// cache was never the binding constraint there); this only matters for
// sports whose own grace is shorter than the default 5 minutes.
function stickyLiveTtlMs(sport: string): number {
  switch (sport) {
    case "tennis":
      return TENNIS_DISAPPEAR_GRACE_MS;
    case "basketball":
      return BASKETBALL_DISAPPEAR_GRACE_MS;
    case "volleyball":
      return VOLLEYBALL_DISAPPEAR_GRACE_MS;
    default:
      return STICKY_LIVE_TTL_MS;
  }
}

function mergeStickyLive(freshMatches: LiveMatchState[]): LiveMatchState[] {
  const now = Date.now();

  // Update sticky cache entries for every match in the fresh feed
  for (const m of freshMatches) {
    _stickyLive.set(String(m.id), { match: m, lastSeenAt: now });
  }

  // Evict expired entries — sport-specific TTL (see stickyLiveTtlMs), not a
  // single flat value, so this cache never keeps showing/allowing bets on a
  // match longer than that sport's own GC is willing to keep tracking it.
  for (const [id, entry] of _stickyLive) {
    if (now - entry.lastSeenAt > stickyLiveTtlMs(entry.match.sport ?? "")) {
      _stickyLive.delete(id);
    }
  }

  // Build lookup sets for deduplication
  const freshIds = new Set(freshMatches.map((m) => String(m.id)));
  const freshPairs = new Set(
    freshMatches.map((m) => `${m.home.toLowerCase()}|${m.away.toLowerCase()}`),
  );

  // Re-inject matches that are sticky but not in the current fresh feed
  const injected: LiveMatchState[] = [];
  for (const [id, entry] of _stickyLive) {
    if (freshIds.has(id)) continue; // already in fresh feed
    const pair = `${entry.match.home.toLowerCase()}|${entry.match.away.toLowerCase()}`;
    if (freshPairs.has(pair)) continue; // same game under different id (e.g. V1→V2 transition)
    injected.push(entry.match);
  }

  return [...freshMatches, ...injected];
}

function normalizeMatchIdentityPart(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    // strip common Spanish/Portuguese prepositions that differ between V1 and V2 feeds
    // e.g. "9 de Julio Rafaela" (V1) vs "9 de Julio de Rafaela" (V2) → both become "9 julio rafaela"
    .replace(/\b(de|do|da|di|del)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function liveMatchIdentityKey(
  match: Pick<LiveMatchState, "sport" | "home" | "away">,
): string {
  return [
    normalizeMatchIdentityPart(match.sport),
    normalizeMatchIdentityPart(match.home),
    normalizeMatchIdentityPart(match.away),
  ].join("|");
}

function pickPreferredLiveMatch(
  current: LiveMatchState,
  candidate: LiveMatchState,
): LiveMatchState {
  const currentIsV2 = String(current.id).includes("-v2-") ? 1 : 0;
  const candidateIsV2 = String(candidate.id).includes("-v2-") ? 1 : 0;
  if (candidateIsV2 !== currentIsV2)
    return candidateIsV2 > currentIsV2 ? candidate : current;

  const currentLive = current.startsIn === undefined ? 1 : 0;
  const candidateLive = candidate.startsIn === undefined ? 1 : 0;
  if (candidateLive !== currentLive)
    return candidateLive > currentLive ? candidate : current;

  const currentLeagueId = current.leagueId ? 1 : 0;
  const candidateLeagueId = candidate.leagueId ? 1 : 0;
  if (candidateLeagueId !== currentLeagueId)
    return candidateLeagueId > currentLeagueId ? candidate : current;

  const currentScoreSignal =
    (current.homeScore ?? 0) + (current.awayScore ?? 0);
  const candidateScoreSignal =
    (candidate.homeScore ?? 0) + (candidate.awayScore ?? 0);
  if (candidateScoreSignal !== currentScoreSignal)
    return candidateScoreSignal > currentScoreSignal ? candidate : current;

  const currentMinute = Number(current.minute ?? 0);
  const candidateMinute = Number(candidate.minute ?? 0);
  if (candidateMinute !== currentMinute)
    return candidateMinute > currentMinute ? candidate : current;

  const currentOdds = current.hasRealOdds ? 1 : 0;
  const candidateOdds = candidate.hasRealOdds ? 1 : 0;
  if (candidateOdds !== currentOdds)
    return candidateOdds > currentOdds ? candidate : current;

  const currentEvents = current.events?.length ?? 0;
  const candidateEvents = candidate.events?.length ?? 0;
  if (candidateEvents !== currentEvents)
    return candidateEvents > currentEvents ? candidate : current;

  return String(candidate.id) > String(current.id) ? candidate : current;
}

function dedupeLiveMatchesByIdentity(
  matches: LiveMatchState[],
): LiveMatchState[] {
  const byIdentity = new Map<string, LiveMatchState>();
  const order: string[] = [];

  for (const match of matches) {
    const key = liveMatchIdentityKey(match);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, match);
      order.push(key);
      continue;
    }
    byIdentity.set(key, pickPreferredLiveMatch(existing, match));
  }

  return order.map((key) => byIdentity.get(key)!).filter(Boolean);
}

function getLivePayloadFallback(): { matches: LiveMatchState[] } | null {
  if (!livePayloadFallbackCache) return null;
  if (
    Date.now() - livePayloadFallbackCache.builtAt >
    LIVE_PAYLOAD_FALLBACK_TTL_MS
  )
    return null;
  return livePayloadFallbackCache.payload;
}

router.get("/team-logo/:sport/:teamId", async (req: Request, res: Response) => {
  const sport = String(req.params["sport"] ?? "")
    .trim()
    .toLowerCase();
  const teamId = String(req.params["teamId"] ?? "").trim();
  const imageVersion = String(req.query["imageVersion"] ?? "").trim();

  if (!teamId) {
    res.status(400).end();
    return;
  }

  const v2ImageBase = (() => {
    if (sport === "football")
      return "https://v2.football.sportsapipro.com/images/teams";
    if (sport === "basketball")
      return "https://v2.basketball.sportsapipro.com/images/teams";
    if (sport === "hockey")
      return "https://v2.hockey.sportsapipro.com/images/teams";
    if (sport === "tennis")
      return "https://v2.tennis.sportsapipro.com/images/teams";
    if (sport === "baseball")
      return "https://v2.baseball.sportsapipro.com/images/teams";
    if (sport === "volleyball")
      return "https://v2.volleyball.sportsapipro.com/images/teams";
    return null;
  })();

  if (sport === "football" && imageVersion) {
    const url = new URL(
      `https://v1.football.sportsapipro.com/images/competitors/${encodeURIComponent(teamId)}`,
    );
    url.searchParams.set("imageVersion", imageVersion);
    res.setHeader("Cache-Control", "public, max-age=21600, s-maxage=21600");
    res.redirect(url.toString());
    return;
  }

  if (!v2ImageBase) {
    res.status(404).end();
    return;
  }

  try {
    const resp = await fetch(`${v2ImageBase}/${encodeURIComponent(teamId)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: sapiHeaders(),
    });

    if (!resp.ok) {
      if (sport === "football") {
        const fallback = new URL(
          `https://v1.football.sportsapipro.com/images/competitors/${encodeURIComponent(teamId)}`,
        );
        if (imageVersion)
          fallback.searchParams.set("imageVersion", imageVersion);
        res.setHeader("Cache-Control", "public, max-age=21600, s-maxage=21600");
        res.redirect(fallback.toString());
        return;
      }
      res.status(resp.status === 404 ? 404 : 502).end();
      return;
    }

    const contentType = resp.headers.get("content-type") ?? "image/png";
    const body = Buffer.from(await resp.arrayBuffer());
    res.setHeader("Cache-Control", "public, max-age=21600, s-maxage=21600");
    res.setHeader("Content-Type", contentType);
    res.send(body);
  } catch {
    if (sport === "football") {
      const fallback = new URL(
        `https://v1.football.sportsapipro.com/images/competitors/${encodeURIComponent(teamId)}`,
      );
      if (imageVersion) fallback.searchParams.set("imageVersion", imageVersion);
      res.setHeader("Cache-Control", "public, max-age=21600, s-maxage=21600");
      res.redirect(fallback.toString());
      return;
    }
    res.status(502).end();
  }
});

function refreshLivePayloadInBackground(): Promise<{
  matches: LiveMatchState[];
}> {
  if (livePayloadInFlight) return livePayloadInFlight;
  livePayloadInFlight = buildLivePayload()
    .then((payload) => {
      livePayloadCache = { payload, builtAt: Date.now() };
      return payload;
    })
    .finally(() => {
      livePayloadInFlight = null;
    });
  return livePayloadInFlight;
}

async function getLivePayloadCached(
  forceFresh = false,
): Promise<{ matches: LiveMatchState[] }> {
  if (
    !forceFresh &&
    livePayloadCache &&
    Date.now() - livePayloadCache.builtAt < LIVE_PAYLOAD_CACHE_TTL_MS
  ) {
    return livePayloadCache.payload;
  }

  // Stale-while-revalidate: once ANY payload has ever been built, never make
  // an HTTP request block on a fresh upstream rebuild (upstream sports APIs
  // can take several seconds on a cold per-sport cache). Serve the stale
  // cache immediately and kick off a rebuild in the background — the next
  // request (or the SSE broadcast / proactive warm-up interval) will pick up
  // the fresh data. Only block-wait when there is truly no cache yet (the
  // very first request after a server restart).
  if (!forceFresh && livePayloadCache) {
    refreshLivePayloadInBackground().catch(() => {});
    return livePayloadCache.payload;
  }

  return refreshLivePayloadInBackground();
}

// Broadcast payload to all connected SSE + WebSocket clients; prune dead connections.
// Guards: (1) skip if no clients, (2) if a broadcast is already in progress, set
// broadcastPending so the update is sent immediately after — never silently dropped.
// (3) avoid sending empty matches unless confirmed, to keep the last good state on clients.
async function broadcastLive(): Promise<void> {
  if (sseClients.size === 0 && wsLiveClients.size === 0) return;
  if (broadcastInProgress) {
    broadcastPending = true; // queue a follow-up — don't drop the score update
    return;
  }
  broadcastInProgress = true;
  broadcastPending = false;
  try {
    const payload = await getLivePayloadCached(true);
    const effectivePayload =
      payload.matches.length === 0
        ? (getLivePayloadFallback() ?? payload)
        : payload;
    if (effectivePayload.matches.length === 0) {
      consecutiveEmptyBroadcasts += 1;
      if (consecutiveEmptyBroadcasts < 3) return;
    } else {
      consecutiveEmptyBroadcasts = 0;
    }
    // Only serialize once
    const wsMsgObj = { type: "snapshot", ...effectivePayload };
    const jsonStr = JSON.stringify(wsMsgObj);

    // SSE clients
    const sseChunk = `data: ${jsonStr}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(sseChunk);
      } catch {
        sseClients.delete(client);
      }
    }
    // WebSocket clients
    for (const ws of wsLiveClients) {
      try {
        if (ws.readyState === 1 /* OPEN */) ws.send(jsonStr);
        else wsLiveClients.delete(ws);
      } catch {
        wsLiveClients.delete(ws);
      }
    }
  } catch {
    /* ignore — keep clients connected */
  } finally {
    broadcastInProgress = false;
    lastBroadcastAt = Date.now();
    // If a score update arrived while we were building, send it now immediately.
    if (broadcastPending) {
      broadcastPending = false;
      setTimeout(() => {
        broadcastLive().catch(() => {});
      }, 0);
    }
  }
}

/**
 * Broadcasts a partial update (delta) for a single match to all connected clients (SSE & WS).
 * This is used for sub-second updates of scores and odds.
 */
export function broadcastMatchDelta(
  matchId: string,
  delta: Partial<LiveMatchState>,
): void {
  broadcastBatchDelta([{ matchId, delta }]);
}

/**
 * Broadcasts a batch of partial updates to all connected clients.
 * Reduces overhead by sending multiple updates in a single network packet.
 */
export function broadcastBatchDelta(
  updates: Array<{ matchId: string; delta: Partial<LiveMatchState> }>,
): void {
  if (updates.length === 0) return;

  // Add to global buffer
  pendingBatchUpdates.push(...updates);

  // If buffer getting large, flush immediately; otherwise wait 100ms
  if (pendingBatchUpdates.length > 50) {
    flushBatchUpdates();
  } else if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(flushBatchUpdates, 100);
  }
}

router.get("/live", async (req: Request, res: Response) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  const lean = String(req.query["lean"] ?? "0") === "1";
  const limitRaw = parseInt(String(req.query["limit"] ?? ""), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(0, Math.min(500, limitRaw))
    : 0;

  try {
    const payload = await getLivePayloadCached();
    const effectivePayload =
      payload.matches.length === 0
        ? (getLivePayloadFallback() ?? payload)
        : payload;
    const matches =
      limit > 0
        ? effectivePayload.matches.slice(0, limit)
        : effectivePayload.matches;
    if (!lean) {
      res.json({ matches });
      return;
    }
    const out = matches.map((m) => {
      const anyM = m as any;
      const { markets, events, ...rest } = anyM;
      return rest;
    });
    res.json({ matches: out });
  } catch (err) {
    logger.error({ err }, "[live route] unexpected error");
    res.json(getLivePayloadFallback() ?? { matches: [] });
  }
});

// ─── live-filler: called by frontend when there are 0 live matches ──────────
// Returns up to 3 upcoming matches that start soonest so the Ao Vivo tab
// is never empty. These are real upcoming matches with odds — not mocks.
router.get("/live-filler", async (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  try {
    // Count real live matches (exclude finished)
    const liveCt = Array.from(liveMatchState.values()).filter(
      (s) => s && !isFinishedVisibilityStatus(s.status),
    ).length;
    if (liveCt > 0) {
      // There are live games — no filler needed
      res.json({ matches: [], isFillerMode: false });
      return;
    }

    // Pull from upcoming cache and pick 3 that start soonest (within 24h)
    const cache = upcomingTopCache;
    if (!cache) {
      res.json({ matches: [], isFillerMode: true });
      return;
    }

    const all: UpcomingMatch[] = [
      ...cache.football,
      ...cache.basketball,
      ...cache.tennis,
      ...cache.hockey,
      ...cache.volleyball,
      ...cache.baseball,
    ].filter(
      (m) => m.hasRealOdds && m.odds?.home > 1.01 && m.odds?.away > 1.01,
    );

    const now = Date.now();
    const withKickoff = all
      .map((m) => ({ m, ms: parseUpcomingKickoffMs(m) ?? Infinity }))
      .filter(({ ms }) => ms > now && ms - now < 24 * 3600 * 1000)
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 3);

    // Fallback: no match starts within 24h → just take the next 3 soonest
    const picks = withKickoff.length >= 1
      ? withKickoff
      : all
          .map((m) => ({ m, ms: parseUpcomingKickoffMs(m) ?? Infinity }))
          .filter(({ ms }) => ms > now)
          .sort((a, b) => a.ms - b.ms)
          .slice(0, 3);

    const matches = picks.map(({ m, ms }) => ({
      ...m,
      startsIn: Math.max(0, Math.round((ms - now) / 60_000)),
      isLive: false,
      isFiller: true,
    }));

    res.json({ matches, isFillerMode: true });
  } catch (err) {
    logger.warn({ err }, "[live-filler] error");
    res.json({ matches: [], isFillerMode: true });
  }
});

router.get("/live-match/:id", async (req: Request, res: Response) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  const id = String(req.params["id"] ?? "");
  const forceFresh = String(req.query["fresh"] ?? "0") === "1";
  if (!id) {
    res.json({ match: null });
    return;
  }

  try {
    const payload = await getLivePayloadCached(forceFresh);
    const effectivePayload =
      payload.matches.length === 0
        ? (getLivePayloadFallback() ?? payload)
        : payload;
    let match =
      effectivePayload.matches.find((m) => String(m.id) === id) ?? null;

    // On-demand tennis market enrichment. computeLiveTennisExtras() (set/game
    // handicap, total games, set-correct-score) was removed from the ~1s
    // broadcast hot path in buildTennisLiveFromPulseScore — running it for
    // every live tennis match on every tick was what froze the live page
    // with 15-30+ concurrent matches. Computing it here instead, only for
    // the single match a user actually opens (this route), restores those
    // market groups without paying that per-tick cost for matches nobody is
    // looking at.
    if (match && match.sport === "tennis" && !match.markets?.tennisExtra) {
      const liveExtra = match._liveExtra;
      const sets = liveExtra?.sets ?? [[0, 0] as [number, number]];
      const homeSetsWon = match.homeScore ?? 0;
      const awaySetsWon = match.awayScore ?? 0;
      const liveHomeP =
        match.odds.home > 0 && match.odds.away > 0
          ? 1 / match.odds.home / (1 / match.odds.home + 1 / match.odds.away)
          : 0.5;
      const modeledExtra = computeLiveTennisExtras(
        liveHomeP,
        sets,
        homeSetsWon,
        awaySetsWon,
        sets.length,
        liveExtra?.currentPoints,
        liveExtra?.serving,
      );
      // Real bookmaker odds (stashed per-tick in _liveExtra.realExtra by
      // buildTennisLiveFromPulseScore) override the modeled estimate
      // wherever PulseScore actually priced that market — the model only
      // fills in what real data doesn't cover (e.g. set/game handicap).
      const tennisExtra = { ...modeledExtra, ...liveExtra?.realExtra };
      match = { ...match, markets: { ...match.markets, tennisExtra } };
    }

    res.json({ match });
  } catch {
    const fallback = getLivePayloadFallback();
    res.json({
      match: fallback?.matches.find((m) => String(m.id) === id) ?? null,
    });
  }
});

router.get("/feed-status", (_req: Request, res: Response) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  const now = Date.now();
  const asAge = (t: number) => (t > 0 ? Math.max(0, now - t) : null);
  res.json({
    serverTime: now,
    sportsApiKeyPresent: !!CONFIG.SPORTSAPI_KEY,
    wsConnected: Array.from(wsConnected),
    v1WsConnected: Array.from(v1WsConnected),
    lastMessageAt: Object.fromEntries(
      (Object.keys(WS_DOMAINS) as SportKey[]).map((k) => [
        k,
        wsLastMessageAt.get(k) ?? 0,
      ]),
    ),
    fetchedAt: {
      football: footballLiveV2FetchedAt,
      basketball: basketballLiveV2FetchedAt,
      hockey: hockeyLiveV2FetchedAt,
      baseball: baseballLiveV2FetchedAt,
      tennis: tennisLiveV2FetchedAt,
      tennisV1: _tennisLiveV1Cache?.fetchedAt ?? 0,
    },
    ageMs: {
      football: asAge(footballLiveV2FetchedAt),
      basketball: asAge(basketballLiveV2FetchedAt),
      hockey: asAge(hockeyLiveV2FetchedAt),
      baseball: asAge(baseballLiveV2FetchedAt),
      tennis: asAge(tennisLiveV2FetchedAt),
      tennisV1: asAge(_tennisLiveV1Cache?.fetchedAt ?? 0),
    },
  });
});

// ─── SSE endpoint — pushes live data continuously (WS-triggered + 1–2s cadence) ─
router.get("/live-stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering

  // Flush headers immediately so the browser sees an open stream
  // Note: flushHeaders is added by compression or similar middlewares,
  // if not available we skip it. Express Response has it in most production setups.
  if (typeof (res as any).flushHeaders === "function")
    (res as any).flushHeaders();
  try {
    res.write(`:${" ".repeat(2048)}\n\n`);
  } catch {
    /* ignore */
  }

  sseClients.add(res);

  // Send an initial event right away so the client doesn't wait for the next tick
  getLivePayloadCached()
    .then((p) => {
      const effectivePayload =
        p.matches.length === 0 ? (getLivePayloadFallback() ?? p) : p;
      try {
        res.write(`data: ${JSON.stringify(effectivePayload)}\n\n`);
      } catch {
        /* ignore */
      }
    })
    .catch(() => {
      const fallback = getLivePayloadFallback();
      if (!fallback) return;
      try {
        res.write(`data: ${JSON.stringify(fallback)}\n\n`);
      } catch {
        /* ignore */
      }
    });

  // Keepalive comment every 20s so proxies don't close the connection
  const keepAlive = setInterval(() => {
    try {
      res.write(`: keepalive ${" ".repeat(256)}\n\n`);
    } catch {
      /* ignore */
    }
  }, 5_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// ─── V1 upcoming builders (fallback when V2 schedule/today is degraded) ──────

async function buildFootballUpcomingV1(): Promise<UpcomingMatch[]> {
  try {
    const fetchGames = async (path: string): Promise<V1LiveGame[]> => {
      const resp = await fetch(`${SAPI_V1_FOOTBALL}/${path}`, {
        signal: AbortSignal.timeout(8000),
        headers: sapiHeaders(),
      });
      if (!resp.ok) return [];
      const j = (await resp.json()) as { data?: { games?: V1LiveGame[] } };
      return j.data?.games ?? [];
    };
    const [currentGames, allGames] = await Promise.all([
      fetchGames("current").catch(() => [] as V1LiveGame[]),
      fetchGames("all").catch(() => [] as V1LiveGame[]),
    ]);
    const seen = new Set<number>();
    const results: UpcomingMatch[] = [];
    for (const g of [...currentGames, ...allGames]) {
      if (!g.id || seen.has(g.id)) continue;
      seen.add(g.id);
      if ((g.statusGroup ?? 0) !== 2) continue;
      const home = g.homeCompetitor?.name?.trim() ?? "";
      const away = g.awayCompetitor?.name?.trim() ?? "";
      if (!home || !away || home === "Unknown" || away === "Unknown") continue;
      if (isBlockedLeague(`${g.competitionDisplayName ?? ""} ${home} ${away}`))
        continue;
      const league = g.competitionDisplayName ?? "Football";
      const startMs = g.startTime
        ? new Date(g.startTime).getTime()
        : Date.now() + 3_600_000;
      if (startMs < Date.now() - 5 * 60_000) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: startMs / 1000,
      } as SAPIV2Event);
      if (!date) continue;
      results.push({
        id: `fb-v1-${g.id}`,
        home,
        away,
        homeTeamId:
          g.homeCompetitor?.id != null
            ? String(g.homeCompetitor.id)
            : undefined,
        awayTeamId:
          g.awayCompetitor?.id != null
            ? String(g.awayCompetitor.id)
            : undefined,
        homeImageVersion:
          g.homeCompetitor?.imageVersion != null
            ? String(g.homeCompetitor.imageVersion)
            : undefined,
        awayImageVersion:
          g.awayCompetitor?.imageVersion != null
            ? String(g.awayCompetitor.imageVersion)
            : undefined,
        league,
        country: "",
        date,
        time,
        sport: "football" as const,
        hasRealOdds: false,
        odds: makeOddsFromTeams(home, away),
        markets: makeAdvancedMarketsFromTeams(home, away),
      } as UpcomingMatch);
      if (results.length >= 40) break;
    }
    results.sort((a, b) => {
      const ta = new Date(
        `${a.date.split(".").reverse().join("-")}T${a.time}`,
      ).getTime();
      const tb = new Date(
        `${b.date.split(".").reverse().join("-")}T${b.time}`,
      ).getTime();
      return ta - tb;
    });
    return results;
  } catch {
    return [];
  }
}

// ─── Top-level upcoming cache — 60s TTL so repeated 30s polls are instant ─────
type UpcomingTopCache = {
  football: UpcomingMatch[];
  tennis: UpcomingMatch[];
  basketball: UpcomingMatch[];
  hockey: UpcomingMatch[];
  volleyball: UpcomingMatch[];
  baseball: UpcomingMatch[];
  boxing: UpcomingMatch[];
  cricket: UpcomingMatch[];
  handball: UpcomingMatch[];
  formula1: UpcomingMatch[];
  fetchedAt: number;
};
let upcomingTopCache: UpcomingTopCache | null = null;
let upcomingTopInFlight: Promise<UpcomingTopCache> | null = null;
const UPCOMING_TOP_TTL = 60_000;
const UPCOMING_TO_LIVE_ELIGIBILITY_MS = 6 * 60 * 60 * 1000;
const recentUpcomingFootballIds = new Map<string, number>();
const recentUpcomingV2Ids = new Map<string, number>();

function parseUpcomingKickoffMs(
  match: Pick<UpcomingMatch, "date" | "time">,
): number | null {
  if (!match.date || !match.time) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match.date)) {
      const [hStr = "0", mStr = "0"] = match.time.split(":");
      return new Date(
        `${match.date}T${String(parseInt(hStr, 10)).padStart(2, "0")}:${mStr}:00Z`,
      ).getTime();
    }
    const [dd, mm, yyyy] = match.date.split(".");
    if (!dd || !mm || !yyyy) return null;
    const offsetH = lisbonOffsetHours();
    const [hStr = "0", mStr = "0"] = match.time.split(":");
    const hUtc = (parseInt(hStr, 10) - offsetH + 24) % 24;
    return new Date(
      `${yyyy}-${mm}-${dd}T${String(hUtc).padStart(2, "0")}:${mStr}:00Z`,
    ).getTime();
  } catch {
    return null;
  }
}

function normalizeUpcomingVisibilityKey(
  match: Pick<UpcomingMatch, "sport" | "home" | "away" | "league">,
): string {
  const norm = (value: string | undefined) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  return [
    norm(match.sport),
    norm(match.home),
    norm(match.away),
    norm(match.league),
  ].join("|");
}

function isFinishedVisibilityStatus(status: string | undefined): boolean {
  const s = String(status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  return (
    s === "ft" ||
    s === "aet" ||
    s === "ap" ||
    s.includes("fin") ||
    s.includes("final") ||
    s.includes("finished") ||
    s.includes("ended") ||
    s.includes("complete") ||
    s.includes("full time") ||
    s.includes("after extra") ||
    s.includes("after penalties") ||
    s.includes("retired") ||
    s.includes("abandon") ||
    s.includes("cancel") ||
    s.includes("awarded") ||
    s.includes("default")
  );
}

function rememberUpcomingFootballEligibility(matches: UpcomingMatch[]): void {
  const now = Date.now();
  for (const [id, expiryAt] of recentUpcomingFootballIds.entries()) {
    if (expiryAt <= now) recentUpcomingFootballIds.delete(id);
  }
  for (const match of matches) {
    if ((match.sport ?? "football") !== "football") continue;
    const scheduledMs = parseUpcomingKickoffMs(match);
    const expiryAt = scheduledMs
      ? Math.max(now + 30 * 60 * 1000, scheduledMs + 4 * 60 * 60 * 1000)
      : now + UPCOMING_TO_LIVE_ELIGIBILITY_MS;
    recentUpcomingFootballIds.set(String(match.id), expiryAt);
  }
}

function rememberUpcomingEligibility(matches: UpcomingMatch[]): void {
  const now = Date.now();
  for (const [k, expiryAt] of recentUpcomingV2Ids.entries()) {
    if (expiryAt <= now) recentUpcomingV2Ids.delete(k);
  }
  for (const match of matches) {
    const sport = String(match.sport ?? "football");
    const idRaw = String(match.id ?? "");
    const m = idRaw.match(
      /^(fb-v2|football-v2|bball-v2|hockey-v2|tennis-v2|baseball-v2|mlb-v2|volley-odds|volley-live|boxing-v2|cricket-v2|handball-v2|formula1-statpal)-(.+)$/,
    );
    if (!m) continue;
    const providerId = m[2] ?? "";
    if (!providerId) continue;

    const scheduledMs = parseUpcomingKickoffMs(match);
    const expiryAt = scheduledMs
      ? Math.max(now + 30 * 60 * 1000, scheduledMs + 4 * 60 * 60 * 1000)
      : now + UPCOMING_TO_LIVE_ELIGIBILITY_MS;
    recentUpcomingV2Ids.set(`${sport}:${providerId}`, expiryAt);
  }
}

async function refreshUpcomingTop(): Promise<UpcomingTopCache> {
  // ── Sports data providers still disconnected from pré-jogo, except
  // football, tennis, basketball, hockey and volleyball ───────────────────
  // Same rebuild-from-scratch effort as rebuildUpcomingCache above: football,
  // tennis, basketball (all 2026-08-07), hockey and volleyball (both
  // 2026-08-09) all on PulseScore, every other sport pending its own real
  // confirmed sample before being rebuilt the same way.
  let football: UpcomingMatch[] = [];
  try {
    football = await buildFootballUpcomingFromSportMonks();
  } catch (err) {
    logger.error(
      { err },
      "[sportmonks] buildFootballUpcomingFromSportMonks failed this cycle",
    );
  }
  let tennis: UpcomingMatch[] = [];
  try {
    tennis = await buildTennisUpcomingFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildTennisUpcomingFromPulseScore failed this cycle",
    );
  }
  let basketball: UpcomingMatch[] = [];
  try {
    basketball = await buildBasketballUpcomingFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildBasketballUpcomingFromPulseScore failed this cycle",
    );
  }
  let hockey: UpcomingMatch[] = [];
  try {
    hockey = await buildHockeyUpcomingFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildHockeyUpcomingFromPulseScore failed this cycle",
    );
  }
  let volleyball: UpcomingMatch[] = [];
  try {
    volleyball = await buildVolleyballUpcomingFromPulseScore();
  } catch (err) {
    logger.error(
      { err },
      "[pulsescore] buildVolleyballUpcomingFromPulseScore failed this cycle",
    );
  }
  rememberUpcomingFootballEligibility(football);
  rememberUpcomingEligibility([...football, ...tennis, ...basketball, ...hockey, ...volleyball]);
  upcomingTopCache = {
    football,
    tennis,
    basketball,
    hockey,
    volleyball,
    baseball: [],
    boxing: [],
    cricket: [],
    handball: [],
    formula1: [],
    fetchedAt: Date.now(),
  };
  return upcomingTopCache;
}

async function getUpcomingAll(): Promise<UpcomingTopCache> {
  const now = Date.now();
  if (upcomingTopCache && now - upcomingTopCache.fetchedAt < UPCOMING_TOP_TTL)
    return upcomingTopCache;
  if (upcomingTopCache) {
    if (!upcomingTopInFlight) {
      upcomingTopInFlight = refreshUpcomingTop().finally(() => {
        upcomingTopInFlight = null;
      });
    }
    return upcomingTopCache;
  }
  if (!upcomingTopInFlight) {
    upcomingTopInFlight = refreshUpcomingTop().finally(() => {
      upcomingTopInFlight = null;
    });
  }
  return upcomingTopInFlight;
}

// ─── WC 2026 Endpoint ──────────────────────────────────────────────────────────
let wc2026Cache: { matches: UpcomingMatch[]; fetchedAt: number } | null = null;
const WC2026_TTL = 3 * 60_000; // 3 min — short so finished games are removed quickly

let _wc2026Rebuilding = false;

const WC2026_ENABLE_STATIC = false;

// ─── Static WC 2026 group-stage schedule (supplement when API returns near-term only) ──
// UTC times; backend converts to Europe/Lisbon for display
const WC2026_STATIC: Array<{
  home: string;
  away: string;
  group: string;
  date: string;
  time: string;
  md: number;
}> = [
  // MD1
  {
    home: "Mexico",
    away: "South Africa",
    group: "A",
    date: "2026-06-11",
    time: "19:00",
    md: 1,
  },
  {
    home: "South Korea",
    away: "Czechia",
    group: "A",
    date: "2026-06-11",
    time: "22:00",
    md: 1,
  },
  {
    home: "Canada",
    away: "Switzerland",
    group: "B",
    date: "2026-06-12",
    time: "19:00",
    md: 1,
  },
  {
    home: "Qatar",
    away: "Bosnia and Herzegovina",
    group: "B",
    date: "2026-06-12",
    time: "22:00",
    md: 1,
  },
  {
    home: "Brazil",
    away: "Morocco",
    group: "C",
    date: "2026-06-13",
    time: "01:00",
    md: 1,
  },
  {
    home: "Haiti",
    away: "Scotland",
    group: "C",
    date: "2026-06-13",
    time: "04:00",
    md: 1,
  },
  {
    home: "United States",
    away: "Australia",
    group: "D",
    date: "2026-06-13",
    time: "19:00",
    md: 1,
  },
  {
    home: "Paraguay",
    away: "Turkey",
    group: "D",
    date: "2026-06-13",
    time: "22:00",
    md: 1,
  },
  {
    home: "Germany",
    away: "Ivory Coast",
    group: "E",
    date: "2026-06-14",
    time: "01:00",
    md: 1,
  },
  {
    home: "Ecuador",
    away: "Curacao",
    group: "E",
    date: "2026-06-14",
    time: "04:00",
    md: 1,
  },
  {
    home: "Netherlands",
    away: "Sweden",
    group: "F",
    date: "2026-06-14",
    time: "19:00",
    md: 1,
  },
  {
    home: "Japan",
    away: "Tunisia",
    group: "F",
    date: "2026-06-14",
    time: "22:00",
    md: 1,
  },
  {
    home: "Belgium",
    away: "Iran",
    group: "G",
    date: "2026-06-15",
    time: "01:00",
    md: 1,
  },
  {
    home: "New Zealand",
    away: "Egypt",
    group: "G",
    date: "2026-06-15",
    time: "04:00",
    md: 1,
  },
  {
    home: "Spain",
    away: "Saudi Arabia",
    group: "H",
    date: "2026-06-15",
    time: "19:00",
    md: 1,
  },
  {
    home: "Uruguay",
    away: "Cape Verde",
    group: "H",
    date: "2026-06-15",
    time: "22:00",
    md: 1,
  },
  {
    home: "France",
    away: "Senegal",
    group: "I",
    date: "2026-06-16",
    time: "01:00",
    md: 1,
  },
  {
    home: "Iraq",
    away: "Norway",
    group: "I",
    date: "2026-06-16",
    time: "04:00",
    md: 1,
  },
  {
    home: "Argentina",
    away: "Algeria",
    group: "J",
    date: "2026-06-16",
    time: "19:00",
    md: 1,
  },
  {
    home: "Austria",
    away: "Jordan",
    group: "J",
    date: "2026-06-16",
    time: "22:00",
    md: 1,
  },
  {
    home: "Portugal",
    away: "Colombia",
    group: "K",
    date: "2026-06-17",
    time: "01:00",
    md: 1,
  },
  {
    home: "Uzbekistan",
    away: "DR Congo",
    group: "K",
    date: "2026-06-17",
    time: "04:00",
    md: 1,
  },
  {
    home: "England",
    away: "Croatia",
    group: "L",
    date: "2026-06-17",
    time: "19:00",
    md: 1,
  },
  {
    home: "Ghana",
    away: "Panama",
    group: "L",
    date: "2026-06-17",
    time: "22:00",
    md: 1,
  },
  // MD2
  {
    home: "South Korea",
    away: "South Africa",
    group: "A",
    date: "2026-06-17",
    time: "23:00",
    md: 2,
  },
  {
    home: "Mexico",
    away: "Czechia",
    group: "A",
    date: "2026-06-18",
    time: "02:00",
    md: 2,
  },
  {
    home: "Switzerland",
    away: "Qatar",
    group: "B",
    date: "2026-06-18",
    time: "19:00",
    md: 2,
  },
  {
    home: "Canada",
    away: "Bosnia and Herzegovina",
    group: "B",
    date: "2026-06-18",
    time: "22:00",
    md: 2,
  },
  {
    home: "Morocco",
    away: "Haiti",
    group: "C",
    date: "2026-06-19",
    time: "01:00",
    md: 2,
  },
  {
    home: "Brazil",
    away: "Scotland",
    group: "C",
    date: "2026-06-19",
    time: "04:00",
    md: 2,
  },
  {
    home: "Australia",
    away: "Paraguay",
    group: "D",
    date: "2026-06-19",
    time: "19:00",
    md: 2,
  },
  {
    home: "United States",
    away: "Turkey",
    group: "D",
    date: "2026-06-19",
    time: "22:00",
    md: 2,
  },
  {
    home: "Ivory Coast",
    away: "Ecuador",
    group: "E",
    date: "2026-06-20",
    time: "01:00",
    md: 2,
  },
  {
    home: "Germany",
    away: "Curacao",
    group: "E",
    date: "2026-06-20",
    time: "04:00",
    md: 2,
  },
  {
    home: "Sweden",
    away: "Japan",
    group: "F",
    date: "2026-06-20",
    time: "19:00",
    md: 2,
  },
  {
    home: "Netherlands",
    away: "Tunisia",
    group: "F",
    date: "2026-06-20",
    time: "22:00",
    md: 2,
  },
  {
    home: "Iran",
    away: "New Zealand",
    group: "G",
    date: "2026-06-21",
    time: "01:00",
    md: 2,
  },
  {
    home: "Belgium",
    away: "Egypt",
    group: "G",
    date: "2026-06-21",
    time: "04:00",
    md: 2,
  },
  {
    home: "Saudi Arabia",
    away: "Uruguay",
    group: "H",
    date: "2026-06-21",
    time: "19:00",
    md: 2,
  },
  {
    home: "Spain",
    away: "Cape Verde",
    group: "H",
    date: "2026-06-21",
    time: "22:00",
    md: 2,
  },
  {
    home: "Senegal",
    away: "Iraq",
    group: "I",
    date: "2026-06-22",
    time: "01:00",
    md: 2,
  },
  {
    home: "France",
    away: "Norway",
    group: "I",
    date: "2026-06-22",
    time: "04:00",
    md: 2,
  },
  {
    home: "Algeria",
    away: "Austria",
    group: "J",
    date: "2026-06-22",
    time: "19:00",
    md: 2,
  },
  {
    home: "Argentina",
    away: "Jordan",
    group: "J",
    date: "2026-06-22",
    time: "22:00",
    md: 2,
  },
  {
    home: "Colombia",
    away: "Uzbekistan",
    group: "K",
    date: "2026-06-23",
    time: "01:00",
    md: 2,
  },
  {
    home: "Portugal",
    away: "DR Congo",
    group: "K",
    date: "2026-06-23",
    time: "04:00",
    md: 2,
  },
  {
    home: "Croatia",
    away: "Ghana",
    group: "L",
    date: "2026-06-23",
    time: "19:00",
    md: 2,
  },
  {
    home: "England",
    away: "Panama",
    group: "L",
    date: "2026-06-23",
    time: "22:00",
    md: 2,
  },
  // MD3 (simultaneous within group)
  {
    home: "South Africa",
    away: "South Korea",
    group: "A",
    date: "2026-06-24",
    time: "02:00",
    md: 3,
  },
  {
    home: "Czechia",
    away: "Mexico",
    group: "A",
    date: "2026-06-24",
    time: "02:00",
    md: 3,
  },
  {
    home: "Bosnia and Herzegovina",
    away: "Switzerland",
    group: "B",
    date: "2026-06-24",
    time: "19:00",
    md: 3,
  },
  {
    home: "Qatar",
    away: "Canada",
    group: "B",
    date: "2026-06-24",
    time: "19:00",
    md: 3,
  },
  {
    home: "Haiti",
    away: "Morocco",
    group: "C",
    date: "2026-06-25",
    time: "02:00",
    md: 3,
  },
  {
    home: "Scotland",
    away: "Brazil",
    group: "C",
    date: "2026-06-25",
    time: "02:00",
    md: 3,
  },
  {
    home: "Paraguay",
    away: "United States",
    group: "D",
    date: "2026-06-25",
    time: "19:00",
    md: 3,
  },
  {
    home: "Turkey",
    away: "Australia",
    group: "D",
    date: "2026-06-25",
    time: "19:00",
    md: 3,
  },
  {
    home: "Curacao",
    away: "Ivory Coast",
    group: "E",
    date: "2026-06-25",
    time: "23:00",
    md: 3,
  },
  {
    home: "Ecuador",
    away: "Germany",
    group: "E",
    date: "2026-06-25",
    time: "23:00",
    md: 3,
  },
  {
    home: "Tunisia",
    away: "Sweden",
    group: "F",
    date: "2026-06-26",
    time: "02:00",
    md: 3,
  },
  {
    home: "Japan",
    away: "Netherlands",
    group: "F",
    date: "2026-06-26",
    time: "02:00",
    md: 3,
  },
  {
    home: "Egypt",
    away: "Iran",
    group: "G",
    date: "2026-06-26",
    time: "19:00",
    md: 3,
  },
  {
    home: "New Zealand",
    away: "Belgium",
    group: "G",
    date: "2026-06-26",
    time: "19:00",
    md: 3,
  },
  {
    home: "Cape Verde",
    away: "Spain",
    group: "H",
    date: "2026-06-26",
    time: "23:00",
    md: 3,
  },
  {
    home: "Uruguay",
    away: "Saudi Arabia",
    group: "H",
    date: "2026-06-26",
    time: "23:00",
    md: 3,
  },
  {
    home: "Norway",
    away: "Senegal",
    group: "I",
    date: "2026-06-27",
    time: "02:00",
    md: 3,
  },
  {
    home: "Iraq",
    away: "France",
    group: "I",
    date: "2026-06-27",
    time: "02:00",
    md: 3,
  },
  {
    home: "Jordan",
    away: "Algeria",
    group: "J",
    date: "2026-06-27",
    time: "19:00",
    md: 3,
  },
  {
    home: "Argentina",
    away: "Austria",
    group: "J",
    date: "2026-06-27",
    time: "19:00",
    md: 3,
  },
  {
    home: "Uzbekistan",
    away: "Colombia",
    group: "K",
    date: "2026-06-27",
    time: "23:00",
    md: 3,
  },
  {
    home: "DR Congo",
    away: "Portugal",
    group: "K",
    date: "2026-06-27",
    time: "23:00",
    md: 3,
  },
  {
    home: "Ghana",
    away: "Croatia",
    group: "L",
    date: "2026-06-28",
    time: "02:00",
    md: 3,
  },
  {
    home: "Panama",
    away: "England",
    group: "L",
    date: "2026-06-28",
    time: "02:00",
    md: 3,
  },
];

const WC2026_GROUPS = [
  { group: "A", teams: ["Mexico", "South Korea", "South Africa", "Czechia"] },
  {
    group: "B",
    teams: ["Canada", "Switzerland", "Qatar", "Bosnia and Herzegovina"],
  },
  { group: "C", teams: ["Brazil", "Morocco", "Haiti", "Scotland"] },
  { group: "D", teams: ["United States", "Australia", "Paraguay", "Turkey"] },
  { group: "E", teams: ["Germany", "Ivory Coast", "Ecuador", "Curacao"] },
  { group: "F", teams: ["Netherlands", "Sweden", "Japan", "Tunisia"] },
  { group: "G", teams: ["Belgium", "Iran", "New Zealand", "Egypt"] },
  { group: "H", teams: ["Spain", "Saudi Arabia", "Uruguay", "Cape Verde"] },
  { group: "I", teams: ["France", "Senegal", "Iraq", "Norway"] },
  { group: "J", teams: ["Argentina", "Algeria", "Austria", "Jordan"] },
  { group: "K", teams: ["Portugal", "Colombia", "Uzbekistan", "DR Congo"] },
  { group: "L", teams: ["England", "Croatia", "Ghana", "Panama"] },
] as const;

function normalizeWC2026PairKey(home: string, away: string): string {
  return [normalizeWC2026TeamKey(home), normalizeWC2026TeamKey(away)]
    .sort()
    .join("|");
}

function parseWC2026DisplayKickoffMs(
  date: string | undefined,
  time: string | undefined,
): number | null {
  if (!date || !time) return null;
  const m = String(date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const ms = new Date(
    `${yyyy}-${mm}-${dd}T${String(time).padStart(5, "0")}:00`,
  ).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const WC2026_STATIC_BY_PAIR = (() => {
  const map = new Map<
    string,
    Array<{
      home: string;
      away: string;
      group: string;
      date: string;
      time: string;
      md: number;
    }>
  >();
  for (const fixture of WC2026_STATIC) {
    const key = normalizeWC2026PairKey(fixture.home, fixture.away);
    const arr = map.get(key) ?? [];
    arr.push(fixture);
    map.set(key, arr);
  }
  return map;
})();

function findWC2026StaticFixture(
  home: string,
  away: string,
  date?: string,
  time?: string,
) {
  const candidates =
    WC2026_STATIC_BY_PAIR.get(normalizeWC2026PairKey(home, away)) ?? [];
  if (candidates.length === 0) return null;
  const actualMs = parseWC2026DisplayKickoffMs(date, time);
  if (actualMs == null) return candidates[0] ?? null;
  let best: (typeof candidates)[number] | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dt = new Date(`${candidate.date}T${candidate.time}:00Z`);
    const candidateDay = dt.toLocaleDateString("pt-PT", {
      day: "2-digit",
      timeZone: "Europe/Lisbon",
    });
    const candidateMonth = dt.toLocaleDateString("pt-PT", {
      month: "2-digit",
      timeZone: "Europe/Lisbon",
    });
    const candidateYear = dt.toLocaleDateString("pt-PT", {
      year: "numeric",
      timeZone: "Europe/Lisbon",
    });
    const candidateTime = dt.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Lisbon",
    });
    const candidateMs = parseWC2026DisplayKickoffMs(
      `${candidateDay}.${candidateMonth}.${candidateYear}`,
      candidateTime,
    );
    if (candidateMs == null) continue;
    const diff = Math.abs(candidateMs - actualMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  return best;
}

function isWC2026ApiFixtureConsistent(match: UpcomingMatch): boolean {
  if (!WC2026_ENABLE_STATIC) return true;
  const fixture = findWC2026StaticFixture(
    match.home,
    match.away,
    match.date,
    match.time,
  );
  if (!fixture) return true;
  if (String(match.id ?? "").startsWith("wc26-")) return true;
  const actualMs = parseWC2026DisplayKickoffMs(match.date, match.time);
  if (actualMs == null) return true;
  const dt = new Date(`${fixture.date}T${fixture.time}:00Z`);
  const fixtureDay = dt.toLocaleDateString("pt-PT", {
    day: "2-digit",
    timeZone: "Europe/Lisbon",
  });
  const fixtureMonth = dt.toLocaleDateString("pt-PT", {
    month: "2-digit",
    timeZone: "Europe/Lisbon",
  });
  const fixtureYear = dt.toLocaleDateString("pt-PT", {
    year: "numeric",
    timeZone: "Europe/Lisbon",
  });
  const fixtureTime = dt.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
  const fixtureMs = parseWC2026DisplayKickoffMs(
    `${fixtureDay}.${fixtureMonth}.${fixtureYear}`,
    fixtureTime,
  );
  if (fixtureMs == null) return true;
  return Math.abs(fixtureMs - actualMs) <= 6 * 60 * 60 * 1000;
}

function normalizeWC2026TeamKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getWC2026MatchPriority(match: UpcomingMatch): number {
  let score = 0;
  if (match.isLive) score += 1000;
  if (
    typeof match.homeScore === "number" ||
    typeof match.awayScore === "number"
  )
    score += 400;
  if (String(match.id ?? "").startsWith("wc26-")) score += 250;
  if (match.hasRealOdds) score += 50;
  if (match.homeTeamId || match.awayTeamId) score += 20;
  return score;
}

function dedupeWC2026Matches(matches: UpcomingMatch[]): UpcomingMatch[] {
  const bestByPairAndSlot = new Map<string, UpcomingMatch>();
  for (const match of matches) {
    const slot = `${match.date ?? ""}|${match.time ?? ""}`;
    const pairKey = [
      normalizeWC2026TeamKey(match.home),
      normalizeWC2026TeamKey(match.away),
    ]
      .sort()
      .join("|");
    const uniqueKey = `${slot}|${pairKey}`;
    const existing = bestByPairAndSlot.get(uniqueKey);
    if (
      !existing ||
      getWC2026MatchPriority(match) > getWC2026MatchPriority(existing)
    ) {
      bestByPairAndSlot.set(uniqueKey, match);
    }
  }

  const occupancy = new Set<string>();
  const resolved = [...bestByPairAndSlot.values()]
    .sort((a, b) => getWC2026MatchPriority(b) - getWC2026MatchPriority(a))
    .filter((match) => {
      const slot = `${match.date ?? ""}|${match.time ?? ""}`;
      const homeKey = `${slot}|${normalizeWC2026TeamKey(match.home)}`;
      const awayKey = `${slot}|${normalizeWC2026TeamKey(match.away)}`;
      if (occupancy.has(homeKey) || occupancy.has(awayKey)) return false;
      occupancy.add(homeKey);
      occupancy.add(awayKey);
      return true;
    });

  return resolved;
}

type WC2026StandingRow = {
  pos: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
};

type H2HEvent = {
  date: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  tournament: string;
  isH2H: boolean;
};

type WCH2HData = {
  h2hEvents: H2HEvent[];
  homeRecentForm: H2HEvent[];
  awayRecentForm: H2HEvent[];
  homeTeam: string;
  awayTeam: string;
};

const wc2026H2HCache = new Map<string, { data: WCH2HData; fetchedAt: number }>();
const WC2026_H2H_TTL = 5 * 60_000;

type WC2026StandingGroup = {
  name: string;
  rows: WC2026StandingRow[];
};

type WC2026CompetitionSection = {
  title: string;
  items: Array<{ name: string; odd: number }>;
};

const wc2026StandingsCache = new Map<
  string,
  { data: { groups: WC2026StandingGroup[]; league: string }; fetchedAt: number }
>();
const WC2026_STANDINGS_TTL = 5 * 60_000;
const wc2026CompetitionCache = new Map<
  string,
  { data: { sections: WC2026CompetitionSection[] }; fetchedAt: number }
>();
const WC2026_COMPETITION_TTL = 5 * 60_000;
const WC2026_COMPETITION_DISCOVERY_TIMEOUT_MS = 4_000;
const WC2026_COMPETITION_FETCH_TIMEOUT_MS = 3_500;

function normalizeWCStandingTeamName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|ac|afc|fk|club|clube)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wcStandingRowMatchesTeam(rowName: string, teamName: string): boolean {
  const row = normalizeWCStandingTeamName(rowName);
  const team = normalizeWCStandingTeamName(teamName);
  if (!row || !team) return false;
  return (
    row === team ||
    row.includes(team) ||
    team.includes(row) ||
    row.includes(team.slice(0, Math.min(team.length, 8)))
  );
}

function normalizeWCCompetitionText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOutrightOddValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 1)
    return Math.round(value * 100) / 100;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 1
      ? Math.round(parsed * 100) / 100
      : null;
  }
  if (/^\d+\s*\/\s*\d+$/.test(raw)) return fractionalToDecimal(raw);
  return null;
}

function looksLikeWorldCupContext(context: string): boolean {
  const c = normalizeWCCompetitionText(context);
  return (
    c.includes("world cup") ||
    c.includes("fifa world") ||
    c.includes("copa do mundo") ||
    c.includes("mundial 2026") ||
    c.includes("world cup 2026")
  );
}

function groupLetterFromMarketTitle(rawTitle: string): string | null {
  const title = normalizeWCCompetitionText(rawTitle);
  const m = title.match(
    /winner of the group\s*([a-l])\b|group winner\s*[-:]?\s*group\s*([a-l])\b|group\s*([a-l])\s*winner\b|grupo\s*([a-l]).*vencedor|vencedor do grupo\s*[-:]?\s*grupo\s*([a-l])\b/,
  );
  const letter = m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5] ?? null;
  return letter ? letter.toUpperCase() : null;
}

function extractOutrightCandidateName(
  node: Record<string, unknown>,
): string | null {
  const keys = [
    "name",
    "team",
    "team_name",
    "teamName",
    "competitor",
    "competitor_name",
    "participant",
    "participant_name",
    "option_name",
    "outcome_name",
    "selection_name",
    "label",
    "title",
  ];
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractOutrightCandidateOdd(
  node: Record<string, unknown>,
): number | null {
  const keys = [
    "odd",
    "odds",
    "price",
    "value",
    "decimal_odds",
    "decimalOdds",
    "eu_odds",
    "europe_odds",
    "fractionalValue",
  ];
  for (const key of keys) {
    const parsed = parseOutrightOddValue(node[key]);
    if (parsed && parsed > 1) return parsed;
  }
  return null;
}

function normalizeWCGroupName(rawName: string): string {
  const raw = String(rawName ?? "").trim();
  if (!raw) return "Grupo";
  const compact = raw.replace(/\s+/g, " ").trim();
  const explicit = compact.match(/(?:^|\b)(?:grupo|group)\s*([A-L])(?:\b|$)/i);
  if (explicit?.[1]) return `Grupo ${explicit[1].toUpperCase()}`;
  const reversed = compact.match(/^([A-L])\s*(?:grupo|group)\b/i);
  if (reversed?.[1]) return `Grupo ${reversed[1].toUpperCase()}`;
  if (/^[A-Z0-9]$/.test(compact)) return `Grupo ${compact}`;
  return raw;
}

function assignWC2026Group(teamName: string): string | null {
  for (const group of WC2026_GROUPS) {
    if (group.teams.some((team) => wcStandingRowMatchesTeam(teamName, team))) {
      return `Grupo ${group.group}`;
    }
  }
  return null;
}

function parseWC2026CompetitionSectionsFromPayload(
  payload: unknown,
): WC2026CompetitionSection[] {
  const sectionMap = new Map<string, Map<string, number>>();
  const titleKeys = [
    "name",
    "title",
    "marketName",
    "market_name",
    "betTypeName",
    "bet_type_name",
    "typeName",
    "type_name",
    "play_name",
    "playName",
    "group",
    "groupName",
    "category",
    "categoryName",
    "competitionName",
    "competition",
    "tournamentName",
    "tournament",
  ];

  const matchKnownTeams = (
    groupDef: (typeof WC2026_GROUPS)[number],
    items: Array<{ name: string; odd: number }>,
  ) =>
    items.filter((item) =>
      groupDef.teams.some((candidate) =>
        wcStandingRowMatchesTeam(item.name, candidate),
      ),
    );

  const commitCandidate = (
    rawTitle: string | null,
    items: Array<{ name: string; odd: number }>,
    context: string,
  ) => {
    const group = rawTitle ? groupLetterFromMarketTitle(rawTitle) : null;
    if (!group) return;
    const groupDef = WC2026_GROUPS.find((entry) => entry.group === group);
    if (!groupDef) return;
    const matchedItems = matchKnownTeams(groupDef, items);
    const hasWorldCupSignal =
      looksLikeWorldCupContext(`${context} ${rawTitle}`) ||
      matchedItems.length >= 2;
    if (!hasWorldCupSignal) return;
    const bucket = sectionMap.get(group) ?? new Map<string, number>();
    for (const item of matchedItems) {
      const team = groupDef.teams.find((candidate) =>
        wcStandingRowMatchesTeam(item.name, candidate),
      );
      if (!team) continue;
      const prev = bucket.get(team);
      if (prev == null || item.odd < prev) bucket.set(team, item.odd);
    }
    if (bucket.size > 0) sectionMap.set(group, bucket);
  };

  const walk = (
    node: unknown,
    inheritedTitle: string | null,
    context: string,
  ) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inheritedTitle, context);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const localTitle =
      titleKeys
        .map((key) => obj[key])
        .find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ) ?? inheritedTitle;
    const localContext = `${context} ${titleKeys
      .map((key) => obj[key])
      .filter((value): value is string => typeof value === "string")
      .join(" ")}`.trim();

    const directName = extractOutrightCandidateName(obj);
    const directOdd = extractOutrightCandidateOdd(obj);
    if (localTitle && directName && directOdd) {
      commitCandidate(
        localTitle,
        [{ name: directName, odd: directOdd }],
        localContext,
      );
    }

    for (const value of Object.values(obj)) {
      if (!Array.isArray(value)) continue;
      const parsedItems = value
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === "object",
        )
        .map((entry) => ({
          name: extractOutrightCandidateName(entry),
          odd: extractOutrightCandidateOdd(entry),
        }))
        .filter(
          (entry): entry is { name: string; odd: number } =>
            !!entry.name && !!entry.odd,
        );
      if (localTitle && parsedItems.length > 0) {
        commitCandidate(localTitle, parsedItems, localContext);
      }
      for (const entry of value) walk(entry, localTitle, localContext);
    }
  };

  walk(payload, null, "");

  const sections = WC2026_GROUPS.map((group) => {
    const bucket = sectionMap.get(group.group);
    if (!bucket || bucket.size === 0) return null;
    const items = group.teams
      .map((team) => {
        const odd = bucket.get(team);
        return odd ? { name: team, odd } : null;
      })
      .filter((entry) => !!entry)
      .sort((a, b) => a!.odd - b!.odd);
    if (items.length === 0) return null;
    return { title: `Vencedor do grupo - Grupo ${group.group}`, items };
  }).filter((entry) => !!entry) as WC2026CompetitionSection[];
  return sections;
}

async function getWC2026CompetitionSections(): Promise<{
  sections: WC2026CompetitionSection[];
}> {
  const cacheKey = "wc2026-competition";
  const cached = wc2026CompetitionCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < WC2026_COMPETITION_TTL)
    return cached.data;
  if (!CONFIG.SPORTSAPI_KEY) return { sections: [] };

  let tournamentId: number | undefined;
  let seasonId: number | undefined;
  try {
    const nowMs = Date.now();
    const dates: string[] = [];
    for (let i = -2; i < 24; i++) {
      dates.push(new Date(nowMs + i * 86_400_000).toISOString().slice(0, 10));
    }
    const dayResults = await Promise.race([
      Promise.all(
        dates.map((dt) =>
          getScheduleV2("football", dt).catch(() => [] as SAPIV2Event[]),
        ),
      ),
      new Promise<SAPIV2Event[][]>((resolve) =>
        setTimeout(() => resolve([]), WC2026_COMPETITION_DISCOVERY_TIMEOUT_MS),
      ),
    ]);
    const events = (
      Array.isArray(dayResults) ? dayResults.flat() : []
    ) as SAPIV2Event[];
    const wcEvent = events.find((ev) => {
      const league = normalizeLeagueName(
        v2TournName(ev.tournament),
        "",
      ).toLowerCase();
      return (
        (league.includes("world cup") ||
          league.includes("copa do mundo") ||
          league.includes("fifa world") ||
          league.includes("wc 2026")) &&
        !league.includes("women") &&
        !league.includes("qualification") &&
        !league.includes("qualif")
      );
    });
    if (wcEvent) {
      tournamentId = wcEvent.tournamentId;
      seasonId =
        Number(
          (wcEvent as Record<string, unknown>)["seasonId"] ??
            (
              (wcEvent as Record<string, unknown>)["season"] as
                | Record<string, unknown>
                | undefined
            )?.["id"] ??
            0,
        ) || undefined;
      if (wcEvent.id) {
        try {
          const matchResp = await fetch(
            `${SAPI_V2_FOOTBALL}/match/${wcEvent.id}`,
            {
              signal: AbortSignal.timeout(WC2026_COMPETITION_FETCH_TIMEOUT_MS),
              headers: sapiHeaders(),
            },
          );
          if (matchResp.ok) {
            const matchData = (await matchResp.json()) as Record<
              string,
              unknown
            >;
            const matchRoot =
              (matchData["match"] as Record<string, unknown> | undefined) ??
              ((matchData["data"] as Record<string, unknown> | undefined)?.[
                "match"
              ] as Record<string, unknown> | undefined) ??
              (matchData["event"] as Record<string, unknown> | undefined) ??
              ((matchData["data"] as Record<string, unknown> | undefined)?.[
                "event"
              ] as Record<string, unknown> | undefined);
            const season =
              (matchRoot?.["season"] as Record<string, unknown> | undefined) ??
              undefined;
            const tournament =
              (matchRoot?.["tournament"] as
                | Record<string, unknown>
                | undefined) ?? undefined;
            const uniqueTournament =
              (matchRoot?.["uniqueTournament"] as
                | Record<string, unknown>
                | undefined) ?? undefined;
            seasonId = Number(season?.["id"] ?? seasonId ?? 0) || seasonId;
            tournamentId =
              Number(
                uniqueTournament?.["id"] ??
                  tournament?.["id"] ??
                  tournamentId ??
                  0,
              ) || tournamentId;
          }
        } catch {
          // keep schedule-derived ids
        }
      }
    }
  } catch {
    // fallback to generic outrights endpoints below
  }

  const endpoints = [
    ...(tournamentId && seasonId
      ? [
          `${SAPI_V2_FOOTBALL}/tournament/${tournamentId}/season/${seasonId}/odds`,
          `${SAPI_V2_FOOTBALL}/tournament/${tournamentId}/season/${seasonId}/outrights`,
          `${SAPI_V2_FOOTBALL}/odds?tournamentId=${tournamentId}&seasonId=${seasonId}`,
          `${SAPI_V2_FOOTBALL}/outrights?tournamentId=${tournamentId}&seasonId=${seasonId}`,
        ]
      : []),
    (() => {
      const url = new URL(
        "https://api.isportsapi.com/sport/football/odds/outrights",
      );
      url.searchParams.set("api_key", CONFIG.SPORTSAPI_KEY);
      return url.toString();
    })(),
    `${SAPI_V1_FOOTBALL}/odds/outrights`,
  ];

  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const resp = await fetch(endpoint, {
        signal: AbortSignal.timeout(WC2026_COMPETITION_FETCH_TIMEOUT_MS),
        headers: { ...sapiHeaders(), Accept: "application/json" },
      });
      if (!resp.ok) return [] as WC2026CompetitionSection[];
      const payload = await resp.json();
      return parseWC2026CompetitionSectionsFromPayload(payload);
    }),
  );

  let bestSections: WC2026CompetitionSection[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    if (result.value.length > bestSections.length) bestSections = result.value;
  }
  if (bestSections.length > 0) {
    const result = { sections: bestSections };
    wc2026CompetitionCache.set(cacheKey, {
      data: result,
      fetchedAt: Date.now(),
    });
    return result;
  }
  return { sections: [] };
}

async function getWC2026Standings(): Promise<{
  groups: WC2026StandingGroup[];
  league: string;
}> {
  const cacheKey = "wc2026";
  const cached = wc2026StandingsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < WC2026_STANDINGS_TTL)
    return cached.data;

  const parseStandingRow = (r: any, i: number): WC2026StandingRow => ({
    pos: r.position ?? r.rank ?? i + 1,
    name: r.teamName ?? r.team?.shortName ?? r.team?.name ?? "",
    played: r.played ?? r.matches ?? 0,
    won: r.won ?? r.wins ?? 0,
    drawn: r.drawn ?? r.draws ?? 0,
    lost: r.lost ?? r.losses ?? 0,
    gf: r.goalsFor ?? r.goals_for ?? r.scored ?? 0,
    ga: r.goalsAgainst ?? r.goals_against ?? r.conceded ?? 0,
    pts: r.points ?? 0,
  });

  const WC_COMP_ID = 5930;
  const nowMs = Date.now();
  const dates: string[] = [];
  for (let i = -2; i < 38; i++) {
    dates.push(new Date(nowMs + i * 86_400_000).toISOString().slice(0, 10));
  }

  let tournamentId: number | undefined;
  let seasonId: number | undefined;
  let leagueName = "FIFA World Cup 2026";

  const dayResults = await Promise.race([
    Promise.all(
      dates.map((dt) =>
        getScheduleV2("football", dt).catch(() => [] as SAPIV2Event[]),
      ),
    ),
    new Promise<SAPIV2Event[][]>((resolve) =>
      setTimeout(() => resolve([]), 15_000),
    ),
  ]);
  const events = (
    Array.isArray(dayResults) ? dayResults.flat() : []
  ) as SAPIV2Event[];
  const wcEvent = events.find((ev) => {
    const league = normalizeLeagueName(
      v2TournName(ev.tournament),
      "",
    ).toLowerCase();
    return (
      (league.includes("world cup") ||
        league.includes("copa do mundo") ||
        league.includes("fifa world") ||
        league.includes("wc 2026")) &&
      !league.includes("women") &&
      !league.includes("qualification") &&
      !league.includes("qualif")
    );
  });

  if (wcEvent) {
    leagueName =
      normalizeLeagueName(v2TournName(wcEvent.tournament), "") || leagueName;
    tournamentId = wcEvent.tournamentId;
    seasonId =
      Number(
        (wcEvent as Record<string, unknown>)["seasonId"] ??
          (
            (wcEvent as Record<string, unknown>)["season"] as
              | Record<string, unknown>
              | undefined
          )?.["id"] ??
          0,
      ) || undefined;
    try {
      const matchResp = await fetch(`${SAPI_V2_FOOTBALL}/match/${wcEvent.id}`, {
        signal: AbortSignal.timeout(8_000),
        headers: sapiHeaders(),
      });
      if (matchResp.ok) {
        const matchData = (await matchResp.json()) as Record<string, unknown>;
        const matchRoot =
          (matchData["match"] as Record<string, unknown> | undefined) ??
          ((matchData["data"] as Record<string, unknown> | undefined)?.[
            "match"
          ] as Record<string, unknown> | undefined) ??
          (matchData["event"] as Record<string, unknown> | undefined) ??
          ((matchData["data"] as Record<string, unknown> | undefined)?.[
            "event"
          ] as Record<string, unknown> | undefined);
        const season = matchRoot?.["season"] as
          | Record<string, unknown>
          | undefined;
        const tournament = matchRoot?.["tournament"] as
          | Record<string, unknown>
          | undefined;
        const uniqueTournament = tournament?.["uniqueTournament"] as
          | Record<string, unknown>
          | undefined;
        seasonId = Number(season?.["id"] ?? seasonId ?? 0) || seasonId;
        tournamentId =
          Number(
            uniqueTournament?.["id"] ?? tournament?.["id"] ?? tournamentId ?? 0,
          ) || tournamentId;
        leagueName = String(
          uniqueTournament?.["name"] ?? tournament?.["name"] ?? leagueName,
        );
      }
    } catch {
      // ignore and fall back below
    }
  }

  if (!tournamentId) tournamentId = WC_COMP_ID;
  if (!seasonId) {
    throw new Error("Season da Copa do Mundo indisponivel");
  }

  const stdResp = await fetch(
    `${SAPI_V2_FOOTBALL}/tournament/${tournamentId}/season/${seasonId}/standings`,
    {
      signal: AbortSignal.timeout(8_000),
      headers: sapiHeaders(),
    },
  );
  if (!stdResp.ok) throw new Error("Standings da Copa do Mundo indisponiveis");
  const stdData = (await stdResp.json()) as Record<string, unknown>;
  const groupedCandidates: Array<{ name: string; rows: any[] }> = [];
  const flatRows: any[] = [];
  const seenNodes = new WeakSet<object>();
  const walkStandingsNode = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (seenNodes.has(node as object)) return;
    seenNodes.add(node as object);
    if (Array.isArray(node)) {
      for (const item of node) walkStandingsNode(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    const rawName =
      typeof obj["group"] === "string"
        ? obj["group"]
        : (((obj["group"] as Record<string, unknown> | undefined)?.["name"] as
            | string
            | undefined) ??
          (obj["name"] as string | undefined) ??
          (obj["title"] as string | undefined));
    const nestedRows =
      (Array.isArray(obj["rows"]) ? (obj["rows"] as any[]) : undefined) ??
      (Array.isArray(obj["standings"])
        ? (obj["standings"] as any[])
        : undefined) ??
      (Array.isArray(obj["tableRows"])
        ? (obj["tableRows"] as any[])
        : undefined) ??
      (Array.isArray(obj["table"]) ? (obj["table"] as any[]) : undefined);
    if (
      typeof rawName === "string" &&
      Array.isArray(nestedRows) &&
      nestedRows.length > 0
    ) {
      groupedCandidates.push({ name: rawName, rows: nestedRows });
    }
    if (
      typeof obj["teamName"] === "string" ||
      typeof (obj["team"] as Record<string, unknown> | undefined)?.["name"] ===
        "string" ||
      typeof (obj["team"] as Record<string, unknown> | undefined)?.[
        "shortName"
      ] === "string"
    ) {
      flatRows.push(obj);
    }
    for (const value of Object.values(obj)) walkStandingsNode(value);
  };
  walkStandingsNode(stdData);

  let groups: WC2026StandingGroup[] = [];
  if (groupedCandidates.length > 0) {
    const groupedMap = new Map<string, WC2026StandingRow[]>();
    for (const candidate of groupedCandidates) {
      const name = normalizeWCGroupName(candidate.name);
      const rows = candidate.rows
        .map((r: any, i: number) => parseStandingRow(r, i))
        .filter((row: WC2026StandingRow) => !!assignWC2026Group(row.name));
      if (rows.length === 0) continue;
      const existing = groupedMap.get(name) ?? [];
      const merged = [...existing];
      for (const row of rows) {
        if (
          !merged.some((entry) =>
            wcStandingRowMatchesTeam(entry.name, row.name),
          )
        )
          merged.push(row);
      }
      groupedMap.set(name, merged);
    }
    groups = [...groupedMap.entries()]
      .map(([name, rows]) => ({
        name,
        rows: rows.sort(
          (a, b) =>
            b.pts - a.pts ||
            b.gf - b.ga - (a.gf - a.ga) ||
            b.gf - a.gf ||
            a.pos - b.pos,
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (groups.length === 0 && flatRows.length > 0) {
    const grouped = new Map<string, WC2026StandingRow[]>();
    for (const row of flatRows.map((r: any, i: number) =>
      parseStandingRow(r, i),
    )) {
      const groupName = assignWC2026Group(row.name);
      if (!groupName) continue;
      const existing = grouped.get(groupName) ?? [];
      existing.push(row);
      grouped.set(groupName, existing);
    }
    groups = [...grouped.entries()]
      .map(([name, rows]) => ({
        name,
        rows: rows.sort(
          (a, b) =>
            b.pts - a.pts ||
            b.gf - b.ga - (a.gf - a.ga) ||
            b.gf - a.gf ||
            a.pos - b.pos,
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  groups = WC2026_GROUPS.map((group) => {
    const official = groups.find(
      (entry) => normalizeWCGroupName(entry.name) === `Grupo ${group.group}`,
    );
    const rows = group.teams
      .map((team, idx) => {
        const found = official?.rows.find((row) =>
          wcStandingRowMatchesTeam(row.name, team),
        );
        return (
          found ?? {
            pos: idx + 1,
            name: team,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            gf: 0,
            ga: 0,
            pts: 0,
          }
        );
      })
      .sort(
        (a, b) =>
          b.pts - a.pts ||
          b.gf - b.ga - (a.gf - a.ga) ||
          b.gf - a.gf ||
          a.pos - b.pos,
      );
    return { name: `Grupo ${group.group}`, rows };
  });

  const result = { groups, league: leagueName };
  wc2026StandingsCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

async function _rebuildWC2026(): Promise<void> {
  if (_wc2026Rebuilding) return;
  _wc2026Rebuilding = true;
  try {
    // ── V1 football (primary source — V2 schedule is 503 upstream) ──────────────
    // FIFA World Cup 2026 competition ID in SportsAPI Pro V1: 5930
    // Uses the module-level SAPI_V1_FOOTBALL constant (correct versioned path)
    const WC_COMP_ID = 5930;

    type V1Game = {
      id: number;
      competitionId: number;
      competitionDisplayName?: string;
      groupName?: string;
      startTime?: string;
      statusGroup?: number;
      statusText?: string;
      homeCompetitor?: {
        name?: string;
        id?: number;
        score?: number;
        imageVersion?: number | string;
      };
      awayCompetitor?: {
        name?: string;
        id?: number;
        score?: number;
        imageVersion?: number | string;
      };
      homeScore?: number;
      awayScore?: number;
      minute?: number | string;
      hasBets?: boolean;
    };

    const fetchV1Games = async (path: string): Promise<V1Game[]> => {
      try {
        const r = await fetch(`${SAPI_V1_FOOTBALL}/${path}`, {
          signal: AbortSignal.timeout(8_000),
          headers: sapiHeaders(),
        });
        if (!r.ok) return [];
        const j = (await r.json()) as { data?: { games?: V1Game[] } };
        return j.data?.games ?? [];
      } catch {
        return [];
      }
    };

    // Fetch from 4 V1 sources: all (current round), live, competition-specific games, and current
    // /current returns ~99 games including upcoming WC fixtures beyond today
    const [allGames, liveGames, compGames, currentGames] = await Promise.all([
      fetchV1Games("all"),
      fetchV1Games("live"),
      fetchV1Games(`competition/${WC_COMP_ID}/games`),
      fetchV1Games("current"),
    ]);

    const seenV1 = new Set<number>();
    const wcV1Games: V1Game[] = [];
    for (const g of [
      ...allGames,
      ...liveGames,
      ...compGames,
      ...currentGames,
    ]) {
      if (seenV1.has(g.id)) continue;
      seenV1.add(g.id);
      // statusGroup 4 = Ended — skip finished games
      if ((g.statusGroup ?? 0) === 4) continue;
      // Also skip statusGroup=3 (live) games that started >110 min ago — API can get stuck
      if ((g.statusGroup ?? 0) === 3 && g.startTime) {
        const elapsedMin =
          (Date.now() - new Date(g.startTime).getTime()) / 60_000;
        if (elapsedMin > 110) continue;
      }
      // Skip statusGroup=2 (scheduled/not started) games whose kickoff was >110 min ago
      // — API sometimes keeps games as "scheduled" after they've already finished
      if ((g.statusGroup ?? 0) === 2 && g.startTime) {
        const elapsedMin =
          (Date.now() - new Date(g.startTime).getTime()) / 60_000;
        if (elapsedMin > 110) continue;
      }
      const isWC = g.competitionId === WC_COMP_ID;
      if (isWC) wcV1Games.push(g);
    }

    // Build results from V1 games
    // Try to fetch real V2 pre-match odds for upcoming V1 WC games (same provider, IDs may match)
    const upcomingV1Ids = wcV1Games
      .filter((g) => (g.statusGroup ?? 0) !== 3) // non-live only
      .map((g) => g.id);
    const v2OddsForV1 = new Map<number, V2PreMatchOdds | null>();
    if (upcomingV1Ids.length > 0) {
      const batchSize = 8;
      for (let i = 0; i < upcomingV1Ids.length; i += batchSize) {
        const batch = upcomingV1Ids.slice(i, i + batchSize);
        const results2 = await Promise.all(
          batch.map((id) =>
            getPreMatchOddsV2("football", id).catch(() => null),
          ),
        );
        batch.forEach((id, idx) => v2OddsForV1.set(id, results2[idx] ?? null));
      }
    }

    const results: UpcomingMatch[] = wcV1Games.map((g) => {
      const home = g.homeCompetitor?.name ?? "Unknown";
      const away = g.awayCompetitor?.name ?? "Unknown";
      // Convert ISO start time to PT timezone (Lisbon)
      const dt = g.startTime
        ? new Date(g.startTime)
        : new Date(Date.now() + 86_400_000);
      const day = dt.toLocaleDateString("pt-PT", {
        day: "2-digit",
        timeZone: "Europe/Lisbon",
      });
      const month = dt.toLocaleDateString("pt-PT", {
        month: "2-digit",
        timeZone: "Europe/Lisbon",
      });
      const year = dt.toLocaleDateString("pt-PT", {
        year: "numeric",
        timeZone: "Europe/Lisbon",
      });
      const date = `${day}.${month}.${year}`; // DD.MM.YYYY — matches parseMatchDate in frontend
      const time = dt.toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Lisbon",
      });
      const staticFixture = WC2026_ENABLE_STATIC
        ? findWC2026StaticFixture(home, away, date, time)
        : null;
      const league = staticFixture
        ? `FIFA World Cup - Group ${staticFixture.group}`
        : (g.competitionDisplayName ?? "FIFA World Cup");
      // statusGroup 3 = Live/in-play — expose live data directly
      const isLiveGame = (g.statusGroup ?? 0) === 3;
      // Try real V2 odds for this V1 game ID (same provider — IDs may match)
      const realOdds = v2OddsForV1.get(g.id) ?? null;
      const has1x2 = !!(
        realOdds &&
        realOdds.home > 0 &&
        realOdds.draw > 0 &&
        realOdds.away > 0
      );
      const baseOdds = makeOddsFromTeams(home, away);
      const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
      const odds = has1x2
        ? { home: realOdds!.home, draw: realOdds!.draw, away: realOdds!.away }
        : baseOdds;
      const markets: AdvancedMarkets = {
        ...baseMarkets,
        ...(realOdds?.bttsYes
          ? {
              bothTeamsScore: {
                yes: realOdds.bttsYes,
                no: realOdds.bttsNo ?? 0,
              },
            }
          : {}),
        ...(realOdds?.over25
          ? {
              totalGoals: {
                ...baseMarkets.totalGoals,
                over25: realOdds.over25,
                under25: realOdds.under25 ?? 0,
              },
            }
          : {}),
      };
      const entry: UpcomingMatch = {
        id: `fb-v1-${g.id}`,
        home,
        away,
        league,
        country: "World",
        time,
        date,
        sport: "football",
        hasRealOdds: has1x2,
        odds,
        markets,
        isWomens: false,
        leagueId: String(WC_COMP_ID),
        providerStatusGroup: g.statusGroup,
        providerStatusText: g.statusText,
        homeTeamId:
          g.homeCompetitor?.id != null
            ? String(g.homeCompetitor.id)
            : undefined,
        awayTeamId:
          g.awayCompetitor?.id != null
            ? String(g.awayCompetitor.id)
            : undefined,
        homeImageVersion:
          g.homeCompetitor?.imageVersion != null
            ? String(g.homeCompetitor.imageVersion)
            : undefined,
        awayImageVersion:
          g.awayCompetitor?.imageVersion != null
            ? String(g.awayCompetitor.imageVersion)
            : undefined,
      };
      if (isLiveGame) {
        entry.isLive = true;
        entry.status = g.statusText ?? "Live";
        entry.homeScore = g.homeCompetitor?.score ?? g.homeScore ?? 0;
        entry.awayScore = g.awayCompetitor?.score ?? g.awayScore ?? 0;
        if (g.minute != null) entry.minute = g.minute;
      }
      return entry;
    });

    // Enrich live matches from liveMatchState (WS feed) — covers cases where
    // V1 competition/games doesn't return live scores but V1 WS does.
    // NOTE: LiveMatchState uses .home/.away (not .homeTeam/.awayTeam)
    const normTeam = (s: string) => s.toLowerCase().replace(/[\s.'-]+/g, "");
    for (const result of results) {
      if (result.isLive) continue; // already enriched from V1
      const rH = normTeam(result.home);
      const rA = normTeam(result.away);
      for (const [, ls] of liveMatchState.entries()) {
        if (ls.sport !== "football") continue;
        const lH = normTeam(ls.home);
        const lA = normTeam(ls.away);
        const teamMatches =
          (lH === rH || lH.includes(rH) || rH.includes(lH)) &&
          (lA === rA || lA.includes(rA) || rA.includes(lA));
        if (teamMatches) {
          result.isLive = true;
          result.homeScore = ls.homeScore ?? 0;
          result.awayScore = ls.awayScore ?? 0;
          result.minute = ls.minute;
          result.status = String(ls.status ?? "Live");
          break;
        }
      }
    }

    // ── V2 schedule supplement (to extend upcoming days) ───────────────────────
    let v2FallbackEvents: SAPIV2Event[] = [];
    {
      const WC2026_MAX_DATE_ISO = "2026-06-28";
      const nowMs = Date.now();
      const endMs = new Date(`${WC2026_MAX_DATE_ISO}T23:59:59Z`).getTime();
      const dates: string[] = [];
      if (Number.isFinite(endMs) && nowMs <= endMs) {
        const totalDays = Math.max(
          1,
          Math.floor((endMs - nowMs) / 86_400_000) + 1,
        );
        const daysToFetch = Math.min(20, totalDays);
        for (let i = 0; i < daysToFetch; i++) {
          dates.push(
            new Date(nowMs + i * 86_400_000).toISOString().slice(0, 10),
          );
        }
      }
      if (dates.length > 0) {
        const dayResults = await Promise.race([
          Promise.all(
            dates.map((dt) =>
              getScheduleV2("football", dt).catch(() => [] as SAPIV2Event[]),
            ),
          ),
          new Promise<SAPIV2Event[][]>((resolve) =>
            setTimeout(() => resolve([]), 15_000),
          ),
        ]);
        v2FallbackEvents = (
          Array.isArray(dayResults) ? dayResults.flat() : []
        ) as SAPIV2Event[];
      }
    }

    // ── V2 processing (supplement) ─────────────────────────────────────────────
    const v2Results: UpcomingMatch[] = [];
    if (v2FallbackEvents.length > 0) {
      const seenV2 = new Set<number>();
      const wcEvents: SAPIV2Event[] = [];
      for (const ev of v2FallbackEvents) {
        if (seenV2.has(ev.id)) continue;
        seenV2.add(ev.id);
        const home = v2TeamName(ev.homeTeam);
        const away = v2TeamName(ev.awayTeam);
        if (home === "Unknown" || away === "Unknown") continue;
        const leagueName = normalizeLeagueName(v2TournName(ev.tournament), "");
        const lg = leagueName.toLowerCase();
        const isWCLg =
          Number(ev.tournamentId ?? 0) === WC_COMP_ID ||
          (!ev.tournamentId &&
            (lg.includes("world cup") ||
              lg.includes("copa do mundo") ||
              lg.includes("copa mundial") ||
              lg.includes("fifa world") ||
              lg.includes("wc 2026") ||
              lg.includes("worldcup") ||
              lg.includes("mundial 2026") ||
              lg.includes("coupe du monde")));
        if (!isWCLg) continue;
        if (
          lg.includes("women") ||
          lg.includes("qualification") ||
          lg.includes("qualif") ||
          lg.includes("feminino") ||
          lg.includes("féminin")
        )
          continue;
        if (
          /\bu\d{2}\b|\bunder\s*\d{2}\b|\bsub ?\d{2}\b|beach|futsal|club/i.test(
            lg,
          )
        )
          continue;
        wcEvents.push(ev);
        if (wcEvents.length >= 300) break;
      }
      const oddsResults = await Promise.all(
        wcEvents.map((ev) =>
          getPreMatchOddsV2("football", ev.id).catch(() => null),
        ),
      );
      for (let i = 0; i < wcEvents.length; i++) {
        const ev = wcEvents[i]!;
        const home = v2TeamName(ev.homeTeam);
        const away = v2TeamName(ev.awayTeam);
        const leagueName = normalizeLeagueName(v2TournName(ev.tournament), "");
        const { date, time } = v2EventDateTime(ev);
        const realOdds = oddsResults[i] ?? null;
        const baseOdds = makeOddsFromTeams(home, away);
        const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
        const markets: AdvancedMarkets = {
          ...baseMarkets,
          ...(realOdds?.bttsYes
            ? {
                bothTeamsScore: {
                  yes: realOdds.bttsYes,
                  no: realOdds.bttsNo ?? 0,
                },
              }
            : {}),
          ...(realOdds?.over25
            ? {
                totalGoals: {
                  ...baseMarkets.totalGoals,
                  over25: realOdds.over25,
                  under25: realOdds.under25 ?? 0,
                },
              }
            : {}),
        };
        const hasFull1x2 = !!(
          realOdds &&
          realOdds.home > 0 &&
          realOdds.draw > 0 &&
          realOdds.away > 0
        );
        const odds = hasFull1x2
          ? { home: realOdds!.home, draw: realOdds!.draw, away: realOdds!.away }
          : baseOdds;
        const staticFixture = WC2026_ENABLE_STATIC
          ? findWC2026StaticFixture(home, away, date, time)
          : null;
        v2Results.push({
          id: `fb-v2-${ev.id}`,
          home,
          away,
          league: staticFixture
            ? `FIFA World Cup - Group ${staticFixture.group}`
            : leagueName,
          country: v2TournCountry(ev),
          time,
          date,
          sport: "football",
          hasRealOdds: hasFull1x2,
          odds,
          markets,
          isWomens: false,
          leagueId: ev.tournamentId ? String(ev.tournamentId) : undefined,
          homeTeamId: ev.homeTeamId != null ? String(ev.homeTeamId) : undefined,
          awayTeamId: ev.awayTeamId != null ? String(ev.awayTeamId) : undefined,
        });
      }
    }

    // Merge: V1 is primary, V2 supplements for future dates
    const apiResults: UpcomingMatch[] = [...results, ...v2Results].filter(
      isWC2026ApiFixtureConsistent,
    );

    const staticSupplements: UpcomingMatch[] = [];
    if (WC2026_ENABLE_STATIC) {
      const now = Date.now();
      const apiMatchups = new Set(
        apiResults.map(
          (r) =>
            `${normalizeWC2026PairKey(r.home, r.away)}|${r.date ?? ""}|${r.time ?? ""}`,
        ),
      );
      for (const s of WC2026_STATIC) {
        const startMs = new Date(`${s.date}T${s.time}:00Z`).getTime();
        if (startMs < now - 5 * 60_000) continue;
        const dt2 = new Date(startMs);
        const sDay = dt2.toLocaleDateString("pt-PT", {
          day: "2-digit",
          timeZone: "Europe/Lisbon",
        });
        const sMon = dt2.toLocaleDateString("pt-PT", {
          month: "2-digit",
          timeZone: "Europe/Lisbon",
        });
        const sYr = dt2.toLocaleDateString("pt-PT", {
          year: "numeric",
          timeZone: "Europe/Lisbon",
        });
        const sDate = `${sDay}.${sMon}.${sYr}`;
        const sTime = dt2.toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Lisbon",
        });
        if (
          apiMatchups.has(
            `${normalizeWC2026PairKey(s.home, s.away)}|${sDate}|${sTime}`,
          )
        )
          continue;
        const sOdds = makeOddsFromTeams(s.home, s.away);
        const sMkts = makeAdvancedMarketsFromTeams(s.home, s.away);
        staticSupplements.push({
          id: `wc26-${s.home.toLowerCase().replace(/\s+/g, "-")}-${s.away.toLowerCase().replace(/\s+/g, "-")}-md${s.md}`,
          home: s.home,
          away: s.away,
          league: `FIFA World Cup - Group ${s.group}`,
          country: "World",
          time: sTime,
          date: sDate,
          sport: "football",
          hasRealOdds: false,
          odds: sOdds,
          markets: sMkts,
          isWomens: false,
          leagueId: String(WC_COMP_ID),
          providerStatusGroup: 2,
          providerStatusText: "Not Started",
        } satisfies UpcomingMatch);
      }
    }

    const finalResults = dedupeWC2026Matches([
      ...apiResults,
      ...staticSupplements,
    ]);
    // Sort chronologically
    finalResults.sort((a, b) => {
      try {
        const [adD = "1", adM = "1", adY = "2026"] = a.date.split(".");
        const [bdD = "1", bdM = "1", bdY = "2026"] = b.date.split(".");
        const ta = new Date(`${adY}-${adM}-${adD}T${a.time}:00`).getTime();
        const tb = new Date(`${bdY}-${bdM}-${bdD}T${b.time}:00`).getTime();
        return ta - tb;
      } catch {
        return 0;
      }
    });

    if (finalResults.length > 0 || !wc2026Cache) {
      wc2026Cache = { matches: finalResults, fetchedAt: Date.now() };
    } else if (!WC2026_ENABLE_STATIC) {
      wc2026Cache = { matches: [], fetchedAt: Date.now() };
    } else {
      wc2026Cache = { matches: wc2026Cache.matches, fetchedAt: Date.now() };
    }
  } finally {
    _wc2026Rebuilding = false;
  }
}

async function buildWC2026Matches(): Promise<UpcomingMatch[]> {
  const now = Date.now();
  // Fresh cache → return immediately
  if (wc2026Cache && now - wc2026Cache.fetchedAt < WC2026_TTL) {
    return wc2026Cache.matches;
  }
  // Stale cache → return stale immediately, rebuild in background
  if (wc2026Cache) {
    _rebuildWC2026().catch(() => {});
    return wc2026Cache.matches;
  }
  // No cache at all → must wait (only happens on cold start, warm-up handles this)
  await _rebuildWC2026();
  // Cast needed: TS narrows wc2026Cache to null above, but _rebuildWC2026 sets it
  const cached = wc2026Cache as {
    matches: UpcomingMatch[];
    fetchedAt: number;
  } | null;
  return cached ? cached.matches : [];
}

// Helper: parse a WC match start time (date = "DD.MM.YYYY", time = "HH:MM" in Lisbon/WEST = UTC+1)
// Returns UTC milliseconds.
function parseWCStartUtcMs(date: string, time: string): number {
  try {
    const [dd = "1", mm = "1", yyyy = "2026"] = date.split(".");
    // Interpret as Lisbon WEST (UTC+1 in June); subtract 1h to get UTC
    return new Date(`${yyyy}-${mm}-${dd}T${time}:00Z`).getTime() - 60 * 60_000;
  } catch {
    return 0;
  }
}

router.get("/wc2026", async (_req: Request, res: Response) => {
  try {
    const matches = await Promise.race([
      buildWC2026Matches(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 25_000),
      ),
    ]);

    // Always enrich with FRESH liveMatchState data — bypasses 3-min cache so live
    // scores/status/suspensions are current on every request.
    const normT = (s: string) => s.toLowerCase().replace(/[\s.'-]+/g, "");
    const nowMs = Date.now();
    const foundInLive = new Set<string>(); // track which match IDs were found in liveMatchState

    const enriched = matches.map((m) => {
      const rH = normT(m.home);
      const rA = normT(m.away);
      for (const [, ls] of liveMatchState.entries()) {
        if (ls.sport !== "football") continue;
        const lH = normT(ls.home);
        const lA = normT(ls.away);
        if (
          (lH === rH || lH.includes(rH) || rH.includes(lH)) &&
          (lA === rA || lA.includes(rA) || rA.includes(lA))
        ) {
          foundInLive.add(m.id);
          // Check if liveMatchState reports this as finished
          const lsStatus = String(ls.status ?? "").toLowerCase();
          const isFinished =
            lsStatus === "finished" ||
            lsStatus === "ended" ||
            lsStatus === "ft" ||
            lsStatus === "aet";
          if (isFinished) {
            // Game just finished — mark as not live, keep final score
            return {
              ...m,
              isLive: false,
              status: "Finished",
              homeScore: ls.homeScore ?? 0,
              awayScore: ls.awayScore ?? 0,
              marketSuspension: undefined,
              _suspensionReason: undefined,
            };
          }
          return {
            ...m,
            isLive: true,
            homeScore: ls.homeScore ?? 0,
            awayScore: ls.awayScore ?? 0,
            minute: ls.minute,
            status: String(ls.status ?? "Live"),
            marketSuspension: ls.marketSuspension ? { ...ls.marketSuspension } : undefined,
            _suspensionReason: ls._suspensionReason ?? undefined,
            _liveExtra: ls._liveExtra,
            redCardsHome: ls.redCardsHome,
            redCardsAway: ls.redCardsAway,
            odds: ls.odds ?? m.odds,
            markets: ls.markets ?? m.markets,
          };
        }
      }
      // Not found in liveMatchState — auto-expire stale live matches
      if (m.isLive && !foundInLive.has(m.id)) {
        const startUtcMs = parseWCStartUtcMs(m.date, m.time);
        const elapsedMin = (nowMs - startUtcMs) / 60_000;
        // 120 min = 90 min game + 15 min stoppage + 15 min grace
        if (startUtcMs > 0 && elapsedMin > 120) {
          return {
            ...m,
            isLive: false,
            status: "Finished",
            minute: undefined,
            marketSuspension: undefined,
            _suspensionReason: undefined,
          };
        }
      }
      return m;
    });

    // Filter: hide finished matches and also hide stale scheduled matches whose
    // kickoff is already well in the past but the provider never flipped status.
    const WC2026_STALE_UPCOMING_GRACE_MIN = 30;
    const visible = enriched.filter((m) => {
      if (m.status === "Finished") return false;
      if (m.isLive) return true;
      const startUtcMs = parseWCStartUtcMs(m.date, m.time);
      if (startUtcMs <= 0) return true;
      return nowMs - startUtcMs <= WC2026_STALE_UPCOMING_GRACE_MIN * 60_000;
    });

    res.json({ matches: visible });
  } catch {
    res.json({ matches: wc2026Cache?.matches ?? [] });
  }
});

async function getWCH2H(rawMatchId: string): Promise<WCH2HData> {
  const cached = wc2026H2HCache.get(rawMatchId);
  if (cached && Date.now() - cached.fetchedAt < WC2026_H2H_TTL) return cached.data;

  const numericId = rawMatchId.replace(/^fb-(v1|v2)-/, "");

  const parseEvent = (ev: any, isH2H: boolean): H2HEvent | null => {
    try {
      const home =
        ev.homeTeam?.name ?? ev.home?.name ?? ev.home ?? "";
      const away =
        ev.awayTeam?.name ?? ev.away?.name ?? ev.away ?? "";
      if (!home || !away) return null;
      const homeScore =
        ev.homeScore?.current ?? ev.homeScore?.normaltime ?? ev.score?.home ?? null;
      const awayScore =
        ev.awayScore?.current ?? ev.awayScore?.normaltime ?? ev.score?.away ?? null;
      const dateRaw =
        ev.startTimestamp ?? ev.startTime ?? ev.date ?? null;
      let date = "";
      if (typeof dateRaw === "number") {
        date = new Date(dateRaw * 1000).toISOString().slice(0, 10);
      } else if (typeof dateRaw === "string") {
        date = dateRaw.slice(0, 10);
      }
      const tournament =
        ev.tournament?.name ?? ev.league?.name ?? ev.competition?.name ?? "";
      return { date, home, away, homeScore, awayScore, tournament, isH2H };
    } catch {
      return null;
    }
  };

  try {
    const resp = await fetch(
      `${SAPI_V2_FOOTBALL}/match/${numericId}/h2h`,
      { signal: AbortSignal.timeout(8_000), headers: sapiHeaders() },
    );
    if (!resp.ok) throw new Error(`H2H API error ${resp.status}`);
    const raw = (await resp.json()) as Record<string, unknown>;

    const root =
      (raw["h2h"] as Record<string, unknown> | undefined) ??
      (raw["data"] as Record<string, unknown> | undefined) ??
      raw;

    const eventsRaw: any[] =
      (Array.isArray(root["events"]) ? root["events"] : undefined) ??
      (Array.isArray(root["lastH2H"]) ? root["lastH2H"] : undefined) ??
      (Array.isArray(root["h2hEvents"]) ? root["h2hEvents"] : undefined) ??
      [];
    const homeFormRaw: any[] =
      (Array.isArray(root["homeTeamEvents"]) ? root["homeTeamEvents"] : undefined) ??
      (Array.isArray(root["homeLastMatches"]) ? root["homeLastMatches"] : undefined) ??
      [];
    const awayFormRaw: any[] =
      (Array.isArray(root["awayTeamEvents"]) ? root["awayTeamEvents"] : undefined) ??
      (Array.isArray(root["awayLastMatches"]) ? root["awayLastMatches"] : undefined) ??
      [];

    const h2hEvents = eventsRaw
      .map((e) => parseEvent(e, true))
      .filter(Boolean)
      .slice(0, 10) as H2HEvent[];
    const homeRecentForm = homeFormRaw
      .map((e) => parseEvent(e, false))
      .filter(Boolean)
      .slice(0, 5) as H2HEvent[];
    const awayRecentForm = awayFormRaw
      .map((e) => parseEvent(e, false))
      .filter(Boolean)
      .slice(0, 5) as H2HEvent[];

    const homeTeam =
      h2hEvents[0]?.home ?? homeRecentForm[0]?.home ?? "";
    const awayTeam =
      h2hEvents[0]?.away ?? awayRecentForm[0]?.away ?? "";

    const result: WCH2HData = { h2hEvents, homeRecentForm, awayRecentForm, homeTeam, awayTeam };
    wc2026H2HCache.set(rawMatchId, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    const empty: WCH2HData = { h2hEvents: [], homeRecentForm: [], awayRecentForm: [], homeTeam: "", awayTeam: "" };
    return empty;
  }
}

router.get("/wc2026-h2h/:matchId", async (req: Request, res: Response) => {
  try {
    const matchId = String(req.params["matchId"]);
    const data = await Promise.race([
      getWCH2H(matchId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 12_000),
      ),
    ]);
    res.json(data);
  } catch {
    res.json({ h2hEvents: [], homeRecentForm: [], awayRecentForm: [], homeTeam: "", awayTeam: "" });
  }
});

router.get("/wc2026-standings", async (_req: Request, res: Response) => {
  try {
    const data = await Promise.race([
      getWC2026Standings(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 20_000),
      ),
    ]);
    res.json(data);
  } catch {
    res.json({ groups: [], league: "FIFA World Cup 2026" });
  }
});

router.get("/wc2026-competition", async (_req: Request, res: Response) => {
  try {
    const data = await Promise.race([
      getWC2026CompetitionSections(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 20_000),
      ),
    ]);
    res.json(data);
  } catch {
    res.json({ sections: [] });
  }
});

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UPCOMING_DEFAULT_PRIORITY_DAYS = 7;

router.get("/upcoming", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "all");
  const range = String(req.query["range"] ?? "default");
  const cache = upcomingTopCache
    ? await getUpcomingAll()
    : await Promise.race([
        getUpcomingAll(),
        waitMs(1500).then(
          () =>
            upcomingTopCache ?? {
              football: [],
              tennis: [],
              basketball: [],
              hockey: [],
              volleyball: [],
              baseball: [],
              boxing: [],
              cricket: [],
              handball: [],
              formula1: [],
              fetchedAt: Date.now(),
            },
        ),
      ]);
  let matches: UpcomingMatch[];
  if (sport === "football") matches = cache.football;
  else if (sport === "tennis") matches = cache.tennis;
  else if (sport === "basketball") matches = cache.basketball;
  else if (sport === "hockey") matches = cache.hockey;
  else if (sport === "volleyball") matches = cache.volleyball;
  else if (sport === "baseball") matches = cache.baseball;
  else if (sport === "boxing") matches = cache.boxing;
  else if (sport === "cricket") matches = cache.cricket;
  else if (sport === "handball") matches = cache.handball;
  else if (sport === "formula1") matches = cache.formula1;
  else
    matches = [
      ...cache.football,
      ...cache.tennis,
      ...cache.basketball,
      ...cache.hockey,
      ...cache.volleyball,
      ...cache.baseball,
      ...cache.boxing,
      ...cache.cricket,
      ...cache.handball,
      ...cache.formula1,
    ];
  const isPlaceholderTeamName = (name: string): boolean => {
    const n = String(name ?? "").trim();
    if (!n) return true;
    // Knockout placeholder patterns: "1st teams", "2nd teams", "Winner Group A", "TBD", etc.
    if (/^\d+(st|nd|rd|th)\s*(team|place|group)?s?$/i.test(n)) return true;
    if (/^winner\s*(of\s*)?(group|matchday|round|match)?\s*[A-Za-z0-9]*$/i.test(n) && n.length < 20) return true;
    if (/^group\s*[A-Za-z]\s*(winner|1st|2nd|runner)/i.test(n)) return true;
    if (/^(tbd|to be determined|tba)$/i.test(n)) return true;
    return false;
  };
  const liveIds = new Set<string>();
  const liveIdentityKeys = new Set<string>();
  for (const state of liveMatchState.values()) {
    if (!state || isFinishedVisibilityStatus(state.status)) continue;
    liveIds.add(String(state.id));
    liveIdentityKeys.add(
      normalizeUpcomingVisibilityKey({
        sport: state.sport,
        home: state.home,
        away: state.away,
        league: state.league,
      }),
    );
  }
  const UPCOMING_POST_KICKOFF_GRACE_MS = 30 * 60 * 1000;
  const now = Date.now();
  const filtered = matches.filter(
    (m) =>
      m.odds?.home > 0 &&
      m.odds?.away > 0 &&
      !isPlaceholderTeamName(m.home) &&
      !isPlaceholderTeamName(m.away) &&
      !finishedMatchResults.has(String(m.id)) &&
      !liveIds.has(String(m.id)) &&
      !liveIdentityKeys.has(normalizeUpcomingVisibilityKey(m)) &&
      (() => {
        const kickoffMs = parseUpcomingKickoffMs(m);
        if (kickoffMs == null) return true;
        return now - kickoffMs <= UPCOMING_POST_KICKOFF_GRACE_MS;
      })() &&
      (() => {
        // Default view: ALL matches (any sport / any league) shown up to
        // UPCOMING_DEFAULT_PRIORITY_DAYS (7 days) ahead. This replaces the
        // previous "only priority football leagues had a cap; everything else
        // could stretch to the full fetched window" behaviour — user request
        // 2026-08-13: filtering on the prematch tab should default to 7 days.
        // ?range=month lifts this cap so all cached fixtures are included.
        if (range === "month") return true;
        const kickoffMs = parseUpcomingKickoffMs(m);
        if (kickoffMs == null) return true;
        const daysAhead = Math.floor(
          (kickoffMs - now) / (24 * 60 * 60 * 1000),
        );
        return daysAhead <= UPCOMING_DEFAULT_PRIORITY_DAYS;
      })(),
  );
  res.json({ matches: filtered });
});

router.get("/", async (_req: Request, res: Response) => {
  // All sports data providers disconnected here too (explicit user decision,
  // 2026-08-06) — see rebuildUpcomingCache/buildLivePayload for the full
  // rationale. This legacy route isn't used by the frontend's actual live
  // (/live) or prematch (/upcoming) pages, so it's just short-circuited
  // rather than left calling Statpal/PulseScore for a response nothing reads.
  res.json({ live: [], upcoming: [] });
});

// ─── Stats endpoint ───────────────────────────────────────────────────────────

type FormEntry = {
  result: "W" | "D" | "L";
  score: string;
  opponent: string;
  home: boolean;
};

router.get("/stats", async (req: Request, res: Response) => {
  const home = String(req.query["home"] ?? "");
  const away = String(req.query["away"] ?? "");
  const sport = String(req.query["sport"] ?? "football");
  const leagueQuery = String(req.query["league"] ?? "");
  const countryQuery = String(req.query["country"] ?? "");
  const homeOdd = parseFloat(String(req.query["homeOdd"] ?? "2")) || 2;
  const drawOdd = parseFloat(String(req.query["drawOdd"] ?? "3.5")) || 3.5;
  const awayOdd = parseFloat(String(req.query["awayOdd"] ?? "3")) || 3;

  const rawHome = 1 / homeOdd;
  const rawDraw = 1 / drawOdd;
  const rawAway = 1 / awayOdd;
  const tot = rawHome + rawDraw + rawAway;
  const homeProb = Math.round((rawHome / tot) * 100);
  const drawProb = Math.round((rawDraw / tot) * 100);
  const awayProb = 100 - homeProb - drawProb;

  const seed = [...(home + away)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (min: number, max: number, s: number) => {
    const x = Math.abs(Math.sin(seed * s + s) * 73856093);
    return Math.round((min + (x - Math.floor(x)) * (max - min)) * 10) / 10;
  };
  const ri = (min: number, max: number, s: number) =>
    Math.floor(rng(min, max + 1, s));

  // Sport-specific fallback pools
  type FormEntry = {
    result: "W" | "D" | "L";
    score: string;
    opponent: string;
    home: boolean;
  };

  interface SportConfig {
    opponents: string[];
    pool: Array<{ result: "W" | "D" | "L"; score: string }>;
    hasDraw: boolean;
    avgGoalsLabel?: number;
  }

  const sportConfigs: Record<string, SportConfig> = {
    basketball: {
      opponents: [
        "Lakers",
        "Celtics",
        "Warriors",
        "Heat",
        "Bucks",
        "Nuggets",
        "Suns",
        "Nets",
        "76ers",
        "Clippers",
        "Raptors",
        "Mavericks",
        "Cavaliers",
        "Bulls",
        "Spurs",
      ],
      pool: [
        { result: "W", score: "112-104" },
        { result: "W", score: "98-87" },
        { result: "W", score: "125-110" },
        { result: "W", score: "103-99" },
        { result: "L", score: "95-107" },
        { result: "L", score: "88-102" },
        { result: "L", score: "101-115" },
        { result: "W", score: "118-109" },
        { result: "L", score: "97-110" },
        { result: "W", score: "108-96" },
        { result: "L", score: "84-91" },
      ],
      hasDraw: false,
      avgGoalsLabel: 108,
    },
    tennis: {
      opponents: [
        "Djokovic",
        "Alcaraz",
        "Sinner",
        "Medvedev",
        "Zverev",
        "Rublev",
        "Ruud",
        "Fritz",
        "Swiatek",
        "Sabalenka",
        "Gauff",
        "Rybakina",
        "Paolini",
        "Kasatkina",
        "Navarro",
      ],
      pool: [
        { result: "W", score: "2-0" },
        { result: "W", score: "2-1" },
        { result: "W", score: "2-0" },
        { result: "L", score: "0-2" },
        { result: "L", score: "1-2" },
        { result: "W", score: "2-1" },
        { result: "L", score: "0-2" },
        { result: "W", score: "2-0" },
        { result: "L", score: "1-2" },
        { result: "W", score: "2-1" },
        { result: "L", score: "0-2" },
      ],
      hasDraw: false,
    },
    hockey: {
      opponents: [
        "Bruins",
        "Lightning",
        "Avalanche",
        "Golden Knights",
        "Maple Leafs",
        "Canadiens",
        "Rangers",
        "Hurricanes",
        "Oilers",
        "Flames",
        "Panthers",
        "Stars",
        "SKA",
        "CSKA",
        "Metallurg",
      ],
      pool: [
        { result: "W", score: "4-2" },
        { result: "W", score: "3-1" },
        { result: "W", score: "5-3" },
        { result: "W", score: "2-1" },
        { result: "D", score: "2-2 (OT)" },
        { result: "L", score: "1-3" },
        { result: "L", score: "2-4" },
        { result: "W", score: "3-2 (OT)" },
        { result: "L", score: "0-2" },
        { result: "L", score: "1-4" },
        { result: "W", score: "4-1" },
      ],
      hasDraw: true,
      avgGoalsLabel: 5.8,
    },
    volleyball: {
      opponents: [
        "Brazil VB",
        "Italy VB",
        "Poland VB",
        "France VB",
        "USA VB",
        "Japan VB",
        "Trentino",
        "Lube",
        "Zenit Kazan",
        "Dinamo Moscow",
        "Cruzeiro",
        "Sesi Franca",
        "Perugia",
        "Modena",
        "Resovia",
      ],
      pool: [
        { result: "W", score: "3-0" },
        { result: "W", score: "3-1" },
        { result: "W", score: "3-2" },
        { result: "L", score: "0-3" },
        { result: "L", score: "1-3" },
        { result: "W", score: "3-1" },
        { result: "L", score: "2-3" },
        { result: "W", score: "3-0" },
        { result: "L", score: "1-3" },
        { result: "W", score: "3-2" },
        { result: "L", score: "0-3" },
      ],
      hasDraw: false,
    },
  };

  const cfg = sportConfigs[sport] ?? {
    opponents: [
      "Arsenal",
      "Chelsea",
      "Liverpool",
      "Man City",
      "Tottenham",
      "Newcastle",
      "Brighton",
      "Juventus",
      "Bayern",
      "Roma",
      "PSG",
      "Inter",
      "Dortmund",
      "Sevilla",
      "Benfica",
    ],
    pool: [
      { result: "W" as const, score: "2-0" },
      { result: "W" as const, score: "1-0" },
      { result: "W" as const, score: "3-1" },
      { result: "W" as const, score: "2-1" },
      { result: "D" as const, score: "1-1" },
      { result: "D" as const, score: "0-0" },
      { result: "D" as const, score: "2-2" },
      { result: "L" as const, score: "0-1" },
      { result: "L" as const, score: "1-2" },
      { result: "L" as const, score: "0-2" },
      { result: "W" as const, score: "4-0" },
    ],
    hasDraw: true,
    avgGoalsLabel: undefined as number | undefined,
  };

  // h2h proportional to implied probability from odds
  const totalH2H = ri(16, 28, 99.1);
  const rawHomeWins = Math.round(
    totalH2H * (homeProb / 100) + (ri(0, 3, 1.1) - 1.5),
  );
  const rawAwayWins = Math.round(
    totalH2H * (awayProb / 100) + (ri(0, 3, 3.7) - 1.5),
  );
  const homeWins = Math.max(1, rawHomeWins);
  const awayWins = Math.max(1, rawAwayWins);
  const draws = cfg.hasDraw ? Math.max(0, totalH2H - homeWins - awayWins) : 0;
  const avgGoals = rng(2.1, 3.2, 4.1);
  const over15 = Math.min(94, Math.max(66, ri(68, 92, 5.3)));
  const over25 = Math.min(74, Math.max(36, ri(42, 70, 6.1)));
  const cards = rng(3.0, 4.5, 7.2);
  const corners = rng(9.5, 12.5, 8.4);
  const btts = ri(40, 62, 12.1);

  let homeForm: FormEntry[] = [];
  let awayForm: FormEntry[] = [];

  const realHomeCount = homeForm.length;
  const realAwayCount = awayForm.length;

  if (homeForm.length < 5) {
    homeForm = Array.from({ length: 5 }, (_, i) => {
      const fp = cfg.pool[ri(0, cfg.pool.length - 1, i + 1.13)]!;
      return {
        result: fp.result,
        score: fp.score,
        opponent: cfg.opponents[ri(0, cfg.opponents.length - 1, i + 2.27)]!,
        home: i % 2 === 0,
      };
    });
  }
  if (awayForm.length < 5) {
    awayForm = Array.from({ length: 5 }, (_, i) => {
      const fp = cfg.pool[ri(0, cfg.pool.length - 1, i + 4.31)]!;
      return {
        result: fp.result,
        score: fp.score,
        opponent: cfg.opponents[ri(0, cfg.opponents.length - 1, i + 5.47)]!,
        home: i % 2 === 1,
      };
    });
  }

  // Only expose form when BOTH sides came from the real Statpal API
  const formIsReal = realHomeCount >= 5 && realAwayCount >= 5;

  // --- H2H recent match results (last 5 encounters) ---
  const h2hMatches = Array.from({ length: 5 }, (_, i) => {
    const daysAgo = 30 + i * 75 + ri(0, 30, i + 50.1);
    const d = new Date(Date.now() - daysAgo * 86400000);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const homeFirst = ri(0, 1, i + 70.1) === 0;
    const mHome = homeFirst ? home : away;
    const mAway = homeFirst ? away : home;
    const r = ri(0, 99, i + 71.1);
    const isHW = homeFirst ? r < homeProb : r < awayProb;
    const isDr =
      !isHW && cfg.hasDraw && ri(0, 59, i + 72.1) < Math.round(drawProb * 0.6);
    let hS: number, aS: number;
    if (isDr) {
      hS = ri(0, 2, i + 73.1);
      aS = hS;
    } else if (isHW) {
      hS = ri(1, 3, i + 73.1);
      aS = Math.max(0, hS - ri(1, 2, i + 74.1));
    } else {
      aS = ri(1, 3, i + 75.1);
      hS = Math.max(0, aS - ri(1, 2, i + 76.1));
    }
    return {
      date: `${dd}/${mm}/${yyyy}`,
      home: mHome,
      homeScore: hS,
      away: mAway,
      awayScore: aS,
    };
  });

  // --- League standings ---
  // Do NOT default to "england" — use only the actual league name sent by the client.
  // Real table from API-Football when it can resolve this league (any
  // country/tier it covers — not limited to a curated list), falling back to
  // buildLeagueStandings's fully-synthetic filler table (fake team names,
  // pseudo-random points) only when API-Football has no key configured,
  // fails, or genuinely doesn't carry this particular league.
  let standingsData = buildLeagueStandings(leagueQuery, home, away);
  if (sport === "football" && leagueQuery.trim()) {
    try {
      const real = await getApiFootballStandingsForLeague(leagueQuery, countryQuery);
      if (real && real.teams.length > 0) {
        standingsData = {
          league: real.leagueName || leagueQuery,
          teams: real.teams.map((t) => ({
            pos: t.rank,
            name: t.teamName,
            played: t.played,
            won: t.win,
            drawn: t.draw,
            lost: t.lose,
            gf: t.goalsFor,
            ga: t.goalsAgainst,
            pts: t.points,
          })),
        };
      }
    } catch (err) {
      logger.error({ err, league: leagueQuery }, "[api-football] standings lookup failed for /stats — keeping synthetic fallback");
    }
  }

  // Lineups: never generate fake players — real data is fetched by clients via /v2-lineups
  const lineups = null;

  res.json({
    formIsReal,
    winProb: { home: homeProb, draw: drawProb, away: awayProb },
    h2h: { homeWins, draws, awayWins },
    avgStats: {
      goalsScored: avgGoals,
      leagueGoals: rng(2.4, 2.8, 9.1),
      over15,
      leagueOver15: Math.max(62, over15 - ri(3, 8, 10.1)),
      over25,
      leagueOver25: Math.max(32, over25 - ri(2, 6, 11.1)),
      cards,
      corners,
      btts,
      leagueBtts: Math.max(35, btts - ri(2, 7, 13.1)),
    },
    homeForm,
    awayForm,
    h2hMatches,
    standings: standingsData,
    lineups,
  });
});

// ─── Standings endpoint + league data ────────────────────────────────────────

// ─── Known league team lists (for standings generation) ───────────────────────
// IMPORTANT: patterns must be specific enough to avoid cross-league false matches.
// Never use a bare generic name (e.g. "super league", "liga 1", "primeira liga",
// "serie a") that could collide with another country's competition.
// Use country-qualified patterns like "greece:super" or "super league greece".
const LEAGUE_TEAMS: Array<{
  patterns: string[];
  name: string;
  teams: string[];
}> = [
  // ── England ──────────────────────────────────────────────────────────────────
  {
    patterns: [
      "premier league",
      "england:premier",
      "england:top",
      "england premier",
    ],
    name: "Premier League",
    teams: [
      "Manchester City",
      "Arsenal",
      "Liverpool",
      "Aston Villa",
      "Tottenham",
      "Chelsea",
      "Newcastle",
      "Manchester Utd",
      "West Ham",
      "Brighton",
      "Wolves",
      "Brentford",
      "Fulham",
      "Everton",
      "Crystal Palace",
      "Nottingham Forest",
      "Bournemouth",
      "Burnley",
      "Luton",
      "Sheffield Utd",
    ],
  },
  {
    patterns: [
      "efl championship",
      "england:championship",
      "england championship",
    ],
    name: "EFL Championship",
    teams: [
      "Leicester City",
      "Leeds Utd",
      "Ipswich",
      "Southampton",
      "West Brom",
      "Norwich",
      "Watford",
      "Middlesbrough",
      "Coventry",
      "Sheffield Wed",
      "Stoke",
      "Millwall",
      "Preston",
      "Swansea",
      "Hull",
      "Cardiff",
      "QPR",
      "Blackburn",
      "Sunderland",
      "Bristol City",
      "Rotherham",
      "Huddersfield",
      "Birmingham",
      "Plymouth",
    ],
  },
  {
    patterns: ["league one", "england:league one", "england league one"],
    name: "League One",
    teams: [
      "Derby County",
      "Portsmouth",
      "Bolton",
      "Oxford Utd",
      "Bristol Rovers",
      "Exeter",
      "Peterborough",
      "Barnsley",
      "Charlton",
      "Leyton Orient",
      "Lincoln",
      "Burton",
      "Northampton",
      "Reading",
      "Cambridge",
      "Shrewsbury",
      "Port Vale",
      "Stevenage",
      "Cheltenham",
      "Fleetwood",
      "Wycombe",
      "Blackpool",
      "Morecambe",
      "Forest Green",
    ],
  },
  // ── Spain ─────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "laliga",
      "la liga",
      "primera division",
      "primera división",
      "spain:top",
      "spain:laliga",
      "liga española",
    ],
    name: "LaLiga",
    teams: [
      "Real Madrid",
      "Barcelona",
      "Atletico Madrid",
      "Athletic Club",
      "Real Sociedad",
      "Villarreal",
      "Real Betis",
      "Valencia",
      "Osasuna",
      "Sevilla",
      "Getafe",
      "Rayo Vallecano",
      "Alaves",
      "Celta Vigo",
      "Mallorca",
      "Las Palmas",
      "Girona",
      "Cadiz",
      "Granada",
      "Almeria",
    ],
  },
  {
    patterns: [
      "laliga 2",
      "segunda division",
      "segunda división",
      "spain:second",
      "spain segunda",
    ],
    name: "LaLiga 2",
    teams: [
      "Sporting Gijon",
      "Racing Santander",
      "Elche",
      "Levante",
      "Valladolid",
      "Huesca",
      "Zaragoza",
      "Tenerife",
      "Albacete",
      "Mirandes",
      "Leganes",
      "Oviedo",
      "Burgos",
      "Cartagena",
      "Eibar",
      "Ferrol",
      "Andorra",
      "Eldense",
      "Amorebieta",
      "Alcorcon",
    ],
  },
  // ── Germany ───────────────────────────────────────────────────────────────────
  {
    patterns: [
      "bundesliga",
      "germany:top",
      "germany:bundesliga",
      "german bundesliga",
      "1. bundesliga",
    ],
    name: "Bundesliga",
    teams: [
      "Bayern Munich",
      "Bayer Leverkusen",
      "RB Leipzig",
      "Borussia Dortmund",
      "VfB Stuttgart",
      "Eintracht Frankfurt",
      "SC Freiburg",
      "B. Monchengladbach",
      "Union Berlin",
      "Hoffenheim",
      "Augsburg",
      "Wolfsburg",
      "Mainz",
      "Bochum",
      "Koln",
      "Werder Bremen",
      "Heidenheim",
      "Darmstadt",
    ],
  },
  {
    patterns: [
      "2. bundesliga",
      "2.bundesliga",
      "germany:second",
      "german second",
    ],
    name: "2. Bundesliga",
    teams: [
      "HSV",
      "FC Schalke",
      "Fortuna Dusseldorf",
      "Karlsruher SC",
      "Hertha Berlin",
      "1. FC Nurnberg",
      "SpVgg Greuther Furth",
      "SV Darmstadt",
      "FC Paderborn",
      "Holstein Kiel",
      "FC St. Pauli",
      "Hannover 96",
      "VfL Osnabruck",
      "SV Elversberg",
      "1. FC Magdeburg",
      "Wehen Wiesbaden",
      "FC Kaiserslautern",
      "Eintracht Braunschweig",
    ],
  },
  // ── Italy ─────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "italy:top",
      "italy:serie a",
      "serie a italia",
      "italian serie a",
      "calcio serie a",
      "serie a tim",
    ],
    name: "Serie A",
    teams: [
      "Inter",
      "AC Milan",
      "Juventus",
      "Napoli",
      "Atalanta",
      "AS Roma",
      "SS Lazio",
      "Fiorentina",
      "Bologna",
      "Torino",
      "Monza",
      "Genoa",
      "Lecce",
      "Hellas Verona",
      "Cagliari",
      "Empoli",
      "Frosinone",
      "Udinese",
      "Salernitana",
      "Sassuolo",
    ],
  },
  {
    patterns: [
      "italy:serie b",
      "italy:second",
      "serie b italia",
      "italian serie b",
    ],
    name: "Serie B",
    teams: [
      "Parma",
      "Como",
      "Venezia",
      "Palermo",
      "Cremonese",
      "Catanzaro",
      "Sampdoria",
      "Modena",
      "Bari",
      "Ternana",
      "Cosenza",
      "Spezia",
      "Cittadella",
      "Sudtirol",
      "Ascoli",
      "Reggiana",
      "Lecco",
      "FeralpiSalo",
      "Brescia",
      "Pisa",
      "Cesena",
      "Carrarese",
      "Mantova",
    ],
  },
  // ── France ────────────────────────────────────────────────────────────────────
  {
    patterns: ["ligue 1", "france:top", "france:ligue 1", "french ligue 1"],
    name: "Ligue 1",
    teams: [
      "PSG",
      "Monaco",
      "Lille",
      "Marseille",
      "Lyon",
      "Nice",
      "Rennes",
      "Lens",
      "Reims",
      "Strasbourg",
      "Toulouse",
      "Montpellier",
      "Brest",
      "Nantes",
      "Metz",
      "Le Havre",
      "Lorient",
      "Clermont",
      "Auxerre",
      "Troyes",
    ],
  },
  {
    patterns: ["ligue 2", "france:second", "french ligue 2"],
    name: "Ligue 2",
    teams: [
      "Grenoble",
      "Amiens",
      "Pau FC",
      "Laval",
      "Rodez",
      "Guingamp",
      "Caen",
      "Quevilly Rouen",
      "Annecy",
      "Concarneau",
      "Valenciennes",
      "Bastia",
      "Dunkerque",
      "Niort",
      "Angers",
      "St Etienne",
      "Charleville",
    ],
  },
  // ── Portugal ──────────────────────────────────────────────────────────────────
  {
    patterns: [
      "liga portugal",
      "portugal:top",
      "portugal:liga",
      "ligabwin",
      "liga bwin",
      "liga betclic",
      "primeira liga portugal",
      "portuguese primeira",
      "liga nos",
    ],
    name: "Liga Portugal",
    teams: [
      "Benfica",
      "Sporting CP",
      "Porto",
      "Braga",
      "Vitoria Guimaraes",
      "Famalicao",
      "Casa Pia",
      "Moreirense",
      "Estoril",
      "Arouca",
      "Vizela",
      "Rio Ave",
      "Boavista",
      "Chaves",
      "Estrela Amadora",
      "Portimonense",
      "Santa Clara",
      "Gil Vicente",
    ],
  },
  {
    patterns: [
      "liga portugal 2",
      "liga sabseg",
      "portugal:second",
      "portuguese second",
    ],
    name: "Liga Portugal 2",
    teams: [
      "Academico de Viseu",
      "Leixoes",
      "Penafiel",
      "Mafra",
      "Tondela",
      "Feirense",
      "Oliveirense",
      "Varzim",
      "Vilafranquense",
      "Sporting B",
      "Benfica B",
      "Porto B",
      "Braga B",
      "Maritimo",
      "Nacional",
      "Avs",
      "Cova da Piedade",
    ],
  },
  // ── Netherlands ───────────────────────────────────────────────────────────────
  {
    patterns: [
      "eredivisie",
      "netherlands:top",
      "netherlands:eredivisie",
      "dutch eredivisie",
      "holland:top",
    ],
    name: "Eredivisie",
    teams: [
      "PSV",
      "Feyenoord",
      "Ajax",
      "AZ Alkmaar",
      "FC Twente",
      "Utrecht",
      "Groningen",
      "Heerenveen",
      "Sparta Rotterdam",
      "NEC Nijmegen",
      "Go Ahead Eagles",
      "Heracles",
      "Almere City",
      "RKC Waalwijk",
      "Fortuna Sittard",
      "Excelsior",
      "SC Cambuur",
      "FC Volendam",
    ],
  },
  // ── Turkey ────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "süper lig",
      "super lig",
      "turkey:top",
      "turkey:super",
      "turkish super lig",
    ],
    name: "Süper Lig",
    teams: [
      "Galatasaray",
      "Fenerbahce",
      "Besiktas",
      "Trabzonspor",
      "Basaksehir",
      "Sivasspor",
      "Konyaspor",
      "Antalyaspor",
      "Kasimpasa",
      "Adana Demirspor",
      "Ankaragücü",
      "Gaziantep FK",
      "Kayserispor",
      "Rizespor",
      "Alanyaspor",
      "Samsunspor",
      "Pendikspor",
      "Hatayspor",
    ],
  },
  // ── Scotland ──────────────────────────────────────────────────────────────────
  {
    patterns: [
      "scottish premiership",
      "scotland:top",
      "scotland:premiership",
      "spfl premiership",
      "scottish premier",
    ],
    name: "Scottish Premiership",
    teams: [
      "Celtic",
      "Rangers",
      "Hearts",
      "Hibernian",
      "Aberdeen",
      "Motherwell",
      "St Mirren",
      "Dundee United",
      "Livingston",
      "Ross County",
      "Kilmarnock",
      "St Johnstone",
    ],
  },
  // ── Belgium ───────────────────────────────────────────────────────────────────
  {
    patterns: [
      "jupiler",
      "belgium:top",
      "belgium:first",
      "belgium pro league",
      "jupiler pro",
    ],
    name: "Jupiler Pro League",
    teams: [
      "Club Brugge",
      "Anderlecht",
      "Union SG",
      "Gent",
      "Antwerp",
      "Standard Liege",
      "Charleroi",
      "Westerlo",
      "OH Leuven",
      "Mechelen",
      "Cercle Brugge",
      "Genk",
      "Sint-Truiden",
      "Eupen",
      "Kortrijk",
      "Zulte Waregem",
    ],
  },
  // ── Poland ────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "ekstraklasa",
      "poland:top",
      "poland:ekstraklasa",
      "polish ekstraklasa",
    ],
    name: "Ekstraklasa",
    teams: [
      "Legia Warsaw",
      "Rakow Czestochowa",
      "Lech Poznan",
      "Piast Gliwice",
      "Wisla Krakow",
      "Cracovia",
      "Gornik Zabrze",
      "Zagłebie Lubin",
      "Jagiellonia",
      "Slask Wroclaw",
      "Stal Mielec",
      "Korona Kielce",
      "Warta Poznan",
      "Ruch Chorzow",
      "Puszcza Niepolomice",
      "GKS Katowice",
    ],
  },
  // ── Greece ────────────────────────────────────────────────────────────────────
  // NOTE: patterns must NOT include bare "super league" — that collides with Swiss/Chinese/Turkish leagues.
  {
    patterns: [
      "greece:top",
      "greece:super",
      "super league greece",
      "greek super league",
      "superleague greece",
      "superleague ellada",
    ],
    name: "Super League Grécia",
    teams: [
      "Olympiakos",
      "Panathinaikos",
      "PAOK",
      "AEK Athens",
      "Aris",
      "Atromitos",
      "Volos",
      "OFI Crete",
      "Lamia",
      "Panserraikos",
      "Levadiakos",
      "Asteras Tripolis",
      "Giannina",
      "Ionikos",
    ],
  },
  // ── China ─────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "chinese super league",
      "china:top",
      "china:super",
      "csl",
      "chinese football",
    ],
    name: "Chinese Super League",
    teams: [
      "Shanghai Port",
      "Shandong Taishan",
      "Beijing Guoan",
      "Wuhan Three Towns",
      "Guangzhou FC",
      "Shanghai Shenhua",
      "Tianjin Jinmen Tiger",
      "Shenzhen FC",
      "Zhejiang FC",
      "Changchun Yatai",
      "Qingdao West Coast",
      "Dalian Pro",
      "Meizhou Hakka",
      "Nantong Zhiyun",
      "Henan FC",
      "Chengdu Rongcheng",
    ],
  },
  // ── Indonesia ─────────────────────────────────────────────────────────────────
  // NOTE: "liga 1" alone is NOT used — collides with Romania Liga 1, Peru Liga 1, etc.
  {
    patterns: [
      "indonesia:top",
      "indonesia:liga",
      "liga 1 indonesia",
      "indonesian liga",
      "liga indonesia",
    ],
    name: "Liga 1 Indonésia",
    teams: [
      "Persib Bandung",
      "Persija Jakarta",
      "Bali United",
      "PSM Makassar",
      "Arema FC",
      "Persebaya Surabaya",
      "Borneo FC",
      "Bhayangkara FC",
      "PSIS Semarang",
      "Persikabo",
      "Barito Putera",
      "Madura United",
      "Dewa United",
      "RANS Nusantara",
      "PSS Sleman",
      "Persita Tangerang",
    ],
  },
  // ── Australia ─────────────────────────────────────────────────────────────────
  {
    patterns: [
      "a-league",
      "a league",
      "australia:top",
      "australian a-league",
      "isuzu ute",
      "npl australia",
    ],
    name: "A-League",
    teams: [
      "Melbourne City",
      "Western Sydney Wanderers",
      "Melbourne Victory",
      "Sydney FC",
      "Brisbane Roar",
      "Adelaide United",
      "Wellington Phoenix",
      "Perth Glory",
      "Western United",
      "Macarthur FC",
      "Central Coast Mariners",
      "Newcastle Jets",
    ],
  },
  // ── USA ───────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "mls",
      "major league soccer",
      "usa:mls",
      "united states:mls",
      "us soccer mls",
    ],
    name: "MLS",
    teams: [
      "Inter Miami",
      "Los Angeles FC",
      "FC Cincinnati",
      "Columbus Crew",
      "Orlando City",
      "Atlanta United",
      "Seattle Sounders",
      "Portland Timbers",
      "NYCFC",
      "New England",
      "Philadelphia Union",
      "Nashville SC",
      "St. Louis City",
      "Austin FC",
      "Real Salt Lake",
      "LA Galaxy",
      "Minnesota United",
      "Toronto FC",
      "Chicago Fire",
      "NY Red Bulls",
    ],
  },
  // ── Brazil ────────────────────────────────────────────────────────────────────
  // NOTE: "serie a" alone is NOT used — collides with Italian Serie A.
  {
    patterns: [
      "brazil:serie b",
      "brazil: serie b",
      "brasileirao serie b",
      "brasileirão série b",
      "campeonato brasileiro serie b",
      "serie b brasil",
      "série b brasil",
      "brasileirao b",
    ],
    name: "Brasileirão Série B",
    teams: [
      "Santos",
      "Sport",
      "Ceará",
      "Goiás",
      "Coritiba",
      "América MG",
      "Avaí",
      "Chapecoense",
      "Paysandu",
      "Remo",
      "Mirassol",
      "Novorizontino",
      "Ponte Preta",
      "Guarani",
      "Vila Nova",
      "Ituano",
      "CRB",
      "Botafogo-SP",
      "Amazonas",
      "Operário-PR",
    ],
  },
  {
    patterns: [
      "brazil:top",
      "brasileirao serie a",
      "brasileirão série a",
      "campeonato brasileiro serie a",
      "serie a brasil",
      "série a brasil",
      "futebol brasileiro",
      "brasileirao",
      "brasileirão",
    ],
    name: "Brasileirão Série A",
    teams: [
      "Atlético Mineiro",
      "Palmeiras",
      "Flamengo",
      "Botafogo",
      "Fluminense",
      "Internacional",
      "Grêmio",
      "São Paulo",
      "Corinthians",
      "Vasco",
      "Cruzeiro",
      "Bragantino",
      "Bahia",
      "Athletico-PR",
      "Cuiabá",
      "Goiás",
      "Coritiba",
      "Fortaleza",
      "Santos",
      "América MG",
    ],
  },
  // ── Mexico ────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "liga mx",
      "mexico:top",
      "mexico:liga mx",
      "ligamx",
      "mexican liga",
    ],
    name: "Liga MX",
    teams: [
      "Club América",
      "Tigres UANL",
      "Chivas",
      "Cruz Azul",
      "UNAM Pumas",
      "Monterrey",
      "Atlas",
      "Toluca",
      "León",
      "Santos Laguna",
      "Puebla",
      "Pachuca",
      "Necaxa",
      "Mazatlán",
      "FC Juárez",
      "Tijuana",
      "San Luis",
      "Querétaro",
      "Atlético San Luis",
    ],
  },
  // ── Argentina ─────────────────────────────────────────────────────────────────
  {
    patterns: [
      "primera division argentina",
      "argentina:top",
      "argentina:primera",
      "superliga argentina",
      "liga profesional argentina",
    ],
    name: "Primera División Argentina",
    teams: [
      "River Plate",
      "Boca Juniors",
      "Independiente",
      "Racing Club",
      "San Lorenzo",
      "Estudiantes",
      "Vélez Sársfield",
      "Newells Old Boys",
      "Lanús",
      "Huracán",
      "Belgrano",
      "Talleres",
      "Godoy Cruz",
      "Defensa y Justicia",
      "Gimnasia La Plata",
      "Banfield",
      "Platense",
      "Rosario Central",
      "Instituto",
      "Tigre",
    ],
  },
  // ── Colombia ──────────────────────────────────────────────────────────────────
  {
    patterns: [
      "liga betplay",
      "colombia:top",
      "colombia primera",
      "colombian first",
    ],
    name: "Liga BetPlay",
    teams: [
      "Millonarios",
      "Atlético Nacional",
      "Santa Fe",
      "Junior",
      "América de Cali",
      "Deportes Tolima",
      "Deportivo Cali",
      "Atlético Bucaramanga",
      "Once Caldas",
      "Independiente Medellín",
      "La Equidad",
      "Jaguares",
      "Águilas Doradas",
      "Peñarol Cali",
      "Envigado",
      "Alianza Petrolera",
    ],
  },
  // ── Chile ─────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "primera division chile",
      "chile:top",
      "campeonato chile",
      "chilean primera",
    ],
    name: "Primera División Chile",
    teams: [
      "Colo-Colo",
      "Universidad de Chile",
      "Universidad Católica",
      "Palestino",
      "Ñublense",
      "Huachipato",
      "Everton",
      "Cobresal",
      "Deportes Antofagasta",
      "Audax Italiano",
      "Curicó Unido",
      "Deportes La Serena",
      "Rangers",
      "Deportes Iquique",
      "O'Higgins",
      "Santiago Wanderers",
    ],
  },
  // ── Japan ─────────────────────────────────────────────────────────────────────
  {
    patterns: ["j1 league", "j-league", "japan:top", "japan:j1", "japanese j1"],
    name: "J1 League",
    teams: [
      "Vissel Kobe",
      "Yokohama F. Marinos",
      "Urawa Red Diamonds",
      "Kashima Antlers",
      "Gamba Osaka",
      "Kawasaki Frontale",
      "Nagoya Grampus",
      "FC Tokyo",
      "Sanfrecce Hiroshima",
      "Consadole Sapporo",
      "Cerezo Osaka",
      "Shonan Bellmare",
      "Avispa Fukuoka",
      "Kyoto Sanga",
      "Jubilo Iwata",
      "Albirex Niigata",
      "Kashiwa Reysol",
    ],
  },
  // ── Saudi Arabia ──────────────────────────────────────────────────────────────
  {
    patterns: [
      "saudi pro league",
      "saudi professional league",
      "saudi arabia:top",
      "saudi football",
    ],
    name: "Saudi Pro League",
    teams: [
      "Al-Hilal",
      "Al-Nassr",
      "Al-Ittihad",
      "Al-Ahli",
      "Al-Shabab",
      "Al-Qadsiah",
      "Al-Ettifaq",
      "Al-Fateh",
      "Al-Taawon",
      "Al-Khaleej",
      "Al-Hazem",
      "Al-Feiha",
      "Abha",
      "Al-Riyadh",
      "Al-Tai",
      "Damac",
    ],
  },
  // ── Russia ────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "russian premier league",
      "russia:top",
      "rpl russia",
      "russian football premier",
    ],
    name: "Russian Premier League",
    teams: [
      "Zenit",
      "CSKA Moscow",
      "Lokomotiv Moscow",
      "Spartak Moscow",
      "Krasnodar",
      "Dynamo Moscow",
      "Rostov",
      "Akhmat",
      "Ufa",
      "Rubin Kazan",
      "Khimki",
      "Ural",
      "Samara",
      "Sochi",
      "Arsenal Tula",
      "Torpedo Moscow",
    ],
  },
  // ── Austria ───────────────────────────────────────────────────────────────────
  // NOTE: "primeira liga" is NOT included here — it belongs to Portugal only.
  {
    patterns: [
      "austria:top",
      "austria:bundesliga",
      "austrian bundesliga",
      "bundesliga österreich",
      "österreichische bundesliga",
    ],
    name: "Austrian Bundesliga",
    teams: [
      "Red Bull Salzburg",
      "Sturm Graz",
      "LASK",
      "Austria Vienna",
      "Rapid Vienna",
      "Wolfsberger",
      "Hartberg",
      "WAC",
      "Rheindorf Altach",
      "Austria Lustenau",
      "Blau-Weiss Linz",
      "SCR Altach",
    ],
  },
  // ── Switzerland ───────────────────────────────────────────────────────────────
  {
    patterns: [
      "swiss super league",
      "switzerland:top",
      "super league schweiz",
      "switzerland super",
      "swiss football",
    ],
    name: "Swiss Super League",
    teams: [
      "FC Basel",
      "Young Boys",
      "FC Lugano",
      "Servette",
      "FC Zürich",
      "FC Luzern",
      "Winterthur",
      "Grasshopper",
      "FC St. Gallen",
      "Yverdon",
      "FC Lausanne-Sport",
      "FC Vaduz",
    ],
  },
  // ── Denmark ───────────────────────────────────────────────────────────────────
  {
    patterns: [
      "danish superliga",
      "denmark:top",
      "superliga denmark",
      "danish football",
    ],
    name: "Danish Superliga",
    teams: [
      "FC Copenhagen",
      "FC Midtjylland",
      "Brondby",
      "Silkeborg",
      "AGF",
      "Aarhus",
      "Nordsjælland",
      "Randers",
      "OB",
      "Vejle",
      "AC Horsens",
      "HB Koge",
      "Lyngby",
      "FC Fredericia",
      "Viborg",
    ],
  },
  // ── Sweden ────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "allsvenskan",
      "sweden:top",
      "sweden:allsvenskan",
      "swedish allsvenskan",
    ],
    name: "Allsvenskan",
    teams: [
      "Malmo FF",
      "IF Elfsborg",
      "Djurgårdens IF",
      "AIK",
      "IFK Göteborg",
      "Hammarby",
      "IFK Norrköping",
      "BK Häcken",
      "Kalmar FF",
      "GAIS",
      "Sirius",
      "Degerfors",
      "Örebro",
      "Mjällby",
      "Halmstad",
      "Varberg",
    ],
  },
  // ── Norway ────────────────────────────────────────────────────────────────────
  {
    patterns: [
      "eliteserien",
      "norway:top",
      "norway:eliteserien",
      "norwegian eliteserien",
    ],
    name: "Eliteserien",
    teams: [
      "Bodø/Glimt",
      "Molde",
      "Rosenborg",
      "Brann",
      "Viking",
      "Lillestrøm",
      "Vålerenga",
      "HamKam",
      "Stabæk",
      "Sandefjord",
      "Strømsgodset",
      "Aalesund",
      "Sarpsborg",
      "Odd",
      "Haugesund",
      "Tromsø",
    ],
  },
  // ── Finland ───────────────────────────────────────────────────────────────────
  {
    patterns: [
      "veikkausliiga",
      "finland:top",
      "finland:veikkausliiga",
      "finnish veikkausliiga",
    ],
    name: "Veikkausliiga",
    teams: [
      "HJK Helsinki",
      "HIFK",
      "KuPS",
      "SJK",
      "Ilves",
      "VPS",
      "FC Inter Turku",
      "Mariehamn",
      "KTP",
      "AC Oulu",
      "EIF",
      "FC Honka",
      "Gnistan",
      "FC Haka",
    ],
  },
  // ── Romania ───────────────────────────────────────────────────────────────────
  {
    patterns: [
      "superliga romania",
      "romania:top",
      "liga 1 romania",
      "romanian liga",
      "liga i romania",
    ],
    name: "SuperLiga Romania",
    teams: [
      "FCSB",
      "CFR Cluj",
      "Rapid Bucharest",
      "Universitatea Craiova",
      "Farul Constanta",
      "Petrolul",
      "Sepsi",
      "Dinamo",
      "UTA Arad",
      "Hermannstadt",
      "Voluntari",
      "Poli Iasi",
      "FC Botosani",
      "Otelul Galati",
      "FC Arges",
      "Politehnica",
    ],
  },
  // ── Spain Lower ───────────────────────────────────────────────────────────────
  {
    patterns: [
      "primera federacion",
      "primera rfef",
      "spain:third",
      "rfef primera",
    ],
    name: "Primera RFEF",
    teams: [
      "Deportivo La Coruña",
      "SD Amorebieta",
      "Mérida AD",
      "Algeciras CF",
      "Celta B",
      "Deportivo Alaves B",
      "Barça B",
      "Atletico B",
      "Sevilla B",
      "Athletic B",
      "Real Sociedad B",
      "Valencia B",
      "Villarreal B",
      "Málaga",
      "Pontevedra",
      "Córdoba",
    ],
  },
  // ── UEFA Competitions ─────────────────────────────────────────────────────────
  {
    patterns: [
      "champions league",
      "europa league",
      "conference league",
      "uefa cl",
      "ucl",
      "uel",
      "uecl",
    ],
    name: "UEFA Champions League",
    teams: [
      "Real Madrid",
      "Manchester City",
      "Bayern Munich",
      "PSG",
      "Barcelona",
      "Liverpool",
      "Arsenal",
      "Atletico Madrid",
      "Inter",
      "Borussia Dortmund",
      "Napoli",
      "AC Milan",
      "Chelsea",
      "Benfica",
      "Porto",
      "RB Leipzig",
      "Sevilla",
      "Lazio",
      "Juventus",
      "Shakhtar Donetsk",
    ],
  },
];

/** Check if a team name is represented in a list (word-level matching).
 *  Strips generic suffixes (FC, SC, City, United, etc.) then requires at least
 *  one significant word (≥ 4 chars) to match exactly as a word in the list entry.
 *  This prevents "Melbourne City" from matching "Manchester City" in the EPL list.
 */
function teamInList(list: string[], teamName: string): boolean {
  if (!teamName) return true;
  // Stop words that are too common to be discriminating
  const stopWords = new Set([
    "fc",
    "sc",
    "ac",
    "cf",
    "bk",
    "if",
    "fk",
    "sk",
    "afc",
    "bfc",
    "ud",
    "cd",
    "rj",
    "mg",
    "sp",
    "rs",
    "pr",
    "ba",
    "city",
    "united",
    "athletic",
    "athletics",
    "real",
    "club",
    "sporting",
    "sport",
    "deportivo",
    "deportes",
    "atlético",
    "atletico",
    "junior",
    "senior",
    "rovers",
    "wanderers",
    "dynamo",
    "rapid",
    "victoria",
  ]);
  const sig = (name: string) =>
    name
      .toLowerCase()
      .split(/[\s\-\.]+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w));

  const teamWords = sig(teamName);
  if (teamWords.length === 0) return false;

  return list.some((t) => {
    const listWords = sig(t);
    // At least one significant word from the team name must appear verbatim in the list entry
    return teamWords.some((tw) => listWords.includes(tw));
  });
}

function buildLeagueStandings(
  leagueName: string,
  homeTeam: string,
  awayTeam: string,
): {
  league: string;
  teams: Array<{
    pos: number;
    name: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    pts: number;
  }>;
} {
  const slug = leagueName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const found = LEAGUE_TEAMS.find((l) =>
    l.patterns.some((p) => slug.includes(p)),
  );

  let teamList: string[];
  let displayName: string;

  if (found) {
    teamList = [...found.teams];
    displayName = found.name;
    // Ensure the two teams playing actually appear in the standings
    const hasHome = teamInList(teamList, homeTeam);
    const hasAway = teamInList(teamList, awayTeam);
    if (!hasHome && homeTeam) {
      // Replace last team with actual home team
      teamList[teamList.length - 1] = homeTeam;
    }
    if (!hasAway && awayTeam && !teamList.includes(awayTeam)) {
      teamList[teamList.length - 2] = awayTeam;
    }
  } else {
    // Unknown league — build a realistic generic table featuring the actual teams
    displayName = leagueName || "Classificação";
    const fillers = [
      "Sporting FC",
      "Athletic CF",
      "City FC",
      "United FC",
      "Dynamo",
      "Rapid",
      "Victoria",
      "Olimpia",
      "Nacional",
      "Real CF",
      "Atlético",
      "Juventude",
      "América",
      "Deportivo",
      "Spartak",
      "Lokomotiv",
    ];
    const extra = fillers.slice(0, 10);
    teamList = [homeTeam, awayTeam, ...extra].filter(
      (t, i, a) => t && a.indexOf(t) === i,
    );
  }

  const seed = [...(displayName + homeTeam)].reduce(
    (a, c) => a + c.charCodeAt(0),
    0,
  );
  const rng = (s: number) => {
    const x = Math.sin(seed * 1234 + s * 7919) * 2654435761;
    return x - Math.floor(x);
  };

  const teams = teamList.map((name, i) => {
    const elo = getTeamElo(name);
    const strength = (elo - 1400) / 600;
    const played = 30 + Math.floor(rng(i * 13 + 1) * 8);
    const winRate = Math.max(
      0.05,
      Math.min(0.85, 0.45 + strength * 0.35 + (rng(i * 7 + 2) - 0.5) * 0.15),
    );
    const drawRate = Math.max(
      0.05,
      Math.min(
        0.35,
        0.26 - Math.abs(strength) * 0.06 + (rng(i * 5 + 3) - 0.5) * 0.08,
      ),
    );
    const won = Math.round(played * winRate);
    const drawn = Math.round(played * drawRate);
    const lost = Math.max(0, played - won - drawn);
    const avgGF = Math.max(
      0.5,
      1.4 + strength * 0.6 + (rng(i * 11 + 4) - 0.5) * 0.4,
    );
    const avgGA = Math.max(
      0.4,
      1.2 - strength * 0.4 + (rng(i * 9 + 5) - 0.5) * 0.4,
    );
    const gf = Math.round(played * avgGF);
    const ga = Math.round(played * avgGA);
    const pts = won * 3 + drawn;
    return { name, elo, played, won, drawn, lost, gf, ga, pts };
  });

  teams.sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );

  return {
    league: displayName,
    teams: teams.map(({ name, played, won, drawn, lost, gf, ga, pts }, i) => ({
      pos: i + 1,
      name,
      played,
      won,
      drawn,
      lost,
      gf,
      ga,
      pts,
    })),
  };
}

async function getActiveTournaments(): Promise<ActiveTournament[]> {
  return tourListCache ?? [];
}

async function getVolleyballDailyResults(): Promise<VolleyDailyResult[]> {
  const now = Date.now();
  if (volleyResultsCache && now - volleyResultsFetchedAt < RESULTS_CACHE_TTL)
    return volleyResultsCache;
  if (!CONFIG.STATPAL_API_KEY) return volleyResultsCache ?? [];

  const extractSets = (
    home: Pick<VolleyTeam, "s1" | "s2" | "s3" | "s4" | "s5">,
    away: Pick<VolleyTeam, "s1" | "s2" | "s3" | "s4" | "s5">,
  ): Array<[number, number]> => {
    const sets: Array<[number, number]> = [];
    for (const key of ["s1", "s2", "s3", "s4", "s5"] as const) {
      const homeValue = Number.parseInt(String(home[key] ?? "").trim(), 10);
      const awayValue = Number.parseInt(String(away[key] ?? "").trim(), 10);
      if (!Number.isFinite(homeValue) || !Number.isFinite(awayValue)) continue;
      sets.push([homeValue, awayValue]);
    }
    return sets;
  };

  try {
    const resp = await fetch(buildStatpalUrl("/v1/volleyball/daily/d-1"), {
      signal: AbortSignal.timeout(8_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) return volleyResultsCache ?? [];
    const payload = (await resp.json()) as {
      livescores?: { tournament?: VolleyTournament | VolleyTournament[] };
      scores?: { tournament?: VolleyTournament | VolleyTournament[] };
    };
    const tournaments = statpalList(
      payload.livescores?.tournament ?? payload.scores?.tournament,
    );
    const results = tournaments.flatMap((tournament) =>
      statpalList(tournament.match).map((match) => {
        const sets = extractSets(match.home, match.away);
        const homeSets =
          Number.parseInt(match.home.totalscore, 10) ||
          sets.filter(([home, away]) => home > away).length;
        const awaySets =
          Number.parseInt(match.away.totalscore, 10) ||
          sets.filter(([home, away]) => away > home).length;
        return {
          id: match.id,
          home: match.home.name,
          away: match.away.name,
          homeSets,
          awaySets,
          sets,
          homeWon: homeSets > awaySets,
          league: tournament.league,
          country: tournament.country,
          date: match.date,
          time: match.time,
        } satisfies VolleyDailyResult;
      }),
    );
    volleyResultsCache = results;
    volleyResultsFetchedAt = now;
    return results;
  } catch (err) {
    logger.warn({ err, provider: "statpal" }, "Volleyball daily results provider failed");
    return volleyResultsCache ?? [];
  }
}

async function getVolleyballStandings(
  leagueId: string,
): Promise<VolleyStandingsData | null> {
  const cached = volleyStandingsCache.get(leagueId);
  if (cached && Date.now() - cached.at < VOLLEY_STANDINGS_TTL) return cached.data;
  if (!CONFIG.STATPAL_API_KEY) return cached?.data ?? null;

  try {
    const resp = await fetch(
      buildStatpalUrl(`/v1/volleyball/standings/${encodeURIComponent(leagueId)}`),
      {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      },
    );
    if (!resp.ok) return cached?.data ?? null;
    const payload = (await resp.json()) as {
      standings?: {
        country?: string;
        category?: {
          id?: string;
          name?: string;
          season?: string;
          league?: { team?: VolleyStandingTeam | VolleyStandingTeam[] };
        };
      };
    };
    const category = payload.standings?.category;
    if (!category) return cached?.data ?? null;
    const data = {
      id: String(category.id ?? leagueId),
      name: category.name ?? "",
      season: category.season ?? "",
      country: payload.standings?.country ?? "",
      teams: statpalList(category.league?.team).map((team) => ({
        ...team,
        description:
          typeof team.description === "string"
            ? { value: team.description }
            : team.description,
      })),
    } satisfies VolleyStandingsData;
    volleyStandingsCache.set(leagueId, { data, at: Date.now() });
    return data;
  } catch (err) {
    logger.warn(
      { err, provider: "statpal", leagueId },
      "Volleyball standings provider failed",
    );
    return cached?.data ?? null;
  }
}

async function getVolleyballActiveLeagues(): Promise<VolleyLeague[]> {
  const tours = await getVolleyballLive();
  const seen = new Set<string>();
  return tours
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .map((t) => ({
      id: t.id,
      gid: t.gid,
      league: t.league,
      country: t.country,
    }));
}

async function getVolleyballSchedule(
  leagueId: string,
): Promise<VolleyScheduleData | null> {
  const cached = volleyScheduleCache.get(leagueId);
  if (cached && Date.now() - cached.at < VOLLEY_SCHEDULE_TTL) return cached.data;
  if (!CONFIG.STATPAL_API_KEY) return cached?.data ?? null;

  const extractSets = (match: VolleyScheduleMatch): Array<[number, number]> => {
    const sets: Array<[number, number]> = [];
    for (const key of ["s1", "s2", "s3", "s4", "s5"] as const) {
      const homeValue = Number.parseInt(String(match.home[key] ?? "").trim(), 10);
      const awayValue = Number.parseInt(String(match.away[key] ?? "").trim(), 10);
      if (!Number.isFinite(homeValue) || !Number.isFinite(awayValue)) continue;
      sets.push([homeValue, awayValue]);
    }
    return sets;
  };
  const parseDate = (value: string): string => {
    const [day = "", month = "", year = ""] = String(value ?? "").split(".");
    return day && month && year ? `${year}-${month}-${day}` : "";
  };
  const isUpcomingStatus = (status: string): boolean => {
    const normalized = String(status ?? "").trim().toLowerCase();
    return (
      normalized === "" ||
      normalized.includes("not started") ||
      normalized.includes("scheduled")
    );
  };

  try {
    const resp = await fetch(
      buildStatpalUrl(
        `/v1/volleyball/season-schedule/${encodeURIComponent(leagueId)}`,
      ),
      {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      },
    );
    if (!resp.ok) return cached?.data ?? null;
    const payload = (await resp.json()) as {
      scores?: {
        country?: string;
        tournament?: {
          id?: string;
          league?: string;
          season?: string;
          week?: VolleyScheduleWeek | VolleyScheduleWeek[];
        };
      };
    };
    const tournament = payload.scores?.tournament;
    if (!tournament) return cached?.data ?? null;

    const rawWeeks = statpalList(tournament.week).map((week) => ({
      number: String(week.number ?? ""),
      matches: statpalList(week.match),
    }));
    const weeks = rawWeeks.map((week) => ({
      number: week.number,
      matches: week.matches.map((match) => {
        const sets = extractSets(match);
        const homeSets =
          Number.parseInt(match.home.totalscore, 10) ||
          sets.filter(([home, away]) => home > away).length;
        const awaySets =
          Number.parseInt(match.away.totalscore, 10) ||
          sets.filter(([home, away]) => away > home).length;
        return {
          id: match.id,
          home: match.home.name,
          away: match.away.name,
          homeSets,
          awaySets,
          sets,
          homeWon: homeSets > awaySets,
          date: match.date,
          time: match.time,
        } satisfies VolleyScheduleEntry;
      }),
    }));

    const today = new Date().toISOString().slice(0, 10);
    const recentWeeks = weeks
      .filter(
        (week, index) =>
          week.matches.length > 0 &&
          rawWeeks[index]?.matches.every(
            (match) =>
              parseDate(match.date) !== "" &&
              parseDate(match.date) <= today &&
              !isUpcomingStatus(match.status),
          ),
      )
      .slice(-3);

    const nextRawWeek =
      rawWeeks.find((week) =>
        week.matches.some(
          (match) => isUpcomingStatus(match.status) || parseDate(match.date) >= today,
        ),
      ) ?? null;
    const nextWeek = nextRawWeek
      ? {
          number: nextRawWeek.number,
          matches: nextRawWeek.matches
            .filter(
              (match) =>
                isUpcomingStatus(match.status) || parseDate(match.date) >= today,
            )
            .map((match) => ({
              id: match.id,
              home: match.home.name,
              away: match.away.name,
              date: match.date,
              time: match.time,
            })),
        }
      : null;

    const data = {
      id: String(tournament.id ?? leagueId),
      league: tournament.league ?? "",
      season: tournament.season ?? "",
      country: payload.scores?.country ?? "",
      recentWeeks,
      nextWeek,
    } satisfies VolleyScheduleData;
    volleyScheduleCache.set(leagueId, { data, at: Date.now() });
    return data;
  } catch (err) {
    logger.warn(
      { err, provider: "statpal", leagueId },
      "Volleyball schedule provider failed",
    );
    return cached?.data ?? null;
  }
}

async function getTennisDailyResults(): Promise<TennisDailyResult[]> {
  return tennisResultsCache ?? [];
}

async function getHockeyDailyResults(): Promise<HockeyDailyResult[]> {
  const now = Date.now();
  if (hockeyResultsCache && now - hockeyResultsFetchedAt < RESULTS_CACHE_TTL)
    return hockeyResultsCache;

  const parsePeriodScore = (score: string | undefined): [number, number] | null => {
    if (!score || !score.trim()) return null;
    const parts = score.split(" - ");
    if (parts.length !== 2) return null;
    const home = Number.parseInt(parts[0] ?? "", 10);
    const away = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
    return [home, away];
  };

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nhl/daily/d-1"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          scores?: { tournament?: NHLTournament | NHLTournament[] };
        };
        const tournaments = statpalList(payload.scores?.tournament);
        const results = tournaments.flatMap((tournament) =>
          statpalList(tournament.match).map((match) => {
            const periods = [
              parsePeriodScore(match.events?.firstperiod?.score),
              parsePeriodScore(match.events?.secondperiod?.score),
              parsePeriodScore(match.events?.thirdperiod?.score),
              parsePeriodScore(match.events?.overtime?.score),
              parsePeriodScore(match.events?.penalties?.score),
            ].filter((score): score is [number, number] => !!score);

            return {
              id: match.id,
              home: match.home.name,
              away: match.away.name,
              homeScore: Number.parseInt(match.home.totalscore, 10) || 0,
              awayScore: Number.parseInt(match.away.totalscore, 10) || 0,
              periods,
              homeWon:
                (Number.parseInt(match.home.totalscore, 10) || 0) >
                (Number.parseInt(match.away.totalscore, 10) || 0),
              league: tournament.league,
              country: tournament.country,
              date: match.date ?? "",
              time: match.time,
            } satisfies HockeyDailyResult;
          }),
        );
        hockeyResultsCache = results;
        hockeyResultsFetchedAt = now;
        return results;
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NHL daily results provider failed");
    }
  }

  try {
    const events = await getV2EventsLast("hockey", 20);
    const yd = new Date(Date.now() - 86400000);
    const ydStr = `${String(yd.getUTCDate()).padStart(2, "0")}.${String(yd.getUTCMonth() + 1).padStart(2, "0")}.${yd.getUTCFullYear()}`;
    const results: HockeyDailyResult[] = [];
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      const st =
        (ev["status"] as Record<string, unknown> | undefined)?.["type"] ??
        ev["status"];
      if (typeof st === "string" && st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: ts,
      } as SAPIV2Event);
      if (date !== ydStr) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const periods: Array<[number, number]> = [];
      for (const p of [
        "period1",
        "period2",
        "period3",
        "overtime",
        "shootout",
      ]) {
        const hv = hs?.[p];
        const av = as_?.[p];
        if (hv != null && av != null) periods.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      results.push({
        id: String(ev["id"] ?? ""),
        home,
        away,
        homeScore,
        awayScore,
        periods,
        homeWon: ev["winnerCode"] === 1,
        league: "NHL",
        country: "usa",
        date,
        time,
      });
    }
    hockeyResultsCache = results;
    hockeyResultsFetchedAt = now;
    return results;
  } catch {
    return hockeyResultsCache ?? [];
  }
}

async function getMLBDailyResults(): Promise<MLBDailyResult[]> {
  const now = Date.now();
  if (mlbResultsCache && now - mlbResultsFetchedAt < RESULTS_CACHE_TTL)
    return mlbResultsCache;

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/mlb/daily/d-1"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          scores?: { tournament?: MLBTournament | MLBTournament[] };
        };
        const tournaments = statpalList(payload.scores?.tournament);
        const results = tournaments.flatMap((tournament) =>
          statpalList(tournament.match).map((match) => {
            const innings: Array<[number | null, number | null]> = [];
            for (const key of ["in1","in2","in3","in4","in5","in6","in7","in8","in9"] as const) {
              const hv = match.home[key];
              const av = match.away[key];
              if (!hv && !av) break;
              innings.push([
                hv ? Number.parseInt(hv, 10) : null,
                av ? Number.parseInt(av, 10) : null,
              ]);
            }
            const homeScore = Number.parseInt(match.home.r || match.home.totalscore, 10) || 0;
            const awayScore = Number.parseInt(match.away.r || match.away.totalscore, 10) || 0;
            return {
              id: match.id,
              home: match.home.name,
              away: match.away.name,
              homeScore,
              awayScore,
              homeHits: Number.parseInt(match.home.hits, 10) || 0,
              awayHits: Number.parseInt(match.away.hits, 10) || 0,
              homeErrors: Number.parseInt(match.home.errors, 10) || 0,
              awayErrors: Number.parseInt(match.away.errors, 10) || 0,
              innings,
              hasExtra: false,
              homeWon: homeScore > awayScore,
              league: tournament.league,
              country: tournament.country,
              date: match.date ?? "",
              time: match.time,
            } satisfies MLBDailyResult;
          }),
        );
        mlbResultsCache = results;
        mlbResultsFetchedAt = now;
        return results;
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "MLB daily results provider failed");
    }
  }

  try {
    const events = await getV2EventsLast("baseball", 20);
    const yd = new Date(Date.now() - 86400000);
    const ydStr = `${String(yd.getUTCDate()).padStart(2, "0")}.${String(yd.getUTCMonth() + 1).padStart(2, "0")}.${yd.getUTCFullYear()}`;
    const results: MLBDailyResult[] = [];
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      const st =
        (ev["status"] as Record<string, unknown> | undefined)?.["type"] ??
        ev["status"];
      if (typeof st === "string" && st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: ts,
      } as SAPIV2Event);
      if (date !== ydStr) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const innings: Array<[number | null, number | null]> = [];
      for (let inn = 1; inn <= 9; inn++) {
        const key = `period${inn}`;
        const hv = hs?.[key];
        const av = as_?.[key];
        if (hv == null && av == null) break;
        innings.push([
          hv != null ? Number(hv) : null,
          av != null ? Number(av) : null,
        ]);
      }
      const hOT = hs?.["overtime"];
      const aOT = as_?.["overtime"];
      const hasExtra = hOT != null || aOT != null;
      if (hasExtra)
        innings.push([
          hOT != null ? Number(hOT) : null,
          aOT != null ? Number(aOT) : null,
        ]);
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? "");
      const away = String(awayTeam?.["name"] ?? "");
      if (!home || !away) continue;
      results.push({
        id: String(ev["id"] ?? ""),
        home,
        away,
        homeScore,
        awayScore,
        homeHits: 0,
        awayHits: 0,
        homeErrors: 0,
        awayErrors: 0,
        innings,
        hasExtra,
        homeWon: ev["winnerCode"] === 1,
        league: "MLB",
        country: "usa",
        date,
        time,
      });
    }
    mlbResultsCache = results;
    mlbResultsFetchedAt = now;
    return results;
  } catch {
    return mlbResultsCache ?? [];
  }
}

async function getBasketballSchedule(): Promise<BasketballScheduleData> {
  const now = Date.now();
  if (
    basketballScheduleCache &&
    now - basketballScheduleFetchedAt < BBALL_SCHEDULE_TTL
  )
    return basketballScheduleCache;

  const bballDateKey = (s: string) => {
    const [d, mo, y] = s.split(".");
    return `${y ?? ""}${mo ?? ""}${d ?? ""}`;
  };

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nba/season-schedule"), {
        signal: AbortSignal.timeout(10_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          scores?: {
            tournament?: {
              country: string;
              id: string;
              league: string;
              season: string;
              match: NBAMatch | NBAMatch[];
            };
          };
        };
        const tournament = payload.scores?.tournament;
        if (tournament) {
          const matches = statpalList(tournament.match);
          const upcomingMatches: BasketballScheduleMatch[] = [];
          const recentMatches: BasketballScheduleMatch[] = [];

          for (const match of matches) {
            const quarters: Array<[number, number]> = [];
            for (const [hv, av] of [
              [match.home.q1, match.away.q1],
              [match.home.q2, match.away.q2],
              [match.home.q3, match.away.q3],
              [match.home.q4, match.away.q4],
            ] as [string | undefined, string | undefined][]) {
              const h = Number.parseInt(hv ?? "", 10);
              const a = Number.parseInt(av ?? "", 10);
              if (Number.isFinite(h) && Number.isFinite(a)) quarters.push([h, a]);
            }
            const homeOT = match.home.ot ? Number.parseInt(match.home.ot, 10) : NaN;
            const awayOT = match.away.ot ? Number.parseInt(match.away.ot, 10) : NaN;
            if (!isNaN(homeOT) && !isNaN(awayOT)) quarters.push([homeOT, awayOT]);
            const homeScore = Number.parseInt(match.home.totalscore, 10) || 0;
            const awayScore = Number.parseInt(match.away.totalscore, 10) || 0;
            const mapped: BasketballScheduleMatch = {
              id: match.id,
              date: match.date ?? "",
              time: match.time,
              status: match.status,
              home: match.home.name,
              away: match.away.name,
              homeScore,
              awayScore,
              quarters,
              homeWon: homeScore > awayScore,
            };
            if (
              String(match.status).toLowerCase().includes("not started") ||
              String(match.status).toLowerCase().includes("scheduled")
            ) {
              upcomingMatches.push({ ...mapped, homeScore: 0, awayScore: 0, quarters: [] });
            } else {
              recentMatches.push(mapped);
            }
          }

          recentMatches.sort((a, b) => bballDateKey(b.date).localeCompare(bballDateKey(a.date)));
          upcomingMatches.sort((a, b) => bballDateKey(a.date).localeCompare(bballDateKey(b.date)));
          basketballScheduleCache = {
            league: tournament.league,
            season: tournament.season,
            upcomingMatches: upcomingMatches.slice(0, 40),
            recentMatches: recentMatches.slice(0, 15),
          };
          basketballScheduleFetchedAt = now;
          return basketballScheduleCache;
        }
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NBA season schedule provider failed");
    }
  }

  try {
    const [upcomingEvents, lastEvents] = await Promise.all([
      getUpcomingLeagueEventsV2("basketball", 21),
      getV2EventsLast("basketball", 60),
    ]);
    const cutoff14 = Date.now() - 14 * 86400000;
    const dateKey = (s: string) => {
      const [d, mo, y] = s.split(".");
      return `${y ?? ""}${mo ?? ""}${d ?? ""}`;
    };

    const upcomingMatches: BasketballScheduleMatch[] = upcomingEvents
      .slice(0, 40)
      .map((ev) => {
        const home = v2TeamName(ev.homeTeam);
        const away = v2TeamName(ev.awayTeam);
        const { date, time } = v2EventDateTime(ev);
        return {
          id: String(ev.id),
          date,
          time,
          status: "Not Started",
          home,
          away,
          homeScore: 0,
          awayScore: 0,
          quarters: [],
        };
      });

    const recentMatches: BasketballScheduleMatch[] = [];
    for (const raw of lastEvents) {
      const ev = raw as Record<string, unknown>;
      const st =
        (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? "";
      if (typeof st !== "string" || st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts || ts * 1000 < cutoff14) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const quarters: Array<[number, number]> = [];
      for (const p of [
        "period1",
        "period2",
        "period3",
        "period4",
        "overtime",
      ]) {
        const hv = hs?.[p];
        const av = as_?.[p];
        if (hv != null && av != null) quarters.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: ts,
      } as SAPIV2Event);
      recentMatches.push({
        id: String(ev["id"] ?? ""),
        date,
        time,
        status: "Finished",
        home,
        away,
        homeScore,
        awayScore,
        quarters,
        homeWon: ev["winnerCode"] === 1,
      });
    }

    recentMatches.sort((a, b) =>
      dateKey(b.date).localeCompare(dateKey(a.date)),
    );
    basketballScheduleCache = {
      league: "NBA",
      season: "2025-26",
      upcomingMatches,
      recentMatches: recentMatches.slice(0, 15),
    };
    basketballScheduleFetchedAt = now;
    return basketballScheduleCache;
  } catch {
    return (
      basketballScheduleCache ?? {
        league: "NBA",
        season: "",
        upcomingMatches: [],
        recentMatches: [],
      }
    );
  }
}

async function getBasketballDailyResults(): Promise<BasketballDailyResult[]> {
  const now = Date.now();
  if (
    basketballResultsCache &&
    now - basketballResultsFetchedAt < RESULTS_CACHE_TTL
  )
    return basketballResultsCache;

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nba/daily/d-1"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          scores?: { tournament?: NBATournament | NBATournament[] };
        };
        const tournaments = statpalList(payload.scores?.tournament);
        const results = tournaments.flatMap((tournament) =>
          statpalList(tournament.match).map((match) => {
            const quarters: Array<[number, number]> = [];
            for (const [hv, av] of [
              [match.home.q1, match.away.q1],
              [match.home.q2, match.away.q2],
              [match.home.q3, match.away.q3],
              [match.home.q4, match.away.q4],
            ] as [string | undefined, string | undefined][]) {
              const h = Number.parseInt(hv ?? "", 10);
              const a = Number.parseInt(av ?? "", 10);
              if (Number.isFinite(h) && Number.isFinite(a)) quarters.push([h, a]);
            }
            const homeOT = match.home.ot ? Number.parseInt(match.home.ot, 10) : NaN;
            const awayOT = match.away.ot ? Number.parseInt(match.away.ot, 10) : NaN;
            if (!isNaN(homeOT) && !isNaN(awayOT)) quarters.push([homeOT, awayOT]);
            const homeScore = Number.parseInt(match.home.totalscore, 10) || 0;
            const awayScore = Number.parseInt(match.away.totalscore, 10) || 0;
            return {
              id: match.id,
              home: match.home.name,
              away: match.away.name,
              homeScore,
              awayScore,
              quarters,
              homeWon: homeScore > awayScore,
              league: tournament.league,
              country: tournament.country,
              date: match.date ?? "",
              time: match.time,
            } satisfies BasketballDailyResult;
          }),
        );
        basketballResultsCache = results;
        basketballResultsFetchedAt = now;
        return results;
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NBA daily results provider failed");
    }
  }

  try {
    const events = await getV2EventsLast("basketball", 20);
    const yd = new Date(Date.now() - 86400000);
    const ydStr = `${String(yd.getUTCDate()).padStart(2, "0")}.${String(yd.getUTCMonth() + 1).padStart(2, "0")}.${yd.getUTCFullYear()}`;
    const results: BasketballDailyResult[] = [];
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      const st =
        (ev["status"] as Record<string, unknown> | undefined)?.["type"] ??
        ev["status"];
      if (typeof st === "string" && st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: ts,
      } as SAPIV2Event);
      if (date !== ydStr) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const quarters: Array<[number, number]> = [];
      for (const p of [
        "period1",
        "period2",
        "period3",
        "period4",
        "overtime",
      ]) {
        const hv = hs?.[p];
        const av = as_?.[p];
        if (hv != null && av != null) quarters.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      results.push({
        id: String(ev["id"] ?? ""),
        home,
        away,
        homeScore,
        awayScore,
        quarters,
        homeWon: ev["winnerCode"] === 1,
        league: "NBA",
        country: "usa",
        date,
        time,
      });
    }
    basketballResultsCache = results;
    basketballResultsFetchedAt = now;
    return results;
  } catch {
    return basketballResultsCache ?? [];
  }
}

async function getHockeySchedule(): Promise<HockeyScheduleData> {
  const now = Date.now();
  if (
    hockeyScheduleCache &&
    now - hockeyScheduleFetchedAt < HOCKEY_SCHEDULE_TTL
  )
    return hockeyScheduleCache;

  const parsePeriodScore = (score: string | undefined): [number, number] | null => {
    if (!score || !score.trim()) return null;
    const parts = score.split(" - ");
    if (parts.length !== 2) return null;
    const home = Number.parseInt(parts[0] ?? "", 10);
    const away = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
    return [home, away];
  };
  const dateKey = (s: string) => {
    const [d, mo, y] = s.split(".");
    return `${y ?? ""}${mo ?? ""}${d ?? ""}`;
  };

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nhl/season-schedule"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          scores?: {
            tournament?: {
              country: string;
              id: string;
              league: string;
              season: string;
              match: NHLMatch | NHLMatch[];
            };
          };
        };
        const tournament = payload.scores?.tournament;
        if (tournament) {
          const matches = statpalList(tournament.match);
          const upcomingMatches: HockeyScheduleMatch[] = [];
          const recentMatches: HockeyScheduleMatch[] = [];

          for (const match of matches) {
            const periods = [
              parsePeriodScore(match.events?.firstperiod?.score),
              parsePeriodScore(match.events?.secondperiod?.score),
              parsePeriodScore(match.events?.thirdperiod?.score),
              parsePeriodScore(match.events?.overtime?.score),
              parsePeriodScore(match.events?.penalties?.score),
            ].filter((score): score is [number, number] => !!score);

            const mapped = {
              id: match.id,
              date: match.date ?? "",
              time: match.time,
              status: match.status,
              venue: (match as NHLMatch & { venue?: string }).venue,
              home: match.home.name,
              away: match.away.name,
              homeScore: Number.parseInt(match.home.totalscore, 10) || 0,
              awayScore: Number.parseInt(match.away.totalscore, 10) || 0,
              periods,
              homeWon:
                (Number.parseInt(match.home.totalscore, 10) || 0) >
                (Number.parseInt(match.away.totalscore, 10) || 0),
              teamStats: (() => {
                const stats = (match as NHLMatch & {
                  team_stats?: {
                    home?: {
                      shots?: { ongoal?: string };
                      saves?: { saves_pct?: string };
                      goals?: {
                        pp_goals?: string;
                        pp_pct?: string;
                        pen_kill_pct?: string;
                      };
                      faceoffs?: { pct?: string };
                      penalties?: { minutes?: string };
                    };
                    away?: {
                      shots?: { ongoal?: string };
                      saves?: { saves_pct?: string };
                      goals?: {
                        pp_goals?: string;
                        pp_pct?: string;
                        pen_kill_pct?: string;
                      };
                      faceoffs?: { pct?: string };
                      penalties?: { minutes?: string };
                    };
                  };
                }).team_stats;
                if (!stats?.home || !stats?.away) return undefined;
                const parsePct = (value: string | undefined) =>
                  Number.parseFloat(value ?? "0") || 0;
                const parseIntSafe = (value: string | undefined) =>
                  Number.parseInt(value ?? "0", 10) || 0;
                return {
                  home: {
                    shotsOnGoal: parseIntSafe(stats.home.shots?.ongoal),
                    savesPct: parsePct(stats.home.saves?.saves_pct),
                    ppGoals: parseIntSafe(stats.home.goals?.pp_goals),
                    ppPct: parsePct(stats.home.goals?.pp_pct),
                    penKillPct: parsePct(stats.home.goals?.pen_kill_pct),
                    faceoffPct: parsePct(stats.home.faceoffs?.pct),
                    penaltyMinutes: parseIntSafe(stats.home.penalties?.minutes),
                  },
                  away: {
                    shotsOnGoal: parseIntSafe(stats.away.shots?.ongoal),
                    savesPct: parsePct(stats.away.saves?.saves_pct),
                    ppGoals: parseIntSafe(stats.away.goals?.pp_goals),
                    ppPct: parsePct(stats.away.goals?.pp_pct),
                    penKillPct: parsePct(stats.away.goals?.pen_kill_pct),
                    faceoffPct: parsePct(stats.away.faceoffs?.pct),
                    penaltyMinutes: parseIntSafe(stats.away.penalties?.minutes),
                  },
                };
              })(),
            } satisfies HockeyScheduleMatch;

            if (
              String(match.status).toLowerCase().includes("not started") ||
              String(match.status).toLowerCase().includes("scheduled")
            ) {
              upcomingMatches.push({ ...mapped, homeScore: 0, awayScore: 0 });
            } else {
              recentMatches.push(mapped);
            }
          }

          recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
          upcomingMatches.sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
          hockeyScheduleCache = {
            league: tournament.league,
            season: tournament.season,
            upcomingMatches: upcomingMatches.slice(0, 40),
            recentMatches: recentMatches.slice(0, 15),
          };
          hockeyScheduleFetchedAt = now;
          return hockeyScheduleCache;
        }
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NHL season schedule provider failed");
    }
  }

  try {
    const [upcomingEvents, lastEvents] = await Promise.all([
      getUpcomingLeagueEventsV2("hockey", 21),
      getV2EventsLast("hockey", 60),
    ]);
    const cutoff14 = Date.now() - 14 * 86400000;

    const upcomingMatches: HockeyScheduleMatch[] = upcomingEvents
      .slice(0, 40)
      .map((ev) => {
        const home = v2TeamName(ev.homeTeam);
        const away = v2TeamName(ev.awayTeam);
        const { date, time } = v2EventDateTime(ev);
        return {
          id: String(ev.id),
          date,
          time,
          status: "Not Started",
          home,
          away,
          homeScore: 0,
          awayScore: 0,
          periods: [],
        };
      });

    const recentMatches: HockeyScheduleMatch[] = [];
    for (const raw of lastEvents) {
      const ev = raw as Record<string, unknown>;
      const st =
        (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? "";
      if (typeof st !== "string" || st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts || ts * 1000 < cutoff14) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const periods: Array<[number, number]> = [];
      for (const p of [
        "period1",
        "period2",
        "period3",
        "overtime",
        "shootout",
      ]) {
        const hv = hs?.[p];
        const av = as_?.[p];
        if (hv != null && av != null) periods.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: ts,
      } as SAPIV2Event);
      recentMatches.push({
        id: String(ev["id"] ?? ""),
        date,
        time,
        status: "Finished",
        home,
        away,
        homeScore,
        awayScore,
        periods,
        homeWon: ev["winnerCode"] === 1,
      });
    }

    recentMatches.sort((a, b) =>
      dateKey(b.date).localeCompare(dateKey(a.date)),
    );
    hockeyScheduleCache = {
      league: "NHL",
      season: "2025-26",
      upcomingMatches,
      recentMatches: recentMatches.slice(0, 15),
    };
    hockeyScheduleFetchedAt = now;
    return hockeyScheduleCache;
  } catch {
    return (
      hockeyScheduleCache ?? {
        league: "NHL",
        season: "",
        upcomingMatches: [],
        recentMatches: [],
      }
    );
  }
}

async function getMLBSchedule(): Promise<MLBScheduleData> {
  const now = Date.now();
  if (mlbScheduleCache && now - mlbScheduleFetchedAt < MLB_SCHEDULE_TTL)
    return mlbScheduleCache;
  const empty: MLBScheduleData = {
    league: "MLB",
    season: "",
    upcomingMatches: [],
    recentMatches: [],
  };

  const mlbDateKey = (s: string) => {
    const [d, mo, y] = s.split(".");
    return `${y ?? ""}${mo ?? ""}${d ?? ""}`;
  };

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/mlb/season-schedule"), {
        signal: AbortSignal.timeout(10_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          scores?: {
            tournament?: {
              country: string;
              id: string;
              league: string;
              season: string;
              match: MLBMatch | MLBMatch[];
            };
          };
        };
        const tournament = payload.scores?.tournament;
        if (tournament) {
          const matches = statpalList(tournament.match);
          const upcomingMatches: MLBScheduleMatch[] = [];
          const recentMatches: MLBScheduleMatch[] = [];

          for (const match of matches) {
            const homeScore = Number.parseInt(match.home.r || match.home.totalscore, 10) || 0;
            const awayScore = Number.parseInt(match.away.r || match.away.totalscore, 10) || 0;
            const mapped: MLBScheduleMatch = {
              id: match.id,
              date: match.date ?? "",
              time: match.time,
              status: match.status,
              venue: match.venue_name,
              home: match.home.name,
              away: match.away.name,
              homeScore,
              awayScore,
              homeWon: homeScore > awayScore,
            };
            if (
              String(match.status).toLowerCase().includes("not started") ||
              String(match.status).toLowerCase().includes("scheduled")
            ) {
              upcomingMatches.push({ ...mapped, homeScore: 0, awayScore: 0 });
            } else {
              recentMatches.push(mapped);
            }
          }

          recentMatches.sort((a, b) => mlbDateKey(b.date).localeCompare(mlbDateKey(a.date)));
          upcomingMatches.sort((a, b) => mlbDateKey(a.date).localeCompare(mlbDateKey(b.date)));
          mlbScheduleCache = {
            league: tournament.league,
            season: tournament.season,
            upcomingMatches: upcomingMatches.slice(0, 50),
            recentMatches: recentMatches.slice(0, 20),
          };
          mlbScheduleFetchedAt = now;
          return mlbScheduleCache;
        }
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "MLB season schedule provider failed");
    }
  }

  try {
    const [upcomingEvents, lastEvents] = await Promise.all([
      getUpcomingLeagueEventsV2("baseball", 21),
      getV2EventsLast("baseball", 60),
    ]);
    const cutoff14 = Date.now() - 14 * 86400000;
    const dateKey = (s: string) => {
      const [d, mo, y] = s.split(".");
      return `${y ?? ""}${mo ?? ""}${d ?? ""}`;
    };

    const upcomingMatches: MLBScheduleMatch[] = upcomingEvents
      .slice(0, 50)
      .map((ev) => {
        const home = v2TeamName(ev.homeTeam);
        const away = v2TeamName(ev.awayTeam);
        const { date, time } = v2EventDateTime(ev);
        return {
          id: String(ev.id),
          date,
          time,
          status: "Not Started",
          home,
          away,
          homeScore: 0,
          awayScore: 0,
        };
      });

    const recentMatches: MLBScheduleMatch[] = [];
    for (const raw of lastEvents) {
      const ev = raw as Record<string, unknown>;
      const st =
        (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? "";
      if (typeof st !== "string" || st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts || ts * 1000 < cutoff14) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      const { date, time } = v2EventDateTime({
        startTimestamp: ts,
      } as SAPIV2Event);
      recentMatches.push({
        id: String(ev["id"] ?? ""),
        date,
        time,
        status: "Finished",
        home,
        away,
        homeScore,
        awayScore,
        homeWon: ev["winnerCode"] === 1,
      });
    }

    recentMatches.sort((a, b) =>
      dateKey(b.date).localeCompare(dateKey(a.date)),
    );
    mlbScheduleCache = {
      league: "MLB",
      season: "2025",
      upcomingMatches,
      recentMatches: recentMatches.slice(0, 20),
    };
    mlbScheduleFetchedAt = now;
    return mlbScheduleCache;
  } catch {
    return mlbScheduleCache ?? empty;
  }
}

// ─── Tournament detail cache ──────────────────────────────────────────────────
type TournamentMatchPlayer = {
  id: string;
  name: string;
  totalscore: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  winner: boolean;
  serve: boolean;
};
type TournamentMatch = {
  id: string;
  status: string;
  date: string;
  time: string;
  court: string;
  round: string;
  roundOrder: number;
  players: TournamentMatchPlayer[];
};
type TournamentDetail = {
  id: string;
  league: string;
  season: string;
  matches: TournamentMatch[];
};
const tourDetailCache = new Map<
  string,
  { data: TournamentDetail; at: number }
>();
const TOUR_DETAIL_TTL = 5 * 60 * 1000; // 5 min

const ROUND_ORDER: Record<string, number> = {
  "1/64-finals": 1,
  "1/32-finals": 2,
  "1/16-finals": 3,
  "1/8-finals": 4,
  "quarter-finals": 5,
  "semi-finals": 6,
  final: 7,
};

async function getTournamentDetail(id: string): Promise<TournamentDetail> {
  const cached = tourDetailCache.get(id);
  if (cached) return cached.data;
  throw new Error("Detalhe de torneio indisponível");
}

router.get("/tournaments", async (_req: Request, res: Response) => {
  try {
    const tournaments = await getActiveTournaments();
    res.json({ tournaments });
  } catch {
    res.status(500).json({ error: "Torneios indisponíveis" });
  }
});

// ─── Tennis standings (ATP + WTA) ──────────────────────────────────────────
type StandingPlayer = {
  id: string;
  name: string;
  country: string;
  rank: string;
  points: string;
  movement: string;
};
type StandingsTour = { atp: StandingPlayer[]; wta: StandingPlayer[] };
let standingsCache: StandingsTour | null = null;
let standingsFetchedAt = 0;
const STANDINGS_CACHE_TTL = 30 * 60 * 1000;

async function getTennisStandings(): Promise<StandingsTour> {
  return standingsCache ?? { atp: [], wta: [] };
}

router.get("/standings", async (_req: Request, res: Response) => {
  try {
    const standings = await getTennisStandings();
    res.json(standings);
  } catch {
    res.status(500).json({ error: "Rankings indisponíveis" });
  }
});

router.get("/tournaments/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const detail = await getTournamentDetail(id);
    res.json(detail);
  } catch {
    res.status(500).json({ error: "Detalhe de torneio indisponível" });
  }
});

router.get("/results", async (_req: Request, res: Response) => {
  try {
    const results = await getTennisDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/volleyball-results", async (_req: Request, res: Response) => {
  try {
    const results = await getVolleyballDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/hockey-results", async (_req: Request, res: Response) => {
  try {
    const results = await getHockeyDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/basketball-results", async (_req: Request, res: Response) => {
  try {
    const results = await getBasketballDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/mlb-results", async (_req: Request, res: Response) => {
  try {
    const results = await getMLBDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/basketball-schedule", async (_req: Request, res: Response) => {
  try {
    const data = await getBasketballSchedule();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

router.get("/hockey-schedule", async (_req: Request, res: Response) => {
  try {
    const data = await getHockeySchedule();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

router.get("/mlb-schedule", async (_req: Request, res: Response) => {
  try {
    const data = await getMLBSchedule();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

async function getHockeyStandings(): Promise<NHLStandingsData> {
  const now = Date.now();
  if (
    hockeyStandingsCache &&
    now - hockeyStandingsFetchedAt < HOCKEY_STANDINGS_TTL
  )
    return hockeyStandingsCache;

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nhl/standings"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          standings?: {
            tournament?: {
              season: string;
              league?: Array<{
                name: string;
                division?: Array<{
                  name: string;
                  team?: Array<{
                    difference: string;
                    games_played: string;
                    goals_against: string;
                    goals_for: string;
                    home_record: string;
                    id: string;
                    last_ten: string;
                    lost: string;
                    name: string;
                    ot_losses: string;
                    points: string;
                    position: string;
                    road_record: string;
                    streak: string;
                    won: string;
                  }>;
                }>;
              }>;
            };
          };
        };
        const tournament = payload.standings?.tournament;
        if (tournament) {
          const conferences = statpalList(tournament.league).map((league) => ({
            name: league.name,
            divisions: statpalList(league.division).map((division) => ({
              name: division.name,
              teams: statpalList(division.team)
                .map((team) => ({
                  id: team.id,
                  name: team.name,
                  abbr:
                    NHL_ABBR[team.name] ??
                    team.name.slice(0, 3).toLowerCase(),
                  position: Number.parseInt(team.position, 10) || 0,
                  gp: Number.parseInt(team.games_played, 10) || 0,
                  won: Number.parseInt(team.won, 10) || 0,
                  lost: Number.parseInt(team.lost, 10) || 0,
                  otLosses: Number.parseInt(team.ot_losses, 10) || 0,
                  points: Number.parseInt(team.points, 10) || 0,
                  gf: Number.parseInt(team.goals_for, 10) || 0,
                  ga: Number.parseInt(team.goals_against, 10) || 0,
                  diff: team.difference,
                  streak: team.streak,
                  lastTen: team.last_ten,
                  homeRecord: team.home_record,
                  roadRecord: team.road_record,
                }))
                .sort((a, b) => a.position - b.position),
            })),
          }));
          hockeyStandingsCache = {
            season: tournament.season,
            conferences,
          };
          hockeyStandingsFetchedAt = now;
          return hockeyStandingsCache;
        }
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NHL standings provider failed");
    }
  }

  try {
    const rows = await getV2StandingRows("hockey");
    if (!rows.length)
      return hockeyStandingsCache ?? { season: "", conferences: [] };
    const teams: NHLStandingsTeam[] = rows
      .map((row) => ({
        id: String(row.team.id),
        name: row.team.name,
        abbr:
          NHL_ABBR[row.team.name] ??
          row.team.nameCode?.toLowerCase() ??
          row.team.name.slice(0, 3).toLowerCase(),
        position: row.position,
        gp: row.matches,
        won: row.wins,
        lost: row.normaltimeLosses ?? row.losses,
        otLosses: row.overtimeLosses ?? 0,
        points: row.points ?? row.wins * 2,
        gf: row.scoresFor ?? 0,
        ga: row.scoresAgainst ?? 0,
        diff: row.scoreDiffFormatted ?? "0",
        streak:
          typeof row.streak === "number"
            ? String(row.streak)
            : ((row.streak as string | undefined) ?? ""),
        lastTen: "",
        homeRecord: "",
        roadRecord: "",
      }))
      .sort((a, b) => a.position - b.position);
    hockeyStandingsCache = {
      season: "2025-26",
      conferences: [
        { name: "NHL", divisions: [{ name: "Classificação", teams }] },
      ],
    };
    hockeyStandingsFetchedAt = now;
    return hockeyStandingsCache;
  } catch {
    return hockeyStandingsCache ?? { season: "", conferences: [] };
  }
}

async function getMLBStandings(): Promise<MLBStandingsData> {
  const now = Date.now();
  if (mlbStandingsCache && now - mlbStandingsFetchedAt < MLB_STANDINGS_TTL)
    return mlbStandingsCache;
  const empty: MLBStandingsData = { season: "", leagues: [] };
  try {
    const rows = await getV2StandingRows("baseball");
    if (!rows.length) return mlbStandingsCache ?? empty;
    const teams: MLBStandingsTeam[] = rows
      .map((row) => ({
        id: String(row.team.id),
        name: row.team.name,
        position: row.position,
        won: row.wins,
        lost: row.losses,
        gamesBack: row.gamesBehind != null ? String(row.gamesBehind) : "-",
        streak:
          typeof row.streak === "number"
            ? String(row.streak)
            : ((row.streak as string | undefined) ?? ""),
        homeRecord: "",
        awayRecord: "",
        runsScored: row.scoresFor ?? 0,
        runsAllowed: row.scoresAgainst ?? 0,
        runsDiff: row.scoreDiffFormatted ?? "0",
      }))
      .sort((a, b) => a.position - b.position);
    mlbStandingsCache = {
      season: "2025",
      leagues: [{ name: "MLB", divisions: [{ name: "Classificação", teams }] }],
    };
    mlbStandingsFetchedAt = now;
    return mlbStandingsCache;
  } catch {
    return mlbStandingsCache ?? empty;
  }
}

router.get("/mlb-standings", async (_req: Request, res: Response) => {
  try {
    const data = await getMLBStandings();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

router.get("/hockey-standings", async (_req: Request, res: Response) => {
  try {
    const data = await getHockeyStandings();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

async function getMLBRoster(abbr: string): Promise<MLBRosterData | null> {
  return mlbRosterCache.get(abbr) ?? null;
}

router.get("/mlb-roster/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getMLBRoster(abbr);
    if (!data) {
      res.status(404).json({ error: "Roster não encontrado" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Roster indisponível" });
  }
});

// MLB team stats (per-player season stats: Batting + Pitching)
type MLBBatterStat = {
  id: string;
  rank: number;
  name: string;
  gp: number;
  ab: number;
  h: number;
  avg: string;
  obp: string;
  slg: string;
  r: number;
  rbi: number;
  hr: number;
  doubles: number;
  triples: number;
  sb: number;
  bb: number;
  so: number;
};
type MLBPitcherStat = {
  id: string;
  rank: number;
  name: string;
  gp: number;
  gs: number;
  era: string;
  w: number;
  l: number;
  ip: string;
  so: number;
  bb: number;
  h: number;
  hr: number;
  whip: string;
  baa: string;
};
type MLBTeamStatsData = {
  teamName: string;
  season: string;
  batters: MLBBatterStat[];
  pitchers: MLBPitcherStat[];
};
const mlbTeamStatsCache = new Map<string, MLBTeamStatsData>();
const mlbTeamStatsFetchedAt = new Map<string, number>();
const MLB_TEAM_STATS_TTL = 30 * 60 * 1000;

async function getMLBTeamStats(abbr: string): Promise<MLBTeamStatsData | null> {
  return mlbTeamStatsCache.get(abbr) ?? null;
}

router.get("/mlb-team-stats/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getMLBTeamStats(abbr);
    if (!data) {
      res.status(404).json({ error: "Estatísticas indisponíveis" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas indisponíveis" });
  }
});

// MLB injuries
type MLBInjuryReport = {
  playerName: string;
  playerId: string;
  status: string;
  description: string;
  date: string;
};
type MLBInjuriesData = { teamName: string; report: MLBInjuryReport[] };
const mlbInjuriesCache = new Map<string, MLBInjuriesData>();
const mlbInjuriesFetchedAt = new Map<string, number>();
const MLB_INJURIES_TTL = 15 * 60 * 1000;

async function getMLBInjuries(abbr: string): Promise<MLBInjuriesData | null> {
  return mlbInjuriesCache.get(abbr) ?? null;
}

router.get("/mlb-injuries/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getMLBInjuries(abbr);
    if (!data) {
      res.status(404).json({ error: "Lesões indisponíveis" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Lesões indisponíveis" });
  }
});

// ─── MLB League Stats (batting + pitching leaders) ────────────────────────────
type MLBLeaderBatter = {
  rank: string;
  name: string;
  team: string;
  gp: string;
  atBats: string;
  hits: string;
  doubles: string;
  triples: string;
  homeRuns: string;
  runs: string;
  rbi: string;
  stolenBases: string;
  walks: string;
  strikeouts: string;
  avg: string;
  obp: string;
  slg: string;
};
type MLBLeagueStatsData = { batters: MLBLeaderBatter[] };

const MLB_LEAGUE_STATS_TTL = 30 * 60 * 1000;
let mlbLeagueStatsCache: MLBLeagueStatsData | null = null;
let mlbLeagueStatsFetchedAt = 0;

async function getMLBLeagueStats(): Promise<MLBLeagueStatsData> {
  return mlbLeagueStatsCache ?? { batters: [] };
}

router.get("/mlb-league-stats", async (_req: Request, res: Response) => {
  try {
    const data = await getMLBLeagueStats();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas da liga indisponíveis" });
  }
});

async function getNBAStandings(): Promise<NBAStandingsData> {
  const now = Date.now();
  if (nbaStandingsCache && now - nbaStandingsFetchedAt < NBA_STANDINGS_TTL)
    return nbaStandingsCache;
  try {
    const rows = await getV2StandingRows("basketball");
    if (!rows.length)
      return nbaStandingsCache ?? { season: "", conferences: [] };
    const teams: NBAStandingsTeam[] = rows
      .map((row) => ({
        id: String(row.team.id),
        name: row.team.name,
        abbr:
          NBA_ABBR[row.team.name] ??
          row.team.nameCode?.toLowerCase() ??
          row.team.name.slice(0, 3).toLowerCase(),
        position: row.position,
        won: row.wins,
        lost: row.losses,
        pct:
          row.percentage != null
            ? "." +
              Math.round(row.percentage * 1000)
                .toString()
                .padStart(3, "0")
            : ".000",
        gb: row.gamesBehind != null ? String(row.gamesBehind) : "-",
        streak:
          typeof row.streak === "number"
            ? String(row.streak)
            : ((row.streak as string | undefined) ?? ""),
        lastTen: "",
        homeRecord: "",
        roadRecord: "",
        ppg:
          row.scoresFor != null && row.matches > 0
            ? (row.scoresFor / row.matches).toFixed(1)
            : "0.0",
        papg:
          row.scoresAgainst != null && row.matches > 0
            ? (row.scoresAgainst / row.matches).toFixed(1)
            : "0.0",
        diff: row.scoreDiffFormatted ?? "0",
      }))
      .sort((a, b) => a.position - b.position);
    nbaStandingsCache = {
      season: "2025-26",
      conferences: [
        { name: "NBA", divisions: [{ name: "Classificação", teams }] },
      ],
    };
    nbaStandingsFetchedAt = now;
    return nbaStandingsCache;
  } catch {
    return nbaStandingsCache ?? { season: "", conferences: [] };
  }
}

router.get("/basketball-standings", async (_req: Request, res: Response) => {
  try {
    const data = await getNBAStandings();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

// NBA roster
type NBAPlayer = {
  id: string;
  name: string;
  number: string;
  age: number;
  position: string;
  college: string;
  height: string;
  weight: string;
  salary: string;
};
type NBATeamRoster = {
  teamName: string;
  abbreviation: string;
  season: string;
  players: NBAPlayer[];
};
const nbaRosterCache = new Map<string, NBATeamRoster>();
const nbaRosterFetchedAt = new Map<string, number>();
const NBA_ROSTER_TTL = 60 * 60 * 1000;

async function getBasketballRoster(
  abbr: string,
): Promise<NBATeamRoster | null> {
  return nbaRosterCache.get(abbr) ?? null;
}

router.get("/basketball-roster/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getBasketballRoster(abbr);
    if (!data) {
      res.status(404).json({ error: "Roster não encontrado" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Roster indisponível" });
  }
});

// NBA team stats
type NBAPlayerStat = {
  id: string;
  rank: number;
  name: string;
  gp: number;
  gs: number;
  min: string;
  ppg: string;
  apg: string;
  rpg: string;
  orpg: string;
  drpg: string;
  bpg: string;
  spg: string;
  topg: string;
  fpg: string;
  fgPct: string;
  fg3Pct: string;
  ftPct: string;
  fgm: string;
  fga: string;
  fg3m: string;
  fg3a: string;
  ftm: string;
  fta: string;
};
type NBATeamStatsData = { teamName: string; players: NBAPlayerStat[] };
const nbaTeamStatsCache = new Map<string, NBATeamStatsData>();
const nbaTeamStatsFetchedAt = new Map<string, number>();
const NBA_TEAM_STATS_TTL = 30 * 60 * 1000;

async function getBasketballTeamStats(
  abbr: string,
): Promise<NBATeamStatsData | null> {
  return nbaTeamStatsCache.get(abbr) ?? null;
}

router.get(
  "/basketball-team-stats/:team",
  async (req: Request, res: Response) => {
    const abbr = String(req.params["team"]).toLowerCase();
    try {
      const data = await getBasketballTeamStats(abbr);
      if (!data) {
        res.status(404).json({ error: "Estatísticas indisponíveis" });
        return;
      }
      res.json(data);
    } catch {
      res.status(500).json({ error: "Estatísticas indisponíveis" });
    }
  },
);

async function getHockeyRoster(abbr: string): Promise<NHLRosterData | null> {
  const cached = hockeyRosterCache.get(abbr);
  const fetchedAt = hockeyRosterFetchedAt.get(abbr) ?? 0;
  if (cached && Date.now() - fetchedAt < HOCKEY_ROSTER_TTL) return cached;
  if (!CONFIG.STATPAL_API_KEY) return cached ?? null;

  try {
    const resp = await fetch(
      buildStatpalUrl(`/v1/nhl/rosters/${encodeURIComponent(abbr)}`),
      {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      },
    );
    if (!resp.ok) return cached ?? null;
    const payload = (await resp.json()) as {
      team?: {
        abbreviation: string;
        id: string;
        name: string;
        season: string;
        position?: Array<{
          name: string;
          player?: Array<{
            id: string;
            name: string;
            number: string;
            age: string;
            birth_place: string;
            height: string;
            weight: string;
            shot: string;
            salarycap: string;
          }>;
        }>;
      };
    };
    const team = payload.team;
    if (!team) return cached ?? null;
    const data = {
      teamName: team.name,
      abbreviation: String(team.abbreviation ?? abbr).toLowerCase(),
      season: team.season,
      positions: statpalList(team.position).map((position) => ({
        name: position.name,
        players: statpalList(position.player).map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
          age: Number.parseInt(player.age, 10) || 0,
          birthPlace: player.birth_place,
          height: player.height,
          weight: player.weight,
          shot: player.shot,
          salary: player.salarycap,
        })),
      })),
    } satisfies NHLRosterData;
    hockeyRosterCache.set(abbr, data);
    hockeyRosterFetchedAt.set(abbr, Date.now());
    return data;
  } catch (err) {
    logger.warn({ err, provider: "statpal", abbr }, "NHL roster provider failed");
    return cached ?? null;
  }
}

router.get("/hockey-roster/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getHockeyRoster(abbr);
    if (!data) {
      res.status(404).json({ error: "Roster não encontrado" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Roster indisponível" });
  }
});

// NHL team stats (per-player season statistics)
type NHLSkaterStat = {
  id: string;
  rank: number;
  name: string;
  pos: string;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  ppg: number;
  ppa: number;
  shg: number;
  sha: number;
  shots: number;
  gwg: number;
  toiPerGame: string;
  faceoffPct: string;
};
type NHLGoalieStat = {
  id: string;
  rank: number;
  name: string;
  gp: number;
  wins: number;
  losses: number;
  otLosses: number;
  saves: number;
  savesPct: string;
  gaa: string;
  shotsAgainst: number;
  goalsAgainst: number;
  shutouts: number;
  toi: string;
};
type NHLTeamStatsData = {
  teamName: string;
  season: string;
  skaters: NHLSkaterStat[];
  goalies: NHLGoalieStat[];
};
type NHLRawSkaterStat = {
  assists?: string;
  faceoffs_pct?: string;
  game_winning_goals?: string;
  games_played?: string;
  goals?: string;
  id?: string;
  name?: string;
  penalty_minutes?: string;
  plus_minus?: string;
  points?: string;
  pos?: string;
  pp_assists?: string;
  pp_goals?: string;
  rank?: string;
  sh_assists?: string;
  sh_goals?: string;
  shots?: string;
  toi_per_game?: string;
};
type NHLRawGoalieStat = {
  id?: string;
  games_played?: string;
  goals_against_diff?: string;
  gaa?: string;
  losses?: string;
  name?: string;
  ot_losses?: string;
  rank?: string;
  saves?: string;
  saves_pct?: string;
  shutouts?: string;
  time_on_ice?: string;
  total_goals_against?: string;
  total_shots_against?: string;
  wins?: string;
};
type NHLRawInjuryReport = {
  date?: string;
  description?: string;
  player_id?: string;
  player_name?: string;
  status?: string;
};
const hockeyTeamStatsCache = new Map<string, NHLTeamStatsData>();
const hockeyTeamStatsFetchedAt = new Map<string, number>();
const HOCKEY_TEAM_STATS_TTL = 30 * 60 * 1000;

async function getHockeyTeamStats(
  abbr: string,
): Promise<NHLTeamStatsData | null> {
  const cached = hockeyTeamStatsCache.get(abbr);
  const fetchedAt = hockeyTeamStatsFetchedAt.get(abbr) ?? 0;
  if (cached && Date.now() - fetchedAt < HOCKEY_TEAM_STATS_TTL) return cached;
  if (!CONFIG.STATPAL_API_KEY) return cached ?? null;

  try {
    const resp = await fetch(
      buildStatpalUrl(`/v1/nhl/team-stats/${encodeURIComponent(abbr)}`),
      {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      },
    );
    if (!resp.ok) return cached ?? null;
    const payload = (await resp.json()) as {
      statistics?: {
        season?: string;
        team?:
          | Array<
              | string
              | {
                  player?: NHLRawSkaterStat[];
                }
            >
          | {
              name?: string;
              player?: NHLRawSkaterStat[];
            };
        goalkeepers?: {
          player?: NHLRawGoalieStat | NHLRawGoalieStat[];
        };
      };
    };
    const statistics = payload.statistics;
    if (!statistics) return cached ?? null;

    const teamParts = Array.isArray(statistics.team)
      ? statistics.team
      : statistics.team
        ? [statistics.team]
        : [];
    const teamName =
      (typeof teamParts[0] === "string" ? teamParts[0] : "") ||
      (statistics.team &&
      !Array.isArray(statistics.team) &&
      typeof statistics.team === "object"
        ? statistics.team.name ?? ""
        : "");
    const skaterNode = teamParts.find(
      (entry) => !!entry && typeof entry === "object" && !Array.isArray(entry),
    ) as { player?: NHLRawSkaterStat[] } | undefined;

    const data = {
      teamName,
      season: statistics.season ?? "",
      skaters: statpalList(skaterNode?.player).map((player) => ({
        id: String(player.id ?? ""),
        rank: Number.parseInt(player.rank ?? "", 10) || 0,
        name: String(player.name ?? ""),
        pos: String(player.pos ?? ""),
        gp: Number.parseInt(player.games_played ?? "", 10) || 0,
        goals: Number.parseInt(player.goals ?? "", 10) || 0,
        assists: Number.parseInt(player.assists ?? "", 10) || 0,
        points: Number.parseInt(player.points ?? "", 10) || 0,
        plusMinus: Number.parseInt(player.plus_minus ?? "", 10) || 0,
        pim: Number.parseInt(player.penalty_minutes ?? "", 10) || 0,
        ppg: Number.parseInt(player.pp_goals ?? "", 10) || 0,
        ppa: Number.parseInt(player.pp_assists ?? "", 10) || 0,
        shg: Number.parseInt(player.sh_goals ?? "", 10) || 0,
        sha: Number.parseInt(player.sh_assists ?? "", 10) || 0,
        shots: Number.parseInt(player.shots ?? "", 10) || 0,
        gwg: Number.parseInt(player.game_winning_goals ?? "", 10) || 0,
        toiPerGame: String(player.toi_per_game ?? ""),
        faceoffPct: String(player.faceoffs_pct ?? ""),
      })),
      goalies: statpalList(statistics.goalkeepers?.player).map((player) => ({
        id: String(player.id ?? ""),
        rank: Number.parseInt(player.rank ?? "", 10) || 0,
        name: String(player.name ?? ""),
        gp: Number.parseInt(player.games_played ?? "", 10) || 0,
        wins: Number.parseInt(player.wins ?? "", 10) || 0,
        losses: Number.parseInt(player.losses ?? "", 10) || 0,
        otLosses: Number.parseInt(player.ot_losses ?? "", 10) || 0,
        saves: Number.parseInt(player.saves ?? "", 10) || 0,
        savesPct: String(player.saves_pct ?? ""),
        gaa: String(player.gaa ?? player.goals_against_diff ?? ""),
        shotsAgainst: Number.parseInt(player.total_shots_against ?? "", 10) || 0,
        goalsAgainst:
          Number.parseInt(player.total_goals_against ?? "", 10) || 0,
        shutouts: Number.parseInt(player.shutouts ?? "", 10) || 0,
        toi: String(player.time_on_ice ?? ""),
      })),
    } satisfies NHLTeamStatsData;
    hockeyTeamStatsCache.set(abbr, data);
    hockeyTeamStatsFetchedAt.set(abbr, Date.now());
    return data;
  } catch (err) {
    logger.warn({ err, provider: "statpal", abbr }, "NHL team stats provider failed");
    return cached ?? null;
  }
}

router.get("/hockey-team-stats/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getHockeyTeamStats(abbr);
    if (!data) {
      res.status(404).json({ error: "Estatísticas indisponíveis" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas indisponíveis" });
  }
});

// NHL injuries
type NHLInjuryReport = {
  playerName: string;
  playerId: string;
  status: string;
  description: string;
  date: string;
};
type NHLInjuriesData = { teamName: string; report: NHLInjuryReport[] };
const hockeyInjuriesCache = new Map<string, NHLInjuriesData>();
const hockeyInjuriesFetchedAt = new Map<string, number>();
const HOCKEY_INJURIES_TTL = 15 * 60 * 1000; // 15 min — injuries change more often

async function getHockeyInjuries(
  abbr: string,
): Promise<NHLInjuriesData | null> {
  const cached = hockeyInjuriesCache.get(abbr);
  const fetchedAt = hockeyInjuriesFetchedAt.get(abbr) ?? 0;
  if (cached && Date.now() - fetchedAt < HOCKEY_INJURIES_TTL) return cached;
  if (!CONFIG.STATPAL_API_KEY) return cached ?? null;

  try {
    const resp = await fetch(
      buildStatpalUrl(`/v1/nhl/injuries/${encodeURIComponent(abbr)}`),
      {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      },
    );
    if (!resp.ok) return cached ?? null;
    const payload = (await resp.json()) as {
      team?: {
        name?: string;
        report?: NHLRawInjuryReport | NHLRawInjuryReport[];
      };
    };
    if (!payload.team) return cached ?? null;
    const data = {
      teamName: payload.team.name ?? "",
      report: statpalList(payload.team.report).map((entry) => ({
        playerName: String(entry.player_name ?? ""),
        playerId: String(entry.player_id ?? ""),
        status: String(entry.status ?? ""),
        description: String(entry.description ?? ""),
        date: String(entry.date ?? ""),
      })),
    } satisfies NHLInjuriesData;
    hockeyInjuriesCache.set(abbr, data);
    hockeyInjuriesFetchedAt.set(abbr, Date.now());
    return data;
  } catch (err) {
    logger.warn({ err, provider: "statpal", abbr }, "NHL injuries provider failed");
    return cached ?? null;
  }
}

router.get("/hockey-injuries/:team", async (req: Request, res: Response) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getHockeyInjuries(abbr);
    if (!data) {
      res.status(404).json({ error: "Lesões indisponíveis" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Lesões indisponíveis" });
  }
});

// NBA injuries
type NBAInjuryReport = {
  playerName: string;
  playerId: string;
  status: string;
  description: string;
  date: string;
};
type NBAInjuriesData = { teamName: string; report: NBAInjuryReport[] };
const nbaInjuriesCache = new Map<string, NBAInjuriesData>();
const nbaInjuriesFetchedAt = new Map<string, number>();
const NBA_INJURIES_TTL = 15 * 60 * 1000;

async function getBasketballInjuries(
  abbr: string,
): Promise<NBAInjuriesData | null> {
  return nbaInjuriesCache.get(abbr) ?? null;
}

router.get(
  "/basketball-injuries/:team",
  async (req: Request, res: Response) => {
    const abbr = String(req.params["team"]).toLowerCase();
    try {
      const data = await getBasketballInjuries(abbr);
      if (!data) {
        res.status(404).json({ error: "Lesões indisponíveis" });
        return;
      }
      res.json(data);
    } catch {
      res.status(500).json({ error: "Lesões indisponíveis" });
    }
  },
);

router.get("/volleyball-standings/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params["id"]);
    const data = await getVolleyballStandings(id);
    // Return empty-teams payload if the standings don't exist for this phase (e.g. play-offs)
    res.json(data ?? { id, name: "", season: "", country: "", teams: [] });
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

router.get("/volleyball-leagues", async (_req: Request, res: Response) => {
  try {
    const leagues = await getVolleyballActiveLeagues();
    res.json({ leagues });
  } catch {
    res.json({ leagues: [] });
  }
});

router.get("/volleyball-schedule/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params["id"]);
    const data = await getVolleyballSchedule(id);
    if (!data) {
      res.status(404).json({ error: "Calendário não encontrado" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

// ─── Tennis pre-match odds ────────────────────────────────────────────────────
type TennisOddsPlayer = { id: string; name: string };
type TennisOddsEntry = {
  matchId: string;
  date: string;
  time: string;
  tournamentName: string;
  status?: string;
  players: [TennisOddsPlayer, TennisOddsPlayer];
  matchOdds: [number, number];
  set1Odds: [number, number] | null;
  markets?: unknown;
};
let tennisOddsCache: TennisOddsEntry[] | null = null;
let tennisOddsFetchedAt = 0;
const TENNIS_ODDS_TTL = 20 * 1000; // 20s — odds fluctuate rapidly

// ─── Volleyball pre-match odds ────────────────────────────────────────────────
type VolleyOddsOdd = { id?: string; name?: string; value?: string };
type VolleyOddsTotal = {
  name?: string;
  stop?: string;
  odd?: VolleyOddsOdd | VolleyOddsOdd[];
};
type VolleyOddsBk = {
  id?: string;
  name?: string;
  stop?: string;
  ts?: string;
  odd?: VolleyOddsOdd | VolleyOddsOdd[];
  total?: VolleyOddsTotal | VolleyOddsTotal[];
};
type VolleyOddsType = {
  id?: string;
  stop?: string;
  value?: string;
  bookmaker?: VolleyOddsBk | VolleyOddsBk[];
};
type VolleyOddsTeam = { id?: string; name?: string };
type VolleyOddsMatch = {
  id?: string;
  date?: string;
  time?: string;
  status?: string;
  home?: VolleyOddsTeam;
  away?: VolleyOddsTeam;
  odds?: { ts?: string; type?: VolleyOddsType | VolleyOddsType[] };
};
type VolleyOddsTour = {
  gid?: string;
  id?: string;
  league?: string;
  matches?: { match?: VolleyOddsMatch | VolleyOddsMatch[] };
};
export type VolleyOddsEntry = {
  matchId: string;
  date: string;
  time: string;
  league: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeOdds: number;
  awayOdds: number;
  overUnder: { line: string; over: number; under: number } | null;
};
let volleyOddsCache: VolleyOddsEntry[] | null = null;
let volleyOddsFetchedAt = 0;
const VOLLEY_ODDS_TTL = 60 * 1000;

async function getVolleyballOdds(): Promise<VolleyOddsEntry[]> {
  const now = Date.now();
  if (volleyOddsCache && now - volleyOddsFetchedAt < VOLLEY_ODDS_TTL)
    return volleyOddsCache;
  if (!CONFIG.STATPAL_API_KEY) return volleyOddsCache ?? [];

  try {
    const resp = await fetch(buildStatpalUrl("/v1/volleyball/odds"), {
      signal: AbortSignal.timeout(8_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) return volleyOddsCache ?? [];
    const payload = (await resp.json()) as {
      odds?: { tournament?: VolleyOddsTour | VolleyOddsTour[] };
    };
    const tournaments = statpalList(payload.odds?.tournament);
    const odds = tournaments.flatMap((tournament) =>
      statpalList(tournament.matches?.match).flatMap((match) => {
        const types = statpalList(match.odds?.type);
        const moneyline = types.find((entry) =>
          String(entry.value ?? "")
            .trim()
            .toLowerCase()
            .includes("home/away"),
        );
        const moneylineBookmakers = statpalList(moneyline?.bookmaker).filter(
          (bookmaker) => String(bookmaker.stop ?? "False") !== "True",
        );
        const moneylineOdds = moneylineBookmakers
          .map((bookmaker) => {
            const home = statpalList(bookmaker.odd).find(
              (odd) => String(odd.name ?? "").trim().toLowerCase() === "home",
            );
            const away = statpalList(bookmaker.odd).find(
              (odd) => String(odd.name ?? "").trim().toLowerCase() === "away",
            );
            return {
              home: Number.parseFloat(home?.value ?? ""),
              away: Number.parseFloat(away?.value ?? ""),
            };
          })
          .find((entry) => entry.home > 1 && entry.away > 1);
        if (!moneylineOdds) return [];

        const totalType = types.find((entry) =>
          String(entry.value ?? "")
            .trim()
            .toLowerCase()
            .includes("over/under"),
        );
        const totalBookmaker = statpalList(totalType?.bookmaker).find(
          (bookmaker) =>
            String(bookmaker.stop ?? "False") !== "True" &&
            statpalList(bookmaker.total).length > 0,
        );
        const overUnder =
          statpalList(totalBookmaker?.total)
            .map((total) => {
              const over = statpalList(total.odd).find(
                (odd) => String(odd.name ?? "").trim().toLowerCase() === "over",
              );
              const under = statpalList(total.odd).find(
                (odd) => String(odd.name ?? "").trim().toLowerCase() === "under",
              );
              return {
                line: String(total.name ?? ""),
                over: Number.parseFloat(over?.value ?? ""),
                under: Number.parseFloat(under?.value ?? ""),
              };
            })
            .find((total) => total.over > 1 && total.under > 1) ?? null;

        return [
          {
            matchId: String(match.id ?? ""),
            date: String(match.date ?? ""),
            time: String(match.time ?? ""),
            league: String(tournament.league ?? ""),
            homeTeam: {
              id: String(match.home?.id ?? ""),
              name: String(match.home?.name ?? ""),
            },
            awayTeam: {
              id: String(match.away?.id ?? ""),
              name: String(match.away?.name ?? ""),
            },
            homeOdds: moneylineOdds.home,
            awayOdds: moneylineOdds.away,
            overUnder,
          } satisfies VolleyOddsEntry,
        ];
      }),
    );
    volleyOddsCache = odds;
    volleyOddsFetchedAt = now;
    return odds;
  } catch (err) {
    logger.warn({ err, provider: "statpal" }, "Volleyball odds provider failed");
    return volleyOddsCache ?? [];
  }
}

router.get("/volleyball-odds", async (_req: Request, res: Response) => {
  try {
    const odds = await getVolleyballOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de voleibol indisponíveis" });
  }
});

// NBA pre-match odds
type NBAOddsOdd = { name?: string; value?: string };
type NBAOddsBk = {
  id?: string;
  name?: string;
  stop?: string;
  odd?: NBAOddsOdd | NBAOddsOdd[];
};
type NBAOddsType = {
  id?: string;
  stop?: string;
  value?: string;
  bookmaker?: NBAOddsBk | NBAOddsBk[];
};
type NBAOddsMatch = {
  id?: string;
  date?: string;
  time?: string;
  status?: string;
  home?: { id?: string; name?: string };
  away?: { id?: string; name?: string };
  odds?: { ts?: string; type?: NBAOddsType | NBAOddsType[] };
};
export type NBAOddsEntry = {
  matchId: string;
  date: string;
  time: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeOdds: number;
  awayOdds: number;
  halfOdds?: { home: number; away: number };
  q1Odds?: { home: number; away: number };
  q2Odds?: { home: number; away: number };
  q3Odds?: { home: number; away: number };
  q4Odds?: { home: number; away: number };
  markets?: unknown;
};
let nbaOddsCache: NBAOddsEntry[] | null = null;
let nbaOddsFetchedAt = 0;
const NBA_ODDS_TTL = 60 * 1000;
let nbaOddsInFlight: Promise<NBAOddsEntry[]> | null = null;

// ── Statpal /v1/nba/odds parser ───────────────────────────────────────────────
// 1 request vs N per-match SportsAPI calls — same approach as fetchStatpalMLBOdds.
async function fetchStatpalNBAOdds(): Promise<NBAOddsEntry[] | null> {
  if (!CONFIG.STATPAL_API_KEY) return null;
  try {
    const resp = await fetch(buildStatpalUrl("/v1/nba/odds"), {
      signal: AbortSignal.timeout(8_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as {
      odds?: { category?: { matches?: { match?: unknown | unknown[] } } };
    };
    const matches = statpalList(
      payload.odds?.category?.matches?.match as NBAOddsMatch | NBAOddsMatch[] | undefined,
    );
    const results: NBAOddsEntry[] = [];
    for (const m of matches) {
      if (!m?.home?.name || !m?.away?.name) continue;
      const types = statpalList(m.odds?.type);
      // Statpal NBA uses id "1500" for 3Way Result (vs "1" for MLB)
      const threeWay = types.find(
        (t) =>
          t.id === "1500" ||
          t.id === "1" ||
          String(t.value ?? "").toLowerCase().includes("result"),
      );
      if (!threeWay) continue;
      const bms = statpalList(threeWay.bookmaker);
      if (!bms.length) continue;
      const odds = statpalList(bms[0]!.odd);
      const homeOdds = parseFloat(odds.find((o) => o.name === "Home")?.value ?? "0");
      const awayOdds = parseFloat(odds.find((o) => o.name === "Away")?.value ?? "0");
      if (homeOdds <= 1 || awayOdds <= 1) continue;
      const mkt = makeBasketballMarketsFromTeams(
        m.home.name ?? "",
        m.away.name ?? "",
      ) as Record<string, unknown>;
      mkt["odds"] = { home: homeOdds, draw: 0, away: awayOdds };
      results.push({
        matchId: String(m.id ?? ""),
        date: String(m.date ?? ""),
        time: String(m.time ?? ""),
        homeTeam: { id: String(m.home.id ?? ""), name: m.home.name ?? "" },
        awayTeam: { id: String(m.away.id ?? ""), name: m.away.name ?? "" },
        homeOdds,
        awayOdds,
        markets: mkt,
      });
    }
    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn({ err, provider: "statpal" }, "NBA odds fetch failed");
    return null;
  }
}

async function getBasketballOdds(): Promise<NBAOddsEntry[]> {
  const now = Date.now();
  if (nbaOddsCache && now - nbaOddsFetchedAt < NBA_ODDS_TTL)
    return nbaOddsCache;
  if (nbaOddsCache) {
    if (!nbaOddsInFlight) {
      nbaOddsInFlight = (async () => {
        try {
          // Try Statpal first (1 request) before N per-match SportsAPI V2 calls
          const statpalResults = await fetchStatpalNBAOdds();
          if (statpalResults) {
            nbaOddsCache = statpalResults;
            nbaOddsFetchedAt = Date.now();
            return statpalResults;
          }
          const events = (
            await getUpcomingLeagueEventsV2("basketball", 7)
          ).slice(0, 20);
          const oddsResults: Array<V2PreMatchOdds | null> = new Array(
            events.length,
          ).fill(null);
          const batchSize = 10;
          for (let i = 0; i < events.length; i += batchSize) {
            const slice = events.slice(i, i + batchSize);
            const out = await Promise.all(
              slice.map((ev) =>
                getPreMatchOddsV2("basketball", ev.id).catch(() => null),
              ),
            );
            for (let j = 0; j < out.length; j++)
              oddsResults[i + j] = out[j] ?? null;
          }
          const results: NBAOddsEntry[] = [];
          for (let i = 0; i < events.length; i++) {
            const ev = events[i]!;
            const realOdds = oddsResults[i];
            if (!realOdds || realOdds.home <= 0 || realOdds.away <= 0) continue;
            const homeName = v2TeamName(ev.homeTeam);
            const awayName = v2TeamName(ev.awayTeam);
            const { date, time } = v2EventDateTime(ev);
            const mkt = makeBasketballMarketsFromTeams(
              homeName,
              awayName,
            ) as Record<string, unknown>;
            mkt["odds"] = { home: realOdds.home, draw: 0, away: realOdds.away };
            results.push({
              matchId: String(ev.id),
              date,
              time,
              homeTeam: { id: "", name: homeName },
              awayTeam: { id: "", name: awayName },
              homeOdds: realOdds.home,
              awayOdds: realOdds.away,
              markets: mkt,
            });
          }
          nbaOddsCache = results;
          nbaOddsFetchedAt = Date.now();
          return results;
        } catch {
          return nbaOddsCache ?? [];
        }
      })().finally(() => {
        nbaOddsInFlight = null;
      });
    }
    return nbaOddsCache;
  }
  // Cold-start: try Statpal first (1 request), fall back to SportsAPI V2
  try {
    const statpalResults = await fetchStatpalNBAOdds();
    if (statpalResults) {
      nbaOddsCache = statpalResults;
      nbaOddsFetchedAt = now;
      return statpalResults;
    }
  } catch {
    /* fall through */
  }
  try {
    const events = (await getUpcomingLeagueEventsV2("basketball", 7)).slice(
      0,
      20,
    );
    const oddsResults: Array<V2PreMatchOdds | null> = new Array(
      events.length,
    ).fill(null);
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      const out = await Promise.all(
        slice.map((ev) =>
          getPreMatchOddsV2("basketball", ev.id).catch(() => null),
        ),
      );
      for (let j = 0; j < out.length; j++) oddsResults[i + j] = out[j] ?? null;
    }
    const results: NBAOddsEntry[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      const realOdds = oddsResults[i];
      if (!realOdds || realOdds.home <= 0 || realOdds.away <= 0) continue;
      const homeName = v2TeamName(ev.homeTeam);
      const awayName = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const mkt = makeBasketballMarketsFromTeams(homeName, awayName) as Record<
        string,
        unknown
      >;
      mkt["odds"] = { home: realOdds.home, draw: 0, away: realOdds.away };
      results.push({
        matchId: String(ev.id),
        date,
        time,
        homeTeam: { id: "", name: homeName },
        awayTeam: { id: "", name: awayName },
        homeOdds: realOdds.home,
        awayOdds: realOdds.away,
        markets: mkt,
      });
    }
    nbaOddsCache = results;
    nbaOddsFetchedAt = now;
    return results;
  } catch {
    return nbaOddsCache ?? [];
  }
}

router.get("/basketball-odds", async (_req: Request, res: Response) => {
  try {
    const odds = await getBasketballOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de basquetebol indisponíveis" });
  }
});

// NHL pre-match odds
type HockeyOddsOdd = { name?: string; value?: string };
type HockeyOddsBk = {
  id?: string;
  name?: string;
  stop?: string;
  odd?: HockeyOddsOdd | HockeyOddsOdd[];
};
type HockeyOddsType = {
  id?: string;
  stop?: string;
  value?: string;
  bookmaker?: HockeyOddsBk | HockeyOddsBk[];
};
type HockeyOddsMatch = {
  id?: string;
  fix_id?: string;
  date?: string;
  time?: string;
  status?: string;
  home?: { id?: string; name?: string };
  away?: { id?: string; name?: string };
  odds?: { ts?: number; type?: HockeyOddsType | HockeyOddsType[] };
};
export type HockeyOddsEntry = {
  matchId: string;
  date: string;
  time: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  btts?: { yes: number; no: number };
  doubleChance?: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
  p1Odds?: { home: number; draw: number; away: number };
  p2Odds?: { home: number; draw: number; away: number };
  p3Odds?: { home: number; draw: number; away: number };
  markets?: unknown;
};
let hockeyOddsCache: HockeyOddsEntry[] | null = null;
let hockeyOddsFetchedAt = 0;
const HOCKEY_ODDS_TTL = 60 * 1000;
let hockeyOddsInFlight: Promise<HockeyOddsEntry[]> | null = null;

async function getHockeyOdds(): Promise<HockeyOddsEntry[]> {
  const now = Date.now();
  if (hockeyOddsCache && now - hockeyOddsFetchedAt < HOCKEY_ODDS_TTL)
    return hockeyOddsCache;
  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v1/nhl/odds"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          odds?: {
            category?: {
              name?: string;
              matches?: { match?: HockeyOddsMatch | HockeyOddsMatch[] };
            };
          };
        };
        const category = payload.odds?.category;
        const results = statpalList(category?.matches?.match).flatMap((match) => {
          const types = statpalList(match.odds?.type);
          const resultType = types.find((entry) =>
            String(entry.value ?? "")
              .trim()
              .toLowerCase()
              .includes("3way result"),
          );
          const bookmakers = statpalList(resultType?.bookmaker).filter(
            (bookmaker) => String(bookmaker.stop ?? "False") !== "True",
          );
          const prices = bookmakers
            .map((bookmaker) => {
              const home = statpalList(bookmaker.odd).find(
                (odd) => String(odd.name ?? "").trim().toLowerCase() === "home",
              );
              const draw = statpalList(bookmaker.odd).find(
                (odd) => String(odd.name ?? "").trim().toLowerCase() === "draw",
              );
              const away = statpalList(bookmaker.odd).find(
                (odd) => String(odd.name ?? "").trim().toLowerCase() === "away",
              );
              return {
                home: Number.parseFloat(home?.value ?? ""),
                draw: Number.parseFloat(draw?.value ?? ""),
                away: Number.parseFloat(away?.value ?? ""),
              };
            })
            .find((entry) => entry.home > 1 && entry.draw > 1 && entry.away > 1);
          if (!prices) return [];

          const homeName = String(match.home?.name ?? "");
          const awayName = String(match.away?.name ?? "");
          const markets = makeHockeyMarketsFromTeams(
            homeName,
            awayName,
          ) as Record<string, unknown>;
          markets["odds"] = prices;
          return [
            {
              matchId: String(match.id ?? ""),
              date: String(match.date ?? ""),
              time: String(match.time ?? ""),
              homeTeam: {
                id: String(match.home?.id ?? ""),
                name: homeName,
              },
              awayTeam: {
                id: String(match.away?.id ?? ""),
                name: awayName,
              },
              homeOdds: prices.home,
              drawOdds: prices.draw,
              awayOdds: prices.away,
              markets,
            } satisfies HockeyOddsEntry,
          ];
        });
        hockeyOddsCache = results;
        hockeyOddsFetchedAt = now;
        return results;
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "NHL odds provider failed; falling back");
    }
  }
  if (hockeyOddsCache) {
    if (!hockeyOddsInFlight) {
      hockeyOddsInFlight = (async () => {
        try {
          const events = (await getUpcomingLeagueEventsV2("hockey", 7)).slice(
            0,
            20,
          );
          const oddsResults: Array<V2PreMatchOdds | null> = new Array(
            events.length,
          ).fill(null);
          const batchSize = 10;
          for (let i = 0; i < events.length; i += batchSize) {
            const slice = events.slice(i, i + batchSize);
            const out = await Promise.all(
              slice.map((ev) =>
                getPreMatchOddsV2("hockey", ev.id).catch(() => null),
              ),
            );
            for (let j = 0; j < out.length; j++)
              oddsResults[i + j] = out[j] ?? null;
          }
          const results: HockeyOddsEntry[] = [];
          for (let i = 0; i < events.length; i++) {
            const ev = events[i]!;
            const realOdds = oddsResults[i];
            if (!realOdds || realOdds.home <= 0) continue;
            const homeName = v2TeamName(ev.homeTeam);
            const awayName = v2TeamName(ev.awayTeam);
            const { date, time } = v2EventDateTime(ev);
            const mkt = makeHockeyMarketsFromTeams(
              homeName,
              awayName,
            ) as Record<string, unknown>;
            const h = realOdds.home;
            const d = realOdds.draw || 0;
            const a = realOdds.away;
            mkt["odds"] = { home: h, draw: d, away: a };
            results.push({
              matchId: String(ev.id),
              date,
              time,
              homeTeam: { id: "", name: homeName },
              awayTeam: { id: "", name: awayName },
              homeOdds: h,
              drawOdds: d,
              awayOdds: a,
              markets: mkt,
            });
          }
          hockeyOddsCache = results;
          hockeyOddsFetchedAt = Date.now();
          return results;
        } catch {
          return hockeyOddsCache ?? [];
        }
      })().finally(() => {
        hockeyOddsInFlight = null;
      });
    }
    return hockeyOddsCache;
  }
  try {
    const events = (await getUpcomingLeagueEventsV2("hockey", 7)).slice(0, 20);
    const oddsResults: Array<V2PreMatchOdds | null> = new Array(
      events.length,
    ).fill(null);
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      const out = await Promise.all(
        slice.map((ev) => getPreMatchOddsV2("hockey", ev.id).catch(() => null)),
      );
      for (let j = 0; j < out.length; j++) oddsResults[i + j] = out[j] ?? null;
    }
    const results: HockeyOddsEntry[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      const realOdds = oddsResults[i];
      if (!realOdds || realOdds.home <= 0) continue;
      const homeName = v2TeamName(ev.homeTeam);
      const awayName = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const mkt = makeHockeyMarketsFromTeams(homeName, awayName) as Record<
        string,
        unknown
      >;
      const h = realOdds.home;
      const d = realOdds.draw || 0;
      const a = realOdds.away;
      mkt["odds"] = { home: h, draw: d, away: a };
      results.push({
        matchId: String(ev.id),
        date,
        time,
        homeTeam: { id: "", name: homeName },
        awayTeam: { id: "", name: awayName },
        homeOdds: h,
        drawOdds: d,
        awayOdds: a,
        markets: mkt,
      });
    }
    hockeyOddsCache = results;
    hockeyOddsFetchedAt = now;
    return results;
  } catch {
    return hockeyOddsCache ?? [];
  }
}

router.get("/hockey-odds", async (_req: Request, res: Response) => {
  try {
    const odds = await getHockeyOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de hockey indisponíveis" });
  }
});

// ─── MLB Odds ─────────────────────────────────────────────────────────────────
type MLBOddsOdd = { name?: string; value?: string };
type MLBOddsBk = {
  id?: string;
  name?: string;
  stop?: string;
  odd?: MLBOddsOdd | MLBOddsOdd[];
};
type MLBOddsType = {
  id?: string;
  value?: string;
  bookmaker?: MLBOddsBk | MLBOddsBk[];
};
type MLBOddsMatch = {
  id?: string;
  mlbid?: string;
  date?: string;
  time?: string;
  status?: string;
  home?: { id?: string; name?: string };
  away?: { id?: string; name?: string };
  odds?: { ts?: string; type?: MLBOddsType | MLBOddsType[] };
};
export type MLBOddsEntry = {
  matchId: string;
  date: string;
  time: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  markets?: AdvancedMarkets;
};

const MLB_ODDS_TTL = 5 * 60 * 1000;
let mlbOddsCache: MLBOddsEntry[] | null = null;
let mlbOddsFetchedAt = 0;
let mlbOddsInFlight: Promise<MLBOddsEntry[]> | null = null;

// ── Statpal /v1/mlb/odds parser ───────────────────────────────────────────────
// Returns an array of MLBOddsEntry built from Statpal's 3Way Result market.
// Much cheaper than the SportsAPI V2 path (1 request vs N per-match requests).
async function fetchStatpalMLBOdds(): Promise<MLBOddsEntry[] | null> {
  if (!CONFIG.STATPAL_API_KEY) return null;
  try {
    const resp = await fetch(buildStatpalUrl("/v1/mlb/odds"), {
      signal: AbortSignal.timeout(8_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as {
      odds?: {
        category?: {
          matches?: {
            match?: unknown | unknown[];
          };
        };
      };
    };
    type StatpalOddsOdd = { name: string; value: string };
    type StatpalOddsBm = { odd: StatpalOddsOdd | StatpalOddsOdd[] };
    type StatpalOddsType = { id: string; value: string; bookmaker: StatpalOddsBm | StatpalOddsBm[] };
    type StatpalOddsMatch = {
      id: string; mlbid: string; date: string; time: string; status: string;
      home: { id: string; name: string };
      away: { id: string; name: string };
      odds?: { type?: StatpalOddsType | StatpalOddsType[] };
    };
    const matches = statpalList(payload.odds?.category?.matches?.match as StatpalOddsMatch | StatpalOddsMatch[] | undefined);
    const results: MLBOddsEntry[] = [];
    for (const m of matches) {
      if (!m?.home?.name || !m?.away?.name) continue;
      const types = statpalList(m.odds?.type);
      const threeWay = types.find(
        (t) => t.id === "1" || t.value?.toLowerCase().includes("result"),
      );
      if (!threeWay) continue;
      const bms = statpalList(threeWay.bookmaker);
      if (!bms.length) continue;
      const odds = statpalList(bms[0]!.odd);
      const homeOdds = parseFloat(odds.find((o) => o.name === "Home")?.value ?? "0");
      const awayOdds = parseFloat(odds.find((o) => o.name === "Away")?.value ?? "0");
      const drawOdds = parseFloat(odds.find((o) => o.name === "Draw")?.value ?? "0");
      if (homeOdds <= 1 || awayOdds <= 1) continue;
      const entry: MLBOddsEntry = {
        matchId: m.mlbid || m.id,
        date: m.date ?? "",
        time: m.time ?? "",
        homeTeam: { id: m.home.id, name: m.home.name },
        awayTeam: { id: m.away.id, name: m.away.name },
        homeOdds,
        drawOdds: drawOdds > 1 ? drawOdds : 0,
        awayOdds,
        markets: makeMLBMarketsFromTeams(m.home.name, m.away.name, homeOdds, awayOdds),
      };
      results.push(entry);
    }
    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn({ err, provider: "statpal" }, "MLB odds fetch failed");
    return null;
  }
}

async function getMLBOdds(): Promise<MLBOddsEntry[]> {
  const now = Date.now();
  if (mlbOddsCache && now - mlbOddsFetchedAt < MLB_ODDS_TTL)
    return mlbOddsCache;
  if (mlbOddsCache) {
    if (!mlbOddsInFlight) {
      mlbOddsInFlight = (async () => {
        try {
          // Try Statpal first (1 request) before falling back to per-match SportsAPI V2
          const statpalResults = await fetchStatpalMLBOdds();
          if (statpalResults) {
            for (const r of statpalResults) {
              const normH = r.homeTeam.name.toLowerCase().trim();
              const normA = r.awayTeam.name.toLowerCase().trim();
              mlbRawOddsMap.set(`${normH}|${normA}`, { h: r.homeOdds, a: r.awayOdds });
              mlbRawOddsMap.set(`${normA}|${normH}`, { h: r.awayOdds, a: r.homeOdds });
            }
            mlbOddsCache = statpalResults;
            mlbOddsFetchedAt = Date.now();
            return statpalResults;
          }
          const events = (await getUpcomingLeagueEventsV2("baseball", 7)).slice(
            0,
            20,
          );
          const oddsResults: Array<V2PreMatchOdds | null> = new Array(
            events.length,
          ).fill(null);
          const batchSize = 10;
          for (let i = 0; i < events.length; i += batchSize) {
            const slice = events.slice(i, i + batchSize);
            const out = await Promise.all(
              slice.map((ev) =>
                getPreMatchOddsV2("baseball", ev.id).catch(() => null),
              ),
            );
            for (let j = 0; j < out.length; j++)
              oddsResults[i + j] = out[j] ?? null;
          }
          const results: MLBOddsEntry[] = [];
          for (let i = 0; i < events.length; i++) {
            const ev = events[i]!;
            const realOdds = oddsResults[i];
            if (!realOdds || realOdds.home <= 0) continue;
            const homeName = v2TeamName(ev.homeTeam);
            const awayName = v2TeamName(ev.awayTeam);
            const { date, time } = v2EventDateTime(ev);
            results.push({
              matchId: String(ev.id),
              date,
              time,
              homeTeam: { id: "", name: homeName },
              awayTeam: { id: "", name: awayName },
              homeOdds: realOdds.home,
              drawOdds: realOdds.draw || 0,
              awayOdds: realOdds.away,
              markets: makeAdvancedMarketsFromTeams(homeName, awayName),
            });
          }
          mlbOddsCache = results;
          mlbOddsFetchedAt = Date.now();
          return results;
        } catch {
          return mlbOddsCache ?? [];
        }
      })().finally(() => {
        mlbOddsInFlight = null;
      });
    }
    return mlbOddsCache;
  }
  // Cold-start: try Statpal first (1 request), fall back to SportsAPI V2 (N requests)
  try {
    const statpalResults = await fetchStatpalMLBOdds();
    if (statpalResults) {
      for (const r of statpalResults) {
        const normH = r.homeTeam.name.toLowerCase().trim();
        const normA = r.awayTeam.name.toLowerCase().trim();
        mlbRawOddsMap.set(`${normH}|${normA}`, { h: r.homeOdds, a: r.awayOdds });
        mlbRawOddsMap.set(`${normA}|${normH}`, { h: r.awayOdds, a: r.homeOdds });
      }
      mlbOddsCache = statpalResults;
      mlbOddsFetchedAt = now;
      return statpalResults;
    }
  } catch {
    /* fall through to SportsAPI V2 */
  }
  try {
    const events = (await getUpcomingLeagueEventsV2("baseball", 7)).slice(
      0,
      20,
    );
    const oddsResults: Array<V2PreMatchOdds | null> = new Array(
      events.length,
    ).fill(null);
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      const out = await Promise.all(
        slice.map((ev) =>
          getPreMatchOddsV2("baseball", ev.id).catch(() => null),
        ),
      );
      for (let j = 0; j < out.length; j++) oddsResults[i + j] = out[j] ?? null;
    }
    const results: MLBOddsEntry[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      const realOdds = oddsResults[i];
      if (!realOdds || realOdds.home <= 0) continue;
      const homeName = v2TeamName(ev.homeTeam);
      const awayName = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      results.push({
        matchId: String(ev.id),
        date,
        time,
        homeTeam: { id: "", name: homeName },
        awayTeam: { id: "", name: awayName },
        homeOdds: realOdds.home,
        drawOdds: 0,
        awayOdds: realOdds.away,
        markets: makeMLBMarketsFromTeams(
          homeName,
          awayName,
          realOdds.home,
          realOdds.away,
        ),
      });
    }
    // Populate raw odds map for live match building
    for (const r of results) {
      const normH = r.homeTeam.name.toLowerCase().trim();
      const normA = r.awayTeam.name.toLowerCase().trim();
      mlbRawOddsMap.set(`${normH}|${normA}`, { h: r.homeOdds, a: r.awayOdds });
      mlbRawOddsMap.set(`${normA}|${normH}`, { h: r.awayOdds, a: r.homeOdds });
    }
    mlbOddsCache = results;
    mlbOddsFetchedAt = now;
    return results;
  } catch {
    return mlbOddsCache ?? [];
  }
}

/** Merges real onexbet baseball odds (extractBaseballOverride, new
 * 2026-08-28 — see pulsescore/baseball.ts's header for why baseball had no
 * PulseScore prematch integration before this) onto getMLBOdds()'s existing
 * Statpal/SportsAPI V2 list. Additive, not a replacement: the old pipeline
 * still supplies the match list itself (identity/date/time/team-name
 * conventions many other things already depend on) — this only overrides
 * homeOdds/awayOdds/markets in place, per match, when a real PulseScore
 * price is found for it (by team name, same teamNamesMatch cross-provider
 * matching every other sport's real-odds merge already uses). Matches with
 * no PulseScore price keep whatever getMLBOdds() already gave them. */
async function getMergedMLBOdds(): Promise<MLBOddsEntry[]> {
  const base = await getMLBOdds();
  let pulseEvents: PulseScoreBaseballPrematchEvent[] = [];
  try {
    pulseEvents = await getPulseScoreBaseballUpcoming();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[pulsescore] baseball upcoming fetch failed for /mlb-odds merge — serving unmerged list",
    );
    return base;
  }
  if (pulseEvents.length === 0) return base;

  return base.map((entry) => {
    const pev = pulseEvents.find(
      (e) =>
        teamNamesMatch(entry.homeTeam.name, e.home) &&
        teamNamesMatch(entry.awayTeam.name, e.away),
    );
    if (!pev) return entry;
    const override = extractBaseballOverride(pev);
    if (!override.odds && !override.runLine && !override.totalLines && !override.f5) {
      return entry;
    }
    const markets = makeMLBMarketsFromTeams(
      entry.homeTeam.name,
      entry.awayTeam.name,
      override.odds?.home,
      override.odds?.away,
    );
    if (override.totalLines && override.totalLines.length > 0) {
      const mid = override.totalLines[Math.floor(override.totalLines.length / 2)]!;
      const lo = override.totalLines.find((l) => l.line === mid.line - 0.5 || l.line === mid.line - 1);
      const hi = override.totalLines.find((l) => l.line === mid.line + 0.5 || l.line === mid.line + 1);
      markets.totalGoals = {
        ...markets.totalGoals,
        over35: mid.over,
        under35: mid.under,
        ...(lo ? { over25: lo.over, under25: lo.under } : {}),
        ...(hi ? { over45: hi.over, under45: hi.under } : {}),
      };
      markets._total = mid.line;
    }
    // Standard MLB run line is a fixed ±1.5 split — prefer that exact line
    // if onexbet priced it (matches the existing mlb-rl-home-1.5/rl-home
    // settlement's default), otherwise fall back to whichever line was
    // picked as most-even.
    const rl =
      override.runLineLines?.find((l) => Math.abs(l.line) === 1.5) ?? override.runLine;
    if (rl) {
      markets.handicap = {
        ...markets.handicap,
        homeMinusOne: rl.home,
        awayPlusOne: rl.away,
      };
      markets._spread = -rl.line;
      markets._spreadLine = -rl.line;
    }
    if (override.f5 || override.f5Total) {
      markets.mlbExtra = {
        ...markets.mlbExtra,
        ...(override.f5 ? { f5Result: override.f5 } : {}),
        ...(override.f5Total ? { f5Total: override.f5Total } : {}),
      };
    }
    return {
      ...entry,
      homeOdds: override.odds?.home ?? entry.homeOdds,
      awayOdds: override.odds?.away ?? entry.awayOdds,
      drawOdds: 0,
      markets,
    };
  });
}

router.get("/mlb-odds", async (_req: Request, res: Response) => {
  try {
    const odds = await getMergedMLBOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de baseball indisponíveis" });
  }
});

async function getTennisOdds(): Promise<TennisOddsEntry[]> {
  const now = Date.now();
  if (tennisOddsCache && now - tennisOddsFetchedAt < TENNIS_ODDS_TTL)
    return tennisOddsCache;
  try {
    const events = await getUpcomingLeagueEventsV2("tennis", 7);
    // Populate V1 league label cache from these V2 events (they have ATP/WTA category info)
    refreshTennisV2LeagueCache(events);
    const oddsResults = await Promise.all(
      events.map((ev) => getPreMatchOddsV2("tennis", ev.id).catch(() => null)),
    );
    const results: TennisOddsEntry[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      const realOdds = oddsResults[i];
      if (!realOdds || realOdds.home <= 0) continue;
      const p0Name = v2TeamName(ev.homeTeam);
      const p1Name = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const h = realOdds.home;
      const a = realOdds.away;
      if (p0Name && p1Name) {
        const pairKey = _tennisPairKey(p0Name, p1Name);
        _tennisPreMatchOdds.set(pairKey, { home: h, away: a });
        _tennisPreMatchSetScoreOdds.set(pairKey, {
          ...(Array.isArray(realOdds.score1st) && realOdds.score1st.length > 0
            ? { score1st: realOdds.score1st }
            : {}),
          ...(Array.isArray(realOdds.score2nd) && realOdds.score2nd.length > 0
            ? { score2nd: realOdds.score2nd }
            : {}),
          ...(Array.isArray(realOdds.score3rd) && realOdds.score3rd.length > 0
            ? { score3rd: realOdds.score3rd }
            : {}),
        });
      }
      const pHome = h > 0 && a > 0 ? 1 / h / (1 / h + 1 / a) : 0.5;
      const set1H = realOdds.firstSetHome ?? 0;
      const set1A = realOdds.firstSetAway ?? 0;
      const tExtra = {
        ...computeTennisExtras(pHome, {
          set1H: set1H > 0 ? set1H : undefined,
          set1A: set1A > 0 ? set1A : undefined,
        }),
        ...(Array.isArray(realOdds.score1st) && realOdds.score1st.length > 0
          ? { score1st: realOdds.score1st }
          : {}),
        ...(Array.isArray(realOdds.score2nd) && realOdds.score2nd.length > 0
          ? { score2nd: realOdds.score2nd }
          : {}),
      };
      results.push({
        matchId: String(ev.id),
        date,
        time,
        tournamentName: tennisTournLabel(ev.tournament),
        status: "Not Started",
        players: [
          { id: "", name: p0Name },
          { id: "", name: p1Name },
        ],
        matchOdds: [h, a],
        set1Odds: set1H > 0 && set1A > 0 ? [set1H, set1A] : null,
        markets: {
          doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
          bothTeamsScore: { yes: 0, no: 0 },
          totalGoals: {
            over05: 0,
            under05: 0,
            over15: 0,
            under15: 0,
            over25: 0,
            under25: 0,
            over35: 0,
            under35: 0,
            over45: 0,
            under45: 0,
            over55: 0,
            under55: 0,
            over65: 0,
            under65: 0,
          },
          handicap: {
            homeMinusOne: 0,
            awayPlusOne: 0,
            homeMinusOneHalf: 0,
            awayPlusOneHalf: 0,
          },
          halfTime: { home: 0, draw: 0, away: 0 },
          firstGoal: { home: 0, noGoal: 0, away: 0 },
          tennisExtra: tExtra,
        },
      });
    }
    tennisOddsCache = results;
    tennisOddsFetchedAt = now;
    return results;
  } catch {
    return tennisOddsCache ?? [];
  }
}

router.get("/tennis-odds", async (_req: Request, res: Response) => {
  try {
    const odds = await getTennisOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de ténis indisponíveis" });
  }
});

router.get("/league-standings", async (req: Request, res: Response) => {
  const league = String(req.query["league"] ?? "");
  try {
    const standing = buildLeagueStandings(league, "", "");
    res.json(standing);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

// ─── Football Leagues & Schedule ───────────────────────────────────────────────

type FootballLeague = {
  id: string;
  name: string;
  country: string;
  season: string;
  isCurrent: boolean;
};

let footballLeaguesCache: FootballLeague[] | null = null;
let footballLeaguesFetchedAt = 0;
const FOOTBALL_LEAGUES_TTL = 5 * 60 * 1000;

async function getFootballLeagues(): Promise<FootballLeague[]> {
  return footballLeaguesCache ?? [];
}

router.get("/football-leagues", async (_req: Request, res: Response) => {
  try {
    const leagues = await getFootballLeagues();
    res.json({ leagues });
  } catch {
    res.status(500).json({ error: "Ligas de futebol indisponíveis" });
  }
});

// Football schedule types (v2/soccer/leagues/{id}/matches)
type FootballSchedulePlayer = {
  number: string;
  id: string;
  name: string;
  booking: string;
};
type FootballScheduleSubstitution = {
  player_in_number: string;
  player_in_name: string;
  player_in_booking: string;
  player_in_id: string;
  player_out_name: string;
  player_out_id: string;
  minute: string;
};
type FootballScheduleGoal = {
  team: string;
  minute: string;
  player: string;
  score: string;
  playerid: string;
  assist: string;
  assistid: string;
};
type FootballScheduleMatch = {
  main_id: string;
  fallback_id_1?: string;
  fallback_id_2?: string;
  status: string;
  date: string;
  time: string;
  venue?: string;
  venue_id?: string;
  venue_city?: string;
  attendance?: string;
  home: { id: string; name: string; score: string };
  away: { id: string; name: string; score: string };
  coaches?: {
    home?: { coach?: { id: string; name: string } };
    away?: { coach?: { id: string; name: string } };
  };
  referee?: { id: string; name: string };
  lineups?: {
    home?: {
      formation: string;
      player: FootballSchedulePlayer | FootballSchedulePlayer[];
    };
    away?: {
      formation: string;
      player: FootballSchedulePlayer | FootballSchedulePlayer[];
    };
  };
  substitutions?: {
    home?: {
      substitution:
        | FootballScheduleSubstitution
        | FootballScheduleSubstitution[];
    };
    away?: {
      substitution:
        | FootballScheduleSubstitution
        | FootballScheduleSubstitution[];
    };
  };
  goals?: { goal: FootballScheduleGoal | FootballScheduleGoal[] };
  ht: { home_goals: number; away_goals: number } | null;
  ft: { home_goals: number; away_goals: number } | null;
  et: { home_goals: number; away_goals: number } | null;
  penalties: { home_pen: number; away_pen: number } | null;
};
type FootballScheduleWeek = {
  number: string;
  match: FootballScheduleMatch | FootballScheduleMatch[];
};
type FootballScheduleRaw = {
  matches?: {
    updated?: string;
    country?: string;
    tournament?: {
      id: string;
      league: string;
      season: string;
      stage_id?: string;
      is_current?: string;
      week?: FootballScheduleWeek | FootballScheduleWeek[];
    };
  };
};

type FootballScheduleMatchOut = {
  id: string;
  status: string;
  date: string;
  time: string;
  venue?: string;
  venueCity?: string;
  attendance?: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  htScore: { home: number; away: number } | null;
  ftScore: { home: number; away: number } | null;
  etScore: { home: number; away: number } | null;
  penScore: { home: number; away: number } | null;
  homeCoach?: string;
  awayCoach?: string;
  referee?: string;
  homeFormation?: string;
  awayFormation?: string;
  homePlayers?: { number: string; id: string; name: string; booking: string }[];
  awayPlayers?: { number: string; id: string; name: string; booking: string }[];
  goals?: {
    team: string;
    minute: string;
    player: string;
    score: string;
    assist: string;
  }[];
};

type FootballScheduleWeekOut = {
  number: number;
  matches: FootballScheduleMatchOut[];
};

const footballScheduleCache = new Map<
  string,
  {
    data: FootballScheduleWeekOut[];
    meta: { league: string; season: string; country: string };
    fetchedAt: number;
  }
>();
const FOOTBALL_SCHEDULE_TTL = 5 * 60 * 1000;

function parseFootballMatch(
  m: FootballScheduleMatch,
): FootballScheduleMatchOut {
  const toPlayers = (
    raw: FootballSchedulePlayer | FootballSchedulePlayer[] | undefined,
  ) => (raw ? (Array.isArray(raw) ? raw : [raw]) : []);
  const toSubs = (
    raw:
      | FootballScheduleSubstitution
      | FootballScheduleSubstitution[]
      | undefined,
  ) => (raw ? (Array.isArray(raw) ? raw : [raw]) : []);
  const rawGoals = m.goals?.goal;
  const goals = rawGoals
    ? Array.isArray(rawGoals)
      ? rawGoals
      : [rawGoals]
    : [];
  const hScore = parseInt(m.home.score);
  const aScore = parseInt(m.away.score);

  const homeSubs = toSubs(m.substitutions?.home?.substitution);
  const awaySubs = toSubs(m.substitutions?.away?.substitution);
  void homeSubs;
  void awaySubs; // available if needed

  return {
    id: m.main_id,
    status: m.status,
    date: m.date,
    time: m.time,
    venue: m.venue || undefined,
    venueCity: m.venue_city || undefined,
    attendance: m.attendance || undefined,
    homeTeam: { id: m.home.id, name: m.home.name },
    awayTeam: { id: m.away.id, name: m.away.name },
    homeScore: isNaN(hScore) ? null : hScore,
    awayScore: isNaN(aScore) ? null : aScore,
    htScore: m.ht ? { home: m.ht.home_goals, away: m.ht.away_goals } : null,
    ftScore: m.ft ? { home: m.ft.home_goals, away: m.ft.away_goals } : null,
    etScore: m.et ? { home: m.et.home_goals, away: m.et.away_goals } : null,
    penScore: m.penalties
      ? { home: m.penalties.home_pen, away: m.penalties.away_pen }
      : null,
    homeCoach: m.coaches?.home?.coach?.name || undefined,
    awayCoach: m.coaches?.away?.coach?.name || undefined,
    referee: m.referee?.name || undefined,
    homeFormation: m.lineups?.home?.formation || undefined,
    awayFormation: m.lineups?.away?.formation || undefined,
    homePlayers: toPlayers(m.lineups?.home?.player),
    awayPlayers: toPlayers(m.lineups?.away?.player),
    goals: goals.map((g) => ({
      team: g.team,
      minute: g.minute,
      player: g.player,
      score: g.score,
      assist: g.assist,
    })),
  };
}

async function getFootballSchedule(id: string): Promise<{
  weeks: FootballScheduleWeekOut[];
  meta: { league: string; season: string; country: string };
}> {
  const cached = footballScheduleCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_SCHEDULE_TTL) {
    return { weeks: cached.data, meta: cached.meta };
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(
          `/v2/soccer/leagues/${encodeURIComponent(id)}/matches`,
        ),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballScheduleRaw;
        const matchesRoot = payload.matches;
        const tournament = matchesRoot?.tournament;
        if (tournament) {
          const weeks = statpalList(tournament.week).map((week) => ({
            number: parseInt(week.number) || 0,
            matches: statpalList(week.match).map(parseFootballMatch),
          }));
          const meta = {
            league: tournament.league,
            season: tournament.season,
            country: matchesRoot?.country ?? "",
          };
          footballScheduleCache.set(id, {
            data: weeks,
            meta,
            fetchedAt: Date.now(),
          });
          return { weeks, meta };
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", leagueId: id },
        "Football schedule provider failed; falling back",
      );
    }
  }

  if (cached) return { weeks: cached.data, meta: cached.meta };
  throw new Error("Calendário indisponível");
}

router.get("/football-schedule/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const { weeks, meta } = await getFootballSchedule(id);
    // Split into recent (finished rounds) and upcoming (future rounds)
    const today = new Date().toISOString().slice(0, 10);
    const parseDate = (d: string) => {
      // "15.08.2025" → "2025-08-15"
      const [day, month, year] = d.split(".");
      return `${year}-${month}-${day}`;
    };
    const recentWeeks = weeks
      .filter(
        (w) =>
          w.matches.length > 0 &&
          w.matches.every(
            (m) => parseDate(m.date) <= today && m.status !== "Not Started",
          ),
      )
      .slice(-3);
    const nextWeek =
      weeks.find((w) =>
        w.matches.some(
          (m) => m.status === "Not Started" || parseDate(m.date) >= today,
        ),
      ) ?? null;
    res.json({ ...meta, recentWeeks, nextWeek });
  } catch {
    res.status(500).json({ error: "Calendário de futebol indisponível" });
  }
});

// ─── Football Match Stats ──────────────────────────────────────────────────────

type FootballMatchStatsPlayer = {
  id: string;
  name: string;
  number: string;
  pos: string;
  formation_pos?: string;
  // player_stats fields (optional — only in player_stats section)
  acc_crosses?: string;
  aerials_won?: string;
  assists?: string;
};
type FootballMatchStatsSub = {
  minute: string;
  player_on: string;
  player_on_id: string;
  player_off: string;
  player_off_id: string;
  injury: string;
};
type FootballMatchStatsTeamColors = {
  player: {
    primary: { color: string };
    number: { color: string };
    border: { color: string };
  };
  goalkeeper: {
    primary: { color: string };
    number: { color: string };
    border: { color: string };
  };
};
type FootballMatchStatsEventGoal = {
  minute: string;
  extra_min: string;
  player_id: string;
  player_name: string;
  assist_player_id: string;
  assist_player_name: string;
  own_goal: string;
  penalty: string;
  penalty_missed: string;
  var_cancelled: string;
};
type FootballMatchStatsEventCard = {
  minute: string;
  extra_min: string;
  comment?: string;
  player_id: string;
  player_name: string;
};
type FootballMatchStatsEventVar = {
  minute: string;
  extra_min: string;
  player_id: string;
  player_name: string;
  event_type: string;
  ref_decision: string;
  var_decision: string;
};

type FootballMatchStatsRaw = {
  "match-stats"?: {
    updated?: string;
    updated_ts?: number;
    tournament?: {
      id: string;
      name: string;
      matches?: {
        main_id: string;
        fallback_id_1?: string;
        fallback_id_2?: string;
        date: string;
        time: string;
        status: string;
        match_info?: {
          stadium?: { name: string };
          time?: {
            name: string;
            added_time_period_1: string;
            added_time_period_2: string;
          };
          referee?: { name: string };
        };
        home: { id: string; name: string; goals: string };
        away: { id: string; name: string; goals: string };
        ht?: { home_goals: string; away_goals: string } | null;
        ft?: { home_goals: string; away_goals: string } | null;
        et?: { home_goals: string; away_goals: string } | null;
        penalties?: { home_pen: string; away_pen: string } | null;
        lineups?: {
          home?: {
            formation: string;
            player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[];
          };
          away?: {
            formation: string;
            player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[];
          };
        };
        bench?: {
          home?: {
            player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[];
          };
          away?: {
            player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[];
          };
        };
        substitutions?: {
          home?: {
            substitution: FootballMatchStatsSub | FootballMatchStatsSub[];
          };
          away?: {
            substitution: FootballMatchStatsSub | FootballMatchStatsSub[];
          };
        };
        team_colors?: {
          home: FootballMatchStatsTeamColors;
          away: FootballMatchStatsTeamColors;
        };
        team_stats?: {
          home?: {
            corners?: { total: string; total_h1: string; total_h2: string };
            expected_goals?: {
              total: string;
              total_h1: string;
              total_h2: string;
            };
            fouls?: { total: string };
          };
          away?: {
            corners?: { total: string; total_h1: string; total_h2: string };
            expected_goals?: {
              total: string;
              total_h1: string;
              total_h2: string;
            };
            fouls?: { total: string };
          };
        };
        player_stats?: {
          home?: {
            player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[];
          };
          away?: {
            player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[];
          };
        };
        event_summary?: {
          home?: {
            goals?: {
              event:
                | FootballMatchStatsEventGoal
                | FootballMatchStatsEventGoal[];
            };
            yellowcards?: {
              event:
                | FootballMatchStatsEventCard
                | FootballMatchStatsEventCard[];
            };
            redcards?:
              | {
                  event:
                    | FootballMatchStatsEventCard
                    | FootballMatchStatsEventCard[];
                }
              | string;
            var?:
              | {
                  event:
                    | FootballMatchStatsEventVar
                    | FootballMatchStatsEventVar[];
                }
              | string;
          };
          away?: {
            goals?: {
              event:
                | FootballMatchStatsEventGoal
                | FootballMatchStatsEventGoal[];
            };
            yellowcards?: {
              event:
                | FootballMatchStatsEventCard
                | FootballMatchStatsEventCard[];
            };
            redcards?:
              | {
                  event:
                    | FootballMatchStatsEventCard
                    | FootballMatchStatsEventCard[];
                }
              | string;
            var?:
              | {
                  event:
                    | FootballMatchStatsEventVar
                    | FootballMatchStatsEventVar[];
                }
              | string;
          };
        };
      };
    };
  };
};

const footballMatchStatsCache = new Map<
  string,
  { data: unknown; fetchedAt: number }
>();
const FOOTBALL_MATCH_STATS_TTL = 5 * 60 * 1000;

function normMatchStatsList<T>(raw: T | T[] | undefined | null): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function getFootballMatchStats(leagueId: string): Promise<object> {
  const cached = footballMatchStatsCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_MATCH_STATS_TTL) {
    return cached.data as object;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(
          `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/matches/stats`,
        ),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballMatchStatsRaw;
        const root = payload["match-stats"];
        const tournament = root?.tournament;
        const match = tournament?.matches;
        if (tournament && match) {
          const num = (value: string | undefined) => {
            const n = Number(value ?? "");
            return Number.isFinite(n) ? n : 0;
          };
          const bool = (value: string | undefined) =>
            String(value ?? "").toLowerCase() === "true";
          const events = <T,>(
            raw:
              | { event?: T | T[] }
              | string
              | undefined,
          ): T[] => {
            if (!raw || typeof raw === "string") return [];
            return normMatchStatsList(raw.event);
          };

          const data = {
            updated: root.updated,
            updatedTs: root.updated_ts ?? 0,
            tournament: {
              id: tournament.id,
              name: tournament.name,
            },
            match: {
              id: match.main_id,
              fallbackIds: [
                match.fallback_id_1,
                match.fallback_id_2,
              ].filter(Boolean),
              date: match.date,
              time: match.time,
              status: match.status,
              stadium: match.match_info?.stadium?.name ?? "",
              referee: match.match_info?.referee?.name ?? "",
              addedTime: {
                firstHalf: num(match.match_info?.time?.added_time_period_1),
                secondHalf: num(match.match_info?.time?.added_time_period_2),
              },
              home: {
                id: match.home.id,
                name: match.home.name,
                goals: num(match.home.goals),
                formation: match.lineups?.home?.formation ?? "",
                lineup: normMatchStatsList(match.lineups?.home?.player),
                bench: normMatchStatsList(match.bench?.home?.player),
                substitutions: normMatchStatsList(
                  match.substitutions?.home?.substitution,
                ),
                stats: match.team_stats?.home ?? {},
                playerStats: normMatchStatsList(match.player_stats?.home?.player),
                summary: {
                  goals: events(match.event_summary?.home?.goals).map((event) => ({
                    ...event,
                    own_goal: bool(event.own_goal),
                    penalty: bool(event.penalty),
                    penalty_missed: bool(event.penalty_missed),
                    var_cancelled: bool(event.var_cancelled),
                  })),
                  yellowcards: events(match.event_summary?.home?.yellowcards),
                  redcards: events(match.event_summary?.home?.redcards),
                  var: events(match.event_summary?.home?.var),
                },
              },
              away: {
                id: match.away.id,
                name: match.away.name,
                goals: num(match.away.goals),
                formation: match.lineups?.away?.formation ?? "",
                lineup: normMatchStatsList(match.lineups?.away?.player),
                bench: normMatchStatsList(match.bench?.away?.player),
                substitutions: normMatchStatsList(
                  match.substitutions?.away?.substitution,
                ),
                stats: match.team_stats?.away ?? {},
                playerStats: normMatchStatsList(match.player_stats?.away?.player),
                summary: {
                  goals: events(match.event_summary?.away?.goals).map((event) => ({
                    ...event,
                    own_goal: bool(event.own_goal),
                    penalty: bool(event.penalty),
                    penalty_missed: bool(event.penalty_missed),
                    var_cancelled: bool(event.var_cancelled),
                  })),
                  yellowcards: events(match.event_summary?.away?.yellowcards),
                  redcards: events(match.event_summary?.away?.redcards),
                  var: events(match.event_summary?.away?.var),
                },
              },
              ht: match.ht
                ? {
                    home: num(match.ht.home_goals),
                    away: num(match.ht.away_goals),
                  }
                : null,
              ft: match.ft
                ? {
                    home: num(match.ft.home_goals),
                    away: num(match.ft.away_goals),
                  }
                : null,
              et: match.et
                ? {
                    home: num(match.et.home_goals),
                    away: num(match.et.away_goals),
                  }
                : null,
              penalties: match.penalties
                ? {
                    home: num(match.penalties.home_pen),
                    away: num(match.penalties.away_pen),
                  }
                : null,
              teamColors: match.team_colors ?? null,
            },
          };

          footballMatchStatsCache.set(leagueId, {
            data,
            fetchedAt: Date.now(),
          });
          return data;
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", leagueId },
        "Football match stats provider failed",
      );
    }
  }

  if (cached) return cached.data as object;
  throw new Error("Estatísticas indisponíveis");
}

router.get(
  "/football-match-stats/:leagueId",
  async (req: Request, res: Response) => {
    const leagueId = String(req.params["leagueId"]);
    try {
      const stats = await getFootballMatchStats(leagueId);
      res.json(stats);
    } catch {
      res.status(500).json({ error: "Estatísticas do jogo indisponíveis" });
    }
  },
);

// ─── Football Standings ────────────────────────────────────────────────────────

type FootballStandingsTeamRaw = {
  position: string;
  name: string;
  id: string;
  status: string;
  recent_form: string;
  overall?: {
    games_played: string;
    wins: string;
    draws: string;
    losses: string;
    goals_scored: string;
    goals_allowed: string;
  };
  home?: {
    games_played: string;
    wins: string;
    draws: string;
    losses: string;
    goals_scored: string;
    goals_allowed: string;
  };
  away?: {
    games_played: string;
    wins: string;
    draws: string;
    losses: string;
    goals_scored: string;
    goals_allowed: string;
  };
  total?: { goal_difference: string; points: string };
  description?: { value: string };
};

type FootballStandingsRaw = {
  standings?: {
    updated?: string;
    updated_ts?: number;
    country?: string;
    tournament?: {
      id: string;
      league: string;
      season: string;
      stage_id?: string;
      is_current?: string;
      team: FootballStandingsTeamRaw | FootballStandingsTeamRaw[];
    };
  };
};

type FootballStandingsTeam = {
  position: number;
  name: string;
  id: string;
  status: string;
  recentForm: string;
  gp: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  home: {
    gp: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  away: {
    gp: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  description: string;
};

const footballStandingsCache = new Map<
  string,
  {
    data: FootballStandingsTeam[];
    meta: { id: string; league: string; season: string; country: string };
    fetchedAt: number;
  }
>();
const FOOTBALL_STANDINGS_TTL = 5 * 60 * 1000;

async function getFootballStandings(leagueId: string): Promise<{
  teams: FootballStandingsTeam[];
  meta: { id: string; league: string; season: string; country: string };
}> {
  const cached = footballStandingsCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_STANDINGS_TTL) {
    return { teams: cached.data, meta: cached.meta };
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(
          `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/standings`,
        ),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballStandingsRaw;
        const root = payload.standings;
        const tournament = root?.tournament;
        if (root && tournament) {
          const num = (value: string | undefined) => parseInt(value ?? "") || 0;
          const teams = statpalList(tournament.team).map(
            (team): FootballStandingsTeam => ({
              position: num(team.position),
              name: team.name,
              id: team.id,
              status: team.status,
              recentForm: team.recent_form,
              gp: num(team.overall?.games_played),
              wins: num(team.overall?.wins),
              draws: num(team.overall?.draws),
              losses: num(team.overall?.losses),
              goalsFor: num(team.overall?.goals_scored),
              goalsAgainst: num(team.overall?.goals_allowed),
              goalDiff: num(team.total?.goal_difference),
              points: num(team.total?.points),
              home: {
                gp: num(team.home?.games_played),
                wins: num(team.home?.wins),
                draws: num(team.home?.draws),
                losses: num(team.home?.losses),
                goalsFor: num(team.home?.goals_scored),
                goalsAgainst: num(team.home?.goals_allowed),
              },
              away: {
                gp: num(team.away?.games_played),
                wins: num(team.away?.wins),
                draws: num(team.away?.draws),
                losses: num(team.away?.losses),
                goalsFor: num(team.away?.goals_scored),
                goalsAgainst: num(team.away?.goals_allowed),
              },
              description: team.description?.value ?? "",
            }),
          );

          const meta = {
            id: tournament.id,
            league: tournament.league,
            season: tournament.season,
            country: root.country ?? "",
          };

          footballStandingsCache.set(leagueId, {
            data: teams,
            meta,
            fetchedAt: Date.now(),
          });

          return { teams, meta };
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", leagueId },
        "Football standings provider failed",
      );
    }
  }

  if (cached) return { teams: cached.data, meta: cached.meta };
  throw new Error("Classificação indisponível");
}

router.get("/football-standings/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const { teams, meta } = await getFootballStandings(id);
    res.json({ ...meta, teams });
  } catch {
    res.status(500).json({ error: "Classificação de futebol indisponível" });
  }
});

// ─── Football League Stats (per-player, all teams) ────────────────────────────

type FootballLeagueStatsPlayerRaw = {
  id: string;
  name: string;
  number: string;
  age: string;
  position: string;
  injured: string;
  is_captain: string;
  appearences: string; // API typo (double 'e') — intentional
  lineups: string;
  minutes_played: string;
  substitute_in: string;
  substitute_out?: string;
  substitutes_on_bench?: string;
  goals: string;
  assists: string;
  rating: string;
  yellowcards: string;
  yellowred: string;
  redcards: string;
  saves: string;
  goals_conceded: string;
  inside_box_saves: string;
  penalties_saved: string;
  shots_total: string;
  shots_on: string;
  shots_woodwork: string;
  pass_attempts: string;
  pass_success: string;
  key_passes: string;
  dribble_attempts: string;
  dribble_success: string;
  dispossesed: string;
  duels_total: string;
  duels_won: string;
  fouls_committed: string;
  fouls_drawn: string;
  tackles: string;
  blocks: string;
  clearances: string;
  interceptions: string;
  crosses_total: string;
  crosses_accurate: string;
  aerials_won?: string;
  penalties_scored: string;
  penalties_missed: string;
  penalties_committed: string;
  penalties_won: string;
};

type FootballLeagueStatsTeamRaw = {
  id: string;
  name: string;
  venue?: { id: string; name: string };
  coach?: { id: string; name: string };
  squad?: {
    player: FootballLeagueStatsPlayerRaw | FootballLeagueStatsPlayerRaw[];
  };
};

type FootballLeagueStatsRaw = {
  league_stats?: {
    updated?: string;
    updated_ts?: string; // string in this endpoint (unlike others)
    league?: {
      id: string;
      name: string;
      country: string;
      team: FootballLeagueStatsTeamRaw | FootballLeagueStatsTeamRaw[];
    };
  };
};

type FootballLeagueStatsPlayer = {
  id: string;
  name: string;
  number: string;
  age: number;
  position: string;
  injured: boolean;
  isCaptain: boolean;
  appearances: number;
  lineups: number;
  minutesPlayed: number;
  subIn: number;
  goals: number;
  assists: number;
  rating: number;
  yellowCards: number;
  yellowRed: number;
  redCards: number;
  saves: number;
  goalsConceded: number;
  insideBoxSaves: number;
  penaltiesSaved: number;
  shotsTotal: number;
  shotsOn: number;
  shotsWoodwork: number;
  passAttempts: number;
  passSuccess: number;
  keyPasses: number;
  dribbleAttempts: number;
  dribbleSuccess: number;
  duelsTotal: number;
  duelsWon: number;
  foulsCommitted: number;
  foulsDrawn: number;
  tackles: number;
  blocks: number;
  clearances: number;
  interceptions: number;
  crossesTotal: number;
  crossesAccurate: number;
  penaltiesScored: number;
  penaltiesMissed: number;
};

type FootballLeagueStatsTeam = {
  id: string;
  name: string;
  venue: { id: string; name: string } | null;
  coach: { id: string; name: string } | null;
  players: FootballLeagueStatsPlayer[];
};

const footballLeagueStatsCache = new Map<
  string,
  {
    data: FootballLeagueStatsTeam[];
    meta: { id: string; name: string; country: string };
    fetchedAt: number;
  }
>();
const FOOTBALL_LEAGUE_STATS_TTL = 30 * 60 * 1000; // 30 min — changes infrequently

function parseFootballStatsPlayer(
  p: FootballLeagueStatsPlayerRaw,
): FootballLeagueStatsPlayer {
  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
  return {
    id: p.id,
    name: p.name,
    number: p.number,
    age: pi(p.age),
    position: p.position,
    injured: p.injured === "True",
    isCaptain: p.is_captain === "True",
    appearances: pi(p.appearences), // map API typo to correct spelling
    lineups: pi(p.lineups),
    minutesPlayed: pi(p.minutes_played),
    subIn: pi(p.substitute_in),
    goals: pi(p.goals),
    assists: pi(p.assists),
    rating: pf(p.rating),
    yellowCards: pi(p.yellowcards),
    yellowRed: pi(p.yellowred),
    redCards: pi(p.redcards),
    saves: pi(p.saves),
    goalsConceded: pi(p.goals_conceded),
    insideBoxSaves: pi(p.inside_box_saves),
    penaltiesSaved: pi(p.penalties_saved),
    shotsTotal: pi(p.shots_total),
    shotsOn: pi(p.shots_on),
    shotsWoodwork: pi(p.shots_woodwork),
    passAttempts: pi(p.pass_attempts),
    passSuccess: pi(p.pass_success),
    keyPasses: pi(p.key_passes),
    dribbleAttempts: pi(p.dribble_attempts),
    dribbleSuccess: pi(p.dribble_success),
    duelsTotal: pi(p.duels_total),
    duelsWon: pi(p.duels_won),
    foulsCommitted: pi(p.fouls_committed),
    foulsDrawn: pi(p.fouls_drawn),
    tackles: pi(p.tackles),
    blocks: pi(p.blocks),
    clearances: pi(p.clearances),
    interceptions: pi(p.interceptions),
    crossesTotal: pi(p.crosses_total),
    crossesAccurate: pi(p.crosses_accurate),
    penaltiesScored: pi(p.penalties_scored),
    penaltiesMissed: pi(p.penalties_missed),
  };
}

async function getFootballLeagueStats(leagueId: string): Promise<{
  teams: FootballLeagueStatsTeam[];
  meta: { id: string; name: string; country: string };
}> {
  const cached = footballLeagueStatsCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_LEAGUE_STATS_TTL) {
    return { teams: cached.data, meta: cached.meta };
  }

  let payload: FootballLeagueStatsRaw | null = null;

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(`/v2/soccer/leagues/${encodeURIComponent(leagueId)}/stats`),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        payload = (await resp.json()) as FootballLeagueStatsRaw;
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", leagueId },
        "Football league stats provider failed; falling back",
      );
    }
  }

  if (
    !payload?.league_stats?.league &&
    CONFIG.SPORTSAPI_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "sportsapipro")
  ) {
    const urls = [
      `${SAPI_V2_FOOTBALL}/league/${encodeURIComponent(leagueId)}/stats`,
      `${SAPI_V2_FOOTBALL}/leagues/${encodeURIComponent(leagueId)}/stats`,
    ];

    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: sapiHeaders(),
        });
        if (!resp.ok) continue;
        payload = (await resp.json()) as FootballLeagueStatsRaw;
        if (payload?.league_stats?.league) break;
      } catch {
        // Try the next candidate endpoint before failing.
      }
    }
  }

  const league = payload?.league_stats?.league;
  if (!league) {
    if (cached) return { teams: cached.data, meta: cached.meta };
    throw new Error("Estatísticas indisponíveis");
  }

  const teams = toArr(league.team).map(
    (team): FootballLeagueStatsTeam => ({
      id: team.id,
      name: team.name,
      venue: team.venue ? { id: team.venue.id, name: team.venue.name } : null,
      coach: team.coach ? { id: team.coach.id, name: team.coach.name } : null,
      players: toArr(team.squad?.player).map(parseFootballStatsPlayer),
    }),
  );

  const meta = {
    id: league.id,
    name: league.name,
    country: league.country,
  };

  footballLeagueStatsCache.set(leagueId, {
    data: teams,
    meta,
    fetchedAt: Date.now(),
  });

  return { teams, meta };
}

router.get(
  "/football-league-stats/:id",
  async (req: Request, res: Response) => {
    const id = String(req.params["id"]);
    try {
      const { teams, meta } = await getFootballLeagueStats(id);
      res.json({ ...meta, teams });
    } catch {
      res
        .status(500)
        .json({ error: "Estatísticas da liga de futebol indisponíveis" });
    }
  },
);

// ─── Football Head-to-Head ─────────────────────────────────────────────────────

type H2HMatchRaw = {
  main_id: string;
  fallback_id_1?: string;
  country: string;
  league: string;
  league_id: string;
  date: string;
  team1_name: string;
  team2_name: string;
  team1_id: string;
  team2_id: string;
  team1_score: string;
  team2_score: string;
};

type FootballH2HRaw = {
  "head-to-head"?: {
    team1_id: string;
    team2_id: string;
    recent_meetings?: { match: H2HMatchRaw | H2HMatchRaw[] };
    overall_record?: {
      total?: { total: Record<string, string>[] };
      home?: {
        team1: Record<string, string>[];
        team2: Record<string, string>[];
      };
      away?: {
        team1: Record<string, string>[];
        team2: Record<string, string>[];
      };
    };
    leagues?: { league: H2HLeagueRaw | H2HLeagueRaw[] };
    goals?: {
      total?: { total: Record<string, string>[] };
      home?: { home: Record<string, string>[] };
      away?: { away: Record<string, string>[] };
    };
    biggest_victory?: {
      team1?: { match: H2HMatchRaw };
      team2?: { match: H2HMatchRaw };
    };
    biggest_defeat?: {
      team1?: { match: H2HMatchRaw };
      team2?: { match: H2HMatchRaw };
    };
    last5_home?: {
      team1?: { match: H2HMatchRaw | H2HMatchRaw[] };
      team2?: { match: H2HMatchRaw | H2HMatchRaw[] };
    };
    last5_away?: {
      team1?: { match: H2HMatchRaw | H2HMatchRaw[] };
      team2?: { match: H2HMatchRaw | H2HMatchRaw[] };
    };
  };
};

type H2HLeagueRaw = {
  name: string;
  id: string;
  games: string;
  team1_won: string;
  team2_won: string;
  draw: string;
};

// Merge array of single-key objects into one flat object: [{games:"180"},{team1_won:"83"}] → {games:180, team1_won:83}
function mergeH2HArray(arr: Record<string, string>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    for (const [k, v] of Object.entries(item)) out[k] = parseInt(v) || 0;
  }
  return out;
}

function normaliseH2HMatch(m: H2HMatchRaw) {
  return {
    id: m.main_id,
    country: m.country,
    league: m.league,
    leagueId: m.league_id,
    date: m.date,
    team1: {
      id: m.team1_id,
      name: m.team1_name,
      score: parseInt(m.team1_score) || 0,
    },
    team2: {
      id: m.team2_id,
      name: m.team2_name,
      score: parseInt(m.team2_score) || 0,
    },
  };
}

const footballH2HCache = new Map<string, { data: object; fetchedAt: number }>();
const FOOTBALL_H2H_TTL = 10 * 60 * 1000; // 10 min

async function getFootballH2H(team1: string, team2: string): Promise<object> {
  const key = `${team1}-${team2}`;
  const cached = footballH2HCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_H2H_TTL) {
    return cached.data;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl("/v2/soccer/head-to-head", {
          team1_id: team1,
          team2_id: team2,
        }),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballH2HRaw;
        const root = payload["head-to-head"];
        if (root) {
          const data = {
            team1Id: root.team1_id,
            team2Id: root.team2_id,
            recentMeetings: statpalList(root.recent_meetings?.match).map(
              normaliseH2HMatch,
            ),
            overallRecord: {
              total: mergeH2HArray(root.overall_record?.total?.total ?? []),
              home: {
                team1: mergeH2HArray(root.overall_record?.home?.team1 ?? []),
                team2: mergeH2HArray(root.overall_record?.home?.team2 ?? []),
              },
              away: {
                team1: mergeH2HArray(root.overall_record?.away?.team1 ?? []),
                team2: mergeH2HArray(root.overall_record?.away?.team2 ?? []),
              },
            },
            leagues: statpalList(root.leagues?.league).map((league) => ({
              name: league.name,
              id: league.id,
              games: parseInt(league.games) || 0,
              team1Won: parseInt(league.team1_won) || 0,
              team2Won: parseInt(league.team2_won) || 0,
              draws: parseInt(league.draw) || 0,
            })),
            goals: {
              total: mergeH2HArray(root.goals?.total?.total ?? []),
              home: mergeH2HArray(root.goals?.home?.home ?? []),
              away: mergeH2HArray(root.goals?.away?.away ?? []),
            },
            biggestVictory: {
              team1: root.biggest_victory?.team1?.match
                ? normaliseH2HMatch(root.biggest_victory.team1.match)
                : null,
              team2: root.biggest_victory?.team2?.match
                ? normaliseH2HMatch(root.biggest_victory.team2.match)
                : null,
            },
            biggestDefeat: {
              team1: root.biggest_defeat?.team1?.match
                ? normaliseH2HMatch(root.biggest_defeat.team1.match)
                : null,
              team2: root.biggest_defeat?.team2?.match
                ? normaliseH2HMatch(root.biggest_defeat.team2.match)
                : null,
            },
            last5Home: {
              team1: statpalList(root.last5_home?.team1?.match).map(
                normaliseH2HMatch,
              ),
              team2: statpalList(root.last5_home?.team2?.match).map(
                normaliseH2HMatch,
              ),
            },
            last5Away: {
              team1: statpalList(root.last5_away?.team1?.match).map(
                normaliseH2HMatch,
              ),
              team2: statpalList(root.last5_away?.team2?.match).map(
                normaliseH2HMatch,
              ),
            },
          };

          footballH2HCache.set(key, { data, fetchedAt: Date.now() });
          return data;
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", team1, team2 },
        "Football H2H provider failed",
      );
    }
  }

  if (cached) return cached.data;
  throw new Error("H2H indisponível");
}

router.get("/football-h2h", async (req: Request, res: Response) => {
  const team1 = String(req.query["team1"] ?? "");
  const team2 = String(req.query["team2"] ?? "");
  if (!team1 || !team2) {
    res
      .status(400)
      .json({ error: "Parâmetros team1 e team2 são obrigatórios" });
    return;
  }
  try {
    const data = await getFootballH2H(team1, team2);
    res.json(data);
  } catch {
    res.status(500).json({ error: "Dados H2H indisponíveis" });
  }
});

// ─── Football Injuries & Suspensions ──────────────────────────────────────────

type FootballInjuryPlayerRaw = { id: string; name: string; status: string };
type FootballInjurySidelinedRaw = {
  to_miss?: { player: FootballInjuryPlayerRaw | FootballInjuryPlayerRaw[] };
  questionable?: {
    player: FootballInjuryPlayerRaw | FootballInjuryPlayerRaw[];
  };
};
type FootballInjuryTeamRaw = {
  id: string;
  name: string;
  sidelined?: FootballInjurySidelinedRaw;
};
type FootballInjuryMatchRaw = {
  main_id: string;
  fallback_id_1?: string;
  fallback_id_2?: string;
  fallback_id_3?: string;
  date: string;
  time: string;
  home: FootballInjuryTeamRaw;
  away: FootballInjuryTeamRaw;
};
type FootballInjuryLeagueRaw = {
  id: string;
  name: string;
  sub_id?: string;
  match: FootballInjuryMatchRaw | FootballInjuryMatchRaw[];
};
type FootballInjuriesRaw = {
  injuries_suspensions?: {
    updated?: string;
    updated_ts?: number;
    league: FootballInjuryLeagueRaw | FootballInjuryLeagueRaw[];
  };
};

type FootballInjuryPlayer = { id: string; name: string; status: string };
type FootballInjuryTeam = {
  id: string;
  name: string;
  toMiss: FootballInjuryPlayer[];
  questionable: FootballInjuryPlayer[];
};
type FootballInjuryMatch = {
  id: string;
  date: string;
  time: string;
  home: FootballInjuryTeam;
  away: FootballInjuryTeam;
};
type FootballInjuryLeague = {
  id: string;
  name: string;
  matches: FootballInjuryMatch[];
};

let footballInjuriesCache: FootballInjuryLeague[] | null = null;
let footballInjuriesFetchedAt = 0;
const FOOTBALL_INJURIES_TTL = 15 * 60 * 1000; // 15 min

function parseInjuryPlayers(
  raw: FootballInjuryPlayerRaw | FootballInjuryPlayerRaw[] | undefined,
): FootballInjuryPlayer[] {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
  }));
}

function parseInjuryTeam(t: FootballInjuryTeamRaw): FootballInjuryTeam {
  return {
    id: t.id,
    name: t.name,
    toMiss: parseInjuryPlayers(t.sidelined?.to_miss?.player),
    questionable: parseInjuryPlayers(t.sidelined?.questionable?.player),
  };
}

async function getFootballInjuries(): Promise<FootballInjuryLeague[]> {
  if (
    footballInjuriesCache &&
    Date.now() - footballInjuriesFetchedAt < FOOTBALL_INJURIES_TTL
  ) {
    return footballInjuriesCache;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl("/v2/soccer/injuries-suspensions"),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballInjuriesRaw;
        const leagues = statpalList(payload.injuries_suspensions?.league).map(
          (league): FootballInjuryLeague => ({
            id: league.id,
            name: league.name,
            matches: statpalList(league.match).map((match) => ({
              id: match.main_id,
              date: match.date,
              time: match.time,
              home: parseInjuryTeam(match.home),
              away: parseInjuryTeam(match.away),
            })),
          }),
        );
        footballInjuriesCache = leagues;
        footballInjuriesFetchedAt = Date.now();
        return leagues;
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal" },
        "Football injuries provider failed",
      );
    }
  }

  return footballInjuriesCache ?? [];
}

router.get("/football-injuries", async (_req: Request, res: Response) => {
  try {
    const leagues = await getFootballInjuries();
    res.json({ leagues });
  } catch {
    res.status(500).json({ error: "Lesões de futebol indisponíveis" });
  }
});

// ─── Football Team Profile ─────────────────────────────────────────────────────

type FootballTeamPlayerRaw = {
  id: string;
  name: string;
  number: string;
  age: string;
  position: string;
  is_captain: string;
  injured: string;
  minutes_played: string;
  starting_lineups: string;
  substitute_in: string;
  substitute_out: string;
  on_bench: string;
  appearences: string;
  assists: string;
  goals: string;
  rating: string;
  yellowcards: string;
  yellowred: string;
  redcards: string;
  saves: string;
  goals_conceded: string;
  inside_box_saves: string;
  pen_saved: string;
  shots_total: string;
  shots_on_target: string;
  shots_woodwork: string;
  pass_attempts: string;
  pass_success: string;
  key_passes: string;
  dribble_attempts: string;
  dribble_success: string;
  dispossesed: string;
  duels_total: string;
  duels_won: string;
  fouls_committed: string;
  fouls_drawn: string;
  tackles: string;
  blocks: string;
  clearances: string;
  interceptions: string;
  crosses_total: string;
  crosses_accurate: string;
  pen_scored: string;
  pen_missed: string;
  pen_committed: string;
  pen_won: string;
};

type FootballTeamTransferPlayerRaw = {
  id: string;
  name: string;
  date: string;
  age?: string;
  position?: string;
  from?: string;
  to?: string;
  team_id?: string;
  type: string;
  price?: string;
};

type FootballTeamTrophyRaw = {
  country: string;
  league: string;
  status: string;
  count: string;
  seasons: string;
};

type FootballTeamPeriodRaw = { min: string; pct: string; count: string };

type FootballTeamLeagueStatRaw = {
  name: string;
  id: string;
  season: string;
  fulltime?: {
    win: { total: string; home: string; away: string };
    lost: { total: string; home: string; away: string };
    draw: { total: string; home: string; away: string };
  };
  firsthalf?: {
    win: { total: string; home: string; away: string };
    lost: { total: string; home: string; away: string };
    draw: { total: string; home: string; away: string };
  };
  secondhalf?: {
    win: { total: string; home: string; away: string };
    lost: { total: string; home: string; away: string };
    draw: { total: string; home: string; away: string };
  };
  scoring_minutes?: { period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] };
  goals_conceded_minutes?: {
    period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[];
  };
  yellowcard_minutes?: {
    period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[];
  };
  redcard_minutes?: { period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] };
};

type FootballTeamProfileRaw = {
  updated?: string;
  updated_ts?: number;
  team?: {
    id: string;
    name: string;
    country: string;
    founded: string;
    is_national_team: string;
    is_women: string;
    leagues?: { league_id: string | string[] };
    venue_name?: string;
    venue_id?: string;
    venue_surface?: string;
    venue_capacity?: string;
    venue_address?: string;
    venue_city?: string;
    coach?: { name: string; id: string };
    squad?: { player: FootballTeamPlayerRaw | FootballTeamPlayerRaw[] };
    transfers?: {
      in?: {
        player: FootballTeamTransferPlayerRaw | FootballTeamTransferPlayerRaw[];
      };
      out?: {
        player: FootballTeamTransferPlayerRaw | FootballTeamTransferPlayerRaw[];
      };
    };
    trophies?: { trophy: FootballTeamTrophyRaw | FootballTeamTrophyRaw[] };
    league_stats?: {
      league: FootballTeamLeagueStatRaw | FootballTeamLeagueStatRaw[];
    };
  };
};

const footballTeamCache = new Map<
  string,
  { data: object; fetchedAt: number }
>();
const FOOTBALL_TEAM_TTL = 30 * 60 * 1000; // 30 min

function parseTeamHalfRecord(half: FootballTeamLeagueStatRaw["fulltime"]) {
  if (!half) return null;
  const pi = (s: string) => parseInt(s) || 0;
  return {
    win: {
      total: pi(half.win.total),
      home: pi(half.win.home),
      away: pi(half.win.away),
    },
    lost: {
      total: pi(half.lost.total),
      home: pi(half.lost.home),
      away: pi(half.lost.away),
    },
    draw: {
      total: pi(half.draw.total),
      home: pi(half.draw.home),
      away: pi(half.draw.away),
    },
  };
}

function parseTeamPeriods(
  raw: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] | undefined,
) {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((p) => ({
    min: p.min,
    pct: p.pct,
    count: parseInt(p.count) || 0,
  }));
}

async function getFootballTeam(teamId: string): Promise<object> {
  const cached = footballTeamCache.get(teamId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_TEAM_TTL) {
    return cached.data;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(`/v2/soccer/teams/${encodeURIComponent(teamId)}`),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballTeamProfileRaw;
        const team = payload.team;
        if (team) {
          const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
          const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
          const parseTeamPlayer = (player: FootballTeamPlayerRaw) => ({
            id: player.id,
            name: player.name,
            number: player.number,
            age: pi(player.age),
            position: player.position,
            isCaptain:
              player.is_captain === "1" || player.is_captain === "True",
            injured: player.injured === "True",
            minutesPlayed: pi(player.minutes_played),
            startingLineups: pi(player.starting_lineups),
            subIn: pi(player.substitute_in),
            subOut: pi(player.substitute_out),
            onBench: pi(player.on_bench),
            appearances: pi(player.appearences),
            assists: pi(player.assists),
            goals: pi(player.goals),
            rating: pf(player.rating),
            yellowCards: pi(player.yellowcards),
            yellowRed: pi(player.yellowred),
            redCards: pi(player.redcards),
            saves: pi(player.saves),
            goalsConceded: pi(player.goals_conceded),
            insideBoxSaves: pi(player.inside_box_saves),
            penSaved: pi(player.pen_saved),
            penScored: pi(player.pen_scored),
            penMissed: pi(player.pen_missed),
            penCommitted: pi(player.pen_committed),
            penWon: pi(player.pen_won),
            shotsTotal: pi(player.shots_total),
            shotsOnTarget: pi(player.shots_on_target),
            shotsWoodwork: pi(player.shots_woodwork),
            passAttempts: pi(player.pass_attempts),
            passSuccess: pi(player.pass_success),
            keyPasses: pi(player.key_passes),
            dribbleAttempts: pi(player.dribble_attempts),
            dribbleSuccess: pi(player.dribble_success),
            dispossessed: pi(player.dispossesed),
            duelsTotal: pi(player.duels_total),
            duelsWon: pi(player.duels_won),
            foulsCommitted: pi(player.fouls_committed),
            foulsDrawn: pi(player.fouls_drawn),
            tackles: pi(player.tackles),
            blocks: pi(player.blocks),
            clearances: pi(player.clearances),
            interceptions: pi(player.interceptions),
            crossesTotal: pi(player.crosses_total),
            crossesAccurate: pi(player.crosses_accurate),
          });

          const parseTransferPlayer = (player: FootballTeamTransferPlayerRaw) => ({
            id: player.id,
            name: player.name,
            date: player.date,
            age: pi(player.age),
            position: player.position ?? "",
            from: player.from ?? "",
            to: player.to ?? "",
            teamId: player.team_id ?? "",
            type: player.type,
            price: player.price ?? "",
          });

          const data = {
            updated: payload.updated,
            updatedTs: payload.updated_ts ?? 0,
            team: {
              id: team.id,
              name: team.name,
              country: team.country,
              founded: pi(team.founded),
              isNationalTeam: team.is_national_team === "True",
              isWomen: team.is_women === "True",
              leagueIds: statpalList(team.leagues?.league_id),
              venue: {
                name: team.venue_name ?? "",
                id: team.venue_id ?? "",
                surface: team.venue_surface ?? "",
                capacity: pi(team.venue_capacity),
                address: team.venue_address ?? "",
                city: team.venue_city ?? "",
              },
              coach: team.coach
                ? { id: team.coach.id, name: team.coach.name }
                : null,
              squad: statpalList(team.squad?.player).map(parseTeamPlayer),
              transfers: {
                in: statpalList(team.transfers?.in?.player).map(
                  parseTransferPlayer,
                ),
                out: statpalList(team.transfers?.out?.player).map(
                  parseTransferPlayer,
                ),
              },
              trophies: statpalList(team.trophies?.trophy).map((trophy) => ({
                country: trophy.country,
                league: trophy.league,
                status: trophy.status,
                count: pi(trophy.count),
                seasons: trophy.seasons,
              })),
              leagueStats: statpalList(team.league_stats?.league).map((league) => ({
                id: league.id,
                name: league.name,
                season: league.season,
                fulltime: parseTeamHalfRecord(league.fulltime),
                firsthalf: parseTeamHalfRecord(league.firsthalf),
                secondhalf: parseTeamHalfRecord(league.secondhalf),
                scoringMinutes: parseTeamPeriods(league.scoring_minutes?.period),
                goalsConcededMinutes: parseTeamPeriods(
                  league.goals_conceded_minutes?.period,
                ),
                yellowcardMinutes: parseTeamPeriods(
                  league.yellowcard_minutes?.period,
                ),
                redcardMinutes: parseTeamPeriods(league.redcard_minutes?.period),
              })),
            },
          };

          footballTeamCache.set(teamId, { data, fetchedAt: Date.now() });
          return data;
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", teamId },
        "Football team provider failed",
      );
    }
  }

  if (cached) return cached.data;
  throw new Error("Equipa indisponível");
}

router.get("/football-team/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const team = await getFootballTeam(id);
    res.json(team);
  } catch {
    res.status(500).json({ error: "Perfil de equipa indisponível" });
  }
});

// ─── Football Player Profile ───────────────────────────────────────────────────

// Per-club/season stat block (uses `pen_*`, `shots_on_target`, `appearances` — correct spelling)
type FootballPlayerClubStatRaw = {
  team_id: string;
  team_name: string;
  league_id: string;
  league: string;
  season: string;
  is_captain: string;
  minutes_played: string;
  appearances: string;
  starting_lineups: string;
  substitute_in: string;
  substitute_out?: string;
  on_bench?: string;
  assists: string;
  blocks: string;
  clearances: string;
  crosses_accurate: string;
  crosses_total: string;
  dispossesed: string;
  dribble_attempts: string;
  dribble_success: string;
  duels_total: string;
  duels_won: string;
  fouls_committed: string;
  fouls_drawn: string;
  goals: string;
  goals_conceded: string;
  inside_box_saves: string;
  interceptions: string;
  key_passes: string;
  pass_attempts: string;
  pass_success: string;
  pen_committed?: string;
  pen_missed: string;
  pen_saved?: string;
  pen_scored: string;
  pen_won?: string;
  rating: string;
  redcards: string;
  saves: string;
  shots_on_target: string;
  shots_total: string;
  shots_woodwork: string;
  tackles: string;
  yellowcards: string;
  yellowred: string;
};

// Career totals block — no `goals` field
type FootballPlayerOverallStatRaw = {
  minutes_played: string;
  appearances?: string;
  starting_lineups: string;
  substitute_in: string;
  assists: string;
  blocks: string;
  clearances: string;
  crosses_accurate: string;
  crosses_total: string;
  dispossesed: string;
  dribble_attempts: string;
  dribble_success: string;
  duels_total: string;
  duels_won: string;
  fouls_committed: string;
  fouls_drawn: string;
  goals_conceded: string;
  inside_box_saves?: string;
  interceptions: string;
  key_passes: string;
  pass_attempts: string;
  pass_success: string;
  pen_committed?: string;
  pen_missed: string;
  pen_saved?: string;
  pen_scored: string;
  pen_won?: string;
  rating: string;
  saves?: string;
  shots_on_target: string;
  shots_total: string;
  shots_woodwork: string;
  tackles: string;
};

type FootballPlayerProfileRaw = {
  updated?: string;
  updated_ts?: number;
  player?: {
    id: string;
    name: string;
    firstname: string;
    lastname: string;
    age: string;
    birthdate: string;
    nationality: string;
    birthplace: string;
    birthcountry: string;
    position: string;
    height: string;
    weight: string;
    preferred_foot: string;
    team: string;
    team_id: string;
    national_team_id?: string;
    market_value_eur?: string;
    club_league_statistics?: {
      club: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[];
    };
    club_domestic_cup_statistics?: {
      club: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[];
    };
    club_intl_cup_statistics?: {
      club: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[];
    };
    overall_club_statistics?: FootballPlayerOverallStatRaw;
    national_team_statistics?: unknown;
    transfers?: unknown;
    trophies?: unknown;
    sidelined_history?: unknown;
  };
};

const footballPlayerCache = new Map<
  string,
  { data: object; fetchedAt: number }
>();
const FOOTBALL_PLAYER_TTL = 30 * 60 * 1000;

function parsePlayerClubStat(c: FootballPlayerClubStatRaw) {
  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
  return {
    teamId: c.team_id,
    teamName: c.team_name,
    leagueId: c.league_id,
    league: c.league,
    season: c.season,
    isCaptain: c.is_captain === "1" || c.is_captain === "True",
    minutesPlayed: pi(c.minutes_played),
    appearances: pi(c.appearances),
    startingLineups: pi(c.starting_lineups),
    subIn: pi(c.substitute_in),
    onBench: pi(c.on_bench),
    goals: pi(c.goals),
    assists: pi(c.assists),
    rating: pf(c.rating),
    yellowCards: pi(c.yellowcards),
    yellowRed: pi(c.yellowred),
    redCards: pi(c.redcards),
    saves: pi(c.saves),
    goalsConceded: pi(c.goals_conceded),
    insideBoxSaves: pi(c.inside_box_saves),
    penScored: pi(c.pen_scored),
    penMissed: pi(c.pen_missed),
    penSaved: pi(c.pen_saved),
    shotsTotal: pi(c.shots_total),
    shotsOnTarget: pi(c.shots_on_target),
    shotsWoodwork: pi(c.shots_woodwork),
    passAttempts: pi(c.pass_attempts),
    passSuccess: pi(c.pass_success),
    keyPasses: pi(c.key_passes),
    dribbleAttempts: pi(c.dribble_attempts),
    dribbleSuccess: pi(c.dribble_success),
    duelsTotal: pi(c.duels_total),
    duelsWon: pi(c.duels_won),
    foulsCommitted: pi(c.fouls_committed),
    foulsDrawn: pi(c.fouls_drawn),
    tackles: pi(c.tackles),
    blocks: pi(c.blocks),
    clearances: pi(c.clearances),
    interceptions: pi(c.interceptions),
    crossesTotal: pi(c.crosses_total),
    crossesAccurate: pi(c.crosses_accurate),
  };
}

function parsePlayerOverall(o: FootballPlayerOverallStatRaw) {
  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
  return {
    minutesPlayed: pi(o.minutes_played),
    appearances: pi(o.appearances),
    startingLineups: pi(o.starting_lineups),
    subIn: pi(o.substitute_in),
    assists: pi(o.assists),
    rating: pf(o.rating),
    penScored: pi(o.pen_scored),
    penMissed: pi(o.pen_missed),
    shotsTotal: pi(o.shots_total),
    shotsOnTarget: pi(o.shots_on_target),
    shotsWoodwork: pi(o.shots_woodwork),
    passAttempts: pi(o.pass_attempts),
    passSuccess: pi(o.pass_success),
    keyPasses: pi(o.key_passes),
    dribbleAttempts: pi(o.dribble_attempts),
    dribbleSuccess: pi(o.dribble_success),
    duelsTotal: pi(o.duels_total),
    duelsWon: pi(o.duels_won),
    foulsCommitted: pi(o.fouls_committed),
    foulsDrawn: pi(o.fouls_drawn),
    tackles: pi(o.tackles),
    blocks: pi(o.blocks),
    clearances: pi(o.clearances),
    interceptions: pi(o.interceptions),
    crossesTotal: pi(o.crosses_total),
    crossesAccurate: pi(o.crosses_accurate),
  };
}

function toClubStats(
  raw: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[] | undefined,
) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(parsePlayerClubStat);
}

async function getFootballPlayer(playerId: string): Promise<object> {
  const cached = footballPlayerCache.get(playerId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_PLAYER_TTL) {
    return cached.data;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(`/v2/soccer/players/${encodeURIComponent(playerId)}`),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballPlayerProfileRaw;
        const player = payload.player;
        if (player) {
          const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
          const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
          const data = {
            updated: payload.updated,
            updatedTs: payload.updated_ts ?? 0,
            player: {
              id: player.id,
              name: player.name,
              firstName: player.firstname,
              lastName: player.lastname,
              age: pi(player.age),
              birthdate: player.birthdate,
              nationality: player.nationality,
              birthplace: player.birthplace,
              birthcountry: player.birthcountry,
              position: player.position,
              height: pi(player.height),
              weight: pi(player.weight),
              preferredFoot: player.preferred_foot,
              team: player.team,
              teamId: player.team_id,
              nationalTeamId: player.national_team_id ?? "",
              marketValueEur: pi(player.market_value_eur),
              clubLeagueStatistics: toClubStats(
                player.club_league_statistics?.club,
              ),
              clubDomesticCupStatistics: toClubStats(
                player.club_domestic_cup_statistics?.club,
              ),
              clubIntlCupStatistics: toClubStats(
                player.club_intl_cup_statistics?.club,
              ),
              overallClubStatistics: player.overall_club_statistics
                ? parsePlayerOverall(player.overall_club_statistics)
                : null,
              nationalTeamStatistics: player.national_team_statistics ?? null,
              transfers: player.transfers ?? [],
              trophies: player.trophies ?? {},
              sidelinedHistory: player.sidelined_history ?? [],
              currentRating: player.overall_club_statistics
                ? pf(player.overall_club_statistics.rating)
                : 0,
            },
          };

          footballPlayerCache.set(playerId, { data, fetchedAt: Date.now() });
          return data;
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", playerId },
        "Football player provider failed",
      );
    }
  }

  if (cached) return cached.data;
  throw new Error("Jogador indisponível");
}

router.get("/football-player/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const player = await getFootballPlayer(id);
    res.json(player);
  } catch {
    res.status(500).json({ error: "Perfil de jogador indisponível" });
  }
});

// ─── Football Coach Profile ────────────────────────────────────────────────────

type FootballCoachProfileRaw = {
  updated?: string;
  updated_ts?: number;
  coach?: {
    id: string;
    name: string;
    firstname: string;
    lastname: string;
    team: string;
    team_id: string;
    nationality: string;
    birthdate: string;
    age: string;
    birthcountry: string;
    birthplace: string;
    height: string; // "180 cm" — includes unit
    weight: string; // "70 kg"  — includes unit
    trophies?: { trophy: FootballTeamTrophyRaw | FootballTeamTrophyRaw[] };
    career_stats?: {
      team:
        | { name: string; id: string; from: string; to: string }
        | { name: string; id: string; from: string; to: string }[];
    };
  };
};

const footballCoachCache = new Map<
  string,
  { data: object; fetchedAt: number }
>();
const FOOTBALL_COACH_TTL = 30 * 60 * 1000;

async function getFootballCoach(coachId: string): Promise<object> {
  const cached = footballCoachCache.get(coachId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_COACH_TTL) {
    return cached.data;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(`/v2/soccer/coaches/${encodeURIComponent(coachId)}`),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballCoachProfileRaw;
        const coach = payload.coach;
        if (coach) {
          const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
          const trophies = statpalList(coach.trophies?.trophy).map((trophy) => ({
            country: trophy.country,
            league: trophy.league,
            status: trophy.status,
            count: pi(trophy.count),
            seasons: trophy.seasons,
          }));
          const career = statpalList(coach.career_stats?.team).map((team) => ({
            id: team.id,
            name: team.name,
            from: team.from,
            to: team.to,
          }));

          const data = {
            updated: payload.updated,
            updatedTs: payload.updated_ts ?? 0,
            coach: {
              id: coach.id,
              name: coach.name,
              firstName: coach.firstname,
              lastName: coach.lastname,
              team: coach.team,
              teamId: coach.team_id,
              nationality: coach.nationality,
              birthdate: coach.birthdate,
              age: pi(coach.age),
              birthcountry: coach.birthcountry,
              birthplace: coach.birthplace,
              height: coach.height,
              weight: coach.weight,
              trophies,
              careerStats: career,
            },
          };

          footballCoachCache.set(coachId, { data, fetchedAt: Date.now() });
          return data;
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", coachId },
        "Football coach provider failed",
      );
    }
  }

  if (cached) return cached.data;
  throw new Error("Treinador indisponível");
}

router.get("/football-coach/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const coach = await getFootballCoach(id);
    res.json(coach);
  } catch {
    res.status(500).json({ error: "Perfil de treinador indisponível" });
  }
});

// ─── Football Images (binary PNG proxy) ────────────────────────────────────────
// GET /api/matches/football-image?type=team|player|league&id={id}
// Fetches binary PNG from Statpal and proxies it directly.
// Cache-Control: 7 days — images rarely change.

const imageCache = new Map<string, { buf: Buffer; fetchedAt: number }>();
const IMAGE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

router.get("/football-image", async (req: Request, res: Response) => {
  if (!CONFIG.STATPAL_API_KEY) {
    res.status(404).json({ error: "Imagens indisponíveis" });
    return;
  }

  const type = String(req.query["type"] ?? "").trim().toLowerCase();
  const id = String(req.query["id"] ?? "").trim();
  if (!type || !id) {
    res.status(400).json({ error: "Parâmetros type e id são obrigatórios" });
    return;
  }

  const cacheKey = `${type}:${id}`;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < IMAGE_TTL) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(cached.buf);
    return;
  }

  try {
    const url = buildStatpalUrl("/v2/soccer/images", { type, id });
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "image/png, application/json",
      },
    });

    if (!upstream.ok) {
      res.status(404).json({ error: "Imagem indisponível" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("image/")) {
      const payload = await upstream.text();
      logger.warn(
        { type, id, contentType, payload: payload.slice(0, 400) },
        "Football image upstream returned non-image payload",
      );
      res.status(404).json({ error: "Imagem indisponível" });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    imageCache.set(cacheKey, { buf, fetchedAt: Date.now() });
    res.setHeader("Content-Type", contentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(buf);
  } catch (err) {
    logger.warn({ err, type, id }, "Football image provider failed");
    res.status(500).json({ error: "Imagens indisponíveis" });
  }
});

// ─── Football Pre-match Odds (per league, v2) ──────────────────────────────────
// v2/soccer/leagues/{id}/odds/prematch — market "1x2" with bookmaker array
// Distinct from getOddsMap() which uses v1/soccer/odds/{country} for live cards.

type FootballOddsBookmakerRaw = {
  id: string;
  name: string;
  timestamp: string;
  stop?: string;
  odd: { name: string; value: string }[];
};
type FootballOddsMarketRaw = {
  id: string;
  name: string;
  stop: string;
  bookmaker: FootballOddsBookmakerRaw | FootballOddsBookmakerRaw[];
};
type FootballOddsMatchRaw = {
  main_id: string;
  fallback_id_1?: string;
  fallback_id_2?: string;
  fallback_id_3?: string;
  date: string;
  time: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  odds: FootballOddsMarketRaw | FootballOddsMarketRaw[];
};
type FootballPrematchOddsRaw = {
  prematch_odds?: {
    updated?: string;
    updated_ts?: number;
    league?: {
      id: string;
      name: string;
      country: string;
      match: FootballOddsMatchRaw | FootballOddsMatchRaw[];
    };
  };
};

type FootballOddsEntry = {
  matchId: string;
  date: string;
  time: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  /** Full market set parsed from the /odds/prematch endpoint */
  markets?: AdvancedMarkets;
};

/**
 * Parse all available markets from a single match's Statpal prematch odds array
 * and return both the 1x2 odds and a populated AdvancedMarkets object.
 *
 * Averages bookmaker prices across all active (non-stopped) bookmakers for each
 * outcome in each market.  Unknown markets are silently skipped.
 */
// Diagnostic capture of market names Statpal's /odds/prematch feed returns
// that we don't currently parse (see the loop's final `else` branch below).
// Statpal aggregates prices across ~80 bookmakers per league and offers many
// more market types than the handful we handle — this map lets us see the
// real names in production (e.g. any anytime-goalscorer/assist markets)
// instead of guessing blind. Exposed read-only via GET /api/admin/unknown-markets.
export const unknownStatpalMarkets = new Map<
  string,
  { count: number; lastSeen: number; sampleOutcomeNames: string[] }
>();
const UNKNOWN_MARKET_CAP = 300;

function recordUnknownStatpalMarket(rawName: string, bms: FootballOddsBookmakerRaw[]): void {
  const name = String(rawName ?? "").trim();
  if (!name) return;
  const existing = unknownStatpalMarkets.get(name);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = Date.now();
  } else {
    if (unknownStatpalMarkets.size >= UNKNOWN_MARKET_CAP) return; // cap memory use
    const sampleOutcomeNames = statpalList(bms[0]?.odd ?? [])
      .slice(0, 8)
      .map((o) => o.name);
    unknownStatpalMarkets.set(name, {
      count: 1,
      lastSeen: Date.now(),
      sampleOutcomeNames,
    });
  }
}

function parseStatpalPrematchMarkets(
  marketEntries: FootballOddsMarketRaw[],
  baseMarkets: AdvancedMarkets,
): {
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  markets: AdvancedMarkets;
} {
  let homeOdds = 0,
    drawOdds = 0,
    awayOdds = 0;
  const markets: AdvancedMarkets = { ...baseMarkets };

  /** Average a named outcome across a bookmaker list, return 0 if none. */
  const avgOdd = (
    bms: FootballOddsBookmakerRaw[],
    ...outcomeNames: string[]
  ): number => {
    const values: number[] = [];
    for (const bm of bms) {
      for (const outcomeName of outcomeNames) {
        const odd = statpalList(bm.odd).find((e) => e.name === outcomeName);
        if (odd) {
          const v = parseFloat(odd.value ?? "0");
          if (Number.isFinite(v) && v > 1) {
            values.push(v);
            break; // found a matching outcome for this bookmaker
          }
        }
      }
    }
    if (!values.length) return 0;
    return (
      Math.round(
        (values.reduce((s, v) => s + v, 0) / values.length) * 100,
      ) / 100
    );
  };

  const activeBms = (mkt: FootballOddsMarketRaw): FootballOddsBookmakerRaw[] =>
    statpalList(mkt.bookmaker).filter(
      (bm) => String(bm.stop ?? "False") !== "True",
    );

  for (const mkt of marketEntries) {
    const name = String(mkt.name ?? "")
      .toLowerCase()
      .trim();
    const bms = activeBms(mkt);
    if (!bms.length) continue;

    // ── 1x2 ───────────────────────────────────────────────────────────────
    if (name === "1x2" || name === "fulltime result") {
      homeOdds = avgOdd(bms, "Home", "1");
      drawOdds = avgOdd(bms, "Draw", "X");
      awayOdds = avgOdd(bms, "Away", "2");
    }

    // ── Double Chance ─────────────────────────────────────────────────────
    else if (name.includes("double chance")) {
      const homeOrDraw = avgOdd(bms, "1X", "Home or Draw", "HomeOrDraw");
      const awayOrDraw = avgOdd(bms, "X2", "Draw or Away", "DrawOrAway");
      const homeOrAway = avgOdd(bms, "12", "Home or Away", "HomeOrAway");
      if (homeOrDraw > 0 || awayOrDraw > 0 || homeOrAway > 0) {
        markets.doubleChance = { homeOrDraw, awayOrDraw, homeOrAway };
      }
    }

    // ── BTTS ──────────────────────────────────────────────────────────────
    else if (name.includes("both teams") || name === "goal/no goal") {
      const yes = avgOdd(bms, "Yes");
      const no = avgOdd(bms, "No");
      if (yes > 0 || no > 0) {
        markets.bothTeamsScore = { yes, no };
      }
    }

    // ── Over/Under (any line) ─────────────────────────────────────────────
    else if (
      name.startsWith("over/under") ||
      name.startsWith("over under") ||
      name.startsWith("total goals")
    ) {
      const lineM = name.match(/(\d+\.?\d*)/);
      if (lineM) {
        const line = parseFloat(lineM[1]!);
        const over = avgOdd(bms, "Over", `Over ${line}`, `Over(${line})`);
        const under = avgOdd(
          bms,
          "Under",
          `Under ${line}`,
          `Under(${line})`,
        );
        if (over > 0 || under > 0) {
          const lineK = Math.round(line * 10);
          const tg = markets.totalGoals;
          if (lineK === 5)
            markets.totalGoals = { ...tg, over05: over, under05: under };
          else if (lineK === 15)
            markets.totalGoals = { ...tg, over15: over, under15: under };
          else if (lineK === 25)
            markets.totalGoals = { ...tg, over25: over, under25: under };
          else if (lineK === 35)
            markets.totalGoals = { ...tg, over35: over, under35: under };
          else if (lineK === 45)
            markets.totalGoals = { ...tg, over45: over, under45: under };
          else if (lineK === 55)
            markets.totalGoals = { ...tg, over55: over, under55: under };
          else if (lineK === 65)
            markets.totalGoals = { ...tg, over65: over, under65: under };
        }
      }
    }

    // ── Half Time ─────────────────────────────────────────────────────────
    else if (
      name === "half time" ||
      name === "half-time" ||
      name === "1st half result" ||
      name === "first half result"
    ) {
      const home = avgOdd(bms, "Home", "1");
      const draw = avgOdd(bms, "Draw", "X");
      const away = avgOdd(bms, "Away", "2");
      if (home > 0 || draw > 0 || away > 0) {
        markets.halfTime = { home, draw, away };
      }
    }

    // ── Draw No Bet ───────────────────────────────────────────────────────
    else if (name === "draw no bet" || name === "dnb") {
      const home = avgOdd(bms, "Home", "1");
      const away = avgOdd(bms, "Away", "2");
      if (home > 0 || away > 0) {
        markets.drawNoBet = { home, away };
      }
    }

    // ── Asian Handicap ────────────────────────────────────────────────────
    else if (name === "asian handicap") {
      const home = avgOdd(bms, "Home");
      const away = avgOdd(bms, "Away");
      if (home > 0 || away > 0) {
        // Parse line from the first non-stopped bookmaker
        const rawOdds = statpalList(bms[0]?.odd ?? []);
        const homeEntry = rawOdds.find((e) => e.name === "Home");
        const lineVal = 0; // line would need separate parsing from entry name
        markets.asianHandicap = { line: lineVal, home, away };
      }
    }

    // ── First Goal ────────────────────────────────────────────────────────
    else if (
      name.includes("first goal") ||
      name.includes("first scorer team")
    ) {
      const home = avgOdd(bms, "Home", "1");
      const noGoal = avgOdd(bms, "No Goal", "No goal", "Neither");
      const away = avgOdd(bms, "Away", "2");
      if (home > 0 || away > 0) {
        markets.firstGoal = { home, noGoal: noGoal || 0, away };
      }
    }

    // ── Unknown market — diagnostic capture only, not surfaced to bettors ──
    else {
      recordUnknownStatpalMarket(mkt.name, bms);
    }
  }

  return { homeOdds, drawOdds, awayOdds, markets };
}

const footballOddsCache = new Map<
  string,
  {
    data: FootballOddsEntry[];
    meta: { id: string; name: string; country: string };
    fetchedAt: number;
  }
>();
const FOOTBALL_ODDS_TTL = 5 * 60 * 1000;

async function getFootballLeagueOdds(leagueId: string): Promise<{
  odds: FootballOddsEntry[];
  meta: { id: string; name: string; country: string };
}> {
  const cached = footballOddsCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < FOOTBALL_ODDS_TTL) {
    return { odds: cached.data, meta: cached.meta };
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(
        buildStatpalUrl(
          `/v2/soccer/leagues/${encodeURIComponent(leagueId)}/odds/prematch`,
        ),
        {
          signal: AbortSignal.timeout(8_000),
          headers: statpalHeaders(),
        },
      );
      if (resp.ok) {
        const payload = (await resp.json()) as FootballPrematchOddsRaw;
        const league = payload.prematch_odds?.league;
        if (league) {
          const averageOdds = (
            bookmakers: FootballOddsBookmakerRaw[],
            outcome: "Home" | "Draw" | "Away",
          ) => {
            const values = bookmakers
              .map((bookmaker) => {
                const odd = statpalList(bookmaker.odd).find(
                  (entry) => entry.name === outcome,
                );
                return Number.parseFloat(odd?.value ?? "0");
              })
              .filter((value) => Number.isFinite(value) && value > 1);
            if (!values.length) return 0;
            return Math.round(
              (values.reduce((sum, value) => sum + value, 0) / values.length) *
                100,
            ) / 100;
          };

          const odds = statpalList(league.match)
            .map((match): FootballOddsEntry | null => {
              const allMarkets = statpalList(match.odds);
              if (!allMarkets.length) return null;

              // Parse all markets (1x2, DC, BTTS, O/U, HT, DNB, AH, first goal)
              const baseMarkets = makeAdvancedMarketsFromTeams(
                match.home.name,
                match.away.name,
              );
              const { homeOdds, drawOdds, awayOdds, markets } =
                parseStatpalPrematchMarkets(allMarkets, baseMarkets);

              if (!homeOdds || !awayOdds) return null;
              return {
                matchId: match.main_id,
                date: match.date,
                time: match.time,
                homeTeam: { id: match.home.id, name: match.home.name },
                awayTeam: { id: match.away.id, name: match.away.name },
                homeOdds,
                drawOdds,
                awayOdds,
                markets,
              };
            })
            .filter((entry): entry is FootballOddsEntry => !!entry);

          const meta = {
            id: league.id,
            name: league.name,
            country: league.country,
          };
          footballOddsCache.set(leagueId, {
            data: odds,
            meta,
            fetchedAt: Date.now(),
          });
          return { odds, meta };
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: "statpal", leagueId },
        "Football prematch odds provider failed",
      );
    }
  }

  if (cached) return { odds: cached.data, meta: cached.meta };
  throw new Error("Odds indisponíveis");
}

router.get("/football-odds/:leagueId", async (req: Request, res: Response) => {
  const leagueId = String(req.params["leagueId"]);
  try {
    const { odds, meta } = await getFootballLeagueOdds(leagueId);
    res.json({ ...meta, odds });
  } catch {
    res.status(500).json({ error: "Odds de futebol indisponíveis" });
  }
});

// ─── Football Live Odds (in-play) ─────────────────────────────────────────────
// v2/soccer/odds/live — completely different structure from all other endpoints:
//   • updated_ts in milliseconds (not seconds)
//   • score as "1:1" string
//   • stats keyed by numeric strings "0","1",...
//   • status.stopped/blocked/finished as "0"/"1" strings
//   • kit_color as comma-separated hex list

// Statpal /v2/soccer/odds/live returns Portuguese field names.
// All fields are read via the statpalOddsMatchToV2Event helper which handles
// both Portuguese and English variants, so this type just documents the shape.
type FootballLiveOddsMatchRaw = Record<string, unknown>;

type FootballLiveOddsRaw = {
  // Portuguese root key
  partidas_ao_vivo?: FootballLiveOddsMatchRaw[];
  // English root key (kept for forward-compatibility)
  live_matches?: FootballLiveOddsMatchRaw[];
  updated?: string;
  atualizado?: string;
  updated_ts?: number; // milliseconds
};

let footballLiveOddsCache: object[] | null = null;
let footballLiveOddsFetchedAt = 0;
const FOOTBALL_LIVE_ODDS_TTL = 10 * 1000; // 10s — in-play data, very fresh

async function getFootballLiveOdds(): Promise<object[]> {
  const now = Date.now();
  if (
    footballLiveOddsCache &&
    now - footballLiveOddsFetchedAt < FOOTBALL_LIVE_ODDS_TTL
  ) {
    return footballLiveOddsCache;
  }

  if (
    CONFIG.STATPAL_API_KEY &&
    canUseFootballProvider(CONFIG.FOOTBALL_REFERENCE_PROVIDER, "statpal")
  ) {
    try {
      const resp = await fetch(buildStatpalUrl("/v2/soccer/odds/live"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as FootballLiveOddsRaw;
        // Root key: Portuguese "partidas_ao_vivo" or English "live_matches"
        const rawList = statpalList(
          payload.partidas_ao_vivo ?? payload.live_matches,
        );
        const matches = rawList.map((m) => {
          // Portuguese field names: informação_da_partida / informações_da_equipe / lar / ausente
          const matchInfo = (m["informação_da_partida"] ?? m["match_info"]) as
            | Record<string, unknown>
            | undefined;
          const teamsRaw = (m["informações_da_equipe"] ?? m["team_info"]) as
            | Record<string, unknown>
            | undefined;
          const statusRaw = m["status"] as Record<string, unknown> | undefined;

          const homeRaw = (teamsRaw?.["lar"] ?? teamsRaw?.["home"]) as
            | Record<string, unknown>
            | undefined;
          const awayRaw = (teamsRaw?.["ausente"] ?? teamsRaw?.["away"]) as
            | Record<string, unknown>
            | undefined;

          const scoreStr = String(matchInfo?.["placar"] ?? matchInfo?.["score"] ?? "0:0");
          const [homeScore, awayScore] = scoreStr
            .split(":")
            .map((v) => Number.parseInt(v, 10) || 0);

          const kitColors = (raw: string | undefined) =>
            String(raw ?? "")
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean);

          return {
            id: String(matchInfo?.["main_id"] ?? ""),
            leagueId: String(matchInfo?.["league_id"] ?? ""),
            // Portuguese: liga; English: league
            league: String(matchInfo?.["liga"] ?? matchInfo?.["league"] ?? ""),
            name: String(matchInfo?.["nome"] ?? matchInfo?.["name"] ?? ""),
            date: String(matchInfo?.["data_de_início"] ?? matchInfo?.["start_date"] ?? ""),
            time: String(matchInfo?.["start_time"] ?? ""),
            startTs: Number(matchInfo?.["start_ts"] ?? 0),
            startTsUtc: Number(matchInfo?.["start_ts_utc"] ?? 0),
            // Portuguese: período; English: period
            period: String(matchInfo?.["período"] ?? matchInfo?.["period"] ?? ""),
            minute:
              Number.parseInt(
                String(matchInfo?.["minuto"] ?? matchInfo?.["minute"] ?? "0"),
                10,
              ) || 0,
            seconds: String(matchInfo?.["segundos"] ?? matchInfo?.["seconds"] ?? ""),
            state: {
              code: String(matchInfo?.["código_do_estado"] ?? matchInfo?.["state_code"] ?? ""),
              name: String(matchInfo?.["state_name"] ?? ""),
              details: String(matchInfo?.["state_details"] ?? ""),
              ballPosition: String(matchInfo?.["ball_pos"] ?? ""),
            },
            status: {
              // Portuguese: parado/bloqueado/concluído; English: stopped/blocked/finished
              stopped:
                statusRaw?.["parado"] === "1" || statusRaw?.["stopped"] === "1",
              blocked:
                statusRaw?.["bloqueado"] === "1" || statusRaw?.["blocked"] === "1",
              finished:
                statusRaw?.["concluído"] === "1" || statusRaw?.["finished"] === "1",
              updated: String(statusRaw?.["atualizado"] ?? statusRaw?.["updated"] ?? ""),
              updatedTs:
                Number.parseInt(String(statusRaw?.["updated_ts"] ?? "0"), 10) || 0,
            },
            homeTeam: {
              id: String(homeRaw?.["id"] ?? ""),
              name: String(homeRaw?.["nome"] ?? homeRaw?.["name"] ?? ""),
              score:
                Number.parseInt(
                  String(homeRaw?.["pontuação"] ?? homeRaw?.["score"] ?? "0"),
                  10,
                ) || homeScore,
              kitColors: kitColors(homeRaw?.["kit_color"] as string | undefined),
            },
            awayTeam: {
              id: String(awayRaw?.["id"] ?? ""),
              name: String(awayRaw?.["nome"] ?? awayRaw?.["name"] ?? ""),
              score:
                Number.parseInt(
                  String(awayRaw?.["pontuação"] ?? awayRaw?.["score"] ?? "0"),
                  10,
                ) || awayScore,
              kitColors: kitColors(awayRaw?.["kit_color"] as string | undefined),
            },
            stats: Object.values((m["estatísticas"] ?? m["stats"] ?? {}) as Record<string, Record<string, string>>).map(
              (entry) => ({
                name: String(entry?.["nome"] ?? entry?.["name"] ?? ""),
                home: String(entry?.["casa"] ?? entry?.["home"] ?? ""),
                away: String(entry?.["fora"] ?? entry?.["away"] ?? ""),
              }),
            ),
            matchEvents: (m["match_events"] ?? []) as unknown[],
            odds: (m["chances"] ?? m["odds"] ?? []) as unknown[],
          };
        });
        footballLiveOddsCache = matches;
        footballLiveOddsFetchedAt = now;
        return matches;
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "Football live odds provider failed");
    }
  }

  return footballLiveOddsCache ?? [];
}

router.get("/football-live-odds", async (_req: Request, res: Response) => {
  try {
    const matches = await getFootballLiveOdds();
    res.json({ matches });
  } catch {
    res.status(500).json({ error: "Odds ao vivo indisponíveis" });
  }
});

// ─── Football Live Odds Markets catalogue ─────────────────────────────────────
// v2/soccer/odds/live/markets — root is a bare array (no wrapper object)
// Returns available in-play betting market types with id and name.

let footballLiveMarketsCache: { id: number; name: string }[] | null = null;
let footballLiveMarketsFetchedAt = 0;
const FOOTBALL_LIVE_MARKETS_TTL = 60 * 60 * 1000; // 1h — catalogue rarely changes

router.get("/football-live-markets", async (_req: Request, res: Response) => {
  const now = Date.now();
  if (
    footballLiveMarketsCache &&
    now - footballLiveMarketsFetchedAt < FOOTBALL_LIVE_MARKETS_TTL
  ) {
    res.json({ markets: footballLiveMarketsCache });
    return;
  }

  if (CONFIG.STATPAL_API_KEY) {
    try {
      const resp = await fetch(buildStatpalUrl("/v2/soccer/odds/live/markets"), {
        signal: AbortSignal.timeout(8_000),
        headers: statpalHeaders(),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as Array<{ id: number; name: string }>;
        footballLiveMarketsCache = payload;
        footballLiveMarketsFetchedAt = now;
      }
    } catch (err) {
      logger.warn({ err, provider: "statpal" }, "Football live markets provider failed");
    }
  }

  res.json({ markets: footballLiveMarketsCache ?? [] });
});

// ─── Football Live Match States catalogue ─────────────────────────────────────
// v2/soccer/odds/live/match-states — bare array root, same shape as live/markets
// Provides human-readable labels for state_code values in football-live-odds.

let footballLiveStatesCache: { id: number; name: string }[] | null = null;
let footballLiveStatesFetchedAt = 0;
const FOOTBALL_LIVE_STATES_TTL = 60 * 60 * 1000; // 1h — static catalogue

router.get(
  "/football-live-match-states",
  async (_req: Request, res: Response) => {
    const now = Date.now();
    if (
      footballLiveStatesCache &&
      now - footballLiveStatesFetchedAt < FOOTBALL_LIVE_STATES_TTL
    ) {
      res.json({ states: footballLiveStatesCache });
      return;
    }

    if (CONFIG.STATPAL_API_KEY) {
      try {
        const resp = await fetch(
          buildStatpalUrl("/v2/soccer/odds/live/match-states"),
          {
            signal: AbortSignal.timeout(8_000),
            headers: statpalHeaders(),
          },
        );
        if (resp.ok) {
          const payload = (await resp.json()) as Array<{
            id: number;
            name: string;
          }>;
          footballLiveStatesCache = payload;
          footballLiveStatesFetchedAt = now;
        }
      } catch (err) {
        logger.warn(
          { err, provider: "statpal" },
          "Football live match states provider failed",
        );
      }
    }

    res.json({ states: footballLiveStatesCache ?? [] });
  },
);

// ─── Football Livescores (v1) ──────────────────────────────────────────────────
// v1/soccer/livescores — separate from v2/soccer/matches/live used by /live route.
// v1 is simpler (no inplay_odds_running, no et/penalties) but has different fields:
//   • root: livescore.league[] (not live_matches.league)
//   • match id field: id + alternate_id + static_id (not main_id)
//   • home/away.agg: "true"/"false" string (won on aggregate)
//   • commentary: "True"/"False" string
//   • events.event: single object or array; fields use no-underscore names (playerid, assistid)
//   • ht.score / ft.score: "[0-2]" string (not pre-parsed numbers)

type V1SoccerEvent = {
  id: string;
  type: string;
  team: string;
  minute: string;
  extra_min: string;
  player: string;
  playerid: string;
  assist: string;
  assistid: string;
  result: string; // "[0 - 1]"
};
type V1SoccerTeam = { id: string; name: string; goals: string; agg: string };
type V1SoccerMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2: string;
  static_id: string;
  status: string;
  date: string;
  time: string;
  venue: string;
  commentary: string;
  inj_minute: string;
  inj_time: string;
  home: V1SoccerTeam;
  away: V1SoccerTeam;
  events?: { event?: V1SoccerEvent | V1SoccerEvent[] };
  ht?: { score: string }; // "[0-2]"
  ft?: { score: string }; // "[0-4]"
};
type V1SoccerLeague = {
  id: string;
  name: string;
  country: string;
  cup: string;
  sub_id: string;
  match: V1SoccerMatch | V1SoccerMatch[];
};
type V1SoccerLivescoresRaw = {
  livescore?: {
    updated?: string;
    sport?: string;
    league?: V1SoccerLeague | V1SoccerLeague[];
  };
};

// Parse "[0-2]" or "[0 - 2]" → { home: 0, away: 2 }
function parseScoreStr(
  s: string | undefined,
): { home: number; away: number } | null {
  if (!s) return null;
  const m = s.replace(/[\[\] ]/g, "").split("-");
  if (m.length < 2) return null;
  const h = parseInt(m[0] ?? "");
  const a = parseInt(m[1] ?? "");
  return isNaN(h) || isNaN(a) ? null : { home: h, away: a };
}

let footballV1LiveCache: object[] | null = null;
let footballV1LiveFetchedAt = 0;
const FOOTBALL_V1_LIVE_TTL = 5_000; // 5s — SportsAPI Pro updates every 1-3s

router.get("/football-livescores", async (_req: Request, res: Response) => {
  res.json({ leagues: footballV1LiveCache ?? [] });
});

// ─── Football Daily Results (v1) ──────────────────────────────────────────────
// v1/soccer/daily/{d-N} — identical structure to v1/soccer/livescores.
// Offset format: "d-1" = yesterday, "d-7" = 7 days ago (accepts integer 1–7).
// Distinct from football-results which uses v2/soccer/matches/daily?offset=-1.
// Cache: 5 min for d-1 (may still be updating), 30 min for d-2+ (fully settled).

const footballDailyCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();

router.get("/football-daily/:offset", async (req: Request, res: Response) => {
  const raw = String(req.params["offset"]);
  const n = parseInt(raw);
  if (isNaN(n) || n < 0 || n > 7) {
    res.status(400).json({ error: "Offset inválido (0–7)" });
    return;
  }
  const key = `d-${n}`;
  const cached = footballDailyCache.get(key);
  res.json({ leagues: cached?.data ?? [] });
});

// ─── Football Upcoming Schedule by country/region ─────────────────────────────
// v1/soccer/upcoming-schedule/{country} — fixtures for a country or region.
// New root key: "fixtures" (not "livescore"). No cup/goals/agg/events/ht/ft.
// New field: tv_stations.tv[] — broadcast channel names (single obj or array).
// Match status = kickoff time string ("19:45"), not a result code.

type V1UpcomingTV = { name: string };
type V1UpcomingMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2: string;
  static_id: string;
  status: string;
  date: string;
  time: string;
  venue: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  tv_stations?: { tv?: V1UpcomingTV | V1UpcomingTV[] };
};
type V1UpcomingLeague = {
  id: string;
  name: string;
  country: string;
  sub_id: string;
  // no "cup" field in upcoming-schedule
  match: V1UpcomingMatch | V1UpcomingMatch[];
};
type V1UpcomingScheduleRaw = {
  fixtures?: {
    updated?: string;
    sport?: string;
    country?: string;
    league?: V1UpcomingLeague | V1UpcomingLeague[];
  };
};

const footballUpcomingCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();
const FOOTBALL_UPCOMING_TTL = 30 * 60 * 1000; // 30 min — fixtures rarely change

router.get(
  "/football-upcoming/:country",
  async (req: Request, res: Response) => {
    const country = String(req.params["country"])
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!country) {
      res.status(400).json({ error: "País inválido" });
      return;
    }
    const cached = footballUpcomingCache.get(country);
    res.json({ leagues: cached?.data ?? [] });
  },
);

// ─── Football Extended Schedule by country/region ─────────────────────────────
// v1/soccer/extended-schedule/{country} — richest fixture endpoint.
// Unique characteristics vs all other v1 soccer endpoints:
//   • root: "extended_fixtures" (not "livescore" or "fixtures")
//   • league has "season" field instead of "cup"/"country"
//   • matches grouped under week[].match[] (not flat match[] on league)
//   • home/away: score/ft_score/et_score/pen_score (empty strings when upcoming)
//   • per-match: attendance, venue_city, venue_id, coaches (home+away), referee
//   • lineups/substitutions/goals are null when upcoming, populated after kickoff

type V1ExtCoach = { id: string; name: string };
type V1ExtTeamScore = {
  id: string;
  name: string;
  score: string;
  ft_score: string;
  et_score: string;
  pen_score: string;
};
type V1ExtMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2: string;
  static_id: string;
  status: string;
  date: string;
  time: string;
  venue: string;
  venue_city: string;
  venue_id: string;
  attendance: string;
  home: V1ExtTeamScore;
  away: V1ExtTeamScore;
  halftime?: { score: string };
  lineups: null | unknown;
  substitutions: null | unknown;
  goals: null | unknown;
  coaches?: {
    home?: { coach?: V1ExtCoach };
    away?: { coach?: V1ExtCoach };
  };
  referee?: { id: string; name: string };
};
type V1ExtWeek = { number: string; match: V1ExtMatch | V1ExtMatch[] };
type V1ExtLeague = {
  id: string;
  name: string;
  season: string;
  sub_id: string;
  // no "country" or "cup" at league level
  week: V1ExtWeek | V1ExtWeek[];
};
type V1ExtScheduleRaw = {
  extended_fixtures?: {
    updated?: string;
    sport?: string;
    country?: string;
    league?: V1ExtLeague | V1ExtLeague[];
  };
};

const footballExtCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();
const FOOTBALL_EXT_TTL = 30 * 60 * 1000; // 30 min

// Parse score string — empty string → null, otherwise number
function parseExtScore(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

router.get(
  "/football-extended-schedule/:country",
  async (req: Request, res: Response) => {
    const country = String(req.params["country"])
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!country) {
      res.status(400).json({ error: "País inválido" });
      return;
    }
    const cached = footballExtCache.get(country);
    res.json({ leagues: cached?.data ?? [] });
  },
);

// ─── Football Results by country/region ───────────────────────────────────────
// v1/soccer/results/{country} — same week[] structure as extended-schedule but
// lineups/goals/substitutions are populated (not null) for finished matches.
// Root: "results" (4th distinct root key in football v1 endpoints).
// halftime.score: "0 - 0" (spaces, no brackets) — parseScoreStr handles both formats.
// goals.goal / lineups.*.player / substitutions.*.substitution: single obj or array.

type V1ResultsGoal = {
  minute: string;
  player: string;
  playerid: string;
  assist: string;
  score: string;
  team: string;
};
type V1ResultsLineupPlayer = {
  id: string;
  name: string;
  number: string;
  booking: string;
};
type V1ResultsSubstitution = {
  minute: string;
  player_in_id: string;
  player_in_name: string;
  player_in_number: string;
  player_in_booking: string;
  player_out_id: string;
  player_out_name: string;
};
type V1ResultsMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2: string;
  static_id: string;
  status: string;
  date: string;
  time: string;
  venue: string;
  venue_city: string;
  venue_id: string;
  attendance: string;
  home: V1ExtTeamScore;
  away: V1ExtTeamScore;
  halftime?: { score: string };
  goals?: null | { goal?: V1ResultsGoal | V1ResultsGoal[] };
  lineups?: null | {
    home?: { player?: V1ResultsLineupPlayer | V1ResultsLineupPlayer[] };
    away?: { player?: V1ResultsLineupPlayer | V1ResultsLineupPlayer[] };
  };
  substitutions?: null | {
    home?: { substitution?: V1ResultsSubstitution | V1ResultsSubstitution[] };
    away?: { substitution?: V1ResultsSubstitution | V1ResultsSubstitution[] };
  };
  coaches?: { home?: { coach?: V1ExtCoach }; away?: { coach?: V1ExtCoach } };
  referee?: { id: string; name: string };
};
type V1ResultsWeek = {
  number: string;
  match: V1ResultsMatch | V1ResultsMatch[];
};
type V1ResultsLeague = {
  id: string;
  name: string;
  season: string;
  sub_id: string;
  week: V1ResultsWeek | V1ResultsWeek[];
};
type V1ResultsRaw = {
  results?: {
    updated?: string;
    sport?: string;
    country?: string;
    league?: V1ResultsLeague | V1ResultsLeague[];
  };
};

const footballResultsCountryCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();
const FOOTBALL_RESULTS_COUNTRY_TTL = 30 * 60 * 1000; // 30 min — historical results

function toArr<T>(v: T | T[] | null | undefined): T[] {
  return !v ? [] : Array.isArray(v) ? v : [v];
}

router.get(
  "/football-results-country/:country",
  async (req: Request, res: Response) => {
    const country = String(req.params["country"])
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!country) {
      res.status(400).json({ error: "País inválido" });
      return;
    }
    const cached = footballResultsCountryCache.get(country);
    res.json({ leagues: cached?.data ?? [] });
  },
);

// ─── Football Live Match Stats / Commentary ────────────────────────────────────
// v1/soccer/live-match-stats/{league_slug} — richest single-match detail endpoint.
// Root: "commentaries" (5th distinct root key in football v1 endpoints).
// UNIQUE: league and match are single objects (never arrays).
// League slug is a string like "afc_champleague", "epl", not a numeric ID.
// home/away: goals + ht_score + ft_score directly on team (not nested ht/ft objects).
// matchinfo: stadium, attendance, addedtime, referee (includes nationality string).
// summary.home/away: goals/yellowcards/redcards/var — each .player: single or array.
// Boolean-like strings: "True"/"False" for owngoal/penalty/var_cancelled/var_decision.

type V1LiveStatsSummaryGoal = {
  id: string;
  name: string;
  minute: string;
  extra_min: string;
  assist_id: string;
  assist_name: string;
  owngoal: string;
  penalty: string;
  penalty_missed: string;
  var_cancelled: string;
};
type V1LiveStatsCard = {
  id: string;
  name: string;
  minute: string;
  extra_min: string;
  comment: string;
};
type V1LiveStatsVar = {
  id: string;
  name: string;
  minute: string;
  extra_min: string;
  event_type: string;
  ref_decision: string;
  var_decision: string;
};
type V1LiveStatsSummaryTeam = {
  goals?: null | { player?: V1LiveStatsSummaryGoal | V1LiveStatsSummaryGoal[] };
  yellowcards?: null | { player?: V1LiveStatsCard | V1LiveStatsCard[] };
  redcards?: null | { player?: V1LiveStatsCard | V1LiveStatsCard[] };
  var?: null | { player?: V1LiveStatsVar | V1LiveStatsVar[] };
};
type V1LiveStatsTeam = {
  id: string;
  name: string;
  goals: string;
  ft_score: string;
  ht_score: string;
  et_score: string;
  pen_score: string;
};
type V1LiveStatsMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2: string;
  static_id: string;
  status: string;
  date: string;
  time: string;
  timer: string;
  home: V1LiveStatsTeam;
  away: V1LiveStatsTeam;
  matchinfo?: {
    stadium?: { name?: string };
    attendance?: { name?: string };
    time?: {
      name?: string;
      addedtime_period1?: string;
      addedtime_period2?: string;
    };
    referee?: { name?: string };
  };
  summary?: {
    home?: V1LiveStatsSummaryTeam;
    away?: V1LiveStatsSummaryTeam;
  };
};
type V1LiveStatsLeague = {
  id: string;
  name: string;
  country: string;
  sub_id: string;
  match: V1LiveStatsMatch; // always single object
};
type V1LiveStatsRaw = {
  commentaries?: {
    updated?: string;
    sport?: string;
    country?: string;
    league?: V1LiveStatsLeague; // always single object
  };
};

function parseBool(s: string | undefined): boolean {
  return s === "True";
}

function mapSummaryGoals(raw: V1LiveStatsSummaryTeam["goals"]): object[] {
  return toArr(raw?.player).map((g) => ({
    id: g.id,
    name: g.name,
    minute: g.minute,
    extraMin: g.extra_min || null,
    assistId: g.assist_id || null,
    assistName: g.assist_name || null,
    ownGoal: parseBool(g.owngoal),
    penalty: parseBool(g.penalty),
    penaltyMissed: parseBool(g.penalty_missed),
    varCancelled: parseBool(g.var_cancelled),
  }));
}
function mapCards(raw: V1LiveStatsSummaryTeam["yellowcards"]): object[] {
  return toArr(raw?.player).map((c) => ({
    id: c.id,
    name: c.name,
    minute: c.minute,
    extraMin: c.extra_min || null,
    comment: c.comment || null,
  }));
}
function mapVar(raw: V1LiveStatsSummaryTeam["var"]): object[] {
  return toArr(raw?.player).map((v) => ({
    id: v.id,
    name: v.name,
    minute: v.minute,
    extraMin: v.extra_min || null,
    eventType: v.event_type,
    refDecision: v.ref_decision,
    varDecision: parseBool(v.var_decision),
  }));
}

const footballLiveStatsCache = new Map<
  string,
  { data: object; fetchedAt: number }
>();
const FOOTBALL_LIVE_STATS_TTL = 5_000; // 5s — SportsAPI Pro updates every 1-3s

router.get(
  "/football-live-match-stats/:leagueSlug",
  async (req: Request, res: Response) => {
    const slug = String(req.params["leagueSlug"])
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    if (!slug) {
      res.status(400).json({ error: "Slug inválido" });
      return;
    }
    const cached = footballLiveStatsCache.get(slug);
    if (cached) {
      res.json(cached.data);
      return;
    }
    res.status(404).json({ error: "Dados ao vivo indisponíveis" });
  },
);

// ─── Football Standings by country/region (v1) ────────────────────────────────
// v1/soccer/standings/{country} — multiple leagues per country, each with team[].
// Root: "standings" (6th distinct root key in football v1 endpoints).
// Distinct from /football-standings/:id which uses v2/soccer/leagues/{id}/standings.
// New fields: is_current ("True"/"False"), status ("same"/"up"/"down"),
//   overall/home/away splits, totals.goal_difference/points, special.name (zone label).
// home/away have an undocumented "p" field (ignored in output).

type V1StandingsRecord = {
  draw: string;
  goals_allowed: string;
  goals_scored: string;
  lose: string;
  played: string;
  win: string;
  p?: string;
};
type V1StandingsTeam = {
  id: string;
  name: string;
  position: string;
  recent_form: string;
  status: string;
  overall: V1StandingsRecord;
  home: V1StandingsRecord;
  away: V1StandingsRecord;
  totals: { goal_difference: string; points: string };
  special?: { name?: string };
};
type V1StandingsLeague = {
  id: string;
  name: string;
  country: string;
  season: string;
  sub_id: string;
  is_current: string; // "True"/"False"
  team: V1StandingsTeam | V1StandingsTeam[];
};
type V1StandingsRaw = {
  standings?: {
    country?: string;
    updated?: string;
    sport?: string;
    league?: V1StandingsLeague | V1StandingsLeague[];
  };
};

function mapRecord(r: V1StandingsRecord) {
  return {
    played: parseInt(r.played) || 0,
    win: parseInt(r.win) || 0,
    draw: parseInt(r.draw) || 0,
    lose: parseInt(r.lose) || 0,
    goalsScored: parseInt(r.goals_scored) || 0,
    goalsAllowed: parseInt(r.goals_allowed) || 0,
  };
}

const footballStandingsCountryCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();
const FOOTBALL_STANDINGS_COUNTRY_TTL = 30 * 60 * 1000; // 30 min

router.get(
  "/football-standings-country/:country",
  async (req: Request, res: Response) => {
    const country = String(req.params["country"])
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!country) {
      res.status(400).json({ error: "País inválido" });
      return;
    }
    const cached = footballStandingsCountryCache.get(country);
    res.json({ leagues: cached?.data ?? [] });
  },
);

// ─── Football Scoring Leaders by country ──────────────────────────────────────
// v1/soccer/scoring-leaders/{country} — top scorers per league per country.
// Root: "scorers" (7th distinct root key in football v1 endpoints).
// League has player[] directly (not match[]/team[]). All numeric fields are strings.
// Fields: pos (rank), goals, penalty_goals, team name + team_id.

type V1ScorerPlayer = {
  id: string;
  name: string;
  pos: string;
  goals: string;
  penalty_goals: string;
  team: string;
  team_id: string;
};
type V1ScorerLeague = {
  id: string;
  name: string;
  country: string;
  sub_id: string;
  player: V1ScorerPlayer | V1ScorerPlayer[];
};
type V1ScorersRaw = {
  scorers?: {
    updated?: string;
    sport?: string;
    country?: string;
    league?: V1ScorerLeague | V1ScorerLeague[];
  };
};

const footballScorersCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();
const FOOTBALL_SCORERS_TTL = 30 * 60 * 1000; // 30 min — changes at most daily

router.get(
  "/football-scoring-leaders/:country",
  async (req: Request, res: Response) => {
    const country = String(req.params["country"])
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!country) {
      res.status(400).json({ error: "País inválido" });
      return;
    }
    const cached = footballScorersCache.get(country);
    res.json({ leagues: cached?.data ?? [] });
  },
);

// ─── Football Injuries/Suspensions (v1) ───────────────────────────────────────
// v1/soccer/injuries — global (no country param), same root "injuries_suspensions"
// and same sidelined structure as v2/soccer/injuries-suspensions (used by
// /football-injuries). Differences in match object:
//   v2: main_id (not id), no goals/status/alternate_id/static_id
//   v1: id + alternate_id + alternate_id_2 + static_id + goals:"?" + status (time)
// Reuses FootballInjuryPlayerRaw, FootballInjurySidelinedRaw, parseInjuryPlayers,
// parseInjuryTeam helpers already defined above.

type V1InjuryTeamRaw = {
  id: string;
  name: string;
  goals: string; // "?" when upcoming
  sidelined?: FootballInjurySidelinedRaw;
};
type V1InjuryMatchRaw = {
  id: string;
  alternate_id: string;
  alternate_id_2: string;
  static_id: string;
  date: string;
  time: string;
  status: string; // kickoff time e.g. "06:00"
  home: V1InjuryTeamRaw;
  away: V1InjuryTeamRaw;
};
type V1InjuryLeagueRaw = {
  id: string;
  name: string;
  sub_id: string;
  // no "country" field at league level in v1
  match: V1InjuryMatchRaw | V1InjuryMatchRaw[];
};
type V1InjuriesRaw = {
  injuries_suspensions?: {
    updated?: string;
    sport?: string;
    league?: V1InjuryLeagueRaw | V1InjuryLeagueRaw[];
  };
};

let footballInjuriesV1Cache: object[] | null = null;
let footballInjuriesV1FetchedAt = 0;
const FOOTBALL_INJURIES_V1_TTL = 15 * 60 * 1000; // 15 min — same as v2

router.get("/football-injuries-v1", (_req: Request, res: Response) => {
  res.json({ leagues: footballInjuriesV1Cache ?? [] });
});

// ─── Football Odds by country (v1) — public multi-market route ────────────────
// v1/soccer/odds/{country} — exposes all 5 market types with proper averaging.
// Already used internally by getOddsMap() for live card bet slip odds.
// This public route adds per-match market exposure: 1x2, Asian Handicap,
// Over/Under, Correct Score, Both Teams To Score — averaged with 2.5% margin.
// Root double-wrapper handled: example?.odds_feed ?? odds_feed.
// team.alternate_id now included (team-level ID, distinct from match alternate_id).

const footballOddsCountryCache = new Map<
  string,
  { data: object[]; fetchedAt: number }
>();
const FOOTBALL_ODDS_COUNTRY_TTL = 10 * 60 * 1000; // 10 min

function avgOddsByName(bks: OddsBookmaker[], name: string): number {
  const vals: number[] = [];
  for (const bk of bks) {
    if (bk.stop === "True") continue;
    const odds = bk.odd ? (Array.isArray(bk.odd) ? bk.odd : [bk.odd]) : [];
    const o = odds.find((o) => o.name === name);
    const v = parseFloat(o?.value ?? "0");
    if (v > 1) vals.push(v);
  }
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
}

function processOddsType(t: OddsType): object | null {
  const bks: OddsBookmaker[] = Array.isArray(t.bookmaker)
    ? t.bookmaker
    : [t.bookmaker];
  const activeBks = bks.filter((b) => b.stop !== "True");
  if (!activeBks.length) return null;

  switch (t.name) {
    case "1x2":
    case "3Way Result": {
      const h = avgOddsByName(activeBks, "Home");
      const d = avgOddsByName(activeBks, "Draw");
      const a = avgOddsByName(activeBks, "Away");
      if (!h || !d || !a) return null;
      return { market: "1x2", homeOdds: h, drawOdds: d, awayOdds: a };
    }
    case "Over/Under": {
      // Use main line (ismain:"True") averaged across bookmakers
      const allLines = activeBks.flatMap((bk) => {
        const tots = bk.total
          ? Array.isArray(bk.total)
            ? bk.total
            : [bk.total]
          : [];
        return tots.filter((tot) => tot.ismain === "True" || tots.length === 1);
      });
      if (!allLines.length) return null;
      const mainLine = allLines[0]?.name ?? "";
      const overVals: number[] = [],
        underVals: number[] = [];
      for (const line of allLines) {
        const odds = line.odd
          ? Array.isArray(line.odd)
            ? line.odd
            : [line.odd]
          : [];
        const ov = parseFloat(
          odds.find((o) => o.name === "Over")?.value ?? "0",
        );
        const uv = parseFloat(
          odds.find((o) => o.name === "Under")?.value ?? "0",
        );
        if (ov > 1) overVals.push(ov);
        if (uv > 1) underVals.push(uv);
      }
      const avg = (arr: number[]) =>
        arr.length
          ? Math.max(
              1.01,
              Math.round(
                (arr.reduce((a, b) => a + b, 0) / arr.length) * 0.975 * 100,
              ) / 100,
            )
          : 0;
      const over = avg(overVals);
      const under = avg(underVals);
      if (!over || !under) return null;
      return {
        market: "Over/Under",
        line: mainLine,
        overOdds: over,
        underOdds: under,
      };
    }
    case "Asian Handicap": {
      const allLines = activeBks.flatMap((bk) => {
        const hcps = bk.handicap
          ? Array.isArray(bk.handicap)
            ? bk.handicap
            : [bk.handicap]
          : [];
        return hcps.filter((h) => h.ismain === "True" || hcps.length === 1);
      });
      if (!allLines.length) return null;
      const mainLine = allLines[0]?.name ?? "";
      const homeVals: number[] = [],
        awayVals: number[] = [];
      for (const line of allLines) {
        const odds = line.odd
          ? Array.isArray(line.odd)
            ? line.odd
            : [line.odd]
          : [];
        const hv = parseFloat(
          odds.find((o) => o.name === "Home")?.value ?? "0",
        );
        const av = parseFloat(
          odds.find((o) => o.name === "Away")?.value ?? "0",
        );
        if (hv > 1) homeVals.push(hv);
        if (av > 1) awayVals.push(av);
      }
      const avg = (arr: number[]) =>
        arr.length
          ? Math.max(
              1.01,
              Math.round(
                (arr.reduce((a, b) => a + b, 0) / arr.length) * 0.975 * 100,
              ) / 100,
            )
          : 0;
      const h = avg(homeVals);
      const a = avg(awayVals);
      if (!h || !a) return null;
      return {
        market: "Asian Handicap",
        line: mainLine,
        homeOdds: h,
        awayOdds: a,
      };
    }
    case "Both Teams To Score": {
      const yes = avgOddsByName(activeBks, "Yes");
      const no = avgOddsByName(activeBks, "No");
      if (!yes || !no) return null;
      return { market: "Both Teams To Score", yesOdds: yes, noOdds: no };
    }
    case "Correct Score": {
      // Collect unique score names and average across bookmakers
      const scoreMap = new Map<string, number[]>();
      for (const bk of activeBks) {
        const odds = bk.odd ? (Array.isArray(bk.odd) ? bk.odd : [bk.odd]) : [];
        for (const o of odds) {
          const v = parseFloat(o.value ?? "0");
          if (v > 1) {
            const arr = scoreMap.get(o.name) ?? [];
            arr.push(v);
            scoreMap.set(o.name, arr);
          }
        }
      }
      const scores = Array.from(scoreMap.entries())
        .map(([score, vals]) => ({
          score,
          odds: Math.max(
            1.01,
            Math.round(
              (vals.reduce((a, b) => a + b, 0) / vals.length) * 0.975 * 100,
            ) / 100,
          ),
        }))
        .sort((a, b) => a.odds - b.odds);
      if (!scores.length) return null;
      return { market: "Correct Score", scores };
    }
    default:
      return null;
  }
}

router.get(
  "/football-odds-country/:country",
  async (req: Request, res: Response) => {
    const country = String(req.params["country"])
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!country) {
      res.status(400).json({ error: "País inválido" });
      return;
    }
    const cached = footballOddsCountryCache.get(country);
    res.json({ leagues: cached?.data ?? [] });
  },
);

// ─── Background Market Drift Engine ─────────────────────────────────────────
// Runs every 1–2s independently of Statpal API polls so the frontend sees smooth
// per-tier odds movement even between data-fetch cycles.
// Tier 1 markets (Over/Under, Handicap) drift on this cadence.
// Tier 2 markets (HT/FT, Correct Score) drift on this cadence at a much smaller rate.
// Tier 3 markets (Corners, Cards) drift on this cadence at a very gentle rate.
const LIVE_BROADCAST_INTERVAL_MS = Math.min(
  2000,
  Math.max(1000, CONFIG.LIVE_UPDATE_INTERVAL),
);
setInterval(() => {
  const now = Date.now();
  let anyChange = false;
  for (const [id, state] of liveMatchState.entries()) {
    if (state.sport !== "football") continue;
    // PulseScore-sourced matches already get their entire markets object
    // rebuilt every ~1s by buildFootballLiveFromPulseScore itself — real
    // bet365 odds merged over the synthetic model wherever bet365 actually
    // prices a market (see extractFootballOverride). This drift engine
    // predates that integration and was never taught to leave those matches
    // alone: running it here on the same shared liveMatchState entries
    // overwrote real prices with a fresh synthetic recalculation on this
    // loop's own independent timer, uncoordinated with PulseScore's tick —
    // real odds would flicker to synthetic ones and back essentially at
    // random. PulseScore matches don't need synthetic drift at all; they
    // have an actual live feed.
    if (id.startsWith("pulsescore-football-")) continue;
    const skip = ["HT", "FT", "AET", "Em Breve", "Fin.", "Fin. (AET)"];
    if (skip.includes(state.status)) continue;
    if (state.marketSuspension) {
      const coreKeys = ["result", "totalGoals", "handicap"];
      const allCoresSuspended = coreKeys.every((k) => {
        const ts = state.marketSuspension?.[k];
        return ts !== undefined && ts > now;
      });
      if (allCoresSuspended) continue;
    }
    const updated = applyTieredMarketDrift(state, now);
    // applyTieredMarketDrift always returns a new object (due to _driftPhase /
    // _marketNextUpdate advancing), so reference equality is never a useful
    // change detector here. Instead compare the value-carrying fields that
    // clients actually care about.
    //
    // When a market is NOT due for update, applyTieredMarketDrift returns the
    // SAME reference for that field (e.g. `updated.odds === state.odds`), so
    // reference equality on the individual fields correctly tells us whether
    // anything meaningful actually changed.
    const oddsChanged = updated.odds !== state.odds;
    const marketsChanged =
      updated.markets.totalGoals !== state.markets.totalGoals ||
      updated.markets.handicap !== state.markets.handicap ||
      updated.markets.doubleChance !== state.markets.doubleChance ||
      updated.markets.drawNoBet !== state.markets.drawNoBet ||
      updated.markets.bothTeamsScore !== state.markets.bothTeamsScore ||
      updated.markets.halfTime !== state.markets.halfTime ||
      updated.markets.htft !== state.markets.htft ||
      updated.markets.correctScore !== state.markets.correctScore ||
      updated.markets.htCorrectScore !== state.markets.htCorrectScore ||
      updated.markets.h2CorrectScore !== state.markets.h2CorrectScore ||
      updated.markets.corners !== state.markets.corners ||
      updated.markets.cards !== state.markets.cards ||
      updated.markets.teamGoals !== state.markets.teamGoals;

    // Always advance state so _driftPhase / _marketNextUpdate are current
    liveMatchState.set(id, updated);

    if (oddsChanged || marketsChanged) {
      broadcastMatchDelta(id, {
        odds: updated.odds,
        markets: updated.markets,
        _marketNextUpdate: updated._marketNextUpdate,
      });
      anyChange = true;
    }
  }
  // Push a full snapshot when any value actually changed so that clients
  // which missed the delta (e.g. connected mid-cycle) see fresh data.
  if (anyChange) {
    broadcastLive().catch(() => {
      /* ignore */
    });
  }
}, LIVE_BROADCAST_INTERVAL_MS);

// ─── Football Player Markets (per-match, filtered to home + away team only) ───
function sanitizeProviderMatchId(matchId: string | undefined | null): string {
  return String(matchId ?? "")
    .trim()
    .replace(/^[a-z]+-v\d+-/, "");
}

function v2SportBase(sport: string): string | null {
  switch (sport) {
    case "football":
      return SAPI_V2_FOOTBALL;
    case "basketball":
      return SAPI_V2_BASKETBALL;
    case "hockey":
      return SAPI_V2_HOCKEY;
    case "icehockey":
      return SAPI_V2_HOCKEY;
    case "tennis":
      return SAPI_V2_TENNIS;
    case "baseball":
      return SAPI_V2_BASEBALL;
    case "basebol":
      return SAPI_V2_BASEBALL;
    default:
      return null;
  }
}

type AllOddsMarket = {
  name: string;
  group: string;
  choices: Array<{ name: string; label: string; odds: number }>;
};

const ALL_MARKETS_TTL = 30_000;
const allMarketsV2Cache = new Map<
  string,
  { markets: AllOddsMarket[]; fetchedAt: number }
>();

function translateMarketNamePT(name: string): string {
  return name;
}
function translateMarketGroupPT(group: string): string {
  return group;
}
function translateChoiceLabelPT(label: string): string {
  return label;
}

router.get("/v2-match-odds", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "football");
  const matchId = sanitizeProviderMatchId(String(req.query["matchId"] ?? ""));
  if (!matchId) {
    res.json({ markets: [] });
    return;
  }
  const base = v2SportBase(sport);
  if (!base) {
    res.json({ markets: [] });
    return;
  }

  const cacheKey = `allMkts:${sport}:${matchId}`;
  const cached = allMarketsV2Cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ALL_MARKETS_TTL) {
    res.json({ markets: cached.markets });
    return;
  }

  try {
    const resp = await fetch(`${base}/match/${matchId}/odds/all`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) {
      res.json({ markets: [] });
      return;
    }
    const data = (await resp.json()) as {
      data?: {
        markets?: Array<{
          marketName?: string;
          marketGroup?: string;
          choices?: Array<{ name?: string; fractionalValue?: string }>;
        }>;
      };
    };
    const rawMarkets = data.data?.markets ?? [];
    const markets: AllOddsMarket[] = rawMarkets
      .filter((m) => (m.choices?.length ?? 0) > 0)
      .map((m) => ({
        name: translateMarketNamePT(m.marketName ?? ""),
        group: translateMarketGroupPT(m.marketGroup ?? ""),
        choices: (m.choices ?? [])
          .map((c) => ({
            name: c.name ?? "",
            label: translateChoiceLabelPT(c.name ?? ""),
            odds: fractionalToDecimal(c.fractionalValue ?? ""),
          }))
          .filter((c) => c.odds >= 1.01),
      }))
      .filter((m) => m.choices.length > 0);

    allMarketsV2Cache.set(cacheKey, { markets, fetchedAt: Date.now() });
    res.json({ markets });
  } catch {
    res.json({ markets: [] });
  }
});

// ─── V2 Lineups Proxy ────────────────────────────────────────────────────────

interface LineupsV2Entry {
  data: LineupsResponseV2;
  fetchedAt: number;
}
interface LineupsResponseV2 {
  confirmed: boolean;
  home: {
    formation?: string;
    starters: LineupPlayerV2[];
    bench: LineupPlayerV2[];
  };
  away: {
    formation?: string;
    starters: LineupPlayerV2[];
    bench: LineupPlayerV2[];
  };
}
interface LineupPlayerV2 {
  name: string;
  shortName?: string;
  position: string;
  number: string;
  rating?: number;
}

const lineupsV2Cache = new Map<string, LineupsV2Entry>();

const POSITION_PT: Record<string, string> = {
  G: "GR",
  GK: "GR",
  D: "DEF",
  DF: "DEF",
  M: "MEI",
  MF: "MEI",
  F: "AV",
  FW: "AV",
};

type RawLineupsPlayer = {
  avgRating?: number;
  substitute?: boolean;
  player?: {
    name?: string;
    shortName?: string;
    position?: string;
    jerseyNumber?: string;
  };
};

router.get("/v2-lineups", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  const emptyResp: LineupsResponseV2 = {
    confirmed: false,
    home: { starters: [], bench: [] },
    away: { starters: [], bench: [] },
  };
  if (!matchId) {
    res.json(emptyResp);
    return;
  }
  const base = v2SportBase(sport);
  if (!base) {
    res.json(emptyResp);
    return;
  }

  const cacheKey = `lineups:${sport}:${matchId}`;
  const cached = lineupsV2Cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ALL_MARKETS_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const resp = await fetch(`${base}/match/${matchId}/lineups`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) {
      res.json(emptyResp);
      return;
    }
    const data = (await resp.json()) as {
      data?: {
        confirmed?: boolean;
        home?: { formation?: string; players?: RawLineupsPlayer[] };
        away?: { formation?: string; players?: RawLineupsPlayer[] };
      };
    };

    const toPlayers = (
      arr: RawLineupsPlayer[] | undefined,
      isStarters: boolean,
    ): LineupPlayerV2[] =>
      (arr ?? [])
        .filter(
          (p) =>
            p.player?.name && (isStarters ? !p.substitute : !!p.substitute),
        )
        .map((p) => ({
          name: p.player!.name!,
          shortName: p.player!.shortName,
          position:
            POSITION_PT[p.player!.position ?? ""] ?? p.player!.position ?? "",
          number: p.player!.jerseyNumber ?? "",
          rating: p.avgRating,
        }));

    const result: LineupsResponseV2 = {
      confirmed: data.data?.confirmed ?? false,
      home: {
        formation: data.data?.home?.formation,
        starters: toPlayers(data.data?.home?.players, true),
        bench: toPlayers(data.data?.home?.players, false),
      },
      away: {
        formation: data.data?.away?.formation,
        starters: toPlayers(data.data?.away?.players, true),
        bench: toPlayers(data.data?.away?.players, false),
      },
    };

    lineupsV2Cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    res.json(result);
  } catch {
    res.json(emptyResp);
  }
});

// ─── V2 Incidents/Statistics Proxy ───────────────────────────────────────────

const v2IncidentsCache = new Map<
  string,
  { data: unknown; fetchedAt: number }
>();
const V2_INCIDENTS_TTL = 2500;

type BasketballScoringEvent = {
  seq: number;
  team: "home" | "away";
  points: number;
  isThree: boolean;
};
type BasketballIncidentSummarySnapshot = {
  scoringEvents: BasketballScoringEvent[];
  fetchedAt: number;
};
const basketballIncidentSummaryCache = new Map<
  number,
  BasketballIncidentSummarySnapshot
>();
const basketballIncidentSummaryInFlight = new Map<
  number,
  Promise<BasketballIncidentSummarySnapshot | null>
>();
const BASKETBALL_INCIDENT_SUMMARY_TTL = 2500;

function extractV2IncidentArray(payload: unknown): unknown[] {
  const root = (
    payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>)["data"] ?? payload)
      : payload
  ) as Record<string, unknown> | unknown;
  const arr =
    (root && typeof root === "object"
      ? (root as Record<string, unknown>)["incidents"]
      : undefined) ??
    (root && typeof root === "object"
      ? (root as Record<string, unknown>)["events"]
      : undefined) ??
    (root && typeof root === "object"
      ? (root as Record<string, unknown>)["timeline"]
      : undefined) ??
    (root && typeof root === "object"
      ? (
          (root as Record<string, unknown>)["data"] as
            | Record<string, unknown>
            | undefined
        )?.["incidents"]
      : undefined);
  return Array.isArray(arr) ? arr : [];
}

function parseBasketballIncidentSummary(
  payload: unknown,
): BasketballIncidentSummarySnapshot {
  const incidents = extractV2IncidentArray(payload);
  const toNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const toText = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return String(v);
  };
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  let prevHome = 0;
  let prevAway = 0;
  const scoringEvents: BasketballScoringEvent[] = [];

  for (let i = 0; i < incidents.length; i++) {
    const e = incidents[i] as Record<string, unknown>;
    const title = toText(
      e["type"] ?? e["incidentType"] ?? e["name"] ?? e["title"],
    );
    const detail = toText(
      e["text"] ??
        e["description"] ??
        e["reason"] ??
        e["playerName"] ??
        (e["player"] as Record<string, unknown> | undefined)?.["name"],
    );
    const sig = normalize(`${title} ${detail}`);

    const homeScore =
      toNum(
        (e["homeScore"] as Record<string, unknown> | undefined)?.["current"],
      ) ??
      toNum(e["homeScore"]) ??
      toNum((e["score"] as Record<string, unknown> | undefined)?.["home"]) ??
      prevHome;
    const awayScore =
      toNum(
        (e["awayScore"] as Record<string, unknown> | undefined)?.["current"],
      ) ??
      toNum(e["awayScore"]) ??
      toNum((e["score"] as Record<string, unknown> | undefined)?.["away"]) ??
      prevAway;

    const dHome = Math.max(0, homeScore - prevHome);
    const dAway = Math.max(0, awayScore - prevAway);

    const hasBasketKeyword =
      sig.includes("basket") ||
      sig.includes("free throw") ||
      sig.includes("three point") ||
      sig.includes("3 point") ||
      sig.includes("3pt") ||
      sig.includes("jumper") ||
      sig.includes("layup") ||
      sig.includes("dunk");

    const isScoreDelta = (dHome > 0 || dAway > 0) && dHome + dAway <= 4;
    if (isScoreDelta || hasBasketKeyword) {
      const team: "home" | "away" | null =
        dHome > 0 && dAway === 0
          ? "home"
          : dAway > 0 && dHome === 0
            ? "away"
            : e["isHome"] === true ||
                e["home"] === true ||
                e["team"] === "home" ||
                e["side"] === "home"
              ? "home"
              : e["isAway"] === true ||
                  e["away"] === true ||
                  e["team"] === "away" ||
                  e["side"] === "away"
                ? "away"
                : null;
      if (team) {
        const inferredPoints = team === "home" ? dHome : dAway;
        const isThree =
          /\bthree\b|\b3 point\b|\b3pt\b|\b3-pointer\b|\b3 pointer\b/.test(sig);
        const points =
          inferredPoints > 0
            ? inferredPoints
            : isThree
              ? 3
              : sig.includes("free throw")
                ? 1
                : 2;
        scoringEvents.push({
          seq: scoringEvents.length,
          team,
          points,
          isThree: isThree || points === 3,
        });
      }
    }

    prevHome = homeScore;
    prevAway = awayScore;
  }

  return { scoringEvents, fetchedAt: Date.now() };
}

async function fetchV2IncidentsRaw(
  sport: string,
  matchId: string,
): Promise<unknown> {
  if (!matchId) return {};
  const base = v2SportBase(sport);
  if (!base) return {};
  const cacheKey = `v2inc:${sport}:${matchId}`;
  const cached = v2IncidentsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_INCIDENTS_TTL)
    return cached.data;
  const resp = await fetch(`${base}/match/${matchId}/incidents`, {
    signal: AbortSignal.timeout(8000),
    headers: sapiHeaders(),
  });
  if (!resp.ok) return {};
  const data = (await resp.json()) as unknown;
  v2IncidentsCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

async function getBasketballIncidentSummaryV2(
  matchId: number,
): Promise<BasketballIncidentSummarySnapshot | null> {
  if (!Number.isFinite(matchId) || matchId <= 0) return null;
  const cached = basketballIncidentSummaryCache.get(matchId);
  if (cached && Date.now() - cached.fetchedAt < BASKETBALL_INCIDENT_SUMMARY_TTL)
    return cached;
  const inflight = basketballIncidentSummaryInFlight.get(matchId);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const raw = await fetchV2IncidentsRaw("basketball", String(matchId));
      const summary = parseBasketballIncidentSummary(raw);
      basketballIncidentSummaryCache.set(matchId, summary);
      return summary;
    } catch {
      return null;
    } finally {
      basketballIncidentSummaryInFlight.delete(matchId);
    }
  })();
  basketballIncidentSummaryInFlight.set(matchId, p);
  return p;
}

router.get("/v2-incidents", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) {
    res.json({});
    return;
  }
  const base = v2SportBase(sport);
  if (!base) {
    res.json({});
    return;
  }

  const cacheKey = `v2inc:${sport}:${matchId}`;
  const cached = v2IncidentsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_INCIDENTS_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const resp = await fetch(`${base}/match/${matchId}/incidents`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) throw new Error(`incidents ${resp.status}`);
    const data = (await resp.json()) as unknown;
    v2IncidentsCache.set(cacheKey, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch {
    // Fallback: build incidents from liveMatchState events + tracked goal minutes
    const liveState =
      liveMatchState.get(matchId) ?? liveMatchState.get(`football-v2-${matchId}`);
    const incidents: Array<Record<string, unknown>> = [];
    if (liveState?.events?.length) {
      liveState.events.forEach((e, i) => {
        incidents.push({
          id: i,
          type: e.type,
          minute: e.minute,
          team: e.team,
          player: { name: e.player },
        });
      });
    } else if (liveState?._liveExtra) {
      const lx = liveState._liveExtra;
      const hGoals = (lx.homeGoalMinutes as number[] | undefined) ?? [];
      const aGoals = (lx.awayGoalMinutes as number[] | undefined) ?? [];
      hGoals.forEach((min, i) =>
        incidents.push({ id: i, type: "Goal", minute: min, team: "home", player: { name: "" } }),
      );
      aGoals.forEach((min, i) =>
        incidents.push({ id: 100 + i, type: "Goal", minute: min, team: "away", player: { name: "" } }),
      );
      incidents.sort((a, b) => (a.minute as number) - (b.minute as number));
    }
    if (incidents.length > 0) {
      const fallback = { data: { incidents } };
      v2IncidentsCache.set(cacheKey, { data: fallback, fetchedAt: Date.now() });
      res.json(fallback);
      return;
    }
    res.json({});
  }
});

const v2StatisticsCache = new Map<
  string,
  { data: unknown; fetchedAt: number }
>();
const V2_STATISTICS_TTL = 30000;

router.get("/v2-statistics", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) {
    res.json({});
    return;
  }
  const base = v2SportBase(sport);
  if (!base) {
    res.json({});
    return;
  }

  const cacheKey = `v2stats:${sport}:${matchId}`;
  const cached = v2StatisticsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_STATISTICS_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const resp = await fetch(`${base}/match/${matchId}/statistics`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) throw new Error(`statistics ${resp.status}`);
    const data = (await resp.json()) as unknown;
    v2StatisticsCache.set(cacheKey, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch {
    // Fallback: synthesize stats from liveMatchState._liveExtra + live odds estimation.
    // This covers deployments where only Statpal is configured (no SportsAPI key).
    const liveState =
      liveMatchState.get(matchId) ?? liveMatchState.get(`football-v2-${matchId}`);
    const lx = liveState?._liveExtra;
    const rows: Array<{ name: string; home: string; away: string }> = [];

    // Real stats from _liveExtra (populated if Statpal provides a stats endpoint)
    if (lx?.possessionHome != null)
      rows.push({
        name: "Posse de Bola",
        home: `${lx.possessionHome}%`,
        away: `${lx.possessionAway ?? 100 - (lx.possessionHome as number)}%`,
      });
    if (lx?.shotsTotalHome != null)
      rows.push({ name: "Remates", home: String(lx.shotsTotalHome), away: String(lx.shotsTotalAway ?? 0) });
    if (lx?.shotsOnTargetHome != null)
      rows.push({ name: "Remates a Baliza", home: String(lx.shotsOnTargetHome), away: String(lx.shotsOnTargetAway ?? 0) });
    if (lx?.dangerousAttacksHome != null)
      rows.push({ name: "Ataques Perigosos", home: String(lx.dangerousAttacksHome), away: String(lx.dangerousAttacksAway ?? 0) });
    if (lx?.attacksHome != null)
      rows.push({ name: "Ataques", home: String(lx.attacksHome), away: String(lx.attacksAway ?? 0) });
    if (lx?.cornersHome != null)
      rows.push({ name: "Cantos", home: String(lx.cornersHome), away: String(lx.cornersAway ?? 0) });
    if (lx?.foulsHome != null)
      rows.push({ name: "Faltas", home: String(lx.foulsHome), away: String(lx.foulsAway ?? 0) });
    if (lx?.offsidesHome != null)
      rows.push({ name: "Fora de Jogo", home: String(lx.offsidesHome), away: String(lx.offsidesAway ?? 0) });
    if (lx?.yellowCardsHome != null)
      rows.push({ name: "Cartões Amarelos", home: String(lx.yellowCardsHome), away: String(lx.yellowCardsAway ?? 0) });
    if (lx?.xgHome != null)
      rows.push({
        name: "xG",
        home: (lx.xgHome as number).toFixed(2),
        away: ((lx.xgAway as number) ?? 0).toFixed(2),
      });

    // Estimated possession from live 1x2 odds (implied probability ratio) —
    // last resort only, when nothing real (Statpal _liveExtra or API-Football
    // stats, both already handled above) was available at all.
    if (rows.length === 0 && liveState && sport === "football") {
      // Prefer base odds (pre-goal anchor) over current live odds for possession estimate —
      // live odds shift dramatically after a goal, making the estimate unreliable.
      const odds = (liveState as unknown as Record<string, { home: number; away: number }>)["_baseOdds"] ?? liveState.odds;
      if (odds?.home > 1 && odds?.away > 1) {
        const pH = 1 / odds.home;
        const pA = 1 / odds.away;
        const total = pH + pA;
        if (total > 0) {
          const possH = Math.round((pH / total) * 100);
          const possA = 100 - possH;
          rows.push({
            name: "Posse de Bola",
            home: `${possH}%`,
            away: `${possA}%`,
          });
        }
      }
    }

    // Red cards / goals: pushed unconditionally (not gated on rows.length),
    // since these previously only showed when NOTHING else was available —
    // silently disappearing the instant real API-Football stats populated
    // the rows above them.
    if (liveState && sport === "football") {
      if ((liveState.redCardsHome ?? 0) > 0 || (liveState.redCardsAway ?? 0) > 0) {
        rows.push({
          name: "Cartões Vermelhos",
          home: String(liveState.redCardsHome ?? 0),
          away: String(liveState.redCardsAway ?? 0),
        });
      }
      const hGoals = (lx?.homeGoalMinutes as number[] | undefined)?.length ?? liveState.homeScore;
      const aGoals = (lx?.awayGoalMinutes as number[] | undefined)?.length ?? liveState.awayScore;
      if (hGoals > 0 || aGoals > 0) {
        rows.push({
          name: "Golos",
          home: String(hGoals),
          away: String(aGoals),
        });
      }
    }

    if (rows.length > 0) {
      const synth = { data: { statistics: [{ title: "Estatísticas", rows }] } };
      v2StatisticsCache.set(cacheKey, { data: synth, fetchedAt: Date.now() });
      res.json(synth);
      return;
    }
    res.json({});
  }
});

// ─── Confrontos (H2H Real Data) ───────────────────────────────────────────────

type ConfrontosH2HMeeting = {
  date: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  league: string;
  country?: string;
};
type ConfrontosResult = {
  homeWins: number;
  awayWins: number;
  draws: number;
  recentMeetings: ConfrontosH2HMeeting[];
  team1Name: string;
  team2Name: string;
  sport: string;
};

const confrontosCache = new Map<
  string,
  { data: ConfrontosResult; fetchedAt: number }
>();
const CONFRONTOS_TTL = 15 * 60_000;

router.get("/confrontos", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  const home = String(req.query["home"] ?? "").trim();
  const away = String(req.query["away"] ?? "").trim();

  const cacheKey = `confrontos:${sport}:${matchId}:${home}:${away}`;
  const cached = confrontosCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CONFRONTOS_TTL) {
    res.json(cached.data);
    return;
  }

  let homeWins = 0,
    awayWins = 0,
    draws = 0;
  const recentMeetings: ConfrontosH2HMeeting[] = [];
  let team1Name = home,
    team2Name = away;

  // ── SportMonks H2H (football only, sportmonks-football-* matchIds) — tried
  // first for these matchIds: both sides resolve to real SportMonks numeric
  // team ids off the fixture itself, so there's no fuzzy team-name matching
  // risk the Statpal/V1 fallbacks below carry. Those fallbacks only run if
  // this finds nothing (e.g. a fixture SportMonks has no schedule history
  // for yet) — see their own "recentMeetings.length === 0" guards below.
  if (sport === "football" && matchId.startsWith("sportmonks-football-")) {
    const fixtureId = Number(matchId.slice("sportmonks-football-".length));
    if (Number.isFinite(fixtureId)) {
      try {
        const fixture = await getSportMonksFixtureById(fixtureId);
        const homeP = fixture?.participants?.find((p) => p.meta?.location === "home");
        const awayP = fixture?.participants?.find((p) => p.meta?.location === "away");
        if (homeP && awayP) {
          team1Name = homeP.name;
          team2Name = awayP.name;
          const meetings = await getSportMonksTeamHeadToHead(homeP.id, awayP.id);
          for (const m of meetings) {
            const mHomeP = m.participants?.find((p) => p.meta?.location === "home");
            const mAwayP = m.participants?.find((p) => p.meta?.location === "away");
            const score = getSportMonksFixtureScore(m);
            if (!mHomeP || !mAwayP || !score) continue;
            recentMeetings.push({
              date: m.starting_at ? m.starting_at.slice(0, 10) : "",
              team1: mHomeP.name,
              team2: mAwayP.name,
              score1: score.home,
              score2: score.away,
              // No `league` object on schedule-endpoint fixtures (confirmed
              // real — only league_id) — left blank rather than guessed.
              league: "",
            });
            // Tally from the CURRENT match's home/away perspective (homeP/
            // awayP), not this historical fixture's own home/away — matches
            // how the frontend renders homeWins/awayWins against today's match.
            const ourScore = mHomeP.id === homeP.id ? score.home : score.away;
            const theirScore = mHomeP.id === homeP.id ? score.away : score.home;
            if (ourScore > theirScore) homeWins++;
            else if (ourScore < theirScore) awayWins++;
            else draws++;
          }
        }
      } catch {
        /* ignore — fall through to Statpal/V2/V1 */
      }
    }
  }

  // ── Statpal H2H (football only) — most accurate since match IDs come from Statpal ──
  if (
    sport === "football" &&
    CONFIG.STATPAL_API_KEY &&
    matchId &&
    recentMeetings.length === 0
  ) {
    const liveEntry = liveMatchState.get(matchId);
    const t1id = liveEntry?.homeTeamId;
    const t2id = liveEntry?.awayTeamId;
    if (t1id && t2id) {
      try {
        const h2hUrlRaw = buildStatpalUrl("/v2/soccer/head-to-head");
        const h2hUrl = (typeof h2hUrlRaw === "string" ? new URL(h2hUrlRaw) : h2hUrlRaw) as URL;
        h2hUrl.searchParams.set("team1_id", t1id);
        h2hUrl.searchParams.set("team2_id", t2id);
        const h2hResp = await fetch(h2hUrl.toString(), {
          signal: AbortSignal.timeout(8000),
          headers: statpalHeaders(),
        });
        if (h2hResp.ok) {
          const h2hData = (await h2hResp.json()) as Record<string, unknown>;
          // Statpal H2H response: { head_to_head: { matches: [...], summary: { team1_wins, team2_wins, draws } } }
          const h2h = (h2hData["head_to_head"] ?? h2hData["h2h"] ?? h2hData) as Record<string, unknown>;
          const summary = (h2h["summary"] ?? h2h["record"] ?? {}) as Record<string, unknown>;
          const toN = (v: unknown) => typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;
          const sw = toN(summary["team1_wins"] ?? summary["home_wins"] ?? summary["team1_win"]);
          const sa = toN(summary["team2_wins"] ?? summary["away_wins"] ?? summary["team2_win"]);
          const sd = toN(summary["draws"] ?? summary["draw"]);
          if (sw + sa + sd > 0) {
            homeWins = sw;
            awayWins = sa;
            draws = sd;
          }
          const matchList: Record<string, unknown>[] = Array.isArray(h2h["matches"])
            ? h2h["matches"] as Record<string, unknown>[]
            : Array.isArray(h2hData["matches"])
              ? h2hData["matches"] as Record<string, unknown>[]
              : [];
          for (const m of matchList.slice(0, 10)) {
            try {
              const dateRaw = String(m["date"] ?? m["match_date"] ?? "");
              const dt = dateRaw.slice(0, 10);
              const hTeam = String((m["home_team"] as Record<string,unknown>)?.["name"] ?? m["home_team"] ?? m["team1"] ?? "");
              const aTeam = String((m["away_team"] as Record<string,unknown>)?.["name"] ?? m["away_team"] ?? m["team2"] ?? "");
              const score = String(m["score"] ?? m["result"] ?? "0-0");
              const parts = score.split(/[-:]/).map((s) => parseInt(s.trim(), 10));
              const s1 = isNaN(parts[0] ?? NaN) ? 0 : parts[0]!;
              const s2 = isNaN(parts[1] ?? NaN) ? 0 : parts[1]!;
              const league = String(m["league"] ?? m["competition"] ?? m["tournament"] ?? "");
              if (hTeam || aTeam) {
                recentMeetings.push({ date: dt, team1: hTeam || home, team2: aTeam || away, score1: s1, score2: s2, league });
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* ignore — fall through to SportsAPI Pro */ }
    }
  }

  // V2 h2h aggregate (works for all sports) — skip if Statpal already found data
  const base = v2SportBase(sport);
  if (base && matchId && homeWins === 0 && awayWins === 0 && draws === 0 && recentMeetings.length === 0) {
    try {
      const resp = await fetch(`${base}/match/${matchId}/h2h`, {
        signal: AbortSignal.timeout(8000),
        headers: sapiHeaders(),
      });
      if (resp.ok) {
        const d = (await resp.json()) as {
          data?: {
            teamDuel?: { homeWins?: number; awayWins?: number; draws?: number };
            previousMatches?: Array<{
              homeTeam?: { name?: string };
              awayTeam?: { name?: string };
              homeScore?: { current?: number };
              awayScore?: { current?: number };
              startTimestamp?: number;
              tournament?: { name?: string };
            }>;
          };
        };
        const td = d.data?.teamDuel;
        if (td) {
          homeWins = td.homeWins ?? 0;
          awayWins = td.awayWins ?? 0;
          draws = td.draws ?? 0;
        }
        for (const m of (d.data?.previousMatches ?? []).slice(0, 10)) {
          const dt = m.startTimestamp
            ? new Date(m.startTimestamp * 1000).toISOString().slice(0, 10)
            : "";
          recentMeetings.push({
            date: dt,
            team1: m.homeTeam?.name ?? "",
            team2: m.awayTeam?.name ?? "",
            score1: m.homeScore?.current ?? 0,
            score2: m.awayScore?.current ?? 0,
            league: m.tournament?.name ?? "",
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // For football: enrich with V1 API (richer recent meetings list)
  if (sport === "football" && home && away) {
    try {
      const h2hData = (await getFootballH2H(home, away)) as {
        recentMeetings?: Array<{
          date: string;
          league: string;
          country?: string;
          team1: { name: string; score: number };
          team2: { name: string; score: number };
        }>;
        overallRecord?: {
          total?: {
            games?: number;
            team1Won?: number;
            team2Won?: number;
            draws?: number;
          };
        };
      };
      // Use V1 aggregate if V2 returned nothing
      if (homeWins === 0 && awayWins === 0 && draws === 0) {
        const ov = h2hData.overallRecord?.total;
        if (ov) {
          homeWins = ov.team1Won ?? 0;
          awayWins = ov.team2Won ?? 0;
          draws = ov.draws ?? 0;
        }
      }
      // Use V1 recent meetings if V2 had none
      if (recentMeetings.length === 0) {
        for (const m of (h2hData.recentMeetings ?? []).slice(0, 10)) {
          recentMeetings.push({
            date: m.date,
            team1: m.team1.name,
            team2: m.team2.name,
            score1: m.team1.score,
            score2: m.team2.score,
            league: m.league,
            country: m.country,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const result: ConfrontosResult = {
    homeWins,
    awayWins,
    draws,
    recentMeetings,
    team1Name,
    team2Name,
    sport,
  };
  confrontosCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  res.json(result);
});

// ─── Próximos Jogos (SportMonks team schedule, football only) ─────────────────
// Real SportMonks data (GET /v3/football/schedules/teams/{id}), confirmed
// 2026-08-29 — only wired for sportmonks-football-* matchIds since that's
// the only football matchId scheme with a resolvable real SportMonks
// fixture/team id behind it right now.

type TeamUpcomingEntry = {
  date: string;
  opponent: string;
  competition: string;
  isHome: boolean;
};

router.get("/team-upcoming", async (req: Request, res: Response) => {
  const matchId = String(req.query["matchId"] ?? "");
  const side = String(req.query["side"] ?? "home");
  const limit = Math.min(10, Math.max(1, Number(req.query["limit"]) || 5));

  if (!matchId.startsWith("sportmonks-football-")) {
    res.json({ fixtures: [] });
    return;
  }
  const fixtureId = Number(matchId.slice("sportmonks-football-".length));
  if (!Number.isFinite(fixtureId)) {
    res.json({ fixtures: [] });
    return;
  }

  try {
    const fixture = await getSportMonksFixtureById(fixtureId);
    const team = fixture?.participants?.find((p) => p.meta?.location === side);
    if (!team) {
      res.json({ fixtures: [] });
      return;
    }
    const upcoming = await getSportMonksTeamUpcoming(team.id, limit);
    const fixtures: TeamUpcomingEntry[] = upcoming.map((fx) => {
      const homeP = fx.participants?.find((p) => p.meta?.location === "home");
      const awayP = fx.participants?.find((p) => p.meta?.location === "away");
      const isHome = homeP?.id === team.id;
      const opponent = (isHome ? awayP?.name : homeP?.name) ?? "";
      return {
        date: fx.starting_at ? fx.starting_at.slice(0, 10) : "",
        opponent,
        // No `league` object on schedule-endpoint fixtures (confirmed real
        // — only league_id) — left blank rather than guessed, same as
        // /confrontos's SportMonks H2H branch above.
        competition: "",
        isHome,
      };
    });
    res.json({ fixtures });
  } catch {
    res.json({ fixtures: [] });
  }
});

// ─── Statpal Live Storylines ──────────────────────────────────────────────────

const statpalStorylinesCache = new Map<string, { data: string | null; fetchedAt: number }>();
const STORYLINES_TTL_MS = 60_000; // 1 minute — storylines change as the match evolves

router.get("/storylines/:matchId", async (req: Request, res: Response) => {
  if (!CONFIG.STATPAL_API_KEY) {
    res.json({ storyline: null });
    return;
  }
  const matchId = String(req.params["matchId"] ?? "");
  if (!matchId) {
    res.json({ storyline: null });
    return;
  }
  const cached = statpalStorylinesCache.get(matchId);
  if (cached && Date.now() - cached.fetchedAt < STORYLINES_TTL_MS) {
    res.json({ storyline: cached.data });
    return;
  }
  try {
    const url = buildStatpalUrl("/v2/soccer/live-storylines");
    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: statpalHeaders(),
    });
    if (!resp.ok) {
      statpalStorylinesCache.set(matchId, { data: null, fetchedAt: Date.now() });
      res.json({ storyline: null });
      return;
    }
    const data = (await resp.json()) as Record<string, unknown>;
    // Statpal live-storylines: top-level "matches" array; each item has main_id + storyline/context/narrative
    const allMatches = Array.isArray(data["matches"])
      ? (data["matches"] as Record<string, unknown>[])
      : Array.isArray(data["data"])
        ? (data["data"] as Record<string, unknown>[])
        : [];
    const match = allMatches.find(
      (m) =>
        String(m["main_id"] ?? m["id"] ?? m["match_id"]) === matchId,
    );
    const storyline = match
      ? String(
          match["storyline"] ??
          match["context"] ??
          match["narrative"] ??
          match["story"] ??
          "",
        ).trim()
      : null;
    statpalStorylinesCache.set(matchId, {
      data: storyline || null,
      fetchedAt: Date.now(),
    });
    res.json({ storyline: storyline || null });
  } catch {
    statpalStorylinesCache.set(matchId, { data: null, fetchedAt: Date.now() });
    res.json({ storyline: null });
  }
});

// ─── V2 Tournament Standings (match-specific) ────────────────────────────────

const v2StandingsCache = new Map<string, { data: object; fetchedAt: number }>();
const V2_STANDINGS_TTL = 15 * 60_000;

router.get("/v2-standings", async (req: Request, res: Response) => {
  const sport = String(req.query["sport"] ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) {
    res.json({ standings: [], league: "" });
    return;
  }

  const base = v2SportBase(sport);
  if (!base) {
    res.json({ standings: [], league: "" });
    return;
  }

  const cacheKey = `v2std:${sport}:${matchId}`;
  const cached = v2StandingsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_STANDINGS_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    // Step 1: match details → uniqueTournament.id + season.id
    const matchResp = await fetch(`${base}/match/${matchId}`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!matchResp.ok) {
      res.json({ standings: [], league: "" });
      return;
    }
    const matchData = (await matchResp.json()) as {
      match?: {
        homeTeam?: { name?: string };
        awayTeam?: { name?: string };
        tournament?: {
          name?: string;
          isGroup?: boolean;
          groupName?: string;
          groupSign?: string;
          uniqueTournament?: { id?: number; name?: string };
        };
        season?: { id?: number };
      };
    };
    const tId = matchData.match?.tournament?.uniqueTournament?.id;
    const sId = matchData.match?.season?.id;
    const leagueName =
      matchData.match?.tournament?.uniqueTournament?.name ??
      matchData.match?.tournament?.name ??
      "";
    const homeTeamName = matchData.match?.homeTeam?.name ?? "";
    const awayTeamName = matchData.match?.awayTeam?.name ?? "";
    const isGroupTournament = matchData.match?.tournament?.isGroup ?? false;
    const rawGroupName = matchData.match?.tournament?.groupName ?? "";
    if (!tId || !sId) {
      res.json({ standings: [], league: leagueName });
      return;
    }

    // Step 2: fetch standings
    const stdResp = await fetch(
      `${base}/tournament/${tId}/season/${sId}/standings`,
      { signal: AbortSignal.timeout(8000), headers: sapiHeaders() },
    );
    if (!stdResp.ok) {
      res.json({ standings: [], league: leagueName });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdData = (await stdResp.json()) as { standings?: any[] };
    const rawArr = stdData.standings ?? [];

    function parseStandingRow(r: any, i: number) {
      return {
        pos: r.position ?? r.rank ?? i + 1,
        name: r.teamName ?? r.team?.shortName ?? r.team?.name ?? "",
        played: r.played ?? r.matches ?? 0,
        won: r.won ?? r.wins ?? 0,
        drawn: r.drawn ?? r.draws ?? 0,
        lost: r.lost ?? r.losses ?? 0,
        gf: r.goalsFor ?? r.goals_for ?? r.scored ?? 0,
        ga: r.goalsAgainst ?? r.goals_against ?? r.conceded ?? 0,
        pts: r.points ?? 0,
      };
    }

    function normalizeStandingTeamName(name: string) {
      return String(name ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\b(fc|cf|sc|ac|afc|fk|club|clube)\b/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function standingRowMatchesTeam(rowName: string, teamName: string) {
      const row = normalizeStandingTeamName(rowName);
      const team = normalizeStandingTeamName(teamName);
      if (!row || !team) return false;
      return (
        row === team ||
        row.includes(team) ||
        team.includes(row) ||
        row.includes(team.slice(0, Math.min(team.length, 8)))
      );
    }

    // Detect group-stage competition: each item has a "group" key OR a nested rows/standings array
    const firstItem = rawArr[0];
    const isGrouped =
      firstItem &&
      (typeof firstItem.group !== "undefined" ||
        Array.isArray(firstItem.rows) ||
        Array.isArray(firstItem.standings));

    let rows: ReturnType<typeof parseStandingRow>[];
    let groups:
      | Array<{ name: string; rows: ReturnType<typeof parseStandingRow>[] }>
      | undefined;

    if (isGrouped) {
      groups = rawArr.map((g: any) => {
        const rawName: string =
          typeof g.group === "string"
            ? g.group
            : (g.group?.name ?? g.name ?? "Grupo");
        // Prefix "Grupo" if it looks like a bare letter (A, B, C…) or number
        const name = /^[A-Z0-9]$/.test(rawName.trim())
          ? `Grupo ${rawName.trim()}`
          : rawName.startsWith("Group")
            ? rawName.replace("Group", "Grupo")
            : rawName;
        const nestedRows: any[] = g.rows ?? g.standings ?? [];
        return {
          name,
          rows: nestedRows.map((r: any, i: number) => parseStandingRow(r, i)),
        };
      });
      rows = groups.flatMap((g) => g.rows);
    } else {
      rows = rawArr.map((r: any, i: number) => parseStandingRow(r, i));
      // When the API returns a flat list for a group-stage competition (e.g. Libertadores),
      // wrap the rows in a single named group using the match's tournament.groupName.
      if (isGroupTournament && rawGroupName && rows.length > 0) {
        const groupLabel = rawGroupName.startsWith("Group")
          ? rawGroupName.replace("Group", "Grupo")
          : /^[A-Z0-9]$/.test(rawGroupName.trim())
            ? `Grupo ${rawGroupName.trim()}`
            : rawGroupName;
        groups = [{ name: groupLabel, rows }];
      } else {
        groups = undefined;
      }
    }

    const allRows =
      groups && groups.length > 0
        ? groups.flatMap((group) => group.rows)
        : rows;
    const hasHomeTeam = homeTeamName
      ? allRows.some((row) => standingRowMatchesTeam(row.name, homeTeamName))
      : true;
    const hasAwayTeam = awayTeamName
      ? allRows.some((row) => standingRowMatchesTeam(row.name, awayTeamName))
      : true;
    if (!hasHomeTeam || !hasAwayTeam) {
      res.json({ standings: [], groups: [], league: leagueName });
      return;
    }

    const result = { standings: rows, groups, league: leagueName };
    v2StandingsCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    res.json(result);
  } catch {
    res.json({ standings: [], league: "" });
  }
});

// ─── WebSocket server for mobile clients (/api/matches/ws) ───────────────────
// Accepts native WebSocket connections and pushes the same live payload that
// broadcastLive() sends to SSE clients (WS-triggered + 1–2s cadence), piggy-backed
// on the market-drift engine. Mobile clients reconnect automatically on close/error.
// Warm the WC 2026 cache 12s after server start so first user visit is instant
setTimeout(() => {
  buildWC2026Matches().catch(() => {});
}, 12_000);

export function initLiveWsServer(httpServer: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on(
    "upgrade",
    (req: http.IncomingMessage, socket: any, head: any) => {
      const url = req.url ?? "";
      if (url === "/api/matches/ws" || url.startsWith("/api/matches/ws?")) {
        wss.handleUpgrade(req, socket, head, (ws: WsClient) => {
          wss.emit("connection", ws, req);
        });
      } else {
        // Not our path — let other handlers decide (or destroy)
        socket.destroy();
      }
    },
  );

  wss.on("connection", (ws: WsClient) => {
    wsLiveClients.add(ws);

    // Send current live state immediately so the client isn't blank for the next tick
    getLivePayloadCached()
      .then((p) => {
        const effectivePayload =
          p.matches.length === 0 ? (getLivePayloadFallback() ?? p) : p;
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify(effectivePayload));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* ignore */
      });

    ws.on("close", () => wsLiveClients.delete(ws));
    ws.on("error", () => wsLiveClients.delete(ws));
  });
}

export default router;
