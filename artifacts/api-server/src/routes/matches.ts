import { Router, type IRouter } from "express";
import { CONFIG } from "../lib/config";

const router: IRouter = Router();

const STATSPAL_KEY = process.env.STATSPAL_API_KEY;
const BASE_V2 = "https://statpal.io/api/v2";
const BASE_V1 = "https://statpal.io/api/v1";

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
  // market key → timestamp (ms) when it reopens; absent or past = open
  marketSuspension?: Record<string, number>;
  // Reason for current suspension (displayed in UI)
  _suspensionReason?: string;
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
  // Sport-specific live display data
  _liveExtra?: {
    clockStr?: string;                   // basketball/hockey: "06:44"
    sets?: Array<[number, number]>;      // tennis: [[6,3],[4,2]] last entry is in-progress
    currentPoints?: [number | string, number | string]; // tennis: [30, 15] or ["D","D"] or ["AD",40]
    currentPts?: [number, number];       // volleyball: current set points [18, 16]
    vollSets?: Array<[number, number]>;  // volleyball: completed set scores [[25,18],[22,25]]
    tennisStats?: [TennisStatData, TennisStatData]; // home / away match stats
    periods?: Array<[number, number]>;   // hockey: [[P1h,P1a],[P2h,P2a],[P3h,P3a],[OTh,OTa]]
    quarters?: Array<[number, number]>;  // basketball: [[Q1h,Q1a],[Q2h,Q2a],[Q3h,Q3a],[Q4h,Q4a],[OTh,OTa]]
    // Football extras from Statpal v2
    htScore?: [number, number];          // football: half-time score [homeHT, awayHT]
    etScore?: [number, number];          // football: extra-time score [homeET, awayET]
    penScore?: [number, number];         // football: penalty shootout [homePen, awayPen]
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
  "nations league",
  "copa libertadores",
  "copa sudamericana",
  "copa america",
  "world cup",
];

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
  ["brazil: série a",                        6],
  ["brazil: serie a",                        6],
  ["brazil: brasileirão série a",            6],
  ["brazil: brasileirao serie a",            6],
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

function leaguePriority(name: string, country?: string): number {
  const lower = name.toLowerCase();
  const lowerCountry = (country ?? "").toLowerCase();

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

  // International tournaments: only when the country is not a known domestic one
  if (!ALL_DOMESTIC_COUNTRIES.has(lowerCountry)) {
    for (let i = 0; i < INTL_TOURNAMENTS.length; i++) {
      if (mainPart.includes(INTL_TOURNAMENTS[i])) return i;
    }
  }

  // Domestic leagues — first match wins (order matters for specificity)
  for (const [pattern, rank] of DOMESTIC_PRIORITY) {
    if (mainPart.includes(pattern)) return rank;
  }

  // Unknown league → filter out
  return 999;
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

  // Double Chance
  const [dcHD, dcDA, dcHA] = probsToDecimalOdds([pHomeWin + pDraw, pDraw + pAwayWin, pHomeWin + pAwayWin], 1.06);

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

  return {
    doubleChance: { homeOrDraw: dcHD!, awayOrDraw: dcDA!, homeOrAway: dcHA! },
    bothTeamsScore: { yes: bttsYes!, no: bttsNo! },
    totalGoals: { over05: o05!, under05: u05!, over15: o15!, under15: u15!, over25: o25!, under25: u25!, over35: o35!, under35: u35!, over45: o45!, under45: u45!, over55: o55!, under55: u55!, over65: o65!, under65: u65! },
    handicap: { homeMinusOne: hm1H!, awayPlusOne: hm1A!, homeMinusOneHalf: hm15H!, awayPlusOneHalf: hm15A! },
    halfTime: { home: htH!, draw: htX!, away: htA! },
    firstGoal: { home: fgH!, noGoal: fgNG!, away: fgA! },
    drawNoBet: { home: dnbH!, away: dnbA! },
    asianHandicap: { line: ahLine, home: ahH!, away: ahA! },
    asianTotals: { o05: o05!, u05: u05!, o45: o45!, u45: u45!, o55: o55!, u55: u55!, o225: o225!, u225: u225!, o275: o275!, u275: u275! },
    htft: { hh: htftOdds[0]!, hd: htftOdds[1]!, ha: htftOdds[2]!, dh: htftOdds[3]!, dd: htftOdds[4]!, da: htftOdds[5]!, ah: htftOdds[6]!, ad: htftOdds[7]!, aa: htftOdds[8]! },
    correctScore,
    corners: { o85: oc85!, u85: uc85!, o95: oc95!, u95: uc95!, o105: oc105!, u105: uc105! },
    cards: { o35: ocard35!, u35: ucard35!, o45: ocard45!, u45: ucard45! },
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
      bothTeamsScoreGame: { yes: btsYes!, no: btsNo! },
      shotsOnGoal: { line: shotsLine, over: oShots!, under: uShots! },
    },
  } as unknown as AdvancedMarkets;
}

// ─── Volleyball market builder (probabilistic model for real upcoming matches) ─
function makeVolleyballMarketsFromTeams(home: string, away: string): AdvancedMarkets {
  const sr = seededRng(`vball-mkt:${home}:${away}`);
  const skillDiff = mc((sr(1) - 0.5) * 0.3 + 0.04, -0.35, 0.35);
  const pSetH = mc(0.52 + skillDiff, 0.18, 0.82);
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

// ─── Caches ───────────────────────────────────────────────────────────────────

// v2/live: cache 30s
let liveCache: StatpalLeagueV2[] | null = null;
let liveFetchedAt = 0;
// Track Statpal's own updated_ts so we can detect a frozen feed
let liveFeedUpdatedTs = 0;

// v2/daily today: cache 5min
let dailyCache: StatpalLeagueV2[] | null = null;
let dailyFetchedAt = 0;

// v2/daily tomorrow: cache 30min
let dailyTomorrowCache: StatpalLeagueV2[] | null = null;
let dailyTomorrowFetchedAt = 0;

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
const TENNIS_LIVE_CACHE_TTL = 4_000; // 4s — real-time tennis points

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

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getLiveLeagues(): Promise<StatpalLeagueV2[]> {
  const now = Date.now();
  if (liveCache && now - liveFetchedAt < CONFIG.LIVE_CACHE_TTL) return liveCache;
  try {
    const resp = await fetch(`${BASE_V2}/soccer/matches/live?access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!resp.ok) {
      console.warn(`[live] Statpal HTTP ${resp.status} — using cache or empty`);
      return liveCache ?? [];
    }
    const data = (await resp.json()) as { live_matches?: { league?: StatpalLeagueV2 | StatpalLeagueV2[]; updated_ts?: number } };
    const raw = data?.live_matches?.league;
    // Track Statpal's own feed timestamp (seconds) — used to detect frozen feed
    const feedTs = data?.live_matches?.updated_ts;
    if (feedTs && feedTs > liveFeedUpdatedTs) liveFeedUpdatedTs = feedTs;
    liveCache = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    liveFetchedAt = now;
    return liveCache;
  } catch (err) {
    console.warn(`[live] Statpal fetch error — using cache or empty:`, err);
    return liveCache ?? [];
  }
}

async function getDailyLeagues(): Promise<StatpalLeagueV2[]> {
  const now = Date.now();
  if (dailyCache && now - dailyFetchedAt < CONFIG.DAILY_CACHE_TTL) return dailyCache;
  try {
    const resp = await fetch(`${BASE_V2}/soccer/matches/daily?offset=0&access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!resp.ok) {
      console.warn(`[daily] Statpal HTTP ${resp.status} — using cache or empty`);
      return dailyCache ?? [];
    }
    const raw = (await resp.json()) as Record<string, { league: StatpalLeagueV2[] }>;
    const dayData = Object.values(raw)[0];
    dailyCache = dayData?.league ?? [];
    dailyFetchedAt = now;
    return dailyCache;
  } catch (err) {
    console.warn(`[daily] Statpal fetch error — using cache or empty:`, err);
    return dailyCache ?? [];
  }
}

async function getTomorrowLeagues(): Promise<StatpalLeagueV2[]> {
  const now = Date.now();
  if (dailyTomorrowCache && now - dailyTomorrowFetchedAt < CONFIG.TOMORROW_CACHE_TTL) return dailyTomorrowCache;
  try {
    const resp = await fetch(`${BASE_V2}/soccer/matches/daily?offset=1&access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!resp.ok) return dailyTomorrowCache ?? [];
    const raw = (await resp.json()) as Record<string, { league: StatpalLeagueV2[] }>;
    const dayData = Object.values(raw)[0];
    dailyTomorrowCache = dayData?.league ?? [];
    dailyTomorrowFetchedAt = now;
    return dailyTomorrowCache;
  } catch {
    return dailyTomorrowCache ?? [];
  }
}

// Fetch real odds for major European countries in parallel
async function getOddsMap(): Promise<Map<string, RealOdds>> {
  const now = Date.now();
  if (oddsMap && now - oddsFetchedAt < CONFIG.ODDS_CACHE_TTL) return oddsMap;

  const COUNTRIES = [
    "england", "spain", "germany", "italy", "france", "portugal", "netherlands",
    "korea", "japan", "australia", "brazil", "usa", "mexico", "turkey",
    "argentina", "scotland", "greece", "russia", "china",
  ];
  const map = new Map<string, RealOdds>();

  await Promise.allSettled(
    COUNTRIES.map(async (country) => {
      try {
        const resp = await fetch(
          `${BASE_V1}/soccer/odds/${country}?access_key=${STATSPAL_KEY}`,
          { signal: AbortSignal.timeout(9000) }
        );
        if (!resp.ok) return;
        const raw = (await resp.json()) as {
          example?: { odds_feed: { league: OddsLeague[] } };
          odds_feed?: { league: OddsLeague[] };
        };
        const feed = raw?.example?.odds_feed ?? raw?.odds_feed;
        const leagues: OddsLeague[] = feed?.league ?? [];

        for (const league of leagues) {
          const matches = Array.isArray(league.match) ? league.match : [league.match];
          for (const m of matches) {
            if (!m?.odds?.type) continue;
            const types = Array.isArray(m.odds.type) ? m.odds.type : [m.odds.type];

            // Find 1x2 odds — average across ALL active bookmakers with 2.5% house margin
            // (was: bookmaker[0] only — inconsistent with hockey/basketball/volleyball/tennis)
            const wx2 = types.find(t => t.name === "1x2" || t.name === "3Way Result");
            if (!wx2) continue;
            const bks: OddsBookmaker[] = Array.isArray(wx2.bookmaker) ? wx2.bookmaker : [wx2.bookmaker];
            const avgSide = (side: "Home" | "Draw" | "Away"): number => {
              const vals: number[] = [];
              for (const bk of bks) {
                if (bk.stop === "True") continue;
                const odds = bk.odd ? (Array.isArray(bk.odd) ? bk.odd : [bk.odd]) : [];
                const o = odds.find(o => o.name === side);
                const v = parseFloat(o?.value ?? "0");
                if (v > 1) vals.push(v);
              }
              if (!vals.length) return 0;
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
            };
            const homeVal = avgSide("Home");
            const drawVal = avgSide("Draw");
            const awayVal = avgSide("Away");
            if (homeVal <= 0 || drawVal <= 0 || awayVal <= 0) continue;

            const entry: RealOdds = { home: homeVal, draw: drawVal, away: awayVal, types };
            // Index by all known IDs for maximum match coverage
            if (m.id) map.set(m.id, entry);
            if (m.alternate_id) map.set(m.alternate_id, entry);
            if (m.alternate_id_2) map.set(m.alternate_id_2, entry);
          }
        }
      } catch {
        // Country fetch failed — skip silently
      }
    })
  );

  oddsMap = map;
  oddsFetchedAt = now;
  return map;
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
  baseAway: number;
}): { home: number; draw: number; away: number } {
  const r = (n: number) => Math.round(n * 100) / 100;

  // Derive base probabilities from pre-match odds (already margin-free)
  const vigFactor = 1 - LIVE_MARGIN;
  const fairHome = 1 / (state.baseHome / vigFactor);
  const fairAway = 1 / (state.baseAway / vigFactor);
  const baseDraw = Math.max(0.02, 1 - fairHome - fairAway);

  let homeProb = fairHome;
  let drawProb = baseDraw;
  let awayProb = fairAway;

  const diff = state.homeGoals - state.awayGoals;

  // Score advantage — each goal shifts probability significantly
  if (diff > 0) {
    const boost = 0.20 * Math.min(diff, 2);
    homeProb += boost;
    awayProb -= boost * 0.5;
    drawProb -= boost * 0.5;
  } else if (diff < 0) {
    const boost = 0.20 * Math.min(-diff, 2);
    awayProb += boost;
    homeProb -= boost * 0.5;
    drawProb -= boost * 0.5;
  }

  // Time pressure — after 70' the leading team becomes a stronger favourite
  if (state.minute > 70) {
    const pressure = (state.minute - 70) / 20 * 0.08;
    if (diff > 0) { homeProb += pressure; drawProb -= pressure * 0.6; awayProb -= pressure * 0.4; }
    else if (diff < 0) { awayProb += pressure; drawProb -= pressure * 0.6; homeProb -= pressure * 0.4; }
    else { drawProb += pressure * 0.5; } // draw more likely to stay a draw late
  }

  // Red cards
  if (state.redCardsAway > 0) { homeProb += 0.07 * state.redCardsAway; awayProb -= 0.05 * state.redCardsAway; }
  if (state.redCardsHome > 0) { awayProb += 0.07 * state.redCardsHome; homeProb -= 0.05 * state.redCardsHome; }

  // Clamp and normalise
  homeProb = Math.max(0.02, homeProb);
  drawProb = Math.max(0.02, drawProb);
  awayProb = Math.max(0.02, awayProb);
  const total = homeProb + drawProb + awayProb;
  homeProb /= total;
  drawProb /= total;
  awayProb /= total;

  // Apply margin → final odds
  return {
    home: Math.max(1.04, r((1 / homeProb) * vigFactor)),
    draw: Math.max(2.00, r((1 / drawProb) * vigFactor)),
    away: Math.max(1.04, r((1 / awayProb) * vigFactor)),
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

  // ── Main 1X2 odds (highest priority, 45–90s cadence) ───────────────────────
  const oddsOscH = Math.sin(t * 0.31 + phase * 0.7) * 0.018 + Math.cos(t * 0.17) * 0.009;
  const oddsOscD = Math.cos(t * 0.23 + phase * 0.5) * 0.014 + Math.sin(t * 0.11) * 0.007;
  const oddsOscA = Math.sin(t * 0.27 + phase * 0.9) * 0.018 + Math.cos(t * 0.19) * 0.009;
  const newOdds = due("odds", 45_000, 90_000) ? {
    home: Math.max(1.04, Math.min(25, r(baseOdds.home * (1 + oddsOscH - (diff > 0 ? timePressure * 0.4 : timePressure * 0.6))))),
    draw: baseOdds.draw > 0 ? Math.max(2.2, Math.min(8, r(baseOdds.draw * (1 + oddsOscD + timePressure * 0.3)))) : 0,
    away: Math.max(1.04, Math.min(25, r(baseOdds.away * (1 + oddsOscA + (diff > 0 ? timePressure * 0.6 : timePressure * 0.4))))),
  } : state.odds; // not due yet → unchanged (no arrow on frontend)

  // ── Oscillator values — computed fresh each cycle but only APPLIED when due ─
  const osc1 = Math.sin(t * 0.29 + phase * 0.8) * 0.013 + Math.cos(t * 0.13 + phase * 0.4) * 0.006;
  const osc2 = Math.sin(t * 0.11 + phase * 0.35) * 0.007 + Math.cos(t * 0.07 + phase * 0.2) * 0.003;
  const osc3 = Math.sin(t * 0.04 + phase * 0.15) * 0.003 + Math.cos(t * 0.025 + phase * 0.1) * 0.0015;

  const s1 = (n: number) => n <= 0 ? n : r(Math.max(1.01, n * (1 + osc1)));
  const s2 = (n: number) => n <= 0 ? n : r(Math.max(1.01, n * (1 + osc2)));
  const s3 = (n: number) => n <= 0 ? n : r(Math.max(1.01, n * (1 + osc3)));

  // Carry through already-settled zeros (filterLiveMarkets output)
  const keep0 = (cur: number, base: number, fn: (n: number) => number) => cur <= 0 ? 0 : fn(base);
  const tg  = state.markets.totalGoals;
  const btg = bm.totalGoals;

  // ── Tier 1 markets — each on its own 50–110s schedule ──────────────────────
  const dcDue  = due("doubleChance",   50_000, 110_000);
  const btsDue = due("bothTeamsScore", 55_000, 115_000);
  const tgDue  = due("totalGoals",     60_000, 120_000);
  const hcDue  = due("handicap",       65_000, 125_000);
  const dnbDue = due("drawNoBet",      70_000, 130_000);
  const atDue  = due("asianTotals",    75_000, 135_000);

  // ── Tier 2 markets — 85–180s ───────────────────────────────────────────────
  const htDue  = due("halfTime",       85_000, 160_000);
  const fgDue  = due("firstGoal",      90_000, 170_000);
  const ahDue  = due("asianHandicap",  95_000, 180_000);
  const htftDue = due("htft",         100_000, 190_000);
  const csDue  = due("correctScore",  105_000, 200_000);

  // ── Tier 3 markets — 120–260s ──────────────────────────────────────────────
  const cornDue = due("corners", 120_000, 250_000);
  const cardDue = due("cards",   130_000, 260_000);

  const newMarkets: AdvancedMarkets = {
    ...state.markets, // default: keep ALL current values (no change = no arrow)

    doubleChance: dcDue
      ? { homeOrDraw: s1(bm.doubleChance.homeOrDraw), awayOrDraw: s1(bm.doubleChance.awayOrDraw), homeOrAway: s1(bm.doubleChance.homeOrAway) }
      : state.markets.doubleChance,

    bothTeamsScore: btsDue
      ? { yes: s1(bm.bothTeamsScore.yes), no: s1(bm.bothTeamsScore.no) }
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
            over05:  live.over05  > 0 ? s1(live.over05)  : 0, under05: live.under05  > 0 ? s1(live.under05)  : 0,
            over15:  live.over15  > 0 ? s1(live.over15)  : 0, under15: live.under15  > 0 ? s1(live.under15)  : 0,
            over25:  live.over25  > 0 ? s1(live.over25)  : 0, under25: live.under25  > 0 ? s1(live.under25)  : 0,
            over35:  live.over35  > 0 ? s1(live.over35)  : 0, under35: live.under35  > 0 ? s1(live.under35)  : 0,
            over45:  live.over45  > 0 ? s1(live.over45)  : 0, under45: live.under45  > 0 ? s1(live.under45)  : 0,
            over55:  live.over55  > 0 ? s1(live.over55)  : 0, under55: live.under55  > 0 ? s1(live.under55)  : 0,
            over65:  live.over65  > 0 ? s1(live.over65)  : 0, under65: live.under65  > 0 ? s1(live.under65)  : 0,
          };
        })()
      : state.markets.totalGoals,

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

    halfTime: htDue && bm.halfTime
      ? { home: s2(bm.halfTime.home), draw: s2(bm.halfTime.draw), away: s2(bm.halfTime.away) }
      : state.markets.halfTime,

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

    correctScore: csDue && bm.correctScore
      ? Object.fromEntries(Object.entries(bm.correctScore).map(([k, v]) => {
          const cur = state.markets.correctScore?.[k] ?? 0;
          return [k, keep0(cur, v, s2)];
        }))
      : state.markets.correctScore,

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
  const recalcLine = (cur: number, targetTotal: number): [number, number] => {
    if (cur <= 0) return [0, 0];
    const needed = Math.max(1, targetTotal - currentGoals);
    const pOver = mc(1 - poissonCdf(lambdaRem, needed - 1), 0.01, 0.99);
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

// Remove/zero out market lines that are already settled or impossible given the current live score
function filterLiveMarkets(markets: AdvancedMarkets, homeScore: number, awayScore: number): AdvancedMarkets {
  const m: AdvancedMarkets = { ...markets, totalGoals: { ...markets.totalGoals } };
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
  const now = Date.now();
  if (nhlLiveCache && now - nhlLiveFetchedAt < CONFIG.LIVE_CACHE_TTL) return nhlLiveCache;
  try {
    const resp = await fetch(`${BASE_V1}/nhl/livescores?access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return nhlLiveCache ?? [];
    const data = (await resp.json()) as { livescores?: { tournament?: NHLTournament | NHLTournament[] } };
    const raw = data?.livescores?.tournament;
    if (!raw) return nhlLiveCache ?? [];
    nhlLiveCache = Array.isArray(raw) ? raw : [raw];
    nhlLiveFetchedAt = now;
    return nhlLiveCache;
  } catch {
    return nhlLiveCache ?? [];
  }
}

function buildNHLLiveMatches(tournaments: NHLTournament[]): LiveMatchState[] {
  const NHL_LIVE_STATUSES = new Set(["1P", "2P", "3P", "OT", "SO", "INT", "Break"]);
  const result: LiveMatchState[] = [];

  // Sort by league priority so top-tier competitions appear first
  const sorted = [...tournaments].sort((a, b) => hockeyLeaguePriority(a.league) - hockeyLeaguePriority(b.league));

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;

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
      // For not-started: only show today's games
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

async function getNBALive(): Promise<NBATournament[]> {
  const now = Date.now();
  if (nbaLiveCache && now - nbaLiveFetchedAt < CONFIG.LIVE_CACHE_TTL) return nbaLiveCache;
  try {
    const resp = await fetch(`${BASE_V1}/nba/livescores?access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return nbaLiveCache ?? [];
    const data = (await resp.json()) as { livescores?: { tournament?: NBATournament | NBATournament[] } };
    const raw = data?.livescores?.tournament;
    if (!raw) return nbaLiveCache ?? [];
    nbaLiveCache = Array.isArray(raw) ? raw : [raw];
    nbaLiveFetchedAt = now;
    return nbaLiveCache;
  } catch {
    return nbaLiveCache ?? [];
  }
}

function buildNBALiveMatches(tournaments: NBATournament[]): LiveMatchState[] {
  const NBA_LIVE_STATUSES = new Set(["Q1", "Q2", "Q3", "Q4", "HT", "OT", "1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter", "Halftime", "In Progress"]);
  const result: LiveMatchState[] = [];

  // Sort by league priority so NBA Cup / EuroLeague appear before G League etc.
  const sorted = [...tournaments].sort((a, b) => basketballLeaguePriority(a.league) - basketballLeaguePriority(b.league));

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;

  for (const t of sorted) {
    const matches = Array.isArray(t.match) ? t.match : [t.match];
    for (const m of matches) {
      if (!m?.status) continue;
      const st = m.status;
      const isFinished = st === "Finished" || st === "Ended" || st === "Closed";
      if (isFinished) continue; // never show finished games in live section
      const isNotStarted = st === "Not Started";
      const isLive = NBA_LIVE_STATUSES.has(st) || (!isNotStarted && st !== "Postponed" && st !== "Cancelled");
      if (!isLive && !isNotStarted) continue;
      if (isNotStarted && m.date && m.date !== todayStr) continue;

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
  const now = Date.now();
  if (tennisStatsCache && now - tennisStatsFetchedAt < TENNIS_LIVE_CACHE_TTL) return tennisStatsCache;
  try {
    const resp = await fetch(`${BASE_V1}/tennis/livestats?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return tennisStatsCache ?? new Map();
    const data = (await resp.json()) as { livestats?: { tournament?: TennisStatsTournament | TennisStatsTournament[] } };
    const raw = data?.livestats?.tournament;
    if (!raw) return tennisStatsCache ?? new Map();
    const arr = Array.isArray(raw) ? raw : [raw];
    const map = new Map<string, [TennisStatData, TennisStatData]>();
    for (const t of arr) {
      const matches = Array.isArray(t.match) ? t.match : [t.match];
      for (const m of matches) {
        if (!m?.id) continue;
        const players = Array.isArray(m.player) ? m.player : [m.player];
        map.set(String(m.id), [_parseTennisStat(players[0]), _parseTennisStat(players[1])]);
      }
    }
    tennisStatsCache = map;
    tennisStatsFetchedAt = now;
    return map;
  } catch {
    return tennisStatsCache ?? new Map();
  }
}

async function getTennisLive(): Promise<TennisTournament[]> {
  const now = Date.now();
  if (tennisLiveCache && now - tennisLiveFetchedAt < TENNIS_LIVE_CACHE_TTL) return tennisLiveCache;
  try {
    const resp = await fetch(`${BASE_V1}/tennis/livescores?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return tennisLiveCache ?? [];
    const data = (await resp.json()) as { livescores?: { tournament?: TennisTournament | TennisTournament[] } };
    const raw = data?.livescores?.tournament;
    if (!raw) return tennisLiveCache ?? [];
    tennisLiveCache = Array.isArray(raw) ? raw : [raw];
    tennisLiveFetchedAt = now;
    return tennisLiveCache;
  } catch {
    return tennisLiveCache ?? [];
  }
}

async function getVolleyballLive(): Promise<VolleyTournament[]> {
  const now = Date.now();
  if (volleyLiveCache && now - volleyLiveFetchedAt < CONFIG.LIVE_CACHE_TTL) return volleyLiveCache;
  try {
    const resp = await fetch(`${BASE_V1}/volleyball/livescores?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return volleyLiveCache ?? [];
    const data = (await resp.json()) as { livescores?: { tournament?: VolleyTournament | VolleyTournament[] } };
    const raw = data?.livescores?.tournament;
    if (!raw) return volleyLiveCache ?? [];
    volleyLiveCache = Array.isArray(raw) ? raw : [raw];
    volleyLiveFetchedAt = now;
    return volleyLiveCache;
  } catch {
    return volleyLiveCache ?? [];
  }
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
      if (!m || !TENNIS_LIVE_STATUSES.has(m.status)) continue;
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
      const servingBonus = p0.serve === "True" ? 0.5 : p1.serve === "True" ? -0.5 : 0;

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

      // Only tennis-relevant markets — no football goals/corners/cards
      const tennisOnlyMarkets = {
        doubleChance:    { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore:  { yes: 0, no: 0 },
        totalGoals:      { over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0, over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0 },
        handicap:        { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
        halfTime:        { home: 0, draw: 0, away: 0 },
        firstGoal:       { home: 0, noGoal: 0, away: 0 },
        tennisExtra:     computeTennisExtras(liveHomeP),
      } as unknown as AdvancedMarkets;

      result.push({
        id:          `tennis-live-${m.id}`,
        home:        p0.name,
        away:        p1.name,
        league:      t.name,
        country:     "tennis",
        sport:       "tennis",
        homeScore,
        awayScore,
        minute:      setNum,
        status:      m.status,
        hasRealOdds: !!cached,
        odds:        liveOdds,
        markets:     tennisOnlyMarkets,
        events:      [],
        _liveExtra:  { sets, currentPoints: [hPt, aPt], tennisStats: statsMap.get(m.id) },
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

      const isLive       = VSET_LIVE.has(m.status);
      const isNotStarted = m.status === "Not Started";
      const isFinished   = m.status === "Finished";

      if (isFinished) continue; // never show finished games in live section
      if (!isLive && !isNotStarted) continue;
      // Non-live: only today's fixtures
      if (isNotStarted && m.date !== todayStr) continue;

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

      const setNum      = isLive ? (parseInt(m.status.split(" ")[1]!) || 1) : 0;
      const statusLabel = isNotStarted ? `Hoje ${m.time}` : isFinished ? "Encerrado" : m.status;
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
    if (!currentMatchIds.has(id)) liveMatchState.delete(id);
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
      const minute = isHT ? 45 : isET ? 105 : parseInt(m.status) || 1;

      // Market suspension delays on goal (ms per market key)
      const GOAL_SUSPENSION_MS: Record<string, number> = {
        result: 8000,
        doubleChance: 7000,
        totalGoals: 10000,
        handicap: 10000,
        halfTime: 6000,
        htft: 12000,
        correctScore: 15000,
        asianHandicap: 12000,
        asianTotals: 12000,
        drawNoBet: 8000,
        firstGoal: 8000,
      };

      // Stable odds: once assigned, keep unless score changes significantly
      let matchOdds: { home: number; draw: number; away: number };
      let matchMarkets: AdvancedMarkets;
      let matchMarketSuspension: Record<string, number> | undefined;
      let matchSuspensionReason: string | undefined;

      let hasRealOdds = true; // Always show odds — use model when real unavailable

      if (existing && existing.homeScore === homeScore && existing.awayScore === awayScore) {
        // Score unchanged — background drift timer handles market updates every 2s.
        // Here we only update the minute and clean up expired suspensions.
        const now = Date.now();
        if (existing.marketSuspension) {
          const active = Object.fromEntries(
            Object.entries(existing.marketSuspension).filter(([, ts]) => ts > now)
          );
          matchMarketSuspension = Object.keys(active).length > 0 ? active : undefined;
        }

        // Read current state (already drifted by background timer); just update minute + suspensions
        const updatedState = {
          ...existing,
          minute,
          marketSuspension: matchMarketSuspension,
          _suspensionReason: matchMarketSuspension ? existing._suspensionReason : undefined,
          _firstSeenAt: firstSeenAt,
          _htStartedAt: isHT ? htStartedAt : undefined,
        };
        liveMatchState.set(m.main_id, updatedState);
        result.push({ ...updatedState, events: existing.events });
        count++;
        continue;
      } else {
        // Score changed or first seen — build base odds from pre-match model/real data
        // Detect goal: score increased vs previous state
        const isGoal = existing != null && (homeScore > existing.homeScore || awayScore > existing.awayScore);
        if (isGoal) {
          const now = Date.now();
          matchMarketSuspension = Object.fromEntries(
            Object.entries(GOAL_SUSPENSION_MS).map(([k, delay]) => [k, now + delay])
          );
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
          baseAway: resolved.odds.away,
        });

        // Filter markets for live score (remove impossible/settled lines)
        matchMarkets = filterLiveMarkets(matchMarkets, homeScore, awayScore);

        // Recalculate total goals using live-adjusted lambda (remaining time + current score)
        matchMarkets = {
          ...matchMarkets,
          totalGoals: recalcLiveTotalGoals(
            m.home.name, m.away.name,
            homeScore + awayScore, minute, m.status,
            matchMarkets.totalGoals
          ),
        };

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
      const dangerEvent = !isGoalEvent ? events.find(e => {
        const t = e.type.toLowerCase().replace(/[\s_-]/g, "");
        return e.minute >= recentThreshold && VAR_DANGER_TOKENS.some(token => t.includes(token.replace("_", "")));
      }) : undefined;
      if (dangerEvent && !matchMarketSuspension) {
        const now = Date.now();
        const VAR_SUSPENSION_MS: Record<string, number> = {
          result: 20000, doubleChance: 18000, totalGoals: 22000, handicap: 22000,
          halfTime: 15000, correctScore: 30000, asianHandicap: 25000, asianTotals: 25000,
          drawNoBet: 20000, firstGoal: 20000, htft: 30000,
        };
        matchMarketSuspension = Object.fromEntries(
          Object.entries(VAR_SUSPENSION_MS).map(([k, delay]) => [k, now + delay])
        );
        const evType = dangerEvent.type.toLowerCase().replace(/[\s_-]/g, "");
        const reasonKey = Object.keys(VAR_REASON_MAP).find(k => evType.includes(k));
        matchSuspensionReason = reasonKey ? VAR_REASON_MAP[reasonKey] : "SUSPENSO";
      }

      const footballExtra: LiveMatchState["_liveExtra"] = {};
      if (m.ht) footballExtra.htScore = [m.ht.home_goals, m.ht.away_goals];
      if (m.et) footballExtra.etScore = [m.et.home_goals, m.et.away_goals];
      if (m.penalties) footballExtra.penScore = [m.penalties.home_pen, m.penalties.away_pen];

      const state: LiveMatchState = {
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
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
      };

      liveMatchState.set(m.main_id, state);
      result.push(state);
      count++;
    }
  }

  return result;
}

async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  // Use getDailyLeagues (today's schedule) not getLiveLeagues (already in-progress matches)
  const [todayLeagues, tomorrowLeagues, odds] = await Promise.all([
    getDailyLeagues().catch(() => [] as StatpalLeagueV2[]),
    getTomorrowLeagues().catch(() => [] as StatpalLeagueV2[]),
    getOddsMap().catch(() => new Map<string, RealOdds>()),
  ]);

  // Tag tomorrow matches so we can label them; merge into one pool
  const seenIds = new Set<string>();
  const allLeagues: (StatpalLeagueV2 & { isTomorrow?: boolean })[] = [
    ...todayLeagues.map(l => ({ ...l })),
    ...tomorrowLeagues.map(l => ({ ...l, isTomorrow: true })),
  ];

  const sorted = allLeagues
    .filter(l => leaguePriority(l.name, l.country) < 100)
    .sort((a, b) => leaguePriority(a.name, a.country) - leaguePriority(b.name, b.country));

  const results: UpcomingMatch[] = [];

  for (const league of sorted) {
    if (results.length >= 40) break;
    const matches: StatpalMatchV2[] = Array.isArray(league.match) ? league.match : [league.match];

    for (const m of matches) {
      if (results.length >= 40) break;
      if (!/^\d{2}:\d{2}$/.test(m.status)) continue;
      if (m.home.goals !== "?" || m.away.goals !== "?") continue;
      if (seenIds.has(m.main_id)) continue;
      seenIds.add(m.main_id);

      // Skip matches whose scheduled time has already passed
      if (isMatchTimePast(m.date ?? "", m.status)) continue;

      const { odds: matchOdds, markets, real } = resolveOdds(m, odds);

      // Skip matches without real Statpal odds UNLESS the league is high-priority
      // (priority < 50 = Copa do Brasil, Liga Profesional, Copa Libertadores, etc.)
      // — they are real competitions that should always be shown with simulated odds
      const leaguePri = leaguePriority(
        league.name ?? "",
        league.country ?? ""
      );
      if (!real && leaguePri >= 50) continue;

      results.push({
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
        country: league.country,
        time: addOneHour(m.status),
        date: m.date,
        sport: "football",
        hasRealOdds: true,
        odds: matchOdds,
        markets,
      });
    }
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
    const scheduledMs = new Date(`${isoDate}T${timeStr}:00`).getTime();
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
    // displayTimeStr is UTC+1; subtract 1 hour to compare against Date.now() (UTC)
    const [hStr, mStr] = displayTimeStr.split(":");
    const hUtc = ((parseInt(hStr) - 1) + 24) % 24;
    const utcTime = `${String(hUtc).padStart(2, "0")}:${mStr}`;
    const matchMs = new Date(`${isoDate}T${utcTime}:00`).getTime();
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


export { buildLiveMatches, buildUpcomingMatches, getUpcomingAll };

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/live", async (_req, res) => {
  try {
    const empty: UpcomingMatch[] = [];
    const [
      soccerMatches, nhlTournaments, nbaTournaments,
      tennisTournaments, volleyTournaments, tennisStatsMap,
      upFootball, upTennis, upBasketball, upHockey, upVolleyball,
    ] = await Promise.all([
      buildLiveMatches(),
      getNHLLive(),
      getNBALive(),
      getTennisLive(),
      getVolleyballLive(),
      getTennisStatsMap(),
      buildUpcomingMatches().catch(() => empty),
      buildTennisUpcoming().catch(() => empty),
      buildBasketballUpcoming().catch(() => empty),
      buildHockeyUpcoming().catch(() => empty),
      buildVolleyballUpcoming().catch(() => empty),
      // Populate _tennisPreMatchOdds cache so buildTennisLiveMatches uses real base odds
      getTennisOdds().catch(() => []),
    ]);
    const nhlMatches    = buildNHLLiveMatches(nhlTournaments);
    const nbaMatches    = buildNBALiveMatches(nbaTournaments);
    const tennisMatches = buildTennisLiveMatches(tennisTournaments, tennisStatsMap);
    const volleyMatches = buildVolleyballLiveMatches(volleyTournaments);
    const livePart = [...soccerMatches, ...nhlMatches, ...nbaMatches, ...tennisMatches, ...volleyMatches];

    // "Em Breve" — real upcoming matches starting within the next 36 hours
    const liveIds = new Set(livePart.map(m => String(m.id)));
    const allUpcoming = [...upFootball, ...upTennis, ...upBasketball, ...upHockey, ...upVolleyball];
    const startingSoon: LiveMatchState[] = allUpcoming
      .filter(m => {
        const si = matchStartsInMinutes(m.date, m.time);
        return isFinite(si) && si >= -10 && si <= 2160 && !liveIds.has(String(m.id));
      })
      // Sort by soonest start first so all sports share slots fairly
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
        startsIn:      Math.max(0, Math.round(matchStartsInMinutes(m.date, m.time))),
        scheduledTime: m.time,
        scheduledDate: m.date,
      } satisfies LiveMatchState));

    const matches = [...livePart, ...startingSoon];
    res.json({ matches });
  } catch (err) {
    console.error("[live route] unexpected error:", err);
    res.json({ matches: [] });
  }
});

// ─── Real upcoming builders (from live API data) ──────────────────────────────

async function buildTennisUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const [odds, liveData] = await Promise.all([getTennisOdds(), getTennisLive()]);

    // Build odds lookup keyed by normalised surname pair so name format differences
    // (e.g. "Andrey Rublev" vs "A. Rublev", "Coco Gauff" vs "C. Gauff") are handled.
    const oddsMapByNorm = new Map<string, typeof odds[0]>();
    for (const e of odds) {
      if (!e.players[0]?.name || !e.players[1]?.name) continue;
      if (e.players[0].name.includes("/") || e.players[1].name.includes("/")) continue;
      oddsMapByNorm.set(_tennisPairKey(e.players[0].name, e.players[1].name), e);
    }

    const seenNorm = new Set<string>(); // normalised dedup across both loops
    const results: UpcomingMatch[] = [];

    // First: matches that have real pre-match odds
    for (const e of odds) {
      if (!e.players[0]?.name || !e.players[1]?.name) continue;
      if (e.players[0].name.includes("/") || e.players[1].name.includes("/")) continue;
      const normKey = _tennisPairKey(e.players[0].name, e.players[1].name);
      if (seenNorm.has(normKey)) continue;
      seenNorm.add(normKey);
      results.push({
        id:          `tennis-${e.matchId}`,
        home:        e.players[0].name,
        away:        e.players[1].name,
        league:      e.tournamentName,
        country:     "",
        ...shiftHour(e.date, e.time),
        sport:       "tennis" as const,
        hasRealOdds: true,
        odds:        { home: e.matchOdds[0], draw: 0, away: e.matchOdds[1] },
        markets:     e.markets as AdvancedMarkets,
      });
    }

    // Second: "Not Started" matches from livescores — cross-reference odds by surname.
    // Matches with real odds get them; Challengers and other matches without real odds
    // use computed odds so real API matches are never dropped.
    for (const tournament of liveData) {
      const matches: TennisMatch[] = Array.isArray(tournament.match)
        ? tournament.match
        : (tournament.match ? [tournament.match] : []);
      for (const m of matches) {
        if (m.status !== "Not Started") continue;
        const players: TennisPlayer[] = Array.isArray(m.player)
          ? m.player
          : (m.player ? [m.player] : []);
        const p0 = players[0];
        const p1 = players[1];
        if (!p0?.name || !p1?.name) continue;
        // Skip doubles (e.g. "Nys/ Roger-Vasselin")
        if (p0.name.includes("/") || p1.name.includes("/")) continue;
        const normKey = _tennisPairKey(p0.name, p1.name);
        if (seenNorm.has(normKey)) continue;
        seenNorm.add(normKey);
        const oddsEntry = oddsMapByNorm.get(normKey);
        if (oddsEntry) {
          // Real odds available (main tour)
          results.push({
            id:          `tennis-ls-${m.id}`,
            home:        p0.name,
            away:        p1.name,
            league:      tournament.name ?? "Ténis",
            country:     "",
            ...shiftHour(m.date, m.time),
            sport:       "tennis" as const,
            hasRealOdds: true,
            odds:        { home: oddsEntry.matchOdds[0], draw: 0, away: oddsEntry.matchOdds[1] },
            markets:     oddsEntry.markets as AdvancedMarkets,
          });
        } else {
          // No real odds (Challengers, ITF, etc.) — compute fair odds from player names
          const sr = seededRng(`tennis-ch:${p0.name}:${p1.name}`);
          const pHome = mc(0.52 + (sr(1) - 0.5) * 0.20, 0.15, 0.85);
          const [compH, compA] = probsToDecimalOdds([pHome, 1 - pHome], 1.06);
          const tennisExtras = computeTennisExtras(pHome);
          results.push({
            id:          `tennis-ch-${m.id}`,
            home:        p0.name,
            away:        p1.name,
            league:      tournament.name ?? "Challenger",
            country:     "",
            ...shiftHour(m.date, m.time),
            sport:       "tennis" as const,
            hasRealOdds: false,
            odds:        { home: compH!, draw: 0, away: compA! },
            markets: {
              doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
              bothTeamsScore: { yes: 0, no: 0 },
              totalGoals: { over05:0, under05:0, over15:0, under15:0, over25:0, under25:0, over35:0, under35:0, over45:0, under45:0, over55:0, under55:0, over65:0, under65:0 },
              handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
              halfTime: { home: 0, draw: 0, away: 0 },
              firstGoal: { home: 0, noGoal: 0, away: 0 },
              tennisExtra: tennisExtras,
            } as unknown as AdvancedMarkets,
          });
        }
      }
    }

    return results.slice(0, 25);
  } catch {
    return [];
  }
}

async function buildBasketballUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const [schedule, oddsArr] = await Promise.all([
      getBasketballSchedule(),
      getBasketballOdds(),
    ]);
    const results: UpcomingMatch[] = [];
    const seen = new Set<string>();

    const oddsMap = new Map<string, NBAOddsEntry>();
    for (const o of oddsArr) {
      if (o.homeTeam.name && o.awayTeam.name) {
        oddsMap.set(`${o.homeTeam.name}|${o.awayTeam.name}`, o);
      }
    }

    for (const m of schedule.upcomingMatches) {
      const key = `${m.home}|${m.away}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isMatchTimePast(m.date, m.time)) continue;
      const realOdds = oddsMap.get(key);
      results.push({
        id: `nba-${m.id}`,
        home: m.home,
        away: m.away,
        league: schedule.league || "NBA",
        country: "usa",
        ...shiftHour(m.date, m.time),
        sport: "basketball",
        hasRealOdds: true,
        odds: realOdds
          ? { home: realOdds.homeOdds, draw: 0, away: realOdds.awayOdds }
          : makeBasketballMarketsFromTeams(m.home, m.away).handicap && { home: 1.9, draw: 0, away: 1.9 } || { home: 1.9, draw: 0, away: 1.9 },
        markets: (realOdds?.markets as AdvancedMarkets) ?? makeBasketballMarketsFromTeams(m.home, m.away),
      });
    }

    for (const o of oddsArr) {
      if (!o.homeTeam.name || !o.awayTeam.name) continue;
      const key = `${o.homeTeam.name}|${o.awayTeam.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        id: `nba-odds-${o.matchId}`,
        home: o.homeTeam.name,
        away: o.awayTeam.name,
        league: "NBA",
        country: "usa",
        ...shiftHour(o.date, o.time),
        sport: "basketball",
        hasRealOdds: true,
        odds: { home: o.homeOdds, draw: 0, away: o.awayOdds },
        markets: (o.markets as AdvancedMarkets) ?? makeBasketballMarketsFromTeams(o.homeTeam.name, o.awayTeam.name),
      });
    }

    return results.slice(0, 10);
  } catch {
    return [];
  }
}

async function buildHockeyUpcoming(): Promise<UpcomingMatch[]> {
  try {
    const [schedule, liveData, oddsArr] = await Promise.all([
      getHockeySchedule(),
      getNHLLive(),
      getHockeyOdds(),
    ]);
    const results: UpcomingMatch[] = [];
    const seen = new Set<string>();

    const oddsMap = new Map<string, HockeyOddsEntry>();
    for (const o of oddsArr) {
      if (o.homeTeam.name && o.awayTeam.name) {
        oddsMap.set(`${o.homeTeam.name}|${o.awayTeam.name}`, o);
      }
    }

    for (const m of schedule.upcomingMatches) {
      const key = `${m.home}|${m.away}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isMatchTimePast(m.date, m.time)) continue;
      const realOdds = oddsMap.get(key);
      results.push({
        id: `nhl-${m.id}`,
        home: m.home,
        away: m.away,
        league: schedule.league || "NHL",
        country: "usa",
        ...shiftHour(m.date, m.time),
        sport: "hockey",
        hasRealOdds: true,
        odds: realOdds
          ? { home: realOdds.homeOdds, draw: realOdds.drawOdds, away: realOdds.awayOdds }
          : { home: 2.1, draw: 3.8, away: 2.1 },
        markets: (realOdds?.markets as AdvancedMarkets) ?? makeHockeyMarketsFromTeams(m.home, m.away),
      });
    }

    const todayD = new Date();
    const tomorrowD = new Date(todayD); tomorrowD.setDate(todayD.getDate() + 1);
    const fmtDate = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    const todayStr = fmtDate(todayD);
    const tomorrowStr = fmtDate(tomorrowD);

    for (const t of liveData) {
      const tMatches = Array.isArray(t.match) ? t.match : (t.match ? [t.match] : []);
      for (const m of tMatches) {
        if (!m || m.status !== "Not Started") continue;
        if (m.date !== todayStr && m.date !== tomorrowStr) continue;
        if (!m.date || isMatchTimePast(m.date, m.time ?? "")) continue;
        const key = `${m.home.name}|${m.away.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const realOdds = oddsMap.get(key);
        results.push({
          id: `nhl-live-${m.id}`,
          home: m.home.name,
          away: m.away.name,
          league: t.league,
          country: t.country,
          ...shiftHour(m.date, m.time ?? "00:00"),
          sport: "hockey",
          hasRealOdds: true,
          odds: realOdds
            ? { home: realOdds.homeOdds, draw: realOdds.drawOdds, away: realOdds.awayOdds }
            : { home: 2.1, draw: 3.8, away: 2.1 },
          markets: (realOdds?.markets as AdvancedMarkets) ?? makeHockeyMarketsFromTeams(m.home.name, m.away.name),
        });
      }
    }

    for (const o of oddsArr) {
      if (!o.homeTeam.name || !o.awayTeam.name) continue;
      const key = `${o.homeTeam.name}|${o.awayTeam.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        id: `nhl-odds-${o.matchId}`,
        home: o.homeTeam.name,
        away: o.awayTeam.name,
        league: "NHL",
        country: "usa",
        ...shiftHour(o.date, o.time),
        sport: "hockey",
        hasRealOdds: true,
        odds: { home: o.homeOdds, draw: o.drawOdds, away: o.awayOdds },
        markets: (o.markets as AdvancedMarkets) ?? makeHockeyMarketsFromTeams(o.homeTeam.name, o.awayTeam.name),
      });
    }

    return results.slice(0, 8);
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
        markets: makeVolleyballMarketsFromTeams(e.homeTeam.name, e.awayTeam.name),
      });
    }

    // No fallback without odds — only show volleyball matches with real odds
    return results;
  } catch {
    return [];
  }
}

// ─── Top-level upcoming cache — 60s TTL so repeated 30s polls are instant ─────
type UpcomingTopCache = {
  football: UpcomingMatch[]; tennis: UpcomingMatch[];
  basketball: UpcomingMatch[]; hockey: UpcomingMatch[];
  volleyball: UpcomingMatch[]; fetchedAt: number;
};
let upcomingTopCache: UpcomingTopCache | null = null;
const UPCOMING_TOP_TTL = 60_000;

async function getUpcomingAll(): Promise<UpcomingTopCache> {
  const now = Date.now();
  if (upcomingTopCache && now - upcomingTopCache.fetchedAt < UPCOMING_TOP_TTL) return upcomingTopCache;
  const empty: UpcomingMatch[] = [];
  const [football, tennis, basketball, hockey, volleyball] = await Promise.all([
    buildUpcomingMatches().catch(() => empty),
    buildTennisUpcoming().catch(() => empty),
    buildBasketballUpcoming().catch(() => empty),
    buildHockeyUpcoming().catch(() => empty),
    buildVolleyballUpcoming().catch(() => empty),
  ]);
  upcomingTopCache = { football, tennis, basketball, hockey, volleyball, fetchedAt: Date.now() };
  return upcomingTopCache;
}

router.get("/upcoming", async (req, res) => {
  const sport = String(req.query["sport"] ?? "all");
  const cache = await getUpcomingAll();
  let matches: UpcomingMatch[];
  if (sport === "football") matches = cache.football;
  else if (sport === "tennis") matches = cache.tennis;
  else if (sport === "basketball") matches = cache.basketball;
  else if (sport === "hockey") matches = cache.hockey;
  else if (sport === "volleyball") matches = cache.volleyball;
  else matches = [...cache.football, ...cache.tennis, ...cache.basketball, ...cache.hockey, ...cache.volleyball];
  res.json({ matches });
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

  // Only attempt Statpal API for football
  if (sport === "football") {
    try {
      const resp = await fetch(`${BASE_V2}/soccer/matches/daily?offset=-1&access_key=${STATSPAL_KEY}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        // Response is date-keyed: { "matches_DD_MM_YYYY": { league: [...] } }
        const data = (await resp.json()) as Record<string, { league?: unknown[] }>;
        const leagueArr = (Object.values(data)[0])?.league;
        const leagues: unknown[] = Array.isArray(leagueArr) ? leagueArr : [];
        for (const league of leagues) {
          if (homeForm.length >= 5 && awayForm.length >= 5) break;
          const lObj = league as Record<string, unknown>;
          const ms: unknown[] = Array.isArray(lObj["match"]) ? (lObj["match"] as unknown[]) : lObj["match"] ? [lObj["match"]] : [];
          for (const m of ms) {
            const mo = m as Record<string, unknown>;
            const mh = mo["home"] as Record<string, unknown> | undefined;
            const ma = mo["away"] as Record<string, unknown> | undefined;
            const hg = parseInt(String(mh?.["goals"] ?? "x"));
            const ag = parseInt(String(ma?.["goals"] ?? "x"));
            if (isNaN(hg) || isNaN(ag)) continue;
            const mhName = String(mh?.["name"] ?? "");
            const maName = String(ma?.["name"] ?? "");
            const homeSlug = home.toLowerCase().slice(0, 5);
            const awaySlug = away.toLowerCase().slice(0, 5);
            if (mhName.toLowerCase().includes(homeSlug) && homeForm.length < 5) {
              homeForm.push({ result: hg > ag ? "W" : hg === ag ? "D" : "L", score: `${hg}-${ag}`, opponent: maName, home: true });
            } else if (maName.toLowerCase().includes(homeSlug) && homeForm.length < 5) {
              homeForm.push({ result: ag > hg ? "W" : ag === hg ? "D" : "L", score: `${ag}-${hg}`, opponent: mhName, home: false });
            }
            if (mhName.toLowerCase().includes(awaySlug) && awayForm.length < 5) {
              awayForm.push({ result: hg > ag ? "W" : hg === ag ? "D" : "L", score: `${hg}-${ag}`, opponent: maName, home: true });
            } else if (maName.toLowerCase().includes(awaySlug) && awayForm.length < 5) {
              awayForm.push({ result: ag > hg ? "W" : ag === hg ? "D" : "L", score: `${ag}-${hg}`, opponent: mhName, home: false });
            }
          }
        }
      }
    } catch { /* use computed fallback */ }
  }

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
  });
});

// ─── Standings endpoint + league data ────────────────────────────────────────

// ─── Known league team lists (for standings generation) ───────────────────────
const LEAGUE_TEAMS: Array<{ patterns: string[]; name: string; teams: string[] }> = [
  { patterns: ["premier league", "england"], name: "Premier League", teams: ["Manchester City","Arsenal","Liverpool","Aston Villa","Tottenham","Chelsea","Newcastle","Manchester Utd","West Ham","Brighton","Wolves","Brentford","Fulham","Everton","Crystal Palace","Nottingham Forest","Bournemouth","Burnley","Luton","Sheffield Utd"] },
  { patterns: ["laliga", "la liga", "primera division", "spain:"], name: "LaLiga", teams: ["Real Madrid","Barcelona","Atletico Madrid","Athletic Club","Real Sociedad","Villarreal","Real Betis","Valencia","Osasuna","Sevilla","Getafe","Rayo Vallecano","Alaves","Celta Vigo","Mallorca","Las Palmas","Girona","Cadiz","Granada","Almeria"] },
  { patterns: ["bundesliga", "germany:"], name: "Bundesliga", teams: ["Bayern Munich","Bayer Leverkusen","RB Leipzig","Borussia Dortmund","VfB Stuttgart","Eintracht Frankfurt","SC Freiburg","B. Monchengladbach","Union Berlin","Hoffenheim","Augsburg","Wolfsburg","Mainz","Bochum","Koln","Werder Bremen","Heidenheim","Darmstadt"] },
  { patterns: ["serie a", "italy:"], name: "Serie A", teams: ["Inter","AC Milan","Juventus","Napoli","Atalanta","AS Roma","SS Lazio","Fiorentina","Bologna","Torino","Monza","Genoa","Lecce","Hellas Verona","Cagliari","Empoli","Frosinone","Udinese","Salernitana","Sassuolo"] },
  { patterns: ["ligue 1", "france:"], name: "Ligue 1", teams: ["PSG","Monaco","Lille","Marseille","Lyon","Nice","Rennes","Lens","Reims","Strasbourg","Toulouse","Montpellier","Brest","Nantes","Metz","Le Havre","Lorient","Clermont","Auxerre","Troyes"] },
  { patterns: ["liga portugal", "portugal:"], name: "Liga Portugal", teams: ["Benfica","Sporting CP","Porto","Braga","Vitoria Guimaraes","Famalicao","Casa Pia","Moreirense","Estoril","Arouca","Vizela","Rio Ave","Boavista","Chaves","Estrela Amadora","Portimonense"] },
  { patterns: ["eredivisie", "netherlands:"], name: "Eredivisie", teams: ["PSV","Feyenoord","Ajax","AZ Alkmaar","FC Twente","Utrecht","Groningen","Heerenveen","Sparta Rotterdam","NEC Nijmegen","Go Ahead Eagles","Heracles","Almere City","RKC Waalwijk","Fortuna Sittard","Excelsior","SC Cambuur","FC Volendam"] },
  { patterns: ["süper lig", "super lig", "turkey:"], name: "Süper Lig", teams: ["Galatasaray","Fenerbahce","Besiktas","Trabzonspor","Basaksehir","Sivasspor","Konyaspor","Antalyaspor","Kasimpasa","Adana Demirspor","Ankaragücü","Gaziantep FK","Kayserispor","Rizespor","Alanyaspor","Samsunspor","Pendikspor","Hatayspor"] },
  { patterns: ["premiership", "scotland:"], name: "Scottish Premiership", teams: ["Celtic","Rangers","Hearts","Hibernian","Aberdeen","Motherwell","St Mirren","Dundee United","Livingston","Ross County","Kilmarnock","St Johnstone"] },
  { patterns: ["super league", "china:"], name: "Super League", teams: ["Shanghai Port","Shandong Taishan","Beijing Guoan","Wuhan Three Towns","Guangzhou FC","Shanghai Shenhua","Tianjin Jinmen Tiger","Shenzhen FC","Zhejiang FC","Changchun Yatai","Qingdao West Coast","Dalian Pro","Meizhou Hakka","Nantong Zhiyun","Henan FC","Chengdu Rongcheng"] },
  { patterns: ["liga 1", "indonesia:"], name: "Liga 1 Indonésia", teams: ["Persib Bandung","Persija Jakarta","Bali United","PSM Makassar","Arema FC","Persebaya Surabaya","Borneo FC","Bhayangkara FC","PSIS Semarang","Persikabo","Barito Putera","Madura United","Dewa United","RANS Nusantara","PSS Sleman","Persita Tangerang"] },
  { patterns: ["jupiler", "belgium:"], name: "Jupiler Pro League", teams: ["Club Brugge","Anderlecht","Union SG","Gent","Antwerp","Standard Liege","Charleroi","Westerlo","OH Leuven","Mechelen","Cercle Brugge","Genk","Sint-Truiden","Eupen","Kortrijk","Zulte Waregem"] },
  { patterns: ["ekstraklasa", "poland:"], name: "Ekstraklasa", teams: ["Legia Warsaw","Rakow Czestochowa","Lech Poznan","Piast Gliwice","Wisla Krakow","Cracovia","Gornik Zabrze","Zagłebie Lubin","Jagiellonia","Slask Wroclaw","Stal Mielec","Korona Kielce","Warta Poznan","Ruch Chorzow","Puszcza Niepolomice","GKS Katowice"] },
  { patterns: ["super league", "greece:"], name: "Super League Grécia", teams: ["Olympiakos","Panathinaikos","PAOK","AEK Athens","Aris","Atromitos","Volos","OFI Crete","Lamia","Panserraikos","Levadiakos","Asteras Tripolis","Giannina","Ionikos"] },
];

function buildLeagueStandings(leagueName: string): { league: string; teams: Array<{ pos: number; name: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; pts: number }> } {
  const slug = leagueName.toLowerCase();
  const found = LEAGUE_TEAMS.find(l => l.patterns.some(p => slug.includes(p))) ?? LEAGUE_TEAMS[0]!;
  const seed = [...found.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (s: number) => { const x = Math.sin(seed * 1234 + s * 7919) * 2654435761; return x - Math.floor(x); };

  const teams = found.teams.map((name, i) => {
    const elo = getTeamElo(name);
    const strength = (elo - 1400) / 600;
    const played = 34 + Math.floor(rng(i * 13 + 1) * 4);
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
    league: found.name,
    teams: teams.map(({ name, played, won, drawn, lost, gf, ga, pts }, i) => ({
      pos: i + 1, name, played, won, drawn, lost, gf, ga, pts,
    })),
  };
}

async function getActiveTournaments(): Promise<ActiveTournament[]> {
  const now = Date.now();
  if (tourListCache && now - tourListFetchedAt < TOUR_CACHE_TTL) return tourListCache;
  const parseDate = (s: string): Date => {
    const [dd, mm, yy] = s.split(".");
    return new Date(+yy!, +mm! - 1, +dd!);
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: ActiveTournament[] = [];
  for (const tour of ["atp", "wta"] as const) {
    try {
      const resp = await fetch(`${BASE_V1}/tennis/tournament-list/${tour}?access_key=${STATSPAL_KEY}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as { tournaments?: { tournament?: TournamentRaw | TournamentRaw[] } };
      const raw = data?.tournaments?.tournament;
      if (!raw) continue;
      const arr = Array.isArray(raw) ? raw : [raw];
      for (const t of arr) {
        try {
          const start = parseDate(t.date_start);
          const end   = parseDate(t.date_end);
          if (start <= today && end >= today) results.push({ ...t, tour });
        } catch { /* skip malformed dates */ }
      }
    } catch { /* skip failed tour */ }
  }
  tourListCache = results;
  tourListFetchedAt = now;
  return results;
}

async function getVolleyballDailyResults(): Promise<VolleyDailyResult[]> {
  const now = Date.now();
  if (volleyResultsCache && now - volleyResultsFetchedAt < RESULTS_CACHE_TTL) return volleyResultsCache;
  try {
    const resp = await fetch(`${BASE_V1}/volleyball/daily/d-1?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return volleyResultsCache ?? [];
    const data = (await resp.json()) as { livescores?: { tournament?: unknown } };
    const raw = data?.livescores?.tournament;
    if (!raw) return volleyResultsCache ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const results: VolleyDailyResult[] = [];
    for (const t of arr as Array<{ id: string; league: string; country: string; match: unknown }>) {
      const matches = Array.isArray(t.match) ? t.match : [t.match];
      for (const m of matches as Array<{ id: string; status: string; time: string; date: string; home: VolleyTeam; away: VolleyTeam }>) {
        if (!m?.status || m.status !== "Finished") continue;
        if (!m.home?.name || !m.away?.name) continue;
        const sfs = ["s1", "s2", "s3", "s4", "s5"] as const;
        const sets: Array<[number, number]> = [];
        for (const sf of sfs) {
          const h = m.home[sf]; const a = m.away[sf];
          if (!h || !a) break;
          sets.push([parseInt(h) || 0, parseInt(a) || 0]);
        }
        const homeSets = parseInt(m.home.totalscore) || 0;
        const awaySets = parseInt(m.away.totalscore) || 0;
        results.push({
          id: m.id, home: m.home.name, away: m.away.name,
          homeSets, awaySets, sets, homeWon: homeSets > awaySets,
          league: t.league, country: t.country ?? "",
          date: m.date, time: m.time,
        });
      }
    }
    volleyResultsCache = results;
    volleyResultsFetchedAt = now;
    return results;
  } catch {
    return volleyResultsCache ?? [];
  }
}

async function getVolleyballStandings(leagueId: string): Promise<VolleyStandingsData | null> {
  const cached = volleyStandingsCache.get(leagueId);
  if (cached && Date.now() - cached.at < VOLLEY_SCHEDULE_TTL) return cached.data;
  try {
    const resp = await fetch(`${BASE_V1}/volleyball/standings/${leagueId}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return null;
    const raw = (await resp.json()) as {
      standings?: {
        country?: string;
        category?: {
          id?: string; name?: string; season?: string;
          league?: { team?: VolleyStandingTeam | VolleyStandingTeam[] };
        };
      };
    };
    const country = raw?.standings?.country ?? "";
    const cat = raw?.standings?.category;
    const teamsRaw = cat?.league?.team;
    const teams = Array.isArray(teamsRaw) ? teamsRaw : (teamsRaw ? [teamsRaw] : []);
    const data: VolleyStandingsData = {
      id: leagueId, name: cat?.name ?? "", season: cat?.season ?? "",
      country, teams,
    };
    volleyStandingsCache.set(leagueId, { data, at: Date.now() });
    return data;
  } catch {
    return null;
  }
}

async function getVolleyballActiveLeagues(): Promise<VolleyLeague[]> {
  const tours = await getVolleyballLive();
  const seen = new Set<string>();
  return tours.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .map(t => ({ id: t.id, gid: t.gid, league: t.league, country: t.country }));
}

async function getVolleyballSchedule(leagueId: string): Promise<VolleyScheduleData | null> {
  const cached = volleyScheduleCache.get(leagueId);
  if (cached && Date.now() - cached.at < VOLLEY_SCHEDULE_TTL) return cached.data;
  try {
    const resp = await fetch(`${BASE_V1}/volleyball/season-schedule/${leagueId}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return null;
    const raw = (await resp.json()) as {
      scores?: {
        country?: string;
        tournament?: { id?: string; league?: string; season?: string; week?: VolleyScheduleWeek | VolleyScheduleWeek[] };
      };
    };
    const t = raw?.scores?.tournament;
    const country = raw?.scores?.country ?? "";
    if (!t) return null;

    const weeksArr = Array.isArray(t.week) ? t.week : (t.week ? [t.week] : []);
    const sfs = ["s1", "s2", "s3", "s4", "s5"] as const;

    const parseFinished = (m: VolleyScheduleMatch): VolleyScheduleEntry => {
      const sets: Array<[number, number]> = [];
      for (const sf of sfs) {
        const h = m.home[sf]; const a = m.away[sf];
        if (!h || !a) break;
        sets.push([parseInt(h) || 0, parseInt(a) || 0]);
      }
      const homeSets = parseInt(m.home.totalscore) || 0;
      const awaySets = parseInt(m.away.totalscore) || 0;
      return { id: m.id, home: m.home.name, away: m.away.name, homeSets, awaySets, sets, homeWon: homeSets > awaySets, date: m.date, time: m.time };
    };

    const recentWeeks: VolleyScheduleData["recentWeeks"] = [];
    let nextWeek: VolleyScheduleData["nextWeek"] = null;

    for (const w of weeksArr) {
      const matches = Array.isArray(w.match) ? w.match : (w.match ? [w.match] : []);
      const allFinished = matches.length > 0 && matches.every(m => m.status === "Finished");
      const hasUpcoming = matches.some(m => m.status === "Not Started");
      if (allFinished) {
        recentWeeks.push({ number: w.number, matches: matches.map(parseFinished) });
      } else if (hasUpcoming && !nextWeek) {
        nextWeek = {
          number: w.number,
          matches: matches.filter(m => m.status === "Not Started")
            .map(m => ({ id: m.id, home: m.home.name, away: m.away.name, date: m.date, time: m.time })),
        };
      }
    }

    const data: VolleyScheduleData = {
      id: leagueId, league: t.league ?? "", season: t.season ?? "", country,
      recentWeeks: recentWeeks.slice(-3), nextWeek,
    };
    volleyScheduleCache.set(leagueId, { data, at: Date.now() });
    return data;
  } catch {
    return null;
  }
}

async function getTennisDailyResults(): Promise<TennisDailyResult[]> {
  const now = Date.now();
  if (tennisResultsCache && now - tennisResultsFetchedAt < RESULTS_CACHE_TTL) return tennisResultsCache;
  try {
    const resp = await fetch(`${BASE_V1}/tennis/daily/d-1?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return tennisResultsCache ?? [];
    const data = (await resp.json()) as { scores?: { tournament?: unknown } };
    const raw = data?.scores?.tournament;
    if (!raw) return tennisResultsCache ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const DONE = new Set(["Finished", "Retired", "Walkover"]);
    const results: TennisDailyResult[] = [];
    for (const t of arr as Array<{ id: string; name: string; match: unknown }>) {
      const matches = Array.isArray(t.match) ? t.match : [t.match];
      for (const m of matches as Array<{ id: string; status: string; time: string; date: string; player: unknown }>) {
        if (!m || !DONE.has(m.status)) continue;
        const players = Array.isArray(m.player) ? m.player : [m.player];
        if (players.length < 2) continue;
        const p0 = players[0] as { name: string; s1: string; s2: string; s3: string; s4: string; s5: string; winner: string; dp1?: string };
        const p1 = players[1] as typeof p0;
        if (!p0 || !p1) continue;
        if (p0.name.includes("/") || p0.dp1) continue; // skip doubles
        const sets: Array<[number, number]> = [];
        for (const sf of ["s1", "s2", "s3", "s4", "s5"] as const) {
          if (p0[sf] !== "" && p1[sf] !== "") sets.push([parseInt(p0[sf]) || 0, parseInt(p1[sf]) || 0]);
        }
        results.push({
          id: m.id, home: p0.name, away: p1.name, sets,
          homeWon: p0.winner === "True", status: m.status,
          tournament: t.name, date: m.date, time: m.time,
        });
      }
    }
    tennisResultsCache = results;
    tennisResultsFetchedAt = now;
    return results;
  } catch {
    return tennisResultsCache ?? [];
  }
}

async function getHockeyDailyResults(): Promise<HockeyDailyResult[]> {
  const now = Date.now();
  if (hockeyResultsCache && now - hockeyResultsFetchedAt < RESULTS_CACHE_TTL) return hockeyResultsCache;
  try {
    const resp = await fetch(`${BASE_V1}/nhl/daily/d-1?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return hockeyResultsCache ?? [];
    const data = (await resp.json()) as { scores?: { tournament?: unknown } };
    const raw = data?.scores?.tournament;
    if (!raw) return hockeyResultsCache ?? [];
    // tournament is a single object for NHL (not an array)
    const arr = Array.isArray(raw) ? raw : [raw];
    const results: HockeyDailyResult[] = [];
    for (const t of arr as Array<{ id: string; league: string; country: string; match: unknown }>) {
      const matches = Array.isArray(t.match) ? t.match : (t.match ? [t.match] : []);
      for (const m of matches as Array<{
        id: string; status: string; date: string; time: string;
        home: { id: string; name: string; totalscore: string };
        away: { id: string; name: string; totalscore: string };
        events?: {
          firstperiod?:  { score?: string };
          secondperiod?: { score?: string };
          thirdperiod?:  { score?: string };
          overtime?:     { score?: string };
          penalties?:    { score?: string };
        };
      }>) {
        if (!m?.status || m.status !== "Finished") continue;
        if (!m.home?.name || !m.away?.name) continue;
        const parseScore = (s: string | undefined): [number, number] | null => {
          if (!s || s.trim() === "") return null;
          const parts = s.split("-").map(p => parseInt(p.trim()) || 0);
          if (parts.length < 2) return null;
          return [parts[0]!, parts[1]!];
        };
        const periods: Array<[number, number]> = [];
        for (const key of ["firstperiod", "secondperiod", "thirdperiod", "overtime", "penalties"] as const) {
          const p = parseScore(m.events?.[key]?.score);
          if (p) periods.push(p);
        }
        const homeScore = parseInt(m.home.totalscore) || 0;
        const awayScore = parseInt(m.away.totalscore) || 0;
        results.push({
          id: m.id, home: m.home.name, away: m.away.name,
          homeScore, awayScore, periods,
          homeWon: homeScore > awayScore,
          league: t.league, country: t.country ?? "",
          date: m.date, time: m.time,
        });
      }
    }
    hockeyResultsCache = results;
    hockeyResultsFetchedAt = now;
    return results;
  } catch {
    return hockeyResultsCache ?? [];
  }
}

async function getBasketballSchedule(): Promise<BasketballScheduleData> {
  const now = Date.now();
  if (basketballScheduleCache && now - basketballScheduleFetchedAt < BBALL_SCHEDULE_TTL) return basketballScheduleCache;
  try {
    const resp = await fetch(`${BASE_V1}/nba/season-schedule?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return basketballScheduleCache ?? { league: "NBA", season: "", upcomingMatches: [], recentMatches: [] };
    const data = (await resp.json()) as { scores?: { tournament?: { league?: string; season?: string; match: unknown } } };
    const t = data?.scores?.tournament;
    if (!t) return basketballScheduleCache ?? { league: "NBA", season: "", upcomingMatches: [], recentMatches: [] };

    let league = t.league ?? "NBA";
    const season = t.season ?? "";
    const rawMatches = Array.isArray(t.match) ? t.match : (t.match ? [t.match] : []);

    const parseDateStr = (s: string): Date => {
      const [d, m, y] = s.split(".");
      return new Date(parseInt(y!), parseInt(m!) - 1, parseInt(d!));
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inDays = (d: Date, n: number) => { const t2 = new Date(today); t2.setDate(t2.getDate() + n); return d <= t2; };

    const FINISHED = new Set(["Finished", "After Over Time", "After Overtime", "After OT", "Awarded", "Final"]);
    const upcomingMatches: BasketballScheduleMatch[] = [];
    const recentMatches: BasketballScheduleMatch[] = [];

    for (const m of rawMatches as Array<{
      id: string; date: string; time: string; status: string; venue?: string;
      home: { name: string; ot?: string; q1?: string; q2?: string; q3?: string; q4?: string; totalscore: string };
      away: { name: string; ot?: string; q1?: string; q2?: string; q3?: string; q4?: string; totalscore: string };
    }>) {
      if (!m?.date || !m.home?.name || !m.away?.name) continue;
      const matchDate = parseDateStr(m.date);
      const homeScore = parseInt(m.home.totalscore) || 0;
      const awayScore = parseInt(m.away.totalscore) || 0;

      const qi = (h: string | undefined, a: string | undefined): [number, number] | null => {
        const hv = parseInt(h ?? "") || 0; const av = parseInt(a ?? "") || 0;
        return (hv > 0 || av > 0) ? [hv, av] : null;
      };
      const quarters: Array<[number, number]> = [];
      for (const [hf, af] of [
        [m.home.q1, m.away.q1], [m.home.q2, m.away.q2],
        [m.home.q3, m.away.q3], [m.home.q4, m.away.q4],
        [m.home.ot, m.away.ot],
      ] as [string | undefined, string | undefined][]) {
        const q = qi(hf, af); if (q) quarters.push(q);
      }

      if (m.status === "Not Started" && matchDate >= today && inDays(matchDate, 21)) {
        upcomingMatches.push({
          id: m.id, date: m.date, time: m.time, status: m.status, venue: m.venue,
          home: m.home.name, away: m.away.name, homeScore: 0, awayScore: 0, quarters: [],
        });
      } else if (FINISHED.has(m.status)) {
        const daysAgo = (today.getTime() - matchDate.getTime()) / 86400000;
        if (daysAgo <= 14 && daysAgo >= 0) {
          recentMatches.push({
            id: m.id, date: m.date, time: m.time, status: m.status, venue: m.venue,
            home: m.home.name, away: m.away.name, homeScore, awayScore, quarters,
            homeWon: homeScore > awayScore,
          });
        }
      }
    }

    const dateKey = (s: string) => { const [d, mo, y] = s.split("."); return `${y}${mo}${d}`; };
    upcomingMatches.sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || a.time.localeCompare(b.time));
    recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

    // Fallback: if season-schedule is empty (e.g. playoffs), pull from livescores
    if (upcomingMatches.length === 0) {
      try {
        const lr = await fetch(`${BASE_V1}/nba/livescores?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
        if (lr.ok) {
          const ld = (await lr.json()) as { livescores?: { tournament?: { league?: string; match?: unknown } } };
          const lt = ld?.livescores?.tournament;
          if (lt) {
            if ((lt as { league?: string }).league) league = (lt as { league?: string }).league!;
            const lm = (lt as { match?: unknown }).match;
            const lms = Array.isArray(lm) ? lm : (lm ? [lm] : []);
            const seenIds = new Set(upcomingMatches.map(x => x.id).concat(recentMatches.map(x => x.id)));
            for (const m of lms as Array<{ id: string; date: string; time: string; status: string; home: { name: string; q1?: string; q2?: string; q3?: string; q4?: string; ot?: string; totalscore: string }; away: { name: string; q1?: string; q2?: string; q3?: string; q4?: string; ot?: string; totalscore: string } }>) {
              if (!m?.id || !m.date || !m.home?.name || seenIds.has(m.id)) continue;
              seenIds.add(m.id);
              const matchDate = parseDateStr(m.date);
              if (m.status === "Not Started" && matchDate >= today && inDays(matchDate, 21)) {
                upcomingMatches.push({ id: m.id, date: m.date, time: m.time, status: m.status, home: m.home.name, away: m.away.name, homeScore: 0, awayScore: 0, quarters: [] });
              } else if (FINISHED.has(m.status)) {
                const daysAgo = (today.getTime() - matchDate.getTime()) / 86400000;
                if (daysAgo <= 14 && daysAgo >= 0) {
                  const hs = parseInt(m.home.totalscore) || 0; const as_ = parseInt(m.away.totalscore) || 0;
                  const qi = (h: string | undefined, a: string | undefined): [number, number] | null => { const hv = parseInt(h ?? "") || 0; const av = parseInt(a ?? "") || 0; return (hv > 0 || av > 0) ? [hv, av] : null; };
                  const qs: Array<[number, number]> = [];
                  for (const [hf, af] of [[m.home.q1, m.away.q1],[m.home.q2, m.away.q2],[m.home.q3, m.away.q3],[m.home.q4, m.away.q4],[m.home.ot, m.away.ot]] as [string|undefined,string|undefined][]) { const q = qi(hf,af); if(q) qs.push(q); }
                  recentMatches.push({ id: m.id, date: m.date, time: m.time, status: m.status, home: m.home.name, away: m.away.name, homeScore: hs, awayScore: as_, quarters: qs, homeWon: hs > as_ });
                }
              }
            }
            upcomingMatches.sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || a.time.localeCompare(b.time));
            recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
          }
        }
      } catch { /* non-critical */ }
    }

    basketballScheduleCache = { league, season, upcomingMatches: upcomingMatches.slice(0, 40), recentMatches: recentMatches.slice(0, 15) };
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
    const resp = await fetch(`${BASE_V1}/nba/daily/d-1?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return basketballResultsCache ?? [];
    const data = (await resp.json()) as { scores?: { tournament?: unknown } };
    const raw = data?.scores?.tournament;
    if (!raw) return basketballResultsCache ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const results: BasketballDailyResult[] = [];
    for (const t of arr as Array<{ id: string; league: string; country: string; match: unknown }>) {
      const matches = Array.isArray(t.match) ? t.match : (t.match ? [t.match] : []);
      for (const m of matches as Array<{
        id: string; status: string; date: string; time: string;
        home: { id: string; name: string; ot?: string; q1?: string; q2?: string; q3?: string; q4?: string; totalscore: string };
        away: { id: string; name: string; ot?: string; q1?: string; q2?: string; q3?: string; q4?: string; totalscore: string };
      }>) {
        if (!m?.status || m.status !== "Finished") continue;
        if (!m.home?.name || !m.away?.name) continue;
        const qi = (h: string | undefined, a: string | undefined): [number, number] | null => {
          const hv = parseInt(h ?? "") || 0; const av = parseInt(a ?? "") || 0;
          return (hv > 0 || av > 0) ? [hv, av] : null;
        };
        const quarters: Array<[number, number]> = [];
        for (const [hf, af] of [
          [m.home.q1, m.away.q1], [m.home.q2, m.away.q2],
          [m.home.q3, m.away.q3], [m.home.q4, m.away.q4],
          [m.home.ot, m.away.ot],
        ] as [string | undefined, string | undefined][]) {
          const q = qi(hf, af);
          if (q) quarters.push(q);
        }
        const homeScore = parseInt(m.home.totalscore) || 0;
        const awayScore = parseInt(m.away.totalscore) || 0;
        const leagueName = t.league.includes("Nba") || t.league.includes("NBA") ? "NBA" : t.league;
        results.push({
          id: m.id, home: m.home.name, away: m.away.name,
          homeScore, awayScore, quarters,
          homeWon: homeScore > awayScore,
          league: leagueName, country: t.country ?? "",
          date: m.date, time: m.time,
        });
      }
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
    const resp = await fetch(`${BASE_V1}/nhl/season-schedule?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return hockeyScheduleCache ?? { league: "NHL", season: "", upcomingMatches: [], recentMatches: [] };
    const data = (await resp.json()) as { scores?: { tournament?: { league?: string; season?: string; match: unknown } } };
    const t = data?.scores?.tournament;
    if (!t) return hockeyScheduleCache ?? { league: "NHL", season: "", upcomingMatches: [], recentMatches: [] };

    let league = t.league ?? "NHL";
    const season = t.season ?? "";
    const rawMatches = Array.isArray(t.match) ? t.match : (t.match ? [t.match] : []);

    // Date helpers: "DD.MM.YYYY" → Date
    const parseDateStr = (s: string): Date => {
      const [d, m, y] = s.split(".");
      return new Date(parseInt(y!), parseInt(m!) - 1, parseInt(d!));
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inDays = (d: Date, n: number) => { const t = new Date(today); t.setDate(t.getDate() + n); return d <= t; };

    const parseScore = (s: string | undefined): [number, number] | null => {
      if (!s || s.trim() === "") return null;
      const parts = s.split("-").map(p => parseInt(p.trim()));
      if (parts.length < 2 || isNaN(parts[0]!) || isNaN(parts[1]!)) return null;
      return [parts[0]!, parts[1]!];
    };

    const parseTeamStats = (raw: Record<string, unknown> | undefined | null): NHLTeamStats | null => {
      if (!raw) return null;
      const shots = raw["shots"] as Record<string, string> | undefined;
      const saves = raw["saves"] as Record<string, string> | undefined;
      const goals = raw["goals"] as Record<string, string> | undefined;
      const faceoffs = raw["faceoffs"] as Record<string, string> | undefined;
      const penalties = raw["penalties"] as Record<string, string> | undefined;
      return {
        shotsOnGoal: parseInt(shots?.["ongoal"] ?? "0") || 0,
        savesPct: parseInt(saves?.["saves_pct"] ?? "0") || 0,
        ppGoals: parseInt(goals?.["pp_goals"] ?? "0") || 0,
        ppPct: parseInt(goals?.["pp_pct"] ?? "0") || 0,
        penKillPct: parseInt(goals?.["pen_kill_pct"] ?? "0") || 0,
        faceoffPct: parseInt(faceoffs?.["pct"] ?? "0") || 0,
        penaltyMinutes: parseInt(penalties?.["minutes"] ?? "0") || 0,
      };
    };

    const FINISHED = new Set(["Finished", "After Penalties", "After Overtime", "Awarded"]);
    const upcomingMatches: HockeyScheduleMatch[] = [];
    const recentMatches: HockeyScheduleMatch[] = [];

    for (const m of rawMatches as Array<{
      id: string; date: string; time: string; status: string; venue?: string;
      home: { name: string; totalscore: string };
      away: { name: string; totalscore: string };
      events?: {
        firstperiod?:  { score?: string };
        secondperiod?: { score?: string };
        thirdperiod?:  { score?: string };
        overtime?:     { score?: string };
        penalties?:    { score?: string };
      };
      team_stats?: { home?: unknown; away?: unknown };
    }>) {
      if (!m?.date || !m.home?.name || !m.away?.name) continue;
      const matchDate = parseDateStr(m.date);
      const homeScore = parseInt(m.home.totalscore) || 0;
      const awayScore = parseInt(m.away.totalscore) || 0;
      const periods: Array<[number, number]> = [];
      for (const key of ["firstperiod", "secondperiod", "thirdperiod", "overtime", "penalties"] as const) {
        const p = parseScore(m.events?.[key]?.score);
        if (p) periods.push(p);
      }

      if (m.status === "Not Started" && matchDate >= today && inDays(matchDate, 21)) {
        upcomingMatches.push({
          id: m.id, date: m.date, time: m.time, status: m.status, venue: m.venue,
          home: m.home.name, away: m.away.name, homeScore: 0, awayScore: 0, periods: [],
        });
      } else if (FINISHED.has(m.status)) {
        const daysAgo = (today.getTime() - matchDate.getTime()) / 86400000;
        if (daysAgo <= 14 && daysAgo >= 0) {
          const homeStats = parseTeamStats(m.team_stats?.home as Record<string, unknown> | null);
          const awayStats = parseTeamStats(m.team_stats?.away as Record<string, unknown> | null);
          recentMatches.push({
            id: m.id, date: m.date, time: m.time, status: m.status, venue: m.venue,
            home: m.home.name, away: m.away.name, homeScore, awayScore, periods,
            homeWon: homeScore > awayScore,
            ...(homeStats && awayStats ? { teamStats: { home: homeStats, away: awayStats } } : {}),
          });
        }
      }
    }

    // Sort upcoming by date asc, recent by date desc
    const dateKey = (s: string) => { const [d, mo, y] = s.split("."); return `${y}${mo}${d}`; };
    upcomingMatches.sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || a.time.localeCompare(b.time));
    recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

    // Fallback: if season-schedule is empty (e.g. playoffs), pull from livescores
    if (upcomingMatches.length === 0) {
      try {
        const lr = await fetch(`${BASE_V1}/nhl/livescores?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
        if (lr.ok) {
          const ld = (await lr.json()) as { livescores?: { tournament?: { league?: string; match?: unknown } } };
          const lt = ld?.livescores?.tournament;
          if (lt) {
            if ((lt as { league?: string }).league) league = (lt as { league?: string }).league!;
            const lm = (lt as { match?: unknown }).match;
            const lms = Array.isArray(lm) ? lm : (lm ? [lm] : []);
            const seenIds = new Set(upcomingMatches.map(x => x.id).concat(recentMatches.map(x => x.id)));
            const LIVE_FIN = new Set(["Finished", "After Penalties", "After Overtime"]);
            for (const m of lms as Array<{ id: string; fix_id?: string; date: string; time: string; status: string; home: { name: string; totalscore: string }; away: { name: string; totalscore: string }; events?: { firstperiod?: { score?: string }; secondperiod?: { score?: string }; thirdperiod?: { score?: string }; overtime?: { score?: string }; penalties?: { score?: string } } }>) {
              if (!m?.id || !m.date || !m.home?.name || seenIds.has(m.id)) continue;
              seenIds.add(m.id);
              const matchDate = parseDateStr(m.date);
              if (m.status === "Not Started" && matchDate >= today && inDays(matchDate, 21)) {
                upcomingMatches.push({ id: m.id, date: m.date, time: m.time, status: m.status, home: m.home.name, away: m.away.name, homeScore: 0, awayScore: 0, periods: [] });
              } else if (LIVE_FIN.has(m.status)) {
                const daysAgo = (today.getTime() - matchDate.getTime()) / 86400000;
                if (daysAgo <= 14 && daysAgo >= 0) {
                  const hs = parseInt(m.home.totalscore) || 0; const as_ = parseInt(m.away.totalscore) || 0;
                  const periods: Array<[number, number]> = [];
                  for (const key of ["firstperiod", "secondperiod", "thirdperiod", "overtime", "penalties"] as const) {
                    const sc = m.events?.[key]?.score; if (!sc) continue;
                    const ps = sc.split("-").map((p: string) => parseInt(p.trim())); if (ps.length >= 2 && !isNaN(ps[0]!) && !isNaN(ps[1]!)) periods.push([ps[0]!, ps[1]!]);
                  }
                  recentMatches.push({ id: m.id, date: m.date, time: m.time, status: m.status, home: m.home.name, away: m.away.name, homeScore: hs, awayScore: as_, periods, homeWon: hs > as_ });
                }
              }
            }
            upcomingMatches.sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || a.time.localeCompare(b.time));
            recentMatches.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
          }
        }
      } catch { /* non-critical */ }
    }

    hockeyScheduleCache = { league, season, upcomingMatches: upcomingMatches.slice(0, 30), recentMatches: recentMatches.slice(0, 15) };
    hockeyScheduleFetchedAt = now;
    return hockeyScheduleCache;
  } catch {
    return hockeyScheduleCache ?? { league: "NHL", season: "", upcomingMatches: [], recentMatches: [] };
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
  if (cached && Date.now() - cached.at < TOUR_DETAIL_TTL) return cached.data;

  const resp = await fetch(`${BASE_V1}/tennis/tournament/${id}?access_key=${STATSPAL_KEY}`, {
    signal: AbortSignal.timeout(9000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    scores?: {
      tournament?: {
        id?: string; league?: string; season?: string;
        week?: Array<{
          number?: string; qualification?: string;
          match?: Array<{
            id?: string; status?: string; date?: string; time?: string; court?: string;
            player?: Array<{ id?: string; name?: string; totalscore?: string;
              s1?: string; s2?: string; s3?: string; s4?: string; s5?: string;
              winner?: string; serve?: string; }>;
          }> | {
            id?: string; status?: string; date?: string; time?: string; court?: string;
            player?: Array<{ id?: string; name?: string; totalscore?: string;
              s1?: string; s2?: string; s3?: string; s4?: string; s5?: string;
              winner?: string; serve?: string; }>;
          };
        }> | {
          number?: string; qualification?: string;
          match?: unknown;
        };
      };
    };
  };

  const t = data?.scores?.tournament;
  const leagueVal = t?.league ?? "";
  const seasonVal = t?.season ?? "";
  const rawWeeks = t?.week;
  const weeks = !rawWeeks ? [] : Array.isArray(rawWeeks) ? rawWeeks : [rawWeeks];

  const seen = new Set<string>();
  const matches: TournamentMatch[] = [];

  for (const week of weeks) {
    if (week.qualification === "True") continue; // skip qualifying
    const rawRound = week.number ?? "";
    const roundName = rawRound.includes(" - ") ? rawRound.split(" - ").slice(1).join(" - ").toLowerCase() : rawRound.toLowerCase();
    const roundOrder = ROUND_ORDER[roundName] ?? 99;
    const rawMatches = week.match;
    if (!rawMatches) continue;
    const matchArr = Array.isArray(rawMatches) ? rawMatches : [rawMatches];
    for (const m of matchArr) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      const rawPlayers: Array<{ id?: string; name?: string; totalscore?: string; s1?: string; s2?: string; s3?: string; s4?: string; s5?: string; winner?: string; serve?: string; }> = (m.player as typeof rawPlayers | undefined) ?? [];
      const players: TournamentMatchPlayer[] = rawPlayers.map(p => ({
        id: p.id ?? "", name: p.name ?? "",
        totalscore: p.totalscore ?? "",
        s1: p.s1 ?? "", s2: p.s2 ?? "", s3: p.s3 ?? "", s4: p.s4 ?? "", s5: p.s5 ?? "",
        winner: p.winner === "True",
        serve: p.serve === "True",
      }));
      matches.push({
        id: m.id, status: m.status ?? "", date: m.date ?? "", time: m.time ?? "", court: m.court ?? "",
        round: roundName, roundOrder, players,
      });
    }
  }

  // Sort by round order, then date+time
  matches.sort((a, b) => {
    if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
    const da = a.date.split(".").reverse().join("") + a.time;
    const db = b.date.split(".").reverse().join("") + b.time;
    return da.localeCompare(db);
  });

  const detail: TournamentDetail = { id, league: leagueVal, season: seasonVal, matches };
  tourDetailCache.set(id, { data: detail, at: Date.now() });
  return detail;
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
  const now = Date.now();
  if (standingsCache && now - standingsFetchedAt < STANDINGS_CACHE_TTL) return standingsCache;
  const fetchTour = async (tour: "atp" | "wta"): Promise<StandingPlayer[]> => {
    try {
      const resp = await fetch(`${BASE_V1}/tennis/standings/${tour}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return [];
      const data = (await resp.json()) as { standings?: { player?: StandingPlayer | StandingPlayer[] } };
      const raw = data?.standings?.player;
      if (!raw) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.slice(0, 100); // top 100 per tour
    } catch { return []; }
  };
  const [atp, wta] = await Promise.all([fetchTour("atp"), fetchTour("wta")]);
  standingsCache = { atp, wta };
  standingsFetchedAt = now;
  return standingsCache;
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

async function getHockeyStandings(): Promise<NHLStandingsData> {
  const now = Date.now();
  if (hockeyStandingsCache && now - hockeyStandingsFetchedAt < HOCKEY_STANDINGS_TTL) return hockeyStandingsCache;
  try {
    const resp = await fetch(`${BASE_V1}/nhl/standings?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return hockeyStandingsCache ?? { season: "", conferences: [] };
    const json = (await resp.json()) as {
      standings?: {
        tournament?: {
          season?: string;
          league?: Array<{
            name: string;
            division?: Array<{
              name: string;
              team?: Array<{
                id: string; name: string; position: string;
                games_played: string; won: string; lost: string; ot_losses: string;
                points: string; goals_for: string; goals_against: string;
                difference: string; streak: string; last_ten: string;
                home_record: string; road_record: string;
              }>;
            }>;
          }>;
        };
      };
    };
    const t = json.standings?.tournament;
    if (!t) return hockeyStandingsCache ?? { season: "", conferences: [] };
    const season = t.season ?? "";
    const leagues = Array.isArray(t.league) ? t.league : t.league ? [t.league] : [];
    const conferences: NHLStandingsConference[] = leagues.map(conf => {
      const divs = Array.isArray(conf.division) ? conf.division : conf.division ? [conf.division] : [];
      const divisions: NHLStandingsDivision[] = divs.map(div => {
        const teams = Array.isArray(div.team) ? div.team : div.team ? [div.team] : [];
        return {
          name: div.name,
          teams: teams.map(t2 => ({
            id: t2.id,
            name: t2.name,
            abbr: NHL_ABBR[t2.name] ?? t2.name.toLowerCase().replace(/\s+/g, "").slice(0, 3),
            position: parseInt(t2.position) || 0,
            gp: parseInt(t2.games_played) || 0,
            won: parseInt(t2.won) || 0,
            lost: parseInt(t2.lost) || 0,
            otLosses: parseInt(t2.ot_losses) || 0,
            points: parseInt(t2.points) || 0,
            gf: parseInt(t2.goals_for) || 0,
            ga: parseInt(t2.goals_against) || 0,
            diff: t2.difference ?? "0",
            streak: t2.streak ?? "",
            lastTen: t2.last_ten ?? "",
            homeRecord: t2.home_record ?? "",
            roadRecord: t2.road_record ?? "",
          })).sort((a, b) => a.position - b.position),
        };
      });
      return { name: conf.name, divisions };
    });
    hockeyStandingsCache = { season, conferences };
    hockeyStandingsFetchedAt = now;
    return hockeyStandingsCache;
  } catch {
    return hockeyStandingsCache ?? { season: "", conferences: [] };
  }
}

router.get("/hockey-standings", async (_req, res) => {
  try {
    const data = await getHockeyStandings();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

async function getNBAStandings(): Promise<NBAStandingsData> {
  const now = Date.now();
  if (nbaStandingsCache && now - nbaStandingsFetchedAt < NBA_STANDINGS_TTL) return nbaStandingsCache;
  try {
    const resp = await fetch(`${BASE_V1}/nba/standings?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return nbaStandingsCache ?? { season: "", conferences: [] };
    const json = (await resp.json()) as {
      standings?: {
        tournament?: {
          season?: string;
          league?: Array<{
            name: string;
            division?: Array<{
              name: string;
              team?: Array<{
                id: string; name: string; position: string;
                won: string; lost: string; percentage: string; gb: string;
                streak: string; last_10: string;
                home_record: string; road_record: string;
                average_points_for: string; average_points_agains: string;
                difference: string;
              }>;
            }>;
          }>;
        };
      };
    };
    const t = json.standings?.tournament;
    if (!t) return nbaStandingsCache ?? { season: "", conferences: [] };
    const season = t.season ?? "";
    const leagues = Array.isArray(t.league) ? t.league : t.league ? [t.league] : [];
    const conferences: NBAStandingsConference[] = leagues.map(conf => {
      const divs = Array.isArray(conf.division) ? conf.division : conf.division ? [conf.division] : [];
      const divisions: NBAStandingsDivision[] = divs.map(div => {
        const teams = Array.isArray(div.team) ? div.team : div.team ? [div.team] : [];
        return {
          name: div.name,
          teams: teams.map(t2 => ({
            id: t2.id,
            name: t2.name,
            abbr: NBA_ABBR[t2.name] ?? t2.name.toLowerCase().replace(/\s+/g, "").slice(0, 3),
            position: parseInt(t2.position) || 0,
            won: parseInt(t2.won) || 0,
            lost: parseInt(t2.lost) || 0,
            pct: t2.percentage ?? ".000",
            gb: t2.gb ?? "-",
            streak: t2.streak ?? "",
            lastTen: t2.last_10 ?? "",
            homeRecord: t2.home_record ?? "",
            roadRecord: t2.road_record ?? "",
            ppg: parseFloat(t2.average_points_for || "0").toFixed(1),
            papg: parseFloat(t2.average_points_agains || "0").toFixed(1),
            diff: t2.difference ?? "0",
          })).sort((a, b) => a.position - b.position),
        };
      });
      return { name: conf.name, divisions };
    });
    nbaStandingsCache = { season, conferences };
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
  const now = Date.now();
  const cached = nbaRosterCache.get(abbr);
  const fetchedAt = nbaRosterFetchedAt.get(abbr) ?? 0;
  if (cached && now - fetchedAt < NBA_ROSTER_TTL) return cached;
  try {
    const resp = await fetch(`${BASE_V1}/nba/rosters/${abbr}?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return cached ?? null;
    const json = (await resp.json()) as {
      team?: {
        name?: string; abbreviation?: string; season?: string;
        player?: Array<{
          id: string; name: string; number?: string; age?: string;
          position?: string; college?: string;
          heigth?: string; weigth?: string; salary?: string;
        }> | {
          id: string; name: string; number?: string; age?: string;
          position?: string; college?: string;
          heigth?: string; weigth?: string; salary?: string;
        };
      };
    };
    const t = json.team;
    if (!t) return cached ?? null;
    const rawPlayers = Array.isArray(t.player) ? t.player : t.player ? [t.player] : [];
    const data: NBATeamRoster = {
      teamName: t.name ?? abbr,
      abbreviation: t.abbreviation ?? abbr.toUpperCase(),
      season: t.season ?? "",
      players: rawPlayers.map(p => ({
        id: p.id,
        name: p.name,
        number: p.number ?? "",
        age: parseInt(p.age ?? "0") || 0,
        position: p.position ?? "",
        college: p.college ?? "",
        height: p.heigth ?? "",
        weight: p.weigth ?? "",
        salary: p.salary ?? "",
      })).sort((a, b) => {
        const ORDER: Record<string, number> = { G: 0, "G-F": 1, "F-G": 2, F: 3, "F-C": 4, "C-F": 5, C: 6 };
        return (ORDER[a.position] ?? 7) - (ORDER[b.position] ?? 7) || a.name.localeCompare(b.name);
      }),
    };
    nbaRosterCache.set(abbr, data);
    nbaRosterFetchedAt.set(abbr, now);
    return data;
  } catch {
    return cached ?? null;
  }
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
  const now = Date.now();
  const cached = nbaTeamStatsCache.get(abbr);
  const fetchedAt = nbaTeamStatsFetchedAt.get(abbr) ?? 0;
  if (cached && now - fetchedAt < NBA_TEAM_STATS_TTL) return cached;
  try {
    const resp = await fetch(`${BASE_V1}/nba/team-stats/${abbr}?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return cached ?? null;
    const json = (await resp.json()) as {
      statistics?: {
        team?: string; id?: string;
        category?: Array<{ name: string; player?: unknown[] | unknown }>;
      };
    };
    const stats = json.statistics;
    if (!stats) return cached ?? null;
    const teamName = stats.team ?? abbr.toUpperCase();
    const categories = Array.isArray(stats.category) ? stats.category : stats.category ? [stats.category] : [];

    // index by player id for merging
    const byId = new Map<string, Record<string, string>>();
    for (const cat of categories) {
      const rawPlayers = Array.isArray(cat.player) ? cat.player : cat.player ? [cat.player] : [];
      for (const p of rawPlayers as Record<string, string>[]) {
        const pid = p["id"] ?? "";
        if (!byId.has(pid)) byId.set(pid, {});
        Object.assign(byId.get(pid)!, p);
      }
    }

    const players: NBAPlayerStat[] = [...byId.values()].map(p => ({
      id: p["id"] ?? "",
      rank: parseInt(p["rank"] ?? "0") || 0,
      name: p["name"] ?? "",
      gp: parseInt(p["games_played"] ?? "0") || 0,
      gs: parseInt(p["games_started"] ?? "0") || 0,
      min: parseFloat(p["minutes"] ?? "0").toFixed(1),
      ppg: parseFloat(p["points_per_game"] ?? "0").toFixed(1),
      apg: parseFloat(p["assists_per_game"] ?? "0").toFixed(1),
      rpg: parseFloat(p["rebounds_per_game"] ?? "0").toFixed(1),
      orpg: parseFloat(p["offensive_rebounds_per_game"] ?? "0").toFixed(1),
      drpg: parseFloat(p["defensive_rebounds_per_game"] ?? "0").toFixed(1),
      bpg: parseFloat(p["blocks_per_game"] ?? "0").toFixed(1),
      spg: parseFloat(p["steals_per_game"] ?? "0").toFixed(1),
      topg: parseFloat(p["turnovers_per_game"] ?? "0").toFixed(1),
      fpg: parseFloat(p["fouls_per_game"] ?? "0").toFixed(1),
      fgPct: p["fg_pct"] ? (parseFloat(p["fg_pct"]) * 100).toFixed(1) : "—",
      fg3Pct: p["three_point_pct"] ? (parseFloat(p["three_point_pct"]) * 100).toFixed(1) : "—",
      ftPct: p["free_throws_pct"] ? (parseFloat(p["free_throws_pct"]) * 100).toFixed(1) : "—",
      fgm: parseFloat(p["fg_made_per_game"] ?? "0").toFixed(1),
      fga: parseFloat(p["fg_attempts_per_game"] ?? "0").toFixed(1),
      fg3m: parseFloat(p["three_point_made_per_game"] ?? "0").toFixed(1),
      fg3a: parseFloat(p["three_point_attempts_per_game"] ?? "0").toFixed(1),
      ftm: parseFloat(p["free_throws_made_per_game"] ?? "0").toFixed(1),
      fta: parseFloat(p["free_throws_attempts_per_game"] ?? "0").toFixed(1),
    })).sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));

    const data: NBATeamStatsData = { teamName, players };
    nbaTeamStatsCache.set(abbr, data);
    nbaTeamStatsFetchedAt.set(abbr, now);
    return data;
  } catch {
    return cached ?? null;
  }
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
  const now = Date.now();
  const cached = hockeyRosterCache.get(abbr);
  const fetchedAt = hockeyRosterFetchedAt.get(abbr) ?? 0;
  if (cached && now - fetchedAt < HOCKEY_ROSTER_TTL) return cached;
  try {
    const resp = await fetch(`${BASE_V1}/nhl/rosters/${abbr}?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return cached ?? null;
    const json = (await resp.json()) as {
      team?: {
        name?: string; abbreviation?: string; season?: string;
        position?: Array<{ name: string; player?: Array<{
          id: string; name: string; number?: string; age?: string;
          birth_place?: string; height?: string; weight?: string;
          shot?: string; salarycap?: string;
        }> | { id: string; name: string; number?: string; age?: string; birth_place?: string; height?: string; weight?: string; shot?: string; salarycap?: string; } }>;
      };
    };
    const t = json.team;
    if (!t) return cached ?? null;
    const positions = Array.isArray(t.position) ? t.position : t.position ? [t.position] : [];
    const data: NHLRosterData = {
      teamName: t.name ?? abbr,
      abbreviation: t.abbreviation ?? abbr.toUpperCase(),
      season: t.season ?? "",
      positions: positions.map(p => {
        const rawPlayers = Array.isArray(p.player) ? p.player : p.player ? [p.player] : [];
        return {
          name: p.name,
          players: rawPlayers.map(pl => ({
            id: pl.id,
            name: pl.name,
            number: pl.number ?? "",
            age: parseInt(pl.age ?? "0") || 0,
            birthPlace: pl.birth_place ?? "",
            height: pl.height ?? "",
            weight: pl.weight ?? "",
            shot: pl.shot ?? "",
            salary: pl.salarycap ?? "",
          })),
        };
      }),
    };
    hockeyRosterCache.set(abbr, data);
    hockeyRosterFetchedAt.set(abbr, now);
    return data;
  } catch {
    return cached ?? null;
  }
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
  const now = Date.now();
  const cached = hockeyTeamStatsCache.get(abbr);
  const fetchedAt = hockeyTeamStatsFetchedAt.get(abbr) ?? 0;
  if (cached && now - fetchedAt < HOCKEY_TEAM_STATS_TTL) return cached;
  try {
    const resp = await fetch(`${BASE_V1}/nhl/team-stats/${abbr}?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return cached ?? null;
    const json = (await resp.json()) as {
      statistics?: {
        season?: string;
        team?: [string, { player?: unknown[] }] | unknown[];
        goalkeepers?: { player?: unknown[] } | { player?: unknown };
      };
    };
    const stats = json.statistics;
    if (!stats) return cached ?? null;

    const teamArr = Array.isArray(stats.team) ? stats.team : [];
    const teamName = typeof teamArr[0] === "string" ? teamArr[0] : abbr.toUpperCase();
    const skaterObj = teamArr[1] as { player?: unknown[] } | undefined;
    const rawSkaters = Array.isArray(skaterObj?.player) ? skaterObj.player : [];

    const skaters: NHLSkaterStat[] = (rawSkaters as Record<string, string>[]).map(p => ({
      id: p["id"] ?? "",
      rank: parseInt(p["rank"] ?? "0") || 0,
      name: p["name"] ?? "",
      pos: p["pos"] ?? "",
      gp: parseInt(p["games_played"] ?? "0") || 0,
      goals: parseInt(p["goals"] ?? "0") || 0,
      assists: parseInt(p["assists"] ?? "0") || 0,
      points: parseInt(p["points"] ?? "0") || 0,
      plusMinus: parseInt(p["plus_minus"] ?? "0") || 0,
      pim: parseInt(p["penalty_minutes"] ?? "0") || 0,
      ppg: parseInt(p["pp_goals"] ?? "0") || 0,
      ppa: parseInt(p["pp_assists"] ?? "0") || 0,
      shg: parseInt(p["sh_goals"] ?? "0") || 0,
      sha: parseInt(p["sh_assists"] ?? "0") || 0,
      shots: parseInt(p["shots"] ?? "0") || 0,
      gwg: parseInt(p["game_winning_goals"] ?? "0") || 0,
      toiPerGame: p["toi_per_game"] ?? "",
      faceoffPct: p["faceoffs_pct"] ?? "",
    })).sort((a, b) => a.rank - b.rank);

    const gkObj = stats.goalkeepers;
    const rawGoalies = gkObj
      ? Array.isArray((gkObj as { player?: unknown[] }).player)
        ? (gkObj as { player: unknown[] }).player
        : (gkObj as { player?: unknown }).player
          ? [(gkObj as { player: unknown }).player]
          : []
      : [];

    const goalies: NHLGoalieStat[] = (rawGoalies as Record<string, string>[]).map(g => ({
      id: g["id"] ?? "",
      rank: parseInt(g["rank"] ?? "0") || 0,
      name: g["name"] ?? "",
      gp: parseInt(g["games_played"] ?? "0") || 0,
      wins: parseInt(g["wins"] ?? "0") || 0,
      losses: parseInt(g["losses"] ?? "0") || 0,
      otLosses: parseInt(g["ot_losses"] ?? "0") || 0,
      saves: parseInt(g["saves"] ?? "0") || 0,
      savesPct: g["saves_pct"] ?? "",
      gaa: g["goals_against_diff"] ?? "",
      shotsAgainst: parseInt(g["total_shots_against"] ?? "0") || 0,
      goalsAgainst: parseInt(g["total_goals_against"] ?? "0") || 0,
      shutouts: parseInt(g["shutouts"] ?? "0") || 0,
      toi: g["time_on_ice"] ?? "",
    })).sort((a, b) => a.rank - b.rank);

    const data: NHLTeamStatsData = { teamName, season: stats.season ?? "", skaters, goalies };
    hockeyTeamStatsCache.set(abbr, data);
    hockeyTeamStatsFetchedAt.set(abbr, now);
    return data;
  } catch {
    return cached ?? null;
  }
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
  const now = Date.now();
  const cached = hockeyInjuriesCache.get(abbr);
  const fetchedAt = hockeyInjuriesFetchedAt.get(abbr) ?? 0;
  if (cached && now - fetchedAt < HOCKEY_INJURIES_TTL) return cached;
  try {
    const resp = await fetch(`${BASE_V1}/nhl/injuries/${abbr}?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return cached ?? null;
    const json = (await resp.json()) as {
      team?: {
        id?: string; name?: string;
        report?: Array<{ player_name?: string; player_id?: string; status?: string; description?: string; date?: string }> | { player_name?: string; player_id?: string; status?: string; description?: string; date?: string };
      };
    };
    const t = json.team;
    if (!t) return cached ?? null;
    const raw = Array.isArray(t.report) ? t.report : t.report ? [t.report] : [];
    const data: NHLInjuriesData = {
      teamName: t.name ?? abbr,
      report: raw.map(r => ({
        playerName: r.player_name ?? "",
        playerId: r.player_id ?? "",
        status: r.status ?? "",
        description: r.description ?? "",
        date: r.date ?? "",
      })),
    };
    hockeyInjuriesCache.set(abbr, data);
    hockeyInjuriesFetchedAt.set(abbr, now);
    return data;
  } catch {
    return cached ?? null;
  }
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
  const now = Date.now();
  const cached = nbaInjuriesCache.get(abbr);
  const fetchedAt = nbaInjuriesFetchedAt.get(abbr) ?? 0;
  if (cached && now - fetchedAt < NBA_INJURIES_TTL) return cached;
  try {
    const resp = await fetch(`${BASE_V1}/nba/injuries/${abbr}?access_key=${STATSPAL_KEY}`);
    if (!resp.ok) return cached ?? null;
    const json = (await resp.json()) as {
      team?: {
        id?: string; name?: string;
        report?: Array<{ player_name?: string; player_id?: string; status?: string; description?: string; date?: string }>
                | { player_name?: string; player_id?: string; status?: string; description?: string; date?: string };
      };
    };
    const t = json.team;
    if (!t) return cached ?? null;
    const raw = Array.isArray(t.report) ? t.report : t.report ? [t.report] : [];
    const data: NBAInjuriesData = {
      teamName: t.name ?? abbr,
      report: raw.map(r => ({
        playerName: r.player_name ?? "",
        playerId: r.player_id ?? "",
        status: r.status ?? "",
        description: r.description ?? "",
        date: r.date ?? "",
      })),
    };
    nbaInjuriesCache.set(abbr, data);
    nbaInjuriesFetchedAt.set(abbr, now);
    return data;
  } catch {
    return cached ?? null;
  }
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
  const now = Date.now();
  if (volleyOddsCache && now - volleyOddsFetchedAt < VOLLEY_ODDS_TTL) return volleyOddsCache;
  let resp: Response;
  try {
    resp = await fetch(`${BASE_V1}/volleyball/odds?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  } catch {
    return volleyOddsCache ?? [];
  }
  if (!resp.ok) return volleyOddsCache ?? [];
  const data = (await resp.json()) as { odds?: { tournament?: unknown } };
  const rawTours = data?.odds?.tournament;
  if (!rawTours) return [];
  const tours = (Array.isArray(rawTours) ? rawTours : [rawTours]) as VolleyOddsTour[];

  // Average decimal odds across bookmakers then apply 2.5% house margin
  const avgOdd = (bks: VolleyOddsBk[], nameFilter: "Home" | "Away"): number => {
    const vals: number[] = [];
    for (const bk of bks) {
      if (bk.stop === "True") continue;
      const odds = Array.isArray(bk.odd) ? bk.odd : (bk.odd ? [bk.odd] : []);
      const o = odds.find(o => o.name === nameFilter);
      const v = parseFloat(o?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
  };

  const results: VolleyOddsEntry[] = [];
  const seen = new Set<string>();

  for (const t of tours) {
    const rawMatches = t.matches?.match;
    if (!rawMatches) continue;
    const matches = Array.isArray(rawMatches) ? rawMatches : [rawMatches];
    for (const m of matches) {
      if (!m.id || seen.has(m.id)) continue;
      if (m.status !== "Not Started") continue;
      seen.add(m.id);
      const rawTypes = m.odds?.type;
      const types: VolleyOddsType[] = !rawTypes ? [] : Array.isArray(rawTypes) ? rawTypes : [rawTypes];

      // Home/Away odds
      const haType = types.find(tp => tp.value === "Home/Away");
      if (!haType) continue;
      const haBks = (Array.isArray(haType.bookmaker) ? haType.bookmaker : haType.bookmaker ? [haType.bookmaker] : []) as VolleyOddsBk[];
      const h = avgOdd(haBks, "Home");
      const a = avgOdd(haBks, "Away");
      if (!h || !a) continue;

      // Over/Under line 3.5 (match goes 4+ sets)
      let overUnder: VolleyOddsEntry["overUnder"] = null;
      const ouType = types.find(tp => tp.value === "Over/Under");
      if (ouType) {
        const ouBks = (Array.isArray(ouType.bookmaker) ? ouType.bookmaker : ouType.bookmaker ? [ouType.bookmaker] : []) as VolleyOddsBk[];
        for (const bk of ouBks) {
          const totals = (Array.isArray(bk.total) ? bk.total : bk.total ? [bk.total] : []) as VolleyOddsTotal[];
          const t35 = totals.find(t => t.name === "3.5");
          if (t35) {
            const odds35 = Array.isArray(t35.odd) ? t35.odd : (t35.odd ? [t35.odd] : []);
            const over = odds35.find(o => o.name === "Over");
            const under = odds35.find(o => o.name === "Under");
            if (over?.value && under?.value) {
              overUnder = {
                line: "3.5",
                over: Math.max(1.01, Math.round(parseFloat(over.value) * 0.975 * 100) / 100),
                under: Math.max(1.01, Math.round(parseFloat(under.value) * 0.975 * 100) / 100),
              };
              break;
            }
          }
        }
      }

      results.push({
        matchId: m.id, date: m.date ?? "", time: m.time ?? "",
        league: t.league ?? "",
        homeTeam: { id: m.home?.id ?? "", name: m.home?.name ?? "" },
        awayTeam: { id: m.away?.id ?? "", name: m.away?.name ?? "" },
        homeOdds: h, awayOdds: a, overUnder,
      });
    }
  }
  const fresh = results.filter(r => !isMatchTimePast(r.date, r.time));
  volleyOddsCache = fresh;
  volleyOddsFetchedAt = now;
  return fresh;
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

async function getBasketballOdds(): Promise<NBAOddsEntry[]> {
  const now = Date.now();
  if (nbaOddsCache && now - nbaOddsFetchedAt < NBA_ODDS_TTL) return nbaOddsCache;
  let resp: Response;
  try {
    resp = await fetch(`${BASE_V1}/nba/odds?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  } catch {
    return nbaOddsCache ?? [];
  }
  if (!resp.ok) return nbaOddsCache ?? [];
  const data = (await resp.json()) as { odds?: { category?: { matches?: { match?: NBAOddsMatch | NBAOddsMatch[] } } } };
  const rawMatches = data?.odds?.category?.matches?.match;
  if (!rawMatches) return [];
  const matches = Array.isArray(rawMatches) ? rawMatches : [rawMatches];

  const avgOdd = (bks: NBAOddsBk[], name: string): number => {
    const vals: number[] = [];
    for (const bk of bks) {
      if (bk.stop === "True") continue;
      const odds = Array.isArray(bk.odd) ? bk.odd : (bk.odd ? [bk.odd] : []);
      const o = odds.find(o => o.name === name);
      const v = parseFloat(o?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
  };
  const getHA = (types: NBAOddsType[], typeValue: string): { home: number; away: number } | undefined => {
    const t = types.find(tp => tp.value === typeValue);
    if (!t) return undefined;
    const bks = (Array.isArray(t.bookmaker) ? t.bookmaker : t.bookmaker ? [t.bookmaker] : []) as NBAOddsBk[];
    const h = avgOdd(bks, "Home"); const a = avgOdd(bks, "Away");
    return (h && a) ? { home: h, away: a } : undefined;
  };

  const results: NBAOddsEntry[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (!m.id || seen.has(m.id)) continue;
    if (m.status !== "Not Started") continue;
    seen.add(m.id);
    const rawTypes = m.odds?.type;
    const types: NBAOddsType[] = !rawTypes ? [] : Array.isArray(rawTypes) ? rawTypes : [rawTypes];
    const threeWay = types.find(tp => tp.value === "3Way Result");
    if (!threeWay) continue;
    const bks = (Array.isArray(threeWay.bookmaker) ? threeWay.bookmaker : threeWay.bookmaker ? [threeWay.bookmaker] : []) as NBAOddsBk[];
    const h = avgOdd(bks, "Home");
    const a = avgOdd(bks, "Away");
    if (!h || !a) continue;
    const halfOdds = getHA(types, "Home/Away - 1st Half");
    const q1Odds   = getHA(types, "Home/Away - 1st Qtr");
    const q2Odds   = getHA(types, "Home/Away - 2nd Qtr");
    const q3Odds   = getHA(types, "Home/Away - 3rd Qtr");
    const q4Odds   = getHA(types, "Home/Away - 4th Qtr");
    const homeName = m.home?.name ?? "";
    const awayName = m.away?.name ?? "";
    const mkt = makeBasketballMarketsFromTeams(homeName, awayName) as Record<string, unknown>;
    mkt["odds"] = { home: h, draw: 0, away: a };
    if (halfOdds) mkt["halfTime"] = { home: halfOdds.home, draw: 0, away: halfOdds.away };
    const bExtra = (mkt["basketballExtra"] as Record<string, unknown>) ?? {};
    if (q1Odds) bExtra["q1"] = { home: q1Odds.home, away: q1Odds.away };
    if (q2Odds) bExtra["q2"] = { home: q2Odds.home, away: q2Odds.away };
    if (q3Odds) bExtra["q3"] = { home: q3Odds.home, away: q3Odds.away };
    if (q4Odds) bExtra["q4"] = { home: q4Odds.home, away: q4Odds.away };
    mkt["basketballExtra"] = bExtra;
    results.push({
      matchId: m.id, date: m.date ?? "", time: m.time ?? "",
      homeTeam: { id: m.home?.id ?? "", name: homeName },
      awayTeam: { id: m.away?.id ?? "", name: awayName },
      homeOdds: h, awayOdds: a,
      halfOdds, q1Odds, q2Odds, q3Odds, q4Odds,
      markets: mkt,
    });
  }
  const fresh = results.filter(r => !isMatchTimePast(r.date, r.time));
  nbaOddsCache = fresh;
  nbaOddsFetchedAt = now;
  return fresh;
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

async function getHockeyOdds(): Promise<HockeyOddsEntry[]> {
  const now = Date.now();
  if (hockeyOddsCache && now - hockeyOddsFetchedAt < HOCKEY_ODDS_TTL) return hockeyOddsCache;
  let resp: Response;
  try {
    resp = await fetch(`${BASE_V1}/nhl/odds?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  } catch {
    return hockeyOddsCache ?? [];
  }
  if (!resp.ok) return hockeyOddsCache ?? [];
  const data = (await resp.json()) as { odds?: { category?: { matches?: { match?: HockeyOddsMatch | HockeyOddsMatch[] } } } };
  const rawMatches = data?.odds?.category?.matches?.match;
  if (!rawMatches) return [];
  const matches = Array.isArray(rawMatches) ? rawMatches : [rawMatches];

  const avgOdd = (bks: HockeyOddsBk[], name: string): number => {
    const vals: number[] = [];
    for (const bk of bks) {
      if (bk.stop === "True") continue;
      const odds = Array.isArray(bk.odd) ? bk.odd : (bk.odd ? [bk.odd] : []);
      const o = odds.find(o => o.name === name);
      const v = parseFloat(o?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
  };
  const getBks = (types: HockeyOddsType[], typeValue: string): HockeyOddsBk[] => {
    const t = types.find(tp => tp.value === typeValue);
    if (!t) return [];
    return (Array.isArray(t.bookmaker) ? t.bookmaker : t.bookmaker ? [t.bookmaker] : []) as HockeyOddsBk[];
  };
  const getHDA = (types: HockeyOddsType[], typeValue: string): { home: number; draw: number; away: number } | undefined => {
    const bks = getBks(types, typeValue);
    const h = avgOdd(bks, "Home"); const d = avgOdd(bks, "Draw"); const a = avgOdd(bks, "Away");
    return (h && a) ? { home: h, draw: d || 0, away: a } : undefined;
  };

  const results: HockeyOddsEntry[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (!m.id || seen.has(m.id)) continue;
    if (m.status !== "Not Started") continue;
    seen.add(m.id);
    const rawTypes = m.odds?.type;
    const types: HockeyOddsType[] = !rawTypes ? [] : Array.isArray(rawTypes) ? rawTypes : [rawTypes];
    const threeWay = types.find(tp => tp.value === "3Way Result");
    if (!threeWay) continue;
    const bks = (Array.isArray(threeWay.bookmaker) ? threeWay.bookmaker : threeWay.bookmaker ? [threeWay.bookmaker] : []) as HockeyOddsBk[];
    const h = avgOdd(bks, "Home");
    const d = avgOdd(bks, "Draw");
    const a = avgOdd(bks, "Away");
    if (!h || !a) continue;
    // BTTS
    const bttsBks = getBks(types, "Both Teams To Score");
    const bttsYes = avgOdd(bttsBks, "Yes"); const bttsNo = avgOdd(bttsBks, "No");
    const btts = (bttsYes && bttsNo) ? { yes: bttsYes, no: bttsNo } : undefined;
    // Double Chance
    const dcBks = getBks(types, "Double Chance");
    const dcHD = avgOdd(dcBks, "Home/Draw"); const dcHA = avgOdd(dcBks, "Home/Away"); const dcDA = avgOdd(dcBks, "Draw/Away");
    const doubleChance = (dcHD && dcHA && dcDA) ? { homeOrDraw: dcHD, homeOrAway: dcHA, drawOrAway: dcDA } : undefined;
    const p1Odds = getHDA(types, "1x2 (1st Period)");
    const p2Odds = getHDA(types, "3Way Result (2st Period)");
    const p3Odds = getHDA(types, "3Way Result 3rdPeriod)");
    const homeName = m.home?.name ?? "";
    const awayName = m.away?.name ?? "";
    const mkt = makeHockeyMarketsFromTeams(homeName, awayName) as Record<string, unknown>;
    mkt["odds"] = { home: h, draw: d || 0, away: a };
    if (p1Odds) mkt["halfTime"] = p1Odds;
    if (btts) mkt["bothTeamsScore"] = btts;
    if (doubleChance) mkt["doubleChance"] = { homeOrDraw: doubleChance.homeOrDraw, awayOrDraw: doubleChance.drawOrAway, homeOrAway: doubleChance.homeOrAway };
    const hExtra = (mkt["hockeyExtra"] as Record<string, unknown>) ?? {};
    if (p2Odds) hExtra["period2"] = p2Odds;
    if (p3Odds) hExtra["period3"] = p3Odds;
    if (btts) hExtra["bothTeamsScoreGame"] = btts;
    mkt["hockeyExtra"] = hExtra;
    results.push({
      matchId: m.id, date: m.date ?? "", time: m.time ?? "",
      homeTeam: { id: m.home?.id ?? "", name: homeName },
      awayTeam: { id: m.away?.id ?? "", name: awayName },
      homeOdds: h, drawOdds: d || 0, awayOdds: a,
      btts, doubleChance, p1Odds, p2Odds, p3Odds,
      markets: mkt,
    });
  }
  const fresh = results.filter(r => !isMatchTimePast(r.date, r.time));
  hockeyOddsCache = fresh;
  hockeyOddsFetchedAt = now;
  return fresh;
}

router.get("/hockey-odds", async (_req, res) => {
  try {
    const odds = await getHockeyOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de hockey indisponíveis" });
  }
});

async function getTennisOdds(): Promise<TennisOddsEntry[]> {
  const now = Date.now();
  if (tennisOddsCache && now - tennisOddsFetchedAt < TENNIS_ODDS_TTL) return tennisOddsCache;
  let resp: Response;
  try {
    resp = await fetch(`${BASE_V1}/tennis/odds?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  } catch {
    return tennisOddsCache ?? [];
  }
  if (!resp.ok) return tennisOddsCache ?? [];
  const data = (await resp.json()) as { odds?: { tournament?: unknown } };
  const rawTours = data?.odds?.tournament;
  if (!rawTours) return [];
  const tours = Array.isArray(rawTours) ? rawTours : [rawTours];

  type RawOdd   = { name?: string; value?: string };
  type RawTotal = { name?: string; stop?: string; odd?: RawOdd | RawOdd[] };
  type RawBk    = { stop?: string; odd?: RawOdd | RawOdd[]; total?: RawTotal | RawTotal[] };
  type RawType  = { value?: string; bookmaker?: RawBk | RawBk[] };
  type RawMatch = { id?: string; date?: string; time?: string; status?: string; player?: Array<{ id?: string; name?: string }>; odds?: { type?: RawType | RawType[] } };
  type RawTour  = { name?: string; matches?: { match?: RawMatch | RawMatch[] } };

  const getBks = (types: RawType[], typeValue: string): RawBk[] => {
    const t = types.find(tp => tp.value === typeValue);
    if (!t) return [];
    return (Array.isArray(t.bookmaker) ? t.bookmaker : t.bookmaker ? [t.bookmaker] : []) as RawBk[];
  };
  const margin = (v: number) => Math.max(1.01, Math.round(v * 0.975 * 100) / 100);
  const avgArr = (vals: number[]) => vals.length ? margin(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;

  // Average odds by name then index (Home=0, Away=1) — for simple 2-way markets
  // Some bookmakers provide a single-odd object (e.g. only the underdog "Away" value).
  // We prefer name-based lookup so a single "Away" odd never pollutes the home average.
  const avgIdx = (bks: RawBk[], idx: 0 | 1): number => {
    const vals: number[] = [];
    const idxName = idx === 0 ? "Home" : "Away";
    for (const bk of bks) {
      if (bk.stop === "True") continue;
      const isArr = Array.isArray(bk.odd);
      const odds: RawOdd[] = isArr ? (bk.odd as RawOdd[]) : (bk.odd ? [bk.odd as RawOdd] : []);
      // Prefer lookup by name; fall back to positional index only for un-named array odds
      const byName = odds.find(o => o.name === idxName);
      const o = byName ?? (isArr ? odds[idx] : undefined);
      const v = parseFloat(o?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    return avgArr(vals);
  };
  // Average odds by name (for Home/Away (2nd Set), Odd/Even, Set Betting, etc.)
  const avgName = (types: RawType[], typeValue: string, oddName: string): number => {
    const vals: number[] = [];
    for (const bk of getBks(types, typeValue)) {
      if (bk.stop === "True") continue;
      const odds = Array.isArray(bk.odd) ? bk.odd : (bk.odd ? [bk.odd] : []);
      const o = odds.find(o => o.name === oddName);
      const v = parseFloat(o?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    return avgArr(vals);
  };
  // Parse Over/Under market with totals — picks the most represented line
  const parseTotal = (types: RawType[], typeValue: string, overName = "Over", underName = "Under"): { line: number; over: number; under: number } | undefined => {
    const lineMap = new Map<number, { overs: number[]; unders: number[] }>();
    for (const bk of getBks(types, typeValue)) {
      if (bk.stop === "True") continue;
      const totals = Array.isArray(bk.total) ? bk.total : (bk.total ? [bk.total] : []);
      for (const tot of totals) {
        if (tot.stop === "True") continue;
        const line = parseFloat(tot.name ?? "0");
        if (!line) continue;
        const odds = Array.isArray(tot.odd) ? tot.odd : (tot.odd ? [tot.odd] : []);
        const o = odds.find(o => o.name === overName);  const u = odds.find(o => o.name === underName);
        const ov = parseFloat(o?.value ?? "0"); const uv = parseFloat(u?.value ?? "0");
        if (ov > 1 && uv > 1) {
          if (!lineMap.has(line)) lineMap.set(line, { overs: [], unders: [] });
          lineMap.get(line)!.overs.push(ov); lineMap.get(line)!.unders.push(uv);
        }
      }
    }
    if (!lineMap.size) return undefined;
    let bestLine = 0, bestCount = 0;
    for (const [line, { overs }] of lineMap) { if (overs.length > bestCount) { bestCount = overs.length; bestLine = line; } }
    const { overs, unders } = lineMap.get(bestLine)!;
    return { line: bestLine, over: avgArr(overs), under: avgArr(unders) };
  };
  // Collect all named odds averaged across bookmakers (for Set Betting, Set/Match, Correct Score)
  const allNames = (types: RawType[], typeValue: string): Record<string, number> => {
    const nameMap = new Map<string, number[]>();
    for (const bk of getBks(types, typeValue)) {
      if (bk.stop === "True") continue;
      const odds = Array.isArray(bk.odd) ? bk.odd : (bk.odd ? [bk.odd] : []);
      for (const o of odds) {
        const v = parseFloat(o?.value ?? "0");
        if (v > 1 && o.name) { if (!nameMap.has(o.name)) nameMap.set(o.name, []); nameMap.get(o.name)!.push(v); }
      }
    }
    const res: Record<string, number> = {};
    for (const [name, vals] of nameMap) res[name] = avgArr(vals);
    return res;
  };
  const topScores = (types: RawType[], typeValue: string, n = 8): Array<{ label: string; odds: number }> =>
    Object.entries(allNames(types, typeValue)).map(([label, odds]) => ({ label, odds })).sort((a, b) => a.odds - b.odds).slice(0, n);

  const results: TennisOddsEntry[] = [];
  const seen = new Set<string>();

  for (const rawTour of tours as RawTour[]) {
    const rawMatches = rawTour.matches?.match;
    if (!rawMatches) continue;
    const matches = Array.isArray(rawMatches) ? rawMatches : [rawMatches];
    for (const m of matches) {
      if (!m.id || seen.has(m.id)) continue;
      // Include upcoming AND in-play matches; exclude only Finished/retired/unknown
      const EXCLUDE_STATUSES = new Set(["Finished", "9", "Retired", "Walkover", "Cancelled"]);
      if (EXCLUDE_STATUSES.has(m.status ?? "")) continue;
      seen.add(m.id);
      const rawTypes = m.odds?.type;
      const types: RawType[] = !rawTypes ? [] : Array.isArray(rawTypes) ? rawTypes : [rawTypes];

      // Match winner
      const hwBks = getBks(types, "Home/Away");
      const h = avgIdx(hwBks, 0); const a = avgIdx(hwBks, 1);
      if (!h || !a) continue;

      // 1st set winner
      const s1Bks = getBks(types, "Home/Away (1st Set)");
      const s1h = avgIdx(s1Bks, 0); const s1a = avgIdx(s1Bks, 1);
      const set1Odds: [number, number] | null = (s1h && s1a) ? [s1h, s1a] : null;

      // 2nd set winner
      const s2h = avgName(types, "Home/Away (2nd Set)", "Home"); const s2a = avgName(types, "Home/Away (2nd Set)", "Away");

      // Odd/Even
      const oeOdd = avgName(types, "Odd/Even", "Odd");         const oeEven = avgName(types, "Odd/Even", "Even");
      const oe1Odd = avgName(types, "Odd/Even (1st Set)", "Odd"); const oe1Even = avgName(types, "Odd/Even (1st Set)", "Even");
      const oe2Odd = avgName(types, "Odd/Even (2nd Set)", "Odd"); const oe2Even = avgName(types, "Odd/Even (2nd Set)", "Even");

      // Win at least one set
      const wal1Yes = avgName(types, "Win at least one set (Player 1)", "Yes"); const wal1No = avgName(types, "Win at least one set (Player 1)", "No");
      const wal2Yes = avgName(types, "Win at least one set (Player 2)", "Yes"); const wal2No = avgName(types, "Win at least one set (Player 2)", "No");

      // Set Betting (exact sets)
      const sb = allNames(types, "Set Betting");
      // Set/Match combo
      const smAll = allNames(types, "Set / Match");

      // Total games O/U
      const totalGamesOdds = parseTotal(types, "Over/Under by Games in Match");
      const set1GamesOdds  = parseTotal(types, "Over/Under (1st Set)");
      const set2GamesOdds  = parseTotal(types, "Over/Under by Games (2nd Set)");
      const homePlayerOdds = parseTotal(types, "Total - Home");
      const awayPlayerOdds = parseTotal(types, "Total - Away");
      const setsOU         = parseTotal(types, "Over/Under");  // Sets O/U (line 2.5)

      // Correct Score 1st / 2nd set (top 8)
      const sc1 = topScores(types, "Correct Score 1st Half");
      const sc2 = topScores(types, "Correct Score 2nd Half");

      // Build tennisExtra
      const tExtra = {
        firstSet: set1Odds ? { home: set1Odds[0], away: set1Odds[1] } : { home: 0, away: 0 },
        set2: (s2h && s2a) ? { home: s2h, away: s2a } : { home: 0, away: 0 },
        set3: { home: 0, away: 0 },
        exactSets: { h20: sb["2:0"] ?? 0, h21: sb["2:1"] ?? 0, a02: sb["0:2"] ?? 0, a12: sb["1:2"] ?? 0 },
        setHandicap: { home: 0, away: 0 },
        totalGames: totalGamesOdds ?? { line: 0, over: 0, under: 0 },
        totalGamesLines: totalGamesOdds ? [totalGamesOdds] : [],
        set1Games: set1GamesOdds ?? { line: 0, over: 0, under: 0 },
        gameHandicap: { line: 0, home: 0, away: 0 },
        set2Games: set2GamesOdds,
        homePlayerGames: homePlayerOdds,
        awayPlayerGames: awayPlayerOdds,
        oddEvenGames: (oeOdd && oeEven) ? { odd: oeOdd, even: oeEven } : undefined,
        oddEven1st:   (oe1Odd && oe1Even) ? { odd: oe1Odd, even: oe1Even } : undefined,
        oddEven2nd:   (oe2Odd && oe2Even) ? { odd: oe2Odd, even: oe2Even } : undefined,
        winAtLeast1P1: (wal1Yes && wal1No) ? { yes: wal1Yes, no: wal1No } : undefined,
        winAtLeast1P2: (wal2Yes && wal2No) ? { yes: wal2Yes, no: wal2No } : undefined,
        setMatch: Object.keys(smAll).length ? { h11: smAll["1/1"] ?? 0, h12: smAll["1/2"] ?? 0, a21: smAll["2/1"] ?? 0, a22: smAll["2/2"] ?? 0 } : undefined,
        score1st: sc1.length ? sc1 : undefined,
        score2nd: sc2.length ? sc2 : undefined,
      };

      const p = m.player ?? [];
      // Cache pre-match/in-play odds by player pair so buildTennisLiveMatches can use them
      if (p[0]?.name && p[1]?.name) {
        _tennisPreMatchOdds.set(_tennisPairKey(p[0].name, p[1].name), { home: h, away: a });
      }
      results.push({
        matchId: m.id,
        date: m.date ?? "", time: m.time ?? "",
        tournamentName: rawTour.name ?? "",
        players: [{ id: p[0]?.id ?? "", name: p[0]?.name ?? "" }, { id: p[1]?.id ?? "", name: p[1]?.name ?? "" }],
        matchOdds: [h, a], set1Odds,
        markets: {
          doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
          bothTeamsScore: { yes: 0, no: 0 },
          totalGoals: {
            over05: 0, under05: 0,
            over15: set1Odds ? set1Odds[0] : 0, under15: set1Odds ? set1Odds[1] : 0,
            over25: setsOU?.over ?? 0, under25: setsOU?.under ?? 0,
            over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
          },
          handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
          halfTime: { home: 0, draw: 0, away: 0 },
          firstGoal: { home: 0, noGoal: 0, away: 0 },
          tennisExtra: tExtra,
        },
      });
    }
  }
  const fresh = results.filter(r => !isMatchTimePast(r.date, r.time));
  tennisOddsCache = fresh;
  tennisOddsFetchedAt = now;
  return fresh;
}

router.get("/tennis-odds", async (_req, res) => {
  try {
    const odds = await getTennisOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de ténis indisponíveis" });
  }
});

router.get("/standings", async (req, res) => {
  const league = String(req.query["league"] ?? "");
  try {
    const standing = buildLeagueStandings(league);
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
  const now = Date.now();
  if (footballLeaguesCache && now - footballLeaguesFetchedAt < FOOTBALL_LEAGUES_TTL) return footballLeaguesCache;
  const resp = await fetch(`${BASE_V2}/soccer/leagues/seasons?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as { league?: unknown };
  const rawLeagues = data?.league;
  if (!rawLeagues) return [];
  const leagues = Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues];
  const results: FootballLeague[] = [];
  for (const l of leagues) {
    const lo = l as Record<string, unknown>;
    const id = String(lo["id"] ?? "");
    const name = String(lo["name"] ?? "");
    const country = String(lo["country"] ?? "");
    const season = String(lo["season"] ?? "");
    const isCurrent = String(lo["is_current"] ?? "False") === "True";
    if (id && name) results.push({ id, name, country, season, isCurrent });
  }
  footballLeaguesCache = results;
  footballLeaguesFetchedAt = now;
  return results;
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
  const now = Date.now();
  const cached = footballScheduleCache.get(id);
  if (cached && now - cached.fetchedAt < FOOTBALL_SCHEDULE_TTL) return { weeks: cached.data, meta: cached.meta };
  const resp = await fetch(`${BASE_V2}/soccer/leagues/${encodeURIComponent(id)}/matches?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballScheduleRaw;
  const tour = data?.matches?.tournament;
  if (!tour) throw new Error("Calendário não encontrado");
  const meta = { league: tour.league ?? "", season: tour.season ?? "", country: data.matches?.country ?? "" };
  const rawWeeks = tour.week;
  const weeks: FootballScheduleWeek[] = !rawWeeks ? [] : Array.isArray(rawWeeks) ? rawWeeks : [rawWeeks];
  const weeksOut: FootballScheduleWeekOut[] = weeks.map(w => {
    const rawMatches = w.match;
    const matches: FootballScheduleMatch[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];
    return { number: parseInt(w.number) || 0, matches: matches.map(parseFootballMatch) };
  });
  footballScheduleCache.set(id, { data: weeksOut, meta, fetchedAt: now });
  return { weeks: weeksOut, meta };
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
  const now = Date.now();
  const cached = footballMatchStatsCache.get(leagueId);
  if (cached && now - cached.fetchedAt < FOOTBALL_MATCH_STATS_TTL) return cached.data as object;
  const resp = await fetch(`${BASE_V2}/soccer/leagues/${encodeURIComponent(leagueId)}/matches/stats?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const raw = (await resp.json()) as FootballMatchStatsRaw;
  const ms = raw["match-stats"];
  const tour = ms?.tournament;
  const m = tour?.matches;
  if (!m) throw new Error("Estatísticas não encontradas");

  const toPlayers = (raw2: FootballMatchStatsPlayer | FootballMatchStatsPlayer[] | undefined) => normMatchStatsList(raw2);
  const toGoals   = (raw2: FootballMatchStatsEventGoal | FootballMatchStatsEventGoal[] | undefined) => normMatchStatsList(raw2);
  const toCards   = (raw2: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] | undefined) => normMatchStatsList(raw2);
  const toVar     = (raw2: FootballMatchStatsEventVar  | FootballMatchStatsEventVar[]  | undefined) => normMatchStatsList(raw2);
  const toSubs    = (raw2: FootballMatchStatsSub | FootballMatchStatsSub[] | undefined) => normMatchStatsList(raw2);

  const parseHalfStat = (s?: { total: string; total_h1: string; total_h2: string }) =>
    s ? { total: parseFloat(s.total) || 0, h1: parseFloat(s.total_h1) || 0, h2: parseFloat(s.total_h2) || 0 } : null;

  type EventSide = {
    goals?: { event: FootballMatchStatsEventGoal | FootballMatchStatsEventGoal[] };
    yellowcards?: { event: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] };
    redcards?: { event: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] } | string;
    var?: { event: FootballMatchStatsEventVar | FootballMatchStatsEventVar[] } | string;
  } | undefined;
  const parseGoalEvents = (side: EventSide) => {
    const goals = typeof side?.goals === "object" ? toGoals(side.goals?.event) : [];
    const yellows = typeof side?.yellowcards === "object" ? toCards((side.yellowcards as { event?: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] })?.event) : [];
    const reds = side?.redcards && typeof side.redcards === "object" ? toCards((side.redcards as { event?: FootballMatchStatsEventCard | FootballMatchStatsEventCard[] })?.event) : [];
    const varEvents = side?.var && typeof side.var === "object" ? toVar((side.var as { event?: FootballMatchStatsEventVar | FootballMatchStatsEventVar[] })?.event) : [];
    return { goals, yellowCards: yellows, redCards: reds, varEvents };
  };

  const result = {
    matchId: m.main_id,
    date: m.date,
    time: m.time,
    status: m.status,
    tournament: { id: tour?.id ?? "", name: tour?.name ?? "" },
    stadium: m.match_info?.stadium?.name ?? null,
    referee: m.match_info?.referee?.name ?? null,
    addedTime: m.match_info?.time ? { p1: m.match_info.time.added_time_period_1, p2: m.match_info.time.added_time_period_2 } : null,
    homeTeam: { id: m.home.id, name: m.home.name, goals: parseInt(m.home.goals) || 0 },
    awayTeam: { id: m.away.id, name: m.away.name, goals: parseInt(m.away.goals) || 0 },
    htScore: m.ht ? { home: parseInt(m.ht.home_goals) || 0, away: parseInt(m.ht.away_goals) || 0 } : null,
    ftScore: m.ft ? { home: parseInt(m.ft.home_goals) || 0, away: parseInt(m.ft.away_goals) || 0 } : null,
    etScore: m.et ? { home: parseInt(m.et.home_goals) || 0, away: parseInt(m.et.away_goals) || 0 } : null,
    penScore: m.penalties ? { home: parseInt(m.penalties.home_pen) || 0, away: parseInt(m.penalties.away_pen) || 0 } : null,
    lineups: {
      home: { formation: m.lineups?.home?.formation ?? "", players: toPlayers(m.lineups?.home?.player) },
      away: { formation: m.lineups?.away?.formation ?? "", players: toPlayers(m.lineups?.away?.player) },
    },
    bench: {
      home: toPlayers(m.bench?.home?.player),
      away: toPlayers(m.bench?.away?.player),
    },
    substitutions: {
      home: toSubs(m.substitutions?.home?.substitution),
      away: toSubs(m.substitutions?.away?.substitution),
    },
    teamColors: m.team_colors ?? null,
    teamStats: {
      home: { corners: parseHalfStat(m.team_stats?.home?.corners), xg: parseHalfStat(m.team_stats?.home?.expected_goals), fouls: parseInt(m.team_stats?.home?.fouls?.total ?? "0") || 0 },
      away: { corners: parseHalfStat(m.team_stats?.away?.corners), xg: parseHalfStat(m.team_stats?.away?.expected_goals), fouls: parseInt(m.team_stats?.away?.fouls?.total ?? "0") || 0 },
    },
    playerStats: {
      home: toPlayers(m.player_stats?.home?.player),
      away: toPlayers(m.player_stats?.away?.player),
    },
    events: {
      home: parseGoalEvents(m.event_summary?.home),
      away: parseGoalEvents(m.event_summary?.away),
    },
  };

  footballMatchStatsCache.set(leagueId, { data: result, fetchedAt: now });
  return result;
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
  const now = Date.now();
  const cached = footballStandingsCache.get(leagueId);
  if (cached && now - cached.fetchedAt < FOOTBALL_STANDINGS_TTL) return { teams: cached.data, meta: cached.meta };
  const resp = await fetch(`${BASE_V2}/soccer/leagues/${encodeURIComponent(leagueId)}/standings?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballStandingsRaw;
  const tour = data?.standings?.tournament;
  if (!tour) throw new Error("Classificação não encontrada");
  const meta = { id: tour.id, league: tour.league, season: tour.season, country: data.standings?.country ?? "" };
  const rawTeams = tour.team;
  const teams: FootballStandingsTeamRaw[] = !rawTeams ? [] : Array.isArray(rawTeams) ? rawTeams : [rawTeams];
  const pi = (s: string | undefined) => parseInt(s ?? "0") || 0;
  const out: FootballStandingsTeam[] = teams.map(t => ({
    position:    pi(t.position),
    name:        t.name,
    id:          t.id,
    status:      t.status,
    recentForm:  t.recent_form,
    gp:          pi(t.overall?.games_played),
    wins:        pi(t.overall?.wins),
    draws:       pi(t.overall?.draws),
    losses:      pi(t.overall?.losses),
    goalsFor:    pi(t.overall?.goals_scored),
    goalsAgainst:pi(t.overall?.goals_allowed),
    goalDiff:    pi(t.total?.goal_difference),
    points:      pi(t.total?.points),
    home: {
      gp:          pi(t.home?.games_played),
      wins:        pi(t.home?.wins),
      draws:       pi(t.home?.draws),
      losses:      pi(t.home?.losses),
      goalsFor:    pi(t.home?.goals_scored),
      goalsAgainst:pi(t.home?.goals_allowed),
    },
    away: {
      gp:          pi(t.away?.games_played),
      wins:        pi(t.away?.wins),
      draws:       pi(t.away?.draws),
      losses:      pi(t.away?.losses),
      goalsFor:    pi(t.away?.goals_scored),
      goalsAgainst:pi(t.away?.goals_allowed),
    },
    description: t.description?.value ?? "",
  }));
  footballStandingsCache.set(leagueId, { data: out, meta, fetchedAt: now });
  return { teams: out, meta };
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
  const now = Date.now();
  const cached = footballLeagueStatsCache.get(leagueId);
  if (cached && now - cached.fetchedAt < FOOTBALL_LEAGUE_STATS_TTL) return { teams: cached.data, meta: cached.meta };
  const resp = await fetch(`${BASE_V2}/soccer/leagues/${encodeURIComponent(leagueId)}/stats?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballLeagueStatsRaw;
  const league = data?.league_stats?.league;
  if (!league) throw new Error("Estatísticas não encontradas");
  const meta = { id: league.id, name: league.name, country: league.country };
  const rawTeams = league.team;
  const teams: FootballLeagueStatsTeamRaw[] = !rawTeams ? [] : Array.isArray(rawTeams) ? rawTeams : [rawTeams];
  const out: FootballLeagueStatsTeam[] = teams.map(t => {
    const rawPlayers = t.squad?.player;
    const players: FootballLeagueStatsPlayerRaw[] = !rawPlayers ? [] : Array.isArray(rawPlayers) ? rawPlayers : [rawPlayers];
    return {
      id: t.id, name: t.name,
      venue: t.venue ? { id: t.venue.id, name: t.venue.name } : null,
      coach: t.coach ? { id: t.coach.id, name: t.coach.name } : null,
      players: players.map(parseFootballStatsPlayer),
    };
  });
  footballLeagueStatsCache.set(leagueId, { data: out, meta, fetchedAt: now });
  return { teams: out, meta };
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
  const now = Date.now();
  const cached = footballH2HCache.get(key);
  if (cached && now - cached.fetchedAt < FOOTBALL_H2H_TTL) return cached.data;
  const url = `${BASE_V2}/soccer/head-to-head?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}&access_key=${STATSPAL_KEY}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballH2HRaw;
  const h2h = data["head-to-head"];
  if (!h2h) throw new Error("H2H não encontrado");

  const toMatches = (raw: H2HMatchRaw | H2HMatchRaw[] | undefined) =>
    !raw ? [] : (Array.isArray(raw) ? raw : [raw]).map(normaliseH2HMatch);

  const overallTotal = mergeH2HArray(h2h.overall_record?.total?.total ?? []);
  const overallHomeT1 = mergeH2HArray(h2h.overall_record?.home?.team1 ?? []);
  const overallHomeT2 = mergeH2HArray(h2h.overall_record?.home?.team2 ?? []);
  const overallAwayT1 = mergeH2HArray(h2h.overall_record?.away?.team1 ?? []);
  const overallAwayT2 = mergeH2HArray(h2h.overall_record?.away?.team2 ?? []);
  const goalsTotal = mergeH2HArray(h2h.goals?.total?.total ?? []);
  const goalsHome  = mergeH2HArray(h2h.goals?.home?.home  ?? []);
  const goalsAway  = mergeH2HArray(h2h.goals?.away?.away  ?? []);

  const rawLeagues = h2h.leagues?.league;
  const leagues = !rawLeagues ? [] : (Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues]).map(l => ({
    name: l.name, id: l.id,
    games: parseInt(l.games) || 0, team1Won: parseInt(l.team1_won) || 0, team2Won: parseInt(l.team2_won) || 0, draws: parseInt(l.draw) || 0,
  }));

  const result = {
    team1Id: h2h.team1_id, team2Id: h2h.team2_id,
    recentMeetings: toMatches(h2h.recent_meetings?.match),
    overallRecord: {
      total:   { games: overallTotal["games"] ?? 0, team1Won: overallTotal["team1_won"] ?? 0, team2Won: overallTotal["team2_won"] ?? 0, draws: overallTotal["draws"] ?? 0 },
      homeTeam1: { games: overallHomeT1["games"] ?? 0, won: overallHomeT1["won"] ?? 0, lost: overallHomeT1["lost"] ?? 0, draws: overallHomeT1["draws"] ?? 0 },
      homeTeam2: { games: overallHomeT2["games"] ?? 0, won: overallHomeT2["won"] ?? 0, lost: overallHomeT2["lost"] ?? 0, draws: overallHomeT2["draws"] ?? 0 },
      awayTeam1: { games: overallAwayT1["games"] ?? 0, won: overallAwayT1["won"] ?? 0, lost: overallAwayT1["lost"] ?? 0, draws: overallAwayT1["draws"] ?? 0 },
      awayTeam2: { games: overallAwayT2["games"] ?? 0, won: overallAwayT2["won"] ?? 0, lost: overallAwayT2["lost"] ?? 0, draws: overallAwayT2["draws"] ?? 0 },
    },
    goals: {
      total:  { team1Scored: goalsTotal["team1_scored"] ?? 0, team1Conceded: goalsTotal["team1_conceded"] ?? 0, team2Scored: goalsTotal["team2_scored"] ?? 0, team2Conceded: goalsTotal["team2_conceded"] ?? 0 },
      home:   { team1Scored: goalsHome["team1_scored"]  ?? 0, team1Conceded: goalsHome["team1_conceded"]  ?? 0, team2Scored: goalsHome["team2_scored"]  ?? 0, team2Conceded: goalsHome["team2_conceded"]  ?? 0 },
      away:   { team1Scored: goalsAway["team1_scored"]  ?? 0, team1Conceded: goalsAway["team1_conceded"]  ?? 0, team2Scored: goalsAway["team2_scored"]  ?? 0, team2Conceded: goalsAway["team2_conceded"]  ?? 0 },
    },
    leagues,
    biggestVictory: { team1: h2h.biggest_victory?.team1?.match ? normaliseH2HMatch(h2h.biggest_victory.team1.match) : null, team2: h2h.biggest_victory?.team2?.match ? normaliseH2HMatch(h2h.biggest_victory.team2.match) : null },
    biggestDefeat:  { team1: h2h.biggest_defeat?.team1?.match  ? normaliseH2HMatch(h2h.biggest_defeat.team1.match)  : null, team2: h2h.biggest_defeat?.team2?.match  ? normaliseH2HMatch(h2h.biggest_defeat.team2.match)  : null },
    last5Home: { team1: toMatches(h2h.last5_home?.team1?.match), team2: toMatches(h2h.last5_home?.team2?.match) },
    last5Away: { team1: toMatches(h2h.last5_away?.team1?.match), team2: toMatches(h2h.last5_away?.team2?.match) },
  };
  footballH2HCache.set(key, { data: result, fetchedAt: now });
  return result;
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
  const now = Date.now();
  if (footballInjuriesCache && now - footballInjuriesFetchedAt < FOOTBALL_INJURIES_TTL) return footballInjuriesCache;
  const resp = await fetch(`${BASE_V2}/soccer/injuries-suspensions?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballInjuriesRaw;
  const rawLeagues = data?.injuries_suspensions?.league;
  if (!rawLeagues) { footballInjuriesCache = []; footballInjuriesFetchedAt = now; return []; }
  const leagues: FootballInjuryLeagueRaw[] = Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues];
  const out: FootballInjuryLeague[] = leagues.map(l => {
    const rawMatches = l.match;
    const matches: FootballInjuryMatchRaw[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];
    return {
      id: l.id, name: l.name,
      matches: matches.map(m => ({ id: m.main_id, date: m.date, time: m.time, home: parseInjuryTeam(m.home), away: parseInjuryTeam(m.away) })),
    };
  });
  footballInjuriesCache = out;
  footballInjuriesFetchedAt = now;
  return out;
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
  const now = Date.now();
  const cached = footballTeamCache.get(teamId);
  if (cached && now - cached.fetchedAt < FOOTBALL_TEAM_TTL) return cached.data;
  const resp = await fetch(`${BASE_V2}/soccer/teams/${encodeURIComponent(teamId)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballTeamProfileRaw;
  const t = data?.team;
  if (!t) throw new Error("Equipa não encontrada");

  const pi = (s: string | undefined) => parseInt(s ?? "") || 0;
  const pf = (s: string | undefined) => parseFloat(s ?? "") || 0;

  const rawPlayers = t.squad?.player;
  const players = (rawPlayers ? (Array.isArray(rawPlayers) ? rawPlayers : [rawPlayers]) : []).map(p => ({
    id: p.id, name: p.name, number: p.number, age: pi(p.age), position: p.position,
    isCaptain: p.is_captain === "True", injured: p.injured === "True",
    minutesPlayed: pi(p.minutes_played), startingLineups: pi(p.starting_lineups),
    subIn: pi(p.substitute_in), onBench: pi(p.on_bench),
    appearances: pi(p.appearences),  // API typo — intentional
    goals: pi(p.goals), assists: pi(p.assists), rating: pf(p.rating),
    yellowCards: pi(p.yellowcards), yellowRed: pi(p.yellowred), redCards: pi(p.redcards),
    saves: pi(p.saves), goalsConceded: pi(p.goals_conceded), insideBoxSaves: pi(p.inside_box_saves), penSaved: pi(p.pen_saved),
    shotsTotal: pi(p.shots_total), shotsOnTarget: pi(p.shots_on_target), shotsWoodwork: pi(p.shots_woodwork),
    passAttempts: pi(p.pass_attempts), passSuccess: pi(p.pass_success), keyPasses: pi(p.key_passes),
    dribbleAttempts: pi(p.dribble_attempts), dribbleSuccess: pi(p.dribble_success),
    duelsTotal: pi(p.duels_total), duelsWon: pi(p.duels_won),
    foulsCommitted: pi(p.fouls_committed), foulsDrawn: pi(p.fouls_drawn),
    tackles: pi(p.tackles), blocks: pi(p.blocks), clearances: pi(p.clearances), interceptions: pi(p.interceptions),
    crossesTotal: pi(p.crosses_total), crossesAccurate: pi(p.crosses_accurate),
    penScored: pi(p.pen_scored), penMissed: pi(p.pen_missed),
  }));

  const toTransfers = (raw: FootballTeamTransferPlayerRaw | FootballTeamTransferPlayerRaw[] | undefined) =>
    !raw ? [] : (Array.isArray(raw) ? raw : [raw]).map(p => ({
      id: p.id, name: p.name, date: p.date, position: p.position ?? "",
      from: p.from ?? "", to: p.to ?? "", teamId: p.team_id ?? "", type: p.type, price: p.price ?? "",
    }));

  const rawTrophies = t.trophies?.trophy;
  const trophies = !rawTrophies ? [] : (Array.isArray(rawTrophies) ? rawTrophies : [rawTrophies]).map(tr => ({
    country: tr.country, league: tr.league, status: tr.status, count: parseInt(tr.count) || 0, seasons: tr.seasons,
  }));

  const rawLeagueStats = t.league_stats?.league;
  const leagueStats = !rawLeagueStats ? [] : (Array.isArray(rawLeagueStats) ? rawLeagueStats : [rawLeagueStats]).map(ls => ({
    name: ls.name, id: ls.id, season: ls.season,
    fulltime:   parseTeamHalfRecord(ls.fulltime),
    firsthalf:  parseTeamHalfRecord(ls.firsthalf),
    secondhalf: parseTeamHalfRecord(ls.secondhalf),
    scoringMinutes:        parseTeamPeriods(ls.scoring_minutes?.period),
    goalsConcededMinutes:  parseTeamPeriods(ls.goals_conceded_minutes?.period),
    yellowCardMinutes:     parseTeamPeriods(ls.yellowcard_minutes?.period),
    redCardMinutes:        parseTeamPeriods(ls.redcard_minutes?.period),
  }));

  const rawLeagueIds = t.leagues?.league_id;
  const leagueIds = !rawLeagueIds ? [] : Array.isArray(rawLeagueIds) ? rawLeagueIds : [rawLeagueIds];

  const result = {
    id: t.id, name: t.name, country: t.country,
    founded: parseInt(t.founded) || null,
    isNationalTeam: t.is_national_team === "True",
    isWomen: t.is_women === "True",
    leagueIds,
    venue: t.venue_name ? {
      id: t.venue_id ?? "", name: t.venue_name, surface: t.venue_surface ?? "",
      capacity: parseInt(t.venue_capacity ?? "") || null,
      address: t.venue_address ?? "", city: t.venue_city ?? "",
    } : null,
    coach: t.coach ? { id: t.coach.id, name: t.coach.name } : null,
    squad: players,
    transfers: { in: toTransfers(t.transfers?.in?.player), out: toTransfers(t.transfers?.out?.player) },
    trophies,
    leagueStats,
  };
  footballTeamCache.set(teamId, { data: result, fetchedAt: now });
  return result;
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
  const now = Date.now();
  const cached = footballPlayerCache.get(playerId);
  if (cached && now - cached.fetchedAt < FOOTBALL_PLAYER_TTL) return cached.data;
  const resp = await fetch(`${BASE_V2}/soccer/players/${encodeURIComponent(playerId)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballPlayerProfileRaw;
  const p = data?.player;
  if (!p) throw new Error("Jogador não encontrado");

  const result = {
    id: p.id, name: p.name, firstName: p.firstname, lastName: p.lastname,
    age: parseInt(p.age) || null, birthdate: p.birthdate,
    nationality: p.nationality, birthplace: p.birthplace, birthcountry: p.birthcountry,
    position: p.position,
    height: parseInt(p.height) || null, weight: parseInt(p.weight) || null,
    preferredFoot: p.preferred_foot,
    currentTeam: { id: p.team_id, name: p.team },
    nationalTeamId: p.national_team_id ?? null,
    marketValueEur: p.market_value_eur ? parseInt(p.market_value_eur) || null : null,
    leagueStats:     toClubStats(p.club_league_statistics?.club),
    domesticCupStats: toClubStats(p.club_domestic_cup_statistics?.club),
    intlCupStats:    toClubStats(p.club_intl_cup_statistics?.club),
    overallStats:    p.overall_club_statistics ? parsePlayerOverall(p.overall_club_statistics) : null,
  };
  footballPlayerCache.set(playerId, { data: result, fetchedAt: now });
  return result;
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
  const now = Date.now();
  const cached = footballCoachCache.get(coachId);
  if (cached && now - cached.fetchedAt < FOOTBALL_COACH_TTL) return cached.data;
  const resp = await fetch(`${BASE_V2}/soccer/coaches/${encodeURIComponent(coachId)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballCoachProfileRaw;
  const c = data?.coach;
  if (!c) throw new Error("Treinador não encontrado");

  const rawTrophies = c.trophies?.trophy;
  const trophies = !rawTrophies ? [] : (Array.isArray(rawTrophies) ? rawTrophies : [rawTrophies]).map(t => ({
    country: t.country, league: t.league, status: t.status, count: parseInt(t.count) || 0, seasons: t.seasons,
  }));

  const rawCareer = c.career_stats?.team;
  const career = !rawCareer ? [] : (Array.isArray(rawCareer) ? rawCareer : [rawCareer]).map(t => ({
    id: t.id, name: t.name, from: t.from, to: t.to || null,
  }));

  const result = {
    id: c.id, name: c.name, firstName: c.firstname, lastName: c.lastname,
    currentTeam: { id: c.team_id, name: c.team },
    nationality: c.nationality, birthdate: c.birthdate, age: parseInt(c.age) || null,
    birthcountry: c.birthcountry, birthplace: c.birthplace,
    // Strip units: "180 cm" → 180, "70 kg" → 70
    height: parseInt(c.height) || null,
    weight: parseInt(c.weight) || null,
    trophies,
    career,
  };
  footballCoachCache.set(coachId, { data: result, fetchedAt: now });
  return result;
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

router.get("/football-image", async (req, res) => {
  const type = String(req.query["type"] ?? "");
  const id   = String(req.query["id"]   ?? "");
  if (!type || !id) { res.status(400).json({ error: "Parâmetros 'type' e 'id' são obrigatórios" }); return; }

  const cacheKey = `${type}-${id}`;
  const now = Date.now();
  const cached = imageCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < IMAGE_TTL) {
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=604800");
    res.send(cached.buf);
    return;
  }

  try {
    const url = `${BASE_V2}/soccer/images?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&access_key=${STATSPAL_KEY}`;
    const imgResp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!imgResp.ok) { res.status(imgResp.status).json({ error: "Imagem não encontrada" }); return; }
    const contentType = imgResp.headers.get("content-type") ?? "image/png";
    const arrayBuf = await imgResp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    imageCache.set(cacheKey, { buf, fetchedAt: now });
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=604800");
    res.send(buf);
  } catch {
    res.status(500).json({ error: "Imagem indisponível" });
  }
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
  const now = Date.now();
  const cached = footballOddsCache.get(leagueId);
  if (cached && now - cached.fetchedAt < FOOTBALL_ODDS_TTL) return { odds: cached.data, meta: cached.meta };

  const resp = await fetch(`${BASE_V2}/soccer/leagues/${encodeURIComponent(leagueId)}/odds/prematch?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballPrematchOddsRaw;
  const league = data?.prematch_odds?.league;
  if (!league) throw new Error("Odds não encontradas");
  const meta = { id: league.id, name: league.name, country: league.country };

  const rawMatches = league.match;
  const matches: FootballOddsMatchRaw[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];

  // Average odds across all active bookmakers then apply 2.5% house margin
  const avgOdd = (bks: FootballOddsBookmakerRaw[], side: "Home" | "Draw" | "Away"): number => {
    const vals: number[] = [];
    for (const bk of bks) {
      if (bk.stop === "True") continue;
      const odds = Array.isArray(bk.odd) ? bk.odd : (bk.odd ? [bk.odd] : []);
      const o = odds.find(o => o.name === side);
      const v = parseFloat(o?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(1.01, Math.round(avg * 0.975 * 100) / 100);
  };

  const results: FootballOddsEntry[] = [];
  for (const m of matches) {
    const rawMarkets = m.odds;
    const markets: FootballOddsMarketRaw[] = !rawMarkets ? [] : Array.isArray(rawMarkets) ? rawMarkets : [rawMarkets];
    // Find 1x2 market
    const market1x2 = markets.find(mk => mk.name === "1x2" || mk.name === "3Way Result");
    if (!market1x2 || market1x2.stop === "True") continue;
    const bks: FootballOddsBookmakerRaw[] = !market1x2.bookmaker ? [] : Array.isArray(market1x2.bookmaker) ? market1x2.bookmaker : [market1x2.bookmaker];
    const h = avgOdd(bks, "Home");
    const d = avgOdd(bks, "Draw");
    const a = avgOdd(bks, "Away");
    if (!h || !d || !a) continue;
    results.push({ matchId: m.main_id, date: m.date, time: m.time, homeTeam: m.home, awayTeam: m.away, homeOdds: h, drawOdds: d, awayOdds: a });
  }

  footballOddsCache.set(leagueId, { data: results, meta, fetchedAt: now });
  return { odds: results, meta };
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
  const now = Date.now();
  if (footballLiveOddsCache && now - footballLiveOddsFetchedAt < FOOTBALL_LIVE_ODDS_TTL) return footballLiveOddsCache;
  const resp = await fetch(`${BASE_V2}/soccer/odds/live?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as FootballLiveOddsRaw;
  const matches = data?.live_matches ?? [];

  const out = matches.map(m => {
    const info = m.match_info;
    const home = m.team_info?.home;
    const away = m.team_info?.away;
    // Parse "1:1" score
    const [homeScore, awayScore] = (info?.score ?? "0:0").split(":").map(s => parseInt(s) || 0);
    // stats object → array sorted by numeric key
    const statsArr = Object.entries(m.stats ?? {})
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([, v]) => ({ name: v.name, home: v.home, away: v.away }));
    const status = m.status;
    return {
      matchId: info?.main_id ?? "",
      name: info?.name ?? "",
      leagueId: info?.league_id ?? "",
      league: info?.league ?? "",
      startDate: info?.start_date ?? "",
      startTime: info?.start_time ?? "",
      startTs: info?.start_ts ?? 0,
      score: { home: homeScore, away: awayScore },
      period: info?.period ?? "",
      minute: parseInt(info?.minute ?? "0") || 0,
      ballPos: info?.ball_pos ?? null,
      stateName: info?.state_name ?? null,
      stateDetails: info?.state_details ?? null,
      status: status ? {
        stopped:  status.stopped  === "1",
        blocked:  status.blocked  === "1",
        finished: status.finished === "1",
        updatedTs: parseInt(status.updated_ts) || 0,   // ms
      } : null,
      homeTeam: home ? { id: home.id, name: home.name, score: parseInt(home.score) || 0, kitColor: home.kit_color ?? null } : null,
      awayTeam: away ? { id: away.id, name: away.name, score: parseInt(away.score) || 0, kitColor: away.kit_color ?? null } : null,
      stats: statsArr,
      hasEvents: (m.match_events?.length ?? 0) > 0,
      hasOdds:   (m.odds?.length ?? 0) > 0,
    };
  });

  footballLiveOddsCache = out;
  footballLiveOddsFetchedAt = now;
  return out;
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
  const now = Date.now();
  if (footballLiveMarketsCache && now - footballLiveMarketsFetchedAt < FOOTBALL_LIVE_MARKETS_TTL) {
    res.json({ markets: footballLiveMarketsCache });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V2}/soccer/odds/live/markets?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // Response is a bare array: [{id: number, name: string}, ...]
    const data = (await resp.json()) as { id: number; name: string }[];
    const markets = Array.isArray(data) ? data.map(m => ({ id: m.id, name: m.name })) : [];
    footballLiveMarketsCache = markets;
    footballLiveMarketsFetchedAt = now;
    res.json({ markets });
  } catch {
    res.status(500).json({ error: "Mercados de odds ao vivo indisponíveis" });
  }
});

// ─── Football Live Match States catalogue ─────────────────────────────────────
// v2/soccer/odds/live/match-states — bare array root, same shape as live/markets
// Provides human-readable labels for state_code values in football-live-odds.

let footballLiveStatesCache: { id: number; name: string }[] | null = null;
let footballLiveStatesFetchedAt = 0;
const FOOTBALL_LIVE_STATES_TTL = 60 * 60 * 1000; // 1h — static catalogue

router.get("/football-live-match-states", async (_req, res) => {
  const now = Date.now();
  if (footballLiveStatesCache && now - footballLiveStatesFetchedAt < FOOTBALL_LIVE_STATES_TTL) {
    res.json({ states: footballLiveStatesCache });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V2}/soccer/odds/live/match-states?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { id: number; name: string }[];
    const states = Array.isArray(data) ? data.map(s => ({ id: s.id, name: s.name })) : [];
    footballLiveStatesCache = states;
    footballLiveStatesFetchedAt = now;
    res.json({ states });
  } catch {
    res.status(500).json({ error: "Estados de jogo indisponíveis" });
  }
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
  const now = Date.now();
  if (footballV1LiveCache && now - footballV1LiveFetchedAt < FOOTBALL_V1_LIVE_TTL) {
    res.json({ leagues: footballV1LiveCache });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/livescores?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1SoccerLivescoresRaw;
    const rawLeagues = data?.livescore?.league;
    const leagues: V1SoccerLeague[] = !rawLeagues ? [] : Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues];

    const out = leagues.map(lg => {
      const rawMatches = lg.match;
      const matches: V1SoccerMatch[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];
      return {
        id: lg.id,
        name: lg.name,
        country: lg.country,
        cup: lg.cup === "True",
        subId: lg.sub_id,
        matches: matches.map(m => {
          const rawEvents = m.events?.event;
          const events: V1SoccerEvent[] = !rawEvents ? [] : Array.isArray(rawEvents) ? rawEvents : [rawEvents];
          return {
            id: m.id,
            alternateId: m.alternate_id,
            alternateId2: m.alternate_id_2,
            staticId: m.static_id,
            status: m.status,
            date: m.date,
            time: m.time,
            venue: m.venue || null,
            commentary: m.commentary === "True",
            injMinute: m.inj_minute || null,
            injTime: m.inj_time || null,
            homeTeam: { id: m.home.id, name: m.home.name, goals: parseInt(m.home.goals) || 0, wonOnAgg: m.home.agg === "true" },
            awayTeam: { id: m.away.id, name: m.away.name, goals: parseInt(m.away.goals) || 0, wonOnAgg: m.away.agg === "true" },
            ht: parseScoreStr(m.ht?.score),
            ft: parseScoreStr(m.ft?.score),
            events: events.map(e => ({
              id: e.id, type: e.type, team: e.team,
              minute: e.minute, extraMin: e.extra_min || null,
              player: e.player, playerId: e.playerid,
              assist: e.assist || null, assistId: e.assistid || null,
              result: e.result,
            })),
          };
        }),
      };
    });

    footballV1LiveCache = out;
    footballV1LiveFetchedAt = now;
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Livescores indisponíveis" });
  }
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
  if (isNaN(n) || n < 0 || n > 7) {
    res.status(400).json({ error: "Offset inválido (0–7)" });
    return;
  }
  const key = `d-${n}`;
  const ttl = n <= 1 ? 5 * 60 * 1000 : 30 * 60 * 1000;
  const now = Date.now();
  const cached = footballDailyCache.get(key);
  if (cached && now - cached.fetchedAt < ttl) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/daily/${key}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1SoccerLivescoresRaw;
    const rawLeagues = data?.livescore?.league;
    const leagues: V1SoccerLeague[] = !rawLeagues ? [] : Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues];

    const out = leagues.map(lg => {
      const rawMatches = lg.match;
      const matches: V1SoccerMatch[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];
      return {
        id: lg.id, name: lg.name, country: lg.country,
        cup: lg.cup === "True", subId: lg.sub_id,
        matches: matches.map(m => {
          const rawEvents = m.events?.event;
          const events: V1SoccerEvent[] = !rawEvents ? [] : Array.isArray(rawEvents) ? rawEvents : [rawEvents];
          return {
            id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2, staticId: m.static_id,
            status: m.status, date: m.date, time: m.time,
            venue: m.venue || null, commentary: m.commentary === "True",
            homeTeam: { id: m.home.id, name: m.home.name, goals: parseInt(m.home.goals) || 0, wonOnAgg: m.home.agg === "true" },
            awayTeam: { id: m.away.id, name: m.away.name, goals: parseInt(m.away.goals) || 0, wonOnAgg: m.away.agg === "true" },
            ht: parseScoreStr(m.ht?.score),
            ft: parseScoreStr(m.ft?.score),
            events: events.map(e => ({
              id: e.id, type: e.type, team: e.team,
              minute: e.minute, extraMin: e.extra_min || null,
              player: e.player, playerId: e.playerid,
              assist: e.assist || null, assistId: e.assistid || null,
              result: e.result,
            })),
          };
        }),
      };
    });

    footballDailyCache.set(key, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Resultados diários indisponíveis" });
  }
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
  const now = Date.now();
  const cached = footballUpcomingCache.get(country);
  if (cached && now - cached.fetchedAt < FOOTBALL_UPCOMING_TTL) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/upcoming-schedule/${encodeURIComponent(country)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1UpcomingScheduleRaw;
    const rawLeagues = data?.fixtures?.league;
    const leagues: V1UpcomingLeague[] = !rawLeagues ? [] : Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues];

    const out = leagues.map(lg => {
      const rawMatches = lg.match;
      const matches: V1UpcomingMatch[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];
      return {
        id: lg.id, name: lg.name, country: lg.country, subId: lg.sub_id,
        matches: matches.map(m => {
          const rawTv = m.tv_stations?.tv;
          const tvChannels: string[] = !rawTv ? [] : (Array.isArray(rawTv) ? rawTv : [rawTv]).map(t => t.name);
          return {
            id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2, staticId: m.static_id,
            status: m.status, date: m.date, time: m.time,
            venue: m.venue || null,
            homeTeam: { id: m.home.id, name: m.home.name },
            awayTeam: { id: m.away.id, name: m.away.name },
            tvChannels,
          };
        }),
      };
    });

    footballUpcomingCache.set(country, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Calendário indisponível" });
  }
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
  const now = Date.now();
  const cached = footballExtCache.get(country);
  if (cached && now - cached.fetchedAt < FOOTBALL_EXT_TTL) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/extended-schedule/${encodeURIComponent(country)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1ExtScheduleRaw;
    const rawLeagues = data?.extended_fixtures?.league;
    const leagues: V1ExtLeague[] = !rawLeagues ? [] : Array.isArray(rawLeagues) ? rawLeagues : [rawLeagues];

    const out = leagues.map(lg => {
      const rawWeeks = lg.week;
      const weeks: V1ExtWeek[] = !rawWeeks ? [] : Array.isArray(rawWeeks) ? rawWeeks : [rawWeeks];
      return {
        id: lg.id, name: lg.name, season: lg.season, subId: lg.sub_id,
        weeks: weeks.map(w => {
          const rawMatches = w.match;
          const matches: V1ExtMatch[] = !rawMatches ? [] : Array.isArray(rawMatches) ? rawMatches : [rawMatches];
          return {
            weekNumber: parseInt(w.number) || 0,
            matches: matches.map(m => ({
              id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2, staticId: m.static_id,
              status: m.status, date: m.date, time: m.time,
              venue: m.venue || null, venueCity: m.venue_city || null, venueId: m.venue_id || null,
              attendance: parseInt(m.attendance) || null,
              homeTeam: {
                id: m.home.id, name: m.home.name,
                score:    parseExtScore(m.home.score),
                ftScore:  parseExtScore(m.home.ft_score),
                etScore:  parseExtScore(m.home.et_score),
                penScore: parseExtScore(m.home.pen_score),
              },
              awayTeam: {
                id: m.away.id, name: m.away.name,
                score:    parseExtScore(m.away.score),
                ftScore:  parseExtScore(m.away.ft_score),
                etScore:  parseExtScore(m.away.et_score),
                penScore: parseExtScore(m.away.pen_score),
              },
              halftimeScore: parseScoreStr(m.halftime?.score),
              hasLineups:      m.lineups !== null,
              hasSubstitutions: m.substitutions !== null,
              hasGoals:        m.goals !== null,
              homeCoach: m.coaches?.home?.coach ? { id: m.coaches.home.coach.id, name: m.coaches.home.coach.name } : null,
              awayCoach: m.coaches?.away?.coach ? { id: m.coaches.away.coach.id, name: m.coaches.away.coach.name } : null,
              referee: (m.referee?.name) ? { id: m.referee.id, name: m.referee.name } : null,
            })),
          };
        }),
      };
    });

    footballExtCache.set(country, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Calendário extendido indisponível" });
  }
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
  const now = Date.now();
  const cached = footballResultsCountryCache.get(country);
  if (cached && now - cached.fetchedAt < FOOTBALL_RESULTS_COUNTRY_TTL) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/results/${encodeURIComponent(country)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1ResultsRaw;
    const rawLeagues = data?.results?.league;
    const leagues: V1ResultsLeague[] = toArr(rawLeagues);

    const out = leagues.map(lg => ({
      id: lg.id, name: lg.name, season: lg.season, subId: lg.sub_id,
      weeks: toArr(lg.week).map(w => ({
        weekNumber: parseInt(w.number) || 0,
        matches: toArr(w.match).map(m => {
          const goals = toArr(m.goals?.goal).map(g => ({
            minute: g.minute, player: g.player, playerId: g.playerid,
            assist: g.assist || null, score: g.score, team: g.team,
          }));
          const homePlayers = toArr(m.lineups?.home?.player).map(p => ({
            id: p.id, name: p.name, number: p.number, booking: p.booking || null,
          }));
          const awayPlayers = toArr(m.lineups?.away?.player).map(p => ({
            id: p.id, name: p.name, number: p.number, booking: p.booking || null,
          }));
          const homeSubs = toArr(m.substitutions?.home?.substitution).map(s => ({
            minute: s.minute,
            playerIn:  { id: s.player_in_id,  name: s.player_in_name,  number: s.player_in_number,  booking: s.player_in_booking || null },
            playerOut: { id: s.player_out_id, name: s.player_out_name },
          }));
          const awaySubs = toArr(m.substitutions?.away?.substitution).map(s => ({
            minute: s.minute,
            playerIn:  { id: s.player_in_id,  name: s.player_in_name,  number: s.player_in_number,  booking: s.player_in_booking || null },
            playerOut: { id: s.player_out_id, name: s.player_out_name },
          }));
          return {
            id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2, staticId: m.static_id,
            status: m.status, date: m.date, time: m.time,
            venue: m.venue || null, venueCity: m.venue_city || null, venueId: m.venue_id || null,
            attendance: parseInt(m.attendance) || null,
            homeTeam: { id: m.home.id, name: m.home.name, score: parseExtScore(m.home.score), ftScore: parseExtScore(m.home.ft_score), etScore: parseExtScore(m.home.et_score), penScore: parseExtScore(m.home.pen_score) },
            awayTeam: { id: m.away.id, name: m.away.name, score: parseExtScore(m.away.score), ftScore: parseExtScore(m.away.ft_score), etScore: parseExtScore(m.away.et_score), penScore: parseExtScore(m.away.pen_score) },
            halftimeScore: parseScoreStr(m.halftime?.score),
            goals,
            lineups: { home: homePlayers, away: awayPlayers },
            substitutions: { home: homeSubs, away: awaySubs },
            homeCoach: m.coaches?.home?.coach?.name ? { id: m.coaches.home.coach.id, name: m.coaches.home.coach.name } : null,
            awayCoach: m.coaches?.away?.coach?.name ? { id: m.coaches.away.coach.id, name: m.coaches.away.coach.name } : null,
            referee: m.referee?.name ? { id: m.referee.id, name: m.referee.name } : null,
          };
        }),
      })),
    }));

    footballResultsCountryCache.set(country, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Resultados indisponíveis" });
  }
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
  const now = Date.now();
  const cached = footballLiveStatsCache.get(slug);
  if (cached && now - cached.fetchedAt < FOOTBALL_LIVE_STATS_TTL) {
    res.json(cached.data);
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/live-match-stats/${encodeURIComponent(slug)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1LiveStatsRaw;
    const comm = data?.commentaries;
    const lg = comm?.league;
    if (!lg) { res.status(404).json({ error: "Liga não encontrada" }); return; }
    const m = lg.match;
    const mi = m.matchinfo;

    const mapTeam = (t: V1LiveStatsTeam) => ({
      id: t.id, name: t.name,
      goals: parseInt(t.goals) || 0,
      htScore: parseExtScore(t.ht_score),
      ftScore: parseExtScore(t.ft_score),
      etScore: parseExtScore(t.et_score),
      penScore: parseExtScore(t.pen_score),
    });

    const out = {
      league: { id: lg.id, name: lg.name, country: lg.country },
      match: {
        id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2, staticId: m.static_id,
        status: m.status, date: m.date, time: m.time, timer: m.timer || null,
        homeTeam: mapTeam(m.home), awayTeam: mapTeam(m.away),
        matchInfo: mi ? {
          stadium:    mi.stadium?.name    || null,
          attendance: mi.attendance?.name ? (parseInt(mi.attendance.name) || null) : null,
          startTime:  mi.time?.name       || null,
          addedTimeP1: parseInt(mi.time?.addedtime_period1 ?? "") || null,
          addedTimeP2: parseInt(mi.time?.addedtime_period2 ?? "") || null,
          referee:    mi.referee?.name    || null,
        } : null,
        summary: {
          home: {
            goals:       mapSummaryGoals(m.summary?.home?.goals),
            yellowCards: mapCards(m.summary?.home?.yellowcards),
            redCards:    mapCards(m.summary?.home?.redcards),
            var:         mapVar(m.summary?.home?.var),
          },
          away: {
            goals:       mapSummaryGoals(m.summary?.away?.goals),
            yellowCards: mapCards(m.summary?.away?.yellowcards),
            redCards:    mapCards(m.summary?.away?.redcards),
            var:         mapVar(m.summary?.away?.var),
          },
        },
      },
    };

    footballLiveStatsCache.set(slug, { data: out, fetchedAt: now });
    res.json(out);
  } catch {
    res.status(500).json({ error: "Estatísticas ao vivo indisponíveis" });
  }
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
  const now = Date.now();
  const cached = footballStandingsCountryCache.get(country);
  if (cached && now - cached.fetchedAt < FOOTBALL_STANDINGS_COUNTRY_TTL) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/standings/${encodeURIComponent(country)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1StandingsRaw;
    const rawLeagues = data?.standings?.league;
    const leagues: V1StandingsLeague[] = toArr(rawLeagues);

    const out = leagues.map(lg => ({
      id: lg.id, name: lg.name, country: lg.country, season: lg.season, subId: lg.sub_id,
      isCurrent: lg.is_current === "True",
      teams: toArr(lg.team).map(t => ({
        id: t.id, name: t.name,
        position: parseInt(t.position) || 0,
        recentForm: t.recent_form,          // "WWWLW" — W/D/L chars
        positionStatus: t.status,           // "same" | "up" | "down"
        overall: mapRecord(t.overall),
        home:    mapRecord(t.home),
        away:    mapRecord(t.away),
        points:         parseInt(t.totals.points)          || 0,
        goalDifference: parseInt(t.totals.goal_difference) || 0,
        zone: t.special?.name || null,      // "Promotion - League One" etc.
      })),
    }));

    footballStandingsCountryCache.set(country, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Classificações indisponíveis" });
  }
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
  const now = Date.now();
  const cached = footballScorersCache.get(country);
  if (cached && now - cached.fetchedAt < FOOTBALL_SCORERS_TTL) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/scoring-leaders/${encodeURIComponent(country)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1ScorersRaw;
    const rawLeagues = data?.scorers?.league;
    const leagues: V1ScorerLeague[] = toArr(rawLeagues);

    const out = leagues.map(lg => ({
      id: lg.id, name: lg.name, country: lg.country, subId: lg.sub_id,
      players: toArr(lg.player).map(p => ({
        id: p.id, name: p.name,
        rank:         parseInt(p.pos)           || 0,
        goals:        parseInt(p.goals)         || 0,
        penaltyGoals: parseInt(p.penalty_goals) || 0,
        team: p.team, teamId: p.team_id,
      })),
    }));

    footballScorersCache.set(country, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Marcadores indisponíveis" });
  }
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

router.get("/football-injuries-v1", async (_req, res) => {
  const now = Date.now();
  if (footballInjuriesV1Cache && now - footballInjuriesV1FetchedAt < FOOTBALL_INJURIES_V1_TTL) {
    res.json({ leagues: footballInjuriesV1Cache });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/injuries?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as V1InjuriesRaw;
    const rawLeagues = data?.injuries_suspensions?.league;
    const leagues: V1InjuryLeagueRaw[] = toArr(rawLeagues);

    const out = leagues.map(lg => ({
      id: lg.id, name: lg.name, subId: lg.sub_id,
      matches: toArr(lg.match).map(m => ({
        id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2, staticId: m.static_id,
        date: m.date, time: m.time, status: m.status,
        homeTeam: {
          id: m.home.id, name: m.home.name,
          toMiss:       parseInjuryPlayers(m.home.sidelined?.to_miss?.player),
          questionable: parseInjuryPlayers(m.home.sidelined?.questionable?.player),
        },
        awayTeam: {
          id: m.away.id, name: m.away.name,
          toMiss:       parseInjuryPlayers(m.away.sidelined?.to_miss?.player),
          questionable: parseInjuryPlayers(m.away.sidelined?.questionable?.player),
        },
      })),
    }));

    footballInjuriesV1Cache = out;
    footballInjuriesV1FetchedAt = now;
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Lesões indisponíveis" });
  }
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
  const now = Date.now();
  const cached = footballOddsCountryCache.get(country);
  if (cached && now - cached.fetchedAt < FOOTBALL_ODDS_COUNTRY_TTL) {
    res.json({ leagues: cached.data });
    return;
  }
  try {
    const resp = await fetch(`${BASE_V1}/soccer/odds/${encodeURIComponent(country)}?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = (await resp.json()) as {
      example?: { odds_feed?: { league?: OddsLeague | OddsLeague[] } };
      odds_feed?: { league?: OddsLeague | OddsLeague[] };
    };
    const feed = raw?.example?.odds_feed ?? raw?.odds_feed;
    const rawLeagues = feed?.league;
    const leagues: OddsLeague[] = toArr(rawLeagues);

    const out = leagues.map(lg => ({
      id: lg.id, gid: lg.gid ?? null, name: lg.name, country: lg.country, subId: lg.sub_id ?? null,
      matches: toArr(lg.match).map(m => {
        const types: OddsType[] = m.odds?.type ? (Array.isArray(m.odds.type) ? m.odds.type : [m.odds.type]) : [];
        const markets = types.map(t => processOddsType(t)).filter((x): x is object => x !== null);
        return {
          id: m.id, alternateId: m.alternate_id, alternateId2: m.alternate_id_2 ?? null, staticId: m.static_id ?? null,
          date: m.date ?? null, time: m.time ?? null, status: m.status,
          venue: m.venue || null,
          homeTeam: { id: m.home.id, name: m.home.name, alternateId: m.home.alternate_id ?? null },
          awayTeam: { id: m.away.id, name: m.away.name, alternateId: m.away.alternate_id ?? null },
          markets,
        };
      }),
    }));

    footballOddsCountryCache.set(country, { data: out, fetchedAt: now });
    res.json({ leagues: out });
  } catch {
    res.status(500).json({ error: "Odds indisponíveis" });
  }
});

// ─── Background Market Drift Engine ─────────────────────────────────────────
// Runs every 2s independently of Statpal API polls so the frontend sees smooth
// per-tier odds movement even between data-fetch cycles.
// Tier 1 markets (Over/Under, Handicap) drift every 2s.
// Tier 2 markets (HT/FT, Correct Score) drift every 2s at a much smaller rate.
// Tier 3 markets (Corners, Cards) drift every 2s at a very gentle rate.
setInterval(() => {
  const now = Date.now();
  for (const [id, state] of liveMatchState.entries()) {
    if (state.sport !== "football") continue;
    // Skip halftime, full-time, and pre-match entries
    const skip = ["HT", "FT", "AET", "Em Breve", "Fin.", "Fin. (AET)"];
    if (skip.includes(state.status)) continue;
    // Skip if ALL core markets are suspended — don't drift while suspended
    if (state.marketSuspension) {
      const coreKeys = ["result", "totalGoals", "handicap"];
      const allCoresSuspended = coreKeys.every(k => {
        const ts = state.marketSuspension?.[k];
        return ts !== undefined && ts > now;
      });
      if (allCoresSuspended) continue;
    }
    liveMatchState.set(id, applyTieredMarketDrift(state, now));
  }
}, 2000);

export default router;
