import { Router, type IRouter } from "express";
import { WebSocketServer, type WebSocket as WsClient } from "ws";
import { CONFIG, FOOTBALL_SUSP_KEYS, footballSuspensionDelayMs } from "../lib/config";
import { logger } from "../lib/logger";
import { buildMatchSettlementJobId, enqueueMatchSettlement } from "../lib/settlementQueue";
import { db, matchResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const SPORTSAPI_KEY = process.env.SPORTSAPI_KEY ?? "";

// SportsAPI Pro V2 — real-time live scores (V2 domains, correct paths)
const SAPI_V2_FOOTBALL   = "https://v2.football.sportsapipro.com/api";
const SAPI_V2_BASKETBALL = "https://v2.basketball.sportsapipro.com/api";
const SAPI_V2_HOCKEY     = "https://v2.hockey.sportsapipro.com/api";
const SAPI_V2_TENNIS     = "https://v2.tennis.sportsapipro.com/api";
const SAPI_V2_BASEBALL   = "https://v2.baseball.sportsapipro.com/api";
// No V2 volleyball domain is available

// SportsAPI Pro V1 — lower-latency HTTP endpoints (1-2s vs V2's 3-5s)
// Used as the primary source for /live; V2 is the fallback via Promise.any()
const SAPI_V1_FOOTBALL   = "https://v1.football.sportsapipro.com/api";
const SAPI_V1_BASKETBALL = "https://v1.basketball.sportsapipro.com/api";
const SAPI_V1_TENNIS     = "https://v1.tennis.sportsapipro.com/api";

// Auth headers helper
const sapiHeaders = (): Record<string, string> => ({ "x-api-key": SPORTSAPI_KEY });


// ─── Types ────────────────────────────────────────────────────────────────────

type AdvancedMarkets = {
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore: { yes: number; no: number };
  totalGoals: { over05: number; under05: number; over15: number; under15: number; over25: number; under25: number; over35: number; under35: number; over45: number; under45: number; over55: number; under55: number; over65: number; under65: number };
  handicap: { homeMinusOne: number; awayPlusOne: number; homeMinusOneHalf: number; awayPlusOneHalf: number };
  halfTime: { home: number; draw: number; away: number };
  firstGoal: { home: number; noGoal: number; away: number };
  // Extended football markets
  drawNoBet?: { home: number; away: number };
  asianHandicap?: { line: number; home: number; away: number };
  asianTotals?: { o05: number; u05: number; o45: number; u45: number; o55: number; u55: number; o225: number; u225: number; o275: number; u275: number };
  htft?: { hh: number; hd: number; ha: number; dh: number; dd: number; da: number; ah: number; ad: number; aa: number };
  correctScore?: Record<string, number>;
  corners?: { o85: number; u85: number; o95: number; u95: number; o105: number; u105: number };
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
    teamTotalHome: { line: number; over: number; under: number };
    teamTotalAway: { line: number; over: number; under: number };
  };
  // Tennis extended markets
  tennisExtra?: {
    firstSet: { home: number; away: number };
    set2: { home: number; away: number };
    set3: { home: number; away: number };
    exactSets: { h20: number; h21: number; a02: number; a12: number };
    setHandicap: { home: number; away: number };
    totalGames: { line: number; over: number; under: number };
    totalGamesLines: Array<{ line: number; over: number; under: number }>;
    set1Games: { line: number; over: number; under: number };
    gameHandicap: { line: number; home: number; away: number };
    // Live: exact score market for the current set in progress
    setExactScore?: Record<string, number>;
    currentSetNum?: number;
    // Extended pre-match odds fields
    set2Games?: { line: number; over: number; under: number };
    homePlayerGames?: { line: number; over: number; under: number };
    awayPlayerGames?: { line: number; over: number; under: number };
    oddEvenGames?: { odd: number; even: number };
    oddEven1st?: { odd: number; even: number };
    oddEven2nd?: { odd: number; even: number };
    winAtLeast1P1?: { yes: number; no: number };
    winAtLeast1P2?: { yes: number; no: number };
    setMatch?: { h11: number; h12: number; a21: number; a22: number };
    score1st?: Array<{ label: string; odds: number }>;
    score2nd?: Array<{ label: string; odds: number }>;
  };
  // Hockey extended markets
  hockeyExtra?: {
    period2: { home: number; draw: number; away: number };
    period3: { home: number; draw: number; away: number };
    period1Total: { line: number; over: number; under: number };
    bothTeamsScoreGame: { yes: number; no: number };
    shotsOnGoal: { line: number; over: number; under: number };
  };
  // Volleyball extended markets
  volleyballExtra?: {
    set1: { home: number; away: number };
    set2: { home: number; away: number };
    set3: { home: number; away: number };
    exactScore: { s30: number; s31: number; s32: number; s03: number; s13: number; s23: number };
    setHandicap: { home: number; away: number };
    pointsLines: Array<{ line: number; over: number; under: number }>;
    handicapPoints: { line: number; home: number; away: number };
  };
  // Second half result (who wins just the 2nd half period)
  secondHalf?: { home: number; draw: number; away: number };
  // Football extra-time markets (shown when match is in ET, minute > 90)
  etExtra?: {
    tieWinner: { home: number; away: number };              // who advances from the knockout tie (no draw)
    etResult: { home: number; draw: number; away: number }; // ET period result (draw means → penalties)
    totalGoals: { o05: number; u05: number; o15: number; u15: number; o25: number; u25: number };
    nextGoal: { home: number; away: number };               // which team scores next in ET
  };
  // Football penalty-shootout markets (shown when m.penalties exists during live)
  penExtra?: {
    winner: { home: number; away: number };
  };
  // Football extra markets derived from Poisson model
  winToNil?: { home: number; away: number };
  cleanSheet?: { home: number; away: number };
  goalOddEven?: { odd: number; even: number };
  exactGoals?: { g0: number; g1: number; g2: number; g3: number; g4: number; g5plus: number };
  btts1H?: { yes: number; no: number };
  btts2H?: { yes: number; no: number };
  toWinBothHalves?: { home: number; away: number };
  highestScoringHalf?: { first: number; second: number; equal: number };
  // Half-time and 2nd-half exact score markets
  htCorrectScore?: Record<string, number>;
  h2CorrectScore?: Record<string, number>;
  // Team goals O/U (each team individually)
  teamGoals?: {
    homeOver05: number; homeUnder05: number;
    homeOver15: number; homeUnder15: number;
    homeOver25: number; homeUnder25: number;
    awayOver05: number; awayUnder05: number;
    awayOver15: number; awayUnder15: number;
    awayOver25: number; awayUnder25: number;
  };
};

export type LiveMatchState = {
  id: string;
  home: string;
  away: string;
  league: string;
  country: string;
  sport: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  hasRealOdds: boolean;
  odds: { home: number; draw: number; away: number };
  markets: AdvancedMarkets;
  events: Array<{ type: string; team: string; minute: number; player: string }>;
  date?: string;
  time?: string;
  // market key → timestamp (ms) when it reopens; absent or past = open
  marketSuspension?: Record<string, number>;
  // Reason for current suspension (displayed in UI)
  _suspensionReason?: string;
  // Statpal league ID — used for player markets (football only)
  leagueId?: string;
  // Red cards per team (football only; 0 = none)
  redCardsHome?: number;
  redCardsAway?: number;
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
  _firstSeenAt?: number;   // ms — when this match first appeared in live feed
  _htStartedAt?: number;   // ms — when status first became "HT" (resets on 2H kick-off)
  _lastSeenAt?: number;    // ms — last time this match was observed in provider feed
  _missingSinceAt?: number; // ms — when this match first disappeared from provider feed
  // Sport-specific live display data
  _liveExtra?: {
    clockStr?: string;                   // basketball/hockey: "06:44"
    kickoffSec?: number;
    clockSec?: number;
    clockAtMs?: number;
    clockRunning?: boolean;
    sets?: Array<[number, number]>;      // tennis: [[6,3],[4,2]] last entry is in-progress
    currentPoints?: [number | string, number | string]; // tennis: [30, 15] or ["D","D"] or ["AD",40]
    serving?: [boolean, boolean];
    currentPts?: [number, number];       // volleyball: current set points [18, 16]
    vollSets?: Array<[number, number]>;  // volleyball: completed set scores [[25,18],[22,25]]
    tennisStats?: [TennisStatData, TennisStatData]; // home / away match stats
    periods?: Array<[number, number]>;   // hockey: [[P1h,P1a],[P2h,P2a],[P3h,P3a],[OTh,OTa]]
    quarters?: Array<[number, number]>;  // basketball: [[Q1h,Q1a],[Q2h,Q2a],[Q3h,Q3a],[Q4h,Q4a],[OTh,OTa]]
    innings?: Array<[number, number]>;   // baseball: [[I1h,I1a],[I2h,I2a],...,[I9h,I9a]]
    outs?: number;                        // baseball: current outs (0-2)
    homeHits?: number;                   // baseball: home team hits
    awayHits?: number;                   // baseball: away team hits
    homeErrors?: number;                 // baseball: home team errors
    awayErrors?: number;                 // baseball: away team errors
    // Football extras from Statpal v2
    htScore?: [number, number];          // football: half-time score [homeHT, awayHT]
    etScore?: [number, number];          // football: extra-time score [homeET, awayET]
    penScore?: [number, number];         // football: penalty shootout [homePen, awayPen]
    penBaseScore?: [number, number];     // football: score at start of penalty phase (to compute pen goals)
    secondHalfKickoffSec?: number;
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
};

type StatpalMatchV2Event = {
  id?: string;
  type: string;
  team: string;
  minute: string;
  extra_min: string;
  player: string;
  player_id: string;
  assist_player?: string;
  assist_id?: string;
  result?: string;    // score at time of event e.g. "[1 - 0]"
};

type StatpalPenaltyEvent = {
  id: string;
  penalty_num: string;
  team: string;
  player: string;
  player_id: string;
  type: string;       // "goal" | "miss"
  result: string;
};

type StatpalMatchV2 = {
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
    event: StatpalMatchV2Event | StatpalMatchV2Event[];
  };
  ht?: { home_goals: number; away_goals: number };
  ft?: { home_goals: number; away_goals: number };
  et?: null | { home_goals: number; away_goals: number };
  penalties?: null | {
    home_pen: number;
    away_pen: number;
    penalty_events: StatpalPenaltyEvent | StatpalPenaltyEvent[];
  };
  has_live_stats?: string;    // "True" | "False"
  inplay_odds_running: string;
};

type StatpalLeagueV2 = {
  id: string;
  name: string;
  country: string;
  cup: string;
  match: StatpalMatchV2 | StatpalMatchV2[];
};

// v1 odds types
// Root double-wrapper: response is { example: { odds_feed: {...} } } OR { odds_feed: {...} }
// getOddsMap() already handles both via: raw?.example?.odds_feed ?? raw?.odds_feed
type OddsOdd = { name: string; value: string };
type OddsTotal    = { name: string; stop?: string; ismain?: string; odd: OddsOdd | OddsOdd[] };
type OddsHandicap = { name: string; stop?: string; ismain?: string; odd: OddsOdd | OddsOdd[] };
type OddsBookmaker = {
  id: string; name: string; stop?: string; ts?: string;
  odd?:      OddsOdd | OddsOdd[];       // 1x2, Correct Score, BTTS, Double Chance
  total?:    OddsTotal    | OddsTotal[];    // Over/Under lines
  handicap?: OddsHandicap | OddsHandicap[]; // Asian Handicap lines (was unknown[])
};
type OddsType = { name: string; stop?: string; bookmaker: OddsBookmaker | OddsBookmaker[] };
type OddsMatch = {
  id: string;
  alternate_id: string; alternate_id_2?: string; static_id?: string;
  date?: string; time?: string; status: string; venue?: string;
  home: { id: string; name: string; alternate_id?: string };
  away: { id: string; name: string; alternate_id?: string };
  odds?: { type: OddsType | OddsType[] };
};
type OddsLeague = {
  id: string; gid?: string; name: string; country: string; sub_id?: string;
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
];

function isIntlTournamentName(leagueName: string): boolean {
  const base = String(leagueName ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(" - ")[0]
    .trim();
  if (!base) return false;
  return INTL_TOURNAMENTS.some((p) => base.includes(p));
}

// DOMESTIC_PRIORITY: [pattern, priority]
// priority < 100 → shown; ≥ 100 → filtered out
const DOMESTIC_PRIORITY: Array<[string, number]> = [

  // ── BIG LEAGUES — 1st division ─────────────────────────────────────────────
  // ⚠ More-specific patterns FIRST within each country — see ordering rules above
  ["england: premier league",                1],
  ["spain: laliga2",                        11],   // ⚠ BEFORE "laliga" ("laliga2" ⊃ "laliga")
  ["spain: laliga",                          2],
  ["germany: 3. liga",                     999],   // ⚠ BEFORE "bundesliga"
  ["germany: 2. bundesliga",               12],    // ⚠ BEFORE "bundesliga"
  ["germany: bundesliga",                    3],
  ["italy: serie a",                         4],
  ["france: ligue 1",                        5],
  ["brazil: série b",                       15],   // ⚠ BEFORE "brasileiro" catch-all
  ["brazil: serie b",                       15],
  ["brazil: brasileirão série b",           15],
  ["brazil: brasileirao serie b",           15],
  ["brazil: betano - série b",             15],   // Statpal with Betano sponsor
  ["brazil: betano - serie b",             15],
  ["brazil: série a",                        6],
  ["brazil: serie a",                        6],
  ["brazil: brasileirão série a",            6],
  ["brazil: brasileirao serie a",            6],
  ["brazil: betano - série a",              6],   // Statpal with Betano sponsor
  ["brazil: betano - serie a",              6],
  ["brazil: betano",                         6],   // fallback for any "brazil: betano …" variant
  ["brazil: brasileiro",                     6],   // catch-all for other Brasileirão variants
  ["argentina: liga profesional",            7],
  ["argentina: primera división",            7],
  ["argentina: primera division",            7],

  // ── BIG LEAGUES — 2nd division ─────────────────────────────────────────────
  ["england: championship",                 10],
  ["spain: segunda división",              11],
  ["spain: segunda division",              11],
  ["italy: serie b",                        13],
  ["france: ligue 2",                       14],
  ["argentina: primera nacional",           16],

  // ── BIG LEAGUES — Cups & Super Cups ───────────────────────────────────────
  ["england: fa cup",                       20],
  ["england: carabao cup",                  21],
  ["england: efl cup",                      21],
  ["england: league cup",                   21],
  ["england: community shield",             22],
  ["spain: copa del rey",                   23],
  ["spain: supercopa",                      24],
  ["germany: dfb-pokal",                    25],
  ["germany: dfb pokal",                    25],
  ["germany: supercup",                     26],
  ["italy: coppa italia",                   27],
  ["italy: supercoppa",                     28],
  ["france: coupe de france",               29],
  ["france: trophée des champions",         30],
  ["france: trophee des champions",         30],
  ["brazil: copa do brasil",                31],
  ["brazil: supercopa",                     32],
  ["brazil: paulist",                       33],   // Paulistão / Paulista
  ["brazil: carioca",                       34],
  ["brazil: mineiro",                       35],
  ["brazil: gaúcho",                        36],
  ["brazil: gaucho",                        36],
  ["argentina: copa argentina",             37],
  ["argentina: supercopa",                  38],

  // ── MEDIUM LEAGUES — 1st division ─────────────────────────────────────────
  ["portugal: liga portugal 2",             50],   // ⚠ BEFORE "liga portugal" ("liga portugal 2" ⊃ "liga portugal")
  ["portugal: segunda liga",                50],
  ["portugal: liga portugal",               40],
  ["portugal: primeira liga",               40],
  ["portugal: liga bwin",                   40],
  ["netherlands: eredivisie",               41],
  ["belgium: pro league",                   42],
  ["belgium: jupiler",                      42],
  ["turkey: süper lig",                     43],
  ["turkey: super lig",                     43],
  ["mexico: liga mx",                       44],
  ["usa: mls",                              45],
  ["usa: major league soccer",              45],
  ["japan: j1 league",                      46],
  ["japan: j.league",                       46],
  ["south korea: k league 1",              47],
  ["korea: k league 1",                    47],

  // ── MEDIUM LEAGUES — 2nd division ─────────────────────────────────────────
  ["netherlands: eerste divisie",           51],
  ["netherlands: keuken",                   51],
  ["belgium: challenger",                   52],
  ["turkey: 1. lig",                        53],
  ["turkey: tff 1. lig",                    53],
  ["mexico: liga de expansión",            54],
  ["mexico: liga de expansion",            54],
  ["mexico: ascenso",                       54],
  ["usa: usl championship",                 55],
  ["japan: j2 league",                      56],
  ["south korea: k league 2",              57],
  ["korea: k league 2",                    57],

  // ── MEDIUM LEAGUES — Cups & Super Cups ────────────────────────────────────
  ["portugal: taça de portugal",            60],
  ["portugal: taca de portugal",            60],
  ["portugal: supertaça",                   61],
  ["portugal: supertaca",                   61],
  ["netherlands: knvb",                     62],
  ["netherlands: johan cruyff",             63],
  ["netherlands: super cup",                63],
  ["belgium: belgian cup",                  64],
  ["belgium: super cup",                    65],
  ["turkey: turkish cup",                   66],
  ["turkey: türkiye kupası",               66],
  ["turkey: super cup",                     67],
  ["mexico: copa mx",                       68],
  ["mexico: campeón de campeones",         69],
  ["mexico: campeon de campeones",         69],
  ["usa: u.s. open cup",                    70],
  ["usa: us open cup",                      70],
  ["usa: open cup",                         70],
  ["japan: emperor",                        71],   // Emperor's Cup
  ["japan: super cup",                      72],
  ["south korea: korean fa cup",           73],
  ["south korea: fa cup",                  73],
  ["korea: korean fa cup",                 73],
  ["korea: fa cup",                        73],

  // ── SMALL LEAGUES — 1st division only ─────────────────────────────────────
  ["croatia: hnl",                          75],
  ["croatia: supersport",                   75],
  ["serbia: superliga",                     76],
  ["sweden: allsvenskan",                   77],
  ["norway: eliteserien",                   78],
  ["denmark: superliga",                    79],
  ["chile: primera división",              80],
  ["chile: primera division",              80],
  ["colombia: categoría primera a",        81],
  ["colombia: categoria primera a",        81],
  ["colombia: primera a",                  81],
  ["colombia: categoría primera b",        96],   // 2nd division
  ["colombia: categoria primera b",        96],
  ["colombia: primera b",                  96],
  ["ecuador: liga pro",                    82],
  ["ecuador: liga betcris",                82],
  ["ecuador: segunda categoría",           999],  // 2nd div — skip
  ["ecuador: segunda categoria",           999],
  ["ecuador: copa",                        83],
  ["bolivia: división de honor",           93],
  ["bolivia: division de honor",           93],
  ["bolivia: división profesional",        93],
  ["bolivia: division profesional",        93],
  ["bolivia: liga boliviana",              93],
  ["peru: liga 1",                         91],
  ["peru: primera liga",                   91],
  ["peru: apertura",                       91],
  ["peru: copa",                           92],
  ["uruguay: primera división",            92],
  ["uruguay: primera division",            92],
  ["uruguay: serie a",                     92],
  ["uruguay: apertura",                    92],
  ["uruguay: copa",                        93],
  ["paraguay: primera división",           94],
  ["paraguay: primera division",           94],
  ["paraguay: apertura",                   94],
  ["venezuela: liga futve",                95],
  ["venezuela: primera división",          95],
  ["venezuela: primera division",          95],
  ["venezuela: apertura",                  95],
  ["saudi arabia: saudi pro league",        82],
  ["saudi arabia: pro league",              82],
  ["thailand: thai league 1",               83],
  ["thailand: thai league",                 83],
  ["india: indian super league",            84],
  ["india: isl",                            84],

  // ── Other notable European leagues (still shown) ──────────────────────────
  ["scotland: premiership",                 85],
  ["russia: premier league",                86],
  ["ukraine: premier league",               87],
  ["greece: super league",                  88],
  ["austria: bundesliga",                   89],   // ⚠ before generic "bundesliga" — safe (prefixed by "austria:")
  ["switzerland: super league",             90],
  ["poland: ekstraklasa",                   91],
  ["romania: superliga",                    92],

  // ── Block lower divisions / amateur / regional ─────────────────────────────
  ["spain: primera rfef",                  999],
  ["spain: segunda rfef",                  999],
  ["spain: tercera rfef",                  999],
  ["spain: rfef",                          999],
  ["england: league one",                  999],
  ["england: league two",                  999],
  ["england: national league",             999],
  ["italy: serie c",                       999],
  ["italy: serie d",                       999],
  ["france: national",                     999],
  ["germany: bundesliga women",            999],
  ["china: super league",                  999],
  ["china: chinese super league",          999],
  ["indonesia: liga 1",                    999],
  ["indonesia: bri liga 1",               999],
];

// All countries with explicit domestic league entries (used to detect intl tournaments)
const ALL_DOMESTIC_COUNTRIES = new Set([
  // Europe
  "england", "spain", "germany", "italy", "france", "portugal", "netherlands",
  "scotland", "belgium", "turkey", "greece", "austria", "switzerland", "russia",
  "ukraine", "poland", "czechia", "denmark", "sweden", "norway", "croatia",
  "serbia", "romania", "hungary", "slovakia", "bulgaria", "slovenia",
  "finland", "israel", "cyprus", "andorra", "albania", "moldova", "ireland",
  "wales", "luxembourg", "latvia", "estonia", "lithuania", "bosnia",
  "montenegro", "north macedonia", "kosovo", "iceland", "malta", "georgia",
  "armenia", "azerbaijan", "faroe islands",
  // Americas
  "brazil", "argentina", "mexico", "usa", "chile", "colombia",
  "ecuador", "bolivia", "peru", "uruguay", "paraguay", "venezuela",
  // Asia / Middle East
  "japan", "south korea", "korea", "saudi arabia", "thailand", "india",
]);

function normalizeCountryKey(country?: string): string {
  const raw = (country ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!raw) return "";
  if (raw === "us" || raw === "usa" || raw === "united states" || raw.includes("united states")) return "usa";
  if (raw === "ru" || raw === "russian federation") return "russia";
  if (raw === "ua") return "ukraine";
  if (raw === "gb" || raw === "uk" || raw === "united kingdom") return "england";
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
  if (raw === "cz" || raw === "czech republic" || raw.includes("czech")) return "czechia";
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
  if (raw === "kr" || raw === "korea republic" || raw === "korea") return "south korea";
  if (raw === "th") return "thailand";
  if (raw === "in") return "india";
  return raw;
}

const LIVE_FOOTBALL_COUNTRY_ALLOW = new Set([
  "england", "spain", "germany", "italy", "france", "portugal", "netherlands", "belgium", "turkey",
  "greece", "austria", "scotland", "switzerland", "denmark", "norway", "sweden", "croatia", "serbia",
  "poland", "czechia", "russia", "ukraine", "hungary", "romania", "bulgaria", "israel",
  "brazil", "argentina", "mexico", "chile", "colombia", "usa", "saudi arabia", "japan", "south korea",
  "thailand", "india",
]);

const LIVE_FOOTBALL_FIRST_DIV_ONLY = new Set([
  "india", "thailand", "south korea", "japan", "saudi arabia", "colombia", "chile", "usa", "mexico",
]);

const LIVE_FOOTBALL_FIRST_DIV_PATTERNS: Record<string, string[]> = {
  india: ["india: indian super league", "india: isl"],
  thailand: ["thailand: thai league 1", "thailand: thai league"],
  "south korea": ["south korea: k league 1", "korea: k league 1"],
  japan: ["japan: j1 league", "japan: j.league"],
  "saudi arabia": ["saudi arabia: saudi pro league", "saudi arabia: pro league"],
  colombia: ["colombia: categoria primera a", "colombia: categoría primera a", "colombia: primera a"],
  chile: ["chile: primera division", "chile: primera división"],
  usa: ["usa: mls", "usa: major league soccer"],
  mexico: ["mexico: liga mx"],
};

function isLeagueUniversallyBlocked(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\bu(1[0-9]|2[0-3])\b/.test(lower)) return true;
  if (/\b(under[ -]?\d{2})\b/.test(lower)) return true;
  if (/\b(women|woman|feminine|femenin[ao]|feminino|feminina|ladies|dames|femmes)\b/.test(lower)) return true;
  if (/\b(reserv[ae]s?|b-team|youth|juniores?|juvenil|amateur|futsal|beach|indoor|sala)\b/.test(lower)) return true;
  if (lower.includes("next pro")) return true;
  if (lower.includes("premier league cup")) return true;
  if (lower.includes("league cup") && lower.includes("play offs") && !lower.includes("carabao") && !lower.includes("efl")) return true;
  return false;
}

function footballLeagueAllowedStrict(countryRaw: string, leagueDisplayName: string): boolean {
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ── Block youth / women / reserve / amateur / futsal leagues universally ──────
  // These keywords in the league name ALWAYS indicate a non-main competition.
  // Pattern must precede parent-league match (e.g. "liga mx u21" ⊃ "liga mx").
  if (/\bu(1[0-9]|2[0-3])\b/.test(lower)) return 999;           // U17, U20, U21, U23…
  if (/\b(under[ -]?\d{2})\b/.test(lower)) return 999;          // Under-21, Under 23…
  if (/\b(women|woman|feminine|femenin[ao]|feminino|feminina|ladies|dames|femmes)\b/.test(lower)) return 999;
  if (/\b(reserv[ae]s?|b-team|youth|juniores?|juvenil|amateur|futsal|beach|indoor|sala)\b/.test(lower)) return 999;
  // Specific leagues that slip through keyword checks
  if (lower.includes("next pro"))          return 999;   // MLS Next Pro (development)
  if (lower.includes("premier league cup")) return 999;  // England U21 PL Cup
  if (lower.includes("league cup") && lower.includes("play offs") && !lower.includes("carabao") && !lower.includes("efl")) return 999;

  // Main part of league name (before first " - "), lowercased
  const mainPart = lower.split(" - ")[0];

  for (let i = 0; i < INTL_TOURNAMENTS.length; i++) {
    if (mainPart.includes(INTL_TOURNAMENTS[i])) return i;
  }

  // Domestic leagues — first match wins (order matters for specificity)
  for (const [pattern, rank] of DOMESTIC_PRIORITY) {
    const p = pattern.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (mainPart.includes(p)) return rank;
  }

  // Unknown league → filter out
  return 999;
}

const DEFAULT_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS = 20 * 60 * 1000;
const PRIORITY_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS = 45 * 60 * 1000;

function isCatalogPriorityLeague(prio: number): boolean {
  return prio < 100;
}

function getFootballLiveDisappearGraceMs(state: Pick<LiveMatchState, "league" | "country">): number {
  const countryKey = normalizeCountryKey(state.country);
  const leagueKey = countryKey ? `${countryKey}: ${state.league}` : state.league;
  const prio = leaguePriority(leagueKey, countryKey);
  return isCatalogPriorityLeague(prio)
    ? PRIORITY_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS
    : DEFAULT_FOOTBALL_LIVE_DISAPPEAR_GRACE_MS;
}

// ─── League name normalisation ─────────────────────────────────────────────────
// Strips sponsor/betting-company names and maps to canonical display names.
// Statpal format: "Country: [Sponsor - ]LeagueName"

// Sponsor words that must be removed globally (case-insensitive)
const SPONSOR_STRIP_RE = /\b(betano|betcris|bet365|sportingbet|sportbet|betnacional|betul|bmóvel|bmovel|brb|neoenergia|binance|ebetul|betsson|pinnacle)\b/gi;

// Canonical display names (matched against "country: rawname" in lower-case)
// More-specific entries first.
const CANONICAL_LEAGUES: Array<[RegExp, string]> = [
  // ── Brazil ──────────────────────────────────────────────────────────────────
  [/brazil:.*s[eé]rie\s*b|brazil:.*brasileir[aã]o.*s[eé]rie\s*b/i,     "Brasileirão Série B"],
  [/brazil:.*s[eé]rie\s*a|brazil:.*brasileir[aã]o|brazil:.*betano/i,    "Brasileirão"],
  [/brazil:.*copa\s*do\s*brasil/i,                                        "Copa do Brasil"],
  [/brazil:.*supercopa/i,                                                 "Supercopa do Brasil"],
  [/brazil:.*paulist/i,                                                   "Paulistão"],
  [/brazil:.*carioca/i,                                                   "Carioca"],
  [/brazil:.*mineiro/i,                                                   "Campeonato Mineiro"],
  [/brazil:.*ga[uú]cho/i,                                                 "Gauchão"],
  // ── Ecuador ─────────────────────────────────────────────────────────────────
  [/ecuador:.*liga\s*(pro|betcris)/i,                                     "Liga Pro"],
  // ── Colombia ────────────────────────────────────────────────────────────────
  [/colombia:.*categor[ií]a\s*primera\s*a|colombia:.*primera\s*a/i,      "Categoría Primera A"],
  // ── Portugal ────────────────────────────────────────────────────────────────
  [/portugal:.*liga\s*portugal\s*2|portugal:.*segunda\s*liga/i,           "Liga Portugal 2"],
  [/portugal:.*liga\s*portugal|portugal:.*primeira\s*liga|portugal:.*liga\s*bwin/i, "Liga Portugal"],
  [/portugal:.*ta[cç]a\s*de\s*portugal/i,                                "Taça de Portugal"],
  [/portugal:.*supertar[cç]a|portugal:.*supertaca/i,                     "Supertaça"],
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
  if (colonIdx !== -1 && country && rawName.slice(0, colonIdx).toLowerCase() === country.toLowerCase()) {
    clean = rawName.slice(colonIdx + 2);
  }

  // 3. Remove sponsor words
  clean = clean.replace(SPONSOR_STRIP_RE, "");

  // 4. Clean up dash/whitespace artifacts left by removal
  clean = clean
    .replace(/\s*-\s*-+\s*/g, " ")   // "- - " → " "
    .replace(/^\s*[-–]\s*/, "")       // leading " - "
    .replace(/\s*[-–]\s*$/, "")       // trailing " - "
    .replace(/\s{2,}/g, " ")
    .trim();

  return clean || rawName;
}

// ─── Basketball league priority ────────────────────────────────────────────────
// ORDERING RULE: more-specific patterns before less-specific ("nba cup" before "nba", "del2" before "del")
const BASKETBALL_PRIORITY: Array<[string, number]> = [
  // International club competitions
  ["euroleague",               2],
  ["eurocup",                  3],
  ["fiba",                     4],
  // ── BIG LEAGUES — USA ────────────────────────────────────────────────────────
  ["nba cup",                  3],   // ⚠ BEFORE "nba"
  ["all-star",                 4],
  ["nba",                      1],
  ["g league",                 5],
  // ── BIG LEAGUES — Spain ──────────────────────────────────────────────────────
  ["liga acb",                10],
  ["leb oro",                 11],
  ["copa del rey",            12],
  ["supercopa acb",           13],
  // ── BIG LEAGUES — Turkey ─────────────────────────────────────────────────────
  ["basketbol süper ligi",    15],
  ["basketbol super ligi",    15],
  ["tbl",                     16],
  ["turkish cup",             17],
  ["presidential cup",        18],
  // ── BIG LEAGUES — Greece ─────────────────────────────────────────────────────
  ["greek basket league",     20],
  ["elite league",            21],
  ["greek cup",               22],
  // ── BIG LEAGUES — Italy ──────────────────────────────────────────────────────
  ["lega basket serie a",     25],
  ["serie a2",                26],
  ["coppa italia",            27],
  ["supercoppa italiana",     28],
  // ── BIG LEAGUES — France ─────────────────────────────────────────────────────
  ["lnb pro a",               30],
  ["pro b",                   31],
  ["leaders cup",             32],
  ["coupe de france",         33],
  // ── BIG LEAGUES — Germany ────────────────────────────────────────────────────
  ["basketball bundesliga",   35],
  ["proa",                    36],
  ["bbl-pokal",               37],
  // ── MEDIUM LEAGUES — Portugal ────────────────────────────────────────────────
  ["liga betclic",            50],
  ["proliga",                 51],
  ["taça de portugal",        52],
  ["taca de portugal",        52],
  // ── MEDIUM LEAGUES — Brazil ──────────────────────────────────────────────────
  ["nbb",                     55],
  ["liga ouro",               56],
  ["copa super 8",            57],
  // ── MEDIUM LEAGUES — Argentina ───────────────────────────────────────────────
  ["liga nacional",           60],
  ["liga argentina",          61],
  // ── MEDIUM LEAGUES — Japan ───────────────────────────────────────────────────
  ["b.league",                65],
  ["b2 league",               66],
  ["emperor",                 67],
  // ── MEDIUM LEAGUES — South Korea ─────────────────────────────────────────────
  ["kbl d-league",            71],   // ⚠ BEFORE "kbl"
  ["kbl",                     70],
  // ── MEDIUM LEAGUES — China ───────────────────────────────────────────────────
  ["cba",                     75],
  ["nbl",                     76],
  // ── MEDIUM LEAGUES — Mexico ──────────────────────────────────────────────────
  ["lnbp",                    80],
];

function basketballLeaguePriority(league: string): number {
  const lower = league.toLowerCase();
  for (const [pattern, rank] of BASKETBALL_PRIORITY) {
    if (lower.includes(pattern)) return rank;
  }
  return 999;
}

const BASKETBALL_LIVE_ALLOW_PATTERNS = [
  "nba", "national basketball association",
  "euroleague",
  "liga acb", "acb",
  "basketball bundesliga",
  "lega basket serie a", "serie a",
  "lnb pro a", "proa",
  "chinese basketball association", "cba",
  "b.league", "b league",
  "novo basquete brasil", "nbb",
  "vtb united league", "vtb",
  "basketball super league", "basketbol super ligi", "bsl",
  "liga nacional de basquet", "liga nacional",
  "korean basketball league", "kbl",
  "philippine basketball association", "pba",
];

function basketballLeagueAllowed(countryRaw: string, leagueName: string): boolean {
  const countryKey = normalizeCountryKey(countryRaw);
  const lower = `${countryKey}: ${leagueName}`.toLowerCase();
  if (lower.includes("g league")) return false;
  if (lower.includes("d-league")) return false;
  if (lower.includes("development")) return false;

  if (lower.includes("nbl")) {
    return countryKey === "australia" || lower.includes("australia");
  }

  return BASKETBALL_LIVE_ALLOW_PATTERNS.some((p) => lower.includes(p));
}

// ─── Tennis tournament priority ────────────────────────────────────────────────
// Tennis has no divisions — ranked by tier: Grand Slams > Masters > ATP Finals > 500 > 250 > Challenger > ITF
const TENNIS_PRIORITY: Array<[string, number]> = [
  // Grand Slams
  ["australian open",      1],
  ["roland garros",        2],
  ["wimbledon",            3],
  ["us open",              4],
  // ATP / WTA Finals
  ["atp finals",           5],
  ["wta finals",           6],
  // Davis Cup / Billie Jean King Cup
  ["davis cup",            8],
  ["billie jean",          9],
  ["bjk cup",              9],
  // Masters 1000 / WTA 1000 by location
  ["indian wells",        10],
  ["miami open",          11],
  ["madrid open",         12],
  ["paris masters",       13],   // ⚠ BEFORE "paris"
  ["rome",                14],
  ["toronto",             15],
  ["montreal",            15],
  ["cincinnati",          16],
  ["shanghai",            17],
  ["paris",               18],
  ["masters 1000",        19],
  ["wta 1000",            19],
  // ATP 500 / WTA 500 tournaments
  ["halle",               25],
  ["queen's",             26],
  ["queens",              26],
  ["barcelona",           27],
  ["dubai",               28],
  ["acapulco",            29],
  ["rotterdam",           30],
  ["tokyo",               31],
  ["estoril",             32],
  ["atp 500",             33],
  ["wta 500",             34],
  // ATP 250 / WTA 250 / WTA 125
  ["atp 250",             40],
  ["wta 250",             41],
  ["wta 125",             42],
  // Challengers
  ["challenger",          60],
  // ITF
  ["itf",                 80],
];

function tennisLeaguePriority(name: string): number {
  const lower = name.toLowerCase();
  for (const [pattern, rank] of TENNIS_PRIORITY) {
    if (lower.includes(pattern)) return rank;
  }
  return 500; // unknown tennis tournament — still show (tennis always has real data)
}

// ─── Hockey league priority ─────────────────────────────────────────────────────
// ⚠ "del2" BEFORE "del"; "hockeyallsvenskan" BEFORE "allsvenskan"
const HOCKEY_PRIORITY: Array<[string, number]> = [
  // ── BIG LEAGUES — North America ──────────────────────────────────────────────
  ["nhl",                  1],
  ["ahl",                  5],
  ["echl",                10],
  ["stanley cup",          2],
  // ── BIG LEAGUES — Russia ─────────────────────────────────────────────────────
  ["khl",                 15],
  ["vhl",                 16],
  ["gagarin cup",          4],
  // ── BIG LEAGUES — Sweden ─────────────────────────────────────────────────────
  ["hockeyallsvenskan",   22],   // ⚠ BEFORE generic "allsvenskan" if it ever appears
  ["shl",                 20],
  // ── BIG LEAGUES — Finland ────────────────────────────────────────────────────
  ["liiga",               25],
  ["mestis",              26],
  // ── BIG LEAGUES — Switzerland ────────────────────────────────────────────────
  ["national league",     30],
  ["swiss league",        31],
  // ── BIG LEAGUES — Czech Republic ─────────────────────────────────────────────
  ["extraliga",           35],
  ["chance liga",         36],
  // ── International ────────────────────────────────────────────────────────────
  ["champions hockey",    40],
  // ── MEDIUM LEAGUES — Germany ─────────────────────────────────────────────────
  ["del2",                51],   // ⚠ BEFORE "del"
  ["del",                 50],
  // ── MEDIUM LEAGUES — Austria ─────────────────────────────────────────────────
  ["ice hockey league",   55],
  ["alps hockey",         56],
  // ── MEDIUM LEAGUES — Norway ──────────────────────────────────────────────────
  ["fjordkraft",          60],
  ["eliteserien",         61],
  // ── MEDIUM LEAGUES — Denmark ─────────────────────────────────────────────────
  ["metal ligaen",        65],
  // ── MEDIUM LEAGUES — Slovakia ────────────────────────────────────────────────
  ["slovak extraliga",    70],
  // ── MEDIUM LEAGUES — France ──────────────────────────────────────────────────
  ["ligue magnus",        75],
];

function hockeyLeaguePriority(league: string): number {
  const lower = league.toLowerCase();
  for (const [pattern, rank] of HOCKEY_PRIORITY) {
    if (lower.includes(pattern)) return rank;
  }
  return 999;
}

// ─── Volleyball league priority ─────────────────────────────────────────────────
// ⚠ "volleyball bundesliga" BEFORE "bundesliga"; more-specific league names first
const VOLLEYBALL_PRIORITY: Array<[string, number]> = [
  // ── BIG LEAGUES — 1st division ───────────────────────────────────────────────
  ["superlega",                1],   // Italy 1st div
  ["plusliga",                 3],   // Poland 1st div
  ["efeler ligi",              5],   // Turkey 1st div
  ["sv.league",                6],   // Japan 1st div
  ["russian volleyball super", 7],   // Russia 1st div
  ["superliga",                2],   // Brazil / Russia (broad — after more specific Russia)
  // ── BIG LEAGUES — 2nd division ───────────────────────────────────────────────
  ["serie a2",                10],   // Italy 2nd div (⚠ before "serie a" if it appears)
  ["tauron 1 liga",           12],   // Poland 2nd div
  ["higher league",           14],   // Russia 2nd div
  ["v.league 2",              15],   // Japan 2nd div (⚠ before "v.league")
  ["v.league",                16],   // Japan 1st (catch-all after more specific)
  ["1. lig",                  13],   // Turkey 2nd div
  // ── BIG LEAGUES — Cups & Super Cups ──────────────────────────────────────────
  ["coppa italia",            20],
  ["copa brasil",             21],
  ["polish cup",              22],
  ["turkish cup",             23],
  ["super cup",               24],
  ["russian cup",             25],
  ["emperor",                 26],   // Japan Emperor's Cup
  ["supercoppa",              27],
  // ── MEDIUM LEAGUES — 1st division ────────────────────────────────────────────
  ["ligue a",                 40],   // France 1st div (⚠ before "ligue b")
  ["volleyball bundesliga",   41],   // Germany 1st div (⚠ BEFORE generic "bundesliga")
  ["liga de voleibol",        45],   // Argentina
  ["liga una",                50],   // Portugal
  ["v-league",                55],   // South Korea
  ["chinese volleyball",      60],   // China
  // ── MEDIUM LEAGUES — 2nd division ────────────────────────────────────────────
  ["ligue b",                 70],   // France 2nd div
  ["bundesliga",              71],   // Germany 2nd div
  ["ii divisão",              75],   // Portugal 2nd div
  ["ii divisao",              75],
  // ── MEDIUM LEAGUES — Cups ────────────────────────────────────────────────────
  ["coupe de france",         80],
];

function volleyballLeaguePriority(league: string): number {
  const lower = league.toLowerCase();
  for (const [pattern, rank] of VOLLEYBALL_PRIORITY) {
    if (lower.includes(pattern)) return rank;
  }
  return 999;
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
  const base = s > 0 ? probs.map(p => p / s) : probs.map(() => 1 / probs.length);
  return base.map(p => mr(mc(1 / Math.max(1e-9, p * overround), 1.01, 100)));
}

function modelErf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
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
  return poissonPmf(lambda, Math.max(0, Math.floor(k))).reduce((a, b) => a + b, 0);
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
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function getTeamElo(name: string): number {
  const n = canonName(name);
  const known: Record<string, number> = {
    "manchester city": 1910, "man city": 1910,
    "manchester utd": 1760, "manchester united": 1760, "man utd": 1760,
    "liverpool": 1860, "arsenal": 1830, "chelsea": 1760,
    "tottenham": 1750, "tottenham hotspur": 1750, "spurs": 1750,
    "newcastle": 1740, "newcastle united": 1740,
    "aston villa": 1710, "everton": 1630, "west ham": 1670,
    "west ham united": 1670, "brighton": 1680, "wolves": 1620,
    "wolverhampton": 1620, "wolverhampton wanderers": 1620,
    "nottingham forest": 1600, "brentford": 1610, "fulham": 1610,
    "crystal palace": 1600, "bournemouth": 1580, "burnley": 1540,
    "sheffield united": 1520, "luton": 1500, "leicester": 1580,
    "real madrid": 1910, "barcelona": 1880, "atletico madrid": 1820,
    "atletico de madrid": 1820, "sevilla": 1760, "real sociedad": 1730,
    "villarreal": 1720, "athletic bilbao": 1700, "athletic club": 1700,
    "real betis": 1690, "valencia": 1670, "osasuna": 1620,
    "bay munich": 1910, "bayern munich": 1910, "fc bayern": 1910,
    "borussia dortmund": 1810, "bayer leverkusen": 1800, "rb leipzig": 1790,
    "eintracht frankfurt": 1750, "sc freiburg": 1710, "union berlin": 1690,
    "vfb stuttgart": 1720, "borussia monchengladbach": 1680,
    "psg": 1890, "paris saint germain": 1890, "paris sg": 1890,
    "olympique marseille": 1760, "as monaco": 1770, "olympique lyonnais": 1740,
    "lille": 1740, "rennes": 1700, "nice": 1690,
    "juventus": 1800, "inter": 1830, "internazionale": 1830, "inter milan": 1830,
    "ac milan": 1810, "milan": 1810, "napoli": 1770, "ss lazio": 1740,
    "as roma": 1730, "atalanta": 1780, "fiorentina": 1700,
    "benfica": 1760, "porto": 1760, "sporting": 1740, "sporting cp": 1740,
    "braga": 1680, "vitoria guimaraes": 1620,
    "ajax": 1750, "psv": 1720, "feyenoord": 1710,
    "celtic": 1700, "rangers": 1690,
    "anderlecht": 1650, "club brugge": 1680,
    "galatasaray": 1680, "fenerbahce": 1650, "besiktas": 1620, "trabzonspor": 1580,
    "başakşehir": 1610, "istanbul basaksehir": 1610, "adana demirspor": 1540,
    "konyaspor": 1530, "sivasspor": 1520, "antalyaspor": 1510,
    "kasimpasa": 1500, "gaziantep fk": 1490, "ankaragücü": 1490,
    "hearts": 1640, "heart of midlothian": 1640, "hibernian": 1620,
    "aberdeen": 1600, "dundee united": 1560, "motherwell": 1540, "st mirren": 1520,
    "beijing guoan": 1640, "shanghai port": 1660, "shandong taishan": 1650,
    "guangzhou fc": 1580, "wuhan three towns": 1600, "shenzhen fc": 1550,
    "shanghai shenhua": 1590, "tianjin jinmen tiger": 1540,
    "persija jakarta": 1600, "persebaya surabaya": 1590, "psm makassar": 1580,
    "bali united": 1570, "persib bandung": 1610, "arema fc": 1560,
    "borneo fc": 1550, "bhayangkara fc": 1540,
    "crvena zvezda": 1660, "red star belgrade": 1660,
    "salzburg": 1700, "rb salzburg": 1700,
    "flamengo": 1750, "palmeiras": 1750, "atletico mineiro": 1730,
    "corinthians": 1650, "sao paulo": 1650, "são paulo": 1650,
    "gremio": 1620, "grêmio": 1620, "internacional": 1630, "botafogo": 1640,
    "fluminense": 1650, "vasco": 1590, "cruzeiro": 1620, "atletico go": 1560,
    "boca juniors": 1730, "river plate": 1760, "independiente": 1660,
    "racing club": 1660, "san lorenzo": 1640,
    "america": 1690, "chivas": 1680, "cruz azul": 1650, "pumas": 1630,
    "leon": 1620, "monterrey": 1650, "tigres": 1660,
    // ── National teams — FIFA World Cup 2026 participants (based on FIFA ranking) ─
    "argentina": 1965, "france": 1950, "england": 1940,
    "spain": 1935, "brazil": 1930, "portugal": 1915,
    "netherlands": 1905, "germany": 1890, "belgium": 1885,
    "colombia": 1865, "croatia": 1845, "uruguay": 1835,
    "morocco": 1810, "mexico": 1795, "usa": 1800, "united states": 1800,
    "switzerland": 1782, "japan": 1775, "senegal": 1758,
    "ecuador": 1755, "australia": 1712, "south korea": 1716,
    "iran": 1700, "serbia": 1698, "austria": 1682,
    "scotland": 1675, "turkiye": 1662, "turkey": 1662,
    "canada": 1742, "norway": 1668, "sweden": 1652,
    "algeria": 1622, "czechia": 1632, "czech republic": 1632,
    "paraguay": 1598, "romania": 1618, "egypt": 1562,
    "cote d ivoire": 1582, "ivory coast": 1582, "côte d'ivoire": 1582,
    "ghana": 1538, "tunisia": 1538, "dr congo": 1542, "congo": 1542,
    "iraq": 1572, "jordan": 1565, "uzbekistan": 1582,
    "saudi arabia": 1552, "qatar": 1512,
    "panama": 1542, "south africa": 1538,
    "new zealand": 1498, "cabo verde": 1522, "curaçao": 1452, "curacao": 1452,
    "haiti": 1458, "bosnia & herzegovina": 1558, "bosnia": 1558,
    "bosnia and herzegovina": 1558,
  };
  if (known[n] !== undefined) return known[n]!;
  const h = hashStr(`elo:${n}`);
  return Math.round(1500 + ((h % 1000) / 1000 - 0.5) * 400);
}

function soccerPoissonModel(homeName: string, awayName: string) {
  const homeElo = getTeamElo(homeName);
  const awayElo = getTeamElo(awayName);
  const diff = homeElo + 60 - awayElo;
  const pHomeVsAway = 1 / (1 + Math.exp(-diff / 260));
  const draw = mc(0.28 - Math.abs(diff) / 1400, 0.16, 0.30);
  const rem = mc(1 - draw, 0.01, 0.99);
  const pHome = mc(rem * pHomeVsAway, 0.01, 0.98);
  const pAway = mc(1 - draw - pHome, 0.01, 0.98);
  const goalDiff = mc(diff / 900, -0.6, 0.6);
  const totalLambda = mc(2.65 + Math.min(0.25, Math.abs(goalDiff) * 0.12), 1.8, 3.8);
  const lambdaHome = mc(totalLambda / 2 + goalDiff / 2, 0.2, 3.2);
  const lambdaAway = mc(totalLambda / 2 - goalDiff / 2, 0.2, 3.2);

  const maxG = 10;
  const pH = poissonPmf(lambdaHome, maxG);
  const pA = poissonPmf(lambdaAway, maxG);
  let pHW = 0, pD = 0, pAW = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = pH[i]! * pA[j]!;
      if (i > j) pHW += p; else if (i < j) pAW += p; else pD += p;
    }
  }
  const s = pHW + pD + pAW;
  return {
    lambdaHome, lambdaAway,
    pHomeWin: s > 0 ? pHW / s : pHome,
    pDraw: s > 0 ? pD / s : draw,
    pAwayWin: s > 0 ? pAW / s : pAway,
  };
}

function makeOddsFromTeams(homeName: string, awayName: string): { home: number; draw: number; away: number } {
  const m = soccerPoissonModel(homeName, awayName);
  const [h, d, a] = probsToDecimalOdds([m.pHomeWin, m.pDraw, m.pAwayWin], 1.06);
  return { home: h!, draw: d!, away: a! };
}

function makeAdvancedMarketsFromTeams(homeName: string, awayName: string): AdvancedMarkets {
  const m = soccerPoissonModel(homeName, awayName);
  const { lambdaHome, lambdaAway, pHomeWin, pDraw, pAwayWin } = m;
  const maxG = 10;
  const pH = poissonPmf(lambdaHome, maxG);
  const pA = poissonPmf(lambdaAway, maxG);

  // Double Chance — computed directly from true combined probability (NOT via
  // probsToDecimalOdds which normalises by sum; DC probs sum to 2, which would
  // halve each probability and produce odds ~2× too high).
  const dcMargin = 1.065;
  const dcHD = mr(mc(1 / Math.max(1e-9, (pHomeWin + pDraw)   * dcMargin), 1.01, 50));
  const dcDA = mr(mc(1 / Math.max(1e-9, (pDraw   + pAwayWin) * dcMargin), 1.01, 50));
  const dcHA = mr(mc(1 / Math.max(1e-9, (pHomeWin + pAwayWin) * dcMargin), 1.01, 50));

  // BTTS
  const pBttsYes = mc((1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway)), 0.02, 0.98);
  const [bttsYes, bttsNo] = probsToDecimalOdds([pBttsYes, 1 - pBttsYes], 1.06);

  // Total Goals
  const lambda = lambdaHome + lambdaAway;
  const [o15, u15] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 1), 0.02, 0.98), mc(poissonCdf(lambda, 1), 0.02, 0.98)], 1.06);
  const [o25, u25] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 2), 0.02, 0.98), mc(poissonCdf(lambda, 2), 0.02, 0.98)], 1.06);
  const [o35, u35] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 3), 0.02, 0.98), mc(poissonCdf(lambda, 3), 0.02, 0.98)], 1.06);

  // Handicap -1 and -1.5 for home team
  let pHomeCover1 = 0, pAwayCover1 = 0;
  let pHomeCover15 = 0, pAwayCover15 = 0;
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
  const [hm1H, hm1A] = probsToDecimalOdds([pHomeCover1 / denom1, pAwayCover1 / denom1], 1.07);
  const [hm15H, hm15A] = probsToDecimalOdds([mc(pHomeCover15, 0.02, 0.98), mc(pAwayCover15, 0.02, 0.98)], 1.07);

  // Half-time (lambda scaled by 0.45)
  const htPH = poissonPmf(lambdaHome * 0.45, maxG);
  const htPA = poissonPmf(lambdaAway * 0.45, maxG);
  let htHW = 0, htD = 0, htAW = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = htPH[i]! * htPA[j]!;
      if (i > j) htHW += p; else if (i < j) htAW += p; else htD += p;
    }
  }
  const htS = htHW + htD + htAW;
  const [htH, htX, htA] = probsToDecimalOdds([htHW / htS, htD / htS, htAW / htS], 1.08);

  // First Goal
  const pNoGoal = mc(Math.exp(-(lambdaHome + lambdaAway)), 0.01, 0.20);
  const pFGHome = mc((lambdaHome / (lambdaHome + lambdaAway + 1e-9)) * (1 - pNoGoal), 0.02, 0.90);
  const pFGAway = mc((lambdaAway / (lambdaHome + lambdaAway + 1e-9)) * (1 - pNoGoal), 0.02, 0.90);
  const [fgH, fgNG, fgA] = probsToDecimalOdds([pFGHome, pNoGoal, pFGAway], 1.08);

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
  const [o05, u05] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 0), 0.02, 0.98), mc(poissonCdf(lambda, 0), 0.02, 0.98)], 1.05);
  const [o45, u45] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 4), 0.02, 0.98), mc(poissonCdf(lambda, 4), 0.02, 0.98)], 1.06);
  const [o55, u55] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 5), 0.02, 0.98), mc(poissonCdf(lambda, 5), 0.02, 0.98)], 1.06);
  const [o65, u65] = probsToDecimalOdds([mc(1 - poissonCdf(lambda, 6), 0.02, 0.98), mc(poissonCdf(lambda, 6), 0.02, 0.98)], 1.06);
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
      if ((i - ahLine) > j) pAHHome += p;
    }
  }
  const [ahH, ahA] = probsToDecimalOdds([mc(pAHHome, 0.05, 0.95), mc(1 - pAHHome, 0.05, 0.95)], 1.05);

  // HT/FT — joint model via two independent halves
  const h1PH = poissonPmf(lambdaHome * 0.45, 7);
  const h1PA = poissonPmf(lambdaAway * 0.45, 7);
  const h2PH = poissonPmf(lambdaHome * 0.55, 7);
  const h2PA = poissonPmf(lambdaAway * 0.55, 7);
  let hftHH = 0, hftHD = 0, hftHA = 0;
  let hftDH = 0, hftDD = 0, hftDA = 0;
  let hftAH = 0, hftAD = 0, hftAA = 0;
  for (let i1 = 0; i1 <= 7; i1++) {
    for (let j1 = 0; j1 <= 7; j1++) {
      const pHT = (h1PH[i1] ?? 0) * (h1PA[j1] ?? 0);
      const htR = i1 > j1 ? 1 : i1 < j1 ? -1 : 0;
      for (let i2 = 0; i2 <= 7; i2++) {
        for (let j2 = 0; j2 <= 7; j2++) {
          const pFT = (h2PH[i2] ?? 0) * (h2PA[j2] ?? 0);
          const pJoint = pHT * pFT;
          const ftR = (i1 + i2) > (j1 + j2) ? 1 : (i1 + i2) < (j1 + j2) ? -1 : 0;
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
  const htftProbs = [hftHH, hftHD, hftHA, hftDH, hftDD, hftDA, hftAH, hftAD, hftAA];
  const htftTotal = htftProbs.reduce((a, b) => a + b, 0);
  const htftOdds = probsToDecimalOdds(htftProbs.map(p => mc(p / Math.max(1e-9, htftTotal), 0.005, 0.80)), 1.12);

  // Second Half Result — marginalise over 2nd-half Poisson distributions (h2PH / h2PA)
  let sh2H = 0, sh2X = 0, sh2A = 0;
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      const p = (h2PH[i] ?? 0) * (h2PA[j] ?? 0);
      if (i > j) sh2H += p;
      else if (i === j) sh2X += p;
      else sh2A += p;
    }
  }
  const [sh2OddsH, sh2OddsX, sh2OddsA] = probsToDecimalOdds(
    [mc(sh2H, 0.02, 0.96), mc(sh2X, 0.02, 0.96), mc(sh2A, 0.02, 0.96)], 1.08
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
  const csOdds = probsToDecimalOdds(topScores.map(s => mc(s[1] / topTotal, 0.005, 0.60)), 1.18);
  const correctScore: Record<string, number> = {};
  topScores.forEach(([score], idx) => { correctScore[score] = csOdds[idx]!; });
  correctScore["Outro"] = mr(mc(1 / mc(pOther / topTotal / 1.18, 0.005, 0.60), 1.01, 500));

  // Corners — Poisson model: λ ≈ 9.5 + attacking proxy
  const lambdaCorners = mc(9.5 + (lambdaHome + lambdaAway) * 0.85, 7, 14);
  const [oc85, uc85] = probsToDecimalOdds([mc(1 - poissonCdf(lambdaCorners, 8), 0.02, 0.98), mc(poissonCdf(lambdaCorners, 8), 0.02, 0.98)], 1.06);
  const [oc95, uc95] = probsToDecimalOdds([mc(1 - poissonCdf(lambdaCorners, 9), 0.02, 0.98), mc(poissonCdf(lambdaCorners, 9), 0.02, 0.98)], 1.06);
  const [oc105, uc105] = probsToDecimalOdds([mc(1 - poissonCdf(lambdaCorners, 10), 0.02, 0.98), mc(poissonCdf(lambdaCorners, 10), 0.02, 0.98)], 1.06);

  // Cards — Poisson model: λ ≈ 4.0 + competitive pressure
  const lambdaCards = mc(4.0 + Math.abs(lambdaHome - lambdaAway) * 0.7, 2.5, 7);
  const [ocard35, ucard35] = probsToDecimalOdds([mc(1 - poissonCdf(lambdaCards, 3), 0.02, 0.98), mc(poissonCdf(lambdaCards, 3), 0.02, 0.98)], 1.06);
  const [ocard45, ucard45] = probsToDecimalOdds([mc(1 - poissonCdf(lambdaCards, 4), 0.02, 0.98), mc(poissonCdf(lambdaCards, 4), 0.02, 0.98)], 1.06);

  // ── New football markets derived from existing Poisson λH/λA ─────────────
  // Win to Nil: team wins AND opponent scores 0 at full time
  const pWTNHome = mc((1 - Math.exp(-lambdaHome)) * Math.exp(-lambdaAway), 0.02, 0.75);
  const pWTNAway = mc(Math.exp(-lambdaHome) * (1 - Math.exp(-lambdaAway)), 0.02, 0.75);
  const wtnHOdds = mr(mc(1 / (pWTNHome * 0.935), 1.01, 50));
  const wtnAOdds = mr(mc(1 / (pWTNAway * 0.935), 1.01, 50));

  // Clean Sheet: team's goal tally for opponent is 0 at FT
  const pCSHome = mc(Math.exp(-lambdaAway), 0.03, 0.97);
  const pCSAway = mc(Math.exp(-lambdaHome), 0.03, 0.97);
  const csHOdds = mr(mc(1 / (pCSHome * 0.935), 1.01, 20));
  const csAOdds = mr(mc(1 / (pCSAway * 0.935), 1.01, 20));

  // Odd/Even total goals
  let pOddG = 0, pEvenG = 0;
  for (let k = 0; k <= maxG; k++) {
    if (k % 2 === 0) pEvenG += pmfTotal[k]!;
    else pOddG += pmfTotal[k]!;
  }
  const [goalOddO, goalEvenO] = probsToDecimalOdds([mc(pOddG, 0.30, 0.70), mc(pEvenG, 0.30, 0.70)], 1.06);

  // Exact Goals (0 / 1 / 2 / 3 / 4 / 5+)
  const pG5plus = mc(1 - poissonCdf(lambda, 4), 0.005, 0.90);
  const egProbs = [
    mc(pmfTotal[0] ?? 0, 0.005, 0.80), mc(pmfTotal[1] ?? 0, 0.005, 0.80),
    mc(pmfTotal[2] ?? 0, 0.005, 0.80), mc(pmfTotal[3] ?? 0, 0.005, 0.80),
    mc(pmfTotal[4] ?? 0, 0.005, 0.80), pG5plus,
  ];
  const egOddsArr = probsToDecimalOdds(egProbs, 1.15);

  // BTTS in 1st half
  const pBtts1HYes = mc((1 - Math.exp(-lambdaHome * 0.45)) * (1 - Math.exp(-lambdaAway * 0.45)), 0.02, 0.85);
  const [b1HYes, b1HNo] = probsToDecimalOdds([pBtts1HYes, 1 - pBtts1HYes], 1.07);

  // Win Both Halves — team wins 1st half AND 2nd half (using h1/h2 PMFs above)
  let pHWin1H = 0, pAWin1H = 0, pHWin2H = 0, pAWin2H = 0;
  for (let i = 0; i <= 7; i++) {
    for (let j = 0; j <= 7; j++) {
      const p1 = (h1PH[i] ?? 0) * (h1PA[j] ?? 0);
      if (i > j) pHWin1H += p1; else if (j > i) pAWin1H += p1;
      const p2 = (h2PH[i] ?? 0) * (h2PA[j] ?? 0);
      if (i > j) pHWin2H += p2; else if (j > i) pAWin2H += p2;
    }
  }
  const pHomeBothH = mc(pHWin1H * pHWin2H, 0.01, 0.80);
  const pAwayBothH = mc(pAWin1H * pAWin2H, 0.01, 0.80);
  const wbhHOdds = mr(mc(1 / (pHomeBothH * 0.935), 1.01, 100));
  const wbhAOdds = mr(mc(1 / (pAwayBothH * 0.935), 1.01, 100));

  // Highest Scoring Half — independent Poisson for H1 and H2 total goals
  const pmf1H = poissonPmf(lambda * 0.45, maxG);
  const pmf2H = poissonPmf(lambda * 0.55, maxG);
  let pHSFirst = 0, pHSSecond = 0, pHSEqual = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      const p = (pmf1H[i] ?? 0) * (pmf2H[j] ?? 0);
      if (i > j) pHSFirst += p; else if (j > i) pHSSecond += p; else pHSEqual += p;
    }
  }
  const hsfTot = Math.max(1e-9, pHSFirst + pHSSecond + pHSEqual);
  const [hsfFirstO, hsfSecondO, hsfEqualO] = probsToDecimalOdds(
    [mc(pHSFirst/hsfTot, 0.05, 0.70), mc(pHSSecond/hsfTot, 0.05, 0.70), mc(pHSEqual/hsfTot, 0.05, 0.60)], 1.10
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
  const htCSTotal = Math.max(1e-9, htCSTop.reduce((s, x) => s + x[1], 0) + htCSOther);
  const htCSodds = probsToDecimalOdds(htCSTop.map(s => mc(s[1] / htCSTotal, 0.005, 0.70)), 1.14);
  const htCorrectScore: Record<string, number> = {};
  htCSTop.forEach(([score], idx) => { htCorrectScore[score] = htCSodds[idx]!; });
  htCorrectScore["Outro"] = mr(mc(1 / mc(htCSOther / htCSTotal / 1.14, 0.005, 0.60), 1.01, 500));

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
  const h2CSTotal = Math.max(1e-9, h2CSTop.reduce((s, x) => s + x[1], 0) + h2CSOther);
  const h2CSodds = probsToDecimalOdds(h2CSTop.map(s => mc(s[1] / h2CSTotal, 0.005, 0.70)), 1.14);
  const h2CorrectScore: Record<string, number> = {};
  h2CSTop.forEach(([score], idx) => { h2CorrectScore[score] = h2CSodds[idx]!; });
  h2CorrectScore["Outro"] = mr(mc(1 / mc(h2CSOther / h2CSTotal / 1.14, 0.005, 0.60), 1.01, 500));

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
    totalGoals: { over05: o05!, under05: u05!, over15: o15!, under15: u15!, over25: o25!, under25: u25!, over35: o35!, under35: u35!, over45: o45!, under45: u45!, over55: o55!, under55: u55!, over65: o65!, under65: u65! },
    handicap: { homeMinusOne: hm1H!, awayPlusOne: hm1A!, homeMinusOneHalf: hm15H!, awayPlusOneHalf: hm15A! },
    halfTime: { home: htH!, draw: htX!, away: htA! },
    secondHalf: { home: sh2OddsH!, draw: sh2OddsX!, away: sh2OddsA! },
    firstGoal: { home: fgH!, noGoal: fgNG!, away: fgA! },
    drawNoBet: { home: dnbH!, away: dnbA! },
    asianHandicap: { line: ahLine, home: ahH!, away: ahA! },
    asianTotals: { o05: o05!, u05: u05!, o45: o45!, u45: u45!, o55: o55!, u55: u55!, o225: o225!, u225: u225!, o275: o275!, u275: u275! },
    htft: { hh: htftOdds[0]!, hd: htftOdds[1]!, ha: htftOdds[2]!, dh: htftOdds[3]!, dd: htftOdds[4]!, da: htftOdds[5]!, ah: htftOdds[6]!, ad: htftOdds[7]!, aa: htftOdds[8]! },
    correctScore,
    corners: { o85: oc85!, u85: uc85!, o95: oc95!, u95: uc95!, o105: oc105!, u105: uc105! },
    cards: { o35: ocard35!, u35: ucard35!, o45: ocard45!, u45: ucard45! },
    winToNil:           { home: wtnHOdds,   away: wtnAOdds },
    cleanSheet:         { home: csHOdds,    away: csAOdds },
    goalOddEven:        { odd: goalOddO!,   even: goalEvenO! },
    exactGoals:         { g0: egOddsArr[0]!, g1: egOddsArr[1]!, g2: egOddsArr[2]!, g3: egOddsArr[3]!, g4: egOddsArr[4]!, g5plus: egOddsArr[5]! },
    btts1H:             { yes: b1HYes!,     no: b1HNo! },
    btts2H:             { yes: b1HYes!,     no: b1HNo! },
    toWinBothHalves:    { home: wbhHOdds,   away: wbhAOdds },
    highestScoringHalf: { first: hsfFirstO!, second: hsfSecondO!, equal: hsfEqualO! },
    htCorrectScore,
    h2CorrectScore,
    teamGoals: {
      homeOver05: tgHo05, homeUnder05: tgHu05,
      homeOver15: tgHo15, homeUnder15: tgHu15,
      homeOver25: tgHo25, homeUnder25: tgHu25,
      awayOver05: tgAo05, awayUnder05: tgAu05,
      awayOver15: tgAo15, awayUnder15: tgAu15,
      awayOver25: tgAo25, awayUnder25: tgAu25,
    },
  };
}

// ─── Tennis extras helper ─────────────────────────────────────────────────────
function computeTennisExtras(p: number, overrides?: {
  set1H?: number; set1A?: number; oSets?: number; uSets?: number;
  set2H?: number; set2A?: number; xh20?: number; xh21?: number; xa02?: number; xa12?: number;
  gamesLine?: number; gamesLineRound?: number; oGames?: number; uGames?: number;
  hcapH?: number; hcapA?: number;
}) {
  p = Math.min(0.92, Math.max(0.08, p));
  const sp = Math.min(0.88, Math.max(0.12, 0.5 + (p - 0.5) * 1.25));
  const sp3 = Math.min(0.82, Math.max(0.18, 0.5 + (p - 0.5) * 0.75));

  const raw20 = sp * sp;
  const raw21 = Math.max(0.005, p - raw20);
  const raw02 = (1 - sp) * (1 - sp);
  const raw12 = Math.max(0.005, (1 - p) - raw02);
  const pThreeSets = raw21 + raw12;

  const ssTotal = raw20 + raw21 + raw02 + raw12;
  const [es20, es21, es02, es12] = probsToDecimalOdds(
    [raw20 / ssTotal, raw21 / ssTotal, raw02 / ssTotal, raw12 / ssTotal], 1.10
  );

  const [fsh, fsa] = probsToDecimalOdds([mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)], 1.06);
  const [s2h, s2a] = probsToDecimalOdds([mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)], 1.07);
  const [s3h, s3a] = probsToDecimalOdds([mc(sp3, 0.08, 0.92), mc(1 - sp3, 0.08, 0.92)], 1.09);
  const [shhm15, shaw15] = probsToDecimalOdds([mc(raw20, 0.02, 0.98), mc(1 - raw20, 0.02, 0.98)], 1.06);

  const expGames = 21 * (1 - pThreeSets) + 32 * pThreeSets;
  const logCdfG = (x: number) => 1 / (1 + Math.exp(-(x - expGames) / 4.5));
  const gLines = [19.5, 20.5, 21.5, 22.5, 23.5];
  const totalGamesLines = gLines.map(line => {
    const pU = logCdfG(line);
    const [o, u] = probsToDecimalOdds([mc(1 - pU, 0.02, 0.98), mc(pU, 0.02, 0.98)], 1.07);
    return { line, over: o!, under: u! };
  });
  const mainGamesLine = totalGamesLines[2]!;

  const set1LineApprox = Math.round((9.5 + (1 - Math.abs(sp - 0.5) * 2) * 2) * 2) / 2;
  const pS1Over = mc(0.35 + (0.5 - Math.abs(sp - 0.5)) * 0.3, 0.10, 0.90);
  const [s1go, s1gu] = probsToDecimalOdds([pS1Over, 1 - pS1Over], 1.07);

  const gameDiff = (sp - 0.5) * 8;
  const ghLine = Math.round(gameDiff * 2) / 2;
  const pGHHome = mc(0.5 + (sp - 0.5) * 0.3, 0.05, 0.95);
  const [ghH, ghA] = probsToDecimalOdds([pGHHome, 1 - pGHHome], 1.06);

  return {
    firstSet:        { home: overrides?.set1H ?? fsh!, away: overrides?.set1A ?? fsa! },
    set2:            { home: overrides?.set2H ?? s2h!, away: overrides?.set2A ?? s2a! },
    set3:            { home: s3h!, away: s3a! },
    exactSets:       { h20: overrides?.xh20 ?? es20!, h21: overrides?.xh21 ?? es21!, a02: overrides?.xa02 ?? es02!, a12: overrides?.xa12 ?? es12! },
    setHandicap:     { home: shhm15!, away: shaw15! },
    totalGames:      { line: overrides?.gamesLineRound ?? mainGamesLine.line, over: overrides?.oGames ?? mainGamesLine.over, under: overrides?.uGames ?? mainGamesLine.under },
    totalGamesLines,
    set1Games:       { line: set1LineApprox, over: s1go!, under: s1gu! },
    gameHandicap:    { line: overrides?.gamesLine ?? ghLine, home: overrides?.hcapH ?? ghH!, away: overrides?.hcapA ?? ghA! },
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
  pGame: number,
  margin = 0.065,
): Record<string, number> {
  const qGame = 1 - pGame;
  const comb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
  };
  const validScores: [number, number][] = [
    [6,0],[6,1],[6,2],[6,3],[6,4],[7,5],[7,6],
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,7],[6,7],
  ];
  const probs: Record<string, number> = {};
  let total = 0;
  for (const [H, A] of validScores) {
    if (H < hg || A < ag) continue;
    const rh = H - hg;
    const ra = A - ag;
    let p: number;
    if (H > A) {
      if (rh === 0) continue;
      p = comb(rh + ra - 1, ra) * Math.pow(pGame, rh) * Math.pow(qGame, ra);
    } else {
      if (ra === 0) continue;
      p = comb(rh + ra - 1, rh) * Math.pow(pGame, rh) * Math.pow(qGame, ra);
    }
    if (p <= 0) continue;
    probs[`${H}-${A}`] = p;
    total += p;
  }
  if (total === 0) return {};
  const result: Record<string, number> = {};
  for (const [label, prob] of Object.entries(probs)) {
    const fair = prob / total;
    result[label] = Math.max(1.01, +(1 / (fair * (1 - margin))).toFixed(2));
  }
  return result;
}

// ─── Volleyball extras helper ─────────────────────────────────────────────────
function computeVolleyballExtras(pSetHomeWin: number, overrides?: {
  vs1H?: number; vs1A?: number; vs2H?: number; vs2A?: number; vs3H?: number; vs3A?: number;
  ptsDiffLine?: number; ptsHcapH?: number; ptsHcapA?: number;
}) {
  const sp = Math.min(0.86, Math.max(0.14, pSetHomeWin));
  const raw30 = sp ** 3;
  const raw31 = 3 * sp ** 3 * (1 - sp);
  const raw32 = 6 * sp ** 3 * (1 - sp) ** 2;
  const raw03 = (1 - sp) ** 3;
  const raw13 = 3 * (1 - sp) ** 3 * sp;
  const raw23 = 6 * (1 - sp) ** 3 * sp ** 2;
  const esTotal = raw30 + raw31 + raw32 + raw03 + raw13 + raw23;
  const [vs30, vs31, vs32, vs03, vs13, vs23] = probsToDecimalOdds(
    [raw30 / esTotal, raw31 / esTotal, raw32 / esTotal, raw03 / esTotal, raw13 / esTotal, raw23 / esTotal],
    1.12
  );

  const pHomeMinus15 = mc(raw30 + raw31, 0.02, 0.98);
  const [shh, sha] = probsToDecimalOdds([pHomeMinus15, 1 - pHomeMinus15], 1.06);

  const [s1h, s1a] = probsToDecimalOdds([mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)], 1.06);
  const [s2h, s2a] = probsToDecimalOdds([mc(sp, 0.05, 0.95), mc(1 - sp, 0.05, 0.95)], 1.07);
  const sp3 = Math.min(0.82, Math.max(0.18, 0.5 + (sp - 0.5) * 0.9));
  const [s3h, s3a] = probsToDecimalOdds([mc(sp3, 0.08, 0.92), mc(1 - sp3, 0.08, 0.92)], 1.08);

  const expSets = 3 * (raw30 + raw03) + 4 * (raw31 + raw13) + 5 * (raw32 + raw23);
  const expPts = expSets * 50;
  const logCdfP = (x: number) => 1 / (1 + Math.exp(-(x - expPts) / 15));
  const ptLineNums = [145.5, 150.5, 155.5, 160.5, 165.5];
  const pointsLines = ptLineNums.map(line => {
    const pU = logCdfP(line);
    const [o, u] = probsToDecimalOdds([mc(1 - pU, 0.02, 0.98), mc(pU, 0.02, 0.98)], 1.07);
    return { line, over: o!, under: u! };
  });

  return {
    set1:         { home: overrides?.vs1H ?? s1h!, away: overrides?.vs1A ?? s1a! },
    set2:         { home: overrides?.vs2H ?? s2h!, away: overrides?.vs2A ?? s2a! },
    set3:         { home: overrides?.vs3H ?? s3h!, away: overrides?.vs3A ?? s3a! },
    exactScore:   { s30: vs30!, s31: vs31!, s32: vs32!, s03: vs03!, s13: vs13!, s23: vs23! },
    setHandicap:  { home: shh!, away: sha! },
    pointsLines,
    handicapPoints: { line: overrides?.ptsDiffLine ?? 0, home: overrides?.ptsHcapH ?? s1h!, away: overrides?.ptsHcapA ?? s1a! },
  };
}

// Build advanced markets blending Statpal real odds with Poisson model fallback
function makeAdvancedMarketsReal(
  homeName: string,
  awayName: string,
  types: OddsType[]
): AdvancedMarkets {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = makeAdvancedMarketsFromTeams(homeName, awayName);

  const bttsType = types.find(t => t.name.toLowerCase().includes("both teams"));
  if (bttsType) {
    const bk = Array.isArray(bttsType.bookmaker) ? bttsType.bookmaker[0] : bttsType.bookmaker;
    if (bk?.odd) {
      const odds = Array.isArray(bk.odd) ? bk.odd : [bk.odd];
      const yes = parseFloat2(odds.find(o => o.name === "Yes")?.value);
      const no = parseFloat2(odds.find(o => o.name === "No")?.value);
      if (yes > 0 && no > 0) base.bothTeamsScore = { yes: r(yes), no: r(no) };
    }
  }

  const ouType = types.find(t => t.name.toLowerCase().includes("over/under"));
  if (ouType) {
    const bk = Array.isArray(ouType.bookmaker) ? ouType.bookmaker[0] : ouType.bookmaker;
    if (bk?.total) {
      const totals = Array.isArray(bk.total) ? bk.total : [bk.total];
      const line25 = totals.find(t => t.name === "2.5");
      if (line25) {
        const o25 = Array.isArray(line25.odd) ? line25.odd : [line25.odd];
        const over = parseFloat2(o25.find(o => o.name === "Over")?.value);
        const under = parseFloat2(o25.find(o => o.name === "Under")?.value);
        if (over > 0 && under > 0) { base.totalGoals.over25 = r(over); base.totalGoals.under25 = r(under); }
      }
      const line15 = totals.find(t => t.name === "1.5");
      if (line15) {
        const o15 = Array.isArray(line15.odd) ? line15.odd : [line15.odd];
        const over = parseFloat2(o15.find(o => o.name === "Over")?.value);
        const under = parseFloat2(o15.find(o => o.name === "Under")?.value);
        if (over > 0 && under > 0) { base.totalGoals.over15 = r(over); base.totalGoals.under15 = r(under); }
      }
      const line35 = totals.find(t => t.name === "3.5");
      if (line35) {
        const o35 = Array.isArray(line35.odd) ? line35.odd : [line35.odd];
        const over = parseFloat2(o35.find(o => o.name === "Over")?.value);
        const under = parseFloat2(o35.find(o => o.name === "Under")?.value);
        if (over > 0 && under > 0) { base.totalGoals.over35 = r(over); base.totalGoals.under35 = r(under); }
      }
    }
  }

  return base;
}

// ─── Sport-specific market builders for live matches ─────────────────────────

function makeBasketballMarketsFromTeams(home: string, away: string): AdvancedMarkets {
  const sr = seededRng(`bball-live:${home}:${away}`);
  const marginMean = mc((sr(1) - 0.5) * 14 + 2, -18, 18);
  const marginSd   = mc(11 + sr(2) * 3, 9, 16);
  const mean  = mc(215 + (sr(3) - 0.5) * 30, 170, 250);
  const sd    = mc(14 + sr(4) * 4, 10, 22);
  const split = mc(0.51 + (sr(5) - 0.5) * 0.14, 0.35, 0.65);

  const pHomeML   = mc(1 - normalCdf(-marginMean / marginSd), 0.05, 0.95);
  const mean1H    = mean * 0.5;
  const sd1H      = sd * 0.72;
  const totalLine = Math.round(mean / 5) * 5;
  const total1HLine = Math.round(mean1H / 5) * 5;
  const spreadLine = Math.round(mean * 0.01 + Math.abs(marginMean) * 0.5) * (marginMean >= 0 ? -1 : 1);
  const spread = Math.abs(Math.round(marginMean * 0.8));

  const [oTotal,   uTotal  ] = probsToDecimalOdds([mc(1 - normalCdf((totalLine  - mean)   / sd),   0.05, 0.95), mc(normalCdf((totalLine  - mean)   / sd),   0.05, 0.95)], 1.06);
  const [oTotal1H, uTotal1H] = probsToDecimalOdds([mc(1 - normalCdf((total1HLine - mean1H) / sd1H), 0.05, 0.95), mc(normalCdf((total1HLine - mean1H) / sd1H), 0.05, 0.95)], 1.06);

  const meanHome = mean * split;
  const meanAway = mean * (1 - split);
  const sdTeam   = sd * 0.85;
  const teamTotalLine = Math.round(meanHome / 5) * 5;
  const awayTotalLine = Math.round(meanAway / 5) * 5;
  const [oHT, uHT]     = probsToDecimalOdds([mc(1 - normalCdf((teamTotalLine - meanHome) / sdTeam), 0.05, 0.95), mc(normalCdf((teamTotalLine - meanHome) / sdTeam), 0.05, 0.95)], 1.06);
  const [oAT, uAT]     = probsToDecimalOdds([mc(1 - normalCdf((awayTotalLine - meanAway) / sdTeam), 0.05, 0.95), mc(normalCdf((awayTotalLine - meanAway) / sdTeam), 0.05, 0.95)], 1.06);
  const [spreadH, spreadA] = probsToDecimalOdds([mc(1 - normalCdf((-spread - marginMean) / marginSd), 0.05, 0.95), mc(normalCdf((-spread - marginMean) / marginSd), 0.05, 0.95)], 1.06);

  const pHalfHome = mc(0.5 + (pHomeML - 0.5) * 0.75, 0.15, 0.85);
  const [halfH, halfA] = probsToDecimalOdds([pHalfHome, 1 - pHalfHome], 1.06);
  const [q1H, q1A] = probsToDecimalOdds([mc(0.5 + (pHomeML - 0.5) * 0.55, 0.25, 0.75), mc(0.5 - (pHomeML - 0.5) * 0.55, 0.25, 0.75)], 1.07);
  const [q2H, q2A] = probsToDecimalOdds([mc(0.5 + (pHomeML - 0.5) * 0.50, 0.25, 0.75), mc(0.5 - (pHomeML - 0.5) * 0.50, 0.25, 0.75)], 1.07);
  const [q3H, q3A] = probsToDecimalOdds([mc(0.5 + (pHomeML - 0.5) * 0.48, 0.25, 0.75), mc(0.5 - (pHomeML - 0.5) * 0.48, 0.25, 0.75)], 1.07);
  const [q4H, q4A] = probsToDecimalOdds([mc(0.5 + (pHomeML - 0.5) * 0.52, 0.25, 0.75), mc(0.5 - (pHomeML - 0.5) * 0.52, 0.25, 0.75)], 1.07);

  // Multiple game-total O/U lines: main line ±15 at 2.5-pt increments (13 lines)
  const totalsRange: { line: number; over: number; under: number }[] = [];
  for (let off = -15; off <= 15; off += 2.5) {
    const line = Math.round((totalLine + off) * 10) / 10;
    const [oL, uL] = probsToDecimalOdds([
      mc(1 - normalCdf((line - mean) / sd), 0.02, 0.98),
      mc(normalCdf((line - mean) / sd), 0.02, 0.98),
    ], 1.06);
    totalsRange.push({ line, over: oL!, under: uL! });
  }

  return {
    doubleChance:  { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: 0, no: 0 },
    totalGoals: {
      over05: 0, under05: 0, over15: 0, under15: 0,
      over25: oTotal!, under25: uTotal!,
      over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
    },
    handicap: { homeMinusOne: spreadH!, awayPlusOne: spreadA!, homeMinusOneHalf: oHT!, awayPlusOneHalf: uHT! },
    halfTime: { home: halfH!, draw: 0, away: halfA! },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    _spread:    spread,
    _total:     totalLine,
    _total1H:   total1HLine,
    _spreadLine: spreadLine,
    basketballExtra: {
      q1: { home: q1H!, away: q1A! },
      q2: { home: q2H!, away: q2A! },
      q3: { home: q3H!, away: q3A! },
      q4: { home: q4H!, away: q4A! },
      teamTotalHome: { line: teamTotalLine, over: oHT!, under: uHT! },
      teamTotalAway: { line: awayTotalLine, over: oAT!, under: uAT! },
      totalsRange,
    },
    _extraUsed: { oTotal1H, uTotal1H, oAT, uAT },
  } as unknown as AdvancedMarkets;
}

function makeHockeyMarketsFromTeams(home: string, away: string): AdvancedMarkets {
  const sr = seededRng(`hockey-live:${home}:${away}`);
  const isNHL      = !["Moscow", "Kazan", "SKA", "Metallurg", "Dynamo", "CSKA", "Ak Bars"].some(k => home.includes(k) || away.includes(k));
  const meanTotal  = mc((isNHL ? 6.1 : 5.6) + (sr(1) - 0.5) * 1.6, 4.5, 8.0);
  const marginMean = mc((sr(2) - 0.5) * 2.2 + 0.15, -2.5, 2.5);
  const marginSd   = mc(2.0 + sr(3) * 0.8, 1.6, 3.2);
  const pHomeML    = mc(1 - normalCdf(-marginMean / marginSd), 0.08, 0.92);
  const [plH, plA] = probsToDecimalOdds([pHomeML, 1 - pHomeML], 1.05);

  const totalLine = Math.round(meanTotal * 2) / 2;
  const totalSd   = mc(1.6 + sr(4) * 0.6, 1.2, 2.4);
  const [oTotal, uTotal] = probsToDecimalOdds([mc(1 - normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95), mc(normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95)], 1.06);
  const [oAlt1,  uAlt1 ] = probsToDecimalOdds([mc(1 - normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95), mc(normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95)], 1.06);
  const [oAlt2,  uAlt2 ] = probsToDecimalOdds([mc(1 - normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95), mc(normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95)], 1.06);

  const mean1P = meanTotal / 3;
  const mkPeriod = (hMult: number, aMult: number, si: number) => {
    const lH = mc(mean1P * 0.5 + marginMean * hMult, 0.3, 2.5);
    const lA = mc(mean1P * 0.5 - marginMean * aMult, 0.3, 2.5);
    const pH = poissonPmf(lH, 5); const pA = poissonPmf(lA, 5);
    let hw = 0, d = 0, aw = 0;
    for (let gi = 0; gi <= 5; gi++) for (let gj = 0; gj <= 5; gj++) {
      const p = (pH[gi] ?? 0) * (pA[gj] ?? 0);
      if (gi > gj) hw += p; else if (gi < gj) aw += p; else d += p;
    }
    const s = hw + d + aw;
    const [h, dx, a] = probsToDecimalOdds([hw / s, d / s, aw / s], 1.08);
    return { home: h!, draw: dx!, away: a!, _si: si };
  };
  const p1 = mkPeriod(0.35, 0.35, 5);
  const p2 = mkPeriod(0.20, 0.20, 6);
  const p3 = mkPeriod(0.10, 0.10, 7);

  const per1TotalLine = Math.round(mean1P * 2) / 2;
  const per1TotalSd   = mc(0.9 + sr(15) * 0.4, 0.6, 1.5);
  const [oPer1T, uPer1T] = probsToDecimalOdds([mc(1 - normalCdf((per1TotalLine - mean1P) / per1TotalSd), 0.05, 0.95), mc(normalCdf((per1TotalLine - mean1P) / per1TotalSd), 0.05, 0.95)], 1.06);

  const pBTS = mc(0.70 + (sr(16) - 0.5) * 0.18, 0.45, 0.92);
  const [btsYes, btsNo] = probsToDecimalOdds([pBTS, 1 - pBTS], 1.06);
  const shotsLine = mc((isNHL ? 60.5 : 55.5) + (sr(17) - 0.5) * 8, 48.5, 72.5);
  const [oShots, uShots] = probsToDecimalOdds([mc(0.5 + (sr(18) - 0.5) * 0.12, 0.38, 0.62), mc(0.5 - (sr(18) - 0.5) * 0.12, 0.38, 0.62)], 1.06);

  const per2TotalSd = mc(per1TotalSd * (0.88 + sr(19) * 0.22), 0.5, 1.6);
  const per3TotalSd = mc(per1TotalSd * (0.80 + sr(20) * 0.20), 0.5, 1.6);
  const [oPer2T, uPer2T] = probsToDecimalOdds([mc(1 - normalCdf((per1TotalLine - mean1P) / per2TotalSd), 0.05, 0.95), mc(normalCdf((per1TotalLine - mean1P) / per2TotalSd), 0.05, 0.95)], 1.06);
  const [oPer3T, uPer3T] = probsToDecimalOdds([mc(1 - normalCdf((per1TotalLine - mean1P) / per3TotalSd), 0.05, 0.95), mc(normalCdf((per1TotalLine - mean1P) / per3TotalSd), 0.05, 0.95)], 1.06);

  return {
    doubleChance:  { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: btsYes!, no: btsNo! },
    totalGoals: {
      over05: 0, under05: 0,
      over15: oAlt1!, under15: uAlt1!,
      over25: oTotal!, under25: uTotal!,
      over35: oAlt2!, under35: uAlt2!,
      over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
    },
    handicap: { homeMinusOne: plH!, awayPlusOne: plA!, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
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

// ─── MLB (Baseball) market builder ────────────────────────────────────────────
// Baseball-specific base odds using seeded RNG (NOT soccer Poisson — no draws in baseball)
function makeBaseballBaseOdds(home: string, away: string): { home: number; draw: number; away: number } {
  const sr = seededRng(`mlb-base:${home}:${away}`);
  // MLB is very competitive; most games 1.65–2.50, slight home field advantage
  const pHome = mc(0.52 + (sr(1) - 0.5) * 0.28, 0.32, 0.72);
  const [h, , a] = probsToDecimalOdds([pHome, 0, 1 - pHome], 1.06);
  return { home: h!, draw: 0, away: a! };
}

function makeMLBMarketsFromTeams(home: string, away: string, realHomeOdds?: number, realAwayOdds?: number): AdvancedMarkets {
  const sr = seededRng(`mlb-mkt:${home}:${away}`);
  const meanTotal  = mc(8.5 + (sr(1) - 0.5) * 3.0, 6.5, 12.0);
  const totalLine  = Math.round(meanTotal * 2) / 2;
  const totalSd    = mc(2.5 + sr(2) * 1.0, 1.8, 3.5);
  const [oTotal,  uTotal ] = probsToDecimalOdds([mc(1 - normalCdf((totalLine       - meanTotal) / totalSd), 0.05, 0.95), mc(normalCdf((totalLine       - meanTotal) / totalSd), 0.05, 0.95)], 1.06);
  const [oAlt1,   uAlt1  ] = probsToDecimalOdds([mc(1 - normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95), mc(normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95)], 1.06);
  const [oAlt2,   uAlt2  ] = probsToDecimalOdds([mc(1 - normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95), mc(normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95)], 1.06);
  // Anchor run-line direction from real moneyline odds when available
  let marginMean = mc((sr(3) - 0.5) * 2.0, -2.0, 2.0);
  if (realHomeOdds && realAwayOdds && realHomeOdds > 1 && realAwayOdds > 1) {
    const implH = 1 / realHomeOdds;
    const implA = 1 / realAwayOdds;
    const pHome = mc(implH / (implH + implA), 0.15, 0.85);
    marginMean = mc((pHome - 0.5) * 5.0 + (sr(3) - 0.5) * 0.4, -3.0, 3.0);
  }
  const marginSd   = mc(2.8 + sr(4) * 0.8, 2.2, 4.0);
  const pHomeRL    = mc(1 - normalCdf((-1.5 - marginMean) / marginSd), 0.05, 0.95);
  const [rlH, rlA] = probsToDecimalOdds([pHomeRL, 1 - pHomeRL], 1.06);

  // First 5 innings (F5) markets — starters pitch ~5 innings; smaller run total
  const f5MeanTotal = mc(meanTotal * (5 / 9), 2.5, 7.0);
  const f5TotalLine = Math.round(f5MeanTotal * 2) / 2;
  const f5TotalSd   = mc(totalSd * 0.72, 1.0, 2.5);
  const [oF5T, uF5T] = probsToDecimalOdds([
    mc(1 - normalCdf((f5TotalLine - f5MeanTotal) / f5TotalSd), 0.05, 0.95),
    mc(normalCdf((f5TotalLine - f5MeanTotal) / f5TotalSd), 0.05, 0.95),
  ], 1.06);
  const f5MarginMean = mc(marginMean * 0.65 + (sr(5) - 0.5) * 0.5, -2.0, 2.0);
  const f5MarginSd   = mc(marginSd * 0.9, 2.0, 3.5);
  const f5HomeP = mc(normalCdf(f5MarginMean / f5MarginSd), 0.25, 0.75);
  const [f5H, f5A] = probsToDecimalOdds([f5HomeP, 1 - f5HomeP], 1.06);

  return {
    doubleChance:   { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: 0, no: 0 },
    totalGoals: {
      over05: 0, under05: 0, over15: 0, under15: 0,
      over25: oAlt1!, under25: uAlt1!,
      over35: oTotal!, under35: uTotal!,
      over45: oAlt2!, under45: uAlt2!,
      over55: 0, under55: 0, over65: 0, under65: 0,
    },
    handicap:  { homeMinusOne: rlH!, awayPlusOne: rlA!, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
    halfTime:  { home: 0, draw: 0, away: 0 },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    _spread: 1.5,
    _total:  totalLine,
    mlbExtra: {
      f5Result: { home: f5H!, away: f5A! },
      f5Total:  { line: f5TotalLine, over: oF5T!, under: uF5T! },
    },
  } as unknown as AdvancedMarkets;
}

// ─── Volleyball market builder (probabilistic model for real upcoming matches) ─
/**
 * Given P(home wins match) in a best-of-5 series, return the per-set win
 * probability pSetH via binary search.
 * P(home wins) = p^3 + 3p^3(1-p) + 6p^3(1-p)^2
 */
function impliedPSetH(pMatchH: number): number {
  let lo = 0.10, hi = 0.95;
  for (let i = 0; i < 60; i++) {
    const p = (lo + hi) / 2;
    const pw = p**3 + 3*p**3*(1-p) + 6*p**3*(1-p)**2;
    if (pw < pMatchH) lo = p; else hi = p;
  }
  return (lo + hi) / 2;
}

function makeVolleyballMarketsFromTeams(home: string, away: string, realHomeOdds?: number, realAwayOdds?: number): AdvancedMarkets {
  const sr = seededRng(`vball-mkt:${home}:${away}`);
  let pSetH: number;
  if (realHomeOdds && realAwayOdds && realHomeOdds > 1 && realAwayOdds > 1) {
    // Derive pSetH from real pre-match odds so all set markets are consistent
    const implH = 1 / realHomeOdds;
    const implA = 1 / realAwayOdds;
    const normH = implH / (implH + implA); // normalise for overround
    // Add small seeded noise (±2%) so different matches don't look identical
    const noise = (sr(1) - 0.5) * 0.04;
    pSetH = mc(impliedPSetH(normH) + noise, 0.18, 0.82);
  } else {
    const skillDiff = mc((sr(1) - 0.5) * 0.3 + 0.04, -0.35, 0.35);
    pSetH = mc(0.52 + skillDiff, 0.18, 0.82);
  }
  const p3s = Math.pow(pSetH, 3) + Math.pow(1 - pSetH, 3);
  const p4s = 3 * Math.pow(pSetH, 3) * (1 - pSetH) + 3 * Math.pow(1 - pSetH, 3) * pSetH;
  const p5s = Math.max(0, 1 - p3s - p4s);
  const pMatchH = mc(Math.pow(pSetH, 3) + 3 * Math.pow(pSetH, 3) * (1 - pSetH) + 6 * Math.pow(pSetH, 3) * Math.pow(1 - pSetH, 2) * 0.5, 0.1, 0.9);
  const [matchH, matchA] = probsToDecimalOdds([pMatchH, 1 - pMatchH], 1.05);
  const pUnder25 = mc(p3s + p4s, 0.3, 0.9);
  const [oSets25, uSets25] = probsToDecimalOdds([1 - pUnder25, pUnder25], 1.06);
  const [oSets35, uSets35] = probsToDecimalOdds([mc(p5s, 0.1, 0.6), mc(1 - p5s, 0.4, 0.9)], 1.06);
  const pS1H = mc(pSetH + (sr(7) - 0.5) * 0.08, 0.15, 0.85);
  const pS2H = mc(pSetH + (sr(8) - 0.5) * 0.09, 0.15, 0.85);
  const pS3H = mc(0.5 + (pSetH - 0.5) * 0.55 + (sr(9) - 0.5) * 0.10, 0.15, 0.85);
  const [vs1H, vs1A] = probsToDecimalOdds([pS1H, 1 - pS1H], 1.06);
  const [vs2H, vs2A] = probsToDecimalOdds([pS2H, 1 - pS2H], 1.06);
  const [vs3H, vs3A] = probsToDecimalOdds([pS3H, 1 - pS3H], 1.06);
  const [hcapH, hcapA] = probsToDecimalOdds([mc(p3s * (pSetH / (pSetH + (1 - pSetH))), 0.05, 0.85), mc(1 - p3s * (pSetH / (pSetH + (1 - pSetH))), 0.15, 0.95)], 1.06);
  const meanPts = mc(52 + (sr(5) - 0.5) * 8, 46, 60);
  const sdPts = mc(6 + sr(6) * 2, 4, 10);
  const ptsLine = Math.round(meanPts / 2) * 2;
  const pPtsOver = mc(1 - normalCdf((ptsLine - meanPts) / sdPts), 0.05, 0.95);
  const [oPts, uPts] = probsToDecimalOdds([pPtsOver, 1 - pPtsOver], 1.06);
  const ptsDiffMean = mc((pSetH - 0.5) * 14, -10, 10);
  const ptsDiffLine = Math.round(Math.abs(ptsDiffMean) * 0.5 + 1.5) * (ptsDiffMean >= 0 ? -1 : 1);
  const ptsDiffSd = mc(4 + sr(10) * 2, 3, 7);
  const pPtsHcapHome = mc(1 - normalCdf((-Math.abs(ptsDiffLine) - ptsDiffMean) / ptsDiffSd), 0.05, 0.95);
  const [ptsHcapH, ptsHcapA] = probsToDecimalOdds([pPtsHcapHome, 1 - pPtsHcapHome], 1.06);
  return {
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    bothTeamsScore: { yes: oPts!, no: uPts! },
    totalGoals: {
      over05: 0, under05: 0,
      over15: oSets25!, under15: uSets25!,
      over25: oSets35!, under25: uSets35!,
      over35: hcapH!, under35: hcapA!,
      over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
    },
    handicap: { homeMinusOne: hcapH!, awayPlusOne: hcapA!, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
    halfTime: { home: 0, draw: 0, away: 0 },
    firstGoal: { home: 0, noGoal: 0, away: 0 },
    _total: ptsLine,
    _spread: matchH!,
    volleyballExtra: computeVolleyballExtras(pSetH, {
      vs1H: vs1H!, vs1A: vs1A!, vs2H: vs2H!, vs2A: vs2A!, vs3H: vs3H!, vs3A: vs3A!,
      ptsDiffLine, ptsHcapH: ptsHcapH!, ptsHcapA: ptsHcapA!,
    }),
  } as unknown as AdvancedMarkets;
}

// ─── SportsAPI Pro V2 Live Response Types ─────────────────────────────────────

type SAPIV2ScoreObj = {
  current?: number; display?: number;
  period1?: number; period2?: number; period3?: number; period4?: number;
  innings?: Record<string, { run?: number | null }>;
  inningsBaseball?: { run?: number; hits?: number; errors?: number };
  /** Tennis only: current game score — "0" | "15" | "30" | "40" | "AD" | "D" */
  point?: string;
};
type SAPIV2StatusObj = { code?: number; description?: string; type?: string };
type SAPIV2TournObj  = {
  id?: number; name?: string; slug?: string;
  category?: { name?: string; slug?: string; id?: number; country?: { name?: string; alpha2?: string } };
};

function tennisTierRank(name: string): number {
  const n = String(name ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!n) return 999;

  if (
    n.includes("wimbledon") ||
    n.includes("roland garros") ||
    n.includes("french open") ||
    n.includes("australian open") ||
    n.includes("us open") ||
    n.includes("grand slam")
  ) return 1;

  if (
    n.includes("atp finals") ||
    n.includes("nitto") ||
    n.includes("wta finals")
  ) return 2;

  if (
    n.includes("masters 1000") ||
    n.includes("atp masters") ||
    n.includes("wta 1000") ||
    /\b(m1000)\b/.test(n)
  ) return 3;

  if (n.includes("atp 500") || n.includes("wta 500")) return 4;
  if (n.includes("atp 250") || n.includes("wta 250")) return 5;

  if (
    n.includes("challenger") ||
    n.includes("wta 125") ||
    n.includes("wta-125")
  ) return 6;

  if (
    n.includes("itf") ||
    n.includes("world tennis tour") ||
    /\b(w|m)\d{2,3}\b/.test(n)
  ) return 7;

  return 999;
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

/** Live filter: ATP/WTA/Challenger + ITF singles. Excludes doubles/wheelchair/juniors. */
function isTennisElite(ev: SAPIV2Event): boolean {
  const t = ev.tournament;
  if (typeof t !== "object") return false;
  const tier = tennisTierRank(t.name ?? t.category?.name ?? "");
  if (tier === 999) return false;
  if (isTennisExcludedName(t.name ?? "")) return false;
  // Detect doubles by player name: any "/" in the name means "Player A / Player B" (doubles pair)
  const homeName = typeof ev.homeTeam === "object" ? (ev.homeTeam.name ?? "") : (ev.homeTeam ?? "");
  const awayName = typeof ev.awayTeam === "object" ? (ev.awayTeam.name ?? "") : (ev.awayTeam ?? "");
  if (homeName.includes(" / ") || awayName.includes(" / ")) return false;
  return true;
}

/** Upcoming filter: top-tier only (ATP/WTA/Challenger/WTA-125). No ITF in pre-match. */
function isTennisEliteUpcoming(ev: SAPIV2Event): boolean {
  const t = ev.tournament;
  if (typeof t !== "object") return false;
  const tier = tennisTierRank(t.name ?? t.category?.name ?? "");
  if (tier === 999) return false;
  return !isTennisExcludedName(t.name ?? "");
}
type SAPIV2TeamObj   = { id?: number; name: string };

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

type V2RedCards = { home: number; away: number };
type V2RedCardsEntry = V2RedCards & { fetchedAt: number };
const v2FootballRedCardsCache = new Map<number, V2RedCardsEntry>();
const V2_RED_CARDS_TTL_MS = 45_000;

async function getFootballV2RedCards(matchId: number): Promise<V2RedCards | null> {
  const cached = v2FootballRedCardsCache.get(matchId);
  if (cached && Date.now() - cached.fetchedAt < V2_RED_CARDS_TTL_MS) return { home: cached.home, away: cached.away };
  try {
    const resp = await fetch(`${SAPI_V2_FOOTBALL}/match/${matchId}/statistics`, {
      signal: AbortSignal.timeout(6000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    const get = (o: unknown, path: string[]): unknown => {
      let cur: unknown = o;
      for (const k of path) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[k];
      }
      return cur;
    };
    const toArr = (v: unknown): Record<string, unknown>[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v.filter(x => x && typeof x === "object") as Record<string, unknown>[];
      if (typeof v === "object") return [v as Record<string, unknown>];
      return [];
    };
    const redCount = (side: "home" | "away"): number => {
      const ev = get(data, ["event_summary"]) as Record<string, unknown> | undefined;
      const s = (ev?.[side] as Record<string, unknown> | undefined) ?? undefined;
      const r = toArr((s?.["redcards"] as Record<string, unknown> | undefined)?.["event"]);
      return r.length;
    };
    const out = { home: redCount("home"), away: redCount("away") };
    v2FootballRedCardsCache.set(matchId, { ...out, fetchedAt: Date.now() });
    return out;
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
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Lisbon", hour: "numeric", hour12: false }).format(now)
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
function v2TournName(t: string | SAPIV2TournObj | undefined): string {
  if (!t) return "Unknown";
  return typeof t === "string" ? t : (t.name ?? "Unknown");
}

/**
 * Returns true if the raw event (Record<string, unknown>) belongs to the primary
 * competition we show for a given sport.  Used by getV2TournamentIds and
 * getUpcomingLeagueEventsV2 to exclude non-target tournaments.
 */
function isMainLeagueEventRaw(sport: SportKey, e: Record<string, unknown>): boolean {
  if (sport === "football") return true;
  const t = e["tournament"] as Record<string, unknown> | undefined;
  const slug = (String(t?.["slug"] ?? "")).toLowerCase();
  const name = (String(t?.["name"] ?? "")).toLowerCase();
  switch (sport) {
    case "basketball":
      // Match NBA or NBA Playoffs; exclude WNBA (slug/name contains "nba" but also "wnba")
      return (slug.includes("nba") || name.includes("nba")) && !slug.includes("wnba") && !name.includes("wnba");
    case "hockey":
      return slug.includes("nhl") || name.includes("nhl");
    case "baseball":
      return slug.includes("mlb") || name.includes("mlb");
    case "tennis": {
      const cat = String((t?.["category"] as Record<string, unknown> | undefined)?.["name"] ?? "");
      if (cat !== "ATP" && cat !== "WTA") return false;
      // The V2 API may have wrong slugs for doubles/qualifying — check the name too
      if (name.includes("double") || name.includes("qualifying")) return false;
      if (slug.includes("double") || slug.includes("qualifying")) return false;
      return true;
    }
    default: return true;
  }
}

// ─── Caches ───────────────────────────────────────────────────────────────────

// v2/live: cache 30s
let liveCache: StatpalLeagueV2[] | null = null;
let liveFetchedAt = 0;
let liveIsFetching = false;
// Track Statpal's own updated_ts so we can detect a frozen feed
let liveFeedUpdatedTs = 0;

// ─── SSE + WebSocket clients ───────────────────────────────────────────────────
interface SSEClient { write: (chunk: string) => boolean; }
const sseClients = new Set<SSEClient>();
const wsLiveClients = new Set<WsClient>();
let broadcastInProgress = false;
// When a score patch arrives while a broadcast is already running, set this flag
// so the broadcast runs again immediately after finishing (instead of being dropped).
let broadcastPending = false;
let consecutiveEmptyBroadcasts = 0;
let lastBroadcastAt = 0;

setInterval(() => {
  if (sseClients.size === 0 && wsLiveClients.size === 0) return;
  const now = Date.now();
  if (now - lastBroadcastAt < 900) return;
  broadcastLive().catch(() => {});
}, 1000);

// v2/daily today: cache 5min
let dailyCache: StatpalLeagueV2[] | null = null;
let dailyFetchedAt = 0;

// v2/daily tomorrow: cache 30min
let dailyTomorrowCache: StatpalLeagueV2[] | null = null;
let dailyTomorrowFetchedAt = 0;

// v2/daily offsets 2–6 (days 3–7 ahead): cache 10min per slot
const dailyFutureCache = new Map<number, { data: StatpalLeagueV2[]; fetchedAt: number }>();
const DAILY_FUTURE_TTL = 10 * 60_000;

// V2 /api/today caches — 60s TTL (includes not-started + live events for the current day)
let footballTodayV2Cache: SAPIV2Event[] | null = null;
let footballTodayV2FetchedAt = 0;
let basketballTodayV2Cache: SAPIV2Event[] | null = null;
let basketballTodayV2FetchedAt = 0;
let hockeyTodayV2Cache: SAPIV2Event[] | null = null;
let hockeyTodayV2FetchedAt = 0;
let tennisTodayV2Cache: SAPIV2Event[] | null = null;
let tennisTodayV2FetchedAt = 0;
let baseballTodayV2Cache: SAPIV2Event[] | null = null;
let baseballTodayV2FetchedAt = 0;
const TODAY_V2_TTL = 60_000;

// v1 odds: map from match numeric ID → real odds; cache 10min
type RealOdds = { home: number; draw: number; away: number; types: OddsType[] };
let oddsMap: Map<string, RealOdds> | null = null;
let oddsFetchedAt = 0;

// NHL livescores cache (30s)
type NHLGoalEvent = {
  min: string; player: string; playerid: string;
  result: string; team: string; type: string;
  assist: string; comment: string;
};
type NHLPeriodData = { score?: string; event?: NHLGoalEvent | NHLGoalEvent[] };
type NHLMatch = {
  id: string; fix_id: string; status: string; time: string; timer: string; date?: string;
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
type NHLTournament = { country: string; gid: string; id: string; league: string; match: NHLMatch | NHLMatch[] };
let nhlLiveCache: NHLTournament[] | null = null;
let nhlLiveFetchedAt = 0;

// ─── MLB (Baseball) types ─────────────────────────────────────────────────────
type MLBTeam = {
  id: string; name: string; totalscore: string; r: string; hits: string; errors: string;
  in1: string; in2: string; in3: string; in4: string; in5: string;
  in6: string; in7: string; in8: string; in9: string;
};
type MLBMatch = {
  id: string; status: string; time: string; date?: string; datetime_utc?: string;
  venue_name?: string; outs?: string;
  home: MLBTeam; away: MLBTeam;
  starting_pitchers?: {
    home?: { player?: { id: string; name: string } };
    away?: { player?: { id: string; name: string } };
  };
};
type MLBTournament = { country: string; id: string; league: string; match: MLBMatch | MLBMatch[] };
let mlbLiveCache: MLBTournament[] | null = null;
let mlbLiveFetchedAt = 0;
// Raw odds map (home|away → real odds) kept across cache refreshes — includes games already started
const mlbRawOddsMap = new Map<string, { h: number; a: number }>();
// Sticky live: once a game is seen as live, keep it in the feed for up to 4 min
// even if the API temporarily returns a non-live status (between-inning transitions, API glitches)
const mlbLiveStickyMap = new Map<string, { match: LiveMatchState; lastSeenMs: number }>();
const MLB_STICKY_TTL_MS = 4 * 60 * 1_000; // 4 minutes grace period

type NBAMatch = {
  id: string; stats_id?: string; status: string; time: string; timer: string; date?: string;
  home: { id: string; name: string; ot?: string; q1?: string; q2?: string; q3?: string; q4?: string; totalscore: string };
  away: { id: string; name: string; ot?: string; q1?: string; q2?: string; q3?: string; q4?: string; totalscore: string };
};
type NBATournament = { country: string; gid: string; id: string; league: string; match: NBAMatch | NBAMatch[] };
let nbaLiveCache: NBATournament[] | null = null;
let nbaLiveFetchedAt = 0;

// Tennis livescores cache (30s)
type TennisPlayer = {
  id: string; name: string;
  s1: string; s2: string; s3: string; s4: string; s5: string;
  game_score: string;   // "0" | "15" | "30" | "40" | "AD" | ""
  serve: string;        // "True" | "False"
  totalscore: string;   // sets won
  winner: string;
  dp1?: string; dp2?: string;
};
type TennisMatch = { id: string; status: string; time: string; date: string; tb: string; player: TennisPlayer | TennisPlayer[] };
type TennisTournament = { id: string; name: string; match: TennisMatch | TennisMatch[] };
let tennisLiveCache: TennisTournament[] | null = null;
let tennisLiveFetchedAt = 0;
const TENNIS_LIVE_CACHE_TTL = 2_000; // 2s — real-time tennis points

// Tennis match stats (parsed from livestats endpoint)
type TennisStatData = {
  aces: number;
  doubleFaults: number;
  firstServePct: string;   // e.g. "66%"
  winners: number;
  unforcedErrors: number;
};
type TennisStatsPlayerRaw = {
  id: string; name: string;
  stats?: {
    period?: Array<{
      name: string;
      type?: Array<{ name: string; stat?: Array<{ name: string; value: string }> }>;
    }>;
  };
};
type TennisStatsTournament = {
  id: string; name: string;
  match: { id: string; player: TennisStatsPlayerRaw | TennisStatsPlayerRaw[] }
       | Array<{ id: string; player: TennisStatsPlayerRaw | TennisStatsPlayerRaw[] }>;
};
let tennisStatsCache: Map<string, [TennisStatData, TennisStatData]> | null = null;
let tennisStatsFetchedAt = 0;

// Volleyball livescores cache (30s)
type VolleyTeam = { id: string; name: string; s1: string; s2: string; s3: string; s4: string; s5: string; totalscore: string };
type VolleyMatch = { id: string; status: string; time: string; date: string; home: VolleyTeam; away: VolleyTeam };
type VolleyTournament = { id: string; gid: string; country: string; league: string; match: VolleyMatch | VolleyMatch[] };
let volleyLiveCache: VolleyTournament[] | null = null;
let volleyLiveFetchedAt = 0;

// SportsAPI Pro V2 live caches (30s each sport)
let footballLiveV2Cache: SAPIV2Event[] | null = null;
let footballLiveV2FetchedAt = 0;
let basketballLiveV2Cache: SAPIV2Event[] | null = null;
let basketballLiveV2FetchedAt = 0;
let hockeyLiveV2Cache: SAPIV2Event[] | null = null;
let hockeyLiveV2FetchedAt = 0;
let baseballLiveV2Cache: SAPIV2Event[] | null = null;
let baseballLiveV2FetchedAt = 0;
let tennisLiveV2Cache: SAPIV2Event[] | null = null;
let tennisLiveV2FetchedAt = 0;

// V1 tennis native format (all endpoint — different schema from SAPIV2Event)
interface V1TennisGame {
  id: number;
  competitionId?: number;
  competitionDisplayName?: string;
  startTime: string;
  statusGroup?: number; // 1=live, 2=scheduled, 3=finished
  statusText?: string;
  homeCompetitor?: { id?: number; name?: string; score?: number; isWinner?: boolean };
  awayCompetitor?: { id?: number; name?: string; score?: number; isWinner?: boolean };
  stageName?: string;
  roundName?: string;
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
  status: string;   // "Finished" | "Retired" | "Walkover"
  tournament: string;
  date: string;
  time: string;
};
let tennisResultsCache: TennisDailyResult[] | null = null;
let tennisResultsFetchedAt = 0;
const RESULTS_CACHE_TTL = 5 * 60 * 1000; // 5 min

// Volleyball yesterday results
type VolleyDailyResult = {
  id: string; home: string; away: string;
  homeSets: number; awaySets: number;
  sets: Array<[number, number]>;
  homeWon: boolean;
  league: string; country: string; date: string; time: string;
};
let volleyResultsCache: VolleyDailyResult[] | null = null;
let volleyResultsFetchedAt = 0;

// NHL season schedule
type NHLTeamStats = {
  shotsOnGoal: number; savesPct: number;
  ppGoals: number; ppPct: number;
  penKillPct: number; faceoffPct: number; penaltyMinutes: number;
};
type HockeyScheduleMatch = {
  id: string; date: string; time: string; status: string; venue?: string;
  home: string; away: string;
  homeScore: number; awayScore: number;
  periods: Array<[number, number]>;
  homeWon?: boolean;
  teamStats?: { home: NHLTeamStats; away: NHLTeamStats };
};
type HockeyScheduleData = {
  league: string; season: string;
  upcomingMatches: HockeyScheduleMatch[];
  recentMatches: HockeyScheduleMatch[];
};
let hockeyScheduleCache: HockeyScheduleData | null = null;
let hockeyScheduleFetchedAt = 0;
const HOCKEY_SCHEDULE_TTL = 30 * 60 * 1000;

type MLBScheduleMatch = {
  id: string; date: string; time: string; status: string; venue?: string;
  home: string; away: string;
  homeScore: number; awayScore: number;
  homeWon?: boolean;
};
type MLBScheduleData = {
  league: string; season: string;
  upcomingMatches: MLBScheduleMatch[];
  recentMatches: MLBScheduleMatch[];
};
let mlbScheduleCache: MLBScheduleData | null = null;
let mlbScheduleFetchedAt = 0;
const MLB_SCHEDULE_TTL = 30 * 60 * 1000;

type BasketballScheduleMatch = {
  id: string; date: string; time: string; status: string; venue?: string;
  home: string; away: string;
  homeScore: number; awayScore: number;
  quarters: Array<[number, number]>;
  homeWon?: boolean;
};
type BasketballScheduleData = {
  league: string; season: string;
  upcomingMatches: BasketballScheduleMatch[];
  recentMatches: BasketballScheduleMatch[];
};
let basketballScheduleCache: BasketballScheduleData | null = null;
let basketballScheduleFetchedAt = 0;
const BBALL_SCHEDULE_TTL = 30 * 60 * 1000;

// NHL yesterday results
type HockeyDailyResult = {
  id: string; home: string; away: string;
  homeScore: number; awayScore: number;
  periods: Array<[number, number]>; // P1, P2, P3, [OT], [SO]
  homeWon: boolean;
  league: string; country: string; date: string; time: string;
};
let hockeyResultsCache: HockeyDailyResult[] | null = null;
let hockeyResultsFetchedAt = 0;

type MLBDailyResult = {
  id: string; home: string; away: string;
  homeScore: number; awayScore: number;
  homeHits: number; awayHits: number;
  homeErrors: number; awayErrors: number;
  innings: Array<[number | null, number | null]>; // null = inning not played (walk-off)
  hasExtra: boolean;
  homeWon: boolean;
  league: string; country: string; date: string; time: string;
};
let mlbResultsCache: MLBDailyResult[] | null = null;
let mlbResultsFetchedAt = 0;

type BasketballDailyResult = {
  id: string; home: string; away: string;
  homeScore: number; awayScore: number;
  quarters: Array<[number, number]>; // Q1, Q2, Q3, Q4, [OT]
  homeWon: boolean;
  league: string; country: string; date: string; time: string;
};
let basketballResultsCache: BasketballDailyResult[] | null = null;
let basketballResultsFetchedAt = 0;

// NHL standings
type NHLStandingsTeam = {
  id: string; name: string; abbr: string; position: number;
  gp: number; won: number; lost: number; otLosses: number;
  points: number; gf: number; ga: number; diff: string;
  streak: string; lastTen: string; homeRecord: string; roadRecord: string;
};
type NHLStandingsDivision = { name: string; teams: NHLStandingsTeam[] };
type NHLStandingsConference = { name: string; divisions: NHLStandingsDivision[] };
type NHLStandingsData = { season: string; conferences: NHLStandingsConference[] };
let hockeyStandingsCache: NHLStandingsData | null = null;
let hockeyStandingsFetchedAt = 0;
const HOCKEY_STANDINGS_TTL = 30 * 60 * 1000;

// MLB standings
type MLBStandingsTeam = {
  id: string; name: string; position: number;
  won: number; lost: number; gamesBack: string;
  streak: string; homeRecord: string; awayRecord: string;
  runsScored: number; runsAllowed: number; runsDiff: string;
};
type MLBStandingsDivision = { name: string; teams: MLBStandingsTeam[] };
type MLBStandingsLeague = { name: string; divisions: MLBStandingsDivision[] };
type MLBStandingsData = { season: string; leagues: MLBStandingsLeague[] };
let mlbStandingsCache: MLBStandingsData | null = null;
let mlbStandingsFetchedAt = 0;
const MLB_STANDINGS_TTL = 30 * 60 * 1000;

// MLB roster
type MLBRosterPlayer = {
  id: string; name: string; number: string; age: number;
  position: string; height: string; weight: string; bats: string; throws: string; salary: string;
};
type MLBRosterPosition = { name: string; players: MLBRosterPlayer[] };
type MLBRosterData = { teamName: string; abbreviation: string; season: string; positions: MLBRosterPosition[] };
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
  "Atlanta Hawks": "atl", "Boston Celtics": "bos", "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha", "Chicago Bulls": "chi", "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal", "Denver Nuggets": "den", "Detroit Pistons": "det",
  "Golden State Warriors": "gsw", "Houston Rockets": "hou", "Indiana Pacers": "ind",
  "Los Angeles Clippers": "lac", "Los Angeles Lakers": "lal", "Memphis Grizzlies": "mem",
  "Miami Heat": "mia", "Milwaukee Bucks": "mil", "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "nop", "New York Knicks": "nyk", "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl", "Philadelphia 76ers": "phi", "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por", "Sacramento Kings": "sac", "San Antonio Spurs": "sas",
  "Toronto Raptors": "tor", "Utah Jazz": "uta", "Washington Wizards": "was",
};

type NBAStandingsTeam = {
  id: string; name: string; abbr: string; position: number;
  won: number; lost: number; pct: string; gb: string;
  streak: string; lastTen: string; homeRecord: string; roadRecord: string;
  ppg: string; papg: string; diff: string;
};
type NBAStandingsDivision = { name: string; teams: NBAStandingsTeam[] };
type NBAStandingsConference = { name: string; divisions: NBAStandingsDivision[] };
type NBAStandingsData = { season: string; conferences: NBAStandingsConference[] };
let nbaStandingsCache: NBAStandingsData | null = null;
let nbaStandingsFetchedAt = 0;
const NBA_STANDINGS_TTL = 30 * 60 * 1000;

// NHL rosters
// Abbreviations as accepted by the Statpal roster endpoint (empirically verified)
const NHL_ABBR: Record<string, string> = {
  "Anaheim Ducks": "ana", "Boston Bruins": "bos", "Buffalo Sabres": "buf",
  "Calgary Flames": "cgy", "Carolina Hurricanes": "car", "Chicago Blackhawks": "chi",
  "Colorado Avalanche": "col", "Columbus Blue Jackets": "cbj", "Dallas Stars": "dal",
  "Detroit Red Wings": "det", "Edmonton Oilers": "edm", "Florida Panthers": "fla",
  "Los Angeles Kings": "la", "Minnesota Wild": "min", "Montreal Canadiens": "mtl",
  "Nashville Predators": "nsh", "New Jersey Devils": "nj", "New York Islanders": "nyi",
  "New York Rangers": "nyr", "Ottawa Senators": "ott", "Philadelphia Flyers": "phi",
  "Pittsburgh Penguins": "pit", "San Jose Sharks": "sj", "St. Louis Blues": "stl",
  "Tampa Bay Lightning": "tb", "Toronto Maple Leafs": "tor", "Vancouver Canucks": "van",
  "Washington Capitals": "wsh", "Winnipeg Jets": "wpg",
  // Teams without working roster endpoints on Statpal:
  // Vegas Golden Knights, Seattle Kraken, Arizona Coyotes, Utah Hockey Club
};
type NHLRosterPlayer = {
  id: string; name: string; number: string; age: number;
  birthPlace: string; height: string; weight: string; shot: string; salary: string;
};
type NHLRosterPosition = { name: string; players: NHLRosterPlayer[] };
type NHLRosterData = { teamName: string; abbreviation: string; season: string; positions: NHLRosterPosition[] };
const hockeyRosterCache = new Map<string, NHLRosterData>();
const hockeyRosterFetchedAt = new Map<string, number>();
const HOCKEY_ROSTER_TTL = 60 * 60 * 1000;

// Volleyball season schedule
type VolleyScheduleMatch = {
  id: string; status: string; date: string; time: string;
  home: VolleyTeam; away: VolleyTeam;
};
type VolleyScheduleWeek = { number: string; match: VolleyScheduleMatch | VolleyScheduleMatch[] };
type VolleyLeague = { id: string; gid: string; league: string; country: string };
type VolleyScheduleEntry = {
  id: string; home: string; away: string;
  homeSets: number; awaySets: number;
  sets: Array<[number, number]>;
  homeWon: boolean; date: string; time: string;
};
type VolleyScheduleData = {
  id: string; league: string; season: string; country: string;
  recentWeeks: Array<{ number: string; matches: VolleyScheduleEntry[] }>;
  nextWeek: { number: string; matches: Array<{ id: string; home: string; away: string; date: string; time: string }> } | null;
};
const volleyScheduleCache = new Map<string, { data: VolleyScheduleData; at: number }>();
const VOLLEY_SCHEDULE_TTL = 5 * 60 * 1000;

// Volleyball standings
type VolleyStandingTeam = {
  id: string; name: string; pos: string; gp: string;
  w: string; l: string; pts: string;
  points_for: string; points_against: string;
  recent_form: string;
  description?: { value: string } | string;
};
type VolleyStandingsData = {
  id: string; name: string; season: string; country: string;
  teams: VolleyStandingTeam[];
};
const volleyStandingsCache = new Map<string, { data: VolleyStandingsData; at: number }>();

// Tennis tournament list (ATP + WTA) — active tournaments today
type TournamentRaw = {
  id: string; name: string; category: string;
  surface: string; location: string;
  date_start: string; date_end: string; prize_money: string;
};
type ActiveTournament = TournamentRaw & { tour: "atp" | "wta" };
let tourListCache: ActiveTournament[] | null = null;
let tourListFetchedAt = 0;
const TOUR_CACHE_TTL = 30 * 60 * 1000; // 30 min

// Live state: stable odds across refreshes
export const liveMatchState = new Map<string, LiveMatchState>();

// Finished football match results — populated when matches leave liveMatchState
// and from the daily feed scan. Consumed by the bet auto-settlement worker.
export const finishedMatchResults = new Map<string, {
  home: number;
  away: number;
  htHome?: number;   // half-time goals (home) — populated when available
  htAway?: number;   // half-time goals (away)
  homeTeam: string;
  awayTeam: string;
  cornersTotal?: number;
  cardsTotal?: number;
  firstGoal?: "home" | "away" | "none";
  extras?: unknown;
  finishedAt: number; // ms
}>();

function _pruneFinishedResults(): void {
  const cutoff = Date.now() - 96 * 60 * 60 * 1000;
  for (const [id, r] of finishedMatchResults.entries()) {
    if (r.finishedAt < cutoff) finishedMatchResults.delete(id);
  }
}

export async function ensureFinishedMatchResult(matchId: string): Promise<boolean> {
  if (!matchId) return false;
  if (finishedMatchResults.has(matchId)) return true;

  try {
    if (db) {
      const [row] = await db.select().from(matchResultsTable).where(eq(matchResultsTable.matchId, matchId)).limit(1);
      if (row && typeof row.home === "number" && typeof row.away === "number") {
        finishedMatchResults.set(matchId, {
          home: row.home,
          away: row.away,
          htHome: row.htHome ?? undefined,
          htAway: row.htAway ?? undefined,
          homeTeam: row.homeTeam ?? "",
          awayTeam: row.awayTeam ?? "",
          cornersTotal: row.cornersTotal ?? undefined,
          cardsTotal: row.cardsTotal ?? undefined,
          firstGoal: (row.firstGoal as "home" | "away" | "none" | null) ?? undefined,
          extras: row.extras ?? undefined,
          finishedAt: row.finishedAt ? row.finishedAt.getTime() : Date.now(),
        });
        return true;
      }
    }
  } catch {
  }

  const fetchFootballExtras = async (id: number): Promise<{
    cornersTotal?: number;
    cardsTotal?: number;
    firstGoal?: "home" | "away" | "none";
  } | null> => {
    try {
      const resp = await fetch(`${SAPI_V2_FOOTBALL}/match/${id}/statistics`, {
        signal: AbortSignal.timeout(9000),
        headers: sapiHeaders(),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as Record<string, unknown>;
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
      const cornersHome = toNum(get(data, ["team_stats", "home", "corners", "total"])) ?? 0;
      const cornersAway = toNum(get(data, ["team_stats", "away", "corners", "total"])) ?? 0;
      const cornersTotal = cornersHome + cornersAway;

      const ev = get(data, ["event_summary"]) as Record<string, unknown> | undefined;
      const toArr = (v: unknown): Record<string, unknown>[] => {
        if (!v) return [];
        if (Array.isArray(v)) return v.filter(x => x && typeof x === "object") as Record<string, unknown>[];
        if (typeof v === "object") return [v as Record<string, unknown>];
        return [];
      };
      const countCards = (side: "home" | "away"): number => {
        const s = ev?.[side] as Record<string, unknown> | undefined;
        const y = toArr((s?.["yellowcards"] as Record<string, unknown> | undefined)?.["event"]);
        const r = toArr((s?.["redcards"] as Record<string, unknown> | undefined)?.["event"]);
        return y.length + r.length;
      };
      const cardsTotal = countCards("home") + countCards("away");

      const parseMinute = (e: Record<string, unknown>): number => {
        const m = toNum(e["minute"]) ?? 0;
        const ex = toNum(e["extra_min"]) ?? 0;
        return m * 100 + ex;
      };
      const minOrNull = (vals: number[]): number | null => vals.length ? vals.reduce((a, b) => Math.min(a, b), vals[0]!) : null;
      const homeGoalsArr = (() => {
        const s = ev?.["home"] as Record<string, unknown> | undefined;
        const goals = toArr((s?.["goals"] as Record<string, unknown> | undefined)?.["event"]);
        return goals.map(parseMinute).filter(n => Number.isFinite(n));
      })();
      const awayGoalsArr = (() => {
        const s = ev?.["away"] as Record<string, unknown> | undefined;
        const goals = toArr((s?.["goals"] as Record<string, unknown> | undefined)?.["event"]);
        return goals.map(parseMinute).filter(n => Number.isFinite(n));
      })();
      const fgH = minOrNull(homeGoalsArr);
      const fgA = minOrNull(awayGoalsArr);
      const firstGoal =
        fgH == null && fgA == null ? "none"
        : fgH != null && fgA == null ? "home"
        : fgH == null && fgA != null ? "away"
        : (fgH as number) <= (fgA as number) ? "home"
        : "away";

      return {
        cornersTotal: Number.isFinite(cornersTotal) ? cornersTotal : undefined,
        cardsTotal: Number.isFinite(cardsTotal) ? cardsTotal : undefined,
        firstGoal,
      };
    } catch {
      return null;
    }
  };

  const parse = (): { sport: SportKey; prefix: string; id: number } | null => {
    const m = matchId.match(/^(football-v2|bball-v2|hockey-v2|tennis-v2|baseball-v2|mlb-v2)-(\d+)$/);
    if (!m) return null;
    const prefix = m[1]!;
    const id = Number(m[2]);
    if (!Number.isFinite(id) || id <= 0) return null;
    const sport =
      prefix === "football-v2" ? "football" :
      prefix === "bball-v2" ? "basketball" :
      prefix === "hockey-v2" ? "hockey" :
      prefix === "tennis-v2" ? "tennis" :
      "baseball";
    return { sport, prefix, id };
  };

  const parsed = parse();
  if (!parsed) return false;

  const now = Date.now();
  const tryEvents = async (events: unknown[]): Promise<boolean> => {
    for (const raw of events) {
      const ev = raw as SAPIV2Event;
      if (Number(ev.id) !== parsed.id) continue;
      const st = (ev.status as Record<string, unknown> | null | undefined);
      const stType = typeof st?.["type"] === "string" ? (st["type"] as string).toLowerCase() : "";
      const code = v2StatusCode(ev);
      const isFinished = stType === "finished" || code === 100;
      if (!isFinished) return false;

      const hS = typeof ev.homeScore === "object" && ev.homeScore !== null
        ? (ev.homeScore as SAPIV2ScoreObj) : null;
      const aS = typeof ev.awayScore === "object" && ev.awayScore !== null
        ? (ev.awayScore as SAPIV2ScoreObj) : null;
      const home = hS?.current ?? v2CurrentScore(ev.homeScore) ?? 0;
      const away = aS?.current ?? v2CurrentScore(ev.awayScore) ?? 0;
      const htHome = parsed.sport === "football" ? (typeof hS?.["period1"] === "number" ? hS["period1"] as number : undefined) : undefined;
      const htAway = parsed.sport === "football" ? (typeof aS?.["period1"] === "number" ? aS["period1"] as number : undefined) : undefined;

      const extras = parsed.sport === "football"
        ? await fetchFootballExtras(parsed.id)
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

      const ftHome = parsed.sport === "football"
        ? ((p1H ?? 0) + (p2H ?? 0))
        : null;
      const ftAway = parsed.sport === "football"
        ? ((p1A ?? 0) + (p2A ?? 0))
        : null;
      const etHome = parsed.sport === "football"
        ? ((p3H ?? 0) + (p4H ?? 0))
        : null;
      const etAway = parsed.sport === "football"
        ? ((p3A ?? 0) + (p4A ?? 0))
        : null;

      const baseNoPensHome = parsed.sport === "football"
        ? (ftHome ?? 0) + (etHome ?? 0)
        : 0;
      const baseNoPensAway = parsed.sport === "football"
        ? (ftAway ?? 0) + (etAway ?? 0)
        : 0;
      const penHome = parsed.sport === "football"
        ? Math.max(0, home - baseNoPensHome)
        : null;
      const penAway = parsed.sport === "football"
        ? Math.max(0, away - baseNoPensAway)
        : null;

      const fullRecord = {
        home,
        away,
        htHome,
        htAway,
        homeTeam: v2TeamName(ev.homeTeam),
        awayTeam: v2TeamName(ev.awayTeam),
        cornersTotal: extras?.cornersTotal,
        cardsTotal: extras?.cardsTotal,
        firstGoal: extras?.firstGoal,
        extras: {
          homeScore: ev.homeScore,
          awayScore: ev.awayScore,
          ...(parsed.sport === "football"
            ? { football: { ftHome, ftAway, etHome, etAway, penHome, penAway } }
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
          await db.insert(matchResultsTable).values({
            matchId,
            sport: parsed.sport,
            home: fullRecord.home,
            away: fullRecord.away,
            htHome: fullRecord.htHome ?? null,
            htAway: fullRecord.htAway ?? null,
            homeTeam: fullRecord.homeTeam,
            awayTeam: fullRecord.awayTeam,
            cornersTotal: fullRecord.cornersTotal ?? null,
            cardsTotal: fullRecord.cardsTotal ?? null,
            firstGoal: fullRecord.firstGoal ?? null,
            extras: fullRecord.extras ?? null,
            finishedAt: new Date(fullRecord.finishedAt),
            updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: matchResultsTable.matchId,
            set: {
              home: fullRecord.home,
              away: fullRecord.away,
              htHome: fullRecord.htHome ?? null,
              htAway: fullRecord.htAway ?? null,
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
      } catch {
      }
      _pruneFinishedResults();
      return true;
    }
    return false;
  };

  const last = await getV2EventsLast(parsed.sport, 120).catch(() => []);
  if (await tryEvents(last)) return true;

  const todayStr = new Date().toISOString().slice(0, 10);
  const schedToday = await getScheduleV2(parsed.sport, todayStr).catch(() => []);
  if (await tryEvents(schedToday as unknown[])) return true;

  const y = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const schedY = await getScheduleV2(parsed.sport, y).catch(() => []);
  if (await tryEvents(schedY as unknown[])) return true;

  return false;
}

/** Scan today's daily feed and add any finished matches to finishedMatchResults. */
export async function scanDailyForFinished(): Promise<void> {
  try {
    const leagues = await getDailyLeagues();
    for (const league of leagues) {
      const raw = league.match;
      if (!raw) continue;
      const matches: StatpalMatchV2[] = Array.isArray(raw) ? raw : [raw];
      for (const m of matches) {
        if (!STATPAL_FINISHED_STATUSES.has(m.status)) continue;
        if (finishedMatchResults.has(m.main_id)) continue;
        const home = parseInt(m.home.goals) || 0;
        const away = parseInt(m.away.goals) || 0;
        const rec = {
          home,
          away,
          htHome: typeof m.ht?.home_goals === "number" ? m.ht.home_goals : undefined,
          htAway: typeof m.ht?.away_goals === "number" ? m.ht.away_goals : undefined,
          homeTeam: m.home.name,
          awayTeam: m.away.name,
          finishedAt: Date.now(),
        };
        finishedMatchResults.set(m.main_id, rec);
        await enqueueMatchSettlement({
          matchId: m.main_id,
          jobId: buildMatchSettlementJobId({
            matchId: m.main_id,
            home: rec.home,
            away: rec.away,
            htHome: rec.htHome,
            htAway: rec.htAway,
          }),
        });
        try {
          if (db) {
            await db.insert(matchResultsTable).values({
              matchId: m.main_id,
              sport: "football",
              home: rec.home,
              away: rec.away,
              htHome: rec.htHome ?? null,
              htAway: rec.htAway ?? null,
              homeTeam: rec.homeTeam,
              awayTeam: rec.awayTeam,
              cornersTotal: null,
              cardsTotal: null,
              firstGoal: null,
              extras: null,
              finishedAt: new Date(rec.finishedAt),
              updatedAt: new Date(),
            }).onConflictDoUpdate({
              target: matchResultsTable.matchId,
              set: {
                home: rec.home,
                away: rec.away,
                htHome: rec.htHome ?? null,
                htAway: rec.htAway ?? null,
                homeTeam: rec.homeTeam,
                awayTeam: rec.awayTeam,
                finishedAt: new Date(rec.finishedAt),
                updatedAt: new Date(),
              },
            });
          }
        } catch {
        }
      }
    }
    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanDailyForFinished failed");
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getLiveLeagues(): Promise<StatpalLeagueV2[]> {
  return liveCache ?? [];
}

async function getDailyLeagues(): Promise<StatpalLeagueV2[]> {
  return dailyCache ?? [];
}

async function getTomorrowLeagues(): Promise<StatpalLeagueV2[]> {
  return dailyTomorrowCache ?? [];
}

// Fetch daily football leagues for offset N (days ahead, 2–6 = days 3–7 from today)
async function getDailyLeaguesForFutureOffset(offset: number): Promise<StatpalLeagueV2[]> {
  return dailyFutureCache.get(offset)?.data ?? [];
}

// Fetch real odds for major European countries in parallel
async function getOddsMap(): Promise<Map<string, RealOdds>> {
  return oddsMap ?? new Map();
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
  const muH = lambdaHome * remainingFrac
    * Math.max(0.4, 1 - 0.12 * state.redCardsHome + 0.04 * state.redCardsAway);
  const muA = lambdaAway * remainingFrac
    * Math.max(0.4, 1 - 0.12 * state.redCardsAway + 0.04 * state.redCardsHome);

  // 5. Poisson convolution over remaining goals, conditioned on current score
  //    This guarantees P(Draw) ≥ P(losing team wins) by construction — because
  //    to draw from N goals down requires N net goals; to win requires N+1 net goals.
  const MAX_G = 8;
  const pH = poissonPmf(muH, MAX_G);
  const pA = poissonPmf(muA, MAX_G);
  const diff = state.homeGoals - state.awayGoals; // positive = home leading

  let pHomeWin = 0, pDraw = 0, pAwayWin = 0;
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
  pHomeWin /= total; pDraw /= total; pAwayWin /= total;

  // Global hard cap: no 1X2 odd exceeds 30.00.
  // Late-game draw rule: at 80+ min with a level score, cap further at 10.00.
  const isLevelLate = state.minute >= 80 && state.homeGoals === state.awayGoals;
  const cap = isLevelLate ? 10.00 : 30.00;
  return {
    home: Math.min(cap, Math.max(1.04, r((1 / pHomeWin) * vigFactor))),
    draw: pDraw > 0.005 ? Math.min(cap, Math.max(1.04, r((1 / pDraw) * vigFactor))) : 0,
    away: Math.min(cap, Math.max(1.04, r((1 / pAwayWin) * vigFactor))),
  };
}

// Count red cards from events array
function countRedCards(events: Array<{ type: string; team: string }>, team: "home" | "away"): number {
  return events.filter(e => e.type?.toLowerCase().includes("red") && e.team === team).length;
}

// Scale all non-zero advanced market odds by a proportional factor (for live drift)
function scaleAdvancedMarkets(m: AdvancedMarkets, factor: number): AdvancedMarkets {
  const s = (n: number) => n <= 0 ? n : Math.round(Math.max(1.01, n * factor) * 100) / 100;
  return {
    ...m,
    doubleChance: { homeOrDraw: s(m.doubleChance.homeOrDraw), awayOrDraw: s(m.doubleChance.awayOrDraw), homeOrAway: s(m.doubleChance.homeOrAway) },
    bothTeamsScore: { yes: s(m.bothTeamsScore.yes), no: s(m.bothTeamsScore.no) },
    totalGoals: {
      over05: s(m.totalGoals.over05), under05: s(m.totalGoals.under05),
      over15: s(m.totalGoals.over15), under15: s(m.totalGoals.under15),
      over25: s(m.totalGoals.over25), under25: s(m.totalGoals.under25),
      over35: s(m.totalGoals.over35), under35: s(m.totalGoals.under35),
      over45: s(m.totalGoals.over45), under45: s(m.totalGoals.under45),
      over55: s(m.totalGoals.over55), under55: s(m.totalGoals.under55),
      over65: s(m.totalGoals.over65), under65: s(m.totalGoals.under65),
    },
    handicap: { homeMinusOne: s(m.handicap.homeMinusOne), awayPlusOne: s(m.handicap.awayPlusOne), homeMinusOneHalf: s(m.handicap.homeMinusOneHalf), awayPlusOneHalf: s(m.handicap.awayPlusOneHalf) },
    halfTime: m.halfTime ? { home: s(m.halfTime.home), draw: s(m.halfTime.draw), away: s(m.halfTime.away) } : m.halfTime,
    firstGoal: m.firstGoal ? { home: s(m.firstGoal.home), noGoal: s(m.firstGoal.noGoal), away: s(m.firstGoal.away) } : m.firstGoal,
    drawNoBet: m.drawNoBet ? { home: s(m.drawNoBet.home), away: s(m.drawNoBet.away) } : undefined,
    asianHandicap: m.asianHandicap ? { line: m.asianHandicap.line, home: s(m.asianHandicap.home), away: s(m.asianHandicap.away) } : undefined,
    correctScore: m.correctScore ? Object.fromEntries(Object.entries(m.correctScore).map(([k, v]) => [k, s(v)])) : undefined,
    corners: m.corners ? { o85: s(m.corners.o85), u85: s(m.corners.u85), o95: s(m.corners.o95), u95: s(m.corners.u95), o105: s(m.corners.o105), u105: s(m.corners.u105) } : undefined,
    cards: m.cards ? { o35: s(m.cards.o35), u35: s(m.cards.u35), o45: s(m.cards.o45), u45: s(m.cards.u45) } : undefined,
  };
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
function applyTieredMarketDrift(state: LiveMatchState, now: number): LiveMatchState {
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
  const idHash = parseInt(state.id.replace(/\D/g, "").slice(-5) || "12345", 10) % 30_000;
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

  const oddsOscH = Math.sin(t * 0.31 + phase * 0.7) * 0.018 + Math.cos(t * 0.17) * 0.009;
  const oddsOscD = Math.cos(t * 0.23 + phase * 0.5) * 0.014 + Math.sin(t * 0.11) * 0.007;
  const oddsOscA = Math.sin(t * 0.27 + phase * 0.9) * 0.018 + Math.cos(t * 0.19) * 0.009;
  // Hard caps: global max = 30.00; at 80+ min with level score → max = 10.00
  const _isLevelLate = minute >= 80 && homeScore === awayScore;
  const _oddsCap = _isLevelLate ? 10.00 : 30.00;

  const newOdds = due("odds", 8_000, 15_000) ? {
    home: Math.max(1.04, Math.min(_oddsCap, r(liveAnchor.home * (1 + oddsOscH)))),
    draw: liveAnchor.draw > 0 ? Math.max(1.04, Math.min(_oddsCap, r(liveAnchor.draw * (1 + oddsOscD)))) : 0,
    away: Math.max(1.04, Math.min(_oddsCap, r(liveAnchor.away * (1 + oddsOscA)))),
  } : state.odds; // not due yet → unchanged (no arrow on frontend)

  // ── Oscillator values — computed fresh each cycle but only APPLIED when due ─
  const osc1 = Math.sin(t * 0.29 + phase * 0.8) * 0.013 + Math.cos(t * 0.13 + phase * 0.4) * 0.006;
  const osc2 = Math.sin(t * 0.11 + phase * 0.35) * 0.007 + Math.cos(t * 0.07 + phase * 0.2) * 0.003;
  const osc3 = Math.sin(t * 0.04 + phase * 0.15) * 0.003 + Math.cos(t * 0.025 + phase * 0.1) * 0.0015;

  const s1 = (n: number) => n <= 0 ? n : r(Math.min(30.00, Math.max(1.01, n * (1 + osc1))));
  const s2 = (n: number) => n <= 0 ? n : r(Math.min(30.00, Math.max(1.01, n * (1 + osc2))));
  const s3 = (n: number) => n <= 0 ? n : r(Math.min(30.00, Math.max(1.01, n * (1 + osc3))));

  // Carry through already-settled zeros (filterLiveMarkets output)
  const keep0 = (cur: number, base: number, fn: (n: number) => number) => cur <= 0 ? 0 : fn(base);
  const tg  = state.markets.totalGoals;
  const btg = bm.totalGoals;

  // ── Tier 1 markets — each on its own 12–25s schedule ──────────────────────
  const dcDue  = due("doubleChance",   12_000, 25_000);
  const btsDue = due("bothTeamsScore", 15_000, 30_000);
  const tgDue  = due("totalGoals",     18_000, 35_000);
  const hcDue  = due("handicap",       20_000, 40_000);
  const dnbDue = due("drawNoBet",      22_000, 45_000);
  const atDue  = due("asianTotals",    25_000, 50_000);

  // ── Tier 2 markets — 40–80s ───────────────────────────────────────────────
  const htDue  = due("halfTime",       40_000, 80_000);
  const fgDue  = due("firstGoal",      45_000, 90_000);
  const ahDue  = due("asianHandicap",  50_000, 100_000);
  const htftDue = due("htft",         60_000, 120_000);
  const csDue   = due("correctScore",   65_000, 130_000);
  const htCSDue = due("htCorrectScore",  50_000, 100_000);
  const h2CSDue = due("h2CorrectScore",  50_000, 100_000);

  // ── Tier 3 markets — 80–150s ──────────────────────────────────────────────
  const cornDue = due("corners", 80_000, 150_000);
  const cardDue = due("cards",   90_000, 160_000);

  const newMarkets: AdvancedMarkets = {
    ...state.markets, // default: keep ALL current values (no change = no arrow)

    doubleChance: dcDue
      ? { homeOrDraw: s1(bm.doubleChance.homeOrDraw), awayOrDraw: s1(bm.doubleChance.awayOrDraw), homeOrAway: s1(bm.doubleChance.homeOrAway) }
      : state.markets.doubleChance,

    bothTeamsScore: btsDue
      ? (() => {
          const live = recalcLiveBothTeamsScore(
            state.home, state.away,
            state.homeScore ?? 0, state.awayScore ?? 0,
            state.minute ?? 0, state.status,
            state.markets.bothTeamsScore
          );
          if (!live || live.yes <= 0) return state.markets.bothTeamsScore;
          return { yes: s1(live.yes), no: s1(live.no) };
        })()
      : state.markets.bothTeamsScore,

    totalGoals: tgDue
      ? (() => {
          // Recalculate from current game state (remaining time + score), then apply a tiny oscillation
          const live = recalcLiveTotalGoals(
            state.home, state.away,
            (state.homeScore ?? 0) + (state.awayScore ?? 0),
            state.minute ?? 0, state.status,
            state.markets.totalGoals
          );
          return {
            over05:  live.over05  > 0 ? Math.min(5.00,  s1(live.over05))  : 0, under05: live.under05  > 0 ? s1(live.under05)  : 0,
            over15:  live.over15  > 0 ? Math.min(49.99, s1(live.over15))  : 0, under15: live.under15  > 0 ? s1(live.under15)  : 0,
            over25:  live.over25  > 0 ? Math.min(49.99, s1(live.over25))  : 0, under25: live.under25  > 0 ? s1(live.under25)  : 0,
            over35:  live.over35  > 0 ? Math.min(49.99, s1(live.over35))  : 0, under35: live.under35  > 0 ? s1(live.under35)  : 0,
            over45:  live.over45  > 0 ? Math.min(49.99, s1(live.over45))  : 0, under45: live.under45  > 0 ? s1(live.under45)  : 0,
            over55:  live.over55  > 0 ? Math.min(49.99, s1(live.over55))  : 0, under55: live.under55  > 0 ? s1(live.under55)  : 0,
            over65:  live.over65  > 0 ? Math.min(49.99, s1(live.over65))  : 0, under65: live.under65  > 0 ? s1(live.under65)  : 0,
          };
        })()
      : state.markets.totalGoals,

    teamGoals: tgDue && state.markets.teamGoals
      ? (() => {
          const live = recalcLiveTeamGoals(
            state.home, state.away,
            state.homeScore ?? 0, state.awayScore ?? 0,
            state.minute ?? 0, state.status,
            state.markets.teamGoals
          );
          return {
            homeOver05: live.homeOver05 > 0 ? s1(live.homeOver05) : 0, homeUnder05: live.homeUnder05 > 0 ? s1(live.homeUnder05) : 0,
            homeOver15: live.homeOver15 > 0 ? s1(live.homeOver15) : 0, homeUnder15: live.homeUnder15 > 0 ? s1(live.homeUnder15) : 0,
            homeOver25: live.homeOver25 > 0 ? s1(live.homeOver25) : 0, homeUnder25: live.homeUnder25 > 0 ? s1(live.homeUnder25) : 0,
            awayOver05: live.awayOver05 > 0 ? s1(live.awayOver05) : 0, awayUnder05: live.awayUnder05 > 0 ? s1(live.awayUnder05) : 0,
            awayOver15: live.awayOver15 > 0 ? s1(live.awayOver15) : 0, awayUnder15: live.awayUnder15 > 0 ? s1(live.awayUnder15) : 0,
            awayOver25: live.awayOver25 > 0 ? s1(live.awayOver25) : 0, awayUnder25: live.awayUnder25 > 0 ? s1(live.awayUnder25) : 0,
          };
        })()
      : state.markets.teamGoals,

    handicap: hcDue ? {
      homeMinusOne:     s1(bm.handicap.homeMinusOne),
      awayPlusOne:      s1(bm.handicap.awayPlusOne),
      homeMinusOneHalf: s1(bm.handicap.homeMinusOneHalf),
      awayPlusOneHalf:  s1(bm.handicap.awayPlusOneHalf),
    } : state.markets.handicap,

    drawNoBet: dnbDue && bm.drawNoBet
      ? { home: s1(bm.drawNoBet.home), away: s1(bm.drawNoBet.away) }
      : state.markets.drawNoBet,

    asianTotals: atDue && bm.asianTotals ? {
      o05:  s1(bm.asianTotals.o05),  u05:  s1(bm.asianTotals.u05),
      o45:  s1(bm.asianTotals.o45),  u45:  s1(bm.asianTotals.u45),
      o55:  s1(bm.asianTotals.o55),  u55:  s1(bm.asianTotals.u55),
      o225: s1(bm.asianTotals.o225), u225: s1(bm.asianTotals.u225),
      o275: s1(bm.asianTotals.o275), u275: s1(bm.asianTotals.u275),
    } : state.markets.asianTotals,

    halfTime: htDue
      ? recalcLiveHalfTime(
          state.home, state.away,
          state.homeScore ?? 0, state.awayScore ?? 0,
          state.minute ?? 0, state.status,
          state.markets.halfTime
        )
      : state.markets.halfTime,

    secondHalf: htDue
      ? recalcLiveSecondHalf(
          state.home, state.away,
          state.homeScore ?? 0, state.awayScore ?? 0,
          (state._liveExtra?.htScore ?? null) as [number, number] | null,
          state.minute ?? 0, state.status,
          state.markets.secondHalf
        )
      : state.markets.secondHalf,

    firstGoal: fgDue
      ? (state.markets.firstGoal && state.markets.firstGoal.home > 0
          ? { home: s2(bm.firstGoal!.home), noGoal: s2(bm.firstGoal!.noGoal), away: s2(bm.firstGoal!.away) }
          : state.markets.firstGoal)
      : state.markets.firstGoal,

    asianHandicap: ahDue && bm.asianHandicap
      ? { ...bm.asianHandicap, home: s2(bm.asianHandicap.home), away: s2(bm.asianHandicap.away) }
      : state.markets.asianHandicap,

    htft: htftDue && bm.htft
      ? { hh: s2(bm.htft.hh), hd: s2(bm.htft.hd), ha: s2(bm.htft.ha), dh: s2(bm.htft.dh), dd: s2(bm.htft.dd), da: s2(bm.htft.da), ah: s2(bm.htft.ah), ad: s2(bm.htft.ad), aa: s2(bm.htft.aa) }
      : state.markets.htft,

    correctScore: csDue && state.sport === "football"
      ? recalcLiveCorrectScore(state.home, state.away, homeScore, awayScore, minute, state.status, state.markets.correctScore)
      : (csDue && bm.correctScore
          ? Object.fromEntries(Object.entries(bm.correctScore).map(([k, v]) => {
              const cur = state.markets.correctScore?.[k] ?? 0;
              return [k, keep0(cur, v, s2)];
            }))
          : state.markets.correctScore),

    htCorrectScore: htCSDue && state.sport === "football"
      ? recalcLiveHtCorrectScore(state.home, state.away, homeScore, awayScore, (state._liveExtra as any)?.htScore ?? null, minute, state.status, state.markets.htCorrectScore as Record<string, number> | undefined)
      : state.markets.htCorrectScore,

    h2CorrectScore: h2CSDue && state.sport === "football"
      ? recalcLiveH2CorrectScore(state.home, state.away, homeScore, awayScore, (state._liveExtra as any)?.htScore ?? null, minute, state.status, state.markets.h2CorrectScore as Record<string, number> | undefined)
      : state.markets.h2CorrectScore,

    corners: cornDue && bm.corners
      ? { o85: s3(bm.corners.o85), u85: s3(bm.corners.u85), o95: s3(bm.corners.o95), u95: s3(bm.corners.u95), o105: s3(bm.corners.o105), u105: s3(bm.corners.u105) }
      : state.markets.corners,

    cards: cardDue && bm.cards
      ? { o35: s3(bm.cards.o35), u35: s3(bm.cards.u35), o45: s3(bm.cards.o45), u45: s3(bm.cards.u45) }
      : state.markets.cards,
  };

  return { ...state, odds: newOdds, markets: newMarkets, _driftPhase: phase, _marketNextUpdate: newSched };
}

// Recalculate open (non-settled) total goals lines using live-adjusted expected goals.
// λ_remaining = λ_total × (remainingMins / 90); each open line is repriced from remaining need.
function recalcLiveTotalGoals(
  home: string,
  away: string,
  currentGoals: number,
  minute: number,
  status: string,
  settled: AdvancedMarkets["totalGoals"]
): AdvancedMarkets["totalGoals"] {
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const lambdaTotal = lambdaHome + lambdaAway;
  const isHT = status === "HT";
  // Remaining minutes: HT → 45 still to play; otherwise 90 − minute, floor at 1
  const remainingMins = isHT ? 45 : Math.max(1, 90 - Math.min(90, minute));
  const lambdaRem = lambdaTotal * (remainingMins / 90);

  // For a given line (e.g. 2.5), needed = goals still required to win Over
  // If already settled (cur ≤ 0 from filterLiveMarkets) → keep 0
  // If pOverRaw < 0.01 (< 1% chance), zero the line so it disappears rather than
  // bunching with other impossible lines at the same floor odds (~94x).
  const recalcLine = (cur: number, targetTotal: number): [number, number] => {
    if (cur <= 0) return [0, 0];
    const needed = Math.max(1, targetTotal - currentGoals);
    const pOverRaw = 1 - poissonCdf(lambdaRem, needed - 1);
    if (pOverRaw < 0.01) return [0, 0]; // effectively impossible — hide line
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
    over05: o05, under05: u05,
    over15: o15, under15: u15,
    over25: o25, under25: u25,
    over35: o35, under35: u35,
    over45: o45, under45: u45,
    over55: o55, under55: u55,
    over65: o65, under65: u65,
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
  settled: NonNullable<AdvancedMarkets["teamGoals"]>
): NonNullable<AdvancedMarkets["teamGoals"]> {
  const { lambdaHome, lambdaAway } = soccerPoissonModel(home, away);
  const isHT = status === "HT";
  const remainingMins = isHT ? 45 : Math.max(1, 90 - Math.min(90, minute));
  const lambdaRemH = lambdaHome * (remainingMins / 90);
  const lambdaRemA = lambdaAway * (remainingMins / 90);

  const recalcTeamLine = (cur: number, targetTotal: number, teamScore: number, lambdaRem: number): [number, number] => {
    if (cur <= 0) return [0, 0];
    const needed = Math.max(1, targetTotal - teamScore);
    const pOverRaw = 1 - poissonCdf(lambdaRem, needed - 1);
    if (pOverRaw < 0.01) return [0, 0]; // effectively impossible — hide line
    const pOver = mc(pOverRaw, 0.01, 0.99);
    const pUnder = mc(1 - pOver, 0.01, 0.99);
    const [oOdds, uOdds] = probsToDecimalOdds([pOver, pUnder], 1.06);
    return [oOdds!, uOdds!];
  };

  const [hO05, hU05] = recalcTeamLine(settled.homeOver05, 1, homeScore, lambdaRemH);
  const [hO15, hU15] = recalcTeamLine(settled.homeOver15, 2, homeScore, lambdaRemH);
  const [hO25, hU25] = recalcTeamLine(settled.homeOver25, 3, homeScore, lambdaRemH);
  const [aO05, aU05] = recalcTeamLine(settled.awayOver05, 1, awayScore, lambdaRemA);
  const [aO15, aU15] = recalcTeamLine(settled.awayOver15, 2, awayScore, lambdaRemA);
  const [aO25, aU25] = recalcTeamLine(settled.awayOver25, 3, awayScore, lambdaRemA);

  return {
    homeOver05: hO05, homeUnder05: hU05,
    homeOver15: hO15, homeUnder15: hU15,
    homeOver25: hO25, homeUnder25: hU25,
    awayOver05: aO05, awayUnder05: aU05,
    awayOver15: aO15, awayUnder15: aU15,
    awayOver25: aO25, awayUnder25: aU25,
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
  settled: AdvancedMarkets["bothTeamsScore"]
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
  if (homeScore >= 1 && awayScore >= 1) return { yes: 0, no: 0 }; // already settled
  else if (homeScore >= 1) pYes = pAwaySc;   // only away needs to score
  else if (awayScore >= 1) pYes = pHomeSc;   // only home needs to score
  else pYes = pHomeSc * pAwaySc;             // both must still score
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
  current: AdvancedMarkets["halfTime"]
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

  let pH = 0, pD = 0, pA = 0;
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
    [mc(pH / total, 0.01, 0.99), mc(pD / total, 0.01, 0.99), mc(pA / total, 0.01, 0.99)],
    1.08
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
  current: AdvancedMarkets["secondHalf"]
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

  let pH = 0, pD = 0, pA = 0;
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
    [mc(pH / total, 0.01, 0.99), mc(pD / total, 0.01, 0.99), mc(pA / total, 0.01, 0.99)],
    1.08
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
  home: string, away: string,
  homeScore: number, awayScore: number,
  minute: number, status: string,
  current: Record<string, number> | undefined
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
      if (current[key] !== undefined) scoreProbs.set(key, (scoreProbs.get(key) ?? 0) + p);
      else pOther += p;
    }
  }

  const total = Array.from(scoreProbs.values()).reduce((s, v) => s + v, 0) + pOther;
  if (total < 1e-9) return current;

  const result: Record<string, number> = {};
  for (const [score, p] of scoreProbs) {
    if ((current[score] ?? 0) <= 0) { result[score] = 0; continue; }
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
  home: string, away: string,
  homeScore: number, awayScore: number,
  htScore: [number, number] | null,
  minute: number, status: string,
  current: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!current || Object.keys(current).length === 0) return current;
  const isHT = status === "HT";
  const inSecondHalf = !isHT && minute > 45;

  if (isHT || inSecondHalf) {
    const finalH = htScore ? htScore[0] : homeScore;
    const finalA = htScore ? htScore[1] : awayScore;
    const settledKey = `${finalH}-${finalA}`;
    const result: Record<string, number> = {};
    for (const k of Object.keys(current)) result[k] = k === settledKey ? 1.01 : 0;
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
      if (current[key] !== undefined) scoreProbs.set(key, (scoreProbs.get(key) ?? 0) + p);
      else pOther += p;
    }
  }

  const total = Array.from(scoreProbs.values()).reduce((s, v) => s + v, 0) + pOther;
  if (total < 1e-9) return current;

  const result: Record<string, number> = {};
  for (const [score, p] of scoreProbs) {
    if ((current[score] ?? 0) <= 0) { result[score] = 0; continue; }
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
  home: string, away: string,
  homeScoreTotal: number, awayScoreTotal: number,
  htScore: [number, number] | null,
  minute: number, status: string,
  current: Record<string, number> | undefined
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
      if (current[key] !== undefined) scoreProbs.set(key, (scoreProbs.get(key) ?? 0) + p);
      else pOther += p;
    }
  }

  const total = Array.from(scoreProbs.values()).reduce((s, v) => s + v, 0) + pOther;
  if (total < 1e-9) return current;

  const result: Record<string, number> = {};
  for (const [score, p] of scoreProbs) {
    if ((current[score] ?? 0) <= 0) { result[score] = 0; continue; }
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
function filterLiveMarkets(markets: AdvancedMarkets, homeScore: number, awayScore: number, status?: string): AdvancedMarkets {
  const m: AdvancedMarkets = {
    ...markets,
    totalGoals: { ...markets.totalGoals },
    ...(markets.teamGoals  ? { teamGoals:  { ...markets.teamGoals  } } : {}),
    ...(markets.exactGoals ? { exactGoals: { ...markets.exactGoals } } : {}),
  };
  const totalGoals = homeScore + awayScore;

  // Correct Score: only keep scorelines that are still achievable (both sides >= current score)
  if (m.correctScore) {
    const filtered: Record<string, number> = {};
    for (const [score, odd] of Object.entries(m.correctScore)) {
      if (score === "Outro") { filtered[score] = odd; continue; }
      const [hs, as_] = score.split("-").map(Number);
      if (hs !== undefined && as_ !== undefined && hs >= homeScore && as_ >= awayScore) {
        filtered[score] = odd;
      }
    }
    m.correctScore = Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  // Total Goals: zero out lines already settled by the current goal tally
  const tg = m.totalGoals;
  if (totalGoals >= 1) { tg.over05 = 0; tg.under05 = 0; }
  if (totalGoals >= 2) { tg.over15 = 0; tg.under15 = 0; }
  if (totalGoals >= 3) { tg.over25 = 0; tg.under25 = 0; }
  if (totalGoals >= 4) { tg.over35 = 0; tg.under35 = 0; }
  if (totalGoals >= 5) { tg.over45 = 0; tg.under45 = 0; }
  if (totalGoals >= 6) { tg.over55 = 0; tg.under55 = 0; }

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
    m.winToNil   = { home: 0, away: m.winToNil?.away ?? 0 };
    m.cleanSheet = { home: 0, away: m.cleanSheet?.away ?? 0 };
  }
  if (homeScore > 0) {
    m.winToNil   = { home: m.winToNil?.home ?? 0, away: 0 };
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
      if (score === "Outro") { filtered[score] = odd; continue; }
      const [hs, as_] = score.split("-").map(Number);
      if (hs !== undefined && as_ !== undefined && hs >= homeScore && as_ >= awayScore) {
        filtered[score] = odd;
      }
    }
    m.htCorrectScore = Object.keys(filtered).length > 1 ? filtered : undefined;
  }

  // Team Goals: zero out settled lines when a team reaches the threshold
  if (m.teamGoals) {
    const tg = m.teamGoals;
    if (homeScore >= 1) { tg.homeOver05 = 0; tg.homeUnder05 = 0; }
    if (homeScore >= 2) { tg.homeOver15 = 0; tg.homeUnder15 = 0; }
    if (homeScore >= 3) { tg.homeOver25 = 0; tg.homeUnder25 = 0; }
    if (awayScore >= 1) { tg.awayOver05 = 0; tg.awayUnder05 = 0; }
    if (awayScore >= 2) { tg.awayOver15 = 0; tg.awayUnder15 = 0; }
    if (awayScore >= 3) { tg.awayOver25 = 0; tg.awayUnder25 = 0; }
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

// Find real odds for a v2 match using fallback IDs; model-based fallback using team names
function resolveOdds(
  m: StatpalMatchV2,
  map: Map<string, RealOdds>
): { odds: { home: number; draw: number; away: number }; markets: AdvancedMarkets; real: boolean } {
  const r = (n: number) => Math.round(n * 100) / 100;
  const real =
    map.get(m.fallback_id_1) ??
    map.get(m.fallback_id_2) ??
    map.get(m.fallback_id_3);

  if (real) {
    return {
      odds: { home: r(real.home), draw: r(real.draw), away: r(real.away) },
      markets: makeAdvancedMarketsReal(m.home.name, m.away.name, real.types),
      real: true,
    };
  }

  // Fallback: ELO + Poisson model using actual team names
  const generated = makeOddsFromTeams(m.home.name, m.away.name);
  return {
    odds: generated,
    markets: makeAdvancedMarketsFromTeams(m.home.name, m.away.name),
    real: false,
  };
}

async function getNHLLive(): Promise<NHLTournament[]> {
  return nhlLiveCache ?? [];
}

function buildNHLLiveMatches(tournaments: NHLTournament[]): LiveMatchState[] {
  const NHL_LIVE_STATUSES = new Set(["1P", "2P", "3P", "OT", "SO", "INT", "Break"]);
  const result: LiveMatchState[] = [];

  // Sort by league priority so top-tier competitions appear first
  const sorted = [...tournaments].sort((a, b) => hockeyLeaguePriority(a.league) - hockeyLeaguePriority(b.league));

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;
  const yesterdayNHL = new Date(today);
  yesterdayNHL.setDate(yesterdayNHL.getDate() - 1);
  const yesterdayNHLStr = `${String(yesterdayNHL.getDate()).padStart(2, "0")}.${String(yesterdayNHL.getMonth() + 1).padStart(2, "0")}.${yesterdayNHL.getFullYear()}`;
  // NHL games end typically by 05:00 Lisbon time — allow yesterday's games only before 10h
  const allowYesterdayNHL = today.getHours() < 10;

  const parseScore = (s?: string): [number, number] | null => {
    if (!s || !s.trim()) return null;
    const parts = s.split(" - ");
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0]!); const a = parseInt(parts[1]!);
    if (isNaN(h) || isNaN(a)) return null;
    return [h, a];
  };

  for (const t of sorted) {
    const matches = Array.isArray(t.match) ? t.match : [t.match];
    for (const m of matches) {
      if (!m?.status) continue;
      const isLive = NHL_LIVE_STATUSES.has(m.status);
      const isNotStarted = m.status === "Not Started";
      if (!isLive && !isNotStarted) continue;
      // Date guard: skip stale live games from previous days
      if (m.date && m.date !== todayStr) {
        if (!allowYesterdayNHL || m.date !== yesterdayNHLStr) continue;
      }
      if (isNotStarted && m.date && m.date !== todayStr) continue;

      const homeScore = parseInt(m.home.totalscore) || 0;
      const awayScore = parseInt(m.away.totalscore) || 0;

      // Parse period-by-period scores
      const periods: Array<[number, number]> = [];
      const periodSources: Array<NHLPeriodData | undefined> = [
        m.events?.firstperiod,
        m.events?.secondperiod,
        m.events?.thirdperiod,
        m.events?.overtime,
        m.events?.penalties,
      ];
      for (const pd of periodSources) {
        const sc = parseScore(pd?.score);
        if (sc) periods.push(sc);
      }

      // Parse real goal/penalty events
      const events: LiveMatchState["events"] = [];
      for (const pd of periodSources) {
        if (!pd?.event) continue;
        const evArr = Array.isArray(pd.event) ? pd.event : [pd.event];
        for (const ev of evArr) {
          if (ev.type !== "goal" && ev.type !== "penalty") continue;
          events.push({
            type: ev.type,
            team: ev.team === "localteam" ? "home" : "away",
            minute: parseInt(ev.min) || 0,
            player: ev.player || "",
          });
        }
      }

      const periodMinutes: Record<string, number> = { "1P": 10, "2P": 30, "3P": 50, "OT": 65, "SO": 68, "INT": 20, "Break": 20 };
      const minute = isNotStarted ? 0 : (periodMinutes[m.status] ?? 10);

      const odds = makeOddsFromTeams(m.home.name, m.away.name);
      const diff = homeScore - awayScore;
      let liveOdds = { ...odds };
      if (diff !== 0 && isLive) {
        const factor = Math.min(0.40, Math.abs(diff) * 0.15);
        liveOdds = diff > 0
          ? { home: Math.max(1.04, +(odds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(12, +(odds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(12, +(odds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.04, +(odds.away * (1 - factor)).toFixed(2)) };
      }
      liveOdds.draw = 0;

      result.push({
        id: `nhl-${m.id}`,
        home: m.home.name,
        away: m.away.name,
        league: t.league,
        country: t.country,
        sport: "hockey",
        homeScore,
        awayScore,
        minute,
        status: isNotStarted ? "Not Started" : m.status,
        hasRealOdds: true,
        odds: liveOdds,
        markets: makeHockeyMarketsFromTeams(m.home.name, m.away.name),
        events,
        _liveExtra: periods.length > 0 ? { periods } : undefined,
      });
    }
  }
  return result;
}

// ─── MLB live feed ────────────────────────────────────────────────────────────
async function getMLBLive(): Promise<MLBTournament[]> {
  return mlbLiveCache ?? [];
}

function buildMLBLiveMatches(tournaments: MLBTournament[]): LiveMatchState[] {
  // Statpal MLB uses "Top/Bottom/Middle/End Nth" format (not "Nth Inning")
  const MLB_LIVE_STATUSES = new Set([
    "Top 1st","Bottom 1st","Middle 1st","End 1st",
    "Top 2nd","Bottom 2nd","Middle 2nd","End 2nd",
    "Top 3rd","Bottom 3rd","Middle 3rd","End 3rd",
    "Top 4th","Bottom 4th","Middle 4th","End 4th",
    "Top 5th","Bottom 5th","Middle 5th","End 5th",
    "Top 6th","Bottom 6th","Middle 6th","End 6th",
    "Top 7th","Bottom 7th","Middle 7th","End 7th",
    "Top 8th","Bottom 8th","Middle 8th","End 8th",
    "Top 9th","Bottom 9th","Middle 9th","End 9th",
    "Top 10th","Bottom 10th","Middle 10th","End 10th",
    // Extra innings and generic live
    "Extra Inning","In Progress",
    // Legacy format (kept for safety)
    "1st Inning","2nd Inning","3rd Inning","4th Inning","5th Inning",
    "6th Inning","7th Inning","8th Inning","9th Inning",
    // Between-half-inning/delay statuses
    "Break","Warmup","Delayed","Rain Delay","Delay","Suspended",
  ]);
  const result: LiveMatchState[] = [];

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;
  // MLB games can end past midnight ET (≈5–6 AM Lisbon) — allow yesterday until 09:00
  const allowYesterday = today.getHours() < 9;
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const yesterdayStr = `${String(yest.getDate()).padStart(2, "0")}.${String(yest.getMonth() + 1).padStart(2, "0")}.${yest.getFullYear()}`;

  for (const t of tournaments) {
    const matches = Array.isArray(t.match) ? t.match : [t.match];
    for (const m of matches) {
      if (!m?.status) continue;
      const isLive = MLB_LIVE_STATUSES.has(m.status);

      // Statpal MLB API often takes 30–60+ min to flip "Not Started" → a live status.
      // Detect this: game date is today (or allowed yesterday) AND scheduled UTC time
      // has already elapsed by 0–240 min → treat as live despite the stale status.
      let isStartedButUnupdated = false;
      if (!isLive && m.status === "Not Started") {
        const matchDate = m.date ?? todayStr;
        const dateOk = matchDate === todayStr || (allowYesterday && matchDate === yesterdayStr);
        if (dateOk) {
          try {
            let gameMs: number;
            if (m.datetime_utc) {
              // Statpal datetime_utc format: "DD.MM.YYYY HH:MM" (actual UTC)
              const parts = m.datetime_utc.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
              if (parts) {
                const [, dd, mon, yyyy, hh, min] = parts;
                gameMs = new Date(`${yyyy}-${mon}-${dd}T${hh}:${min}:00Z`).getTime();
              } else {
                gameMs = new Date(m.datetime_utc).getTime(); // fallback
              }
            } else {
              // m.time is raw ET from Statpal — use date + time as UTC estimate
              const [dd, mm, yyyy] = matchDate.split(".");
              gameMs = new Date(`${yyyy}-${mm}-${dd}T${m.time || "00:00"}:00Z`).getTime();
            }
            const minsElapsed = (Date.now() - gameMs) / 60_000;
            isStartedButUnupdated = minsElapsed >= 0 && minsElapsed <= 240;
          } catch { /* ignore parse errors */ }
        }
      }

      if (!isLive && !isStartedButUnupdated) continue;
      if (m.date && m.date !== todayStr) {
        if (!allowYesterday || m.date !== yesterdayStr) continue;
      }

      const homeScore = parseInt(m.home.totalscore) || 0;
      const awayScore = parseInt(m.away.totalscore) || 0;

      // Parse inning-by-inning scores (skip "-" placeholders)
      const innings: Array<[number, number]> = [];
      const inKeys = ["in1", "in2", "in3", "in4", "in5", "in6", "in7", "in8", "in9"] as const;
      for (const key of inKeys) {
        const h = parseInt(m.home[key]); const a = parseInt(m.away[key]);
        if (!isNaN(h) && !isNaN(a)) innings.push([h, a]);
      }

      // Extract inning number from Statpal status ("Top 3rd" → 3, "Bottom 9th" → 9)
      const inningFromStatus = (s: string): number => {
        const m2 = s.match(/\b(\d+)(st|nd|rd|th)\b/i);
        if (m2) return parseInt(m2[1]);
        const legacyMap: Record<string, number> = {
          "1st Inning":1,"2nd Inning":2,"3rd Inning":3,"4th Inning":4,
          "5th Inning":5,"6th Inning":6,"7th Inning":7,"8th Inning":8,
          "9th Inning":9,"Extra Inning":10,"In Progress":5,
        };
        return legacyMap[s] ?? 1;
      };
      // Games Statpal hasn't updated yet show as minute 0 (start of game)
      const minute = isStartedButUnupdated ? 0 : inningFromStatus(m.status);

      // Look up real pre-match odds from the raw map (populated by getMLBOdds even for started games)
      const normH = m.home.name.toLowerCase().trim();
      const normA = m.away.name.toLowerCase().trim();
      const realEntry = mlbRawOddsMap.get(`${normH}|${normA}`);
      const baseOdds = realEntry && realEntry.h > 1 && realEntry.a > 1
        ? { home: realEntry.h, draw: 0, away: realEntry.a }
        : makeBaseballBaseOdds(m.home.name, m.away.name);

      const diff = homeScore - awayScore;
      let liveOdds = { ...baseOdds };
      if (diff !== 0 && isLive) {
        const factor = Math.min(0.40, Math.abs(diff) * 0.10);
        liveOdds = diff > 0
          ? { home: Math.max(1.04, +(baseOdds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(12, +(baseOdds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(12, +(baseOdds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.04, +(baseOdds.away * (1 - factor)).toFixed(2)) };
      }
      liveOdds.draw = 0; // no draws in baseball

      const realH = baseOdds.home > 1 ? baseOdds.home : undefined;
      const realA = baseOdds.away > 1 ? baseOdds.away : undefined;

      result.push({
        id: `mlb-${m.id}`,
        home:      m.home.name,
        away:      m.away.name,
        league:    t.league || "USA: MLB",
        country:   t.country || "usa",
        sport:     "baseball",
        homeScore, awayScore, minute,
        status:    m.status,
        hasRealOdds: true,
        odds:    liveOdds,
        markets: makeMLBMarketsFromTeams(m.home.name, m.away.name, realH, realA),
        events:  [],
        _liveExtra: innings.length > 0 ? {
          innings,
          outs: m.outs !== undefined && m.outs !== "" ? parseInt(m.outs) : undefined,
          homeHits: parseInt(m.home.hits) > 0 ? parseInt(m.home.hits) : undefined,
          awayHits: parseInt(m.away.hits) > 0 ? parseInt(m.away.hits) : undefined,
          homeErrors: parseInt(m.home.errors) > 0 ? parseInt(m.home.errors) : undefined,
          awayErrors: parseInt(m.away.errors) > 0 ? parseInt(m.away.errors) : undefined,
        } : undefined,
      });
    }
  }

  // ── Sticky live: keep games visible for up to 4 min after last confirmed live ──
  // Statpal MLB API sometimes drops a game to "Not Started" between innings or
  // during brief API inconsistencies. Without this, games flicker in/out of live.
  const nowMs = Date.now();
  const currentIds = new Set(result.map(m => String(m.id)));

  // 1. Update sticky map for all currently live games
  for (const m of result) {
    mlbLiveStickyMap.set(String(m.id), { match: m, lastSeenMs: nowMs });
  }

  // 2. Re-inject games from sticky map that the API temporarily dropped
  for (const [id, { match, lastSeenMs }] of mlbLiveStickyMap) {
    if (nowMs - lastSeenMs >= MLB_STICKY_TTL_MS) {
      mlbLiveStickyMap.delete(id); // expired — game is truly over
    } else if (!currentIds.has(id)) {
      result.push(match); // API dropped it temporarily — keep showing last known state
    }
  }

  return result;
}

async function getNBALive(): Promise<NBATournament[]> {
  return nbaLiveCache ?? [];
}

function buildNBALiveMatches(tournaments: NBATournament[]): LiveMatchState[] {
  const NBA_LIVE_STATUSES = new Set(["Q1", "Q2", "Q3", "Q4", "HT", "OT", "1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter", "Halftime", "In Progress"]);
  const result: LiveMatchState[] = [];

  // Sort by league priority so NBA Cup / EuroLeague appear before G League etc.
  const sorted = [...tournaments].sort((a, b) => basketballLeaguePriority(a.league) - basketballLeaguePriority(b.league));

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${String(yesterday.getDate()).padStart(2, "0")}.${String(yesterday.getMonth() + 1).padStart(2, "0")}.${yesterday.getFullYear()}`;
  // NBA games end typically by 05:00 Lisbon time — allow yesterday's games only before 10h
  const allowYesterdayLive = today.getHours() < 10;

  for (const t of sorted) {
    const matches = Array.isArray(t.match) ? t.match : [t.match];
    for (const m of matches) {
      if (!m?.status) continue;
      const st = m.status;
      const isFinished = ["Finished", "Ended", "Closed", "Final", "Complete", "After OT", "After SO", "FT", "AET", "AOT"].includes(st);
      if (isFinished) continue; // never show finished games in live section
      const isNotStarted = st === "Not Started";
      const isLive = NBA_LIVE_STATUSES.has(st); // strict: only known live statuses
      if (!isLive && !isNotStarted) continue;
      // Date guard: skip games not from today (or yesterday if before 10h — late-night NBA)
      if (m.date && m.date !== todayStr) {
        if (!allowYesterdayLive || m.date !== yesterdayStr) continue;
      }
      if (isNotStarted && m.date && m.date !== todayStr) continue;
      // Only show Not Started games within 90 min — avoids showing night games all day
      if (isNotStarted && matchStartsInMinutes(m.date ?? "", m.time) > 90) continue;

      const homeScore = parseInt(m.home.totalscore) || 0;
      const awayScore = parseInt(m.away.totalscore) || 0;

      const q1 = [parseInt(m.home.q1 ?? "0") || 0, parseInt(m.away.q1 ?? "0") || 0] as [number, number];
      const q2 = [parseInt(m.home.q2 ?? "0") || 0, parseInt(m.away.q2 ?? "0") || 0] as [number, number];
      const q3 = [parseInt(m.home.q3 ?? "0") || 0, parseInt(m.away.q3 ?? "0") || 0] as [number, number];
      const q4 = [parseInt(m.home.q4 ?? "0") || 0, parseInt(m.away.q4 ?? "0") || 0] as [number, number];
      const ot = [parseInt(m.home.ot ?? "0") || 0, parseInt(m.away.ot ?? "0") || 0] as [number, number];

      const quarters: Array<[number, number]> = [];
      if (q1[0] > 0 || q1[1] > 0) quarters.push(q1);
      if (q2[0] > 0 || q2[1] > 0) quarters.push(q2);
      if (q3[0] > 0 || q3[1] > 0) quarters.push(q3);
      if (q4[0] > 0 || q4[1] > 0) quarters.push(q4);
      if (ot[0] > 0 || ot[1] > 0) quarters.push(ot);

      const qNum = st.includes("1") || st === "Q1" ? 1 : st.includes("2") || st === "Q2" || st === "HT" || st === "Halftime" ? 2 : st.includes("3") || st === "Q3" ? 3 : st.includes("4") || st === "Q4" ? 4 : st === "OT" ? 5 : isFinished ? 4 : 1;
      const statusLabel = isNotStarted ? "Not Started" : isFinished ? "Finished" : st.startsWith("Q") ? st : st === "HT" || st === "Halftime" ? "HT" : st === "OT" ? "OT" : `Q${qNum}`;
      const minute = isNotStarted ? 0 : isFinished ? 48 : (qNum - 1) * 12 + 6;

      const odds = makeOddsFromTeams(m.home.name, m.away.name);
      const diff = homeScore - awayScore;
      let liveOdds = { ...odds, draw: 0 };
      if (diff !== 0 && isLive) {
        const factor = Math.min(0.40, Math.abs(diff) * 0.03);
        liveOdds = diff > 0
          ? { home: Math.max(1.04, +(odds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(12, +(odds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(12, +(odds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.04, +(odds.away * (1 - factor)).toFixed(2)) };
      }

      const leagueName = t.league.includes("Nba") || t.league.includes("NBA") ? "NBA" : t.league;

      result.push({
        id: `nba-${m.id}`,
        home: m.home.name,
        away: m.away.name,
        league: leagueName,
        country: t.country,
        sport: "basketball",
        homeScore,
        awayScore,
        minute,
        status: statusLabel,
        hasRealOdds: true,
        odds: liveOdds,
        markets: makeBasketballMarketsFromTeams(m.home.name, m.away.name),
        events: [],
        _liveExtra: quarters.length > 0 ? { quarters } : undefined,
      });
    }
  }
  return result;
}

function _parseTennisStat(raw: TennisStatsPlayerRaw | undefined): TennisStatData {
  const matchPeriod = raw?.stats?.period?.find(p => p.name === "match");
  const get = (typeName: string, statName: string) =>
    matchPeriod?.type?.find(t => t.name === typeName)?.stat?.find(s => s.name === statName)?.value ?? "";
  return {
    aces:            parseInt(get("Service", "Aces"))          || 0,
    doubleFaults:    parseInt(get("Service", "Double Faults")) || 0,
    firstServePct:   get("Service", "1st serve percentage")    || "—",
    winners:         parseInt(get("Points", "Winners"))         || 0,
    unforcedErrors:  parseInt(get("Points", "Unforced errors")) || 0,
  };
}


async function getTennisStatsMap(): Promise<Map<string, [TennisStatData, TennisStatData]>> {
  return tennisStatsCache ?? new Map();
}

async function getTennisLive(): Promise<TennisTournament[]> {
  return tennisLiveCache ?? [];
}

async function getVolleyballLive(): Promise<VolleyTournament[]> {
  return volleyLiveCache ?? [];
}

// ─── SportsAPI Pro V2 Live Fetch Functions ────────────────────────────────────
const V2_LIVE_MAX_STALE_MS = 30_000;
const WS_PREFERRED_MAX_STALE_MS = 10_000;

/** Race V1 vs V2 HTTP — whichever resolves first wins. V1 = 1-2s, V2 = 3-5s. */
async function fetchLiveRace(v1Base: string, v2Base: string): Promise<SAPIV2Event[]> {
  const headers = sapiHeaders();
  const tryFetch = async (base: string): Promise<SAPIV2Event[]> => {
    const resp = await fetch(`${base}/live`, { signal: AbortSignal.timeout(8000), headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { events?: SAPIV2Event[]; data?: SAPIV2Event[] };
    const events = data.events ?? (data.data as SAPIV2Event[] | undefined) ?? [];
    if (events.length === 0) throw new Error("empty");
    return events;
  };
  return Promise.any([tryFetch(v1Base), tryFetch(v2Base)]).catch(() => []);
}

async function getFootballLiveV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if ((wsConnected.has("football") || v1WsConnected.has("football")) && footballLiveV2Cache && now - footballLiveV2FetchedAt < WS_PREFERRED_MAX_STALE_MS && (wsLastMessageAt.get("football") ?? 0) > now - WS_PREFERRED_MAX_STALE_MS) return footballLiveV2Cache;
  if (footballLiveV2Cache && now - footballLiveV2FetchedAt < CONFIG.LIVE_CACHE_TTL) return footballLiveV2Cache;
  try {
    const events = await fetchLiveRace(SAPI_V1_FOOTBALL, SAPI_V2_FOOTBALL);
    if (events.length > 0) {
      footballLiveV2Cache = events;
      footballLiveV2FetchedAt = now;
      return footballLiveV2Cache;
    }
    if (footballLiveV2Cache && now - footballLiveV2FetchedAt > V2_LIVE_MAX_STALE_MS) {
      footballLiveV2Cache = [];
      footballLiveV2FetchedAt = now;
      return [];
    }
    return footballLiveV2Cache ?? [];
  } catch {
    return footballLiveV2Cache ?? [];
  }
}

async function getBasketballLiveV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if ((wsConnected.has("basketball") || v1WsConnected.has("basketball")) && basketballLiveV2Cache && now - basketballLiveV2FetchedAt < WS_PREFERRED_MAX_STALE_MS && (wsLastMessageAt.get("basketball") ?? 0) > now - WS_PREFERRED_MAX_STALE_MS) return basketballLiveV2Cache;
  if (basketballLiveV2Cache && now - basketballLiveV2FetchedAt < CONFIG.LIVE_CACHE_TTL) return basketballLiveV2Cache;
  try {
    const events = await fetchLiveRace(SAPI_V1_BASKETBALL, SAPI_V2_BASKETBALL);
    if (events.length > 0) {
      basketballLiveV2Cache = events;
      basketballLiveV2FetchedAt = now;
      return basketballLiveV2Cache;
    }
    if (basketballLiveV2Cache && now - basketballLiveV2FetchedAt > V2_LIVE_MAX_STALE_MS) {
      basketballLiveV2Cache = [];
      basketballLiveV2FetchedAt = now;
      return [];
    }
    return basketballLiveV2Cache ?? [];
  } catch {
    return basketballLiveV2Cache ?? [];
  }
}

async function getHockeyLiveV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if ((wsConnected.has("hockey") || v1WsConnected.has("hockey")) && hockeyLiveV2Cache && now - hockeyLiveV2FetchedAt < WS_PREFERRED_MAX_STALE_MS && (wsLastMessageAt.get("hockey") ?? 0) > now - WS_PREFERRED_MAX_STALE_MS) return hockeyLiveV2Cache;
  if (hockeyLiveV2Cache && now - hockeyLiveV2FetchedAt < CONFIG.LIVE_CACHE_TTL) return hockeyLiveV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_HOCKEY}/live`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return hockeyLiveV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    const events = data.events ?? [];
    if (events.length > 0) {
      hockeyLiveV2Cache = events;
      hockeyLiveV2FetchedAt = now;
      return hockeyLiveV2Cache;
    }
    if (hockeyLiveV2Cache && now - hockeyLiveV2FetchedAt > V2_LIVE_MAX_STALE_MS) {
      hockeyLiveV2Cache = [];
      hockeyLiveV2FetchedAt = now;
      return [];
    }
    hockeyLiveV2FetchedAt = now;
    return hockeyLiveV2Cache ?? [];
  } catch {
    return hockeyLiveV2Cache ?? [];
  }
}

async function getBaseballLiveV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if ((wsConnected.has("baseball") || v1WsConnected.has("baseball")) && baseballLiveV2Cache && now - baseballLiveV2FetchedAt < WS_PREFERRED_MAX_STALE_MS && (wsLastMessageAt.get("baseball") ?? 0) > now - WS_PREFERRED_MAX_STALE_MS) return baseballLiveV2Cache;
  if (baseballLiveV2Cache && now - baseballLiveV2FetchedAt < CONFIG.LIVE_CACHE_TTL) return baseballLiveV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_BASEBALL}/live`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return baseballLiveV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    const events = data.events ?? [];
    if (events.length > 0) {
      baseballLiveV2Cache = events;
      baseballLiveV2FetchedAt = now;
      return baseballLiveV2Cache;
    }
    if (baseballLiveV2Cache && now - baseballLiveV2FetchedAt > V2_LIVE_MAX_STALE_MS) {
      baseballLiveV2Cache = [];
      baseballLiveV2FetchedAt = now;
      return [];
    }
    baseballLiveV2FetchedAt = now;
    return baseballLiveV2Cache ?? [];
  } catch {
    return baseballLiveV2Cache ?? [];
  }
}

async function getTennisLiveV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if ((wsConnected.has("tennis") || v1WsConnected.has("tennis")) && tennisLiveV2Cache && now - tennisLiveV2FetchedAt < WS_PREFERRED_MAX_STALE_MS && (wsLastMessageAt.get("tennis") ?? 0) > now - WS_PREFERRED_MAX_STALE_MS) return tennisLiveV2Cache;
  if (tennisLiveV2Cache && now - tennisLiveV2FetchedAt < CONFIG.LIVE_CACHE_TTL) return tennisLiveV2Cache;
  try {
    // Race V1 vs V2 — tennis endpoint shape varies, handle both formats
    const headers = sapiHeaders();
    const tryTennis = async (base: string): Promise<SAPIV2Event[]> => {
      const resp = await fetch(`${base}/live`, { signal: AbortSignal.timeout(8000), headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = (await resp.json()) as {
        events?: SAPIV2Event[];
        data?: SAPIV2Event[] | { events?: SAPIV2Event[] };
      };
      const nested = raw.data;
      const events =
        raw.events ??
        (Array.isArray(nested) ? nested : (nested as { events?: SAPIV2Event[] } | undefined)?.events) ??
        [];
      if (events.length === 0) throw new Error("empty");
      return events;
    };
    const events = await Promise.any([tryTennis(SAPI_V1_TENNIS), tryTennis(SAPI_V2_TENNIS)]).catch(() => []);
    if (events.length > 0) {
      tennisLiveV2Cache = events;
      tennisLiveV2FetchedAt = now;
      return tennisLiveV2Cache;
    }
    if (tennisLiveV2Cache && now - tennisLiveV2FetchedAt > V2_LIVE_MAX_STALE_MS) {
      tennisLiveV2Cache = [];
      tennisLiveV2FetchedAt = now;
      return [];
    }
    return tennisLiveV2Cache ?? [];
  } catch {
    return tennisLiveV2Cache ?? [];
  }
}

// ─── SportsAPI Pro V2 WebSocket — real-time live-scores ───────────────────────
//
// One persistent WS connection per sport. Incoming messages update the same
// in-memory caches used by the REST poll helpers, so the GET /live endpoint
// automatically returns fresh data on the next request without waiting for the
// 30-second polling interval.
//
// Message shapes handled (API may send any of these):
//   { events: SAPIV2Event[] }              – full snapshot (most common)
//   { event:  SAPIV2Event  }               – single-event delta
//   { type: string, events?: ..., event?: ... }  – wrapped variant

type SportKey = "football" | "basketball" | "hockey" | "baseball" | "tennis";

const WS_DOMAINS: Record<SportKey, string> = {
  football:   "v2.football.sportsapipro.com",
  basketball: "v2.basketball.sportsapipro.com",
  hockey:     "v2.hockey.sportsapipro.com",
  baseball:   "v2.baseball.sportsapipro.com",
  tennis:     "v2.tennis.sportsapipro.com",
};

// Track which sports currently have an open WS connection
const wsConnected = new Set<SportKey>();
// Track reconnect timers so we can avoid duplicate reconnects
const wsTimers = new Map<SportKey, ReturnType<typeof setTimeout>>();
const wsRetryDelay = new Map<SportKey, number>();
const wsLastMessageAt = new Map<SportKey, number>();
const v1PatchedAt = new Map<string, number>();
const V1_PATCH_PREFER_WINDOW_MS = 15_000;
const tennisV1WsScore = new Map<string, { home?: number; away?: number; status?: string; minute?: number; patchedAt: number }>();

function v1PatchKey(sport: SportKey, id: number | string): string {
  return `${sport}:${String(id)}`;
}

function isRecentlyV1Patched(sport: SportKey, id: number | string, now: number): boolean {
  const t = v1PatchedAt.get(v1PatchKey(sport, id));
  return t !== undefined && now - t < V1_PATCH_PREFER_WINDOW_MS;
}

function liveMatchIdForSportV2(sport: SportKey, id: number | string): string {
  switch (sport) {
    case "football": return `football-v2-${id}`;
    case "basketball": return `bball-v2-${id}`;
    case "hockey": return `hockey-v2-${id}`;
    case "baseball": return `baseball-v2-${id}`;
    case "tennis": return `tennis-v2-${id}`;
  }
}

function mergeIncomingPreferFastScore(sport: SportKey, incoming: SAPIV2Event[], existing: SAPIV2Event[] | null, now: number): SAPIV2Event[] {
  if (!existing || existing.length === 0) return incoming;
  const exById = new Map(existing.map((e) => [String(e.id), e] as const));
  return incoming.map((ev) => {
    const ex = exById.get(String(ev.id));
    if (!ex) return ev;
    const exH = v2CurrentScore(ex.homeScore);
    const exA = v2CurrentScore(ex.awayScore);
    const inH = v2CurrentScore(ev.homeScore);
    const inA = v2CurrentScore(ev.awayScore);
    const prefer = isRecentlyV1Patched(sport, ev.id, now);
    const keepScore = prefer && (inH < exH || inA < exA);
    if (!keepScore) return ev;
    return { ...ev, homeScore: ex.homeScore, awayScore: ex.awayScore };
  });
}

function applyV2WsMessage(sport: SportKey, raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const msg = raw as Record<string, unknown>;

  // Extract event array from various possible message shapes
  let incoming: SAPIV2Event[] | null = null;

  if (Array.isArray(msg["events"])) {
    incoming = msg["events"] as SAPIV2Event[];
  } else if (msg["event"] && typeof msg["event"] === "object") {
    // Single-event delta — merge into existing cache
    const ev = msg["event"] as SAPIV2Event;
    incoming = null; // handled below
    mergeSingleV2Event(sport, ev);
    return;
  } else if (Array.isArray(msg["data"])) {
    incoming = msg["data"] as SAPIV2Event[];
  }

  if (!incoming) return;

  const now = Date.now();
  switch (sport) {
    case "football":
      footballLiveV2Cache = mergeIncomingPreferFastScore(sport, incoming, footballLiveV2Cache, now);
      footballLiveV2FetchedAt = now;
      // Also update today cache (live events are a subset of today)
      if (footballTodayV2Cache !== null) {
        footballTodayV2Cache = footballLiveV2Cache;
        footballTodayV2FetchedAt = now;
      }
      break;
    case "basketball":
      basketballLiveV2Cache = mergeIncomingPreferFastScore(sport, incoming, basketballLiveV2Cache, now);
      basketballLiveV2FetchedAt = now;
      if (basketballTodayV2Cache !== null) {
        basketballTodayV2Cache = basketballLiveV2Cache;
        basketballTodayV2FetchedAt = now;
      }
      break;
    case "hockey":
      hockeyLiveV2Cache = mergeIncomingPreferFastScore(sport, incoming, hockeyLiveV2Cache, now);
      hockeyLiveV2FetchedAt = now;
      if (hockeyTodayV2Cache !== null) {
        hockeyTodayV2Cache = hockeyLiveV2Cache;
        hockeyTodayV2FetchedAt = now;
      }
      break;
    case "baseball":
      baseballLiveV2Cache = mergeIncomingPreferFastScore(sport, incoming, baseballLiveV2Cache, now);
      baseballLiveV2FetchedAt = now;
      if (baseballTodayV2Cache !== null) {
        baseballTodayV2Cache = baseballLiveV2Cache;
        baseballTodayV2FetchedAt = now;
      }
      break;
    case "tennis":
      tennisLiveV2Cache = mergeIncomingPreferFastScore(sport, incoming, tennisLiveV2Cache, now);
      tennisLiveV2FetchedAt = now;
      // NOTE: do NOT sync tennisTodayV2Cache from the WS — the WS only
      // sends in-progress events, so syncing it would erase pre-match
      // events that buildTennisLiveV2 needs to detect started matches.
      break;
  }
}

function mergeSingleV2Event(sport: SportKey, ev: SAPIV2Event): void {
  const now = Date.now();
  let cache: SAPIV2Event[] | null = null;
  switch (sport) {
    case "football":   cache = footballLiveV2Cache;   break;
    case "basketball": cache = basketballLiveV2Cache; break;
    case "hockey":     cache = hockeyLiveV2Cache;     break;
    case "baseball":   cache = baseballLiveV2Cache;   break;
    case "tennis":     cache = tennisLiveV2Cache;     break;
  }
  if (!cache) {
    // No existing snapshot yet — treat as a 1-event array
    applyV2WsMessage(sport, { events: [ev] });
    return;
  }
  const idx = cache.findIndex(e => e.id === ev.id);
  const updated = idx >= 0
    ? [...cache.slice(0, idx), ev, ...cache.slice(idx + 1)]
    : [...cache, ev];
  applyV2WsMessage(sport, { events: updated });

  // Trigger immediate Delta Broadcast for real-time score updates
  const id = liveMatchIdForSportV2(sport, ev.id);
  broadcastMatchDelta(id, {
    homeScore: v2CurrentScore(ev.homeScore),
    awayScore: v2CurrentScore(ev.awayScore),
    status: v2StatusStr(ev.status),
    minute: (ev.status as any)?.minute ?? 0,
  });
}

function connectSportWS(sport: SportKey): void {
  // Don't open duplicate connections
  if (wsConnected.has(sport)) return;

  const key = SPORTSAPI_KEY;
  if (!key) return; // no API key — skip WS entirely

  const url = `wss://${WS_DOMAINS[sport]}/ws?x-api-key=${key}`;

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect(sport);
    return;
  }

  ws.addEventListener("open", () => {
    wsConnected.add(sport);
    wsRetryDelay.set(sport, 5_000);
    logger.info({ sport, version: "v2" }, "WS connected");
    ws.send(JSON.stringify({ action: "subscribe", channel: "live-scores" }));
  });

  ws.addEventListener("message", (evt) => {
    wsLastMessageAt.set(sport, Date.now());
    try {
      const data: unknown = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data));
      applyV2WsMessage(sport, data);
      // Push to clients immediately on every WS message — don't wait for the 2s drift interval.
      // broadcastLive() already guards against concurrent calls so this is safe.
      broadcastLive().catch(() => { /* ignore */ });
    } catch {
      // non-JSON heartbeat / ping — ignore
    }
  });

  ws.addEventListener("close", () => {
    wsConnected.delete(sport);
    wsLastMessageAt.delete(sport);
    scheduleReconnect(sport);
  });

  ws.addEventListener("error", (err) => {
    // error always precedes close; let the close handler reconnect
    wsConnected.delete(sport);
    wsLastMessageAt.delete(sport);
    logger.error({ sport, version: "v2", err }, "WS error");
  });
}

function scheduleReconnect(sport: SportKey): void {
  if (wsTimers.has(sport)) return; // already scheduled
  const prev = wsRetryDelay.get(sport) ?? 5_000;
  const delay = Math.min(prev, 60_000);
  const jitter = Math.floor(Math.random() * 2_000);
  const next = delay + jitter;
  wsRetryDelay.set(sport, Math.min(delay * 2, 60_000));
  const t = setTimeout(() => {
    wsTimers.delete(sport);
    connectSportWS(sport);
  }, next);
  wsTimers.set(sport, t);
}

/** Call once at server startup to open WS connections for all sports. */
export function initSportWebSockets(): void {
  for (const sport of Object.keys(WS_DOMAINS) as SportKey[]) {
    connectSportWS(sport);
  }
}

// ─── V1 WebSocket — 1-2s score-only updates ────────────────────────────────
// V1 gives faster score deltas (1-2s vs 2-5s on V2). We use it exclusively
// for patching homeScore/awayScore/status/minute into the V2 in-memory cache.
// All other data (odds, stats, etc.) stays with V2.

const V1_WS_DOMAINS: Record<SportKey, string> = {
  football:   "v1.football.sportsapipro.com",
  basketball: "v1.basketball.sportsapipro.com",
  hockey:     "v1.hockey.sportsapipro.com",
  baseball:   "v1.baseball.sportsapipro.com",
  tennis:     "v1.tennis.sportsapipro.com",
};

const v1WsConnected = new Set<SportKey>();
const v1WsTimers = new Map<SportKey, ReturnType<typeof setTimeout>>();
const v1WsRetryDelay = new Map<SportKey, number>(); // ms, doubles on each failure (cap 60s)

type V1ScoreEvent = {
  id?: number | string; // V1 may send string IDs for some sports
  homeScore?: number | { current?: number };
  awayScore?: number | { current?: number };
  status?: string | { description?: string };
  minute?: number;
};

function v1ScoreNum(s: number | { current?: number } | undefined): number | undefined {
  if (s === undefined || s === null) return undefined;
  return typeof s === "number" ? s : s.current;
}

function v1StatusStr(s: string | { description?: string } | undefined): string | undefined {
  if (!s) return undefined;
  return typeof s === "string" ? s : s.description;
}

/** Patch a single V1 score delta into the existing V2 cache for the sport. */
function applyV1ScorePatch(sport: SportKey, ev: V1ScoreEvent): void {
  if (!ev.id) return;

  const now = Date.now();
  v1PatchedAt.set(v1PatchKey(sport, ev.id), now);

  if (sport === "tennis") {
    const hs = v1ScoreNum(ev.homeScore);
    const as = v1ScoreNum(ev.awayScore);
    const st = v1StatusStr(ev.status);
    const mn = ev.minute;
    tennisV1WsScore.set(String(ev.id), { home: hs, away: as, status: st, minute: mn, patchedAt: now });

    const delta: Partial<LiveMatchState> = {};
    if (hs !== undefined) delta.homeScore = hs;
    if (as !== undefined) delta.awayScore = as;
    if (st !== undefined) delta.status = st;
    if (mn !== undefined) delta.minute = mn;
    if (Object.keys(delta).length > 0) {
      broadcastMatchDelta(liveMatchIdForSportV2("tennis", ev.id), delta);
    }
  }

  let cache: SAPIV2Event[] | null = null;
  switch (sport) {
    case "football":   cache = footballLiveV2Cache;   break;
    case "basketball": cache = basketballLiveV2Cache; break;
    case "hockey":     cache = hockeyLiveV2Cache;     break;
    case "baseball":   cache = baseballLiveV2Cache;   break;
    case "tennis":     cache = tennisLiveV2Cache;     break;
  }
  if (!cache) return; // no V2 snapshot yet — ignore until V2 provides context

  // Use string comparison — V1 may send string IDs while V2 stores numbers
  const idx = cache.findIndex(e => String(e.id) === String(ev.id));
  if (idx < 0) return; // match not in current V2 cache — skip

  const existing = cache[idx]!;
  const homeScore = v1ScoreNum(ev.homeScore);
  const awayScore = v1ScoreNum(ev.awayScore);
  const status    = v1StatusStr(ev.status);

  // Build a shallow-patched copy — only overwrite score-related fields
  const patched: SAPIV2Event = {
    ...existing,
    ...(homeScore !== undefined ? { homeScore } : {}),
    ...(awayScore !== undefined ? { awayScore } : {}),
    ...(status    !== undefined ? { status }    : {}),
    ...(ev.minute !== undefined ? { roundInfo: { round: ev.minute } } : {}),
  };

  const updated = [...cache.slice(0, idx), patched, ...cache.slice(idx + 1)];
  applyV2WsMessage(sport, { events: updated });

  // Trigger immediate Delta Broadcast for sub-second score-only updates (V1 source)
  broadcastMatchDelta(liveMatchIdForSportV2(sport, ev.id), {
    homeScore: homeScore ?? (typeof existing.homeScore === "number" ? existing.homeScore : 0),
    awayScore: awayScore ?? (typeof existing.awayScore === "number" ? existing.awayScore : 0),
    status: status,
    minute: ev.minute,
  });

  broadcastLive().catch(() => { /* ignore */ });
}

/** Parse a raw V1 WS message and dispatch score patches. */
function applyV1WsMessage(sport: SportKey, raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const msg = raw as Record<string, unknown>;

  if (Array.isArray(msg["events"])) {
    for (const ev of msg["events"] as V1ScoreEvent[]) applyV1ScorePatch(sport, ev);
  } else if (msg["event"] && typeof msg["event"] === "object") {
    applyV1ScorePatch(sport, msg["event"] as V1ScoreEvent);
  } else if (Array.isArray(msg["data"])) {
    for (const ev of msg["data"] as V1ScoreEvent[]) applyV1ScorePatch(sport, ev);
  } else if ((msg as V1ScoreEvent).id !== undefined) {
    // Bare event object
    applyV1ScorePatch(sport, msg as V1ScoreEvent);
  }
}

function connectV1SportWS(sport: SportKey): void {
  if (v1WsConnected.has(sport)) return;

  const key = SPORTSAPI_KEY;
  if (!key) return;

  const url = `wss://${V1_WS_DOMAINS[sport]}/ws?x-api-key=${key}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleV1Reconnect(sport);
    return;
  }

  ws.addEventListener("open", () => {
    v1WsConnected.add(sport);
    v1WsRetryDelay.set(sport, 5_000); // reset backoff on success
    logger.info({ sport, version: "v1" }, "V1 WS connected");
    try { ws.send(JSON.stringify({ action: "subscribe", channel: "live-scores" })); } catch { /* ignore */ }
  });

  ws.addEventListener("message", (evt) => {
    wsLastMessageAt.set(sport, Date.now());
    try {
      const data: unknown = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data));
      applyV1WsMessage(sport, data);
    } catch {
      // non-JSON heartbeat — ignore
    }
  });

  ws.addEventListener("close", () => {
    v1WsConnected.delete(sport);
    wsLastMessageAt.delete(sport);
    const delay = v1WsRetryDelay.get(sport) ?? 5_000;
    logger.warn({ sport, version: "v1", retryMs: delay }, "V1 WS closed — scheduling reconnect");
    scheduleV1Reconnect(sport, delay);
  });

  ws.addEventListener("error", () => {
    // error always precedes close — close handler does the reconnect
    v1WsConnected.delete(sport);
    wsLastMessageAt.delete(sport);
  });
}

function scheduleV1Reconnect(sport: SportKey, delayMs = 5_000): void {
  if (v1WsTimers.has(sport)) return;
  // Exponential backoff: double each failure, cap at 15s (was 60s — shorter gap means
  // faster recovery when V1 WS drops, reducing fallback to V2-only latency)
  const nextDelay = Math.min(delayMs * 2, 15_000);
  v1WsRetryDelay.set(sport, nextDelay);
  const t = setTimeout(() => {
    v1WsTimers.delete(sport);
    connectV1SportWS(sport);
  }, delayMs);
  v1WsTimers.set(sport, t);
}

/** Call once at startup to open V1 WebSocket connections for fastest score updates. */
export function initV1SportWebSockets(): void {
  for (const sport of Object.keys(V1_WS_DOMAINS) as SportKey[]) {
    connectV1SportWS(sport);
  }
}

export async function primeSportLiveCaches(): Promise<void> {
  if (!process.env.SPORTSAPI_KEY) return;
  await Promise.all([
    getFootballLiveV2().catch(() => []),
    getBasketballLiveV2().catch(() => []),
    getHockeyLiveV2().catch(() => []),
    getBaseballLiveV2().catch(() => []),
    getTennisTodayV2().catch(() => []),
  ]);
}

// ─── V2 /api/schedule/:date — multi-day upcoming events ──────────────────────

// Per-(sport,date) cache — schedule data for future days changes rarely (30min TTL)
type ScheduleV2Entry = { events: SAPIV2Event[]; fetchedAt: number };
const scheduleV2Cache = new Map<string, ScheduleV2Entry>();
const SCHEDULE_V2_TTL = 30 * 60_000;

/** Fetch all events scheduled for `date` (YYYY-MM-DD) from the given sport. */
async function getScheduleV2(sport: SportKey, date: string): Promise<SAPIV2Event[]> {
  const cacheKey = `${sport}:${date}`;
  const cached = scheduleV2Cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SCHEDULE_V2_TTL) return cached.events;
  const domain = WS_DOMAINS[sport]; // "v2.football.sportsapipro.com" etc.
  try {
    const resp = await fetch(`https://${domain}/api/schedule/${date}`, {
      signal: AbortSignal.timeout(9000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return cached?.events ?? [];
    const data = (await resp.json()) as { success?: boolean; data?: { events?: SAPIV2Event[] } };
    const events = data.data?.events ?? [];
    scheduleV2Cache.set(cacheKey, { events, fetchedAt: Date.now() });
    return events;
  } catch {
    return cached?.events ?? [];
  }
}

/**
 * Returns upcoming (not-yet-started) events across the next `days` calendar days
 * for the given sport, sorted by startTimestamp ascending.
 * Filters out events with status.type === "finished" and startTimestamp <= now.
 */
async function getUpcomingEventsV2(sport: SportKey, days = 3, graceSec = 5 * 60): Promise<SAPIV2Event[]> {
  const dates: string[] = [];
  const nowMs = Date.now();
  for (let i = 0; i < days; i++) {
    const d = new Date(nowMs + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }
  const allDays = await Promise.all(dates.map(dt => getScheduleV2(sport, dt).catch(() => [] as SAPIV2Event[])));
  const nowSec = nowMs / 1000;
  return allDays
    .flat()
    .filter(ev => {
      if (!ev.startTimestamp || ev.startTimestamp < nowSec - graceSec) return false;
      // Exclude already-finished events that the schedule may still list
      const st = ev.status;
      if (!st) return true;
      const statusType = typeof st === "object" ? (st.type ?? "") : "";
      const statusStr  = typeof st === "string" ? st.toLowerCase() : "";
      // Exclude live/inprogress events — they belong in the live feed only
      if (statusType === "inprogress" || statusStr === "inprogress" || statusStr === "live" || statusStr === "in progress") return false;
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
async function getUpcomingLeagueEventsV2(sport: SportKey, days = 7): Promise<SAPIV2Event[]> {
  const events = await getUpcomingEventsV2(sport, days);
  const seen = new Set<number>();
  const filtered: SAPIV2Event[] = [];
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    if (sport !== "football" && !isMainLeagueEventRaw(sport, ev as unknown as Record<string, unknown>)) continue;
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
};

function fractionalToDecimal(frac: string): number {
  const parts = frac.split("/");
  if (parts.length !== 2) return 0;
  const num = parseFloat(parts[0]!);
  const den = parseFloat(parts[1]!);
  if (!den || isNaN(num) || isNaN(den)) return 0;
  return Math.round((num / den + 1) * 100) / 100;
}

function parseV2PreMatchOdds(markets: V2RawMarket[]): V2PreMatchOdds | null {
  let home = 0, draw = 0, away = 0;
  let bttsYes = 0, bttsNo = 0, over25 = 0, under25 = 0;
  let firstSetHome = 0, firstSetAway = 0;

  for (const mkt of markets) {
    const grp = mkt.marketGroup ?? "";
    const name = mkt.marketName ?? "";
    const choices = mkt.choices ?? [];

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
        else if (c.name === "No") bttsNo = fractionalToDecimal(c.fractionalValue);
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
    firstSetAway > 0;
  if (!hasAny) return null;
  return { home, draw, away, bttsYes, bttsNo, over25, under25, firstSetHome, firstSetAway };
}

type PreMatchOddsEntry = { odds: V2PreMatchOdds; fetchedAt: number };
const preMatchOddsV2Cache = new Map<string, PreMatchOddsEntry>();
const PRE_MATCH_ODDS_TTL = 15 * 60_000;

async function getPreMatchOddsV2(sport: SportKey, matchId: number): Promise<V2PreMatchOdds | null> {
  const key = `${sport}:${matchId}`;
  const cached = preMatchOddsV2Cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PRE_MATCH_ODDS_TTL) return cached.odds;
  const domain = WS_DOMAINS[sport];
  try {
    const resp = await fetch(`https://${domain}/api/match/${matchId}/odds/pre-match`, {
      signal: AbortSignal.timeout(5000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { success?: boolean; data?: { markets?: V2RawMarket[] } };
    if (!data.success || !data.data?.markets?.length) return null;
    const parsed = parseV2PreMatchOdds(data.data.markets);
    if (parsed) preMatchOddsV2Cache.set(key, { odds: parsed, fetchedAt: Date.now() });
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
  if (/\bjuniors?\b|\byouth\b/.test(n) && !/women|feminine|feminino|frauen|femenin/i.test(n)) return true;
  // Specific blocked preseason / youth tournaments
  if (n.includes("trofeo dossena")) return true;
  if (n.includes("int.p")) return true;
  return false;
}

/** Returns true for women's football leagues (kept but flagged for frontend). */
function isWomensLeague(name: string): boolean {
  return /women|feminine|féminin|feminino|frauen|femenin|damall|nwsl|wsl/i.test(name);
}

// ─── V2 /api/today fetch helpers ──────────────────────────────────────────────

async function getFootballTodayV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if (footballTodayV2Cache && now - footballTodayV2FetchedAt < TODAY_V2_TTL) return footballTodayV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_FOOTBALL}/today`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return footballTodayV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    footballTodayV2Cache = data.events ?? [];
    footballTodayV2FetchedAt = now;
    return footballTodayV2Cache;
  } catch { return footballTodayV2Cache ?? []; }
}

async function getBasketballTodayV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if (basketballTodayV2Cache && now - basketballTodayV2FetchedAt < TODAY_V2_TTL) return basketballTodayV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_BASKETBALL}/today`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return basketballTodayV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    basketballTodayV2Cache = data.events ?? [];
    basketballTodayV2FetchedAt = now;
    return basketballTodayV2Cache;
  } catch { return basketballTodayV2Cache ?? []; }
}

async function getHockeyTodayV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if (hockeyTodayV2Cache && now - hockeyTodayV2FetchedAt < TODAY_V2_TTL) return hockeyTodayV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_HOCKEY}/today`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return hockeyTodayV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    hockeyTodayV2Cache = data.events ?? [];
    hockeyTodayV2FetchedAt = now;
    return hockeyTodayV2Cache;
  } catch { return hockeyTodayV2Cache ?? []; }
}

async function getTennisTodayV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if (tennisTodayV2Cache && now - tennisTodayV2FetchedAt < TODAY_V2_TTL) return tennisTodayV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_TENNIS}/today`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return tennisTodayV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    tennisTodayV2Cache = data.events ?? [];
    tennisTodayV2FetchedAt = now;
    return tennisTodayV2Cache;
  } catch { return tennisTodayV2Cache ?? []; }
}

// ─── V1 Tennis: native API (v1.tennis.sportsapipro.com) ───────────────────────
// Tennis uses a completely different API schema from other sports (no v2 live/today).
// The /all endpoint returns all today+tomorrow games; /live returns in-progress ones.

async function getTennisAllV1(): Promise<V1TennisGame[]> {
  const now = Date.now();
  if (_tennisAllV1Cache && now - _tennisAllV1FetchedAt < TODAY_V2_TTL) return _tennisAllV1Cache;
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

const TENNIS_LIVE_V1_TTL = 2000;
let _tennisLiveV1Cache: { games: V1TennisGame[]; fetchedAt: number } | null = null;
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
  if (_tennisLiveV1Cache && now - _tennisLiveV1Cache.fetchedAt < TENNIS_LIVE_V1_TTL) return _tennisLiveV1Cache.games;
  if (_tennisLiveV1Cache) {
    if (!_tennisLiveV1InFlight) {
      _tennisLiveV1InFlight = fetchTennisLiveV1()
        .then(games => { _tennisLiveV1Cache = { games, fetchedAt: Date.now() }; return games; })
        .finally(() => { _tennisLiveV1InFlight = null; });
    }
    return (await Promise.race([_tennisLiveV1InFlight, waitMs(1500).then(() => null)])) ?? _tennisLiveV1Cache.games;
  }
  if (!_tennisLiveV1InFlight) {
    _tennisLiveV1InFlight = fetchTennisLiveV1()
      .then(games => { _tennisLiveV1Cache = { games, fetchedAt: Date.now() }; return games; })
      .finally(() => { _tennisLiveV1InFlight = null; });
  }
  return _tennisLiveV1InFlight;
}

async function getBaseballTodayV2(): Promise<SAPIV2Event[]> {
  const now = Date.now();
  if (baseballTodayV2Cache && now - baseballTodayV2FetchedAt < TODAY_V2_TTL) return baseballTodayV2Cache;
  try {
    const resp = await fetch(`${SAPI_V2_BASEBALL}/today`, { signal: AbortSignal.timeout(9000), headers: sapiHeaders() });
    if (!resp.ok) return baseballTodayV2Cache ?? [];
    const data = (await resp.json()) as { events?: SAPIV2Event[] };
    baseballTodayV2Cache = data.events ?? [];
    baseballTodayV2FetchedAt = now;
    return baseballTodayV2Cache;
  } catch { return baseballTodayV2Cache ?? []; }
}

/**
 * Scan all V2 sports "today" feeds and register any finished events into
 * finishedMatchResults. Called by the settlement worker every 60 s so that
 * bets on basketball/hockey/baseball/tennis/football are settled correctly
 * even after a server restart (when the live-eviction path is cold).
 *
 * Match-ID prefix map (must match the IDs used when placing bets):
 *   football   → football-v2-{ev.id}
 *   basketball → bball-v2-{ev.id}
 *   hockey     → hockey-v2-{ev.id}
 *   baseball   → baseball-v2-{ev.id}  AND  mlb-v2-{ev.id}
 *   tennis     → tennis-v2-{ev.id}
 */
export async function scanV2AllSportsForFinished(): Promise<void> {
  try {
    const now = Date.now();

    const [footR, bballR, hockR, baseR, tennR] = await Promise.allSettled([
      getFootballTodayV2(),
      getBasketballTodayV2(),
      getHockeyTodayV2(),
      getBaseballTodayV2(),
      getTennisTodayV2(),
    ]);

    type SportBundle = { prefix: string[]; events: SAPIV2Event[]; isFootball?: boolean };
    const bundles: SportBundle[] = [
      { prefix: ["football-v2"],              events: footR.status  === "fulfilled" ? footR.value  : [], isFootball: true },
      { prefix: ["bball-v2"],                  events: bballR.status === "fulfilled" ? bballR.value : [] },
      { prefix: ["hockey-v2"],                 events: hockR.status  === "fulfilled" ? hockR.value  : [] },
      { prefix: ["baseball-v2", "mlb-v2"],     events: baseR.status  === "fulfilled" ? baseR.value  : [] },
      { prefix: ["tennis-v2"],                 events: tennR.status  === "fulfilled" ? tennR.value  : [] },
    ];

    for (const { prefix, events, isFootball } of bundles) {
      for (const ev of events) {
        const st = (ev.status as Record<string, unknown> | null | undefined);
        const stType = typeof st?.["type"] === "string" ? (st["type"] as string).toLowerCase() : "";
        const code = v2StatusCode(ev);
        const isFinished = stType === "finished" || code === 100;
        if (!isFinished) continue;

        const hS = typeof ev.homeScore === "object" && ev.homeScore !== null
          ? (ev.homeScore as SAPIV2ScoreObj) : null;
        const aS = typeof ev.awayScore === "object" && ev.awayScore !== null
          ? (ev.awayScore as SAPIV2ScoreObj) : null;
        const home = hS?.current ?? v2CurrentScore(ev.homeScore) ?? 0;
        const away = aS?.current ?? v2CurrentScore(ev.awayScore) ?? 0;

        // For football extract HT from period1 score; other sports leave undefined
        const htHome = isFootball ? (typeof hS?.["period1"] === "number" ? hS["period1"] as number : undefined) : undefined;
        const htAway = isFootball ? (typeof aS?.["period1"] === "number" ? aS["period1"] as number : undefined) : undefined;

        const record = {
          home, away,
          htHome, htAway,
          homeTeam: v2TeamName(ev.homeTeam),
          awayTeam: v2TeamName(ev.awayTeam),
          extras: { homeScore: ev.homeScore, awayScore: ev.awayScore },
          finishedAt: now,
        };

        for (const p of prefix) {
          const id = `${p}-${ev.id}`;
          if (!finishedMatchResults.has(id)) finishedMatchResults.set(id, record);
          await enqueueMatchSettlement({
            matchId: id,
            jobId: buildMatchSettlementJobId({
              matchId: id,
              home: record.home,
              away: record.away,
              htHome: record.htHome,
              htAway: record.htAway,
            }),
          });
          try {
            if (db) {
              await db.insert(matchResultsTable).values({
                matchId: id,
                sport: isFootball ? "football" : p.startsWith("bball") ? "basketball" : p.startsWith("hockey") ? "hockey" : p.startsWith("tennis") ? "tennis" : "baseball",
                home: record.home,
                away: record.away,
                htHome: record.htHome ?? null,
                htAway: record.htAway ?? null,
                homeTeam: record.homeTeam,
                awayTeam: record.awayTeam,
                cornersTotal: null,
                cardsTotal: null,
                firstGoal: null,
                extras: record.extras ?? null,
                finishedAt: new Date(record.finishedAt),
                updatedAt: new Date(),
              }).onConflictDoUpdate({
                target: matchResultsTable.matchId,
                set: {
                  home: record.home,
                  away: record.away,
                  htHome: record.htHome ?? null,
                  htAway: record.htAway ?? null,
                  homeTeam: record.homeTeam,
                  awayTeam: record.awayTeam,
                  extras: record.extras ?? null,
                  finishedAt: new Date(record.finishedAt),
                  updatedAt: new Date(),
                },
              });
            }
          } catch {
          }
        }
      }
    }

    _pruneFinishedResults();
  } catch (err) {
    logger.error({ err }, "scanV2AllSportsForFinished failed");
  }
}

// Shared helper: convert a SAPIV2Event startTimestamp to date/time strings (Europe/Lisbon)
function v2EventDateTime(ev: SAPIV2Event): { date: string; time: string } {
  const ts = ev.startTimestamp;
  if (!ts) return { date: "", time: "" };
  const d = new Date(ts * 1000);
  // Use "en-US" for predictable formatToParts field names (avoids pt-PT locale quirks
  // in some Node environments where hour/minute keys may differ).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
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
const v2TournIdCache = new Map<string, { tid: number; sid: number; fetchedAt: number }>();
const V2_TOURN_ID_TTL = 30 * 60_000;

/** Resolves the dominant tournament+season IDs for a sport from V2 live or schedule. */
async function getV2TournamentIds(sport: SportKey): Promise<{ tid: number; sid: number } | null> {
  const cached = v2TournIdCache.get(sport);
  if (cached && Date.now() - cached.fetchedAt < V2_TOURN_ID_TTL) return cached;
  const domain = WS_DOMAINS[sport];

  const extractIds = (events: unknown[]): { tid: number; sid: number } | null => {
    const countMap = new Map<string, { tid: number; sid: number; n: number }>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      // Only count events that belong to the primary league for this sport
      if (!isMainLeagueEventRaw(sport, e)) continue;
      const tourn = e["tournament"] as Record<string, unknown> | undefined;
      const uniq = tourn?.["uniqueTournament"] as Record<string, unknown> | undefined;
      const tid = Number(e["tournamentId"] ?? uniq?.["id"] ?? tourn?.["id"] ?? 0);
      const season = e["season"] as Record<string, unknown> | undefined;
      const sid = Number(e["seasonId"] ?? season?.["id"] ?? 0);
      if (!tid || !sid) continue;
      const key = `${tid}:${sid}`;
      const ex = countMap.get(key);
      if (ex) ex.n++; else countMap.set(key, { tid, sid, n: 1 });
    }
    let best: { tid: number; sid: number } | null = null; let bestN = 0;
    for (const entry of countMap.values()) { if (entry.n > bestN) { bestN = entry.n; best = { tid: entry.tid, sid: entry.sid }; } }
    return best;
  };

  // Try V2 live first (flat event structure)
  try {
    const r = await fetch(`https://${domain}/api/live`, { signal: AbortSignal.timeout(7000), headers: sapiHeaders() });
    if (r.ok) {
      const d = await r.json() as Record<string, unknown>;
      const evts = (d["events"] ?? (d["data"] as Record<string, unknown>)?.["events"] ?? []) as unknown[];
      const ids = extractIds(evts);
      if (ids) { v2TournIdCache.set(sport, { ...ids, fetchedAt: Date.now() }); return ids; }
    }
  } catch {}

  // Fall back to today's schedule (nested data.events structure)
  const todayStr = new Date().toISOString().slice(0, 10);
  const scheduleEvts = await getScheduleV2(sport, todayStr).catch(() => [] as SAPIV2Event[]);
  const ids2 = extractIds(scheduleEvts as unknown[]);
  if (ids2) { v2TournIdCache.set(sport, { ...ids2, fetchedAt: Date.now() }); return ids2; }
  return cached ?? null;
}

// ─── V2 Events/Last Cache ──────────────────────────────────────────────────────
const v2EventsLastMap = new Map<string, { events: unknown[]; fetchedAt: number }>();
const V2_EVENTS_LAST_TTL = 5 * 60_000;

async function getV2EventsLast(sport: SportKey, n = 30): Promise<unknown[]> {
  const ids = await getV2TournamentIds(sport);
  if (!ids) return [];
  const cacheKey = `${sport}:${ids.tid}:${ids.sid}:${n}`;
  const cached = v2EventsLastMap.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_EVENTS_LAST_TTL) return cached.events;
  const domain = WS_DOMAINS[sport];
  try {
    const resp = await fetch(
      `https://${domain}/api/tournament/${ids.tid}/season/${ids.sid}/events/last/${n}`,
      { signal: AbortSignal.timeout(9000), headers: sapiHeaders() }
    );
    if (!resp.ok) return cached?.events ?? [];
    const d = await resp.json() as Record<string, unknown>;
    const events = ((d["data"] as Record<string, unknown>)?.["events"] ?? []) as unknown[];
    v2EventsLastMap.set(cacheKey, { events, fetchedAt: Date.now() });
    return events;
  } catch { return cached?.events ?? []; }
}

// ─── V2 Standings Rows ─────────────────────────────────────────────────────────
type V2StandingRow = {
  position: number; team: { id: number; name: string; nameCode: string };
  matches: number; wins: number; losses: number; draws?: number;
  points?: number; percentage?: number; gamesBehind?: number; streak?: number;
  normaltimeLosses?: number; overtimeLosses?: number;
  scoresFor?: number; scoresAgainst?: number; scoreDiffFormatted?: string;
};

const v2StandingsRowCache = new Map<string, { rows: V2StandingRow[]; fetchedAt: number }>();
const V2_STANDINGS_ROWS_TTL = 30 * 60_000;

async function getV2StandingRows(sport: SportKey): Promise<V2StandingRow[]> {
  const ids = await getV2TournamentIds(sport);
  if (!ids) return [];
  const cacheKey = `${sport}:${ids.tid}:${ids.sid}`;
  const cached = v2StandingsRowCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_STANDINGS_ROWS_TTL) return cached.rows;
  const domain = WS_DOMAINS[sport];
  try {
    const resp = await fetch(
      `https://${domain}/api/tournament/${ids.tid}/season/${ids.sid}/standings`,
      { signal: AbortSignal.timeout(9000), headers: sapiHeaders() }
    );
    if (!resp.ok) return cached?.rows ?? [];
    const d = await resp.json() as Record<string, unknown>;
    const standings = ((d["data"] as Record<string, unknown>)?.["standings"] ?? []) as Array<{ type: string; rows?: V2StandingRow[] }>;
    const total = standings.find(s => s.type === "total") ?? standings[0];
    const rows = (total?.rows ?? []) as V2StandingRow[];
    v2StandingsRowCache.set(cacheKey, { rows, fetchedAt: Date.now() });
    return rows;
  } catch { return cached?.rows ?? []; }
}

const TENNIS_LIVE_STATUSES = new Set(["Set 1", "Set 2", "Set 3", "Set 4", "Set 5"]);

function buildTennisLiveMatches(
  tournaments: TennisTournament[],
  statsMap: Map<string, [TennisStatData, TennisStatData]>,
): LiveMatchState[] {
  const result: LiveMatchState[] = [];
  const parsePt = (gs: string): number | string => {
    if (!gs || gs === "0") return 0;
    if (gs === "15" || gs === "30" || gs === "40") return parseInt(gs);
    if (gs === "AD") return "AD";
    return 0;
  };

  // Sort by tournament priority: Grand Slams → Masters → ATP 500 → ATP 250 → Challenger → ITF
  const sorted = [...tournaments].sort((a, b) => tennisLeaguePriority(a.name) - tennisLeaguePriority(b.name));

  for (const t of sorted) {
    const matches = Array.isArray(t.match) ? t.match : (t.match ? [t.match] : []);
    for (const m of matches) {
      if (!m) continue;

      const now = Date.now();
      const id = `tennis-live-${m.id}`;
      const existing = liveMatchState.get(id);

      // Skip any match not explicitly live according to Statpal.
      // Tennis courts run late (previous match still in progress) — never
      // infer "in progress" from time alone; only trust real API statuses.
      if (!TENNIS_LIVE_STATUSES.has(m.status)) continue;
      const players = Array.isArray(m.player) ? m.player : [m.player];
      if (players.length < 2) continue;
      const p0 = players[0]!;
      const p1 = players[1]!;
      // Skip doubles (player name contains "/")
      if (p0.name.includes("/") || p0.dp1) continue;

      // Build sets array (all sets incl in-progress)
      const sets: Array<[number, number]> = [];
      for (const sf of ["s1", "s2", "s3", "s4", "s5"] as const) {
        const h = p0[sf]; const a = p1[sf];
        if (h !== "" && a !== "") sets.push([parseFloat(h) || 0, parseFloat(a) || 0]);
      }

      const homeScore = parseInt(p0.totalscore) || 0;
      const awayScore = parseInt(p1.totalscore) || 0;
      const setNum    = parseInt(m.status.split(" ")[1]!) || 1;

      // Current game points
      const hGs = parsePt(p0.game_score);
      const aGs = parsePt(p1.game_score);
      let hPt: number | string, aPt: number | string;
      if (hGs === 40 && aGs === 40)      { hPt = "D";  aPt = "D"; }
      else if (hGs === "AD")              { hPt = "AD"; aPt = 40; }
      else if (aGs === "AD")              { hPt = 40;   aPt = "AD"; }
      else                                { hPt = hGs;  aPt = aGs; }

      // ── Live odds: react to sets + games within set + current game points ──
      const setsDiff  = homeScore - awayScore; // sets won difference

      // Games in current set (last entry of sets array = set in progress)
      const curSetH   = sets.length > 0 ? (sets[sets.length - 1]?.[0] ?? 0) : 0;
      const curSetA   = sets.length > 0 ? (sets[sets.length - 1]?.[1] ?? 0) : 0;
      const gamesDiff = curSetH - curSetA;

      // Current game point values: 0→0, 15→1, 30→2, 40→3, AD→4
      const PT: Record<string, number> = { "": 0, "0": 0, "15": 1, "30": 2, "40": 3, "AD": 4 };
      const hPtN  = PT[p0.game_score] ?? 0;
      const aPtN  = PT[p1.game_score] ?? 0;
      const ptDiff = hPtN - aPtN;

      // Serving advantage: server has a slight edge (~1 pt weight)
      const isServeTrue = (v: unknown): boolean => {
        const s = String(v ?? "").trim().toLowerCase();
        return s === "true" || s === "1" || s === "yes";
      };
      const getServeVal = (p: any): unknown =>
        p?.serve ?? p?.serving ?? p?.server ?? p?.isServing ?? p?.service ?? p?.srv;
      const serveFromMatch = (() => {
        const raw = (m as any)?.serve ?? (m as any)?.server ?? (m as any)?.serving;
        const s = String(raw ?? "").trim().toLowerCase();
        if (s === "1" || s === "home") return [true, false] as const;
        if (s === "2" || s === "away") return [false, true] as const;
        return null;
      })();
      const p0Serving = serveFromMatch ? serveFromMatch[0] : isServeTrue(getServeVal(p0));
      const p1Serving = serveFromMatch ? serveFromMatch[1] : isServeTrue(getServeVal(p1));
      const servingBonus = p0Serving ? 0.5 : p1Serving ? -0.5 : 0;

      // Weighted composite: 1 set ≈ 6 games ≈ 24 pts; scale accordingly
      const advantage = setsDiff * 0.22 + gamesDiff * 0.042 + ptDiff * 0.012 + servingBonus * 0.008;
      const factor    = Math.min(0.55, Math.abs(advantage));

      // Use real pre-match odds from cache (populated by getTennisOdds) as base.
      // Fall back to a balanced model only if we have no cached data yet.
      const cached = _tennisPreMatchOdds.get(_tennisPairKey(p0.name, p1.name));
      const baseOdds = cached
        ? { home: cached.home, draw: 0, away: cached.away }
        : makeOddsFromTeams(p0.name, p1.name);

      const liveOdds = advantage === 0
        ? { home: baseOdds.home, draw: 0, away: baseOdds.away }
        : advantage > 0
          ? { home: Math.max(1.01, +(baseOdds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(50, +(baseOdds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(50, +(baseOdds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.01, +(baseOdds.away * (1 - factor)).toFixed(2)) };

      const liveHomeP = liveOdds.home > 0 && liveOdds.away > 0
        ? (1 / liveOdds.home) / (1 / liveOdds.home + 1 / liveOdds.away)
        : 0.5;

      // Placar Exato do Set — negative-binomial model from current game score
      const pGame = Math.min(0.85, Math.max(0.15, 0.5 + (liveHomeP - 0.5) * 0.8));
      const setExactScore = computeSetExactScoreOdds(curSetH, curSetA, pGame);

      // ── Per-set winner markets: live-adjust based on current game score ────
      // numDoneSets = sets fully won by either side (homeScore + awayScore)
      const numDoneSets = homeScore + awayScore;
      const baseExtras   = computeTennisExtras(liveHomeP);
      const set1Games    = sets[0] ?? ([0, 0] as [number, number]);
      const set2Games    = sets.length >= 2 ? (sets[1] ?? ([0, 0] as [number, number])) : ([0, 0] as [number, number]);

      // Live probability for who wins a set given current game score within it.
      // Each game lead shifts win probability ~5.5 pp from the base match prob.
      const liveSetWinProb = (hG: number, aG: number, base: number): number =>
        Math.min(0.97, Math.max(0.03, 0.5 + (base - 0.5) * 0.55 + (hG - aG) * 0.055));

      // Set 1: in-progress → live-adjust; done → keep base (will be suspended)
      let firstSetOdds: { home: number; away: number };
      if (numDoneSets === 0 && sets.length >= 1) {
        const pS1 = liveSetWinProb(set1Games[0], set1Games[1], liveHomeP);
        const [s1h, s1a] = probsToDecimalOdds([pS1, 1 - pS1], 1.06);
        firstSetOdds = { home: s1h!, away: s1a! };
      } else {
        firstSetOdds = baseExtras.firstSet;
      }

      // Set 2: in-progress → live-adjust; done → keep base (will be suspended)
      let set2Odds: { home: number; away: number };
      if (numDoneSets === 1 && sets.length >= 2) {
        const pS2 = liveSetWinProb(set2Games[0], set2Games[1], liveHomeP);
        const [s2h, s2a] = probsToDecimalOdds([pS2, 1 - pS2], 1.07);
        set2Odds = { home: s2h!, away: s2a! };
      } else {
        set2Odds = baseExtras.set2;
      }

      // Completed set markets are permanently settled — suspend them
      const SETTLED = now + 30 * 24 * 60 * 60 * 1000;
      const settledSusp: Record<string, number> = {};
      if (numDoneSets >= 1) settledSusp["firstSet"] = SETTLED;
      if (numDoneSets >= 2) settledSusp["set2"]     = SETTLED;

      const currentPoints: [number | string, number | string] = [hPt, aPt];
      const serving: [boolean, boolean] = [p0Serving, p1Serving];
      const suspPts: [number | string, number | string] = [
        hPt === "D" ? "40" : hPt,
        aPt === "D" ? "40" : aPt,
      ];

      const prevPoints = existing?._liveExtra?.currentPoints;
      const prevSets   = existing?._liveExtra?.sets;
      const lastTennisUpdate = existing?._oddsUpdatedAt ?? 0;
      const isDifferentPollCycle = (now - lastTennisUpdate) > 1500;
      const pointPlayed =
        isDifferentPollCycle &&
        prevPoints !== undefined && (
          JSON.stringify(prevPoints) !== JSON.stringify(currentPoints) ||
          JSON.stringify(prevSets)   !== JSON.stringify(sets)
        );

      let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension
        ? Object.fromEntries(Object.entries(existing.marketSuspension).filter(([, ts]) => ts > now))
        : undefined;

      if (Object.keys(settledSusp).length > 0) {
        marketSuspension = { ...(marketSuspension ?? {}), ...settledSusp };
      }

      let suspensionReason = existing?._suspensionReason;

      if (pointPlayed) {
        const suspMs = tennisSuspensionMs(suspPts, sets, homeScore, awayScore);
        if (suspMs > 0) {
          const pointSusp = Object.fromEntries(
            TENNIS_SUSP_KEYS.map((k) => [k, now + suspMs]),
          );
          marketSuspension = { ...(marketSuspension ?? {}), ...pointSusp, ...settledSusp };
          suspensionReason = "PONTO EM JOGO";
        }
      } else if (marketSuspension && Object.keys(marketSuspension).length === 0) {
        marketSuspension = undefined;
        suspensionReason = undefined;
      } else if (!pointPlayed && suspensionReason === "PONTO EM JOGO") {
        const active = marketSuspension
          ? Object.entries(marketSuspension).filter(([k, ts]) => ts > now && settledSusp[k] === undefined)
          : [];
        suspensionReason = active.length > 0 ? suspensionReason : undefined;
      }

      // Only tennis-relevant markets — no football goals/corners/cards
      const tennisOnlyMarkets = {
        doubleChance:    { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore:  { yes: 0, no: 0 },
        totalGoals:      { over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0, over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0 },
        handicap:        { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
        halfTime:        { home: 0, draw: 0, away: 0 },
        firstGoal:       { home: 0, noGoal: 0, away: 0 },
        tennisExtra:     { ...baseExtras, firstSet: firstSetOdds, set2: set2Odds, setExactScore, currentSetNum: setNum,
          // Per-set exact score: live-updated for in-progress set, settled (single entry) for completed sets
          set1ExactScore: numDoneSets === 0
            ? setExactScore
            : { [`${set1Games[0]}-${set1Games[1]}`]: 1.01 },
          set2ExactScore: numDoneSets === 0
            ? undefined
            : numDoneSets === 1
              ? setExactScore
              : { [`${set2Games[0]}-${set2Games[1]}`]: 1.01 },
        },
      } as unknown as AdvancedMarkets;

      result.push({
        id,
        home:             p0.name,
        away:             p1.name,
        league:           t.name,
        country:          "tennis",
        sport:            "tennis",
        homeScore,
        awayScore,
        minute:           setNum,
        status:           m.status,
        hasRealOdds:      !!cached,
        odds:             liveOdds,
        markets:          tennisOnlyMarkets,
        events:           [],
        marketSuspension: marketSuspension && Object.keys(marketSuspension).length > 0 ? marketSuspension : undefined,
        _suspensionReason: suspensionReason,
        _oddsUpdatedAt:    now,
        _liveExtra:        { sets, currentPoints, serving, tennisStats: statsMap.get(m.id) },
      });
    }
  }
  return result;
}

function buildVolleyballLiveMatches(tournaments: VolleyTournament[]): LiveMatchState[] {
  const VSET_LIVE = new Set(["Set 1", "Set 2", "Set 3", "Set 4", "Set 5"]);
  const result: LiveMatchState[] = [];

  // Sort by league priority: SuperLega / Superliga / PlusLiga → medium leagues
  const sorted = [...tournaments].sort((a, b) => volleyballLeaguePriority(a.league) - volleyballLeaguePriority(b.league));

  // Today's date in DD.MM.YYYY for filtering non-live matches
  const now = new Date();
  const todayStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;

  for (const t of sorted) {
    const matches = Array.isArray(t.match) ? t.match : t.match ? [t.match] : [];
    for (const m of matches) {
      if (!m) continue;
      const home = m.home; const away = m.away;
      if (!home?.name || !away?.name) continue;

      // Statpal sometimes sends numeric status codes (e.g. "43") when a set is in progress
      const isNumericStatus = /^\d+$/.test(String(m.status ?? ""));
      const isLive       = VSET_LIVE.has(m.status) || isNumericStatus;
      const isNotStarted = m.status === "Not Started";
      const isFinished   = m.status === "Finished";

      if (isFinished) continue; // never show finished games in live section
      if (!isLive && !isNotStarted) continue;
      // Non-live: only today's fixtures
      if (isNotStarted && m.date !== todayStr) continue;
      // Only show Not Started games within 90 min — avoids showing afternoon games in the morning
      const minsUntilStart = isNotStarted ? matchStartsInMinutes(m.date ?? "", m.time ?? "") : 0;
      if (isNotStarted && minsUntilStart > 90) continue;

      // If Statpal still reports "Not Started" but the scheduled time has already passed,
      // treat as in-progress (API lag) so the match shows as live rather than upcoming.
      const apiLagging = isNotStarted && minsUntilStart < 0;

      const homeScore = parseInt(home.totalscore) || 0;
      const awayScore = parseInt(away.totalscore) || 0;

      const vollSets: Array<[number, number]> = [];
      let ptH = 0, ptA = 0;
      const sfs = ["s1", "s2", "s3", "s4", "s5"] as const;

      if (isLive) {
        // Build completed sets and current-set points
        const setNum = parseInt(m.status.split(" ")[1]!) || 1;
        for (let i = 0; i < sfs.length; i++) {
          const h = home[sfs[i]!]; const a = away[sfs[i]!];
          if (!h || !a) break;
          if (i < setNum - 1) vollSets.push([parseInt(h) || 0, parseInt(a) || 0]);
          else { ptH = parseInt(h) || 0; ptA = parseInt(a) || 0; }
        }
      } else if (isFinished) {
        // All sets completed — include every scored set
        for (const sf of sfs) {
          const h = home[sf]; const a = away[sf];
          if (!h || !a) break;
          vollSets.push([parseInt(h) || 0, parseInt(a) || 0]);
        }
      }

      // For numeric status (e.g. "43"), infer set number from total sets won
      const setNumFromScore = (parseInt(home.totalscore || "0") + parseInt(away.totalscore || "0") + 1);
      const setNum      = isLive
        ? (isNumericStatus ? setNumFromScore : (parseInt(m.status.split(" ")[1]!) || 1))
        : (apiLagging ? 1 : 0);
      const statusLabel = isNotStarted
        ? (apiLagging ? "Em Jogo" : `Hoje ${m.time}`)
        : isFinished ? "Encerrado"
        : (isNumericStatus ? `Set ${setNumFromScore}` : m.status);
      const baseOdds    = makeOddsFromTeams(home.name, away.name);

      result.push({
        id:          `volley-live-${m.id}`,
        home:        home.name,
        away:        away.name,
        league:      t.league,
        country:     t.country,
        sport:       "volleyball",
        homeScore,
        awayScore,
        minute:      setNum,
        status:      statusLabel,
        hasRealOdds: !isFinished,
        odds:        isFinished
          ? { home: 0, draw: 0, away: 0 }
          : { home: baseOdds.home, draw: 0, away: baseOdds.away },
        markets:     makeAdvancedMarketsFromTeams(home.name, away.name),
        events:      [],
        _liveExtra:  { vollSets, ...(isLive ? { currentPts: [ptH, ptA] as [number, number] } : {}) },
      });
    }
  }
  return result;
}

// ─── ET / Penalty market helpers ────────────────────────────────────────────────

function makeETMarketsFromScore(
  etHome: number, etAway: number,
  totalHome: number, totalAway: number,
): NonNullable<AdvancedMarkets["etExtra"]> {
  const marg = 0.07;
  const price = (p: number) => mr(mc(1 / Math.max(0.01, p) * (1 + marg), 1.01, 200));

  // ET period result (1X2 — draw in ET means match goes to penalties)
  const etDiff = etHome - etAway;
  let pH: number, pD: number, pA: number;
  if (etDiff === 0)       { pH = 0.37; pD = 0.28; pA = 0.35; }
  else if (etDiff === 1)  { pH = 0.72; pD = 0.18; pA = 0.10; }
  else if (etDiff === -1) { pH = 0.10; pD = 0.18; pA = 0.72; }
  else if (etDiff >= 2)   { pH = 0.92; pD = 0.05; pA = 0.03; }
  else                    { pH = 0.03; pD = 0.05; pA = 0.92; }

  // Tie winner — who advances from the knockout (penalty shootout is 50/50 if ET ends level)
  const totalDiff = totalHome - totalAway;
  let pTH: number, pTA: number;
  if (totalDiff >= 3)       { pTH = 0.98; pTA = 0.02; }
  else if (totalDiff === 2) { pTH = 0.95; pTA = 0.05; }
  else if (totalDiff === 1) { pTH = pH + pD * 0.5; pTA = pA + pD * 0.5; }
  else if (totalDiff === 0) { pTH = pH + pD * 0.5; pTA = pA + pD * 0.5; }
  else if (totalDiff === -1){ pTH = pA + pD * 0.5; pTA = pH + pD * 0.5; }
  else if (totalDiff === -2){ pTH = 0.05; pTA = 0.95; }
  else                      { pTH = 0.02; pTA = 0.98; }
  // Normalise
  const tSum = pTH + pTA;
  pTH /= tSum; pTA /= tSum;

  // Next goal scorer — trailing team is more desperate, slight advantage
  let pNG_H: number, pNG_A: number;
  if (totalDiff > 0)       { pNG_H = 0.45; pNG_A = 0.55; } // away trailing → more desperate
  else if (totalDiff < 0)  { pNG_H = 0.55; pNG_A = 0.45; } // home trailing → more desperate
  else                     { pNG_H = 0.50; pNG_A = 0.50; }

  // Total goals (Poisson model for remaining ET time)
  const totalGoalsET = etHome + etAway;
  const λ = Math.max(0.05, 0.65 - totalGoalsET * 0.22);
  const p0 = Math.exp(-λ);
  const p1 = λ * p0;
  const p2 = (λ * λ / 2) * p0;
  const pO05 = Math.max(0.02, 1 - p0);
  const pO15 = Math.max(0.01, 1 - p0 - p1);
  const pO25 = Math.max(0.005, 1 - p0 - p1 - p2);

  return {
    tieWinner: { home: price(pTH), away: price(pTA) },
    etResult:  { home: price(pH), draw: price(pD), away: price(pA) },
    totalGoals: {
      o05: price(pO05),  u05: price(1 - pO05),
      o15: price(pO15),  u15: price(1 - pO15),
      o25: price(pO25),  u25: price(1 - pO25),
    },
    nextGoal: { home: price(pNG_H), away: price(pNG_A) },
  };
}

function makePenMarketsFromScore(penHome: number, penAway: number): NonNullable<AdvancedMarkets["penExtra"]> {
  const marg = 0.07;
  const price = (p: number) => mr(mc(1 / Math.max(0.01, p) * (1 + marg), 1.01, 50));

  const diff = penHome - penAway;
  let pHome: number, pAway: number;
  if (diff === 0)       { pHome = 0.50; pAway = 0.50; }
  else if (diff === 1)  { pHome = 0.68; pAway = 0.32; }
  else if (diff === -1) { pHome = 0.32; pAway = 0.68; }
  else if (diff >= 2)   { pHome = 0.88; pAway = 0.12; }
  else                  { pHome = 0.12; pAway = 0.88; }

  return { winner: { home: price(pHome), away: price(pAway) } };
}

// ─── Match builders ────────────────────────────────────────────────────────────

// Max time a football match may stay in live: 210 min (90 + 30 ET + 15 pen shoot + buffer)
const MATCH_MAX_LIVE_MS  = 210 * 60 * 1000;
// Max time a match may sit in "HT" status: 22 min (real HT is ≤15 min)
const HT_MAX_DURATION_MS = 22 * 60 * 1000;
// Additional FINISHED statuses Statpal may return when slow to update
const STATPAL_FINISHED_STATUSES = new Set([
  "FT", "AET", "AP", "Pen", "Full Time", "After ET", "After Pens",
  "Finished", "Ended", "Abandoned", "Postponed", "Cancelled", "Susp",
]);

async function buildLiveMatches(): Promise<LiveMatchState[]> {
  const [leagues, odds] = await Promise.all([getLiveLeagues(), getOddsMap()]);

  const sorted = [...leagues]
    .sort((a, b) => leaguePriority(a.name, a.country) - leaguePriority(b.name, b.country))
    .filter(l => leaguePriority(l.name, l.country) < 100);

  // ── Garbage-collect liveMatchState for IDs no longer in the Statpal response ──
  const currentMatchIds = new Set<string>();
  for (const league of sorted) {
    const ms: StatpalMatchV2[] = Array.isArray(league.match) ? league.match : [league.match];
    for (const m of ms) currentMatchIds.add(m.main_id);
  }
  for (const id of liveMatchState.keys()) {
    const state = liveMatchState.get(id);
    if (!state) continue;
    if (state.sport !== "football") continue;
    if (id.startsWith("football-v2-")) continue;
    if (currentMatchIds.has(id)) {
      if (state._missingSinceAt) {
        liveMatchState.set(id, { ...state, _missingSinceAt: undefined });
      }
      continue;
    }
    const missingSince = state._missingSinceAt ?? Date.now();
    if (!state._missingSinceAt) {
      liveMatchState.set(id, { ...state, _missingSinceAt: missingSince });
      continue;
    }
    if (Date.now() - missingSince > getFootballLiveDisappearGraceMs(state)) {
      liveMatchState.delete(id);
    }
  }

  const now = Date.now();
  let count = 0;
  const result: LiveMatchState[] = [];

  for (const league of sorted) {
    if (count >= 30) break;
    const matches: StatpalMatchV2[] = Array.isArray(league.match) ? league.match : [league.match];

    for (const m of matches) {
      if (count >= 30) break;

      // ── Guard 0: explicitly finished statuses Statpal is slow to remove ───────
      if (STATPAL_FINISHED_STATUSES.has(m.status)) continue;

      const isLiveMinute = /^\d{1,3}$/.test(m.status);
      const isHT = m.status === "HT";
      const isET = m.status === "ET";
      if (!isLiveMinute && !isHT && !isET) continue;

      // ── Guard 0b: frozen feed detection ─────────────────────────────────────
      // If Statpal's own updated_ts hasn't moved in >15min, the feed is frozen.
      // In that case, drop any match whose scheduled kickoff + 130 min has passed
      // (it's almost certainly over even if Statpal still shows it as in-progress).
      if (liveFeedUpdatedTs > 0) {
        const feedAgeMs = now - liveFeedUpdatedTs * 1000;
        const FROZEN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
        if (feedAgeMs > FROZEN_THRESHOLD_MS && m.date && m.time) {
          // Parse "DD.MM.YYYY" + "HH:MM" into UTC ms
          const [d, mo, y] = m.date.split(".").map(Number);
          const [h, mi] = m.time.split(":").map(Number);
          if (!isNaN(d) && !isNaN(h)) {
            const kickoffMs = Date.UTC(y, mo - 1, d, h, mi);
            const MAX_MATCH_DURATION_MS = 130 * 60 * 1000; // 130 min (90 + ET + buffer)
            if (now - kickoffMs > MAX_MATCH_DURATION_MS) continue; // match is over
          }
        }
      }

      const existing = liveMatchState.get(m.main_id);

      // ── Guard 1: discard match that has been live longer than MATCH_MAX_LIVE_MS ─
      const firstSeenAt = existing?._firstSeenAt ?? now;
      if (now - firstSeenAt > MATCH_MAX_LIVE_MS) {
        liveMatchState.delete(m.main_id);
        continue;
      }

      // ── Guard 2: discard match stuck in "HT" for more than HT_MAX_DURATION_MS ──
      // Reset htStartedAt when match leaves HT (progresses to 2nd half)
      const htStartedAt = isHT
        ? (existing?._htStartedAt ?? (existing?.status === "HT" ? existing._htStartedAt : now))
        : undefined;
      if (isHT && htStartedAt !== undefined && now - htStartedAt > HT_MAX_DURATION_MS) {
        liveMatchState.delete(m.main_id);
        continue;
      }

      const homeScore = m.home.goals === "?" ? 0 : parseInt(m.home.goals) || 0;
      const awayScore = m.away.goals === "?" ? 0 : parseInt(m.away.goals) || 0;
      const injMinute = parseInt(m.inj_minute) || 0;
      const injTime = parseInt(m.inj_time) || 0;
      const minuteBase = isHT ? 45 : isET ? 105 : parseInt(m.status) || 1;
      const minuteRaw = injMinute > 0
        ? Math.min(130, Math.max(1, injMinute + Math.max(0, injTime)))
        : minuteBase;
      const minute = existing ? Math.max(existing.minute, minuteRaw) : minuteRaw;
      const gameStatus = isHT ? "HT" : isET ? "ET" : parseInt(m.status) > 45 ? "2nd half" : "1st half";

      // Stable odds: once assigned, keep unless score changes significantly
      let matchOdds: { home: number; draw: number; away: number };
      let matchMarkets: AdvancedMarkets;
      let matchMarketSuspension: Record<string, number> | undefined;
      let matchSuspensionReason: string | undefined;

      let hasRealOdds = true; // Always show odds — use model when real unavailable

      if (existing && existing.homeScore === homeScore && existing.awayScore === awayScore) {
        // Score unchanged — background drift timer handles market updates every 1–2s.
        // Here we update minute, clean up expired suspensions, and re-filter settled markets.
        const now = Date.now();
        if (existing.marketSuspension) {
          const active = Object.fromEntries(
            Object.entries(existing.marketSuspension).filter(([, ts]) => ts > now)
          );
          matchMarketSuspension = Object.keys(active).length > 0 ? active : undefined;
        }

        // Re-apply filterLiveMarkets so settled lines (BTTS, Over/Under) stay zeroed
        // even if drift or initialization left them non-zero.
        const safeMarkets = filterLiveMarkets(existing.markets, homeScore, awayScore, gameStatus);
        const safeBase   = filterLiveMarkets(existing._baseMarkets ?? existing.markets, homeScore, awayScore, gameStatus);

        const updatedState = {
          ...existing,
          minute,
          date: m.date,
          time: m.time,
          markets: safeMarkets,
          _baseMarkets: safeBase,
          marketSuspension: matchMarketSuspension,
          _suspensionReason: matchMarketSuspension ? existing._suspensionReason : undefined,
          _firstSeenAt: firstSeenAt,
          _htStartedAt: isHT ? htStartedAt : undefined,
        };
        // Inject ET/pen markets if match is in extra time / penalties (always refresh in ET)
        {
          const inETU = isET || minute > 90;
          let mkt = updatedState.markets;
          if (inETU) {
            const etH = (m.et && m.et.home_goals != null) ? m.et.home_goals : 0;
            const etA = (m.et && m.et.away_goals != null) ? m.et.away_goals : 0;
            mkt = { ...mkt, etExtra: makeETMarketsFromScore(etH, etA, homeScore, awayScore) };
          }
          if (m.penalties && !mkt.penExtra) {
            mkt = { ...mkt, penExtra: makePenMarketsFromScore(m.penalties.home_pen, m.penalties.away_pen) };
          }
          if (mkt !== updatedState.markets) (updatedState as LiveMatchState).markets = mkt;
        }
        liveMatchState.set(m.main_id, updatedState as LiveMatchState);
        result.push({ ...updatedState as LiveMatchState, events: existing.events });
        count++;
        continue;
      } else {
        // Score changed or first seen — build base odds from pre-match model/real data
        // Detect goal: score increased vs previous state
        const isGoal = existing != null && (homeScore > existing.homeScore || awayScore > existing.awayScore);
        if (isGoal) {
          const now = Date.now();
          matchMarketSuspension = Object.fromEntries(
            FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("goal", k)])
          ) as Record<string, number>;
          matchSuspensionReason = "GOLO!";
        }
        const resolved = resolveOdds(m, odds);
        matchMarkets = resolved.markets;
        hasRealOdds = true;

        // Collect red cards from events (before they are parsed below)
        const rawEvents = m.events?.event ? (Array.isArray(m.events.event) ? m.events.event : [m.events.event]) : [];
        const rcHome = countRedCards(rawEvents.map(e => ({ type: e.type ?? "", team: e.team ?? "" })), "home");
        const rcAway = countRedCards(rawEvents.map(e => ({ type: e.type ?? "", team: e.team ?? "" })), "away");

        // Use sportsbook probability engine when score or game state changed
        matchOdds = calculateLive1x2({
          minute,
          homeGoals: homeScore,
          awayGoals: awayScore,
          redCardsHome: rcHome,
          redCardsAway: rcAway,
          baseHome: resolved.odds.home,
          baseDraw: resolved.odds.draw,
          baseAway: resolved.odds.away,
        });

        // Filter markets for live score (remove impossible/settled lines)
        matchMarkets = filterLiveMarkets(matchMarkets, homeScore, awayScore, gameStatus);

        // Recalculate total goals using live-adjusted lambda (remaining time + current score)
        matchMarkets = {
          ...matchMarkets,
          totalGoals: recalcLiveTotalGoals(
            m.home.name, m.away.name,
            homeScore + awayScore, minute, m.status,
            matchMarkets.totalGoals
          ),
          ...(matchMarkets.teamGoals ? {
            teamGoals: recalcLiveTeamGoals(
              m.home.name, m.away.name,
              homeScore, awayScore, minute, m.status,
              matchMarkets.teamGoals
            ),
          } : {}),
          bothTeamsScore: recalcLiveBothTeamsScore(
            m.home.name, m.away.name,
            homeScore, awayScore, minute, m.status,
            matchMarkets.bothTeamsScore
          ) ?? matchMarkets.bothTeamsScore,
        };

        // Recalculate halfTime / secondHalf immediately on score change (Poisson-based)
        {
          const htScoreNow: [number, number] | null = m.ht
            ? [m.ht.home_goals, m.ht.away_goals]
            : null;
          if (matchMarkets.halfTime) {
            matchMarkets = {
              ...matchMarkets,
              halfTime: recalcLiveHalfTime(
                m.home.name, m.away.name,
                homeScore, awayScore, minute, m.status,
                matchMarkets.halfTime
              ),
            };
          }
          if (matchMarkets.secondHalf) {
            matchMarkets = {
              ...matchMarkets,
              secondHalf: recalcLiveSecondHalf(
                m.home.name, m.away.name,
                homeScore, awayScore, htScoreNow,
                minute, m.status,
                matchMarkets.secondHalf
              ),
            };
          }

          // ── HT/FT: zero out impossible outcomes when HT result is known ──────
          // At HT break: homeScore/awayScore ARE the halftime scores.
          // In 2nd half: use htScoreNow (from m.ht) to recover HT score.
          if (matchMarkets.htft) {
            const isAtHT = m.status === "HT";
            const isIn2nd = !isAtHT && minute > 45;
            let htH: number | null = null;
            let htA: number | null = null;
            if (isAtHT) { htH = homeScore; htA = awayScore; }
            else if (isIn2nd && htScoreNow) { [htH, htA] = htScoreNow; }

            if (htH !== null && htA !== null) {
              const htR = htH > htA ? "h" : htH < htA ? "a" : "d";
              const hf = matchMarkets.htft;
              // Extract the 3 surviving implied probs and re-normalize
              const raw3: [number, number, number] =
                htR === "h" ? [hf.hh, hf.hd, hf.ha] :
                htR === "d" ? [hf.dh, hf.dd, hf.da] :
                              [hf.ah, hf.ad, hf.aa];
              const ps = raw3.map(o => (o > 1 ? 1 / o : 0));
              const sum3 = ps.reduce((a, b) => a + b, 0);
              if (sum3 > 1e-9) {
                const normed = ps.map(p => mc(p / sum3, 0.01, 0.99));
                const [o1, o2, o3] = probsToDecimalOdds(normed, 1.10);
                if (o1 !== undefined && o2 !== undefined && o3 !== undefined) {
                  const nh = { hh: 0, hd: 0, ha: 0, dh: 0, dd: 0, da: 0, ah: 0, ad: 0, aa: 0 };
                  if (htR === "h") { nh.hh = o1; nh.hd = o2; nh.ha = o3; }
                  else if (htR === "d") { nh.dh = o1; nh.dd = o2; nh.da = o3; }
                  else { nh.ah = o1; nh.ad = o2; nh.aa = o3; }
                  matchMarkets = { ...matchMarkets, htft: nh };
                }
              }
            }
          }
        }

        // Recalculate Double Chance and Draw No Bet from the ACTUAL live 1X2 odds.
        // The base model computes these from internal ELO probs which diverge from the
        // live 1X2 after score changes (e.g. Home=1.06 but DC homeOrDraw shows 2.89).
        {
          const inv = (o: number) => (o > 1 ? 1 / o : 0);
          const pH = inv(matchOdds.home);
          const pD = inv(matchOdds.draw);
          const pA = inv(matchOdds.away);
          const sum = pH + pD + pA;
          if (sum > 0 && matchOdds.draw > 0) {
            const nH = pH / sum, nD = pD / sum, nA = pA / sum;
            const dc = (p: number) => mr(mc(1 / Math.max(1e-9, p * 1.04), 1.01, 100));
            matchMarkets = {
              ...matchMarkets,
              doubleChance: {
                homeOrDraw: dc(nH + nD),
                awayOrDraw: dc(nA + nD),
                homeOrAway: dc(nH + nA),
              },
              drawNoBet: matchMarkets.drawNoBet ? {
                home: mr(mc(1 / Math.max(1e-9, (nH / Math.max(1e-9, nH + nA)) * 1.04), 1.01, 100)),
                away: mr(mc(1 / Math.max(1e-9, (nA / Math.max(1e-9, nH + nA)) * 1.04), 1.01, 100)),
              } : undefined,
            };
          }
        }
      }

      const events: LiveMatchState["events"] = [];
      if (m.events?.event) {
        const evArr = Array.isArray(m.events.event) ? m.events.event : [m.events.event];
        for (const ev of evArr) {
          events.push({
            type: ev.type,
            team: ev.team,
            minute: parseInt(ev.minute) || 0,
            player: ev.player || "",
          });
        }
      }
      // Red card counts derived from the fully-parsed events (available in both branches)
      const stateRcHome = countRedCards(events, "home");
      const stateRcAway = countRedCards(events, "away");

      // ── Live-recalculate new football markets from remaining expected goals ──
      if (!isET && !m.penalties && minute < 90) {
        const remFrac = Math.max(0.01, (90 - Math.min(minute, 89)) / 90);
        const pH0 = 0.95 / Math.max(1.01, matchOdds.home);
        const pA0 = 0.95 / Math.max(1.01, matchOdds.away);
        const pD0 = Math.max(0.02, 1 - pH0 - pA0);
        const totL = 2.6;
        const hStr = pH0 + pD0 * 0.45;
        const aStr = pA0 + pD0 * 0.45;
        const muH = totL * (hStr / Math.max(1e-9, hStr + aStr)) * 1.08 * remFrac
          * Math.max(0.4, 1 - 0.12 * stateRcHome + 0.04 * stateRcAway);
        const muA = totL * (aStr / Math.max(1e-9, hStr + aStr)) * 0.92 * remFrac
          * Math.max(0.4, 1 - 0.12 * stateRcAway + 0.04 * stateRcHome);
        const pHomeWin = pH0 / Math.max(1e-9, pH0 + pD0 + pA0);
        const pAwayWin = pA0 / Math.max(1e-9, pH0 + pD0 + pA0);
        const homeScore = m.home.goals === "?" ? 0 : parseInt(m.home.goals) || 0;
        const awayScore = m.away.goals === "?" ? 0 : parseInt(m.away.goals) || 0;
        const scored = homeScore + awayScore;
        // Win to Nil & Clean Sheet — zeroed when opponent has already scored
        const pWTNH = awayScore === 0 ? mc(pHomeWin * Math.exp(-muA), 0.01, 0.85) : 0;
        const pWTNA = homeScore === 0 ? mc(pAwayWin * Math.exp(-muH), 0.01, 0.85) : 0;
        const pCSH  = awayScore === 0 ? mc(Math.exp(-muA), 0.01, 0.99) : 0;
        const pCSA  = homeScore === 0 ? mc(Math.exp(-muH), 0.01, 0.99) : 0;
        const wtnHLive = pWTNH > 0 ? mr(mc(1 / (pWTNH * 0.935), 1.01, 50)) : 0;
        const wtnALive = pWTNA > 0 ? mr(mc(1 / (pWTNA * 0.935), 1.01, 50)) : 0;
        const csHLive  = pCSH  > 0 ? mr(mc(1 / (pCSH  * 0.935), 1.01, 20)) : 0;
        const csALive  = pCSA  > 0 ? mr(mc(1 / (pCSA  * 0.935), 1.01, 20)) : 0;
        // Odd/Even: parity of goals already scored + remaining
        const muRem = muH + muA;
        const pmfRem = poissonPmf(muRem, 10);
        let pOddFin = 0, pEvenFin = 0;
        for (let k = 0; k <= 10; k++) {
          if ((scored + k) % 2 === 0) pEvenFin += pmfRem[k]!;
          else pOddFin += pmfRem[k]!;
        }
        const [oeOddL, oeEvenL] = probsToDecimalOdds([mc(pOddFin, 0.20, 0.80), mc(pEvenFin, 0.20, 0.80)], 1.06);
        // Exact Goals: accumulate remaining distribution into buckets
        const egBuckets: Record<string, number> = {};
        for (let add = 0; add <= 10; add++) {
          const tot = scored + add;
          const key = tot >= 5 ? "g5plus" : `g${tot}`;
          egBuckets[key] = (egBuckets[key] ?? 0) + (pmfRem[add] ?? 0);
        }
        const egBucketTotal = Object.values(egBuckets).reduce((a, b) => a + b, 0);
        const egLiveOdds = egBucketTotal > 0
          ? Object.fromEntries(Object.entries(egBuckets).map(([k, p]) => [k, Math.max(1.01, +(1 / ((p / egBucketTotal) * 0.87)).toFixed(2))]))
          : {};
        // Team Goals O/U live: P(team scores ≥ threshold more goals | still have remaining time)
        const tgLive = (score: number, threshold: number, mu: number): [number, number] => {
          if (score >= threshold) return [0, 0]; // already settled — won the Over
          const need = threshold - score;
          const pOver = mc(1 - poissonCdf(mu, need - 1), 0.02, 0.98);
          const r = probsToDecimalOdds([pOver, 1 - pOver], 1.065);
          return [r[0]!, r[1]!];
        };
        const [ho05, hu05] = tgLive(homeScore, 1, muH);
        const [ho15, hu15] = tgLive(homeScore, 2, muH);
        const [ho25, hu25] = tgLive(homeScore, 3, muH);
        const [ao05, au05] = tgLive(awayScore, 1, muA);
        const [ao15, au15] = tgLive(awayScore, 2, muA);
        const [ao25, au25] = tgLive(awayScore, 3, muA);

        matchMarkets = {
          ...matchMarkets,
          winToNil:   { home: wtnHLive, away: wtnALive },
          cleanSheet: { home: csHLive,  away: csALive  },
          ...(oeOddL && oeEvenL ? { goalOddEven: { odd: oeOddL, even: oeEvenL } } : {}),
          ...(Object.keys(egLiveOdds).length > 0 ? {
            exactGoals: {
              g0: egLiveOdds["g0"] ?? 0, g1: egLiveOdds["g1"] ?? 0,
              g2: egLiveOdds["g2"] ?? 0, g3: egLiveOdds["g3"] ?? 0,
              g4: egLiveOdds["g4"] ?? 0, g5plus: egLiveOdds["g5plus"] ?? 0,
            }
          } : {}),
          teamGoals: {
            homeOver05: ho05, homeUnder05: hu05,
            homeOver15: ho15, homeUnder15: hu15,
            homeOver25: ho25, homeUnder25: hu25,
            awayOver05: ao05, awayUnder05: au05,
            awayOver15: ao15, awayUnder15: au15,
            awayOver25: ao25, awayUnder25: au25,
          },
        };
      }

      // ── Remove 1st-half markets after half-time ─────────────────────────────
      // These markets are settled at half-time and must not show in the 2nd half.
      const in2ndHalf = !isHT && !isET && !m.penalties && minute > 45;
      const isAtHT    = isHT;
      if (isAtHT || in2ndHalf) {
        matchMarkets = {
          ...matchMarkets,
          htCorrectScore: undefined,                          // 1T correct score — settled
          halfTime:  { home: 0, draw: 0, away: 0 },          // 1T result — settled (zeros hide in UI)
          btts1H:    undefined,                               // Both teams score in 1T — settled
          firstGoal: { home: 0, noGoal: 0, away: 0 },        // First goalscorer — settled (zeros hide in UI)
        };
      }

      // Live-recalculate h2CorrectScore during 2nd half from remaining λ
      if (!isHT && !isET && !m.penalties && minute > 45 && minute < 90) {
        const rem2HFrac = Math.max(0.01, (90 - Math.min(minute, 89)) / 45);
        const pH0b = 0.95 / Math.max(1.01, matchOdds.home);
        const pA0b = 0.95 / Math.max(1.01, matchOdds.away);
        const pD0b = Math.max(0.02, 1 - pH0b - pA0b);
        const hStrB = pH0b + pD0b * 0.45; const aStrB = pA0b + pD0b * 0.45;
        const mu2HH = 2.6 * (hStrB / Math.max(1e-9, hStrB + aStrB)) * 1.08 * rem2HFrac
          * Math.max(0.4, 1 - 0.12 * stateRcHome + 0.04 * stateRcAway);
        const mu2HA = 2.6 * (aStrB / Math.max(1e-9, hStrB + aStrB)) * 0.92 * rem2HFrac
          * Math.max(0.4, 1 - 0.12 * stateRcAway + 0.04 * stateRcHome);
        // Infer 2H score from events (goals scored after minute 45 come from 2H)
        const htGoalsH = events.filter(e => e.team === "home" && e.type.toLowerCase().includes("goal") && e.minute <= 45).length;
        const htGoalsA = events.filter(e => e.team === "away" && e.type.toLowerCase().includes("goal") && e.minute <= 45).length;
        const home2H = Math.max(0, homeScore - htGoalsH);
        const away2H = Math.max(0, awayScore - htGoalsA);
        const pmf2HH = poissonPmf(mu2HH, 7);
        const pmf2HA = poissonPmf(mu2HA, 7);
        const h2CSM: Record<string, number> = {};
        let h2CSOtherL = 0;
        for (let i = 0; i <= 7; i++) {
          for (let j = 0; j <= 7; j++) {
            const tot_i = home2H + i, tot_j = away2H + j;
            const p = (pmf2HH[i] ?? 0) * (pmf2HA[j] ?? 0);
            if (tot_i > 4 || tot_j > 4) { h2CSOtherL += p; continue; }
            h2CSM[`${tot_i}-${tot_j}`] = (h2CSM[`${tot_i}-${tot_j}`] ?? 0) + p;
          }
        }
        const h2CSArr = Object.entries(h2CSM).sort((a, b) => b[1] - a[1]);
        const h2CSTotL = h2CSArr.reduce((s, [, p]) => s + p, 0) + h2CSOtherL;
        if (h2CSTotL > 0) {
          const h2CSO = probsToDecimalOdds(h2CSArr.map(([, p]) => mc(p / h2CSTotL, 0.005, 0.70)), 1.14);
          const h2CSnew: Record<string, number> = {};
          h2CSArr.forEach(([score], idx) => { h2CSnew[score] = h2CSO[idx]!; });
          h2CSnew["Outro"] = mr(mc(1 / mc(h2CSOtherL / Math.max(1e-9, h2CSTotL) / 1.14, 0.005, 0.60), 1.01, 500));
          matchMarkets = { ...matchMarkets, h2CorrectScore: h2CSnew };
        }
      }

      // VAR review / penalty / big-chance detection → suspend all markets
      // Triggered on dangerous events in the most recent 2 minutes of play
      const VAR_DANGER_TOKENS = ["penalty", "var", "missed", "bigchance", "big_chance", "suspension", "expelled"];
      const VAR_REASON_MAP: Record<string, string> = {
        penalty: "PENÁLTI",
        var: "REVISÃO AO VAR",
        bigchance: "GRANDE CHANCE",
        big_chance: "GRANDE CHANCE",
        missed: "GRANDE CHANCE",
        suspension: "SUSPENSO",
        expelled: "SUSPENSO",
      };
      const recentThreshold = Math.max(1, minute - 2);
      const isGoalEvent = existing != null && (homeScore > (existing.homeScore ?? -1) || awayScore > (existing.awayScore ?? -1));
      // Search for a danger event in recent play.
      // On a goal tick we still allow VAR/penalty through — but suppress bigchance/missed
      // because those make no sense when a goal was actually scored.
      const dangerEvent = events.find(e => {
        const t = e.type.toLowerCase().replace(/[\s_-]/g, "");
        if (e.minute < recentThreshold) return false;
        if (!VAR_DANGER_TOKENS.some(token => t.includes(token.replace("_", "")))) return false;
        if (isGoalEvent && !t.includes("var") && !t.includes("penalty")) return false;
        return true;
      });
      if (dangerEvent) {
        const now = Date.now();
        const evType = dangerEvent.type.toLowerCase().replace(/[\s_-]/g, "");
        const reasonKey = Object.keys(VAR_REASON_MAP).find(k => evType.includes(k));
        const reason = reasonKey ? VAR_REASON_MAP[reasonKey] : "SUSPENSO";
        const isHighPriority = reason.includes("VAR") || reason.includes("PENÁL");
        if (!matchMarketSuspension) {
          // No active suspension yet — set full timers
          matchMarketSuspension = Object.fromEntries(
            FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("var", k)])
          ) as Record<string, number>;
          matchSuspensionReason = reason;
        } else if (isHighPriority) {
          // VAR/penalty always overrides existing label (e.g. "GOLO!" → "REVISÃO AO VAR")
          // Do NOT reset suspension timers — keep the existing (longer) goal timers
          matchSuspensionReason = reason;
        }
      }

      // Inject ET markets when in extra time (minute > 90 or isET status)
      if (isET || minute > 90) {
        const etH = (m.et && m.et.home_goals != null) ? m.et.home_goals : 0;
        const etA = (m.et && m.et.away_goals != null) ? m.et.away_goals : 0;
        matchMarkets = { ...matchMarkets, etExtra: makeETMarketsFromScore(etH, etA, homeScore, awayScore) };
      }
      // Inject penalty markets when shootout is underway
      if (m.penalties) {
        matchMarkets = { ...matchMarkets, penExtra: makePenMarketsFromScore(m.penalties.home_pen, m.penalties.away_pen) };
      }

      const footballExtra: LiveMatchState["_liveExtra"] = {};
      if (m.ht) footballExtra.htScore = [m.ht.home_goals, m.ht.away_goals];
      if (m.et) footballExtra.etScore = [m.et.home_goals, m.et.away_goals];
      if (m.penalties) footballExtra.penScore = [m.penalties.home_pen, m.penalties.away_pen];

      const state: LiveMatchState = {
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: normalizeLeagueName(league.name, league.country),
        country: league.country,
        sport: "football",
        homeScore,
        awayScore,
        minute,
        status: m.status,
        hasRealOdds,
        odds: matchOdds,
        markets: matchMarkets,
        events,
        marketSuspension: matchMarketSuspension,
        _suspensionReason: matchSuspensionReason,
        _baseOdds: matchOdds,
        _baseMarkets: matchMarkets,
        _oddsUpdatedAt: Date.now(),
        _driftPhase: 0,
        _liveExtra: Object.keys(footballExtra).length > 0 ? footballExtra : undefined,
        _firstSeenAt: firstSeenAt,
        _htStartedAt: isHT ? htStartedAt : undefined,
        redCardsHome: stateRcHome > 0 ? stateRcHome : undefined,
        redCardsAway: stateRcAway > 0 ? stateRcAway : undefined,
        date: m.date,
        time: m.time,
        leagueId: league.id,
      };

      liveMatchState.set(m.main_id, state);
      result.push(state);
      count++;
    }
  }

  return result;
}

async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  const events = await getUpcomingEventsV2("football", 3);
  const seen = new Set<string>();
  const primary: SAPIV2Event[] = [];
  const fallback: SAPIV2Event[] = [];

  for (const ev of events) {
    const home = v2TeamName(ev.homeTeam);
    const away = v2TeamName(ev.awayTeam);
    if (home === "Unknown" || away === "Unknown") continue;
    const countryRaw = v2TournCountry(ev);
    const countryKey = normalizeCountryKey(countryRaw);
    const leagueRaw = countryKey ? `${countryKey}: ${v2TournName(ev.tournament)}` : v2TournName(ev.tournament);
    const leagueName = normalizeLeagueName(leagueRaw, countryKey);
    if (isBlockedLeague(`${leagueName} ${home} ${away}`)) continue;
    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (footballLeagueAllowedStrict(countryRaw, leagueName)) primary.push(ev);
    else if (!isLeagueUniversallyBlocked(`${leagueName} ${home} ${away}`)) fallback.push(ev);
    if (primary.length >= 80) break;
  }
  const filtered = (primary.length > 0 ? primary : fallback).slice(0, primary.length > 0 ? 80 : 3);

  const oddsResults: Array<V2PreMatchOdds | null> = new Array(filtered.length).fill(null);
  const maxOddsLookups = Math.min(filtered.length, 30);
  const batchSize = 10;
  for (let i = 0; i < maxOddsLookups; i += batchSize) {
    const slice = filtered.slice(i, i + batchSize);
    const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("football", ev.id).catch(() => null)));
    for (let j = 0; j < out.length; j++) oddsResults[i + j] = out[j] ?? null;
  }

  const results: UpcomingMatch[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const ev = filtered[i]!;
    const home = v2TeamName(ev.homeTeam);
    const away = v2TeamName(ev.awayTeam);
    const countryRaw = v2TournCountry(ev);
    const countryKey = normalizeCountryKey(countryRaw);
    const leagueRaw = countryKey ? `${countryKey}: ${v2TournName(ev.tournament)}` : v2TournName(ev.tournament);
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
      ...(realOdds?.bttsYes ? { bothTeamsScore: { yes: realOdds.bttsYes, no: realOdds.bttsNo ?? 0 } } : {}),
      ...(realOdds?.over25 ? { totalGoals: { ...baseMarkets.totalGoals, over25: realOdds.over25, under25: realOdds.under25 ?? 0 } } : {}),
    };
    const hasFull1x2 = !!(realOdds && realOdds.home > 0 && realOdds.draw > 0 && realOdds.away > 0);
    odds = hasFull1x2 ? { home: realOdds!.home, draw: realOdds!.draw, away: realOdds!.away } : baseOdds;
    hasRealOdds = hasFull1x2;

    results.push({
      id: `fb-v2-${ev.id}`,
      home,
      away,
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
    const hUtc = ((parseInt(hStr!) - offsetH) + 24) % 24;
    const scheduledMs = new Date(`${isoDate}T${String(hUtc).padStart(2, "0")}:${mStr}:00Z`).getTime();
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
    const hUtc = ((parseInt(hStr!) - offsetH) + 24) % 24;
    const matchMs = new Date(`${isoDate}T${String(hUtc).padStart(2, "0")}:${mStr}:00Z`).getTime();
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
function shiftHour(dateStr: string, timeStr: string): { date: string; time: string } {
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
function _tennisPairKey(n0: string, n1: string): string {
  const sur = (n: string) => n.replace(/^([A-Z]\.\s*)+/, "").trim().toLowerCase();
  return [sur(n0), sur(n1)].sort().join("|");
}

// ─── Live odds cache: real bookmaker live odds fetched per-match ───────────────
// Keyed by V2 match ID (number). TTL = 45 s. Fetched from:
//   GET {SAPI_V2_TENNIS}/match/:id/odds  →  market "Full time" isLive:true
// Populated by refreshTennisLiveOdds() (fire-and-forget, called from buildTennisLiveV2).
const _tennisLiveOddsCache = new Map<number, { home: number; away: number; at: number }>();
const TENNIS_LIVE_ODDS_TTL = 45_000;

/** Convert fractional odd string (e.g. "7/2") to decimal (e.g. 4.50). */
function parseFractionalOdd(frac: string): number {
  const [n, d] = frac.split("/").map(Number);
  if (!d || isNaN(n) || isNaN(d)) return 0;
  return +(1 + n / d).toFixed(2);
}

/** Fire-and-forget: fetch live bookmaker odds for each match ID and store in cache. */
function refreshTennisLiveOdds(matchIds: number[]): void {
  const toFetch = matchIds.filter(id => {
    const cached = _tennisLiveOddsCache.get(id);
    return !cached || Date.now() - cached.at > TENNIS_LIVE_ODDS_TTL;
  });
  if (toFetch.length === 0) return;
  void Promise.allSettled(toFetch.map(async id => {
    try {
      const res = await fetch(`${SAPI_V2_TENNIS}/match/${id}/odds`, {
        headers: sapiHeaders(),
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) return;
      const j = await res.json() as { data?: { markets?: Array<{ marketName?: string; marketId?: number; isLive?: boolean; choices?: Array<{ name?: string; fractionalValue?: string }> }> } };
      const markets = j.data?.markets ?? [];
      // Pick the live Full time (match winner) market
      const ft = markets.find(m => (m.marketName === "Full time" || m.marketId === 1) && m.isLive === true);
      if (!ft) return;
      const homeChoice = (ft.choices ?? []).find(c => c.name === "1");
      const awayChoice = (ft.choices ?? []).find(c => c.name === "2");
      if (!homeChoice?.fractionalValue || !awayChoice?.fractionalValue) return;
      const home = parseFractionalOdd(homeChoice.fractionalValue);
      const away = parseFractionalOdd(awayChoice.fractionalValue);
      if (home <= 1 || away <= 1) return; // sanity — 1/1 or worse is a data error
      _tennisLiveOddsCache.set(id, { home, away, at: Date.now() });
    } catch { /* ignore */ }
  }));
}

const _tennisServingCache = new Map<number, { serving: [boolean, boolean]; at: number }>();
const _tennisServingInFlight = new Map<number, Promise<void>>();
const TENNIS_SERVING_TTL = 5_000;

function refreshTennisServing(matchIds: number[]): void {
  const now = Date.now();
  const toBool = (v: unknown): boolean | null => {
    if (v === true || v === false) return v;
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
    return null;
  };
  const extract = (j: any): [boolean, boolean] | null => {
    const ev =
      j?.event ??
      j?.data?.event ??
      j?.data?.match?.event ??
      j?.data?.data?.event ??
      null;
    if (!ev) return null;
    const h = ev.homeTeam ?? ev.home ?? ev.homeCompetitor ?? null;
    const a = ev.awayTeam ?? ev.away ?? ev.awayCompetitor ?? null;
    const hs = toBool(h?.serving ?? h?.serve ?? h?.isServing ?? h?.service);
    const as = toBool(a?.serving ?? a?.serve ?? a?.isServing ?? a?.service);
    if (hs === null && as === null) return null;
    return [hs === true, as === true];
  };

  const toFetch = matchIds.filter((id) => {
    const cached = _tennisServingCache.get(id);
    if (cached && now - cached.at <= TENNIS_SERVING_TTL) return false;
    if (_tennisServingInFlight.has(id)) return false;
    return true;
  });
  if (toFetch.length === 0) return;

  for (const id of toFetch) {
    const p = (async () => {
      try {
        const res = await fetch(`${SAPI_V2_TENNIS}/match/${id}`, {
          headers: sapiHeaders(),
          signal: AbortSignal.timeout(6_000),
        });
        if (!res.ok) return;
        const j = await res.json();
        const s = extract(j);
        if (!s) return;
        _tennisServingCache.set(id, { serving: s, at: Date.now() });
      } catch {
      }
    })().finally(() => {
      _tennisServingInFlight.delete(id);
    });
    _tennisServingInFlight.set(id, p);
  }
}


export { buildLiveMatches, buildUpcomingMatches, getUpcomingAll };

// ─── SportsAPI Pro V2 Live Build Functions ────────────────────────────────────

const FOOTBALL_V2_FINISHED = new Set([
  "Finished", "Ended", "FT", "After Extra Time", "After Penalties", "AP",
  "AET", "Postponed", "Cancelled", "Abandoned", "Suspended",
]);
const FOOTBALL_V2_LIVE = new Set([
  "1st half", "2nd half", "HT", "Extra Time", "1st extra time", "2nd extra time",
  "Penalties", "Break Time", "Pause",
  // VAR / video review — match stays live while review is in progress
  "VAR Review", "Video Review", "VAR", "Awaiting Review", "Awaiting review",
]);

// Tracks the last time a match's minute+score changed.
// If both are frozen for > 20 min the match is a zombie and gets evicted.
const _v2StuckTracker = new Map<string, { minute: number; score: string; since: number }>();

async function buildFootballLiveV2(events: SAPIV2Event[]): Promise<LiveMatchState[]> {
  const now = Date.now();
  const clockSkewSec = (() => {
    const v = Number(process.env.FOOTBALL_CLOCK_SKEW_SEC ?? "180");
    if (!Number.isFinite(v)) return 180;
    return Math.min(600, Math.max(0, Math.trunc(v)));
  })();
  const result: LiveMatchState[] = [];
  const currentIds = new Set<string>();

  const pool = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
    let i = 0;
    const workers = Array.from({ length: Math.max(1, limit) }).map(async () => {
      while (i < items.length) {
        const cur = items[i++]!;
        await fn(cur);
      }
    });
    await Promise.all(workers);
  };

  const metaById = new Map<number, { countryRaw: string; countryKey: string; leagueName: string; prio: number }>();
  const primary: Array<{ ev: SAPIV2Event; prio: number }> = [];
  const fallback: Array<{ ev: SAPIV2Event; prio: number }> = [];

  for (const ev of events) {
    const statusStr = v2StatusStr(ev.status);
    if (FOOTBALL_V2_FINISHED.has(statusStr)) continue;
    if (!FOOTBALL_V2_LIVE.has(statusStr)) continue;
    const evAgeSeconds = ev.startTimestamp ? Date.now() / 1000 - ev.startTimestamp : 0;
    if (evAgeSeconds > 2.5 * 3600) continue;
    const homeTeam = v2TeamName(ev.homeTeam);
    const awayTeam = v2TeamName(ev.awayTeam);
    if (homeTeam === "Unknown" || awayTeam === "Unknown") continue;

    const countryRaw = v2TournCountry(ev);
    const countryKey = normalizeCountryKey(countryRaw);
    const leagueRaw = countryKey ? `${countryKey}: ${v2TournName(ev.tournament)}` : v2TournName(ev.tournament);
    const leagueName = normalizeLeagueName(leagueRaw, countryKey);
    if (isBlockedLeague(`${leagueName} ${homeTeam} ${awayTeam}`)) continue;

    const key = `${countryKey}: ${leagueName}`.toLowerCase();
    const prio = leaguePriority(key, countryKey);
    metaById.set(ev.id, { countryRaw, countryKey, leagueName, prio });

    if (footballLeagueAllowedStrict(countryRaw, leagueName)) primary.push({ ev, prio });
    else if (!isLeagueUniversallyBlocked(`${leagueName} ${homeTeam} ${awayTeam}`)) fallback.push({ ev, prio: prio === 999 ? 500 : prio });
  }

  primary.sort((a, b) => a.prio - b.prio);
  fallback.sort((a, b) => a.prio - b.prio);

  const chosen =
    (primary.length > 0 ? primary.slice(0, 40) : fallback.slice(0, 3))
      .map((x) => x.ev);

  const firstSeenMatchIds = Array.from(new Set(chosen
    .filter(ev => !liveMatchState.has(`football-v2-${ev.id}`))
    .map(ev => ev.id)
  ));

  const prefetchOdds = new Map<number, { home: number; draw: number; away: number }>();
  await pool(firstSeenMatchIds, 6, async (id) => {
    const o = await getV2Match1x2Odds("football", String(id));
    if (o) prefetchOdds.set(id, o);
  });

  const redCardIds = Array.from(new Set(chosen.map(ev => ev.id))).slice(0, 12);

  const prefetchRedCards = new Map<number, V2RedCards>();
  await pool(redCardIds, 4, async (id) => {
    const rc = await getFootballV2RedCards(id);
    if (rc) prefetchRedCards.set(id, rc);
  });

  for (const ev of chosen) {
    const statusStr = v2StatusStr(ev.status);

    const id = `football-v2-${ev.id}`;
    currentIds.add(id);

    // Skip matches the server already saw finish — API sometimes re-reports
    // completed matches as "live" in a later poll (zombie feed).
    if (finishedMatchResults.has(id)) continue;

    const homeTeam = v2TeamName(ev.homeTeam);
    const awayTeam = v2TeamName(ev.awayTeam);
    const homeScore = v2CurrentScore(ev.homeScore);
    const awayScore = v2CurrentScore(ev.awayScore);
    const meta = metaById.get(ev.id);
    const league = meta?.leagueName ?? normalizeLeagueName(v2TournName(ev.tournament), "");
    const { date, time } = v2EventDateTime(ev);
    const rc = prefetchRedCards.get(ev.id) ?? v2FootballRedCardsCache.get(ev.id) ?? { home: 0, away: 0, fetchedAt: 0 };
    const rcHome = rc.home ?? 0;
    const rcAway = rc.away ?? 0;

    // Block youth matches: check league name AND team names (e.g. "Pergolettese U19")
    if (isBlockedLeague(`${league} ${homeTeam} ${awayTeam}`)) continue;

    const existing = liveMatchState.get(id);
    const isHT = statusStr === "HT";
    const isPen = statusStr === "Penalties";
    const isET = !isPen && (statusStr.includes("extra") || statusStr === "Extra Time");
    const isBreak = statusStr === "Break Time" || statusStr === "Pause";
    let resolvedKickoffSec: number | undefined = existing?._liveExtra?.kickoffSec;
    let minute: number;
    if (isHT) {
      minute = 45;
    } else if (isPen) {
      minute = 120;
    } else if (isET) {
      minute = 105;
    } else {
      // Resolve kickoff timestamp: prefer the event's own startTimestamp; if absent or zero,
      // fall back to the event's scheduled time so each game has its own independent clock.
      let kickoffSec = existing?._liveExtra?.kickoffSec ?? ev.startTimestamp ?? 0;
      if (!kickoffSec) {
        const { date: sDate, time: sTime } = v2EventDateTime(ev);
        if (sDate && /^\d{2}:\d{2}$/.test(sTime)) {
          try {
            const [dd, mm, yyyy] = sDate.split(".");
            const offsetH = lisbonOffsetHours();
            const [hStr, mStr] = sTime.split(":");
            const hUtc = ((parseInt(hStr!) - offsetH) + 24) % 24;
            kickoffSec = new Date(`${yyyy}-${mm}-${dd}T${String(hUtc).padStart(2, "0")}:${mStr}:00Z`).getTime() / 1000;
          } catch { kickoffSec = 0; }
        }
      }
      if (kickoffSec > 0) {
        resolvedKickoffSec = kickoffSec;
        const minsFromKickoff = Math.floor(((now / 1000 - kickoffSec) - clockSkewSec) / 60);
        if (statusStr === "1st half") {
          // Allow up to 49' for first-half stoppage time
          minute = Math.min(49, Math.max(1, minsFromKickoff));
        } else if (statusStr === "2nd half") {
          const shKickoff = existing?._liveExtra?.secondHalfKickoffSec;
          if (typeof shKickoff === "number" && Number.isFinite(shKickoff) && shKickoff > 0) {
            const minsFromSecondHalf = Math.floor(((now / 1000 - shKickoff) - clockSkewSec) / 60);
            minute = Math.min(99, Math.max(46, 46 + minsFromSecondHalf));
          } else {
            minute = Math.min(99, Math.max(46, minsFromKickoff - 15));
          }
        } else {
          minute = Math.min(49, Math.max(1, minsFromKickoff));
        }
      } else {
        // Last resort: no timestamp available at all — use mid-period defaults
        minute = statusStr === "1st half" ? 25 : statusStr === "2nd half" ? 70 : 45;
      }
    }
    const inferredHT = isBreak && !existing?._liveExtra?.secondHalfKickoffSec && minute >= 45 && minute <= 55;
    if (inferredHT) minute = 45;
    const newStatus = inferredHT ? "HT" : isHT ? "HT" : isPen ? "Penalties" : isET ? "ET" : statusStr;

    if (existing) {
      const diff = existing.minute - minute;
      if (!(diff > 0 && diff <= 8)) {
        minute = Math.max(existing.minute, minute);
      }
    }

    const clockNowSec = Math.floor(now / 1000);
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    const isFirstHalf = statusStr === "1st half";
    const isSecondHalf = statusStr === "2nd half";
    const isClockRunning = !!(resolvedKickoffSec && (isFirstHalf || isSecondHalf) && newStatus !== "HT");
    const shKickoffSec = isSecondHalf
      ? (existing?._liveExtra?.secondHalfKickoffSec ?? 0)
      : 0;
    const baseSec =
      !resolvedKickoffSec ? null
      : newStatus === "HT" ? 45 * 60
      : isFirstHalf
        ? clamp(clockNowSec - resolvedKickoffSec - clockSkewSec, 0, 49 * 60)
        : isSecondHalf
          ? clamp(
              45 * 60 +
                (shKickoffSec > 0
                  ? (clockNowSec - shKickoffSec - clockSkewSec)
                  : Math.max(0, (clockNowSec - resolvedKickoffSec - clockSkewSec) - (15 * 60))),
              45 * 60,
              99 * 60,
            )
          : null;
    const secInMin = baseSec === null ? 0 : clamp(baseSec % 60, 0, 59);
    const secStr = String(secInMin).padStart(2, "0");

    const clockStr =
      newStatus === "HT" ? undefined
      : isFirstHalf
        ? (minute > 45 ? `45+${minute - 45}'` : minute > 0 ? `${String(minute).padStart(2, "0")}:${secStr}` : undefined)
        : isSecondHalf
          ? (minute > 90 ? `90+${minute - 90}'` : minute > 0 ? `${String(minute).padStart(2, "0")}:${secStr}` : undefined)
          : (minute > 0 ? `${minute}'` : undefined);

    // Zombie detector: if minute AND score are identical for too long the feed is frozen.
    // Exclude HT/ET/Penalties where minute naturally stays constant for legitimate breaks.
    if (!isHT && !isPen && !isET) {
      const scoreKey = `${homeScore}-${awayScore}`;
      const stuck = _v2StuckTracker.get(id);
      if (stuck && stuck.minute === minute && stuck.score === scoreKey) {
        if (now - stuck.since > 45 * 60 * 1000) {
          // Mark finished so it doesn't reappear; clean up tracker and skip.
          finishedMatchResults.set(id, { home: homeScore, away: awayScore, homeTeam, awayTeam, finishedAt: now });
          liveMatchState.delete(id);
          _v2StuckTracker.delete(id);
          continue;
        }
      } else {
        _v2StuckTracker.set(id, { minute, score: scoreKey, since: now });
      }
    }

    if (existing) {
      // Pre-compute VAR status once, used in both scored and non-scored branches
      const rawStatusDesc = v2StatusStr(ev.status).toLowerCase();
      const isVARStatus = rawStatusDesc.includes("var") ||
        rawStatusDesc.includes("video review") ||
        rawStatusDesc.includes("awaiting review") ||
        rawStatusDesc.includes("var check") ||
        rawStatusDesc.includes("awaiting var") ||
        rawStatusDesc.includes("video assistant");

      const scored = homeScore !== existing.homeScore || awayScore !== existing.awayScore;
      const baseOdds = existing._baseOdds ?? { home: existing.odds.home, draw: existing.odds.draw, away: existing.odds.away };
      const newOdds = scored
        ? calculateLive1x2({ minute, homeGoals: homeScore, awayGoals: awayScore, redCardsHome: rcHome, redCardsAway: rcAway, baseHome: baseOdds.home, baseDraw: baseOdds.draw, baseAway: baseOdds.away })
        : existing.odds;

      // Penalty score tracking: when entering "Penalties" phase store the pre-penalty base score.
      // On every subsequent tick compute goals scored in the shootout from the delta.
      const prevBase = existing._liveExtra?.penBaseScore;
      const penBase: [number, number] = isPen
        ? (existing.status !== "Penalties"
            ? [homeScore, awayScore]              // just transitioned — current score IS the base
            : (prevBase ?? [homeScore, awayScore])) // already in penalties — keep stored base
        : [0, 0];
      const penGoals: [number, number] = isPen
        ? [Math.max(0, homeScore - penBase[0]), Math.max(0, awayScore - penBase[1])]
        : [0, 0];
      const penLiveExtra: LiveMatchState["_liveExtra"] = isPen
        ? { ...(existing._liveExtra ?? {}), penBaseScore: penBase, penScore: penGoals }
        : existing._liveExtra;
      const shKickoffSec =
        statusStr === "2nd half"
          ? (existing.status !== "2nd half"
              ? Math.floor(now / 1000)
              : (existing._liveExtra?.secondHalfKickoffSec ?? Math.floor(now / 1000)))
          : existing._liveExtra?.secondHalfKickoffSec;
      const liveExtra = {
        ...(penLiveExtra ?? {}),
        ...(shKickoffSec ? { secondHalfKickoffSec: shKickoffSec } : {}),
        kickoffSec: resolvedKickoffSec,
        ...(baseSec !== null ? { clockSec: baseSec, clockAtMs: now, clockRunning: isClockRunning } : {}),
        clockStr,
      };

      // Helper: patch penExtra with real penalty odds into markets
      const withPen = (mkts: typeof existing.markets) =>
        isPen ? { ...mkts, penExtra: makePenMarketsFromScore(penGoals[0], penGoals[1]) } : mkts;

      if (scored) {
        // Goal detected — filter settled markets, set goal suspension.
        // If the API is simultaneously reporting a VAR review (e.g. goal under review),
        // override the label immediately so the frontend shows "REVISÃO AO VAR".
        const filteredMarkets = withPen(filterLiveMarkets(existing.markets, homeScore, awayScore, newStatus));
        const filteredBase = withPen(filterLiveMarkets(existing._baseMarkets ?? existing.markets, homeScore, awayScore, newStatus));
        const susp = Object.fromEntries(
          FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("goal", k)])
        ) as Record<string, number>;
        const updated: LiveMatchState = {
          ...existing,
          homeScore, awayScore, minute, status: newStatus,
          odds: newOdds,
          markets: filteredMarkets,
          _baseOdds: baseOdds,
          _baseMarkets: filteredBase,
          marketSuspension: susp,
          _suspensionReason: isVARStatus ? "REVISÃO AO VAR" : "GOLO!",
          _liveExtra: liveExtra,
          _lastSeenAt: now,
          _missingSinceAt: undefined,
          date,
          time,
          redCardsHome: rcHome > 0 ? rcHome : undefined,
          redCardsAway: rcAway > 0 ? rcAway : undefined,
        };
        liveMatchState.set(id, applyTieredMarketDrift(updated, now));
      } else {
        // Score unchanged — clean up expired suspensions, re-filter for safety
        let susp = existing.marketSuspension;
        if (susp) {
          const active = Object.fromEntries(Object.entries(susp).filter(([, ts]) => ts > now));
          susp = Object.keys(active).length > 0 ? active : undefined;
        }
        const filteredMarkets = withPen(filterLiveMarkets(existing.markets, homeScore, awayScore, newStatus));
        const filteredBase = withPen(filterLiveMarkets(existing._baseMarkets ?? existing.markets, homeScore, awayScore, newStatus));

        // isVARStatus already computed above

        // If VAR is active: ensure suspension is set and override reason label
        if (isVARStatus) {
          if (!susp || Object.keys(susp).length === 0) {
            susp = Object.fromEntries(
              FOOTBALL_SUSP_KEYS.map((k) => [k, now + footballSuspensionDelayMs("var", k)])
            ) as Record<string, number>;
          }
          // Always override the reason label with VAR (covers "GOLO!" → "REVISÃO AO VAR")
          const updated: LiveMatchState = {
            ...existing,
            homeScore, awayScore, minute, status: newStatus,
            odds: newOdds,
            markets: filteredMarkets,
            _baseOdds: baseOdds,
            _baseMarkets: filteredBase,
            marketSuspension: susp,
            _suspensionReason: "REVISÃO AO VAR",
            _liveExtra: liveExtra,
            _lastSeenAt: now,
            _missingSinceAt: undefined,
            date,
            time,
            redCardsHome: rcHome > 0 ? rcHome : undefined,
            redCardsAway: rcAway > 0 ? rcAway : undefined,
          };
          liveMatchState.set(id, applyTieredMarketDrift(updated, now));
        } else {
          const updated: LiveMatchState = {
            ...existing,
            homeScore, awayScore, minute, status: newStatus,
            odds: newOdds,
            markets: filteredMarkets,
            _baseOdds: baseOdds,
            _baseMarkets: filteredBase,
            marketSuspension: susp,
            _suspensionReason: susp ? existing._suspensionReason : undefined,
            _liveExtra: liveExtra,
            _lastSeenAt: now,
            _missingSinceAt: undefined,
            date,
            time,
            redCardsHome: rcHome > 0 ? rcHome : undefined,
            redCardsAway: rcAway > 0 ? rcAway : undefined,
          };
          liveMatchState.set(id, applyTieredMarketDrift(updated, now));
        }
      }
      result.push(liveMatchState.get(id)!);
    } else {
      // First seen — build initial state with score-filtered markets
      const baseOdds = prefetchOdds.get(ev.id) ?? makeOddsFromTeams(homeTeam, awayTeam);
      const liveOdds = (homeScore === 0 && awayScore === 0)
        ? baseOdds
        : calculateLive1x2({ minute, homeGoals: homeScore, awayGoals: awayScore, redCardsHome: rcHome, redCardsAway: rcAway, baseHome: baseOdds.home, baseDraw: baseOdds.draw, baseAway: baseOdds.away });
      const rawMarkets = makeAdvancedMarketsFromTeams(homeTeam, awayTeam);
      const baseMarkets = filterLiveMarkets(rawMarkets, homeScore, awayScore, newStatus);
      // First time seen in penalties — store current score as base (0-0 penalties so far)
      const markets = isPen ? { ...baseMarkets, penExtra: makePenMarketsFromScore(0, 0) } : baseMarkets;
      const shKickoffSec = statusStr === "2nd half" ? Math.floor(now / 1000) - Math.max(0, minute - 46) * 60 : undefined;
      const state: LiveMatchState = {
        id,
        home: homeTeam,
        away: awayTeam,
        league,
        country: "",
        sport: "football",
        homeScore,
        awayScore,
        minute,
        status: newStatus,
        hasRealOdds: true,
        odds: liveOdds,
        markets,
        events: [],
        _firstSeenAt: now,
        _lastSeenAt: now,
        date,
        time,
        redCardsHome: rcHome > 0 ? rcHome : undefined,
        redCardsAway: rcAway > 0 ? rcAway : undefined,
        _baseOdds: baseOdds,
        _baseMarkets: markets,
        _oddsUpdatedAt: now,
        _liveExtra: {
          ...(isPen ? { penBaseScore: [homeScore, awayScore] as [number, number], penScore: [0, 0] as [number, number] } : {}),
          ...(shKickoffSec ? { secondHalfKickoffSec: shKickoffSec } : {}),
          kickoffSec: resolvedKickoffSec,
          ...(baseSec !== null ? { clockSec: baseSec, clockAtMs: now, clockRunning: isClockRunning } : {}),
          clockStr,
        },
      };
      liveMatchState.set(id, state);
      result.push(state);
    }
  }

  // Garbage collect football matches no longer in the V2 live feed
  // Also evict matches blocked by youth filter or stuck > 4h (frozen feed safety net)
  const MAX_V2_LIVE_MS = 4 * 60 * 60 * 1000; // 4 hours
  const resultIds = new Set(result.map(m => String(m.id)));
  for (const id of liveMatchState.keys()) {
    if (!id.startsWith("football-v2-")) continue;
    const state = liveMatchState.get(id);
    if (!state) continue;
    const tooOld = now - (state._firstSeenAt ?? now) > MAX_V2_LIVE_MS;
    const blockedNow = isBlockedLeague(`${state.league} ${state.home} ${state.away}`);
    if (tooOld || blockedNow) {
      liveMatchState.delete(id);
      _v2StuckTracker.delete(id);
      continue;
    }
    if (currentIds.has(id)) continue;
    const missingSince = state._missingSinceAt ?? now;
    if (!state._missingSinceAt) {
      const updated: LiveMatchState = {
        ...state,
        _missingSinceAt: missingSince,
        _suspensionReason: "SINAL INSTÁVEL",
      };
      liveMatchState.set(id, updated);
      if (!resultIds.has(id)) {
        result.push(updated);
        resultIds.add(id);
      }
      continue;
    }
    if (now - missingSince > getFootballLiveDisappearGraceMs(state)) {
      liveMatchState.delete(id);
      _v2StuckTracker.delete(id);
      continue;
    }
    if (!resultIds.has(id)) {
      result.push(state);
      resultIds.add(id);
    }
  }

  return result;
}

const BBALL_SUSP_KEYS = ["result", "totalGoals", "handicap", "halfTime", "basketballExtra"] as const;
const HOCKEY_SUSP_KEYS = ["result", "totalGoals", "handicap", "halfTime", "hockeyExtra"] as const;
const BASEBALL_SUSP_KEYS = ["result", "totalGoals", "handicap", "mlbExtra"] as const;
const MAX_LIVE_STATE_MS = 4 * 60 * 60 * 1000;

function buildBasketballLiveV2(events: SAPIV2Event[]): LiveMatchState[] {
  const result: LiveMatchState[] = [];
  const now = Date.now();
  const currentIds = new Set<string>();
  for (const ev of events) {
    const code = v2StatusCode(ev);
    // code 100 = ended; 0 = not started; undefined = keep
    if (code === 100 || code === 0) continue;
    const statusStr = v2StatusStr(ev.status);
    if (statusStr === "Not started" || statusStr === "Ended" || statusStr === "Finished") continue;

    const homeTeam = v2TeamName(ev.homeTeam);
    const awayTeam = v2TeamName(ev.awayTeam);
    const hS = typeof ev.homeScore === "object" && ev.homeScore !== null ? ev.homeScore as SAPIV2ScoreObj : null;
    const aS = typeof ev.awayScore === "object" && ev.awayScore !== null ? ev.awayScore as SAPIV2ScoreObj : null;
    const homeScore = hS?.current ?? v2CurrentScore(ev.homeScore);
    const awayScore = aS?.current ?? v2CurrentScore(ev.awayScore);

    const league = v2TournName(ev.tournament);
    const country = v2TournCountry(ev);
    if (!basketballLeagueAllowed(country, league)) continue;

    // Build quarters array from period1..4
    const quarters: Array<[number, number]> = [];
    if (hS && aS) {
      ([["period1", "period1"], ["period2", "period2"], ["period3", "period3"], ["period4", "period4"]] as Array<[keyof SAPIV2ScoreObj, keyof SAPIV2ScoreObj]>).forEach(([hp, ap]) => {
        const h = hS[hp] as number | undefined;
        const a = aS[ap] as number | undefined;
        if ((h ?? 0) > 0 || (a ?? 0) > 0) quarters.push([h ?? 0, a ?? 0]);
      });
    }

    // Determine quarter from statusCode (13=Q1, 14=Q2, 15=Q3, 16=Q4, 17=OT, 30=Pause, 31=HT)
    const isHT = code === 31 || statusStr.toLowerCase().includes("half");
    const isPause = code === 30 || statusStr.toLowerCase() === "pause";
    const qNum = code === 13 ? 1 : code === 14 ? 2 : code === 15 ? 3 : code === 16 ? 4 : code === 17 ? 5 : quarters.length > 0 ? Math.max(1, quarters.length) : 1;
    const minute = isHT ? 24 : isPause ? (qNum - 1) * 12 : (qNum - 1) * 12 + 6;
    const statusLabel = isHT ? "HT" : isPause ? `Q${Math.min(qNum, 4)}` : code === 17 ? "OT" : `Q${Math.min(qNum, 4)}`;

    const odds = makeOddsFromTeams(homeTeam, awayTeam);
    const diff = homeScore - awayScore;
    let liveOdds = { ...odds, draw: 0 };
    if (diff !== 0) {
      // Basketball: each point ~2.5% probability swing; at 20pts lead → ~96% win chance
      const absDiff = Math.abs(diff);
      const winPct = Math.min(0.96, 0.5 + absDiff * 0.025);
      const winnerOdds = Math.max(1.04, +(0.975 / winPct).toFixed(2));
      const loserOdds  = Math.min(50,   +(0.975 / Math.max(0.04, 1 - winPct)).toFixed(2));
      liveOdds = diff > 0
        ? { home: winnerOdds, draw: 0, away: loserOdds }
        : { home: loserOdds,  draw: 0, away: winnerOdds };
    }

    const id = `bball-v2-${ev.id}`;
    currentIds.add(id);

    const prev = liveMatchState.get(id);
    let marketSuspension = prev?.marketSuspension;
    let suspensionReason = prev?._suspensionReason;

    if (marketSuspension) {
      const kept = Object.fromEntries(Object.entries(marketSuspension).filter(([, ts]) => ts > now));
      marketSuspension = Object.keys(kept).length ? kept : undefined;
    }
    if (!marketSuspension) suspensionReason = undefined;

    const scoreChanged = prev != null && (prev.homeScore !== homeScore || prev.awayScore !== awayScore);
    const statusChanged = prev != null && prev.status !== statusLabel;

    if (scoreChanged) {
      marketSuspension = Object.fromEntries(BBALL_SUSP_KEYS.map(k => [k, now + 5_000]));
      suspensionReason = "CESTA";
    } else if (statusChanged && (isHT || isPause)) {
      marketSuspension = Object.fromEntries(BBALL_SUSP_KEYS.map(k => [k, now + 8_000]));
      suspensionReason = "INTERVALO";
    }

    const state: LiveMatchState = {
      id,
      home: homeTeam, away: awayTeam,
      league, country,
      sport: "basketball", homeScore, awayScore, minute,
      status: statusLabel, hasRealOdds: true, odds: liveOdds,
      markets: makeBasketballMarketsFromTeams(homeTeam, awayTeam),
      events: [],
      marketSuspension,
      _suspensionReason: suspensionReason,
      _firstSeenAt: prev?._firstSeenAt ?? now,
      _liveExtra: quarters.length > 0 ? { quarters } : undefined,
    };
    liveMatchState.set(id, state);
    result.push(state);
  }
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("bball-v2-")) continue;
    const tooOld = now - (state._firstSeenAt ?? now) > MAX_LIVE_STATE_MS;
    if (!currentIds.has(id) || tooOld) {
      finishedMatchResults.set(id, {
        home: state.homeScore, away: state.awayScore,
        homeTeam: state.home, awayTeam: state.away, finishedAt: now,
        extras: state._liveExtra?.quarters ? { basketball: { quarters: state._liveExtra.quarters } } : undefined,
      });
      liveMatchState.delete(id);
    }
  }
  return result;
}

function buildHockeyLiveV2(events: SAPIV2Event[]): LiveMatchState[] {
  const result: LiveMatchState[] = [];
  const now = Date.now();
  const currentIds = new Set<string>();
  for (const ev of events) {
    const code = v2StatusCode(ev);
    if (code === 100 || code === 0) continue;
    const statusStr = v2StatusStr(ev.status);
    if (statusStr === "Not started" || statusStr === "Ended" || statusStr === "Finished") continue;

    const homeTeam = v2TeamName(ev.homeTeam);
    const awayTeam = v2TeamName(ev.awayTeam);
    const hS = typeof ev.homeScore === "object" && ev.homeScore !== null ? ev.homeScore as SAPIV2ScoreObj : null;
    const aS = typeof ev.awayScore === "object" && ev.awayScore !== null ? ev.awayScore as SAPIV2ScoreObj : null;
    const homeScore = hS?.current ?? v2CurrentScore(ev.homeScore);
    const awayScore = aS?.current ?? v2CurrentScore(ev.awayScore);

    const periods: Array<[number, number]> = [];
    if (hS && aS) {
      (["period1", "period2", "period3", "period4"] as Array<keyof SAPIV2ScoreObj>).forEach(p => {
        const h = hS[p] as number | undefined;
        const a = aS[p] as number | undefined;
        if ((h ?? 0) > 0 || (a ?? 0) > 0) periods.push([h ?? 0, a ?? 0]);
      });
    }

    const pNum = code === 13 ? 1 : code === 14 ? 2 : code === 15 ? 3 : code === 17 ? 4 : periods.length > 0 ? Math.max(1, periods.length) : 1;
    const isPause = code === 30 || statusStr.toLowerCase().includes("intermission") || statusStr.toLowerCase().includes("pause");
    const minute = isPause ? (pNum - 1) * 20 : (pNum - 1) * 20 + 10;
    const statusLabel = isPause ? `P${Math.min(pNum, 3)} Break` : code === 17 ? "OT" : `P${Math.min(pNum, 3)}`;

    const odds = makeOddsFromTeams(homeTeam, awayTeam);
    const diff = homeScore - awayScore;
    let liveOdds = { ...odds, draw: 0 };
    if (diff !== 0) {
      // Hockey: each goal ~17% probability swing; 3+ goal lead → decisive favourite
      const absDiff = Math.abs(diff);
      const winPct = Math.min(0.97, 0.5 + absDiff * 0.17);
      const winnerOdds = Math.max(1.04, +(0.975 / winPct).toFixed(2));
      const loserOdds  = Math.min(50,   +(0.975 / Math.max(0.03, 1 - winPct)).toFixed(2));
      liveOdds = diff > 0
        ? { home: winnerOdds, draw: 0, away: loserOdds }
        : { home: loserOdds,  draw: 0, away: winnerOdds };
    }
    liveOdds.draw = 0;

    const id = `hockey-v2-${ev.id}`;
    currentIds.add(id);

    const prev = liveMatchState.get(id);
    let marketSuspension = prev?.marketSuspension;
    let suspensionReason = prev?._suspensionReason;

    if (marketSuspension) {
      const kept = Object.fromEntries(Object.entries(marketSuspension).filter(([, ts]) => ts > now));
      marketSuspension = Object.keys(kept).length ? kept : undefined;
    }
    if (!marketSuspension) suspensionReason = undefined;

    const scoreChanged = prev != null && (prev.homeScore !== homeScore || prev.awayScore !== awayScore);
    const statusChanged = prev != null && prev.status !== statusLabel;

    if (scoreChanged) {
      marketSuspension = Object.fromEntries(HOCKEY_SUSP_KEYS.map(k => [k, now + 12_000]));
      suspensionReason = "GOLO";
    } else if (statusChanged && isPause) {
      marketSuspension = Object.fromEntries(HOCKEY_SUSP_KEYS.map(k => [k, now + 10_000]));
      suspensionReason = "INTERVALO";
    } else if (statusChanged && code === 17) {
      marketSuspension = Object.fromEntries(HOCKEY_SUSP_KEYS.map(k => [k, now + 10_000]));
      suspensionReason = "PRORROGAÇÃO";
    }

    const state: LiveMatchState = {
      id,
      home: homeTeam, away: awayTeam,
      league: v2TournName(ev.tournament), country: v2TournCountry(ev),
      sport: "hockey", homeScore, awayScore, minute,
      status: statusLabel, hasRealOdds: true, odds: liveOdds,
      markets: makeHockeyMarketsFromTeams(homeTeam, awayTeam),
      events: [],
      marketSuspension,
      _suspensionReason: suspensionReason,
      _firstSeenAt: prev?._firstSeenAt ?? now,
      _liveExtra: periods.length > 0 ? { periods } : undefined,
    };
    liveMatchState.set(id, state);
    result.push(state);
  }
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("hockey-v2-")) continue;
    const tooOld = now - (state._firstSeenAt ?? now) > MAX_LIVE_STATE_MS;
    if (!currentIds.has(id) || tooOld) {
      finishedMatchResults.set(id, {
        home: state.homeScore, away: state.awayScore,
        homeTeam: state.home, awayTeam: state.away, finishedAt: now,
        extras: state._liveExtra?.periods ? { hockey: { periods: state._liveExtra.periods } } : undefined,
      });
      liveMatchState.delete(id);
    }
  }
  return result;
}

function buildBaseballLiveV2(events: SAPIV2Event[]): LiveMatchState[] {
  const result: LiveMatchState[] = [];
  const now = Date.now();
  const currentIds = new Set<string>();
  for (const ev of events) {
    const code = v2StatusCode(ev);
    const statusStr = v2StatusStr(ev.status);
    const statusType = typeof ev.status === "object" ? (ev.status as SAPIV2StatusObj).type : "";
    if (code === 100 || statusStr === "Ended" || statusStr === "Finished") continue;
    if (statusType !== "inprogress" && !statusStr.toLowerCase().includes("inning") && !statusStr.toLowerCase().includes("progress")) continue;

    const homeTeam = v2TeamName(ev.homeTeam);
    const awayTeam = v2TeamName(ev.awayTeam);
    const hS = typeof ev.homeScore === "object" && ev.homeScore !== null ? ev.homeScore as SAPIV2ScoreObj : null;
    const aS = typeof ev.awayScore === "object" && ev.awayScore !== null ? ev.awayScore as SAPIV2ScoreObj : null;
    const homeScore = hS?.current ?? v2CurrentScore(ev.homeScore);
    const awayScore = aS?.current ?? v2CurrentScore(ev.awayScore);

    // Extract innings from inning1..inning9
    const innings: Array<[number, number]> = [];
    if (hS?.innings && aS?.innings) {
      for (let i = 1; i <= 12; i++) {
        const hRun = hS.innings[`inning${i}`]?.run;
        const aRun = aS.innings[`inning${i}`]?.run;
        if (hRun !== undefined && hRun !== null && aRun !== undefined && aRun !== null) {
          innings.push([hRun, aRun]);
        } else break;
      }
    }

    const league = v2TournName(ev.tournament);
    const odds = makeBaseballBaseOdds(homeTeam, awayTeam);
    const diff = homeScore - awayScore;
    let liveOdds = { ...odds, draw: 0 };
    if (diff !== 0) {
      // Baseball: each run ~14% probability swing; 5+ run lead → decisive favourite
      const absDiff = Math.abs(diff);
      const winPct = Math.min(0.97, 0.5 + absDiff * 0.14);
      const winnerOdds = Math.max(1.04, +(0.975 / winPct).toFixed(2));
      const loserOdds  = Math.min(50,   +(0.975 / Math.max(0.03, 1 - winPct)).toFixed(2));
      liveOdds = diff > 0
        ? { home: winnerOdds, draw: 0, away: loserOdds }
        : { home: loserOdds,  draw: 0, away: winnerOdds };
    }

    const id = `baseball-v2-${ev.id}`;
    currentIds.add(id);

    const prev = liveMatchState.get(id);
    let marketSuspension = prev?.marketSuspension;
    let suspensionReason = prev?._suspensionReason;

    if (marketSuspension) {
      const kept = Object.fromEntries(Object.entries(marketSuspension).filter(([, ts]) => ts > now));
      marketSuspension = Object.keys(kept).length ? kept : undefined;
    }
    if (!marketSuspension) suspensionReason = undefined;

    const scoreChanged = prev != null && (prev.homeScore !== homeScore || prev.awayScore !== awayScore);
    const prevInningsLen = (prev?._liveExtra?.innings?.length ?? 0);
    const inningChanged = prev != null && prevInningsLen !== innings.length;

    if (scoreChanged) {
      marketSuspension = Object.fromEntries(BASEBALL_SUSP_KEYS.map(k => [k, now + 12_000]));
      suspensionReason = "RUN";
    } else if (inningChanged) {
      marketSuspension = Object.fromEntries(BASEBALL_SUSP_KEYS.map(k => [k, now + 10_000]));
      suspensionReason = "TROCA DE INNING";
    }

    const state: LiveMatchState = {
      id,
      home: homeTeam, away: awayTeam,
      league, country: v2TournCountry(ev),
      sport: "baseball", homeScore, awayScore,
      minute: innings.length,
      status: statusStr, hasRealOdds: true, odds: liveOdds,
      markets: makeMLBMarketsFromTeams(homeTeam, awayTeam),
      events: [],
      marketSuspension,
      _suspensionReason: suspensionReason,
      _firstSeenAt: prev?._firstSeenAt ?? now,
      _liveExtra: innings.length > 0 ? { innings } : undefined,
    };
    liveMatchState.set(id, state);
    result.push(state);
  }
  for (const [id, state] of liveMatchState.entries()) {
    if (!id.startsWith("baseball-v2-")) continue;
    const tooOld = now - (state._firstSeenAt ?? now) > MAX_LIVE_STATE_MS;
    if (!currentIds.has(id) || tooOld) {
      finishedMatchResults.set(id, {
        home: state.homeScore, away: state.awayScore,
        homeTeam: state.home, awayTeam: state.away, finishedAt: now,
        extras: state._liveExtra?.innings ? { baseball: { innings: state._liveExtra.innings } } : undefined,
      });
      liveMatchState.delete(id);
    }
  }
  return result;
}

/**
 * Returns the appropriate market suspension duration (ms) for a tennis point.
 * Based on real sportsbook behaviour: longer suspension at high-pressure moments.
 *   - Match point               → 25 s
 *   - Set point + break point   → 18 s
 *   - Set point alone           → 15 s
 *   - Break point (0/15/30-40)  → 12 s
 *   - Deuce / Advantage         → 10 s
 *   - Tie-break point           → 12 s
 *   - Normal point              →  5 s
 */
function tennisSuspensionMs(
  pts: [number | string, number | string],
  sets: Array<[number, number]>,
  homeSets: number,
  awaySets: number,
): number {
  const h = String(pts[0]);
  const a = String(pts[1]);

  // Deuce / Advantage situations
  const isDeuce = h === "40" && a === "40";
  const isAdv = h === "AD" || a === "AD";

  // Break-point: one side has "40" while the other is behind (0/15/30)
  const isBreakPoint =
    (h === "40" && (a === "0" || a === "15" || a === "30")) ||
    (a === "40" && (h === "0" || h === "15" || h === "30"));

  // Tie-break: both players have 6 games in the current set
  const currentSet = sets[sets.length - 1] ?? [0, 0];
  const isTiebreak = currentSet[0] === 6 && currentSet[1] === 6;

  // Set point: one player is at 5 or 6 games and ahead of the other
  // (crude heuristic — good enough for suspension timing)
  const isSetPoint = !isTiebreak && (
    (currentSet[0] >= 5 && currentSet[0] > currentSet[1]) ||
    (currentSet[1] >= 5 && currentSet[1] > currentSet[0])
  );

  // Match point (best-of-3 assumption): only treat as match point when a player
  // is one set away AND this is effectively a set-point situation.
  const setsNeeded = 2;
  const oneSetAway = (homeSets === setsNeeded - 1 || awaySets === setsNeeded - 1);
  const isMatchPoint = oneSetAway && (isSetPoint || isTiebreak);

  if (isMatchPoint && (isBreakPoint || isAdv)) return 25_000;
  if (isMatchPoint) return 20_000;
  if (isSetPoint && isBreakPoint) return 18_000;
  if (isSetPoint) return 15_000;
  if (isBreakPoint) return 12_000;
  if (isTiebreak) return 12_000;
  if (isAdv || isDeuce) return 10_000;
  return 5_000;
}

// Tennis market keys to suspend after each point (flat keys used by frontend)
const TENNIS_SUSP_KEYS = [
  "result", "firstSet", "set2", "set3",
  "exactSets", "totalGames", "gameHandicap", "setHandicap", "set1Games",
] as const;

// Grace-period tracker: ms when a tennis match first disappeared from the live feed.
// Prevents transient feed gaps from causing matches to flicker out of the UI.
const _tennisMissingFrom = new Map<string, number>();

function buildTennisLiveV2(events: SAPIV2Event[]): LiveMatchState[] {
  const now = Date.now();
  const result: LiveMatchState[] = [];
  const currentIds = new Set<string>();
  const seenIds = new Set<number>();
  const seenPairs = new Set<string>();
  // Kick off background live-odds refresh for all valid match IDs (fire-and-forget)
  const liveIds = events.map(e => e.id).filter(Boolean) as number[];
  refreshTennisLiveOdds(liveIds);
  refreshTennisServing(liveIds);
  const nowSec = now / 1000;
  // Sort descending by status code so that when the same match pair appears twice,
  // the more-advanced (higher code = later set) entry is processed first and wins the dedup.
  const sorted = [...events].sort((a, b) => (v2StatusCode(b) ?? 0) - (v2StatusCode(a) ?? 0));
  for (const ev of sorted) {
    // Deduplicate by event ID (API sometimes returns the same event twice)
    if (seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);
    // ATP/WTA/Challenger/WTA-125 + ITF singles; excludes doubles/wheelchair/UTR/juniors
    // isTennisElite also checks player names for " / " (doubles pair indicator)
    if (!isTennisElite(ev)) continue;
    // finalResultOnly=true means the API is only showing the final score → match ended
    if (ev.finalResultOnly === true) continue;
    // Also deduplicate by player pair (API can return same match with different IDs).
    // Keep the entry with the HIGHER status code (later in the match = more authoritative).
    const h = v2TeamName(ev.homeTeam).toLowerCase();
    const a = v2TeamName(ev.awayTeam).toLowerCase();
    const pairKey = `${h}|${a}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const id = `tennis-v2-${ev.id}`;
    currentIds.add(id);
    const existing = liveMatchState.get(id);
    const code = v2StatusCode(ev);
    const statusStr = v2StatusStr(ev.status);
    // Skip matches that are definitively not live
    const sLow = statusStr.toLowerCase();
    const notLive =
      code === 100 ||                        // finished (SportsApiPro code)
      code === 110 ||                        // postponed
      code === 120 ||                        // abandoned
      (code === 0 && (sLow === "" || sLow.includes("not start") || sLow.includes("schedul"))) ||
      sLow.includes("ended") || sLow.includes("finished") || sLow.includes("complete") ||
      sLow.includes("not start") || sLow.includes("postpone") ||
      sLow.includes("cancel") || sLow.includes("walkover") ||
      sLow.includes("retired") || sLow.includes("abandon") ||
      sLow.includes("awarded") || sLow.includes("default");
    // startedAlready override: accept matches that started >2 min ago even if status lags.
    // NOT applied if the match started >5 hours ago (almost certainly finished by then).
    const matchAgeSeconds = ev.startTimestamp !== undefined ? nowSec - ev.startTimestamp : 0;
    const startedAlready =
      !sLow.includes("cancel") && !sLow.includes("postpone") &&
      !sLow.includes("walkover") && !sLow.includes("retired") &&
      !sLow.includes("awarded") &&
      ev.startTimestamp !== undefined &&
      matchAgeSeconds > 120 && matchAgeSeconds < 5 * 3600;
    // Zombie detection: match claims to be in progress but started too long ago.
    // Tennis best-of-3 ≤ ~3h; best-of-5 ≤ ~5h. If still "playing" after 4h, the
    // API is stuck — treat as finished and skip.
    const isZombie =
      matchAgeSeconds > 4 * 3600 &&
      (code === 8 || code === 9 || code === 10 ||
       sLow.includes("set") || sLow.includes("playing") || sLow.includes("progress"));
    if (isZombie) continue;
    if (notLive && !startedAlready) continue;
    // Accept everything else: "Playing", "1st Set", "2nd Set", "In Progress",
    // "Break Time", "Advantage", "Tiebreak", "Suspended", "Paused", etc.

    const homeTeam = v2TeamName(ev.homeTeam);
    const awayTeam = v2TeamName(ev.awayTeam);
    const hS = typeof ev.homeScore === "object" && ev.homeScore !== null ? ev.homeScore as SAPIV2ScoreObj : null;
    const aS = typeof ev.awayScore === "object" && ev.awayScore !== null ? ev.awayScore as SAPIV2ScoreObj : null;
    const homeScore = hS?.current ?? v2CurrentScore(ev.homeScore);
    const awayScore = aS?.current ?? v2CurrentScore(ev.awayScore);

    // Build sets from period1..5
    const sets: Array<[number, number]> = [];
    if (hS && aS) {
      (["period1", "period2", "period3", "period4", "period5"] as Array<keyof SAPIV2ScoreObj>).forEach(p => {
        const h = hS[p] as number | undefined;
        const a = aS[p] as number | undefined;
        if (h !== undefined && a !== undefined) sets.push([h, a]);
      });
    }

    const setNum = code !== undefined && code >= 13 ? code - 12 : sets.length + 1;

    // ── Odds: prefer real bookmaker live odds (from cache), else fall back to
    //    pre-match cached odds + drift, else seeded estimate + drift. ──────────
    const realLiveOdds = ev.id ? _tennisLiveOddsCache.get(ev.id) : undefined;
    let liveOdds: { home: number; draw: number; away: number };
    if (realLiveOdds) {
      // Real bookmaker live odds — use directly (already reflect current score)
      liveOdds = { home: realLiveOdds.home, draw: 0, away: realLiveOdds.away };
    } else {
      // Fallback: pre-match odds (or seeded estimate) + score-based drift
      const cachedOdds = _tennisPreMatchOdds.get(_tennisPairKey(homeTeam, awayTeam));
      const baseOdds = cachedOdds
        ? { home: cachedOdds.home, draw: 0, away: cachedOdds.away }
        : makeOddsFromTeams(homeTeam, awayTeam);
      const diff = homeScore - awayScore;
      liveOdds = { ...baseOdds, draw: 0 };
      if (diff !== 0) {
        const factor = Math.min(0.55, Math.abs(diff) * 0.22);
        liveOdds = diff > 0
          ? { home: Math.max(1.01, +(baseOdds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(50, +(baseOdds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(50, +(baseOdds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.01, +(baseOdds.away * (1 - factor)).toFixed(2)) };
      }
    }

    // ── Game score: use real point score from API when available ───────────────
    // hS.point / aS.point = "0" | "15" | "30" | "40" | "AD" — provided by V2 live
    const parsePoint = (p: string | undefined): number | string => {
      if (p === undefined) return 0;
      if (p === "AD") return "AD";
      const n = parseInt(p, 10);
      return isNaN(n) ? p : n; // pass through "15", "30", "40" as numbers; "D"/"A" as string
    };
    const realHPt = hS?.point;
    const realAPt = aS?.point;
    const currentPoints: [number | string, number | string] =
      realHPt !== undefined && realAPt !== undefined
        ? [parsePoint(realHPt), parsePoint(realAPt)]
        : advanceTennisGamePts(`tennis-v2-${ev.id}`);

    const serving = (ev.id ? _tennisServingCache.get(ev.id)?.serving : undefined) ?? existing?._liveExtra?.serving;

    // ── Market suspension: detect point played and compute duration ─────────────
    // A point is played when currentPoints or sets changes compared to last tick.
    // Guard: buildTennisLiveV2 is called TWICE per request (live feed + todayStarted).
    // The 2nd call sees state just saved by the 1st and would falsely detect a point.
    // Only treat a change as a real point if the state was saved > 1.5 s ago (= previous poll).
    const prevPoints = existing?._liveExtra?.currentPoints;
    const prevSets   = existing?._liveExtra?.sets;
    const lastTennisUpdate = existing?._oddsUpdatedAt ?? 0;
    const isDifferentPollCycle = (now - lastTennisUpdate) > 1500;
    const pointPlayed =
      isDifferentPollCycle &&
      prevPoints !== undefined && (
        JSON.stringify(prevPoints) !== JSON.stringify(currentPoints) ||
        JSON.stringify(prevSets)   !== JSON.stringify(sets)
      );

    // Settled set markets: permanently suspend once a set is done
    const doneSets = sets.filter(([h, a]) => {
      const maxG = Math.max(h, a);
      const minG = Math.min(h, a);
      return (maxG >= 6 && maxG - minG >= 2) || maxG === 7;
    }).length;
    const SETTLED = now + 30 * 24 * 60 * 60 * 1000;
    const settledSusp: Record<string, number> = {};
    if (doneSets >= 1) settledSusp["firstSet"] = SETTLED;
    if (doneSets >= 2) settledSusp["set2"]     = SETTLED;

    let marketSuspension: Record<string, number> | undefined = existing?.marketSuspension
      ? Object.fromEntries(Object.entries(existing.marketSuspension).filter(([, ts]) => ts > now))
      : undefined;
    // Merge settled set suspensions (these are permanent — never expire)
    if (Object.keys(settledSusp).length > 0) {
      marketSuspension = { ...(marketSuspension ?? {}), ...settledSusp };
    }

    let suspensionReason = existing?._suspensionReason;

    if (pointPlayed) {
      const suspMs = tennisSuspensionMs(currentPoints, sets, homeScore, awayScore);
      if (suspMs > 0) {
        const pointSusp = Object.fromEntries(
          TENNIS_SUSP_KEYS.map(k => [k, now + suspMs]),
        );
        // Merge: settled markets keep their permanent timestamp; point suspension overrides temporary ones
        marketSuspension = { ...(marketSuspension ?? {}), ...pointSusp, ...settledSusp };
        suspensionReason = "PONTO EM JOGO";
      }
    } else if (marketSuspension && Object.keys(marketSuspension).length === 0) {
      marketSuspension = undefined;
      suspensionReason = undefined;
    } else if (!pointPlayed && suspensionReason === "PONTO EM JOGO") {
      // Suspension has expired — clear the reason
      const active = marketSuspension
        ? Object.entries(marketSuspension).filter(([k, ts]) => ts > now && settledSusp[k] === undefined)
        : [];
      suspensionReason = active.length > 0 ? suspensionReason : undefined;
    }

    // If we accepted this match via startedAlready override, show a sensible status
    const displayStatus = (startedAlready && notLive) ? "Em Jogo" : statusStr;

    // ── Tennis set-winner markets for V2 matches ──────────────────────────────
    // Compute liveHomeP from current odds so we can derive set markets.
    const v2HomeP = liveOdds.home > 0 && liveOdds.away > 0
      ? (1 / liveOdds.home) / (1 / liveOdds.home + 1 / liveOdds.away)
      : 0.5;
    const v2BaseExtras = computeTennisExtras(v2HomeP);
    const v2Set1Games  = sets[0] ?? ([0, 0] as [number, number]);
    const v2Set2Games  = sets.length >= 2 ? (sets[1] ?? ([0, 0] as [number, number])) : ([0, 0] as [number, number]);
    const v2SetWinProb = (hG: number, aG: number, base: number): number =>
      Math.min(0.97, Math.max(0.03, 0.5 + (base - 0.5) * 0.55 + (hG - aG) * 0.055));

    let v2FirstSetOdds: { home: number; away: number };
    if (doneSets === 0 && sets.length >= 1) {
      const pS1 = v2SetWinProb(v2Set1Games[0], v2Set1Games[1], v2HomeP);
      const [s1h, s1a] = probsToDecimalOdds([pS1, 1 - pS1], 1.06);
      v2FirstSetOdds = { home: s1h!, away: s1a! };
    } else {
      v2FirstSetOdds = v2BaseExtras.firstSet;
    }

    let v2Set2Odds: { home: number; away: number };
    if (doneSets === 1 && sets.length >= 2) {
      const pS2 = v2SetWinProb(v2Set2Games[0], v2Set2Games[1], v2HomeP);
      const [s2h, s2a] = probsToDecimalOdds([pS2, 1 - pS2], 1.07);
      v2Set2Odds = { home: s2h!, away: s2a! };
    } else {
      v2Set2Odds = v2BaseExtras.set2;
    }

    const v2TennisExtra = {
      ...v2BaseExtras,
      firstSet: v2FirstSetOdds,
      set2:     v2Set2Odds,
      currentSetNum: setNum,
    };

    const v2Markets = {
      ...makeAdvancedMarketsFromTeams(homeTeam, awayTeam),
      tennisExtra: v2TennisExtra,
    } as unknown as AdvancedMarkets;

    const state: LiveMatchState = {
      id,
      home: homeTeam, away: awayTeam,
      league: v2TournName(ev.tournament), country: v2TournCountry(ev),
      sport: "tennis", homeScore, awayScore,
      minute: setNum * 20,
      status: displayStatus, hasRealOdds: true, odds: liveOdds,
      markets: v2Markets,
      events: [],
      _firstSeenAt: existing?._firstSeenAt ?? now,
      _liveExtra: { sets: sets.length > 0 ? sets : [], currentPoints, ...(serving ? { serving } : {}) },
      marketSuspension: marketSuspension && Object.keys(marketSuspension).length > 0 ? marketSuspension : undefined,
      _suspensionReason: suspensionReason,
    };
    liveMatchState.set(id, state);
    result.push(state);
  }

  // Garbage collect tennis states no longer in the feed.
  // Grace period of 45 s: transient feed gaps (Tyler/Challenger matches that briefly
  // disappear between polls) don't cause the match to vanish from the UI.
  for (const id of liveMatchState.keys()) {
    if (!id.startsWith("tennis-v2-")) continue;
    if (!currentIds.has(id)) {
      const firstMissing = _tennisMissingFrom.get(id) ?? now;
      _tennisMissingFrom.set(id, firstMissing);
      if (now - firstMissing > 45_000) {
        liveMatchState.delete(id);
        _tennisMissingFrom.delete(id);
      } else {
        // Within grace period: only include in result for the first 8 s of the gap.
        // This covers transient feed blips (1-4 polls) without surfacing finished matches
        // that have permanently left the feed.  State is retained for the full 45 s so
        // we can resume accurately if the match genuinely returns.
        const cached = liveMatchState.get(id);
        if (cached) {
          const sLow = String(cached.status ?? "").toLowerCase();
          const finished =
            (cached.homeScore ?? 0) >= 2 || (cached.awayScore ?? 0) >= 2 ||
            sLow.includes("ended") || sLow.includes("finished") || sLow.includes("complete");
          if (finished) {
            liveMatchState.delete(id);
            _tennisMissingFrom.delete(id);
          } else if ((now - firstMissing) < 8_000) {
            result.push(cached);
          }
        }
      }
    } else {
      _tennisMissingFrom.delete(id); // back in feed — reset grace timer
    }
  }

  return result;
}

// ─── Per-match cycling game score — simulation fallback ──────────────────────
// V2 API DOES provide point scores via homeScore.point / awayScore.point
// ("0"|"15"|"30"|"40"|"A"). buildTennisLiveV2 uses real API values when present
// and falls back to this simulation only when the field is missing (e.g. ITF
// matches where the API sometimes omits the point field).

type TennisGamePtState = { h: number; a: number; lastAdvance: number };
const _tennisGamePts = new Map<string, TennisGamePtState>();

function advanceTennisGamePts(matchId: string): [number | string, number | string] {
  const now = Date.now();
  let st = _tennisGamePts.get(matchId);
  if (!st) {
    // Stagger starting points per match to avoid all matches syncing
    const seed = matchId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    st = { h: seed % 3, a: (seed >> 2) % 3, lastAdvance: now - (seed % 5000) };
    _tennisGamePts.set(matchId, st);
  }
  if (now - st.lastAdvance >= 5_000) {
    // Award next point (slight home bias from hash)
    const seed = matchId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const homeP = 0.45 + (seed % 11) / 100;
    if (Math.random() < homeP) st.h++; else st.a++;
    // Game over when one player reaches 4+ with ≥2 gap (or 5+)
    const gameOver =
      (st.h >= 4 && st.h - st.a >= 2) ||
      (st.a >= 4 && st.a - st.h >= 2) ||
      st.h >= 5 || st.a >= 5;
    if (gameOver) { st.h = 0; st.a = 0; }
    st.lastAdvance = now;
  }
  const toDisplay = (n: number): number | string => {
    if (n === 0) return 0;
    if (n === 1) return 15;
    if (n === 2) return 30;
    return 40;
  };
  // Deuce / advantage
  if (st.h >= 3 && st.a >= 3) {
    if (st.h === st.a) return ["D", "D"];
    return st.h > st.a ? ["AD", 40] : [40, "AD"];
  }
  return [toDisplay(st.h), toDisplay(st.a)];
}

// ─── Tennis simulation — fallback when V2 live + today both return empty ───────
//
// Maintains 2 persistent in-memory matches that advance their scores over time.
// Scores drift every ~8s (one game), sets are best-of-3. Match resets when
// a player reaches 2 sets. This only activates as a last resort; whenever real
// V2 data is available, buildTennisLiveV2 takes priority.

type TennisSimState = {
  homeScore: number; awayScore: number;
  sets: Array<[number, number]>;
  setNum: number;
  updatedAt: number;
  seed: number; // deterministic bias so one player "leads"
};

const _tennisSimMap = new Map<string, TennisSimState>();

const TENNIS_SIM_PLAYERS: Array<{ home: string; away: string; tournament: string; country: string }> = [
  { home: "C. Alcaraz", away: "H. Hurkacz",   tournament: "Roland Garros", country: "France" },
  { home: "I. Swiatek",  away: "A. Sabalenka", tournament: "Roland Garros", country: "France" },
];

function _advanceTennisSim(id: string, idx: number): TennisSimState {
  const now = Date.now();
  const existing = _tennisSimMap.get(id);
  if (!existing) {
    const st: TennisSimState = {
      homeScore: 0, awayScore: 0,
      sets: [[idx === 0 ? 2 : 1, idx === 0 ? 1 : 3]], // start mid-set
      setNum: 1,
      updatedAt: now,
      seed: 0.52 + idx * 0.04,
    };
    _tennisSimMap.set(id, st);
    return st;
  }
  if (now - existing.updatedAt < 8_000) return existing;

  const st: TennisSimState = {
    ...existing,
    sets: existing.sets.map(s => [s[0], s[1]] as [number, number]),
  };
  st.updatedAt = now;

  // Advance one game in the current set
  const homeWins = Math.random() < st.seed;
  const cur = st.sets[st.sets.length - 1]!;
  if (homeWins) cur[0]++; else cur[1]++;

  const h = cur[0], a = cur[1];
  const setWonByHome = (h >= 6 && h - a >= 2) || h === 7;
  const setWonByAway = (a >= 6 && a - h >= 2) || a === 7;
  if (setWonByHome) {
    st.homeScore++;
    if (st.homeScore < 2) { st.sets.push([0, 0]); st.setNum++; }
  } else if (setWonByAway) {
    st.awayScore++;
    if (st.awayScore < 2) { st.sets.push([0, 0]); st.setNum++; }
  }

  // Reset when match is over (best of 3 = 2 sets)
  if (st.homeScore >= 2 || st.awayScore >= 2) {
    st.homeScore = 0; st.awayScore = 0;
    st.sets = [[0, 0]]; st.setNum = 1;
  }

  _tennisSimMap.set(id, st);
  return st;
}

function buildTennisSimulation(): LiveMatchState[] {
  return TENNIS_SIM_PLAYERS.map(({ home, away, tournament, country }, idx) => {
    const id = `tennis-sim-${idx}`;
    const st = _advanceTennisSim(id, idx);
    const odds = makeOddsFromTeams(home, away);
    const diff = st.homeScore - st.awayScore;
    let liveOdds = { ...odds, draw: 0 };
    if (diff !== 0) {
      const factor = Math.min(0.55, Math.abs(diff) * 0.22);
      liveOdds = diff > 0
        ? { home: Math.max(1.01, +(odds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(50, +(odds.away * (1 + factor)).toFixed(2)) }
        : { home: Math.min(50, +(odds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.01, +(odds.away * (1 - factor)).toFixed(2)) };
    }
    const currentPoints = advanceTennisGamePts(id);
    return {
      id, home, away, league: tournament, country, sport: "tennis" as const,
      homeScore: st.homeScore, awayScore: st.awayScore,
      minute: st.setNum * 20,
      status: `Set ${st.setNum}`, hasRealOdds: false, odds: liveOdds,
      markets: makeAdvancedMarketsFromTeams(home, away),
      events: [],
      _liveExtra: { sets: st.sets, currentPoints },
    };
  });
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

async function rebuildUpcomingCache(): Promise<void> {
  if (_upcomingRebuildInProgress) return;
  _upcomingRebuildInProgress = true;
  const empty: UpcomingMatch[] = [];
  try {
    const [upFootball, upTennis, upBasketball, upHockey, upVolleyball] = await Promise.all([
      buildUpcomingMatches().catch(() => empty),
      buildTennisUpcoming().catch(() => empty),
      buildBasketballUpcoming().catch(() => empty),
      buildHockeyUpcoming().catch(() => empty),
      buildVolleyballUpcoming().catch(() => empty),
    ]);
    _allUpcomingCache = [...upFootball, ...upTennis, ...upBasketball, ...upHockey, ...upVolleyball];
    _allUpcomingCacheBuiltAt = Date.now();
  } catch { /* keep stale */ } finally {
    _upcomingRebuildInProgress = false;
  }
}

// Shared payload builder — used by both /live HTTP route and SSE broadcast
async function buildLivePayload(): Promise<{ matches: LiveMatchState[] }> {
  // ── Fast path: live data from in-memory WS caches (sub-ms each) ──────────
  const [
    footballEvents, basketballEvents, hockeyEvents, baseballEvents, tennisEvents,
    tennisTodayEvents,
  ] = await Promise.all([
    getFootballLiveV2(),
    getBasketballLiveV2(),
    getHockeyLiveV2(),
    getBaseballLiveV2(),
    getTennisLiveV2(),
    getTennisTodayV2(),
  ]);
  // Fire-and-forget odds cache warmers — don't block the broadcast path
  getTennisOdds().catch(() => {});
  getMLBOdds().catch(() => {});
  // Tennis live: v2 feed (usually empty for tennis) + v1 native live + today fallback.
  // The tennis API does not support v2 live/today endpoints (returns 404).
  // Primary source: v1/tennis/live (buildTennisLiveV1). The v2 path is kept as
  // a fallback for any future API upgrade that enables a v2 tennis live endpoint.
  const tennisV2Part = buildTennisLiveV2(tennisEvents);
  const tennisV1LivePart = await buildTennisLiveV1Cached();
  const allLiveIds = new Set([...tennisV2Part, ...tennisV1LivePart].map(m => String(m.id)));
  const todayStartedExtra = buildTennisLiveV2(
    (tennisTodayEvents ?? []).filter(ev => !allLiveIds.has(`tennis-v2-${ev.id}`))
  ).filter(m => !allLiveIds.has(String(m.id)));
  const tennisLivePart = [...tennisV2Part, ...tennisV1LivePart, ...todayStartedExtra];
  const livePart = [
    ...(await buildFootballLiveV2(footballEvents)),
    ...buildBasketballLiveV2(basketballEvents),
    ...buildHockeyLiveV2(hockeyEvents),
    ...buildBaseballLiveV2(baseballEvents),
    ...tennisLivePart,
  ];

  const liveIds = new Set(livePart.map(m => String(m.id)));
  // Deduplicate by team pair — prevents upcoming duplicating a match already in the live feed
  const liveTeamPairs = new Set(livePart.map(m => `${m.home}|${m.away}`));

  // ── Slow path: upcoming matches from 30s cache ────────────────────────────
  // First call awaits; subsequent calls use the stale cache while a background
  // rebuild runs so the broadcast path is never blocked by network I/O.
  if (_allUpcomingCacheBuiltAt === 0) {
    await rebuildUpcomingCache();
  } else if (Date.now() - _allUpcomingCacheBuiltAt > UPCOMING_CACHE_TTL_MS) {
    rebuildUpcomingCache().catch(() => {}); // rebuild in background; use stale now
  }
  const allUpcoming = _allUpcomingCache;

  // Max minutes ahead a match can be to appear as "Em Breve", per sport
  const SOON_WINDOW: Record<string, number> = {
    football: 2160, soccer: 2160,   // football: up to 36 h (many fixtures spread over days)
    basketball: 480, hockey: 480,    // NBA/NHL: up to 8 h (evening US games)
    tennis: 600,                     // tennis: 10 h — show all Challenger/ATP/WTA matches scheduled today
  };
  const DEFAULT_SOON_WINDOW = 240; // 4 h for volleyball, etc.
  const startingSoon: LiveMatchState[] = allUpcoming
    .filter(m => {
      // Tennis always has computed odds even without a real bookmaker price — allow all.
      // Other sports require real odds to avoid showing matches with no betting context.
      if (m.sport !== "tennis" && !m.hasRealOdds) return false;
      const si = matchStartsInMinutes(m.date, m.time);
      const maxSi = SOON_WINDOW[m.sport] ?? DEFAULT_SOON_WINDOW;
      return isFinite(si) && si >= -60 && si <= maxSi
        && !liveIds.has(String(m.id))
        && !liveTeamPairs.has(`${m.home}|${m.away}`);
    })
    .sort((a, b) => matchStartsInMinutes(a.date, a.time) - matchStartsInMinutes(b.date, b.time))
    .slice(0, 50)
    .map(m => ({
      id:            m.id,
      home:          m.home,
      away:          m.away,
      league:        m.league,
      country:       m.country,
      sport:         m.sport,
      homeScore:     0,
      awayScore:     0,
      minute:        0,
      status:        "Em Breve",
      hasRealOdds:   m.hasRealOdds,
      odds:          m.odds,
      markets:       m.markets,
      events:        [],
      date:          m.date,
      time:          m.time,
      startsIn:      Math.max(0, Math.round(matchStartsInMinutes(m.date, m.time))),
      scheduledTime: m.time,
      scheduledDate: m.date,
    } satisfies LiveMatchState));

  // Promote tennis "Em Breve" matches that started >2 min ago into the live feed.
  // The Statpal /live endpoint can lag 5-15 min for Challenger events; this bridges
  // the gap by showing them as live (0-0, "1st set") until real data arrives.
  const promotedTennis: LiveMatchState[] = [];
  const startingSoonFinal: LiveMatchState[] = [];
  for (const m of startingSoon) {
    if (m.sport === "tennis" && m.startsIn === 0) {
      const realSi = matchStartsInMinutes(m.scheduledDate ?? "", m.scheduledTime ?? "");
      if (isFinite(realSi) && realSi < -2) {
        // Strip Em Breve fields; promote to live with initial set score
        const { startsIn: _si, scheduledTime: _st, scheduledDate: _sd, ...liveBase } = m;
        promotedTennis.push({
          ...liveBase,
          status: "1st set",
          homeScore: 0,
          awayScore: 0,
        } as LiveMatchState);
        continue;
      }
    }
    startingSoonFinal.push(m);
  }

  return { matches: [...livePart, ...promotedTennis, ...startingSoonFinal] };
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
    const payload = await buildLivePayload();
    if (payload.matches.length === 0) {
      consecutiveEmptyBroadcasts += 1;
      if (consecutiveEmptyBroadcasts < 3) return;
    } else {
      consecutiveEmptyBroadcasts = 0;
    }
    // SSE clients (keep full payload for SSE)
    const sseChunk = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try { client.write(sseChunk); } catch { sseClients.delete(client); }
    }
    // WebSocket clients (native JSON message)
    const wsMsg = JSON.stringify({ type: "snapshot", ...payload });
    for (const ws of wsLiveClients) {
      try {
        if (ws.readyState === 1 /* OPEN */) ws.send(wsMsg);
        else wsLiveClients.delete(ws);
      } catch { wsLiveClients.delete(ws); }
    }
  } catch {
    /* ignore — keep clients connected */
  } finally {
    broadcastInProgress = false;
    lastBroadcastAt = Date.now();
    // If a score update arrived while we were building, send it now immediately.
    if (broadcastPending) {
      broadcastPending = false;
      setImmediate(() => { broadcastLive().catch(() => {}); });
    }
  }
}

/**
 * Broadcasts a partial update (delta) for a single match to all connected clients (SSE & WS).
 * This is used for sub-second updates of scores and odds.
 */
export function broadcastMatchDelta(matchId: string, delta: Partial<LiveMatchState>): void {
  const msgObj = { type: "update", matchId, delta };
  
  // 1. WebSocket clients (Native JSON)
  if (wsLiveClients.size > 0) {
    const wsMsg = JSON.stringify(msgObj);
    for (const ws of wsLiveClients) {
      try {
        if (ws.readyState === 1) ws.send(wsMsg);
        else wsLiveClients.delete(ws);
      } catch { wsLiveClients.delete(ws); }
    }
  }

  // 2. SSE clients (data: JSON\n\n)
  if (sseClients.size > 0) {
    const sseChunk = `data: ${JSON.stringify(msgObj)}\n\n`;
    for (const client of sseClients) {
      try { client.write(sseChunk); } catch { sseClients.delete(client); }
    }
  }
}

router.get("/live", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  const lean = String(req.query["lean"] ?? "0") === "1";
  const limitRaw = parseInt(String(req.query["limit"] ?? ""), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.min(500, limitRaw)) : 0;
  try {
    const payload = await buildLivePayload();
    const matches = limit > 0 ? payload.matches.slice(0, limit) : payload.matches;
    if (!lean) {
      res.json({ matches });
      return;
    }
    const out = matches.map(m => {
      const anyM = m as any;
      const { markets, events, ...rest } = anyM;
      return rest;
    });
    res.json({ matches: out });
  } catch (err) {
    console.error("[live route] unexpected error:", err);
    res.json({ matches: [] });
  }
});

router.get("/live-match/:id", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  const id = String(req.params["id"] ?? "");
  if (!id) {
    res.json({ match: null });
    return;
  }
  try {
    const payload = await buildLivePayload();
    const match = payload.matches.find(m => String(m.id) === id) ?? null;
    res.json({ match });
  } catch {
    res.json({ match: null });
  }
});

router.get("/feed-status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  const now = Date.now();
  const asAge = (t: number) => (t > 0 ? Math.max(0, now - t) : null);
  res.json({
    serverTime: now,
    sportsApiKeyPresent: !!SPORTSAPI_KEY,
    wsConnected: Array.from(wsConnected),
    v1WsConnected: Array.from(v1WsConnected),
    lastMessageAt: Object.fromEntries((Object.keys(WS_DOMAINS) as SportKey[]).map(k => [k, wsLastMessageAt.get(k) ?? 0])),
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
router.get("/live-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering

  // Flush headers immediately so the browser sees an open stream
  res.flushHeaders();
  try { res.write(`:${" ".repeat(2048)}\n\n`); } catch { /* ignore */ }

  sseClients.add(res);

  // Send an initial event right away so the client doesn't wait for the next tick
  buildLivePayload()
    .then(p => {
      try { res.write(`data: ${JSON.stringify(p)}\n\n`); } catch { /* ignore */ }
    })
    .catch(() => { /* ignore */ });

  // Keepalive comment every 20s so proxies don't close the connection
  const keepAlive = setInterval(() => {
    try { res.write(`: keepalive ${" ".repeat(256)}\n\n`); } catch { /* ignore */ }
  }, 5_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// ─── Real upcoming builders (from live API data) ──────────────────────────────

// ─── Tennis live from V1 native API ───────────────────────────────────────────
// Called from buildLivePayload as primary source for in-progress tennis matches.
// Maps V1TennisGame to LiveMatchState. Set scores come from homeCompetitor.score.
async function buildTennisLiveV1(): Promise<LiveMatchState[]> {
  try {
    const games = await getTennisLiveV1();
    refreshTennisServing(games.map(g => g.id).filter(Boolean) as number[]);
    const primary: Array<{ r: number; m: LiveMatchState }> = [];
    const itf: Array<{ r: number; m: LiveMatchState }> = [];
    for (const g of games) {
      if (g.statusGroup === 3 || g.statusGroup === 2) continue;
      const home = g.homeCompetitor?.name?.trim() ?? "";
      const away = g.awayCompetitor?.name?.trim() ?? "";
      if (!home || !away) continue;
      if (home.includes("/") || away.includes("/")) continue;
      const compName = g.competitionDisplayName ?? "";
      if (/double|mixed/i.test(compName)) continue;
      const tier = tennisTierRank(compName);
      if (tier === 999) continue;
      let homeScore = Math.max(0, g.homeCompetitor?.score ?? 0);
      let awayScore = Math.max(0, g.awayCompetitor?.score ?? 0);
      const ws = tennisV1WsScore.get(String(g.id));
      if (ws && Date.now() - ws.patchedAt < 60_000) {
        if (typeof ws.home === "number") homeScore = Math.max(0, ws.home);
        if (typeof ws.away === "number") awayScore = Math.max(0, ws.away);
      }
      const odds = makeOddsFromTeams(home, away);
      const diff = homeScore - awayScore;
      let liveOdds = { ...odds, draw: 0 };
      if (diff !== 0) {
        const factor = Math.min(0.55, Math.abs(diff) * 0.22);
        liveOdds = diff > 0
          ? { home: Math.max(1.01, +(odds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(50, +(odds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(50, +(odds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.01, +(odds.away * (1 - factor)).toFixed(2)) };
      }
      const setNum = homeScore + awayScore + 1;
      const serving = (typeof g.id === "number" ? _tennisServingCache.get(g.id)?.serving : undefined);
      const item: LiveMatchState = {
        id: `tennis-v2-${g.id}`,
        home, away,
        league: compName || "Tennis",
        country: "",
        sport: "tennis" as const,
        homeScore, awayScore,
        minute: setNum * 20,
        status: ws?.status ?? g.statusText ?? "Em Jogo",
        hasRealOdds: true,
        odds: liveOdds,
        markets: makeAdvancedMarketsFromTeams(home, away),
        events: [],
        _liveExtra: { sets: [[homeScore, awayScore]], currentPoints: ["0", "0"], ...(serving ? { serving } : {}) },
      };
      if (tier === 7) itf.push({ r: tier, m: item });
      else primary.push({ r: tier, m: item });
    }
    primary.sort((a, b) => a.r - b.r || a.m.league.localeCompare(b.m.league) || a.m.home.localeCompare(b.m.home));
    itf.sort((a, b) => a.m.league.localeCompare(b.m.league) || a.m.home.localeCompare(b.m.home));
    const capPrimary = 30;
    const capItf = primary.length > 0 ? 8 : 30;
    return [
      ...primary.slice(0, capPrimary).map(x => x.m),
      ...itf.slice(0, capItf).map(x => x.m),
    ];
  } catch {
    return [];
  }
}

let _tennisLiveV1StateCache: { matches: LiveMatchState[]; fetchedAt: number } | null = null;
let _tennisLiveV1StateInFlight: Promise<LiveMatchState[]> | null = null;

async function buildTennisLiveV1Cached(): Promise<LiveMatchState[]> {
  const now = Date.now();
  if (_tennisLiveV1StateCache && now - _tennisLiveV1StateCache.fetchedAt < TENNIS_LIVE_V1_TTL) return _tennisLiveV1StateCache.matches;
  if (_tennisLiveV1StateCache) {
    if (!_tennisLiveV1StateInFlight) {
      _tennisLiveV1StateInFlight = buildTennisLiveV1()
        .then(matches => { _tennisLiveV1StateCache = { matches, fetchedAt: Date.now() }; return matches; })
        .finally(() => { _tennisLiveV1StateInFlight = null; });
    }
    return _tennisLiveV1StateCache.matches;
  }
  if (!_tennisLiveV1StateInFlight) {
    _tennisLiveV1StateInFlight = buildTennisLiveV1()
      .then(matches => { _tennisLiveV1StateCache = { matches, fetchedAt: Date.now() }; return matches; })
      .finally(() => { _tennisLiveV1StateInFlight = null; });
  }
  return Promise.race([
    _tennisLiveV1StateInFlight,
    waitMs(1200).then(() => [] as LiveMatchState[]),
  ]);
}

// ─── Tennis upcoming from V1 native API ───────────────────────────────────────
// The tennis API does not have a v2 schedule endpoint (returns 404).
// Instead we use v1/tennis/all which returns all today+tomorrow scheduled games.
async function buildTennisUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const now = Date.now();
    const games = await getTennisAllV1();
    const primary: Array<{ r: number; m: UpcomingMatch }> = [];
    const itf: Array<{ r: number; m: UpcomingMatch }> = [];
    const seen = new Set<string>();

    for (const g of games) {
      if (g.statusGroup === 3) continue; // skip finished
      const home = g.homeCompetitor?.name?.trim() ?? "";
      const away = g.awayCompetitor?.name?.trim() ?? "";
      if (!home || !away) continue;
      // Skip doubles (player pairs have " / " in name)
      if (home.includes("/") || away.includes("/")) continue;
      const compName = g.competitionDisplayName ?? "";
      if (/double|mixed/i.test(compName)) continue;
      const tier = tennisTierRank(compName);
      if (tier === 999) continue;

      const startMs = new Date(g.startTime).getTime();
      if (startMs < now - 90 * 60 * 1000) continue; // 90-min grace
      if (startMs > now + 3 * 86_400_000) continue;  // max 3 days ahead

      const pairKey = `${home}|${away}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const date = g.startTime.slice(0, 10);
      const time = g.startTime.slice(11, 16);

      const sr = seededRng(`tennis:${home}:${away}`);
      const pHome = mc(0.52 + (sr(1) - 0.5) * 0.20, 0.15, 0.85);
      const [compH, compA] = probsToDecimalOdds([pHome, 1 - pHome], 1.06);
      const tennisExtras = computeTennisExtras(pHome);

      const item: UpcomingMatch = {
        id: `tennis-v2-${g.id}`,
        home,
        away,
        league: compName || "Tennis",
        country: "",
        date,
        time,
        sport: "tennis" as const,
        hasRealOdds: false,
        odds: { home: compH!, draw: 0, away: compA! },
        markets: {
          doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
          bothTeamsScore: { yes: 0, no: 0 },
          totalGoals: { over05:0, under05:0, over15:0, under15:0, over25:0, under25:0, over35:0, under35:0, over45:0, under45:0, over55:0, under55:0, over65:0, under65:0 },
          handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
          halfTime: { home: 0, draw: 0, away: 0 },
          firstGoal: { home: 0, noGoal: 0, away: 0 },
          tennisExtra: tennisExtras,
        } as unknown as AdvancedMarkets,
      };
      if (tier === 7) itf.push({ r: tier, m: item });
      else primary.push({ r: tier, m: item });

      if (primary.length >= 60) break;
    }

    const byTime = (a: UpcomingMatch, b: UpcomingMatch) => {
      const ta = new Date(`${a.date}T${a.time}`).getTime();
      const tb = new Date(`${b.date}T${b.time}`).getTime();
      return ta - tb;
    };
    primary.sort((a, b) => a.r - b.r || byTime(a.m, b.m));
    itf.sort((a, b) => byTime(a.m, b.m));
    const capPrimary = 60;
    const capItf = primary.length > 0 ? 12 : 60;
    return [
      ...primary.slice(0, capPrimary).map(x => x.m),
      ...itf.slice(0, capItf).map(x => x.m),
    ];
  } catch {
    return [];
  }
}

async function buildBasketballUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const events = await getUpcomingEventsV2("basketball", 3);
    const seen = new Set<string>();
    const filtered: SAPIV2Event[] = [];

    for (const ev of events) {
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      if (home === "Unknown" || away === "Unknown") continue;
      const key = `${home}|${away}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(ev);
      if (filtered.length >= 30) break;
    }

    const oddsResults = await Promise.all(
      filtered.map(ev => getPreMatchOddsV2("basketball", ev.id).catch(() => null))
    );

    const results: UpcomingMatch[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const ev = filtered[i]!;
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const realOdds = oddsResults[i] ?? null;
      const homeOdds = (realOdds && realOdds.home > 0) ? realOdds.home : 1.9;
      const awayOdds = (realOdds && realOdds.away > 0) ? realOdds.away : 1.9;
      results.push({
        id: `bball-v2-${ev.id}`,
        home,
        away,
        league: v2TournName(ev.tournament),
        country: "usa",
        date,
        time,
        sport: "basketball",
        hasRealOdds: !!(realOdds && realOdds.home > 0),
        odds: { home: homeOdds, draw: 0, away: awayOdds },
        markets: makeBasketballMarketsFromTeams(home, away),
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function buildHockeyUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const events = await getUpcomingEventsV2("hockey", 3);
    const seen = new Set<string>();
    const filtered: SAPIV2Event[] = [];

    for (const ev of events) {
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      if (home === "Unknown" || away === "Unknown") continue;
      const key = `${home}|${away}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(ev);
      if (filtered.length >= 30) break;
    }

    const oddsResults = await Promise.all(
      filtered.map(ev => getPreMatchOddsV2("hockey", ev.id).catch(() => null))
    );

    const results: UpcomingMatch[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const ev = filtered[i]!;
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const realOdds = oddsResults[i] ?? null;
      const hasRealOdds = !!(realOdds && realOdds.home > 0);
      const homeOdds = hasRealOdds ? realOdds!.home : 2.1;
      const drawOdds = hasRealOdds ? (realOdds!.draw || 3.8) : 3.8;
      const awayOdds = hasRealOdds ? realOdds!.away : 2.1;
      results.push({
        id: `hockey-v2-${ev.id}`,
        home, away,
        league: v2TournName(ev.tournament),
        country: "usa",
        date, time,
        sport: "hockey",
        hasRealOdds,
        odds: { home: homeOdds, draw: drawOdds, away: awayOdds },
        markets: makeHockeyMarketsFromTeams(home, away),
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function buildVolleyballUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const [odds, liveData] = await Promise.all([
      getVolleyballOdds(),
      getVolleyballLive(),
    ]);

    const seen = new Set<string>();
    const results: UpcomingMatch[] = [];

    // Primary: pre-match odds entries
    for (const e of odds) {
      if (!e.homeTeam.name || !e.awayTeam.name) continue;
      if (isMatchTimePast(e.date, e.time)) continue;
      const key = `${e.homeTeam.name}|${e.awayTeam.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        id: `volley-odds-${e.matchId}`,
        home: e.homeTeam.name,
        away: e.awayTeam.name,
        league: e.league,
        country: "",
        ...shiftHour(e.date, e.time),
        sport: "volleyball" as const,
        hasRealOdds: true,
        odds: { home: e.homeOdds, draw: 0, away: e.awayOdds },
        markets: makeVolleyballMarketsFromTeams(e.homeTeam.name, e.awayTeam.name, e.homeOdds, e.awayOdds),
      });
    }

    // No fallback without odds — only show volleyball matches with real odds
    return results;
  } catch {
    return [];
  }
}

async function buildBaseballUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const events = await getUpcomingEventsV2("baseball", 3);
    const seen = new Set<string>();
    const filtered: SAPIV2Event[] = [];

    for (const ev of events) {
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      if (home === "Unknown" || away === "Unknown") continue;
      const key = `${home}|${away}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(ev);
      if (filtered.length >= 20) break;
    }

    const oddsResults = await Promise.all(
      filtered.map(ev => getPreMatchOddsV2("baseball", ev.id).catch(() => null))
    );

    const results: UpcomingMatch[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const ev = filtered[i]!;
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const realOdds = oddsResults[i] ?? null;
      const sr = seededRng(`baseball:${home}:${away}`);
      const pHome = mc(0.5 + (sr(1) - 0.5) * 0.12, 0.25, 0.75);
      const [compH, compA] = probsToDecimalOdds([pHome, 1 - pHome], 1.065);
      const homeOdds = (realOdds && realOdds.home > 0) ? realOdds.home : compH!;
      const awayOdds = (realOdds && realOdds.away > 0) ? realOdds.away : compA!;

      results.push({
        id: `mlb-v2-${ev.id}`,
        home,
        away,
        league: v2TournName(ev.tournament),
        country: "usa",
        date,
        time,
        sport: "baseball",
        hasRealOdds: !!(realOdds && realOdds.home > 0),
        odds: { home: homeOdds, draw: 0, away: awayOdds },
        markets: makeAdvancedMarketsFromTeams(home, away),
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Top-level upcoming cache — 60s TTL so repeated 30s polls are instant ─────
type UpcomingTopCache = {
  football: UpcomingMatch[]; tennis: UpcomingMatch[];
  basketball: UpcomingMatch[]; hockey: UpcomingMatch[];
  volleyball: UpcomingMatch[]; baseball: UpcomingMatch[]; fetchedAt: number;
};
let upcomingTopCache: UpcomingTopCache | null = null;
let upcomingTopInFlight: Promise<UpcomingTopCache> | null = null;
const UPCOMING_TOP_TTL = 60_000;

async function refreshUpcomingTop(): Promise<UpcomingTopCache> {
  const empty: UpcomingMatch[] = [];
  const [football, tennis, basketball, hockey, volleyball, baseball] = await Promise.all([
    buildUpcomingMatches().catch(() => empty),
    buildTennisUpcoming().catch(() => empty),
    buildBasketballUpcoming().catch(() => empty),
    buildHockeyUpcoming().catch(() => empty),
    buildVolleyballUpcoming().catch(() => empty),
    buildBaseballUpcoming().catch(() => empty),
  ]);
  upcomingTopCache = { football, tennis, basketball, hockey, volleyball, baseball, fetchedAt: Date.now() };
  return upcomingTopCache;
}

async function getUpcomingAll(): Promise<UpcomingTopCache> {
  const now = Date.now();
  if (upcomingTopCache && now - upcomingTopCache.fetchedAt < UPCOMING_TOP_TTL) return upcomingTopCache;
  if (upcomingTopCache) {
    if (!upcomingTopInFlight) {
      upcomingTopInFlight = refreshUpcomingTop().finally(() => { upcomingTopInFlight = null; });
    }
    return upcomingTopCache;
  }
  if (!upcomingTopInFlight) {
    upcomingTopInFlight = refreshUpcomingTop().finally(() => { upcomingTopInFlight = null; });
  }
  return upcomingTopInFlight;
}

// ─── WC 2026 Endpoint ──────────────────────────────────────────────────────────
let wc2026Cache: { matches: UpcomingMatch[]; fetchedAt: number } | null = null;
const WC2026_TTL = 15 * 60_000; // 15 min — shorter so real odds get picked up when API publishes them

async function buildWC2026Matches(): Promise<UpcomingMatch[]> {
  if (wc2026Cache && Date.now() - wc2026Cache.fetchedAt < WC2026_TTL) {
    return wc2026Cache.matches;
  }

  // Fetch the next 45 days in batches of 8 to cover the full WC group stage
  const nowMs = Date.now();
  const dates: string[] = [];
  for (let i = 0; i < 45; i++) {
    dates.push(new Date(nowMs + i * 86_400_000).toISOString().slice(0, 10));
  }

  const BATCH = 8;
  const allEvents: SAPIV2Event[] = [];
  for (let b = 0; b < dates.length; b += BATCH) {
    const batch = dates.slice(b, b + BATCH);
    const results = await Promise.all(batch.map(dt => getScheduleV2("football", dt).catch(() => [] as SAPIV2Event[])));
    allEvents.push(...results.flat());
  }

  // Deduplicate and filter for WC matches
  const seen = new Set<number>();
  const wcEvents: SAPIV2Event[] = [];
  for (const ev of allEvents) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    const home = v2TeamName(ev.homeTeam);
    const away = v2TeamName(ev.awayTeam);
    if (home === "Unknown" || away === "Unknown") continue;
    const leagueName = normalizeLeagueName(v2TournName(ev.tournament), "");
    const lg = leagueName.toLowerCase();
    const isWCLeague =
      lg.includes("world cup") ||
      lg.includes("copa do mundo") ||
      lg.includes("copa mundial") ||
      lg.includes("fifa world") ||
      lg.includes("wc 2026") ||
      lg.includes("worldcup") ||
      lg.includes("mundial 2026") ||
      lg.includes("coupe du monde");
    if (!isWCLeague) continue;
    // Exclude Women's WC qualification — show only the main men's tournament
    const isWomensOrQual =
      lg.includes("women") ||
      lg.includes("qualification") ||
      lg.includes("qualif") ||
      lg.includes("feminino") ||
      lg.includes("féminin");
    if (isWomensOrQual) continue;
    wcEvents.push(ev);
    if (wcEvents.length >= 300) break;
  }

  const oddsResults = await Promise.all(
    wcEvents.map(ev => getPreMatchOddsV2("football", ev.id).catch(() => null))
  );

  const results: UpcomingMatch[] = [];
  for (let i = 0; i < wcEvents.length; i++) {
    const ev = wcEvents[i]!;
    const home = v2TeamName(ev.homeTeam);
    const away = v2TeamName(ev.awayTeam);
    const leagueName = normalizeLeagueName(v2TournName(ev.tournament), "");
    const { date, time } = v2EventDateTime(ev);
    const realOdds = oddsResults[i] ?? null;

    let odds: { home: number; draw: number; away: number };
    let markets: AdvancedMarkets;
    let hasRealOdds: boolean;

    const baseOdds = makeOddsFromTeams(home, away);
    const baseMarkets = makeAdvancedMarketsFromTeams(home, away);
    markets = {
      ...baseMarkets,
      ...(realOdds?.bttsYes ? { bothTeamsScore: { yes: realOdds.bttsYes, no: realOdds.bttsNo ?? 0 } } : {}),
      ...(realOdds?.over25 ? { totalGoals: { ...baseMarkets.totalGoals, over25: realOdds.over25, under25: realOdds.under25 ?? 0 } } : {}),
    };
    const hasFull1x2 = !!(realOdds && realOdds.home > 0 && realOdds.draw > 0 && realOdds.away > 0);
    odds = hasFull1x2 ? { home: realOdds!.home, draw: realOdds!.draw, away: realOdds!.away } : baseOdds;
    hasRealOdds = hasFull1x2;

    results.push({
      id: `fb-v2-${ev.id}`,
      home,
      away,
      league: leagueName,
      country: v2TournCountry(ev),
      time,
      date,
      sport: "football",
      hasRealOdds,
      odds,
      markets,
      isWomens: false,
      leagueId: ev.tournamentId ? String(ev.tournamentId) : undefined,
    });
  }

  wc2026Cache = { matches: results, fetchedAt: Date.now() };
  return results;
}

router.get("/wc2026", async (_req, res) => {
  try {
    const matches = await buildWC2026Matches();
    res.json({ matches });
  } catch {
    res.status(500).json({ error: "Erro ao buscar jogos do Mundial 2026" });
  }
});

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

router.get("/upcoming", async (req, res) => {
  const sport = String(req.query["sport"] ?? "all");
  const cache = upcomingTopCache
    ? await getUpcomingAll()
    : await Promise.race([
        getUpcomingAll(),
        waitMs(1500).then(() => upcomingTopCache ?? { football: [], tennis: [], basketball: [], hockey: [], volleyball: [], baseball: [], fetchedAt: Date.now() }),
      ]);
  let matches: UpcomingMatch[];
  if (sport === "football") matches = cache.football;
  else if (sport === "tennis") matches = cache.tennis;
  else if (sport === "basketball") matches = cache.basketball;
  else if (sport === "hockey") matches = cache.hockey;
  else if (sport === "volleyball") matches = cache.volleyball;
  else if (sport === "baseball") matches = cache.baseball;
  else matches = [...cache.football, ...cache.tennis, ...cache.basketball, ...cache.hockey, ...cache.volleyball, ...cache.baseball];
  const filtered = sport === "all"
    ? matches.filter(m => {
        const sp = m.sport ?? "football";
        if (sp === "football") return m.odds?.home > 0 && m.odds?.away > 0;
        if (sp === "tennis") return m.odds?.home > 0 && m.odds?.away > 0;
        return !!m.hasRealOdds;
      })
    : sport === "football"
      ? matches.filter(m => m.odds?.home > 0 && m.odds?.away > 0)
      : matches.filter(m => m.hasRealOdds);
  res.json({ matches: filtered });
});

router.get("/", async (_req, res) => {
  try {
    const [live, upcoming] = await Promise.all([buildLiveMatches(), buildUpcomingMatches()]);
    res.json({ live, upcoming });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar partidas" });
  }
});

// ─── Stats endpoint ───────────────────────────────────────────────────────────

type FormEntry = { result: "W" | "D" | "L"; score: string; opponent: string; home: boolean };

router.get("/stats", async (req, res) => {
  const home = String(req.query["home"] ?? "");
  const away = String(req.query["away"] ?? "");
  const sport = String(req.query["sport"] ?? "football");
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
  const ri = (min: number, max: number, s: number) => Math.floor(rng(min, max + 1, s));

  // Sport-specific fallback pools
  type FormEntry = { result: "W" | "D" | "L"; score: string; opponent: string; home: boolean };

  interface SportConfig {
    opponents: string[];
    pool: Array<{ result: "W" | "D" | "L"; score: string }>;
    hasDraw: boolean;
    avgGoalsLabel?: number;
  }

  const sportConfigs: Record<string, SportConfig> = {
    basketball: {
      opponents: ["Lakers","Celtics","Warriors","Heat","Bucks","Nuggets","Suns","Nets","76ers","Clippers","Raptors","Mavericks","Cavaliers","Bulls","Spurs"],
      pool: [
        { result: "W", score: "112-104" }, { result: "W", score: "98-87" }, { result: "W", score: "125-110" },
        { result: "W", score: "103-99" }, { result: "L", score: "95-107" }, { result: "L", score: "88-102" },
        { result: "L", score: "101-115" }, { result: "W", score: "118-109" }, { result: "L", score: "97-110" },
        { result: "W", score: "108-96" }, { result: "L", score: "84-91" },
      ],
      hasDraw: false,
      avgGoalsLabel: 108,
    },
    tennis: {
      opponents: ["Djokovic","Alcaraz","Sinner","Medvedev","Zverev","Rublev","Ruud","Fritz","Swiatek","Sabalenka","Gauff","Rybakina","Paolini","Kasatkina","Navarro"],
      pool: [
        { result: "W", score: "2-0" }, { result: "W", score: "2-1" }, { result: "W", score: "2-0" },
        { result: "L", score: "0-2" }, { result: "L", score: "1-2" }, { result: "W", score: "2-1" },
        { result: "L", score: "0-2" }, { result: "W", score: "2-0" }, { result: "L", score: "1-2" },
        { result: "W", score: "2-1" }, { result: "L", score: "0-2" },
      ],
      hasDraw: false,
    },
    hockey: {
      opponents: ["Bruins","Lightning","Avalanche","Golden Knights","Maple Leafs","Canadiens","Rangers","Hurricanes","Oilers","Flames","Panthers","Stars","SKA","CSKA","Metallurg"],
      pool: [
        { result: "W", score: "4-2" }, { result: "W", score: "3-1" }, { result: "W", score: "5-3" },
        { result: "W", score: "2-1" }, { result: "D", score: "2-2 (OT)" }, { result: "L", score: "1-3" },
        { result: "L", score: "2-4" }, { result: "W", score: "3-2 (OT)" }, { result: "L", score: "0-2" },
        { result: "L", score: "1-4" }, { result: "W", score: "4-1" },
      ],
      hasDraw: true,
      avgGoalsLabel: 5.8,
    },
    volleyball: {
      opponents: ["Brazil VB","Italy VB","Poland VB","France VB","USA VB","Japan VB","Trentino","Lube","Zenit Kazan","Dinamo Moscow","Cruzeiro","Sesi Franca","Perugia","Modena","Resovia"],
      pool: [
        { result: "W", score: "3-0" }, { result: "W", score: "3-1" }, { result: "W", score: "3-2" },
        { result: "L", score: "0-3" }, { result: "L", score: "1-3" }, { result: "W", score: "3-1" },
        { result: "L", score: "2-3" }, { result: "W", score: "3-0" }, { result: "L", score: "1-3" },
        { result: "W", score: "3-2" }, { result: "L", score: "0-3" },
      ],
      hasDraw: false,
    },
  };

  const cfg = sportConfigs[sport] ?? {
    opponents: ["Arsenal","Chelsea","Liverpool","Man City","Tottenham","Newcastle","Brighton","Juventus","Bayern","Roma","PSG","Inter","Dortmund","Sevilla","Benfica"],
    pool: [
      { result: "W" as const, score: "2-0" }, { result: "W" as const, score: "1-0" }, { result: "W" as const, score: "3-1" },
      { result: "W" as const, score: "2-1" }, { result: "D" as const, score: "1-1" }, { result: "D" as const, score: "0-0" },
      { result: "D" as const, score: "2-2" }, { result: "L" as const, score: "0-1" }, { result: "L" as const, score: "1-2" },
      { result: "L" as const, score: "0-2" }, { result: "W" as const, score: "4-0" },
    ],
    hasDraw: true,
    avgGoalsLabel: undefined as number | undefined,
  };

  // h2h proportional to implied probability from odds
  const totalH2H = ri(16, 28, 99.1);
  const rawHomeWins = Math.round(totalH2H * (homeProb / 100) + (ri(0, 3, 1.1) - 1.5));
  const rawAwayWins = Math.round(totalH2H * (awayProb / 100) + (ri(0, 3, 3.7) - 1.5));
  const homeWins = Math.max(1, rawHomeWins);
  const awayWins = Math.max(1, rawAwayWins);
  const draws    = cfg.hasDraw ? Math.max(0, totalH2H - homeWins - awayWins) : 0;
  const avgGoals = rng(2.1, 3.2, 4.1);
  const over15   = Math.min(94, Math.max(66, ri(68, 92, 5.3)));
  const over25   = Math.min(74, Math.max(36, ri(42, 70, 6.1)));
  const cards    = rng(3.0, 4.5, 7.2);
  const corners  = rng(9.5, 12.5, 8.4);
  const btts     = ri(40, 62, 12.1);

  let homeForm: FormEntry[] = [];
  let awayForm: FormEntry[] = [];


  const realHomeCount = homeForm.length;
  const realAwayCount = awayForm.length;

  if (homeForm.length < 5) {
    homeForm = Array.from({ length: 5 }, (_, i) => {
      const fp = cfg.pool[ri(0, cfg.pool.length - 1, i + 1.13)]!;
      return { result: fp.result, score: fp.score, opponent: cfg.opponents[ri(0, cfg.opponents.length - 1, i + 2.27)]!, home: i % 2 === 0 };
    });
  }
  if (awayForm.length < 5) {
    awayForm = Array.from({ length: 5 }, (_, i) => {
      const fp = cfg.pool[ri(0, cfg.pool.length - 1, i + 4.31)]!;
      return { result: fp.result, score: fp.score, opponent: cfg.opponents[ri(0, cfg.opponents.length - 1, i + 5.47)]!, home: i % 2 === 1 };
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
    const isDr = !isHW && cfg.hasDraw && ri(0, 59, i + 72.1) < Math.round(drawProb * 0.6);
    let hS: number, aS: number;
    if (isDr) {
      hS = ri(0, 2, i + 73.1); aS = hS;
    } else if (isHW) {
      hS = ri(1, 3, i + 73.1); aS = Math.max(0, hS - ri(1, 2, i + 74.1));
    } else {
      aS = ri(1, 3, i + 75.1); hS = Math.max(0, aS - ri(1, 2, i + 76.1));
    }
    return { date: `${dd}/${mm}/${yyyy}`, home: mHome, homeScore: hS, away: mAway, awayScore: aS };
  });

  // --- League standings ---
  const leagueParam = String(req.query["league"] ?? "");
  // Do NOT default to "england" — use only the actual league name sent by the client.
  // If no match is found in LEAGUE_TEAMS, buildLeagueStandings uses the real team names + generic fillers.
  const standingsData = buildLeagueStandings(leagueParam, home, away);

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
const LEAGUE_TEAMS: Array<{ patterns: string[]; name: string; teams: string[] }> = [
  // ── England ──────────────────────────────────────────────────────────────────
  { patterns: ["premier league","england:premier","england:top","england premier"], name: "Premier League", teams: ["Manchester City","Arsenal","Liverpool","Aston Villa","Tottenham","Chelsea","Newcastle","Manchester Utd","West Ham","Brighton","Wolves","Brentford","Fulham","Everton","Crystal Palace","Nottingham Forest","Bournemouth","Burnley","Luton","Sheffield Utd"] },
  { patterns: ["efl championship","england:championship","england championship"], name: "EFL Championship", teams: ["Leicester City","Leeds Utd","Ipswich","Southampton","West Brom","Norwich","Watford","Middlesbrough","Coventry","Sheffield Wed","Stoke","Millwall","Preston","Swansea","Hull","Cardiff","QPR","Blackburn","Sunderland","Bristol City","Rotherham","Huddersfield","Birmingham","Plymouth"] },
  { patterns: ["league one","england:league one","england league one"], name: "League One", teams: ["Derby County","Portsmouth","Bolton","Oxford Utd","Bristol Rovers","Exeter","Peterborough","Barnsley","Charlton","Leyton Orient","Lincoln","Burton","Northampton","Reading","Cambridge","Shrewsbury","Port Vale","Stevenage","Cheltenham","Fleetwood","Wycombe","Blackpool","Morecambe","Forest Green"] },
  // ── Spain ─────────────────────────────────────────────────────────────────────
  { patterns: ["laliga","la liga","primera division","primera división","spain:top","spain:laliga","liga española"], name: "LaLiga", teams: ["Real Madrid","Barcelona","Atletico Madrid","Athletic Club","Real Sociedad","Villarreal","Real Betis","Valencia","Osasuna","Sevilla","Getafe","Rayo Vallecano","Alaves","Celta Vigo","Mallorca","Las Palmas","Girona","Cadiz","Granada","Almeria"] },
  { patterns: ["laliga 2","segunda division","segunda división","spain:second","spain segunda"], name: "LaLiga 2", teams: ["Sporting Gijon","Racing Santander","Elche","Levante","Valladolid","Huesca","Zaragoza","Tenerife","Albacete","Mirandes","Leganes","Oviedo","Burgos","Cartagena","Eibar","Ferrol","Andorra","Eldense","Amorebieta","Alcorcon"] },
  // ── Germany ───────────────────────────────────────────────────────────────────
  { patterns: ["bundesliga","germany:top","germany:bundesliga","german bundesliga","1. bundesliga"], name: "Bundesliga", teams: ["Bayern Munich","Bayer Leverkusen","RB Leipzig","Borussia Dortmund","VfB Stuttgart","Eintracht Frankfurt","SC Freiburg","B. Monchengladbach","Union Berlin","Hoffenheim","Augsburg","Wolfsburg","Mainz","Bochum","Koln","Werder Bremen","Heidenheim","Darmstadt"] },
  { patterns: ["2. bundesliga","2.bundesliga","germany:second","german second"], name: "2. Bundesliga", teams: ["HSV","FC Schalke","Fortuna Dusseldorf","Karlsruher SC","Hertha Berlin","1. FC Nurnberg","SpVgg Greuther Furth","SV Darmstadt","FC Paderborn","Holstein Kiel","FC St. Pauli","Hannover 96","VfL Osnabruck","SV Elversberg","1. FC Magdeburg","Wehen Wiesbaden","FC Kaiserslautern","Eintracht Braunschweig"] },
  // ── Italy ─────────────────────────────────────────────────────────────────────
  { patterns: ["italy:top","italy:serie a","serie a italia","italian serie a","calcio serie a","serie a tim"], name: "Serie A", teams: ["Inter","AC Milan","Juventus","Napoli","Atalanta","AS Roma","SS Lazio","Fiorentina","Bologna","Torino","Monza","Genoa","Lecce","Hellas Verona","Cagliari","Empoli","Frosinone","Udinese","Salernitana","Sassuolo"] },
  { patterns: ["italy:serie b","italy:second","serie b italia","italian serie b"], name: "Serie B", teams: ["Parma","Como","Venezia","Palermo","Cremonese","Catanzaro","Sampdoria","Modena","Bari","Ternana","Cosenza","Spezia","Cittadella","Sudtirol","Ascoli","Reggiana","Lecco","FeralpiSalo","Brescia","Pisa","Cesena","Carrarese","Mantova"] },
  // ── France ────────────────────────────────────────────────────────────────────
  { patterns: ["ligue 1","france:top","france:ligue 1","french ligue 1"], name: "Ligue 1", teams: ["PSG","Monaco","Lille","Marseille","Lyon","Nice","Rennes","Lens","Reims","Strasbourg","Toulouse","Montpellier","Brest","Nantes","Metz","Le Havre","Lorient","Clermont","Auxerre","Troyes"] },
  { patterns: ["ligue 2","france:second","french ligue 2"], name: "Ligue 2", teams: ["Grenoble","Amiens","Pau FC","Laval","Rodez","Guingamp","Caen","Quevilly Rouen","Annecy","Concarneau","Valenciennes","Bastia","Dunkerque","Niort","Angers","St Etienne","Charleville"] },
  // ── Portugal ──────────────────────────────────────────────────────────────────
  { patterns: ["liga portugal","portugal:top","portugal:liga","ligabwin","liga bwin","liga betclic","primeira liga portugal","portuguese primeira","liga nos"], name: "Liga Portugal", teams: ["Benfica","Sporting CP","Porto","Braga","Vitoria Guimaraes","Famalicao","Casa Pia","Moreirense","Estoril","Arouca","Vizela","Rio Ave","Boavista","Chaves","Estrela Amadora","Portimonense","Santa Clara","Gil Vicente"] },
  { patterns: ["liga portugal 2","liga sabseg","portugal:second","portuguese second"], name: "Liga Portugal 2", teams: ["Academico de Viseu","Leixoes","Penafiel","Mafra","Tondela","Feirense","Oliveirense","Varzim","Vilafranquense","Sporting B","Benfica B","Porto B","Braga B","Maritimo","Nacional","Avs","Cova da Piedade"] },
  // ── Netherlands ───────────────────────────────────────────────────────────────
  { patterns: ["eredivisie","netherlands:top","netherlands:eredivisie","dutch eredivisie","holland:top"], name: "Eredivisie", teams: ["PSV","Feyenoord","Ajax","AZ Alkmaar","FC Twente","Utrecht","Groningen","Heerenveen","Sparta Rotterdam","NEC Nijmegen","Go Ahead Eagles","Heracles","Almere City","RKC Waalwijk","Fortuna Sittard","Excelsior","SC Cambuur","FC Volendam"] },
  // ── Turkey ────────────────────────────────────────────────────────────────────
  { patterns: ["süper lig","super lig","turkey:top","turkey:super","turkish super lig"], name: "Süper Lig", teams: ["Galatasaray","Fenerbahce","Besiktas","Trabzonspor","Basaksehir","Sivasspor","Konyaspor","Antalyaspor","Kasimpasa","Adana Demirspor","Ankaragücü","Gaziantep FK","Kayserispor","Rizespor","Alanyaspor","Samsunspor","Pendikspor","Hatayspor"] },
  // ── Scotland ──────────────────────────────────────────────────────────────────
  { patterns: ["scottish premiership","scotland:top","scotland:premiership","spfl premiership","scottish premier"], name: "Scottish Premiership", teams: ["Celtic","Rangers","Hearts","Hibernian","Aberdeen","Motherwell","St Mirren","Dundee United","Livingston","Ross County","Kilmarnock","St Johnstone"] },
  // ── Belgium ───────────────────────────────────────────────────────────────────
  { patterns: ["jupiler","belgium:top","belgium:first","belgium pro league","jupiler pro"], name: "Jupiler Pro League", teams: ["Club Brugge","Anderlecht","Union SG","Gent","Antwerp","Standard Liege","Charleroi","Westerlo","OH Leuven","Mechelen","Cercle Brugge","Genk","Sint-Truiden","Eupen","Kortrijk","Zulte Waregem"] },
  // ── Poland ────────────────────────────────────────────────────────────────────
  { patterns: ["ekstraklasa","poland:top","poland:ekstraklasa","polish ekstraklasa"], name: "Ekstraklasa", teams: ["Legia Warsaw","Rakow Czestochowa","Lech Poznan","Piast Gliwice","Wisla Krakow","Cracovia","Gornik Zabrze","Zagłebie Lubin","Jagiellonia","Slask Wroclaw","Stal Mielec","Korona Kielce","Warta Poznan","Ruch Chorzow","Puszcza Niepolomice","GKS Katowice"] },
  // ── Greece ────────────────────────────────────────────────────────────────────
  // NOTE: patterns must NOT include bare "super league" — that collides with Swiss/Chinese/Turkish leagues.
  { patterns: ["greece:top","greece:super","super league greece","greek super league","superleague greece","superleague ellada"], name: "Super League Grécia", teams: ["Olympiakos","Panathinaikos","PAOK","AEK Athens","Aris","Atromitos","Volos","OFI Crete","Lamia","Panserraikos","Levadiakos","Asteras Tripolis","Giannina","Ionikos"] },
  // ── China ─────────────────────────────────────────────────────────────────────
  { patterns: ["chinese super league","china:top","china:super","csl","chinese football"], name: "Chinese Super League", teams: ["Shanghai Port","Shandong Taishan","Beijing Guoan","Wuhan Three Towns","Guangzhou FC","Shanghai Shenhua","Tianjin Jinmen Tiger","Shenzhen FC","Zhejiang FC","Changchun Yatai","Qingdao West Coast","Dalian Pro","Meizhou Hakka","Nantong Zhiyun","Henan FC","Chengdu Rongcheng"] },
  // ── Indonesia ─────────────────────────────────────────────────────────────────
  // NOTE: "liga 1" alone is NOT used — collides with Romania Liga 1, Peru Liga 1, etc.
  { patterns: ["indonesia:top","indonesia:liga","liga 1 indonesia","indonesian liga","liga indonesia"], name: "Liga 1 Indonésia", teams: ["Persib Bandung","Persija Jakarta","Bali United","PSM Makassar","Arema FC","Persebaya Surabaya","Borneo FC","Bhayangkara FC","PSIS Semarang","Persikabo","Barito Putera","Madura United","Dewa United","RANS Nusantara","PSS Sleman","Persita Tangerang"] },
  // ── Australia ─────────────────────────────────────────────────────────────────
  { patterns: ["a-league","a league","australia:top","australian a-league","isuzu ute","npl australia"], name: "A-League", teams: ["Melbourne City","Western Sydney Wanderers","Melbourne Victory","Sydney FC","Brisbane Roar","Adelaide United","Wellington Phoenix","Perth Glory","Western United","Macarthur FC","Central Coast Mariners","Newcastle Jets"] },
  // ── USA ───────────────────────────────────────────────────────────────────────
  { patterns: ["mls","major league soccer","usa:mls","united states:mls","us soccer mls"], name: "MLS", teams: ["Inter Miami","Los Angeles FC","FC Cincinnati","Columbus Crew","Orlando City","Atlanta United","Seattle Sounders","Portland Timbers","NYCFC","New England","Philadelphia Union","Nashville SC","St. Louis City","Austin FC","Real Salt Lake","LA Galaxy","Minnesota United","Toronto FC","Chicago Fire","NY Red Bulls"] },
  // ── Brazil ────────────────────────────────────────────────────────────────────
  // NOTE: "serie a" alone is NOT used — collides with Italian Serie A.
  { patterns: ["brazil:serie b","brazil: serie b","brasileirao serie b","brasileirão série b","campeonato brasileiro serie b","serie b brasil","série b brasil","brasileirao b"], name: "Brasileirão Série B", teams: ["Santos","Sport","Ceará","Goiás","Coritiba","América MG","Avaí","Chapecoense","Paysandu","Remo","Mirassol","Novorizontino","Ponte Preta","Guarani","Vila Nova","Ituano","CRB","Botafogo-SP","Amazonas","Operário-PR"] },
  { patterns: ["brazil:top","brasileirao serie a","brasileirão série a","campeonato brasileiro serie a","serie a brasil","série a brasil","futebol brasileiro","brasileirao","brasileirão"], name: "Brasileirão Série A", teams: ["Atlético Mineiro","Palmeiras","Flamengo","Botafogo","Fluminense","Internacional","Grêmio","São Paulo","Corinthians","Vasco","Cruzeiro","Bragantino","Bahia","Athletico-PR","Cuiabá","Goiás","Coritiba","Fortaleza","Santos","América MG"] },
  // ── Mexico ────────────────────────────────────────────────────────────────────
  { patterns: ["liga mx","mexico:top","mexico:liga mx","ligamx","mexican liga"], name: "Liga MX", teams: ["Club América","Tigres UANL","Chivas","Cruz Azul","UNAM Pumas","Monterrey","Atlas","Toluca","León","Santos Laguna","Puebla","Pachuca","Necaxa","Mazatlán","FC Juárez","Tijuana","San Luis","Querétaro","Atlético San Luis"] },
  // ── Argentina ─────────────────────────────────────────────────────────────────
  { patterns: ["primera division argentina","argentina:top","argentina:primera","superliga argentina","liga profesional argentina"], name: "Primera División Argentina", teams: ["River Plate","Boca Juniors","Independiente","Racing Club","San Lorenzo","Estudiantes","Vélez Sársfield","Newells Old Boys","Lanús","Huracán","Belgrano","Talleres","Godoy Cruz","Defensa y Justicia","Gimnasia La Plata","Banfield","Platense","Rosario Central","Instituto","Tigre"] },
  // ── Colombia ──────────────────────────────────────────────────────────────────
  { patterns: ["liga betplay","colombia:top","colombia primera","colombian first"], name: "Liga BetPlay", teams: ["Millonarios","Atlético Nacional","Santa Fe","Junior","América de Cali","Deportes Tolima","Deportivo Cali","Atlético Bucaramanga","Once Caldas","Independiente Medellín","La Equidad","Jaguares","Águilas Doradas","Peñarol Cali","Envigado","Alianza Petrolera"] },
  // ── Chile ─────────────────────────────────────────────────────────────────────
  { patterns: ["primera division chile","chile:top","campeonato chile","chilean primera"], name: "Primera División Chile", teams: ["Colo-Colo","Universidad de Chile","Universidad Católica","Palestino","Ñublense","Huachipato","Everton","Cobresal","Deportes Antofagasta","Audax Italiano","Curicó Unido","Deportes La Serena","Rangers","Deportes Iquique","O'Higgins","Santiago Wanderers"] },
  // ── Japan ─────────────────────────────────────────────────────────────────────
  { patterns: ["j1 league","j-league","japan:top","japan:j1","japanese j1"], name: "J1 League", teams: ["Vissel Kobe","Yokohama F. Marinos","Urawa Red Diamonds","Kashima Antlers","Gamba Osaka","Kawasaki Frontale","Nagoya Grampus","FC Tokyo","Sanfrecce Hiroshima","Consadole Sapporo","Cerezo Osaka","Shonan Bellmare","Avispa Fukuoka","Kyoto Sanga","Jubilo Iwata","Albirex Niigata","Kashiwa Reysol"] },
  // ── Saudi Arabia ──────────────────────────────────────────────────────────────
  { patterns: ["saudi pro league","saudi professional league","saudi arabia:top","saudi football"], name: "Saudi Pro League", teams: ["Al-Hilal","Al-Nassr","Al-Ittihad","Al-Ahli","Al-Shabab","Al-Qadsiah","Al-Ettifaq","Al-Fateh","Al-Taawon","Al-Khaleej","Al-Hazem","Al-Feiha","Abha","Al-Riyadh","Al-Tai","Damac"] },
  // ── Russia ────────────────────────────────────────────────────────────────────
  { patterns: ["russian premier league","russia:top","rpl russia","russian football premier"], name: "Russian Premier League", teams: ["Zenit","CSKA Moscow","Lokomotiv Moscow","Spartak Moscow","Krasnodar","Dynamo Moscow","Rostov","Akhmat","Ufa","Rubin Kazan","Khimki","Ural","Samara","Sochi","Arsenal Tula","Torpedo Moscow"] },
  // ── Austria ───────────────────────────────────────────────────────────────────
  // NOTE: "primeira liga" is NOT included here — it belongs to Portugal only.
  { patterns: ["austria:top","austria:bundesliga","austrian bundesliga","bundesliga österreich","österreichische bundesliga"], name: "Austrian Bundesliga", teams: ["Red Bull Salzburg","Sturm Graz","LASK","Austria Vienna","Rapid Vienna","Wolfsberger","Hartberg","WAC","Rheindorf Altach","Austria Lustenau","Blau-Weiss Linz","SCR Altach"] },
  // ── Switzerland ───────────────────────────────────────────────────────────────
  { patterns: ["swiss super league","switzerland:top","super league schweiz","switzerland super","swiss football"], name: "Swiss Super League", teams: ["FC Basel","Young Boys","FC Lugano","Servette","FC Zürich","FC Luzern","Winterthur","Grasshopper","FC St. Gallen","Yverdon","FC Lausanne-Sport","FC Vaduz"] },
  // ── Denmark ───────────────────────────────────────────────────────────────────
  { patterns: ["danish superliga","denmark:top","superliga denmark","danish football"], name: "Danish Superliga", teams: ["FC Copenhagen","FC Midtjylland","Brondby","Silkeborg","AGF","Aarhus","Nordsjælland","Randers","OB","Vejle","AC Horsens","HB Koge","Lyngby","FC Fredericia","Viborg"] },
  // ── Sweden ────────────────────────────────────────────────────────────────────
  { patterns: ["allsvenskan","sweden:top","sweden:allsvenskan","swedish allsvenskan"], name: "Allsvenskan", teams: ["Malmo FF","IF Elfsborg","Djurgårdens IF","AIK","IFK Göteborg","Hammarby","IFK Norrköping","BK Häcken","Kalmar FF","GAIS","Sirius","Degerfors","Örebro","Mjällby","Halmstad","Varberg"] },
  // ── Norway ────────────────────────────────────────────────────────────────────
  { patterns: ["eliteserien","norway:top","norway:eliteserien","norwegian eliteserien"], name: "Eliteserien", teams: ["Bodø/Glimt","Molde","Rosenborg","Brann","Viking","Lillestrøm","Vålerenga","HamKam","Stabæk","Sandefjord","Strømsgodset","Aalesund","Sarpsborg","Odd","Haugesund","Tromsø"] },
  // ── Finland ───────────────────────────────────────────────────────────────────
  { patterns: ["veikkausliiga","finland:top","finland:veikkausliiga","finnish veikkausliiga"], name: "Veikkausliiga", teams: ["HJK Helsinki","HIFK","KuPS","SJK","Ilves","VPS","FC Inter Turku","Mariehamn","KTP","AC Oulu","EIF","FC Honka","Gnistan","FC Haka"] },
  // ── Romania ───────────────────────────────────────────────────────────────────
  { patterns: ["superliga romania","romania:top","liga 1 romania","romanian liga","liga i romania"], name: "SuperLiga Romania", teams: ["FCSB","CFR Cluj","Rapid Bucharest","Universitatea Craiova","Farul Constanta","Petrolul","Sepsi","Dinamo","UTA Arad","Hermannstadt","Voluntari","Poli Iasi","FC Botosani","Otelul Galati","FC Arges","Politehnica"] },
  // ── Spain Lower ───────────────────────────────────────────────────────────────
  { patterns: ["primera federacion","primera rfef","spain:third","rfef primera"], name: "Primera RFEF", teams: ["Deportivo La Coruña","SD Amorebieta","Mérida AD","Algeciras CF","Celta B","Deportivo Alaves B","Barça B","Atletico B","Sevilla B","Athletic B","Real Sociedad B","Valencia B","Villarreal B","Málaga","Pontevedra","Córdoba"] },
  // ── UEFA Competitions ─────────────────────────────────────────────────────────
  { patterns: ["champions league","europa league","conference league","uefa cl","ucl","uel","uecl"], name: "UEFA Champions League", teams: ["Real Madrid","Manchester City","Bayern Munich","PSG","Barcelona","Liverpool","Arsenal","Atletico Madrid","Inter","Borussia Dortmund","Napoli","AC Milan","Chelsea","Benfica","Porto","RB Leipzig","Sevilla","Lazio","Juventus","Shakhtar Donetsk"] },
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
    "fc","sc","ac","cf","bk","if","fk","sk","afc","bfc","ud","cd","rj","mg","sp","rs","pr","ba",
    "city","united","athletic","athletics","real","club","sporting","sport","deportivo","deportes",
    "atlético","atletico","junior","senior","rovers","wanderers","dynamo","rapid","victoria",
  ]);
  const sig = (name: string) =>
    name.toLowerCase().split(/[\s\-\.]+/).filter(w => w.length >= 4 && !stopWords.has(w));

  const teamWords = sig(teamName);
  if (teamWords.length === 0) return false;

  return list.some(t => {
    const listWords = sig(t);
    // At least one significant word from the team name must appear verbatim in the list entry
    return teamWords.some(tw => listWords.includes(tw));
  });
}

function buildLeagueStandings(leagueName: string, homeTeam: string, awayTeam: string): { league: string; teams: Array<{ pos: number; name: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; pts: number }> } {
  const slug = leagueName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const found = LEAGUE_TEAMS.find(l => l.patterns.some(p => slug.includes(p)));

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
      "Sporting FC","Athletic CF","City FC","United FC","Dynamo","Rapid","Victoria","Olimpia",
      "Nacional","Real CF","Atlético","Juventude","América","Deportivo","Spartak","Lokomotiv",
    ];
    const extra = fillers.slice(0, 10);
    teamList = [homeTeam, awayTeam, ...extra].filter((t, i, a) => t && a.indexOf(t) === i);
  }

  const seed = [...(displayName + homeTeam)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (s: number) => { const x = Math.sin(seed * 1234 + s * 7919) * 2654435761; return x - Math.floor(x); };

  const teams = teamList.map((name, i) => {
    const elo = getTeamElo(name);
    const strength = (elo - 1400) / 600;
    const played = 30 + Math.floor(rng(i * 13 + 1) * 8);
    const winRate = Math.max(0.05, Math.min(0.85, 0.45 + strength * 0.35 + (rng(i * 7 + 2) - 0.5) * 0.15));
    const drawRate = Math.max(0.05, Math.min(0.35, 0.26 - Math.abs(strength) * 0.06 + (rng(i * 5 + 3) - 0.5) * 0.08));
    const won  = Math.round(played * winRate);
    const drawn = Math.round(played * drawRate);
    const lost = Math.max(0, played - won - drawn);
    const avgGF = Math.max(0.5, 1.4 + strength * 0.6 + (rng(i * 11 + 4) - 0.5) * 0.4);
    const avgGA = Math.max(0.4, 1.2 - strength * 0.4 + (rng(i * 9 + 5) - 0.5) * 0.4);
    const gf = Math.round(played * avgGF);
    const ga = Math.round(played * avgGA);
    const pts = won * 3 + drawn;
    return { name, elo, played, won, drawn, lost, gf, ga, pts };
  });

  teams.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);

  return {
    league: displayName,
    teams: teams.map(({ name, played, won, drawn, lost, gf, ga, pts }, i) => ({
      pos: i + 1, name, played, won, drawn, lost, gf, ga, pts,
    })),
  };
}

async function getActiveTournaments(): Promise<ActiveTournament[]> {
  return tourListCache ?? [];
}

async function getVolleyballDailyResults(): Promise<VolleyDailyResult[]> {
  return volleyResultsCache ?? [];
}

async function getVolleyballStandings(leagueId: string): Promise<VolleyStandingsData | null> {
  return volleyStandingsCache.get(leagueId)?.data ?? null;
}

async function getVolleyballActiveLeagues(): Promise<VolleyLeague[]> {
  const tours = await getVolleyballLive();
  const seen = new Set<string>();
  return tours.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .map(t => ({ id: t.id, gid: t.gid, league: t.league, country: t.country }));
}

async function getVolleyballSchedule(leagueId: string): Promise<VolleyScheduleData | null> {
  return volleyScheduleCache.get(leagueId)?.data ?? null;
}

async function getTennisDailyResults(): Promise<TennisDailyResult[]> {
  return tennisResultsCache ?? [];
}

async function getHockeyDailyResults(): Promise<HockeyDailyResult[]> {
  const now = Date.now();
  if (hockeyResultsCache && now - hockeyResultsFetchedAt < RESULTS_CACHE_TTL) return hockeyResultsCache;
  try {
    const events = await getV2EventsLast("hockey", 20);
    const yd = new Date(Date.now() - 86400000);
    const ydStr = `${String(yd.getUTCDate()).padStart(2, "0")}.${String(yd.getUTCMonth() + 1).padStart(2, "0")}.${yd.getUTCFullYear()}`;
    const results: HockeyDailyResult[] = [];
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      const st = (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? ev["status"];
      if (typeof st === "string" && st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts) continue;
      const { date, time } = v2EventDateTime({ startTimestamp: ts } as SAPIV2Event);
      if (date !== ydStr) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const periods: Array<[number, number]> = [];
      for (const p of ["period1", "period2", "period3", "overtime", "shootout"]) {
        const hv = hs?.[p]; const av = as_?.[p];
        if (hv != null && av != null) periods.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      results.push({ id: String(ev["id"] ?? ""), home, away, homeScore, awayScore, periods, homeWon: ev["winnerCode"] === 1, league: "NHL", country: "usa", date, time });
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
  if (mlbResultsCache && now - mlbResultsFetchedAt < RESULTS_CACHE_TTL) return mlbResultsCache;
  try {
    const events = await getV2EventsLast("baseball", 20);
    const yd = new Date(Date.now() - 86400000);
    const ydStr = `${String(yd.getUTCDate()).padStart(2, "0")}.${String(yd.getUTCMonth() + 1).padStart(2, "0")}.${yd.getUTCFullYear()}`;
    const results: MLBDailyResult[] = [];
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      const st = (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? ev["status"];
      if (typeof st === "string" && st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts) continue;
      const { date, time } = v2EventDateTime({ startTimestamp: ts } as SAPIV2Event);
      if (date !== ydStr) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const innings: Array<[number | null, number | null]> = [];
      for (let inn = 1; inn <= 9; inn++) {
        const key = `period${inn}`;
        const hv = hs?.[key]; const av = as_?.[key];
        if (hv == null && av == null) break;
        innings.push([hv != null ? Number(hv) : null, av != null ? Number(av) : null]);
      }
      const hOT = hs?.["overtime"]; const aOT = as_?.["overtime"];
      const hasExtra = hOT != null || aOT != null;
      if (hasExtra) innings.push([hOT != null ? Number(hOT) : null, aOT != null ? Number(aOT) : null]);
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? "");
      const away = String(awayTeam?.["name"] ?? "");
      if (!home || !away) continue;
      results.push({
        id: String(ev["id"] ?? ""), home, away, homeScore, awayScore,
        homeHits: 0, awayHits: 0, homeErrors: 0, awayErrors: 0,
        innings, hasExtra,
        homeWon: ev["winnerCode"] === 1, league: "MLB", country: "usa", date, time,
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
  if (basketballScheduleCache && now - basketballScheduleFetchedAt < BBALL_SCHEDULE_TTL) return basketballScheduleCache;
  try {
    const [upcomingEvents, lastEvents] = await Promise.all([
      getUpcomingLeagueEventsV2("basketball", 21),
      getV2EventsLast("basketball", 60),
    ]);
    const cutoff14 = Date.now() - 14 * 86400000;
    const dateKey = (s: string) => { const [d, mo, y] = s.split("."); return `${y ?? ""}${mo ?? ""}${d ?? ""}`; };

    const upcomingMatches: BasketballScheduleMatch[] = upcomingEvents.slice(0, 40).map(ev => {
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      return { id: String(ev.id), date, time, status: "Not Started", home, away, homeScore: 0, awayScore: 0, quarters: [] };
    });

    const recentMatches: BasketballScheduleMatch[] = [];
    for (const raw of lastEvents) {
      const ev = raw as Record<string, unknown>;
      const st = (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? "";
      if (typeof st !== "string" || st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts || ts * 1000 < cutoff14) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const quarters: Array<[number, number]> = [];
      for (const p of ["period1", "period2", "period3", "period4", "overtime"]) {
        const hv = hs?.[p]; const av = as_?.[p];
        if (hv != null && av != null) quarters.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      const { date, time } = v2EventDateTime({ startTimestamp: ts } as SAPIV2Event);
      recentMatches.push({ id: String(ev["id"] ?? ""), date, time, status: "Finished", home, away, homeScore, awayScore, quarters, homeWon: ev["winnerCode"] === 1 });
    }

    recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
    basketballScheduleCache = { league: "NBA", season: "2025-26", upcomingMatches, recentMatches: recentMatches.slice(0, 15) };
    basketballScheduleFetchedAt = now;
    return basketballScheduleCache;
  } catch {
    return basketballScheduleCache ?? { league: "NBA", season: "", upcomingMatches: [], recentMatches: [] };
  }
}

async function getBasketballDailyResults(): Promise<BasketballDailyResult[]> {
  const now = Date.now();
  if (basketballResultsCache && now - basketballResultsFetchedAt < RESULTS_CACHE_TTL) return basketballResultsCache;
  try {
    const events = await getV2EventsLast("basketball", 20);
    const yd = new Date(Date.now() - 86400000);
    const ydStr = `${String(yd.getUTCDate()).padStart(2, "0")}.${String(yd.getUTCMonth() + 1).padStart(2, "0")}.${yd.getUTCFullYear()}`;
    const results: BasketballDailyResult[] = [];
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      const st = (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? ev["status"];
      if (typeof st === "string" && st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts) continue;
      const { date, time } = v2EventDateTime({ startTimestamp: ts } as SAPIV2Event);
      if (date !== ydStr) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const quarters: Array<[number, number]> = [];
      for (const p of ["period1", "period2", "period3", "period4", "overtime"]) {
        const hv = hs?.[p]; const av = as_?.[p];
        if (hv != null && av != null) quarters.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      results.push({ id: String(ev["id"] ?? ""), home, away, homeScore, awayScore, quarters, homeWon: ev["winnerCode"] === 1, league: "NBA", country: "usa", date, time });
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
  if (hockeyScheduleCache && now - hockeyScheduleFetchedAt < HOCKEY_SCHEDULE_TTL) return hockeyScheduleCache;
  try {
    const [upcomingEvents, lastEvents] = await Promise.all([
      getUpcomingLeagueEventsV2("hockey", 21),
      getV2EventsLast("hockey", 60),
    ]);
    const cutoff14 = Date.now() - 14 * 86400000;
    const dateKey = (s: string) => { const [d, mo, y] = s.split("."); return `${y ?? ""}${mo ?? ""}${d ?? ""}`; };

    const upcomingMatches: HockeyScheduleMatch[] = upcomingEvents.slice(0, 40).map(ev => {
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      return { id: String(ev.id), date, time, status: "Not Started", home, away, homeScore: 0, awayScore: 0, periods: [] };
    });

    const recentMatches: HockeyScheduleMatch[] = [];
    for (const raw of lastEvents) {
      const ev = raw as Record<string, unknown>;
      const st = (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? "";
      if (typeof st !== "string" || st !== "finished") continue;
      const ts = ev["startTimestamp"] as number | undefined;
      if (!ts || ts * 1000 < cutoff14) continue;
      const hs = ev["homeScore"] as Record<string, unknown> | undefined;
      const as_ = ev["awayScore"] as Record<string, unknown> | undefined;
      const homeScore = Number(hs?.["current"] ?? 0);
      const awayScore = Number(as_?.["current"] ?? 0);
      const periods: Array<[number, number]> = [];
      for (const p of ["period1", "period2", "period3", "overtime", "shootout"]) {
        const hv = hs?.[p]; const av = as_?.[p];
        if (hv != null && av != null) periods.push([Number(hv), Number(av)]);
      }
      const homeTeam = ev["homeTeam"] as Record<string, unknown> | undefined;
      const awayTeam = ev["awayTeam"] as Record<string, unknown> | undefined;
      const home = String(homeTeam?.["name"] ?? homeTeam?.["shortName"] ?? "");
      const away = String(awayTeam?.["name"] ?? awayTeam?.["shortName"] ?? "");
      if (!home || !away) continue;
      const { date, time } = v2EventDateTime({ startTimestamp: ts } as SAPIV2Event);
      recentMatches.push({ id: String(ev["id"] ?? ""), date, time, status: "Finished", home, away, homeScore, awayScore, periods, homeWon: ev["winnerCode"] === 1 });
    }

    recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
    hockeyScheduleCache = { league: "NHL", season: "2025-26", upcomingMatches, recentMatches: recentMatches.slice(0, 15) };
    hockeyScheduleFetchedAt = now;
    return hockeyScheduleCache;
  } catch {
    return hockeyScheduleCache ?? { league: "NHL", season: "", upcomingMatches: [], recentMatches: [] };
  }
}

async function getMLBSchedule(): Promise<MLBScheduleData> {
  const now = Date.now();
  if (mlbScheduleCache && now - mlbScheduleFetchedAt < MLB_SCHEDULE_TTL) return mlbScheduleCache;
  const empty: MLBScheduleData = { league: "MLB", season: "", upcomingMatches: [], recentMatches: [] };
  try {
    const [upcomingEvents, lastEvents] = await Promise.all([
      getUpcomingLeagueEventsV2("baseball", 21),
      getV2EventsLast("baseball", 60),
    ]);
    const cutoff14 = Date.now() - 14 * 86400000;
    const dateKey = (s: string) => { const [d, mo, y] = s.split("."); return `${y ?? ""}${mo ?? ""}${d ?? ""}`; };

    const upcomingMatches: MLBScheduleMatch[] = upcomingEvents.slice(0, 50).map(ev => {
      const home = v2TeamName(ev.homeTeam);
      const away = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      return { id: String(ev.id), date, time, status: "Not Started", home, away, homeScore: 0, awayScore: 0 };
    });

    const recentMatches: MLBScheduleMatch[] = [];
    for (const raw of lastEvents) {
      const ev = raw as Record<string, unknown>;
      const st = (ev["status"] as Record<string, unknown> | undefined)?.["type"] ?? "";
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
      const { date, time } = v2EventDateTime({ startTimestamp: ts } as SAPIV2Event);
      recentMatches.push({ id: String(ev["id"] ?? ""), date, time, status: "Finished", home, away, homeScore, awayScore, homeWon: ev["winnerCode"] === 1 });
    }

    recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
    mlbScheduleCache = { league: "MLB", season: "2025", upcomingMatches, recentMatches: recentMatches.slice(0, 20) };
    mlbScheduleFetchedAt = now;
    return mlbScheduleCache;
  } catch {
    return mlbScheduleCache ?? empty;
  }
}

// ─── Tournament detail cache ──────────────────────────────────────────────────
type TournamentMatchPlayer = {
  id: string; name: string;
  totalscore: string;
  s1: string; s2: string; s3: string; s4: string; s5: string;
  winner: boolean; serve: boolean;
};
type TournamentMatch = {
  id: string; status: string; date: string; time: string; court: string;
  round: string; roundOrder: number;
  players: TournamentMatchPlayer[];
};
type TournamentDetail = { id: string; league: string; season: string; matches: TournamentMatch[] };
const tourDetailCache = new Map<string, { data: TournamentDetail; at: number }>();
const TOUR_DETAIL_TTL = 5 * 60 * 1000; // 5 min

const ROUND_ORDER: Record<string, number> = {
  "1/64-finals": 1, "1/32-finals": 2, "1/16-finals": 3,
  "1/8-finals": 4, "quarter-finals": 5, "semi-finals": 6, "final": 7,
};

async function getTournamentDetail(id: string): Promise<TournamentDetail> {
  const cached = tourDetailCache.get(id);
  if (cached) return cached.data;
  throw new Error("Detalhe de torneio indisponível");
}

router.get("/tournaments", async (_req, res) => {
  try {
    const tournaments = await getActiveTournaments();
    res.json({ tournaments });
  } catch {
    res.status(500).json({ error: "Torneios indisponíveis" });
  }
});

// ─── Tennis standings (ATP + WTA) ──────────────────────────────────────────
type StandingPlayer = { id: string; name: string; country: string; rank: string; points: string; movement: string; };
type StandingsTour = { atp: StandingPlayer[]; wta: StandingPlayer[] };
let standingsCache: StandingsTour | null = null;
let standingsFetchedAt = 0;
const STANDINGS_CACHE_TTL = 30 * 60 * 1000;

async function getTennisStandings(): Promise<StandingsTour> {
  return standingsCache ?? { atp: [], wta: [] };
}

router.get("/standings", async (_req, res) => {
  try {
    const standings = await getTennisStandings();
    res.json(standings);
  } catch {
    res.status(500).json({ error: "Rankings indisponíveis" });
  }
});

router.get("/tournaments/:id", async (req, res) => {
  const id = String(req.params["id"]);
  try {
    const detail = await getTournamentDetail(id);
    res.json(detail);
  } catch {
    res.status(500).json({ error: "Detalhe de torneio indisponível" });
  }
});

router.get("/results", async (_req, res) => {
  try {
    const results = await getTennisDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/volleyball-results", async (_req, res) => {
  try {
    const results = await getVolleyballDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/hockey-results", async (_req, res) => {
  try {
    const results = await getHockeyDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/basketball-results", async (_req, res) => {
  try {
    const results = await getBasketballDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/mlb-results", async (_req, res) => {
  try {
    const results = await getMLBDailyResults();
    res.json({ results });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
});

router.get("/basketball-schedule", async (_req, res) => {
  try {
    const data = await getBasketballSchedule();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

router.get("/hockey-schedule", async (_req, res) => {
  try {
    const data = await getHockeySchedule();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

router.get("/mlb-schedule", async (_req, res) => {
  try {
    const data = await getMLBSchedule();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

async function getHockeyStandings(): Promise<NHLStandingsData> {
  const now = Date.now();
  if (hockeyStandingsCache && now - hockeyStandingsFetchedAt < HOCKEY_STANDINGS_TTL) return hockeyStandingsCache;
  try {
    const rows = await getV2StandingRows("hockey");
    if (!rows.length) return hockeyStandingsCache ?? { season: "", conferences: [] };
    const teams: NHLStandingsTeam[] = rows.map(row => ({
      id: String(row.team.id),
      name: row.team.name,
      abbr: NHL_ABBR[row.team.name] ?? row.team.nameCode?.toLowerCase() ?? row.team.name.slice(0, 3).toLowerCase(),
      position: row.position,
      gp: row.matches,
      won: row.wins,
      lost: row.normaltimeLosses ?? row.losses,
      otLosses: row.overtimeLosses ?? 0,
      points: row.points ?? (row.wins * 2),
      gf: row.scoresFor ?? 0,
      ga: row.scoresAgainst ?? 0,
      diff: row.scoreDiffFormatted ?? "0",
      streak: typeof row.streak === "number" ? String(row.streak) : (row.streak as string | undefined ?? ""),
      lastTen: "",
      homeRecord: "",
      roadRecord: "",
    })).sort((a, b) => a.position - b.position);
    hockeyStandingsCache = { season: "2025-26", conferences: [{ name: "NHL", divisions: [{ name: "Classificação", teams }] }] };
    hockeyStandingsFetchedAt = now;
    return hockeyStandingsCache;
  } catch {
    return hockeyStandingsCache ?? { season: "", conferences: [] };
  }
}

async function getMLBStandings(): Promise<MLBStandingsData> {
  const now = Date.now();
  if (mlbStandingsCache && now - mlbStandingsFetchedAt < MLB_STANDINGS_TTL) return mlbStandingsCache;
  const empty: MLBStandingsData = { season: "", leagues: [] };
  try {
    const rows = await getV2StandingRows("baseball");
    if (!rows.length) return mlbStandingsCache ?? empty;
    const teams: MLBStandingsTeam[] = rows.map(row => ({
      id: String(row.team.id),
      name: row.team.name,
      position: row.position,
      won: row.wins,
      lost: row.losses,
      gamesBack: row.gamesBehind != null ? String(row.gamesBehind) : "-",
      streak: typeof row.streak === "number" ? String(row.streak) : (row.streak as string | undefined ?? ""),
      homeRecord: "",
      awayRecord: "",
      runsScored: row.scoresFor ?? 0,
      runsAllowed: row.scoresAgainst ?? 0,
      runsDiff: row.scoreDiffFormatted ?? "0",
    })).sort((a, b) => a.position - b.position);
    mlbStandingsCache = { season: "2025", leagues: [{ name: "MLB", divisions: [{ name: "Classificação", teams }] }] };
    mlbStandingsFetchedAt = now;
    return mlbStandingsCache;
  } catch {
    return mlbStandingsCache ?? empty;
  }
}

router.get("/mlb-standings", async (_req, res) => {
  try {
    const data = await getMLBStandings();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

router.get("/hockey-standings", async (_req, res) => {
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

router.get("/mlb-roster/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getMLBRoster(abbr);
    if (!data) { res.status(404).json({ error: "Roster não encontrado" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Roster indisponível" });
  }
});

// MLB team stats (per-player season stats: Batting + Pitching)
type MLBBatterStat = {
  id: string; rank: number; name: string; gp: number;
  ab: number; h: number; avg: string; obp: string; slg: string;
  r: number; rbi: number; hr: number; doubles: number; triples: number;
  sb: number; bb: number; so: number;
};
type MLBPitcherStat = {
  id: string; rank: number; name: string; gp: number; gs: number;
  era: string; w: number; l: number; ip: string;
  so: number; bb: number; h: number; hr: number; whip: string; baa: string;
};
type MLBTeamStatsData = { teamName: string; season: string; batters: MLBBatterStat[]; pitchers: MLBPitcherStat[] };
const mlbTeamStatsCache = new Map<string, MLBTeamStatsData>();
const mlbTeamStatsFetchedAt = new Map<string, number>();
const MLB_TEAM_STATS_TTL = 30 * 60 * 1000;

async function getMLBTeamStats(abbr: string): Promise<MLBTeamStatsData | null> {
  return mlbTeamStatsCache.get(abbr) ?? null;
}

router.get("/mlb-team-stats/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getMLBTeamStats(abbr);
    if (!data) { res.status(404).json({ error: "Estatísticas indisponíveis" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas indisponíveis" });
  }
});

// MLB injuries
type MLBInjuryReport = { playerName: string; playerId: string; status: string; description: string; date: string };
type MLBInjuriesData = { teamName: string; report: MLBInjuryReport[] };
const mlbInjuriesCache = new Map<string, MLBInjuriesData>();
const mlbInjuriesFetchedAt = new Map<string, number>();
const MLB_INJURIES_TTL = 15 * 60 * 1000;

async function getMLBInjuries(abbr: string): Promise<MLBInjuriesData | null> {
  return mlbInjuriesCache.get(abbr) ?? null;
}

router.get("/mlb-injuries/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getMLBInjuries(abbr);
    if (!data) { res.status(404).json({ error: "Lesões indisponíveis" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Lesões indisponíveis" });
  }
});

// ─── MLB League Stats (batting + pitching leaders) ────────────────────────────
type MLBLeaderBatter = {
  rank: string; name: string; team: string; gp: string;
  atBats: string; hits: string; doubles: string; triples: string;
  homeRuns: string; runs: string; rbi: string; stolenBases: string;
  walks: string; strikeouts: string; avg: string; obp: string; slg: string;
};
type MLBLeagueStatsData = { batters: MLBLeaderBatter[] };

const MLB_LEAGUE_STATS_TTL = 30 * 60 * 1000;
let mlbLeagueStatsCache: MLBLeagueStatsData | null = null;
let mlbLeagueStatsFetchedAt = 0;

async function getMLBLeagueStats(): Promise<MLBLeagueStatsData> {
  return mlbLeagueStatsCache ?? { batters: [] };
}

router.get("/mlb-league-stats", async (_req, res) => {
  try {
    const data = await getMLBLeagueStats();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas da liga indisponíveis" });
  }
});

async function getNBAStandings(): Promise<NBAStandingsData> {
  const now = Date.now();
  if (nbaStandingsCache && now - nbaStandingsFetchedAt < NBA_STANDINGS_TTL) return nbaStandingsCache;
  try {
    const rows = await getV2StandingRows("basketball");
    if (!rows.length) return nbaStandingsCache ?? { season: "", conferences: [] };
    const teams: NBAStandingsTeam[] = rows.map(row => ({
      id: String(row.team.id),
      name: row.team.name,
      abbr: NBA_ABBR[row.team.name] ?? row.team.nameCode?.toLowerCase() ?? row.team.name.slice(0, 3).toLowerCase(),
      position: row.position,
      won: row.wins,
      lost: row.losses,
      pct: row.percentage != null ? ("." + Math.round(row.percentage * 1000).toString().padStart(3, "0")) : ".000",
      gb: row.gamesBehind != null ? String(row.gamesBehind) : "-",
      streak: typeof row.streak === "number" ? String(row.streak) : (row.streak as string | undefined ?? ""),
      lastTen: "",
      homeRecord: "",
      roadRecord: "",
      ppg: (row.scoresFor != null && row.matches > 0) ? (row.scoresFor / row.matches).toFixed(1) : "0.0",
      papg: (row.scoresAgainst != null && row.matches > 0) ? (row.scoresAgainst / row.matches).toFixed(1) : "0.0",
      diff: row.scoreDiffFormatted ?? "0",
    })).sort((a, b) => a.position - b.position);
    nbaStandingsCache = { season: "2025-26", conferences: [{ name: "NBA", divisions: [{ name: "Classificação", teams }] }] };
    nbaStandingsFetchedAt = now;
    return nbaStandingsCache;
  } catch {
    return nbaStandingsCache ?? { season: "", conferences: [] };
  }
}

router.get("/basketball-standings", async (_req, res) => {
  try {
    const data = await getNBAStandings();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

// NBA roster
type NBAPlayer = {
  id: string; name: string; number: string; age: number;
  position: string; college: string; height: string; weight: string; salary: string;
};
type NBATeamRoster = { teamName: string; abbreviation: string; season: string; players: NBAPlayer[] };
const nbaRosterCache = new Map<string, NBATeamRoster>();
const nbaRosterFetchedAt = new Map<string, number>();
const NBA_ROSTER_TTL = 60 * 60 * 1000;

async function getBasketballRoster(abbr: string): Promise<NBATeamRoster | null> {
  return nbaRosterCache.get(abbr) ?? null;
}

router.get("/basketball-roster/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getBasketballRoster(abbr);
    if (!data) { res.status(404).json({ error: "Roster não encontrado" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Roster indisponível" });
  }
});

// NBA team stats
type NBAPlayerStat = {
  id: string; rank: number; name: string;
  gp: number; gs: number; min: string;
  ppg: string; apg: string; rpg: string; orpg: string; drpg: string;
  bpg: string; spg: string; topg: string; fpg: string;
  fgPct: string; fg3Pct: string; ftPct: string;
  fgm: string; fga: string; fg3m: string; fg3a: string; ftm: string; fta: string;
};
type NBATeamStatsData = { teamName: string; players: NBAPlayerStat[] };
const nbaTeamStatsCache = new Map<string, NBATeamStatsData>();
const nbaTeamStatsFetchedAt = new Map<string, number>();
const NBA_TEAM_STATS_TTL = 30 * 60 * 1000;

async function getBasketballTeamStats(abbr: string): Promise<NBATeamStatsData | null> {
  return nbaTeamStatsCache.get(abbr) ?? null;
}

router.get("/basketball-team-stats/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getBasketballTeamStats(abbr);
    if (!data) { res.status(404).json({ error: "Estatísticas indisponíveis" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas indisponíveis" });
  }
});

async function getHockeyRoster(abbr: string): Promise<NHLRosterData | null> {
  return hockeyRosterCache.get(abbr) ?? null;
}

router.get("/hockey-roster/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getHockeyRoster(abbr);
    if (!data) { res.status(404).json({ error: "Roster não encontrado" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Roster indisponível" });
  }
});

// NHL team stats (per-player season statistics)
type NHLSkaterStat = {
  id: string; rank: number; name: string; pos: string;
  gp: number; goals: number; assists: number; points: number;
  plusMinus: number; pim: number; ppg: number; ppa: number;
  shg: number; sha: number; shots: number; gwg: number;
  toiPerGame: string; faceoffPct: string;
};
type NHLGoalieStat = {
  id: string; rank: number; name: string;
  gp: number; wins: number; losses: number; otLosses: number;
  saves: number; savesPct: string; gaa: string;
  shotsAgainst: number; goalsAgainst: number; shutouts: number; toi: string;
};
type NHLTeamStatsData = { teamName: string; season: string; skaters: NHLSkaterStat[]; goalies: NHLGoalieStat[] };
const hockeyTeamStatsCache = new Map<string, NHLTeamStatsData>();
const hockeyTeamStatsFetchedAt = new Map<string, number>();
const HOCKEY_TEAM_STATS_TTL = 30 * 60 * 1000;

async function getHockeyTeamStats(abbr: string): Promise<NHLTeamStatsData | null> {
  return hockeyTeamStatsCache.get(abbr) ?? null;
}

router.get("/hockey-team-stats/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getHockeyTeamStats(abbr);
    if (!data) { res.status(404).json({ error: "Estatísticas indisponíveis" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Estatísticas indisponíveis" });
  }
});

// NHL injuries
type NHLInjuryReport = { playerName: string; playerId: string; status: string; description: string; date: string };
type NHLInjuriesData = { teamName: string; report: NHLInjuryReport[] };
const hockeyInjuriesCache = new Map<string, NHLInjuriesData>();
const hockeyInjuriesFetchedAt = new Map<string, number>();
const HOCKEY_INJURIES_TTL = 15 * 60 * 1000; // 15 min — injuries change more often

async function getHockeyInjuries(abbr: string): Promise<NHLInjuriesData | null> {
  return hockeyInjuriesCache.get(abbr) ?? null;
}

router.get("/hockey-injuries/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getHockeyInjuries(abbr);
    if (!data) { res.status(404).json({ error: "Lesões indisponíveis" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Lesões indisponíveis" });
  }
});

// NBA injuries
type NBAInjuryReport = { playerName: string; playerId: string; status: string; description: string; date: string };
type NBAInjuriesData = { teamName: string; report: NBAInjuryReport[] };
const nbaInjuriesCache = new Map<string, NBAInjuriesData>();
const nbaInjuriesFetchedAt = new Map<string, number>();
const NBA_INJURIES_TTL = 15 * 60 * 1000;

async function getBasketballInjuries(abbr: string): Promise<NBAInjuriesData | null> {
  return nbaInjuriesCache.get(abbr) ?? null;
}

router.get("/basketball-injuries/:team", async (req, res) => {
  const abbr = String(req.params["team"]).toLowerCase();
  try {
    const data = await getBasketballInjuries(abbr);
    if (!data) { res.status(404).json({ error: "Lesões indisponíveis" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Lesões indisponíveis" });
  }
});

router.get("/volleyball-standings/:id", async (req, res) => {
  try {
    const id = String(req.params["id"]);
    const data = await getVolleyballStandings(id);
    // Return empty-teams payload if the standings don't exist for this phase (e.g. play-offs)
    res.json(data ?? { id, name: "", season: "", country: "", teams: [] });
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

router.get("/volleyball-leagues", async (_req, res) => {
  try {
    const leagues = await getVolleyballActiveLeagues();
    res.json({ leagues });
  } catch {
    res.json({ leagues: [] });
  }
});

router.get("/volleyball-schedule/:id", async (req, res) => {
  try {
    const id = String(req.params["id"]);
    const data = await getVolleyballSchedule(id);
    if (!data) { res.status(404).json({ error: "Calendário não encontrado" }); return; }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
});

// ─── Tennis pre-match odds ────────────────────────────────────────────────────
type TennisOddsPlayer = { id: string; name: string };
type TennisOddsEntry = {
  matchId: string; date: string; time: string; tournamentName: string;
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
type VolleyOddsTotal = { name?: string; stop?: string; odd?: VolleyOddsOdd | VolleyOddsOdd[] };
type VolleyOddsBk = { id?: string; name?: string; stop?: string; ts?: string; odd?: VolleyOddsOdd | VolleyOddsOdd[]; total?: VolleyOddsTotal | VolleyOddsTotal[] };
type VolleyOddsType = { id?: string; stop?: string; value?: string; bookmaker?: VolleyOddsBk | VolleyOddsBk[] };
type VolleyOddsTeam = { id?: string; name?: string };
type VolleyOddsMatch = { id?: string; date?: string; time?: string; status?: string; home?: VolleyOddsTeam; away?: VolleyOddsTeam; odds?: { ts?: string; type?: VolleyOddsType | VolleyOddsType[] } };
type VolleyOddsTour = { gid?: string; id?: string; league?: string; matches?: { match?: VolleyOddsMatch | VolleyOddsMatch[] } };
export type VolleyOddsEntry = {
  matchId: string; date: string; time: string; league: string;
  homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
  homeOdds: number; awayOdds: number;
  overUnder: { line: string; over: number; under: number } | null;
};
let volleyOddsCache: VolleyOddsEntry[] | null = null;
let volleyOddsFetchedAt = 0;
const VOLLEY_ODDS_TTL = 60 * 1000;

async function getVolleyballOdds(): Promise<VolleyOddsEntry[]> {
  return volleyOddsCache ?? [];
}

router.get("/volleyball-odds", async (_req, res) => {
  try {
    const odds = await getVolleyballOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de voleibol indisponíveis" });
  }
});

// NBA pre-match odds
type NBAOddsOdd = { name?: string; value?: string };
type NBAOddsBk = { id?: string; name?: string; stop?: string; odd?: NBAOddsOdd | NBAOddsOdd[] };
type NBAOddsType = { id?: string; stop?: string; value?: string; bookmaker?: NBAOddsBk | NBAOddsBk[] };
type NBAOddsMatch = {
  id?: string; date?: string; time?: string; status?: string;
  home?: { id?: string; name?: string }; away?: { id?: string; name?: string };
  odds?: { ts?: string; type?: NBAOddsType | NBAOddsType[] };
};
export type NBAOddsEntry = {
  matchId: string; date: string; time: string;
  homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
  homeOdds: number; awayOdds: number;
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

async function getBasketballOdds(): Promise<NBAOddsEntry[]> {
  const now = Date.now();
  if (nbaOddsCache && now - nbaOddsFetchedAt < NBA_ODDS_TTL) return nbaOddsCache;
  if (nbaOddsCache) {
    if (!nbaOddsInFlight) {
      nbaOddsInFlight = (async () => {
        try {
          const events = (await getUpcomingLeagueEventsV2("basketball", 7)).slice(0, 20);
          const oddsResults: Array<V2PreMatchOdds | null> = new Array(events.length).fill(null);
          const batchSize = 10;
          for (let i = 0; i < events.length; i += batchSize) {
            const slice = events.slice(i, i + batchSize);
            const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("basketball", ev.id).catch(() => null)));
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
            const mkt = makeBasketballMarketsFromTeams(homeName, awayName) as Record<string, unknown>;
            mkt["odds"] = { home: realOdds.home, draw: 0, away: realOdds.away };
            results.push({
              matchId: String(ev.id), date, time,
              homeTeam: { id: "", name: homeName },
              awayTeam: { id: "", name: awayName },
              homeOdds: realOdds.home, awayOdds: realOdds.away,
              markets: mkt,
            });
          }
          nbaOddsCache = results;
          nbaOddsFetchedAt = Date.now();
          return results;
        } catch {
          return nbaOddsCache ?? [];
        }
      })().finally(() => { nbaOddsInFlight = null; });
    }
    return nbaOddsCache;
  }
  try {
    const events = (await getUpcomingLeagueEventsV2("basketball", 7)).slice(0, 20);
    const oddsResults: Array<V2PreMatchOdds | null> = new Array(events.length).fill(null);
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("basketball", ev.id).catch(() => null)));
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
      const mkt = makeBasketballMarketsFromTeams(homeName, awayName) as Record<string, unknown>;
      mkt["odds"] = { home: realOdds.home, draw: 0, away: realOdds.away };
      results.push({
        matchId: String(ev.id), date, time,
        homeTeam: { id: "", name: homeName },
        awayTeam: { id: "", name: awayName },
        homeOdds: realOdds.home, awayOdds: realOdds.away,
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

router.get("/basketball-odds", async (_req, res) => {
  try {
    const odds = await getBasketballOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de basquetebol indisponíveis" });
  }
});

// NHL pre-match odds
type HockeyOddsOdd = { name?: string; value?: string };
type HockeyOddsBk = { id?: string; name?: string; stop?: string; odd?: HockeyOddsOdd | HockeyOddsOdd[] };
type HockeyOddsType = { id?: string; stop?: string; value?: string; bookmaker?: HockeyOddsBk | HockeyOddsBk[] };
type HockeyOddsMatch = {
  id?: string; fix_id?: string; date?: string; time?: string; status?: string;
  home?: { id?: string; name?: string }; away?: { id?: string; name?: string };
  odds?: { ts?: number; type?: HockeyOddsType | HockeyOddsType[] };
};
export type HockeyOddsEntry = {
  matchId: string; date: string; time: string;
  homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
  homeOdds: number; drawOdds: number; awayOdds: number;
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
  if (hockeyOddsCache && now - hockeyOddsFetchedAt < HOCKEY_ODDS_TTL) return hockeyOddsCache;
  if (hockeyOddsCache) {
    if (!hockeyOddsInFlight) {
      hockeyOddsInFlight = (async () => {
        try {
          const events = (await getUpcomingLeagueEventsV2("hockey", 7)).slice(0, 20);
          const oddsResults: Array<V2PreMatchOdds | null> = new Array(events.length).fill(null);
          const batchSize = 10;
          for (let i = 0; i < events.length; i += batchSize) {
            const slice = events.slice(i, i + batchSize);
            const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("hockey", ev.id).catch(() => null)));
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
            const mkt = makeHockeyMarketsFromTeams(homeName, awayName) as Record<string, unknown>;
            const h = realOdds.home; const d = realOdds.draw || 0; const a = realOdds.away;
            mkt["odds"] = { home: h, draw: d, away: a };
            results.push({
              matchId: String(ev.id), date, time,
              homeTeam: { id: "", name: homeName },
              awayTeam: { id: "", name: awayName },
              homeOdds: h, drawOdds: d, awayOdds: a,
              markets: mkt,
            });
          }
          hockeyOddsCache = results;
          hockeyOddsFetchedAt = Date.now();
          return results;
        } catch {
          return hockeyOddsCache ?? [];
        }
      })().finally(() => { hockeyOddsInFlight = null; });
    }
    return hockeyOddsCache;
  }
  try {
    const events = (await getUpcomingLeagueEventsV2("hockey", 7)).slice(0, 20);
    const oddsResults: Array<V2PreMatchOdds | null> = new Array(events.length).fill(null);
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("hockey", ev.id).catch(() => null)));
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
      const mkt = makeHockeyMarketsFromTeams(homeName, awayName) as Record<string, unknown>;
      const h = realOdds.home; const d = realOdds.draw || 0; const a = realOdds.away;
      mkt["odds"] = { home: h, draw: d, away: a };
      results.push({
        matchId: String(ev.id), date, time,
        homeTeam: { id: "", name: homeName },
        awayTeam: { id: "", name: awayName },
        homeOdds: h, drawOdds: d, awayOdds: a,
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

router.get("/hockey-odds", async (_req, res) => {
  try {
    const odds = await getHockeyOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de hockey indisponíveis" });
  }
});

// ─── MLB Odds ─────────────────────────────────────────────────────────────────
type MLBOddsOdd = { name?: string; value?: string };
type MLBOddsBk  = { id?: string; name?: string; stop?: string; odd?: MLBOddsOdd | MLBOddsOdd[] };
type MLBOddsType = { id?: string; value?: string; bookmaker?: MLBOddsBk | MLBOddsBk[] };
type MLBOddsMatch = {
  id?: string; mlbid?: string; date?: string; time?: string; status?: string;
  home?: { id?: string; name?: string }; away?: { id?: string; name?: string };
  odds?: { ts?: string; type?: MLBOddsType | MLBOddsType[] };
};
export type MLBOddsEntry = {
  matchId: string; date: string; time: string;
  homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
  homeOdds: number; drawOdds: number; awayOdds: number;
  markets?: AdvancedMarkets;
};

const MLB_ODDS_TTL = 5 * 60 * 1000;
let mlbOddsCache: MLBOddsEntry[] | null = null;
let mlbOddsFetchedAt = 0;
let mlbOddsInFlight: Promise<MLBOddsEntry[]> | null = null;

async function getMLBOdds(): Promise<MLBOddsEntry[]> {
  const now = Date.now();
  if (mlbOddsCache && now - mlbOddsFetchedAt < MLB_ODDS_TTL) return mlbOddsCache;
  if (mlbOddsCache) {
    if (!mlbOddsInFlight) {
      mlbOddsInFlight = (async () => {
        try {
          const events = (await getUpcomingLeagueEventsV2("baseball", 7)).slice(0, 20);
          const oddsResults: Array<V2PreMatchOdds | null> = new Array(events.length).fill(null);
          const batchSize = 10;
          for (let i = 0; i < events.length; i += batchSize) {
            const slice = events.slice(i, i + batchSize);
            const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("baseball", ev.id).catch(() => null)));
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
              matchId: String(ev.id), date, time,
              homeTeam: { id: "", name: homeName },
              awayTeam: { id: "", name: awayName },
              homeOdds: realOdds.home, drawOdds: realOdds.draw || 0, awayOdds: realOdds.away,
              markets: makeAdvancedMarketsFromTeams(homeName, awayName),
            });
          }
          mlbOddsCache = results;
          mlbOddsFetchedAt = Date.now();
          return results;
        } catch {
          return mlbOddsCache ?? [];
        }
      })().finally(() => { mlbOddsInFlight = null; });
    }
    return mlbOddsCache;
  }
  try {
    const events = (await getUpcomingLeagueEventsV2("baseball", 7)).slice(0, 20);
    const oddsResults: Array<V2PreMatchOdds | null> = new Array(events.length).fill(null);
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      const out = await Promise.all(slice.map(ev => getPreMatchOddsV2("baseball", ev.id).catch(() => null)));
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
        matchId: String(ev.id), date, time,
        homeTeam: { id: "", name: homeName },
        awayTeam: { id: "", name: awayName },
        homeOdds: realOdds.home, drawOdds: 0, awayOdds: realOdds.away,
        markets: makeMLBMarketsFromTeams(homeName, awayName, realOdds.home, realOdds.away),
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

router.get("/mlb-odds", async (_req, res) => {
  try {
    const odds = await getMLBOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de baseball indisponíveis" });
  }
});

async function getTennisOdds(): Promise<TennisOddsEntry[]> {
  const now = Date.now();
  if (tennisOddsCache && now - tennisOddsFetchedAt < TENNIS_ODDS_TTL) return tennisOddsCache;
  try {
    const events = await getUpcomingLeagueEventsV2("tennis", 7);
    const oddsResults = await Promise.all(
      events.map(ev => getPreMatchOddsV2("tennis", ev.id).catch(() => null))
    );
    const results: TennisOddsEntry[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      const realOdds = oddsResults[i];
      if (!realOdds || realOdds.home <= 0) continue;
      const p0Name = v2TeamName(ev.homeTeam);
      const p1Name = v2TeamName(ev.awayTeam);
      const { date, time } = v2EventDateTime(ev);
      const h = realOdds.home; const a = realOdds.away;
      if (p0Name && p1Name) {
        _tennisPreMatchOdds.set(_tennisPairKey(p0Name, p1Name), { home: h, away: a });
      }
      const pHome = h > 0 && a > 0 ? (1 / h) / ((1 / h) + (1 / a)) : 0.5;
      const set1H = realOdds.firstSetHome ?? 0;
      const set1A = realOdds.firstSetAway ?? 0;
      const tExtra = computeTennisExtras(pHome, {
        set1H: set1H > 0 ? set1H : undefined,
        set1A: set1A > 0 ? set1A : undefined,
      });
      results.push({
        matchId: String(ev.id),
        date, time,
        tournamentName: (ev.tournament as { name?: string } | undefined)?.name ?? "",
        status: "Not Started",
        players: [{ id: "", name: p0Name }, { id: "", name: p1Name }],
        matchOdds: [h, a],
        set1Odds: set1H > 0 && set1A > 0 ? [set1H, set1A] : null,
        markets: {
          doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
          bothTeamsScore: { yes: 0, no: 0 },
          totalGoals: { over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0, over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0 },
          handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
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

router.get("/tennis-odds", async (_req, res) => {
  try {
    const odds = await getTennisOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de ténis indisponíveis" });
  }
});

router.get("/league-standings", async (req, res) => {
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

router.get("/football-leagues", async (_req, res) => {
  try {
    const leagues = await getFootballLeagues();
    res.json({ leagues });
  } catch {
    res.status(500).json({ error: "Ligas de futebol indisponíveis" });
  }
});

// Football schedule types (v2/soccer/leagues/{id}/matches)
type FootballSchedulePlayer = { number: string; id: string; name: string; booking: string };
type FootballScheduleSubstitution = {
  player_in_number: string; player_in_name: string; player_in_booking: string; player_in_id: string;
  player_out_name: string; player_out_id: string; minute: string;
};
type FootballScheduleGoal = {
  team: string; minute: string; player: string; score: string; playerid: string; assist: string; assistid: string;
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
    home?: { formation: string; player: FootballSchedulePlayer | FootballSchedulePlayer[] };
    away?: { formation: string; player: FootballSchedulePlayer | FootballSchedulePlayer[] };
  };
  substitutions?: {
    home?: { substitution: FootballScheduleSubstitution | FootballScheduleSubstitution[] };
    away?: { substitution: FootballScheduleSubstitution | FootballScheduleSubstitution[] };
  };
  goals?: { goal: FootballScheduleGoal | FootballScheduleGoal[] };
  ht: { home_goals: number; away_goals: number } | null;
  ft: { home_goals: number; away_goals: number } | null;
  et: { home_goals: number; away_goals: number } | null;
  penalties: { home_pen: number; away_pen: number } | null;
};
type FootballScheduleWeek = { number: string; match: FootballScheduleMatch | FootballScheduleMatch[] };
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
  goals?: { team: string; minute: string; player: string; score: string; assist: string }[];
};

type FootballScheduleWeekOut = {
  number: number;
  matches: FootballScheduleMatchOut[];
};

const footballScheduleCache = new Map<string, { data: FootballScheduleWeekOut[]; meta: { league: string; season: string; country: string }; fetchedAt: number }>();
const FOOTBALL_SCHEDULE_TTL = 5 * 60 * 1000;

function parseFootballMatch(m: FootballScheduleMatch): FootballScheduleMatchOut {
  const toPlayers = (raw: FootballSchedulePlayer | FootballSchedulePlayer[] | undefined) =>
    raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const toSubs = (raw: FootballScheduleSubstitution | FootballScheduleSubstitution[] | undefined) =>
    raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const rawGoals = m.goals?.goal;
  const goals = rawGoals ? (Array.isArray(rawGoals) ? rawGoals : [rawGoals]) : [];
  const hScore = parseInt(m.home.score);
  const aScore = parseInt(m.away.score);

  const homeSubs = toSubs(m.substitutions?.home?.substitution);
  const awaySubs = toSubs(m.substitutions?.away?.substitution);
  void homeSubs; void awaySubs; // available if needed

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
    penScore: m.penalties ? { home: m.penalties.home_pen, away: m.penalties.away_pen } : null,
    homeCoach: m.coaches?.home?.coach?.name || undefined,
    awayCoach: m.coaches?.away?.coach?.name || undefined,
    referee: m.referee?.name || undefined,
    homeFormation: m.lineups?.home?.formation || undefined,
    awayFormation: m.lineups?.away?.formation || undefined,
    homePlayers: toPlayers(m.lineups?.home?.player),
    awayPlayers: toPlayers(m.lineups?.away?.player),
    goals: goals.map(g => ({ team: g.team, minute: g.minute, player: g.player, score: g.score, assist: g.assist })),
  };
}

async function getFootballSchedule(id: string): Promise<{ weeks: FootballScheduleWeekOut[]; meta: { league: string; season: string; country: string } }> {
  const cached = footballScheduleCache.get(id);
  if (cached) return { weeks: cached.data, meta: cached.meta };
  throw new Error("Calendário indisponível");
}

router.get("/football-schedule/:id", async (req, res) => {
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
      .filter(w => w.matches.length > 0 && w.matches.every(m => parseDate(m.date) <= today && m.status !== "Not Started"))
      .slice(-3);
    const nextWeek = weeks.find(w => w.matches.some(m => m.status === "Not Started" || parseDate(m.date) >= today)) ?? null;
    res.json({ ...meta, recentWeeks, nextWeek });
  } catch {
    res.status(500).json({ error: "Calendário de futebol indisponível" });
  }
});


// ─── Football Match Stats ──────────────────────────────────────────────────────

type FootballMatchStatsPlayer = {
  id: string; name: string; number: string; pos: string;
  formation_pos?: string;
  // player_stats fields (optional — only in player_stats section)
  acc_crosses?: string; aerials_won?: string; assists?: string;
};
type FootballMatchStatsSub = {
  minute: string;
  player_on: string; player_on_id: string;
  player_off: string; player_off_id: string;
  injury: string;
};
type FootballMatchStatsTeamColors = {
  player: { primary: { color: string }; number: { color: string }; border: { color: string } };
  goalkeeper: { primary: { color: string }; number: { color: string }; border: { color: string } };
};
type FootballMatchStatsEventGoal = {
  minute: string; extra_min: string;
  player_id: string; player_name: string;
  assist_player_id: string; assist_player_name: string;
  own_goal: string; penalty: string; penalty_missed: string; var_cancelled: string;
};
type FootballMatchStatsEventCard = { minute: string; extra_min: string; comment?: string; player_id: string; player_name: string };
type FootballMatchStatsEventVar  = { minute: string; extra_min: string; player_id: string; player_name: string; event_type: string; ref_decision: string; var_decision: string };

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
          time?: { name: string; added_time_period_1: string; added_time_period_2: string };
          referee?: { name: string };
        };
        home: { id: string; name: string; goals: string };
        away: { id: string; name: string; goals: string };
        ht?: { home_goals: string; away_goals: string } | null;
        ft?: { home_goals: string; away_goals: string } | null;
        et?: { home_goals: string; away_goals: string } | null;
        penalties?: { home_pen: string; away_pen: string } | null;
        lineups?: {
          home?: { formation: string; player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] };
          away?: { formation: string; player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] };
        };
        bench?: {
          home?: { player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] };
          away?: { player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] };
        };
        substitutions?: {
          home?: { substitution: FootballMatchStatsSub | FootballMatchStatsSub[] };
          away?: { substitution: FootballMatchStatsSub | FootballMatchStatsSub[] };
        };
        team_colors?: { home: FootballMatchStatsTeamColors; away: FootballMatchStatsTeamColors };
        team_stats?: {
          home?: { corners?: { total: string; total_h1: string; total_h2: string }; expected_goals?: { total: string; total_h1: string; total_h2: string }; fouls?: { total: string } };
          away?: { corners?: { total: string; total_h1: string; total_h2: string }; expected_goals?: { total: string; total_h1: string; total_h2: string }; fouls?: { total: string } };
        };
        player_stats?: {
          home?: { player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] };
          away?: { player: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] };
        };
        event_summary?: {
          home?: {
            goals?: { event: FootballMatchStatsEventGoal | FootballMatchStatsEventGoal[] };
            yellowcards?: { event: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] };
            redcards?: { event: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] } | string;
            var?: { event: FootballMatchStatsEventVar | FootballMatchStatsEventVar[] } | string;
          };
          away?: {
            goals?: { event: FootballMatchStatsEventGoal | FootballMatchStatsEventGoal[] };
            yellowcards?: { event: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] };
            redcards?: { event: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] } | string;
            var?: { event: FootballMatchStatsEventVar | FootballMatchStatsEventVar[] } | string;
          };
        };
      };
    };
  };
};

const footballMatchStatsCache = new Map<string, { data: unknown; fetchedAt: number }>();
const FOOTBALL_MATCH_STATS_TTL = 5 * 60 * 1000;

function normMatchStatsList<T>(raw: T | T[] | undefined | null): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function getFootballMatchStats(leagueId: string): Promise<object> {
  const cached = footballMatchStatsCache.get(leagueId);
  if (cached) return cached.data as object;
  throw new Error("Estatísticas indisponíveis");
}

router.get("/football-match-stats/:leagueId", async (req, res) => {
  const leagueId = String(req.params["leagueId"]);
  try {
    const stats = await getFootballMatchStats(leagueId);
    res.json(stats);
  } catch {
    res.status(500).json({ error: "Estatísticas do jogo indisponíveis" });
  }
});

// ─── Football Standings ────────────────────────────────────────────────────────

type FootballStandingsTeamRaw = {
  position: string; name: string; id: string; status: string; recent_form: string;
  overall?: { games_played: string; wins: string; draws: string; losses: string; goals_scored: string; goals_allowed: string };
  home?:    { games_played: string; wins: string; draws: string; losses: string; goals_scored: string; goals_allowed: string };
  away?:    { games_played: string; wins: string; draws: string; losses: string; goals_scored: string; goals_allowed: string };
  total?:   { goal_difference: string; points: string };
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
  position: number; name: string; id: string;
  status: string; recentForm: string;
  gp: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
  home: { gp: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  away: { gp: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  description: string;
};

const footballStandingsCache = new Map<string, { data: FootballStandingsTeam[]; meta: { id: string; league: string; season: string; country: string }; fetchedAt: number }>();
const FOOTBALL_STANDINGS_TTL = 5 * 60 * 1000;

async function getFootballStandings(leagueId: string): Promise<{ teams: FootballStandingsTeam[]; meta: { id: string; league: string; season: string; country: string } }> {
  const cached = footballStandingsCache.get(leagueId);
  if (cached) return { teams: cached.data, meta: cached.meta };
  throw new Error("Classificação indisponível");
}

router.get("/football-standings/:id", async (req, res) => {
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
  id: string; name: string; number: string; age: string; position: string;
  injured: string; is_captain: string;
  appearences: string;       // API typo (double 'e') — intentional
  lineups: string; minutes_played: string; substitute_in: string; substitute_out?: string; substitutes_on_bench?: string;
  goals: string; assists: string; rating: string;
  yellowcards: string; yellowred: string; redcards: string;
  saves: string; goals_conceded: string; inside_box_saves: string; penalties_saved: string;
  shots_total: string; shots_on: string; shots_woodwork: string;
  pass_attempts: string; pass_success: string; key_passes: string;
  dribble_attempts: string; dribble_success: string; dispossesed: string;
  duels_total: string; duels_won: string;
  fouls_committed: string; fouls_drawn: string;
  tackles: string; blocks: string; clearances: string; interceptions: string;
  crosses_total: string; crosses_accurate: string;
  aerials_won?: string;
  penalties_scored: string; penalties_missed: string; penalties_committed: string; penalties_won: string;
};

type FootballLeagueStatsTeamRaw = {
  id: string; name: string;
  venue?: { id: string; name: string };
  coach?: { id: string; name: string };
  squad?: { player: FootballLeagueStatsPlayerRaw | FootballLeagueStatsPlayerRaw[] };
};

type FootballLeagueStatsRaw = {
  league_stats?: {
    updated?: string;
    updated_ts?: string;   // string in this endpoint (unlike others)
    league?: {
      id: string; name: string; country: string;
      team: FootballLeagueStatsTeamRaw | FootballLeagueStatsTeamRaw[];
    };
  };
};

type FootballLeagueStatsPlayer = {
  id: string; name: string; number: string; age: number; position: string;
  injured: boolean; isCaptain: boolean;
  appearances: number; lineups: number; minutesPlayed: number;
  subIn: number;
  goals: number; assists: number; rating: number;
  yellowCards: number; yellowRed: number; redCards: number;
  saves: number; goalsConceded: number; insideBoxSaves: number; penaltiesSaved: number;
  shotsTotal: number; shotsOn: number; shotsWoodwork: number;
  passAttempts: number; passSuccess: number; keyPasses: number;
  dribbleAttempts: number; dribbleSuccess: number;
  duelsTotal: number; duelsWon: number;
  foulsCommitted: number; foulsDrawn: number;
  tackles: number; blocks: number; clearances: number; interceptions: number;
  crossesTotal: number; crossesAccurate: number;
  penaltiesScored: number; penaltiesMissed: number;
};

type FootballLeagueStatsTeam = {
  id: string; name: string;
  venue: { id: string; name: string } | null;
  coach: { id: string; name: string } | null;
  players: FootballLeagueStatsPlayer[];
};

const footballLeagueStatsCache = new Map<string, { data: FootballLeagueStatsTeam[]; meta: { id: string; name: string; country: string }; fetchedAt: number }>();
const FOOTBALL_LEAGUE_STATS_TTL = 30 * 60 * 1000; // 30 min — changes infrequently

function parseFootballStatsPlayer(p: FootballLeagueStatsPlayerRaw): FootballLeagueStatsPlayer {
  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
  return {
    id: p.id, name: p.name, number: p.number, age: pi(p.age), position: p.position,
    injured: p.injured === "True", isCaptain: p.is_captain === "True",
    appearances: pi(p.appearences),  // map API typo to correct spelling
    lineups: pi(p.lineups), minutesPlayed: pi(p.minutes_played), subIn: pi(p.substitute_in),
    goals: pi(p.goals), assists: pi(p.assists), rating: pf(p.rating),
    yellowCards: pi(p.yellowcards), yellowRed: pi(p.yellowred), redCards: pi(p.redcards),
    saves: pi(p.saves), goalsConceded: pi(p.goals_conceded), insideBoxSaves: pi(p.inside_box_saves), penaltiesSaved: pi(p.penalties_saved),
    shotsTotal: pi(p.shots_total), shotsOn: pi(p.shots_on), shotsWoodwork: pi(p.shots_woodwork),
    passAttempts: pi(p.pass_attempts), passSuccess: pi(p.pass_success), keyPasses: pi(p.key_passes),
    dribbleAttempts: pi(p.dribble_attempts), dribbleSuccess: pi(p.dribble_success),
    duelsTotal: pi(p.duels_total), duelsWon: pi(p.duels_won),
    foulsCommitted: pi(p.fouls_committed), foulsDrawn: pi(p.fouls_drawn),
    tackles: pi(p.tackles), blocks: pi(p.blocks), clearances: pi(p.clearances), interceptions: pi(p.interceptions),
    crossesTotal: pi(p.crosses_total), crossesAccurate: pi(p.crosses_accurate),
    penaltiesScored: pi(p.penalties_scored), penaltiesMissed: pi(p.penalties_missed),
  };
}

async function getFootballLeagueStats(leagueId: string): Promise<{ teams: FootballLeagueStatsTeam[]; meta: { id: string; name: string; country: string } }> {
  const cached = footballLeagueStatsCache.get(leagueId);
  if (cached) return { teams: cached.data, meta: cached.meta };
  throw new Error("Estatísticas indisponíveis");
}

router.get("/football-league-stats/:id", async (req, res) => {
  const id = String(req.params["id"]);
  try {
    const { teams, meta } = await getFootballLeagueStats(id);
    res.json({ ...meta, teams });
  } catch {
    res.status(500).json({ error: "Estatísticas da liga de futebol indisponíveis" });
  }
});

// ─── Football Head-to-Head ─────────────────────────────────────────────────────

type H2HMatchRaw = {
  main_id: string; fallback_id_1?: string;
  country: string; league: string; league_id: string; date: string;
  team1_name: string; team2_name: string;
  team1_id: string; team2_id: string;
  team1_score: string; team2_score: string;
};

type FootballH2HRaw = {
  "head-to-head"?: {
    team1_id: string; team2_id: string;
    recent_meetings?: { match: H2HMatchRaw | H2HMatchRaw[] };
    overall_record?: {
      total?: { total: Record<string, string>[] };
      home?: { team1: Record<string, string>[]; team2: Record<string, string>[] };
      away?: { team1: Record<string, string>[]; team2: Record<string, string>[] };
    };
    leagues?: { league: H2HLeagueRaw | H2HLeagueRaw[] };
    goals?: {
      total?: { total: Record<string, string>[] };
      home?: { home: Record<string, string>[] };
      away?: { away: Record<string, string>[] };
    };
    biggest_victory?: { team1?: { match: H2HMatchRaw }; team2?: { match: H2HMatchRaw } };
    biggest_defeat?:  { team1?: { match: H2HMatchRaw }; team2?: { match: H2HMatchRaw } };
    last5_home?: { team1?: { match: H2HMatchRaw | H2HMatchRaw[] }; team2?: { match: H2HMatchRaw | H2HMatchRaw[] } };
    last5_away?: { team1?: { match: H2HMatchRaw | H2HMatchRaw[] }; team2?: { match: H2HMatchRaw | H2HMatchRaw[] } };
  };
};

type H2HLeagueRaw = { name: string; id: string; games: string; team1_won: string; team2_won: string; draw: string };

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
    id: m.main_id, country: m.country, league: m.league, leagueId: m.league_id, date: m.date,
    team1: { id: m.team1_id, name: m.team1_name, score: parseInt(m.team1_score) || 0 },
    team2: { id: m.team2_id, name: m.team2_name, score: parseInt(m.team2_score) || 0 },
  };
}

const footballH2HCache = new Map<string, { data: object; fetchedAt: number }>();
const FOOTBALL_H2H_TTL = 10 * 60 * 1000; // 10 min

async function getFootballH2H(team1: string, team2: string): Promise<object> {
  const key = `${team1}-${team2}`;
  const cached = footballH2HCache.get(key);
  if (cached) return cached.data;
  throw new Error("H2H indisponível");
}

router.get("/football-h2h", async (req, res) => {
  const team1 = String(req.query["team1"] ?? "");
  const team2 = String(req.query["team2"] ?? "");
  if (!team1 || !team2) { res.status(400).json({ error: "Parâmetros team1 e team2 são obrigatórios" }); return; }
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
  to_miss?:    { player: FootballInjuryPlayerRaw | FootballInjuryPlayerRaw[] };
  questionable?: { player: FootballInjuryPlayerRaw | FootballInjuryPlayerRaw[] };
};
type FootballInjuryTeamRaw = {
  id: string; name: string;
  sidelined?: FootballInjurySidelinedRaw;
};
type FootballInjuryMatchRaw = {
  main_id: string; fallback_id_1?: string; fallback_id_2?: string; fallback_id_3?: string;
  date: string; time: string;
  home: FootballInjuryTeamRaw;
  away: FootballInjuryTeamRaw;
};
type FootballInjuryLeagueRaw = {
  id: string; name: string; sub_id?: string;
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
  id: string; name: string;
  toMiss: FootballInjuryPlayer[];
  questionable: FootballInjuryPlayer[];
};
type FootballInjuryMatch = {
  id: string; date: string; time: string;
  home: FootballInjuryTeam;
  away: FootballInjuryTeam;
};
type FootballInjuryLeague = {
  id: string; name: string;
  matches: FootballInjuryMatch[];
};

let footballInjuriesCache: FootballInjuryLeague[] | null = null;
let footballInjuriesFetchedAt = 0;
const FOOTBALL_INJURIES_TTL = 15 * 60 * 1000; // 15 min

function parseInjuryPlayers(raw: FootballInjuryPlayerRaw | FootballInjuryPlayerRaw[] | undefined): FootballInjuryPlayer[] {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map(p => ({ id: p.id, name: p.name, status: p.status }));
}

function parseInjuryTeam(t: FootballInjuryTeamRaw): FootballInjuryTeam {
  return {
    id: t.id, name: t.name,
    toMiss:      parseInjuryPlayers(t.sidelined?.to_miss?.player),
    questionable: parseInjuryPlayers(t.sidelined?.questionable?.player),
  };
}

async function getFootballInjuries(): Promise<FootballInjuryLeague[]> {
  return footballInjuriesCache ?? [];
}

router.get("/football-injuries", async (_req, res) => {
  try {
    const leagues = await getFootballInjuries();
    res.json({ leagues });
  } catch {
    res.status(500).json({ error: "Lesões de futebol indisponíveis" });
  }
});

// ─── Football Team Profile ─────────────────────────────────────────────────────

type FootballTeamPlayerRaw = {
  id: string; name: string; number: string; age: string; position: string;
  is_captain: string; injured: string;
  minutes_played: string; starting_lineups: string; substitute_in: string; substitute_out: string; on_bench: string;
  appearences: string; assists: string; goals: string; rating: string;
  yellowcards: string; yellowred: string; redcards: string;
  saves: string; goals_conceded: string; inside_box_saves: string; pen_saved: string;
  shots_total: string; shots_on_target: string; shots_woodwork: string;
  pass_attempts: string; pass_success: string; key_passes: string;
  dribble_attempts: string; dribble_success: string; dispossesed: string;
  duels_total: string; duels_won: string;
  fouls_committed: string; fouls_drawn: string;
  tackles: string; blocks: string; clearances: string; interceptions: string;
  crosses_total: string; crosses_accurate: string;
  pen_scored: string; pen_missed: string; pen_committed: string; pen_won: string;
};

type FootballTeamTransferPlayerRaw = {
  id: string; name: string; date: string; age?: string; position?: string;
  from?: string; to?: string; team_id?: string; type: string; price?: string;
};

type FootballTeamTrophyRaw = {
  country: string; league: string; status: string; count: string; seasons: string;
};

type FootballTeamPeriodRaw = { min: string; pct: string; count: string };

type FootballTeamLeagueStatRaw = {
  name: string; id: string; season: string;
  fulltime?:   { win: { total: string; home: string; away: string }; lost: { total: string; home: string; away: string }; draw: { total: string; home: string; away: string } };
  firsthalf?:  { win: { total: string; home: string; away: string }; lost: { total: string; home: string; away: string }; draw: { total: string; home: string; away: string } };
  secondhalf?: { win: { total: string; home: string; away: string }; lost: { total: string; home: string; away: string }; draw: { total: string; home: string; away: string } };
  scoring_minutes?:         { period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] };
  goals_conceded_minutes?:  { period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] };
  yellowcard_minutes?:      { period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] };
  redcard_minutes?:         { period: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] };
};

type FootballTeamProfileRaw = {
  updated?: string; updated_ts?: number;
  team?: {
    id: string; name: string; country: string; founded: string;
    is_national_team: string; is_women: string;
    leagues?: { league_id: string | string[] };
    venue_name?: string; venue_id?: string; venue_surface?: string;
    venue_capacity?: string; venue_address?: string; venue_city?: string;
    coach?: { name: string; id: string };
    squad?: { player: FootballTeamPlayerRaw | FootballTeamPlayerRaw[] };
    transfers?: {
      in?:  { player: FootballTeamTransferPlayerRaw | FootballTeamTransferPlayerRaw[] };
      out?: { player: FootballTeamTransferPlayerRaw | FootballTeamTransferPlayerRaw[] };
    };
    trophies?: { trophy: FootballTeamTrophyRaw | FootballTeamTrophyRaw[] };
    league_stats?: { league: FootballTeamLeagueStatRaw | FootballTeamLeagueStatRaw[] };
  };
};

const footballTeamCache = new Map<string, { data: object; fetchedAt: number }>();
const FOOTBALL_TEAM_TTL = 30 * 60 * 1000; // 30 min

function parseTeamHalfRecord(half: FootballTeamLeagueStatRaw["fulltime"]) {
  if (!half) return null;
  const pi = (s: string) => parseInt(s) || 0;
  return {
    win:  { total: pi(half.win.total),  home: pi(half.win.home),  away: pi(half.win.away) },
    lost: { total: pi(half.lost.total), home: pi(half.lost.home), away: pi(half.lost.away) },
    draw: { total: pi(half.draw.total), home: pi(half.draw.home), away: pi(half.draw.away) },
  };
}

function parseTeamPeriods(raw: FootballTeamPeriodRaw | FootballTeamPeriodRaw[] | undefined) {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map(p => ({ min: p.min, pct: p.pct, count: parseInt(p.count) || 0 }));
}

async function getFootballTeam(teamId: string): Promise<object> {
  const cached = footballTeamCache.get(teamId);
  if (cached) return cached.data;
  throw new Error("Equipa indisponível");
}

router.get("/football-team/:id", async (req, res) => {
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
  team_id: string; team_name: string; league_id: string; league: string; season: string;
  is_captain: string; minutes_played: string; appearances: string; starting_lineups: string;
  substitute_in: string; substitute_out?: string; on_bench?: string;
  assists: string; blocks: string; clearances: string;
  crosses_accurate: string; crosses_total: string; dispossesed: string;
  dribble_attempts: string; dribble_success: string;
  duels_total: string; duels_won: string;
  fouls_committed: string; fouls_drawn: string;
  goals: string; goals_conceded: string; inside_box_saves: string; interceptions: string;
  key_passes: string; pass_attempts: string; pass_success: string;
  pen_committed?: string; pen_missed: string; pen_saved?: string; pen_scored: string; pen_won?: string;
  rating: string; redcards: string; saves: string;
  shots_on_target: string; shots_total: string; shots_woodwork: string;
  tackles: string; yellowcards: string; yellowred: string;
};

// Career totals block — no `goals` field
type FootballPlayerOverallStatRaw = {
  minutes_played: string; appearances?: string; starting_lineups: string; substitute_in: string;
  assists: string; blocks: string; clearances: string;
  crosses_accurate: string; crosses_total: string; dispossesed: string;
  dribble_attempts: string; dribble_success: string;
  duels_total: string; duels_won: string;
  fouls_committed: string; fouls_drawn: string;
  goals_conceded: string; inside_box_saves?: string; interceptions: string;
  key_passes: string; pass_attempts: string; pass_success: string;
  pen_committed?: string; pen_missed: string; pen_saved?: string; pen_scored: string; pen_won?: string;
  rating: string; saves?: string;
  shots_on_target: string; shots_total: string; shots_woodwork: string;
  tackles: string;
};

type FootballPlayerProfileRaw = {
  updated?: string; updated_ts?: number;
  player?: {
    id: string; name: string; firstname: string; lastname: string;
    age: string; birthdate: string; nationality: string;
    birthplace: string; birthcountry: string;
    position: string; height: string; weight: string; preferred_foot: string;
    team: string; team_id: string; national_team_id?: string;
    market_value_eur?: string;
    club_league_statistics?: { club: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[] };
    club_domestic_cup_statistics?: { club: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[] };
    club_intl_cup_statistics?: { club: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[] };
    overall_club_statistics?: FootballPlayerOverallStatRaw;
    national_team_statistics?: unknown;
    transfers?: unknown;
    trophies?: unknown;
    sidelined_history?: unknown;
  };
};

const footballPlayerCache = new Map<string, { data: object; fetchedAt: number }>();
const FOOTBALL_PLAYER_TTL = 30 * 60 * 1000;

function parsePlayerClubStat(c: FootballPlayerClubStatRaw) {
  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
  return {
    teamId: c.team_id, teamName: c.team_name, leagueId: c.league_id, league: c.league, season: c.season,
    isCaptain: c.is_captain === "1" || c.is_captain === "True",
    minutesPlayed: pi(c.minutes_played), appearances: pi(c.appearances),
    startingLineups: pi(c.starting_lineups), subIn: pi(c.substitute_in), onBench: pi(c.on_bench),
    goals: pi(c.goals), assists: pi(c.assists), rating: pf(c.rating),
    yellowCards: pi(c.yellowcards), yellowRed: pi(c.yellowred), redCards: pi(c.redcards),
    saves: pi(c.saves), goalsConceded: pi(c.goals_conceded), insideBoxSaves: pi(c.inside_box_saves),
    penScored: pi(c.pen_scored), penMissed: pi(c.pen_missed), penSaved: pi(c.pen_saved),
    shotsTotal: pi(c.shots_total), shotsOnTarget: pi(c.shots_on_target), shotsWoodwork: pi(c.shots_woodwork),
    passAttempts: pi(c.pass_attempts), passSuccess: pi(c.pass_success), keyPasses: pi(c.key_passes),
    dribbleAttempts: pi(c.dribble_attempts), dribbleSuccess: pi(c.dribble_success),
    duelsTotal: pi(c.duels_total), duelsWon: pi(c.duels_won),
    foulsCommitted: pi(c.fouls_committed), foulsDrawn: pi(c.fouls_drawn),
    tackles: pi(c.tackles), blocks: pi(c.blocks), clearances: pi(c.clearances), interceptions: pi(c.interceptions),
    crossesTotal: pi(c.crosses_total), crossesAccurate: pi(c.crosses_accurate),
  };
}

function parsePlayerOverall(o: FootballPlayerOverallStatRaw) {
  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;
  return {
    minutesPlayed: pi(o.minutes_played), appearances: pi(o.appearances),
    startingLineups: pi(o.starting_lineups), subIn: pi(o.substitute_in),
    assists: pi(o.assists), rating: pf(o.rating),
    penScored: pi(o.pen_scored), penMissed: pi(o.pen_missed),
    shotsTotal: pi(o.shots_total), shotsOnTarget: pi(o.shots_on_target), shotsWoodwork: pi(o.shots_woodwork),
    passAttempts: pi(o.pass_attempts), passSuccess: pi(o.pass_success), keyPasses: pi(o.key_passes),
    dribbleAttempts: pi(o.dribble_attempts), dribbleSuccess: pi(o.dribble_success),
    duelsTotal: pi(o.duels_total), duelsWon: pi(o.duels_won),
    foulsCommitted: pi(o.fouls_committed), foulsDrawn: pi(o.fouls_drawn),
    tackles: pi(o.tackles), blocks: pi(o.blocks), clearances: pi(o.clearances), interceptions: pi(o.interceptions),
    crossesTotal: pi(o.crosses_total), crossesAccurate: pi(o.crosses_accurate),
  };
}

function toClubStats(raw: FootballPlayerClubStatRaw | FootballPlayerClubStatRaw[] | undefined) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(parsePlayerClubStat);
}

async function getFootballPlayer(playerId: string): Promise<object> {
  const cached = footballPlayerCache.get(playerId);
  if (cached) return cached.data;
  throw new Error("Jogador indisponível");
}

router.get("/football-player/:id", async (req, res) => {
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
  updated?: string; updated_ts?: number;
  coach?: {
    id: string; name: string; firstname: string; lastname: string;
    team: string; team_id: string;
    nationality: string; birthdate: string; age: string;
    birthcountry: string; birthplace: string;
    height: string;  // "180 cm" — includes unit
    weight: string;  // "70 kg"  — includes unit
    trophies?: { trophy: FootballTeamTrophyRaw | FootballTeamTrophyRaw[] };
    career_stats?: { team: { name: string; id: string; from: string; to: string } | { name: string; id: string; from: string; to: string }[] };
  };
};

const footballCoachCache = new Map<string, { data: object; fetchedAt: number }>();
const FOOTBALL_COACH_TTL = 30 * 60 * 1000;

async function getFootballCoach(coachId: string): Promise<object> {
  const cached = footballCoachCache.get(coachId);
  if (cached) return cached.data;
  throw new Error("Treinador indisponível");
}

router.get("/football-coach/:id", async (req, res) => {
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

router.get("/football-image", (_req, res) => {
  res.status(404).json({ error: "Imagens indisponíveis" });
});

// ─── Football Pre-match Odds (per league, v2) ──────────────────────────────────
// v2/soccer/leagues/{id}/odds/prematch — market "1x2" with bookmaker array
// Distinct from getOddsMap() which uses v1/soccer/odds/{country} for live cards.

type FootballOddsBookmakerRaw = {
  id: string; name: string; timestamp: string; stop?: string;
  odd: { name: string; value: string }[];
};
type FootballOddsMarketRaw = {
  id: string; name: string; stop: string;
  bookmaker: FootballOddsBookmakerRaw | FootballOddsBookmakerRaw[];
};
type FootballOddsMatchRaw = {
  main_id: string; fallback_id_1?: string; fallback_id_2?: string; fallback_id_3?: string;
  date: string; time: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  odds: FootballOddsMarketRaw | FootballOddsMarketRaw[];
};
type FootballPrematchOddsRaw = {
  prematch_odds?: {
    updated?: string; updated_ts?: number;
    league?: {
      id: string; name: string; country: string;
      match: FootballOddsMatchRaw | FootballOddsMatchRaw[];
    };
  };
};

type FootballOddsEntry = {
  matchId: string;
  date: string; time: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeOdds: number; drawOdds: number; awayOdds: number;
};

const footballOddsCache = new Map<string, { data: FootballOddsEntry[]; meta: { id: string; name: string; country: string }; fetchedAt: number }>();
const FOOTBALL_ODDS_TTL = 5 * 60 * 1000;

async function getFootballLeagueOdds(leagueId: string): Promise<{ odds: FootballOddsEntry[]; meta: { id: string; name: string; country: string } }> {
  const cached = footballOddsCache.get(leagueId);
  if (cached) return { odds: cached.data, meta: cached.meta };
  throw new Error("Odds indisponíveis");
}

router.get("/football-odds/:leagueId", async (req, res) => {
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

type FootballLiveOddsMatchRaw = {
  match_info?: {
    name: string; main_id: string;
    fallback_id_1?: string; fallback_id_2?: string; fallback_id_3?: string;
    league_id: string; league: string;
    start_date: string; start_time: string; start_ts: number; start_ts_utc: number;
    score: string;       // "1:1"
    period: string;      // "2nd Half"
    minute: string;      // "67"
    seconds: string;     // "67:23"
    state_code?: string; state_name?: string; state_details?: string;
    ball_pos?: string;   // "0.38,0.25"
  };
  status?: {
    stopped: string; blocked: string; finished: string;
    updated: string; updated_ts: string;  // milliseconds as string
  };
  team_info?: {
    home?: { name: string; id: string; score: string; kit_color?: string };
    away?: { name: string; id: string; score: string; kit_color?: string };
  };
  stats?: Record<string, { name: string; home: string; away: string }>;
  match_events?: unknown[];
  odds?: unknown[];
};

type FootballLiveOddsRaw = {
  updated?: string;
  updated_ts?: number;   // milliseconds
  live_matches?: FootballLiveOddsMatchRaw[];
};

let footballLiveOddsCache: object[] | null = null;
let footballLiveOddsFetchedAt = 0;
const FOOTBALL_LIVE_ODDS_TTL = 10 * 1000; // 10s — in-play data, very fresh

async function getFootballLiveOdds(): Promise<object[]> {
  return footballLiveOddsCache ?? [];
}

router.get("/football-live-odds", async (_req, res) => {
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

router.get("/football-live-markets", async (_req, res) => {
  res.json({ markets: footballLiveMarketsCache ?? [] });
});

// ─── Football Live Match States catalogue ─────────────────────────────────────
// v2/soccer/odds/live/match-states — bare array root, same shape as live/markets
// Provides human-readable labels for state_code values in football-live-odds.

let footballLiveStatesCache: { id: number; name: string }[] | null = null;
let footballLiveStatesFetchedAt = 0;
const FOOTBALL_LIVE_STATES_TTL = 60 * 60 * 1000; // 1h — static catalogue

router.get("/football-live-match-states", async (_req, res) => {
  res.json({ states: footballLiveStatesCache ?? [] });
});

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
  id: string; type: string; team: string; minute: string; extra_min: string;
  player: string; playerid: string;
  assist: string; assistid: string;
  result: string;   // "[0 - 1]"
};
type V1SoccerTeam = { id: string; name: string; goals: string; agg: string };
type V1SoccerMatch = {
  id: string; alternate_id: string; alternate_id_2: string; static_id: string;
  status: string; date: string; time: string; venue: string; commentary: string;
  inj_minute: string; inj_time: string;
  home: V1SoccerTeam; away: V1SoccerTeam;
  events?: { event?: V1SoccerEvent | V1SoccerEvent[] };
  ht?: { score: string };   // "[0-2]"
  ft?: { score: string };   // "[0-4]"
};
type V1SoccerLeague = {
  id: string; name: string; country: string; cup: string; sub_id: string;
  match: V1SoccerMatch | V1SoccerMatch[];
};
type V1SoccerLivescoresRaw = {
  livescore?: {
    updated?: string; sport?: string;
    league?: V1SoccerLeague | V1SoccerLeague[];
  };
};

// Parse "[0-2]" or "[0 - 2]" → { home: 0, away: 2 }
function parseScoreStr(s: string | undefined): { home: number; away: number } | null {
  if (!s) return null;
  const m = s.replace(/[\[\] ]/g, "").split("-");
  if (m.length < 2) return null;
  const h = parseInt(m[0] ?? "");
  const a = parseInt(m[1] ?? "");
  return isNaN(h) || isNaN(a) ? null : { home: h, away: a };
}

let footballV1LiveCache: object[] | null = null;
let footballV1LiveFetchedAt = 0;
const FOOTBALL_V1_LIVE_TTL = 30 * 1000;

router.get("/football-livescores", async (_req, res) => {
  res.json({ leagues: footballV1LiveCache ?? [] });
});

// ─── Football Daily Results (v1) ──────────────────────────────────────────────
// v1/soccer/daily/{d-N} — identical structure to v1/soccer/livescores.
// Offset format: "d-1" = yesterday, "d-7" = 7 days ago (accepts integer 1–7).
// Distinct from football-results which uses v2/soccer/matches/daily?offset=-1.
// Cache: 5 min for d-1 (may still be updating), 30 min for d-2+ (fully settled).

const footballDailyCache = new Map<string, { data: object[]; fetchedAt: number }>();

router.get("/football-daily/:offset", async (req, res) => {
  const raw = String(req.params["offset"]);
  const n = parseInt(raw);
  if (isNaN(n) || n < 0 || n > 7) { res.status(400).json({ error: "Offset inválido (0–7)" }); return; }
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
  id: string; alternate_id: string; alternate_id_2: string; static_id: string;
  status: string; date: string; time: string; venue: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  tv_stations?: { tv?: V1UpcomingTV | V1UpcomingTV[] };
};
type V1UpcomingLeague = {
  id: string; name: string; country: string; sub_id: string;
  // no "cup" field in upcoming-schedule
  match: V1UpcomingMatch | V1UpcomingMatch[];
};
type V1UpcomingScheduleRaw = {
  fixtures?: {
    updated?: string; sport?: string; country?: string;
    league?: V1UpcomingLeague | V1UpcomingLeague[];
  };
};

const footballUpcomingCache = new Map<string, { data: object[]; fetchedAt: number }>();
const FOOTBALL_UPCOMING_TTL = 30 * 60 * 1000; // 30 min — fixtures rarely change

router.get("/football-upcoming/:country", async (req, res) => {
  const country = String(req.params["country"]).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!country) { res.status(400).json({ error: "País inválido" }); return; }
  const cached = footballUpcomingCache.get(country);
  res.json({ leagues: cached?.data ?? [] });
});

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
  id: string; name: string;
  score: string; ft_score: string; et_score: string; pen_score: string;
};
type V1ExtMatch = {
  id: string; alternate_id: string; alternate_id_2: string; static_id: string;
  status: string; date: string; time: string;
  venue: string; venue_city: string; venue_id: string;
  attendance: string;
  home: V1ExtTeamScore; away: V1ExtTeamScore;
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
  id: string; name: string; season: string; sub_id: string;
  // no "country" or "cup" at league level
  week: V1ExtWeek | V1ExtWeek[];
};
type V1ExtScheduleRaw = {
  extended_fixtures?: {
    updated?: string; sport?: string; country?: string;
    league?: V1ExtLeague | V1ExtLeague[];
  };
};

const footballExtCache = new Map<string, { data: object[]; fetchedAt: number }>();
const FOOTBALL_EXT_TTL = 30 * 60 * 1000; // 30 min

// Parse score string — empty string → null, otherwise number
function parseExtScore(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

router.get("/football-extended-schedule/:country", async (req, res) => {
  const country = String(req.params["country"]).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!country) { res.status(400).json({ error: "País inválido" }); return; }
  const cached = footballExtCache.get(country);
  res.json({ leagues: cached?.data ?? [] });
});

// ─── Football Results by country/region ───────────────────────────────────────
// v1/soccer/results/{country} — same week[] structure as extended-schedule but
// lineups/goals/substitutions are populated (not null) for finished matches.
// Root: "results" (4th distinct root key in football v1 endpoints).
// halftime.score: "0 - 0" (spaces, no brackets) — parseScoreStr handles both formats.
// goals.goal / lineups.*.player / substitutions.*.substitution: single obj or array.

type V1ResultsGoal = {
  minute: string; player: string; playerid: string;
  assist: string; score: string; team: string;
};
type V1ResultsLineupPlayer = {
  id: string; name: string; number: string; booking: string;
};
type V1ResultsSubstitution = {
  minute: string;
  player_in_id: string; player_in_name: string; player_in_number: string; player_in_booking: string;
  player_out_id: string; player_out_name: string;
};
type V1ResultsMatch = {
  id: string; alternate_id: string; alternate_id_2: string; static_id: string;
  status: string; date: string; time: string;
  venue: string; venue_city: string; venue_id: string; attendance: string;
  home: V1ExtTeamScore; away: V1ExtTeamScore;
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
type V1ResultsWeek = { number: string; match: V1ResultsMatch | V1ResultsMatch[] };
type V1ResultsLeague = {
  id: string; name: string; season: string; sub_id: string;
  week: V1ResultsWeek | V1ResultsWeek[];
};
type V1ResultsRaw = {
  results?: {
    updated?: string; sport?: string; country?: string;
    league?: V1ResultsLeague | V1ResultsLeague[];
  };
};

const footballResultsCountryCache = new Map<string, { data: object[]; fetchedAt: number }>();
const FOOTBALL_RESULTS_COUNTRY_TTL = 30 * 60 * 1000; // 30 min — historical results

function toArr<T>(v: T | T[] | null | undefined): T[] {
  return !v ? [] : Array.isArray(v) ? v : [v];
}

router.get("/football-results-country/:country", async (req, res) => {
  const country = String(req.params["country"]).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!country) { res.status(400).json({ error: "País inválido" }); return; }
  const cached = footballResultsCountryCache.get(country);
  res.json({ leagues: cached?.data ?? [] });
});

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
  id: string; name: string; minute: string; extra_min: string;
  assist_id: string; assist_name: string;
  owngoal: string; penalty: string; penalty_missed: string; var_cancelled: string;
};
type V1LiveStatsCard = {
  id: string; name: string; minute: string; extra_min: string; comment: string;
};
type V1LiveStatsVar = {
  id: string; name: string; minute: string; extra_min: string;
  event_type: string; ref_decision: string; var_decision: string;
};
type V1LiveStatsSummaryTeam = {
  goals?:       null | { player?: V1LiveStatsSummaryGoal | V1LiveStatsSummaryGoal[] };
  yellowcards?: null | { player?: V1LiveStatsCard | V1LiveStatsCard[] };
  redcards?:    null | { player?: V1LiveStatsCard | V1LiveStatsCard[] };
  var?:         null | { player?: V1LiveStatsVar  | V1LiveStatsVar[] };
};
type V1LiveStatsTeam = {
  id: string; name: string;
  goals: string; ft_score: string; ht_score: string; et_score: string; pen_score: string;
};
type V1LiveStatsMatch = {
  id: string; alternate_id: string; alternate_id_2: string; static_id: string;
  status: string; date: string; time: string; timer: string;
  home: V1LiveStatsTeam; away: V1LiveStatsTeam;
  matchinfo?: {
    stadium?:    { name?: string };
    attendance?: { name?: string };
    time?:       { name?: string; addedtime_period1?: string; addedtime_period2?: string };
    referee?:    { name?: string };
  };
  summary?: {
    home?: V1LiveStatsSummaryTeam;
    away?: V1LiveStatsSummaryTeam;
  };
};
type V1LiveStatsLeague = {
  id: string; name: string; country: string; sub_id: string;
  match: V1LiveStatsMatch;   // always single object
};
type V1LiveStatsRaw = {
  commentaries?: {
    updated?: string; sport?: string; country?: string;
    league?: V1LiveStatsLeague;   // always single object
  };
};

function parseBool(s: string | undefined): boolean { return s === "True"; }

function mapSummaryGoals(raw: V1LiveStatsSummaryTeam["goals"]): object[] {
  return toArr(raw?.player).map(g => ({
    id: g.id, name: g.name, minute: g.minute, extraMin: g.extra_min || null,
    assistId: g.assist_id || null, assistName: g.assist_name || null,
    ownGoal: parseBool(g.owngoal), penalty: parseBool(g.penalty),
    penaltyMissed: parseBool(g.penalty_missed), varCancelled: parseBool(g.var_cancelled),
  }));
}
function mapCards(raw: V1LiveStatsSummaryTeam["yellowcards"]): object[] {
  return toArr(raw?.player).map(c => ({
    id: c.id, name: c.name, minute: c.minute, extraMin: c.extra_min || null, comment: c.comment || null,
  }));
}
function mapVar(raw: V1LiveStatsSummaryTeam["var"]): object[] {
  return toArr(raw?.player).map(v => ({
    id: v.id, name: v.name, minute: v.minute, extraMin: v.extra_min || null,
    eventType: v.event_type, refDecision: v.ref_decision, varDecision: parseBool(v.var_decision),
  }));
}

const footballLiveStatsCache = new Map<string, { data: object; fetchedAt: number }>();
const FOOTBALL_LIVE_STATS_TTL = 30 * 1000; // 30s — live data

router.get("/football-live-match-stats/:leagueSlug", async (req, res) => {
  const slug = String(req.params["leagueSlug"]).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!slug) { res.status(400).json({ error: "Slug inválido" }); return; }
  const cached = footballLiveStatsCache.get(slug);
  if (cached) { res.json(cached.data); return; }
  res.status(404).json({ error: "Dados ao vivo indisponíveis" });
});

// ─── Football Standings by country/region (v1) ────────────────────────────────
// v1/soccer/standings/{country} — multiple leagues per country, each with team[].
// Root: "standings" (6th distinct root key in football v1 endpoints).
// Distinct from /football-standings/:id which uses v2/soccer/leagues/{id}/standings.
// New fields: is_current ("True"/"False"), status ("same"/"up"/"down"),
//   overall/home/away splits, totals.goal_difference/points, special.name (zone label).
// home/away have an undocumented "p" field (ignored in output).

type V1StandingsRecord = {
  draw: string; goals_allowed: string; goals_scored: string;
  lose: string; played: string; win: string; p?: string;
};
type V1StandingsTeam = {
  id: string; name: string; position: string;
  recent_form: string; status: string;
  overall: V1StandingsRecord;
  home: V1StandingsRecord;
  away: V1StandingsRecord;
  totals: { goal_difference: string; points: string };
  special?: { name?: string };
};
type V1StandingsLeague = {
  id: string; name: string; country: string; season: string; sub_id: string;
  is_current: string;   // "True"/"False"
  team: V1StandingsTeam | V1StandingsTeam[];
};
type V1StandingsRaw = {
  standings?: {
    country?: string; updated?: string; sport?: string;
    league?: V1StandingsLeague | V1StandingsLeague[];
  };
};

function mapRecord(r: V1StandingsRecord) {
  return {
    played:       parseInt(r.played)       || 0,
    win:          parseInt(r.win)          || 0,
    draw:         parseInt(r.draw)         || 0,
    lose:         parseInt(r.lose)         || 0,
    goalsScored:  parseInt(r.goals_scored) || 0,
    goalsAllowed: parseInt(r.goals_allowed)|| 0,
  };
}

const footballStandingsCountryCache = new Map<string, { data: object[]; fetchedAt: number }>();
const FOOTBALL_STANDINGS_COUNTRY_TTL = 30 * 60 * 1000; // 30 min

router.get("/football-standings-country/:country", async (req, res) => {
  const country = String(req.params["country"]).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!country) { res.status(400).json({ error: "País inválido" }); return; }
  const cached = footballStandingsCountryCache.get(country);
  res.json({ leagues: cached?.data ?? [] });
});

// ─── Football Scoring Leaders by country ──────────────────────────────────────
// v1/soccer/scoring-leaders/{country} — top scorers per league per country.
// Root: "scorers" (7th distinct root key in football v1 endpoints).
// League has player[] directly (not match[]/team[]). All numeric fields are strings.
// Fields: pos (rank), goals, penalty_goals, team name + team_id.

type V1ScorerPlayer = {
  id: string; name: string; pos: string;
  goals: string; penalty_goals: string;
  team: string; team_id: string;
};
type V1ScorerLeague = {
  id: string; name: string; country: string; sub_id: string;
  player: V1ScorerPlayer | V1ScorerPlayer[];
};
type V1ScorersRaw = {
  scorers?: {
    updated?: string; sport?: string; country?: string;
    league?: V1ScorerLeague | V1ScorerLeague[];
  };
};

const footballScorersCache = new Map<string, { data: object[]; fetchedAt: number }>();
const FOOTBALL_SCORERS_TTL = 30 * 60 * 1000; // 30 min — changes at most daily

router.get("/football-scoring-leaders/:country", async (req, res) => {
  const country = String(req.params["country"]).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!country) { res.status(400).json({ error: "País inválido" }); return; }
  const cached = footballScorersCache.get(country);
  res.json({ leagues: cached?.data ?? [] });
});

// ─── Football Injuries/Suspensions (v1) ───────────────────────────────────────
// v1/soccer/injuries — global (no country param), same root "injuries_suspensions"
// and same sidelined structure as v2/soccer/injuries-suspensions (used by
// /football-injuries). Differences in match object:
//   v2: main_id (not id), no goals/status/alternate_id/static_id
//   v1: id + alternate_id + alternate_id_2 + static_id + goals:"?" + status (time)
// Reuses FootballInjuryPlayerRaw, FootballInjurySidelinedRaw, parseInjuryPlayers,
// parseInjuryTeam helpers already defined above.

type V1InjuryTeamRaw = {
  id: string; name: string; goals: string;   // "?" when upcoming
  sidelined?: FootballInjurySidelinedRaw;
};
type V1InjuryMatchRaw = {
  id: string; alternate_id: string; alternate_id_2: string; static_id: string;
  date: string; time: string; status: string;  // kickoff time e.g. "06:00"
  home: V1InjuryTeamRaw; away: V1InjuryTeamRaw;
};
type V1InjuryLeagueRaw = {
  id: string; name: string; sub_id: string;
  // no "country" field at league level in v1
  match: V1InjuryMatchRaw | V1InjuryMatchRaw[];
};
type V1InjuriesRaw = {
  injuries_suspensions?: {
    updated?: string; sport?: string;
    league?: V1InjuryLeagueRaw | V1InjuryLeagueRaw[];
  };
};

let footballInjuriesV1Cache: object[] | null = null;
let footballInjuriesV1FetchedAt = 0;
const FOOTBALL_INJURIES_V1_TTL = 15 * 60 * 1000; // 15 min — same as v2

router.get("/football-injuries-v1", (_req, res) => {
  res.json({ leagues: footballInjuriesV1Cache ?? [] });
});

// ─── Football Odds by country (v1) — public multi-market route ────────────────
// v1/soccer/odds/{country} — exposes all 5 market types with proper averaging.
// Already used internally by getOddsMap() for live card bet slip odds.
// This public route adds per-match market exposure: 1x2, Asian Handicap,
// Over/Under, Correct Score, Both Teams To Score — averaged with 2.5% margin.
// Root double-wrapper handled: example?.odds_feed ?? odds_feed.
// team.alternate_id now included (team-level ID, distinct from match alternate_id).

const footballOddsCountryCache = new Map<string, { data: object[]; fetchedAt: number }>();
const FOOTBALL_ODDS_COUNTRY_TTL = 10 * 60 * 1000; // 10 min

function avgOddsByName(bks: OddsBookmaker[], name: string): number {
  const vals: number[] = [];
  for (const bk of bks) {
    if (bk.stop === "True") continue;
    const odds = bk.odd ? (Array.isArray(bk.odd) ? bk.odd : [bk.odd]) : [];
    const o = odds.find(o => o.name === name);
    const v = parseFloat(o?.value ?? "0");
    if (v > 1) vals.push(v);
  }
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
}

function processOddsType(t: OddsType): object | null {
  const bks: OddsBookmaker[] = Array.isArray(t.bookmaker) ? t.bookmaker : [t.bookmaker];
  const activeBks = bks.filter(b => b.stop !== "True");
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
      const allLines = activeBks.flatMap(bk => {
        const tots = bk.total ? (Array.isArray(bk.total) ? bk.total : [bk.total]) : [];
        return tots.filter(tot => tot.ismain === "True" || tots.length === 1);
      });
      if (!allLines.length) return null;
      const mainLine = allLines[0]?.name ?? "";
      const overVals: number[] = [], underVals: number[] = [];
      for (const line of allLines) {
        const odds = line.odd ? (Array.isArray(line.odd) ? line.odd : [line.odd]) : [];
        const ov = parseFloat(odds.find(o => o.name === "Over")?.value  ?? "0");
        const uv = parseFloat(odds.find(o => o.name === "Under")?.value ?? "0");
        if (ov > 1) overVals.push(ov);
        if (uv > 1) underVals.push(uv);
      }
      const avg = (arr: number[]) => arr.length ? Math.max(1.01, Math.round((arr.reduce((a,b)=>a+b,0)/arr.length)*0.975*100)/100) : 0;
      const over = avg(overVals); const under = avg(underVals);
      if (!over || !under) return null;
      return { market: "Over/Under", line: mainLine, overOdds: over, underOdds: under };
    }
    case "Asian Handicap": {
      const allLines = activeBks.flatMap(bk => {
        const hcps = bk.handicap ? (Array.isArray(bk.handicap) ? bk.handicap : [bk.handicap]) : [];
        return hcps.filter(h => h.ismain === "True" || hcps.length === 1);
      });
      if (!allLines.length) return null;
      const mainLine = allLines[0]?.name ?? "";
      const homeVals: number[] = [], awayVals: number[] = [];
      for (const line of allLines) {
        const odds = line.odd ? (Array.isArray(line.odd) ? line.odd : [line.odd]) : [];
        const hv = parseFloat(odds.find(o => o.name === "Home")?.value ?? "0");
        const av = parseFloat(odds.find(o => o.name === "Away")?.value ?? "0");
        if (hv > 1) homeVals.push(hv);
        if (av > 1) awayVals.push(av);
      }
      const avg = (arr: number[]) => arr.length ? Math.max(1.01, Math.round((arr.reduce((a,b)=>a+b,0)/arr.length)*0.975*100)/100) : 0;
      const h = avg(homeVals); const a = avg(awayVals);
      if (!h || !a) return null;
      return { market: "Asian Handicap", line: mainLine, homeOdds: h, awayOdds: a };
    }
    case "Both Teams To Score": {
      const yes = avgOddsByName(activeBks, "Yes");
      const no  = avgOddsByName(activeBks, "No");
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
          if (v > 1) { const arr = scoreMap.get(o.name) ?? []; arr.push(v); scoreMap.set(o.name, arr); }
        }
      }
      const scores = Array.from(scoreMap.entries()).map(([score, vals]) => ({
        score, odds: Math.max(1.01, Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*0.975*100)/100),
      })).sort((a, b) => a.odds - b.odds);
      if (!scores.length) return null;
      return { market: "Correct Score", scores };
    }
    default:
      return null;
  }
}

router.get("/football-odds-country/:country", async (req, res) => {
  const country = String(req.params["country"]).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!country) { res.status(400).json({ error: "País inválido" }); return; }
  const cached = footballOddsCountryCache.get(country);
  res.json({ leagues: cached?.data ?? [] });
});

// ─── Background Market Drift Engine ─────────────────────────────────────────
// Runs every 1–2s independently of Statpal API polls so the frontend sees smooth
// per-tier odds movement even between data-fetch cycles.
// Tier 1 markets (Over/Under, Handicap) drift on this cadence.
// Tier 2 markets (HT/FT, Correct Score) drift on this cadence at a much smaller rate.
// Tier 3 markets (Corners, Cards) drift on this cadence at a very gentle rate.
const LIVE_BROADCAST_INTERVAL_MS = Math.min(2000, Math.max(1000, CONFIG.LIVE_UPDATE_INTERVAL));
setInterval(() => {
  const now = Date.now();
  let anyChange = false;
  for (const [id, state] of liveMatchState.entries()) {
    if (state.sport !== "football") continue;
    const skip = ["HT", "FT", "AET", "Em Breve", "Fin.", "Fin. (AET)"];
    if (skip.includes(state.status)) continue;
    if (state.marketSuspension) {
      const coreKeys = ["result", "totalGoals", "handicap"];
      const allCoresSuspended = coreKeys.every(k => {
        const ts = state.marketSuspension?.[k];
        return ts !== undefined && ts > now;
      });
      if (allCoresSuspended) continue;
    }
    const updated = applyTieredMarketDrift(state, now);
    if (updated !== state) {
      liveMatchState.set(id, updated);
      // Trigger a delta broadcast immediately if something changed
      broadcastMatchDelta(id, { 
        odds: updated.odds, 
        markets: updated.markets,
        _marketNextUpdate: updated._marketNextUpdate
      });
      anyChange = true;
    }
  }
  // Push full snapshot to SSE/WS clients periodically or on any change
  if (anyChange) {
    broadcastLive().catch(() => { /* ignore */ });
  }
}, LIVE_BROADCAST_INTERVAL_MS);

// ─── Football Player Markets (per-match, filtered to home + away team only) ───
// GET /api/matches/football-player-markets/:leagueId?homeTeam=...&awayTeam=...
// Returns players from ONLY the two teams in this match, organized per team.
// Uses getFootballLeagueStats() (cached 30 min, v2/soccer/leagues/{id}/stats).
// Odds: 1/rate * 0.975 house margin, floor 1.10, cap 40.0, ≥3 appearances + ≥1 stat.
// Team matching: normalizes names (lowercase, strips FC/AFC/CF/SC suffixes, accents).

type PlayerMarketEntry = {
  id: string; name: string;
  team: string; teamId: string;
  appearances: number; stat: number;
  odds: number;
};

type TeamPlayerMarkets = {
  teamName: string; teamId: string;
  anytimeScorers: PlayerMarketEntry[];
  firstHalfScorers: PlayerMarketEntry[];
  secondHalfScorers: PlayerMarketEntry[];
  scoreAndAssist: PlayerMarketEntry[];
  bookings: PlayerMarketEntry[];
};

function playerOdds(stat: number, appearances: number): number {
  if (stat <= 0 || appearances < 3) return 0;
  const rate = stat / appearances;
  const fair = 1 / rate;
  return Math.min(40.0, Math.max(1.10, Math.round(fair * 0.975 * 100) / 100));
}

// Normalize a team name for fuzzy matching: lowercase, strip diacritics, strip
// common suffixes (FC, AFC, SC, CF, SV, AC, etc.) and punctuation.
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/\b(fc|afc|sc|cf|sv|ac|rsc|fk|sk|vfb|vfl|bsc|tsg|rb|cd|ud|sd|ca|ad|as|ss|us|ssc|sl|sfc|bfc|jfc|kfc|nk|gd|desportivo|futebol clube|clube)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingTeam(teams: FootballLeagueStatsTeam[], targetName: string): FootballLeagueStatsTeam | undefined {
  const norm = normalizeTeamName(targetName);
  // Exact normalized match first
  let found = teams.find(t => normalizeTeamName(t.name) === norm);
  if (found) return found;
  // Substring match: target contains team name OR team name contains target
  found = teams.find(t => {
    const tn = normalizeTeamName(t.name);
    return tn.includes(norm) || norm.includes(tn);
  });
  return found;
}

function buildTeamMarkets(team: FootballLeagueStatsTeam): TeamPlayerMarkets {
  const byOdds = (a: PlayerMarketEntry, b: PlayerMarketEntry) => a.odds - b.odds;
  const anytimeScorers:    PlayerMarketEntry[] = [];
  const firstHalfScorers:  PlayerMarketEntry[] = [];
  const secondHalfScorers: PlayerMarketEntry[] = [];
  const scoreAndAssist:    PlayerMarketEntry[] = [];
  const bookings:          PlayerMarketEntry[] = [];

  for (const p of team.players) {
    const base = { id: p.id, name: p.name, team: team.name, teamId: team.id, appearances: p.appearances };

    // Anytime scorer + derived half-time markets
    const gOdds = playerOdds(p.goals, p.appearances);
    if (gOdds > 0) {
      anytimeScorers.push({ ...base, stat: p.goals, odds: gOdds });
      // ~42% of goals scored in 1H → fair odds ≈ anytime × 2.38
      const fhOdds = Math.min(50, Math.round(gOdds * 2.38 * 100) / 100);
      firstHalfScorers.push({ ...base, stat: p.goals, odds: fhOdds });
      // ~58% of goals scored in 2H → fair odds ≈ anytime × 1.72
      const shOdds = Math.min(50, Math.round(gOdds * 1.72 * 100) / 100);
      secondHalfScorers.push({ ...base, stat: p.goals, odds: shOdds });
    }

    // Score AND Assist in same match — requires at least 1 goal and 1 assist
    if (p.goals >= 1 && p.assists >= 1) {
      const combinedStat = Math.min(p.goals, p.assists);
      const saBase = playerOdds(combinedStat, p.appearances);
      if (saBase > 0) {
        // Combined event is harder — apply ×1.5 penalty on top of anytime odds
        const saOdds = Math.min(60, Math.round(Math.max(gOdds * 2.0, saBase * 1.5) * 100) / 100);
        scoreAndAssist.push({ ...base, stat: combinedStat, odds: saOdds });
      }
    }

    // Booked: any card (yellow, yellow-red, or straight red)
    const cards = p.yellowCards + p.yellowRed + p.redCards;
    const bOdds = playerOdds(cards, p.appearances);
    if (bOdds > 0) bookings.push({ ...base, stat: cards, odds: bOdds });
  }

  anytimeScorers.sort(byOdds);
  firstHalfScorers.sort(byOdds);
  secondHalfScorers.sort(byOdds);
  scoreAndAssist.sort(byOdds);
  bookings.sort(byOdds);

  return {
    teamName: team.name,
    teamId: team.id,
    anytimeScorers:    anytimeScorers.slice(0, 20),
    firstHalfScorers:  firstHalfScorers.slice(0, 15),
    secondHalfScorers: secondHalfScorers.slice(0, 15),
    scoreAndAssist:    scoreAndAssist.slice(0, 10),
    bookings:          bookings.slice(0, 15),
  };
}

// ─── V2 All-Markets Odds Proxy ──────────────────────────────────────────────

interface V2AllMarketsEntry {
  markets: AllOddsMarket[];
  fetchedAt: number;
}
interface AllOddsMarket {
  name: string;
  group: string;
  choices: Array<{ name: string; label: string; odds: number }>;
}

const allMarketsV2Cache = new Map<string, V2AllMarketsEntry>();
const ALL_MARKETS_TTL = 15 * 60_000;

const v2Match1x2Cache = new Map<string, { odds: { home: number; draw: number; away: number }; fetchedAt: number }>();
const V2_MATCH_1X2_TTL = 2 * 60_000;

async function getV2Match1x2Odds(sport: string, matchId: string): Promise<{ home: number; draw: number; away: number } | null> {
  if (!process.env.SPORTSAPI_KEY) return null;
  const base = v2SportBase(sport);
  if (!base) return null;
  const cacheKey = `1x2:${sport}:${matchId}`;
  const cached = v2Match1x2Cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_MATCH_1X2_TTL) return cached.odds;

  try {
    const resp = await fetch(`${base}/match/${matchId}/odds/all`, {
      signal: AbortSignal.timeout(1800),
      headers: sapiHeaders(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      data?: { markets?: Array<{ marketName?: string; marketGroup?: string; choices?: Array<{ name?: string; fractionalValue?: string }> }> };
    };
    const rawMarkets = data.data?.markets ?? [];
    for (const m of rawMarkets) {
      const choices = m.choices ?? [];
      const c1 = choices.find(c => c.name === "1");
      const cx = choices.find(c => c.name === "X");
      const c2 = choices.find(c => c.name === "2");
      if (!c1 || !cx || !c2) continue;
      const home = fractionalToDecimal(c1.fractionalValue ?? "");
      const draw = fractionalToDecimal(cx.fractionalValue ?? "");
      const away = fractionalToDecimal(c2.fractionalValue ?? "");
      if (home < 1.01 || draw < 1.01 || away < 1.01) continue;
      const odds = { home: Math.round(home * 100) / 100, draw: Math.round(draw * 100) / 100, away: Math.round(away * 100) / 100 };
      v2Match1x2Cache.set(cacheKey, { odds, fetchedAt: Date.now() });
      return odds;
    }
    return null;
  } catch {
    return null;
  }
}

const MARKET_NAME_PT: Record<string, string> = {
  "Full time":             "Resultado Final",
  "Double chance":         "Dupla Hipótese",
  "1st half":              "Primeiro Tempo",
  "Draw no bet":           "Empate Anula Aposta",
  "Both teams to score":   "Ambas Marcam",
  "Match goals":           "Total de Golos",
  "1st quarter winner":    "Vencedor 1º Quarto",
  "1st half winner":       "Vencedor 1º Tempo",
  "Point spread":          "Handicap de Pontos",
  "Game total":            "Total de Pontos",
  "1st period goals":      "Golos 1º Período",
  "First set winner":      "Vencedor 1º Set",
  "Total games won":       "Total de Games",
  "Correct score":         "Resultado Exato",
};

const CHOICE_LABEL_PT: Record<string, string> = {
  "1": "Casa", "X": "Empate", "2": "Fora",
  "1X": "Casa/Empate", "X2": "Empate/Fora", "12": "Casa/Fora",
  "Yes": "Sim", "No": "Não",
  "Over": "Mais", "Under": "Menos",
  "Home": "Casa", "Away": "Fora",
};

function translateMarketNamePT(raw: string): string {
  return MARKET_NAME_PT[raw] ?? raw;
}

function v2SportBase(sport: string): string | null {
  switch (sport) {
    case "football":   return SAPI_V2_FOOTBALL;
    case "basketball": return SAPI_V2_BASKETBALL;
    case "hockey":     return SAPI_V2_HOCKEY;
    case "icehockey":  return SAPI_V2_HOCKEY;
    case "tennis":     return SAPI_V2_TENNIS;
    case "baseball":   return SAPI_V2_BASEBALL;
    case "basebol":    return SAPI_V2_BASEBALL;
    default:           return null;
  }
}

router.get("/v2-match-odds", async (req, res) => {
  const sport   = String(req.query["sport"]   ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) { res.json({ markets: [] }); return; }
  const base = v2SportBase(sport);
  if (!base)  { res.json({ markets: [] }); return; }

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
    if (!resp.ok) { res.json({ markets: [] }); return; }
    const data = (await resp.json()) as {
      data?: { markets?: Array<{ marketName?: string; marketGroup?: string; choices?: Array<{ name?: string; fractionalValue?: string }> }> };
    };
    const rawMarkets = data.data?.markets ?? [];
    const markets: AllOddsMarket[] = rawMarkets
      .filter(m => (m.choices?.length ?? 0) > 0)
      .map(m => ({
        name: translateMarketNamePT(m.marketName ?? ""),
        group: m.marketGroup ?? "",
        choices: (m.choices ?? [])
          .map(c => ({
            name: c.name ?? "",
            label: CHOICE_LABEL_PT[c.name ?? ""] ?? (c.name ?? ""),
            odds: fractionalToDecimal(c.fractionalValue ?? ""),
          }))
          .filter(c => c.odds >= 1.01),
      }))
      .filter(m => m.choices.length > 0);

    allMarketsV2Cache.set(cacheKey, { markets, fetchedAt: Date.now() });
    res.json({ markets });
  } catch {
    res.json({ markets: [] });
  }
});

// ─── V2 Lineups Proxy ────────────────────────────────────────────────────────

interface LineupsV2Entry { data: LineupsResponseV2; fetchedAt: number; }
interface LineupsResponseV2 {
  confirmed: boolean;
  home: { formation?: string; starters: LineupPlayerV2[]; bench: LineupPlayerV2[] };
  away: { formation?: string; starters: LineupPlayerV2[]; bench: LineupPlayerV2[] };
}
interface LineupPlayerV2 {
  name: string; shortName?: string; position: string; number: string; rating?: number;
}

const lineupsV2Cache = new Map<string, LineupsV2Entry>();

const POSITION_PT: Record<string, string> = {
  "G": "GR", "GK": "GR",
  "D": "DEF", "DF": "DEF",
  "M": "MEI", "MF": "MEI",
  "F": "AV",  "FW": "AV",
};

type RawLineupsPlayer = { avgRating?: number; substitute?: boolean; player?: { name?: string; shortName?: string; position?: string; jerseyNumber?: string } };

router.get("/v2-lineups", async (req, res) => {
  const sport   = String(req.query["sport"]   ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  const emptyResp: LineupsResponseV2 = { confirmed: false, home: { starters: [], bench: [] }, away: { starters: [], bench: [] } };
  if (!matchId) { res.json(emptyResp); return; }
  const base = v2SportBase(sport);
  if (!base)  { res.json(emptyResp); return; }

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
    if (!resp.ok) { res.json(emptyResp); return; }
    const data = (await resp.json()) as {
      data?: {
        confirmed?: boolean;
        home?: { formation?: string; players?: RawLineupsPlayer[] };
        away?: { formation?: string; players?: RawLineupsPlayer[] };
      };
    };

    const toPlayers = (arr: RawLineupsPlayer[] | undefined, isStarters: boolean): LineupPlayerV2[] =>
      (arr ?? [])
        .filter(p => p.player?.name && (isStarters ? !p.substitute : !!p.substitute))
        .map(p => ({
          name: p.player!.name!,
          shortName: p.player!.shortName,
          position: POSITION_PT[p.player!.position ?? ""] ?? (p.player!.position ?? ""),
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

const v2IncidentsCache = new Map<string, { data: unknown; fetchedAt: number }>();
const V2_INCIDENTS_TTL = 2500;

router.get("/v2-incidents", async (req, res) => {
  const sport   = String(req.query["sport"]   ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) { res.json({}); return; }
  const base = v2SportBase(sport);
  if (!base) { res.json({}); return; }

  const cacheKey = `v2inc:${sport}:${matchId}`;
  const cached = v2IncidentsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_INCIDENTS_TTL) { res.json(cached.data); return; }

  try {
    const resp = await fetch(`${base}/match/${matchId}/incidents`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) { res.json({}); return; }
    const data = (await resp.json()) as unknown;
    v2IncidentsCache.set(cacheKey, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch {
    res.json({});
  }
});

const v2StatisticsCache = new Map<string, { data: unknown; fetchedAt: number }>();
const V2_STATISTICS_TTL = 4000;

router.get("/v2-statistics", async (req, res) => {
  const sport   = String(req.query["sport"]   ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) { res.json({}); return; }
  const base = v2SportBase(sport);
  if (!base) { res.json({}); return; }

  const cacheKey = `v2stats:${sport}:${matchId}`;
  const cached = v2StatisticsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_STATISTICS_TTL) { res.json(cached.data); return; }

  try {
    const resp = await fetch(`${base}/match/${matchId}/statistics`, {
      signal: AbortSignal.timeout(8000),
      headers: sapiHeaders(),
    });
    if (!resp.ok) { res.json({}); return; }
    const data = (await resp.json()) as unknown;
    v2StatisticsCache.set(cacheKey, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch {
    res.json({});
  }
});

router.get("/football-player-markets/:leagueId", async (req, res) => {
  const leagueId = String(req.params["leagueId"]);
  const homeTeam = String(req.query["homeTeam"] ?? "").trim();
  const awayTeam = String(req.query["awayTeam"] ?? "").trim();

  try {
    const { teams, meta } = await getFootballLeagueStats(leagueId);

    const homeData = homeTeam ? findMatchingTeam(teams, homeTeam) : undefined;
    const awayData = awayTeam ? findMatchingTeam(teams, awayTeam) : undefined;

    if (!homeData && !awayData) {
      // Neither team found — stats not available for this match yet
      res.json({ leagueId: meta.id, leagueName: meta.name, country: meta.country, home: null, away: null });
      return;
    }

    res.json({
      leagueId: meta.id,
      leagueName: meta.name,
      country: meta.country,
      home: homeData ? buildTeamMarkets(homeData) : null,
      away: awayData ? buildTeamMarkets(awayData) : null,
    });
  } catch {
    res.status(500).json({ error: "Mercados de jogadores indisponíveis" });
  }
});

// ─── Confrontos (H2H Real Data) ───────────────────────────────────────────────

type ConfrontosH2HMeeting = { date: string; team1: string; team2: string; score1: number; score2: number; league: string; country?: string };
type ConfrontosResult = { homeWins: number; awayWins: number; draws: number; recentMeetings: ConfrontosH2HMeeting[]; team1Name: string; team2Name: string; sport: string };

const confrontosCache = new Map<string, { data: ConfrontosResult; fetchedAt: number }>();
const CONFRONTOS_TTL = 15 * 60_000;

router.get("/confrontos", async (req, res) => {
  const sport   = String(req.query["sport"]   ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  const home    = String(req.query["home"]    ?? "").trim();
  const away    = String(req.query["away"]    ?? "").trim();

  const cacheKey = `confrontos:${sport}:${matchId}:${home}:${away}`;
  const cached = confrontosCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CONFRONTOS_TTL) { res.json(cached.data); return; }

  let homeWins = 0, awayWins = 0, draws = 0;
  const recentMeetings: ConfrontosH2HMeeting[] = [];
  let team1Name = home, team2Name = away;

  // V2 h2h aggregate (works for all sports)
  const base = v2SportBase(sport);
  if (base && matchId) {
    try {
      const resp = await fetch(`${base}/match/${matchId}/h2h`, { signal: AbortSignal.timeout(8000), headers: sapiHeaders() });
      if (resp.ok) {
        const d = await resp.json() as {
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
        if (td) { homeWins = td.homeWins ?? 0; awayWins = td.awayWins ?? 0; draws = td.draws ?? 0; }
        for (const m of (d.data?.previousMatches ?? []).slice(0, 10)) {
          const dt = m.startTimestamp ? new Date(m.startTimestamp * 1000).toISOString().slice(0, 10) : "";
          recentMeetings.push({ date: dt, team1: m.homeTeam?.name ?? "", team2: m.awayTeam?.name ?? "", score1: m.homeScore?.current ?? 0, score2: m.awayScore?.current ?? 0, league: m.tournament?.name ?? "" });
        }
      }
    } catch { /* ignore */ }
  }

  // For football: enrich with V1 API (richer recent meetings list)
  if (sport === "football" && home && away) {
    try {
      const h2hData = await getFootballH2H(home, away) as {
        recentMeetings?: Array<{ date: string; league: string; country?: string; team1: { name: string; score: number }; team2: { name: string; score: number } }>;
        overallRecord?: { total?: { games?: number; team1Won?: number; team2Won?: number; draws?: number } };
      };
      // Use V1 aggregate if V2 returned nothing
      if (homeWins === 0 && awayWins === 0 && draws === 0) {
        const ov = h2hData.overallRecord?.total;
        if (ov) { homeWins = ov.team1Won ?? 0; awayWins = ov.team2Won ?? 0; draws = ov.draws ?? 0; }
      }
      // Use V1 recent meetings if V2 had none
      if (recentMeetings.length === 0) {
        for (const m of (h2hData.recentMeetings ?? []).slice(0, 10)) {
          recentMeetings.push({ date: m.date, team1: m.team1.name, team2: m.team2.name, score1: m.team1.score, score2: m.team2.score, league: m.league, country: m.country });
        }
      }
    } catch { /* ignore */ }
  }

  const result: ConfrontosResult = { homeWins, awayWins, draws, recentMeetings, team1Name, team2Name, sport };
  confrontosCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  res.json(result);
});

// ─── V2 Tournament Standings (match-specific) ────────────────────────────────

const v2StandingsCache = new Map<string, { data: object; fetchedAt: number }>();
const V2_STANDINGS_TTL = 15 * 60_000;

router.get("/v2-standings", async (req, res) => {
  const sport   = String(req.query["sport"]   ?? "football");
  const matchId = String(req.query["matchId"] ?? "");
  if (!matchId) { res.json({ standings: [], league: "" }); return; }

  const base = v2SportBase(sport);
  if (!base) { res.json({ standings: [], league: "" }); return; }

  const cacheKey = `v2std:${sport}:${matchId}`;
  const cached = v2StandingsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < V2_STANDINGS_TTL) { res.json(cached.data); return; }

  try {
    // Step 1: match details → uniqueTournament.id + season.id
    const matchResp = await fetch(`${base}/match/${matchId}`, { signal: AbortSignal.timeout(8000), headers: sapiHeaders() });
    if (!matchResp.ok) { res.json({ standings: [], league: "" }); return; }
    const matchData = await matchResp.json() as {
      match?: {
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
    const leagueName = matchData.match?.tournament?.uniqueTournament?.name ?? matchData.match?.tournament?.name ?? "";
    const isGroupTournament = matchData.match?.tournament?.isGroup ?? false;
    const rawGroupName = matchData.match?.tournament?.groupName ?? "";
    if (!tId || !sId) { res.json({ standings: [], league: leagueName }); return; }

    // Step 2: fetch standings
    const stdResp = await fetch(`${base}/tournament/${tId}/season/${sId}/standings`, { signal: AbortSignal.timeout(8000), headers: sapiHeaders() });
    if (!stdResp.ok) { res.json({ standings: [], league: leagueName }); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdData = await stdResp.json() as any;
    const rawArr: any[] = stdData.standings ?? [];

    function parseStandingRow(r: any, i: number) {
      return {
        pos:    r.position ?? r.rank ?? i + 1,
        name:   r.teamName ?? r.team?.shortName ?? r.team?.name ?? "",
        played: r.played  ?? r.matches ?? 0,
        won:    r.won     ?? r.wins    ?? 0,
        drawn:  r.drawn   ?? r.draws   ?? 0,
        lost:   r.lost    ?? r.losses  ?? 0,
        gf:     r.goalsFor    ?? r.goals_for    ?? r.scored    ?? 0,
        ga:     r.goalsAgainst ?? r.goals_against ?? r.conceded ?? 0,
        pts:    r.points  ?? 0,
      };
    }

    // Detect group-stage competition: each item has a "group" key OR a nested rows/standings array
    const firstItem = rawArr[0];
    const isGrouped = firstItem && (
      typeof firstItem.group !== "undefined" ||
      Array.isArray(firstItem.rows) ||
      Array.isArray(firstItem.standings)
    );

    let rows: ReturnType<typeof parseStandingRow>[];
    let groups: Array<{ name: string; rows: ReturnType<typeof parseStandingRow>[] }> | undefined;

    if (isGrouped) {
      groups = rawArr.map((g: any) => {
        const rawName: string =
          typeof g.group === "string" ? g.group :
          (g.group?.name ?? g.name ?? "Grupo");
        // Prefix "Grupo" if it looks like a bare letter (A, B, C…) or number
        const name = /^[A-Z0-9]$/.test(rawName.trim())
          ? `Grupo ${rawName.trim()}`
          : rawName.startsWith("Group") ? rawName.replace("Group", "Grupo") : rawName;
        const nestedRows: any[] = g.rows ?? g.standings ?? [];
        return { name, rows: nestedRows.map((r: any, i: number) => parseStandingRow(r, i)) };
      });
      rows = groups.flatMap(g => g.rows);
    } else {
      rows = rawArr.map((r: any, i: number) => parseStandingRow(r, i));
      // When the API returns a flat list for a group-stage competition (e.g. Libertadores),
      // wrap the rows in a single named group using the match's tournament.groupName.
      if (isGroupTournament && rawGroupName && rows.length > 0) {
        const groupLabel = rawGroupName.startsWith("Group")
          ? rawGroupName.replace("Group", "Grupo")
          : /^[A-Z0-9]$/.test(rawGroupName.trim()) ? `Grupo ${rawGroupName.trim()}` : rawGroupName;
        groups = [{ name: groupLabel, rows }];
      } else {
        groups = undefined;
      }
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
export function initLiveWsServer(httpServer: import("http").Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (url === "/api/matches/ws" || url.startsWith("/api/matches/ws?")) {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // Not our path — let other handlers decide (or destroy)
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WsClient) => {
    wsLiveClients.add(ws);

    // Send current live state immediately so the client isn't blank for the next tick
    buildLivePayload()
      .then((p) => {
        try { if (ws.readyState === 1) ws.send(JSON.stringify(p)); } catch { /* ignore */ }
      })
      .catch(() => { /* ignore */ });

    ws.on("close", () => wsLiveClients.delete(ws));
    ws.on("error", () => wsLiveClients.delete(ws));
  });
}

export default router;
