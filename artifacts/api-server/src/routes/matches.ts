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
  // Internal tracking for live odds drift engine
  _baseOdds?: { home: number; draw: number; away: number };
  _oddsUpdatedAt?: number;
  _driftPhase?: number;
  // Sport-specific live display data
  _liveExtra?: {
    clockStr?: string;                   // basketball/hockey: "06:44"
    sets?: Array<[number, number]>;      // tennis: [[6,3],[4,2]] last entry is in-progress
    currentPoints?: [number | string, number | string]; // tennis: [30, 15] or ["D","D"] or ["AD",40]
    currentPts?: [number, number];       // volleyball: current set points [18, 16]
    vollSets?: Array<[number, number]>;  // volleyball: completed set scores [[25,18],[22,25]]
    tennisStats?: [TennisStatData, TennisStatData]; // home / away match stats
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
  home: { id: string; name: string; goals: string };
  away: { id: string; name: string; goals: string };
  events: null | {
    event:
      | Array<{ type: string; team: string; minute: string; extra_min: string; player: string; player_id: string }>
      | { type: string; team: string; minute: string; extra_min: string; player: string; player_id: string };
  };
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
type OddsOdd = { name: string; value: string };
type OddsTotal = { name: string; stop?: string; ismain?: string; odd: OddsOdd[] };
type OddsBookmaker = {
  id: string;
  name: string;
  stop?: string;
  ts?: string;
  odd?: OddsOdd[];
  total?: OddsTotal | OddsTotal[];
  handicap?: unknown[];
};
type OddsType = { name: string; stop?: string; bookmaker: OddsBookmaker | OddsBookmaker[] };
type OddsMatch = {
  id: string;
  alternate_id: string;
  alternate_id_2?: string;
  status: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  odds?: { type: OddsType | OddsType[] };
};
type OddsLeague = {
  id: string;
  gid?: string;
  name: string;
  country: string;
  match: OddsMatch | OddsMatch[];
};

// ─── Priority leagues ─────────────────────────────────────────────────────────

// International tournaments (UEFA etc.): matched only when country is NOT a domestic country
// Domestic leagues: matched by "Country: LeagueName" prefix patterns
const UEFA_TOURNAMENTS = ["champions league", "europa league", "conference league", "nations league"];

const DOMESTIC_PRIORITY: Array<[string, number]> = [
  ["spain: laliga", 10],
  ["england: premier league", 11],
  ["germany: bundesliga", 12],
  ["italy: serie a", 13],
  ["france: ligue 1", 14],
  ["spain: laliga2", 20],
  ["germany: 2. bundesliga", 21],
  ["italy: serie b", 22],
  ["england: championship", 23],
  ["portugal: liga portugal", 24],
  ["netherlands: eredivisie", 25],
  ["belgium: jupiler pro league", 30],
  ["turkey: super lig", 31],
  ["turkey: süper lig", 31],
  ["scotland: premiership", 32],
  ["france: ligue 2", 33],
  ["germany: 3. liga", 34],
  ["italy: serie c", 35],
  ["spain: primera rfef", 990],
  ["spain: segunda rfef", 991],
  ["spain: tercera rfef", 992],
  ["spain: rfef", 993],
  ["spain: segunda", 36],
  ["netherlands: keuken", 37],
  ["portugal: liga bwin", 38],
  ["russia: premier league", 39],
  ["ukraine: premier league", 40],
  ["greece: super league", 41],
  ["poland: ekstraklasa", 42],
  ["sweden: allsvenskan", 43],
  ["denmark: superliga", 44],
  ["austria: bundesliga", 45],
  ["switzerland: super league", 46],
  ["scotland: championship", 47],
  ["england: league one", 48],
  ["england: league two", 49],
  ["italy: serie d", 50],
  ["france: national", 51],
  ["germany: bundesliga women", 52],
  ["china: super league", 60],
  ["china: chinese super league", 60],
  ["indonesia: liga 1", 65],
  ["indonesia: bri liga 1", 65],
];

const EUROPEAN_COUNTRIES = new Set([
  "england", "spain", "germany", "italy", "france", "portugal", "netherlands",
  "scotland", "belgium", "turkey", "greece", "austria", "switzerland", "russia",
  "ukraine", "poland", "czechia", "denmark", "sweden", "norway", "croatia",
  "serbia", "romania", "hungary", "slovakia", "bulgaria", "slovenia",
  "finland", "israel", "cyprus", "andorra", "albania", "moldova", "ireland",
  "wales", "luxembourg", "latvia", "estonia", "lithuania", "bosnia",
  "montenegro", "north macedonia", "kosovo", "iceland", "malta", "georgia",
  "armenia", "azerbaijan", "faroe islands",
]);

function leaguePriority(name: string, country?: string): number {
  const lower = name.toLowerCase();
  const lowerCountry = (country ?? "").toLowerCase();

  // Main part of league name (before first " - "), lowercased
  const mainPart = lower.split(" - ")[0];

  // UEFA/international tournaments: only when country is NOT domestic European
  if (!EUROPEAN_COUNTRIES.has(lowerCountry)) {
    for (let i = 0; i < UEFA_TOURNAMENTS.length; i++) {
      if (mainPart.includes(UEFA_TOURNAMENTS[i])) return i;
    }
  }

  // Domestic top leagues by exact prefix
  for (const [pattern, rank] of DOMESTIC_PRIORITY) {
    if (mainPart.includes(pattern)) return rank;
  }

  if (EUROPEAN_COUNTRIES.has(lowerCountry)) return 200;
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

// ─── Caches ───────────────────────────────────────────────────────────────────

// v2/live: cache 30s
let liveCache: StatpalLeagueV2[] | null = null;
let liveFetchedAt = 0;

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
type NHLMatch = {
  id: string; fix_id: string; status: string; time: string; timer: string;
  home: { id: string; name: string; totalscore: string };
  away: { id: string; name: string; totalscore: string };
  events?: Record<string, { score?: string; event?: unknown }>;
};
type NHLTournament = { country: string; gid: string; id: string; league: string; match: NHLMatch | NHLMatch[] };
let nhlLiveCache: NHLTournament[] | null = null;
let nhlLiveFetchedAt = 0;

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
    const data = (await resp.json()) as { live_matches?: { league?: StatpalLeagueV2 | StatpalLeagueV2[] } };
    const raw = data?.live_matches?.league;
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

  const COUNTRIES = ["england", "spain", "germany", "italy", "france", "portugal", "netherlands"];
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

            // Find 1x2 odds
            const wx2 = types.find(t => t.name === "1x2" || t.name === "3Way Result");
            if (!wx2) continue;
            const bk = Array.isArray(wx2.bookmaker) ? wx2.bookmaker[0] : wx2.bookmaker;
            if (!bk?.odd) continue;
            const odds = Array.isArray(bk.odd) ? bk.odd : [bk.odd];
            const homeVal = parseFloat2(odds.find(o => o.name === "Home")?.value);
            const drawVal = parseFloat2(odds.find(o => o.name === "Draw")?.value);
            const awayVal = parseFloat2(odds.find(o => o.name === "Away")?.value);
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

  for (const t of tournaments) {
    const matches = Array.isArray(t.match) ? t.match : [t.match];
    for (const m of matches) {
      if (!m?.status) continue;
      const isLive = NHL_LIVE_STATUSES.has(m.status);
      if (!isLive) continue;

      const homeScore = parseInt(m.home.totalscore) || 0;
      const awayScore = parseInt(m.away.totalscore) || 0;

      // Convert period to equivalent minute for display
      const periodMinutes: Record<string, number> = { "1P": 10, "2P": 30, "3P": 50, "OT": 65, "SO": 68, "INT": 20, "Break": 20 };
      const minute = periodMinutes[m.status] ?? 10;

      const odds = makeOddsFromTeams(m.home.name, m.away.name);
      // Adjust for live score
      const diff = homeScore - awayScore;
      let liveOdds = { ...odds };
      if (diff !== 0) {
        const factor = Math.min(0.40, Math.abs(diff) * 0.15);
        if (diff > 0) {
          liveOdds = { home: Math.max(1.04, +(odds.home * (1 - factor)).toFixed(2)), draw: odds.draw, away: Math.min(12, +(odds.away * (1 + factor)).toFixed(2)) };
        } else {
          liveOdds = { home: Math.min(12, +(odds.home * (1 + factor)).toFixed(2)), draw: odds.draw, away: Math.max(1.04, +(odds.away * (1 - factor)).toFixed(2)) };
        }
      }
      // No draw in hockey
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
        status: m.status,
        hasRealOdds: false,
        odds: liveOdds,
        markets: makeAdvancedMarketsFromTeams(m.home.name, m.away.name),
        events: [],
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
  if (tennisStatsCache && now - tennisStatsFetchedAt < CONFIG.LIVE_CACHE_TTL) return tennisStatsCache;
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
  if (tennisLiveCache && now - tennisLiveFetchedAt < CONFIG.LIVE_CACHE_TTL) return tennisLiveCache;
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

  for (const t of tournaments) {
    const matches = Array.isArray(t.match) ? t.match : [t.match];
    for (const m of matches) {
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

      const diff = homeScore - awayScore;
      const baseOdds = makeOddsFromTeams(p0.name, p1.name);
      const factor   = Math.min(0.35, Math.abs(diff) * 0.12);
      const liveOdds = diff === 0 ? { home: baseOdds.home, draw: 0, away: baseOdds.away }
        : diff > 0
          ? { home: Math.max(1.04, +(baseOdds.home * (1 - factor)).toFixed(2)), draw: 0, away: Math.min(15, +(baseOdds.away * (1 + factor)).toFixed(2)) }
          : { home: Math.min(15, +(baseOdds.home * (1 + factor)).toFixed(2)), draw: 0, away: Math.max(1.04, +(baseOdds.away * (1 - factor)).toFixed(2)) };

      const liveHomeP = liveOdds.home > 0 && liveOdds.away > 0
        ? (1 / liveOdds.home) / (1 / liveOdds.home + 1 / liveOdds.away)
        : 0.5;
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
        hasRealOdds: true,
        odds:        liveOdds,
        markets:     { ...makeAdvancedMarketsFromTeams(p0.name, p1.name), tennisExtra: computeTennisExtras(liveHomeP) } as unknown as AdvancedMarkets,
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

  // Today's date in DD.MM.YYYY for filtering non-live matches
  const now = new Date();
  const todayStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;

  for (const t of tournaments) {
    const matches = Array.isArray(t.match) ? t.match : t.match ? [t.match] : [];
    for (const m of matches) {
      if (!m) continue;
      const home = m.home; const away = m.away;
      if (!home?.name || !away?.name) continue;

      const isLive       = VSET_LIVE.has(m.status);
      const isNotStarted = m.status === "Not Started";
      const isFinished   = m.status === "Finished";

      if (!isLive && !isNotStarted && !isFinished) continue;
      // Non-live matches: only include today's fixtures to avoid stale historical data
      if (!isLive && m.date !== todayStr) continue;

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

async function buildLiveMatches(): Promise<LiveMatchState[]> {
  const [leagues, odds] = await Promise.all([getLiveLeagues(), getOddsMap()]);

  const sorted = [...leagues]
    .sort((a, b) => leaguePriority(a.name, a.country) - leaguePriority(b.name, b.country))
    .filter(l => leaguePriority(l.name, l.country) < 100);

  let count = 0;
  const result: LiveMatchState[] = [];

  for (const league of sorted) {
    if (count >= 20) break;
    const matches: StatpalMatchV2[] = Array.isArray(league.match) ? league.match : [league.match];

    for (const m of matches) {
      if (count >= 20) break;
      const isLiveMinute = /^\d{1,3}$/.test(m.status);
      const isHT = m.status === "HT";
      const isET = m.status === "ET";
      if (!isLiveMinute && !isHT && !isET) continue;

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
      const existing = liveMatchState.get(m.main_id);
      let matchOdds: { home: number; draw: number; away: number };
      let matchMarkets: AdvancedMarkets;
      let matchMarketSuspension: Record<string, number> | undefined;
      let matchSuspensionReason: string | undefined;

      let hasRealOdds = true; // Always show odds — use model when real unavailable

      if (existing && existing.homeScore === homeScore && existing.awayScore === awayScore) {
        // Score unchanged — apply live odds drift (simulate market movement)
        const base = existing._baseOdds ?? existing.odds;
        const now = Date.now();
        const phase = (existing._driftPhase ?? 0) + 1;
        // Clean expired suspensions
        if (existing.marketSuspension) {
          const active = Object.fromEntries(
            Object.entries(existing.marketSuspension).filter(([, ts]) => ts > now)
          );
          matchMarketSuspension = Object.keys(active).length > 0 ? active : undefined;
        }

        // Time-based micro-drift: oscillates odds naturally
        // Uses two sine waves at different frequencies to create organic movement
        const t = now / 1000;
        const driftH = Math.sin(t * 0.31 + phase * 0.7) * 0.018 + Math.cos(t * 0.17) * 0.009;
        const driftD = Math.cos(t * 0.23 + phase * 0.5) * 0.014 + Math.sin(t * 0.11) * 0.007;
        const driftA = Math.sin(t * 0.27 + phase * 0.9) * 0.018 + Math.cos(t * 0.19) * 0.009;

        // Minute pressure: after 60' odds compress toward extremes
        const timePressure = Math.max(0, (minute - 55) / 60) * 0.04;
        const diff = homeScore - awayScore;

        const r = (n: number) => Math.round(n * 100) / 100;
        matchOdds = {
          home: Math.max(1.04, Math.min(25, r(base.home * (1 + driftH - (diff > 0 ? timePressure * 0.4 : timePressure * 0.6))))),
          draw: base.draw > 0 ? Math.max(2.2, Math.min(8, r(base.draw * (1 + driftD + timePressure * 0.3)))) : 0,
          away: Math.max(1.04, Math.min(25, r(base.away * (1 + driftA + (diff > 0 ? timePressure * 0.6 : timePressure * 0.4))))),
        };

        // Keep markets from existing state (already filtered for live score)
        matchMarkets = filterLiveMarkets(existing.markets, homeScore, awayScore);

        // Store drift phase for next cycle
        const updatedState = { ...existing, odds: matchOdds, minute, _driftPhase: phase, marketSuspension: matchMarketSuspension, _suspensionReason: matchMarketSuspension ? existing._suspensionReason : undefined };
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
        _oddsUpdatedAt: Date.now(),
        _driftPhase: 0,
      };

      liveMatchState.set(m.main_id, state);
      result.push(state);
      count++;
    }
  }

  return result;
}

async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  const [todayLeagues, tomorrowLeagues, odds] = await Promise.all([
    getLiveLeagues(),
    getTomorrowLeagues(),
    getOddsMap(),
  ]);

  // Tag tomorrow matches so we can label them; merge into one pool
  const seenIds = new Set<string>();
  const allLeagues: (StatpalLeagueV2 & { isTomorrow?: boolean })[] = [
    ...todayLeagues.map(l => ({ ...l })),
    ...tomorrowLeagues.map(l => ({ ...l, isTomorrow: true })),
  ];

  const sorted = allLeagues.sort((a, b) => leaguePriority(a.name, a.country) - leaguePriority(b.name, b.country));

  const results: UpcomingMatch[] = [];

  for (const league of sorted) {
    if (results.length >= 25) break;
    const matches: StatpalMatchV2[] = Array.isArray(league.match) ? league.match : [league.match];

    for (const m of matches) {
      if (results.length >= 25) break;
      if (!/^\d{2}:\d{2}$/.test(m.status)) continue;
      if (m.home.goals !== "?" || m.away.goals !== "?") continue;
      if (seenIds.has(m.main_id)) continue;
      seenIds.add(m.main_id);

      const { odds: matchOdds, markets, real } = resolveOdds(m, odds);

      // Skip matches without real Statpal odds — don't send odds-less events to the frontend
      if (!real) continue;

      results.push({
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
        country: league.country,
        time: m.status,
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

// ─── Simulated football for extra leagues (Turkey, Scotland, China, Indonesia) ─

function buildSimulatedFootballMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

  const MATCHUPS: [string, string, string, string, string][] = [
    // Turkey — Süper Lig
    ["Galatasaray", "Fenerbahçe", "Süper Lig — Turquia", "turkey", "18:00"],
    ["Beşiktaş", "Trabzonspor", "Süper Lig — Turquia", "turkey", "19:00"],
    ["Başakşehir", "Adana Demirspor", "Süper Lig — Turquia", "turkey", "16:00"],
    ["Konyaspor", "Gaziantep FK", "Süper Lig — Turquia", "turkey", "14:00"],
    ["Sivasspor", "Antalyaspor", "Süper Lig — Turquia", "turkey", "15:30"],
    ["Kasımpaşa", "Ankaragücü", "Süper Lig — Turquia", "turkey", "17:00"],
    // Scotland — Premiership
    ["Celtic", "Rangers", "Premiership — Escócia", "scotland", "12:30"],
    ["Hearts", "Hibernian", "Premiership — Escócia", "scotland", "15:00"],
    ["Aberdeen", "Dundee United", "Premiership — Escócia", "scotland", "15:00"],
    ["Motherwell", "St Mirren", "Premiership — Escócia", "scotland", "15:00"],
    // China — Super League
    ["Beijing Guoan", "Shanghai Port", "Super League — China", "china", "13:35"],
    ["Shandong Taishan", "Guangzhou FC", "Super League — China", "china", "15:05"],
    ["Wuhan Three Towns", "Shenzhen FC", "Super League — China", "china", "16:35"],
    ["Shanghai Shenhua", "Tianjin Jinmen Tiger", "Super League — China", "china", "14:05"],
    // Indonesia — Liga 1
    ["Persija Jakarta", "Persebaya Surabaya", "Liga 1 — Indonésia", "indonesia", "15:30"],
    ["PSM Makassar", "Bali United", "Liga 1 — Indonésia", "indonesia", "19:00"],
    ["Persib Bandung", "Arema FC", "Liga 1 — Indonésia", "indonesia", "18:30"],
    ["Borneo FC", "Bhayangkara FC", "Liga 1 — Indonésia", "indonesia", "20:00"],
  ];

  return MATCHUPS.map(([home, away, league, country, time], i) => ({
    id: `sfball-${dayKey}-${i}`,
    home, away, league, country, time,
    date: futureDateStr(Math.floor(i / 6)),
    sport: "football",
    hasRealOdds: true,
    odds: makeOddsFromTeams(home, away),
    markets: makeAdvancedMarketsFromTeams(home, away),
  }));
}

// ─── Other sports generators (deterministic per calendar day) ─────────────────

function dayRng(day: number): (n: number) => number {
  return (n: number) => {
    const x = Math.sin(day * 31 + n * 7919) * 2654435761;
    return (x - Math.floor(x));
  };
}

function buildBasketballMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

  const MATCHUPS: [string, string, string, string, string][] = [
    ["Boston Celtics", "Miami Heat", "NBA — Conferência Leste", "usa", "19:30"],
    ["Milwaukee Bucks", "Philadelphia 76ers", "NBA — Conferência Leste", "usa", "21:00"],
    ["Los Angeles Lakers", "Golden State Warriors", "NBA — Conferência Oeste", "usa", "22:30"],
    ["Phoenix Suns", "Denver Nuggets", "NBA — Conferência Oeste", "usa", "21:00"],
    ["Memphis Grizzlies", "Dallas Mavericks", "NBA — Conferência Oeste", "usa", "20:00"],
    ["New York Knicks", "Chicago Bulls", "NBA — Conferência Leste", "usa", "19:00"],
    ["Real Madrid", "Barcelona", "EuroLeague", "spain", "20:30"],
    ["Olimpia Milan", "Fenerbahçe Beko", "EuroLeague", "italy", "19:00"],
    ["Anadolu Efes", "Panathinaikos", "EuroLeague", "turkey", "18:00"],
    ["Flamengo", "Corinthians", "NBB — Brasil", "brazil", "20:00"],
  ];

  return MATCHUPS.map(([home, away, league, country, time], i) => {
    const seedKey = `bball:${dayKey}:${i}:${home}:${away}`;
    const dateStr = futureDateStr(Math.floor(i / 3));
    const sr = seededRng(seedKey);

    // Home advantage probability via normal distribution on team strength diff
    const marginMean = mc((sr(1) - 0.5) * 14 + 2, -18, 18);
    const marginSd = mc(11 + sr(2) * 3, 9, 16);

    // Game total: ~215 pts ± 15
    const mean = mc(215 + (sr(3) - 0.5) * 30, 170, 250);
    const sd = mc(14 + sr(4) * 4, 10, 22);
    const split = mc(0.51 + (sr(5) - 0.5) * 0.14, 0.35, 0.65);

    // 1X2 (no draw)
    const spreadLine = Math.round(mean * 0.01 + Math.abs(marginMean) * 0.5) * (marginMean >= 0 ? -1 : 1);
    const pHomeMoneyline = mc(1 - normalCdf((-3 - marginMean) / marginSd), 0.05, 0.95);
    const [homeOdd, awayOdd] = probsToDecimalOdds([pHomeMoneyline, 1 - pHomeMoneyline], 1.05);

    // Spread ±spread line
    const spread = Math.abs(Math.round(marginMean * 0.8));
    const zSpread = (-spread - marginMean) / marginSd;
    const pHomeCover = mc(1 - normalCdf(zSpread), 0.05, 0.95);
    const [spreadH, spreadA] = probsToDecimalOdds([pHomeCover, 1 - pHomeCover], 1.06);

    // Total: 1H and game
    const mean1H = mean * 0.5;
    const sd1H = sd * 0.72;
    const totalLine = Math.round(mean / 5) * 5;
    const total1HLine = Math.round(mean1H / 5) * 5;
    const zTotal = (totalLine - mean) / sd;
    const pTotalUnder = mc(normalCdf(zTotal), 0.05, 0.95);
    const [oTotal, uTotal] = probsToDecimalOdds([1 - pTotalUnder, pTotalUnder], 1.06);
    const zTotal1H = (total1HLine - mean1H) / sd1H;
    const pTotal1HUnder = mc(normalCdf(zTotal1H), 0.05, 0.95);
    const [oTotal1H, uTotal1H] = probsToDecimalOdds([1 - pTotal1HUnder, pTotal1HUnder], 1.06);

    // Team totals
    const meanHome = mean * split;
    const meanAway = mean * (1 - split);
    const sdTeam = sd * 0.85;
    const teamTotalLine = Math.round(meanHome / 5) * 5;
    const zH = (teamTotalLine - meanHome) / sdTeam;
    const pHTUnder = mc(normalCdf(zH), 0.05, 0.95);
    const [oHT, uHT] = probsToDecimalOdds([1 - pHTUnder, pHTUnder], 1.06);
    const zA = (teamTotalLine - meanAway) / sdTeam;
    const pATUnder = mc(normalCdf(zA), 0.05, 0.95);
    const [oAT, uAT] = probsToDecimalOdds([1 - pATUnder, pATUnder], 1.06);

    // Away team total line (based on meanAway)
    const awayTotalLine = Math.round(meanAway / 5) * 5;
    const zAwayT = (awayTotalLine - meanAway) / sdTeam;
    const pAwayTUnder = mc(normalCdf(zAwayT), 0.05, 0.95);
    const [oAwayT, uAwayT] = probsToDecimalOdds([1 - pAwayTUnder, pAwayTUnder], 1.06);

    // Quarter winners — moneyline probability regressed toward 50/50 per quarter
    const [q1H, q1A] = probsToDecimalOdds([mc(0.5 + (pHomeMoneyline - 0.5) * 0.55, 0.25, 0.75), mc(0.5 - (pHomeMoneyline - 0.5) * 0.55, 0.25, 0.75)], 1.07);
    const [q2H, q2A] = probsToDecimalOdds([mc(0.5 + (pHomeMoneyline - 0.5) * 0.50, 0.25, 0.75), mc(0.5 - (pHomeMoneyline - 0.5) * 0.50, 0.25, 0.75)], 1.07);
    const [q3H, q3A] = probsToDecimalOdds([mc(0.5 + (pHomeMoneyline - 0.5) * 0.48, 0.25, 0.75), mc(0.5 - (pHomeMoneyline - 0.5) * 0.48, 0.25, 0.75)], 1.07);
    const [q4H, q4A] = probsToDecimalOdds([mc(0.5 + (pHomeMoneyline - 0.5) * 0.52, 0.25, 0.75), mc(0.5 - (pHomeMoneyline - 0.5) * 0.52, 0.25, 0.75)], 1.07);

    return {
      id: `bball-${dayKey}-${i}`,
      home,
      away,
      league,
      country,
      time,
      date: dateStr,
      sport: "basketball",
      hasRealOdds: true,
      odds: { home: homeOdd!, draw: 0, away: awayOdd! },
      markets: {
        doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore: { yes: 0, no: 0 },
        totalGoals: {
          over05: 0, under05: 0,
          over15: oTotal1H!, under15: uTotal1H!,
          over25: oTotal!, under25: uTotal!,
          over35: oHT!, under35: uHT!,
          over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
        },
        handicap: {
          homeMinusOne: spreadH!, awayPlusOne: spreadA!,
          homeMinusOneHalf: oAT!, awayPlusOneHalf: uAT!,
        },
        halfTime: { home: 0, draw: 0, away: 0 },
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
          teamTotalHome: { line: teamTotalLine, over: oHT!, under: uHT! },
          teamTotalAway: { line: awayTotalLine, over: oAwayT!, under: uAwayT! },
        },
      } as unknown as AdvancedMarkets,
    };
  });
}

function buildTennisMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

  const ATP_PLAYERS = [
    "Novak Djokovic", "Carlos Alcaraz", "Jannik Sinner", "Daniil Medvedev",
    "Alexander Zverev", "Andrey Rublev", "Casper Ruud", "Taylor Fritz",
    "Grigor Dimitrov", "Hubert Hurkacz", "Holger Rune", "Tommy Paul",
    "Ben Shelton", "Lorenzo Musetti", "Arthur Fils", "Ugo Humbert",
    "Sebastian Baez", "Nicolas Jarry", "Jack Draper", "Zhizhen Zhang",
  ];
  const WTA_PLAYERS = [
    "Aryna Sabalenka", "Iga Swiatek", "Coco Gauff", "Elena Rybakina",
    "Qinwen Zheng", "Jasmine Paolini", "Daria Kasatkina", "Emma Navarro",
    "Madison Keys", "Mirra Andreeva", "Marketa Vondrousova", "Anna Kalinskaya",
    "Xinyu Wang", "Beatriz Haddad Maia",
  ];

  const TOURNAMENTS: [string, string, string, string][] = [
    ["ATP 500 — Roma", "italy", "14:00", "atp"],
    ["ATP 250 — Hamburgo", "germany", "15:30", "atp"],
    ["ATP 250 — Genebra", "switzerland", "14:00", "atp"],
    ["ATP 250 — Lyon", "france", "15:00", "atp"],
    ["ATP 500 — Halle", "germany", "13:00", "atp"],
    ["ATP Challenger — Turim", "italy", "11:30", "atp"],
    ["ATP Challenger — Praga", "czechia", "12:00", "atp"],
    ["WTA 1000 — Roma", "italy", "13:00", "wta"],
    ["WTA 250 — Estrasburgo", "france", "14:30", "wta"],
    ["WTA 500 — Berlim", "germany", "15:00", "wta"],
    ["WTA 250 — Rabat", "morocco", "12:30", "wta"],
    ["WTA 250 — Hertogenbosch", "netherlands", "13:00", "wta"],
    ["Roland Garros — Qualificação", "france", "11:00", "atp"],
    ["Roland Garros — Qualificação", "france", "12:30", "wta"],
  ];

  return TOURNAMENTS.map(([league, country, time, tour], i) => {
    const dateStr = futureDateStr(Math.floor(i / 2));
    const pool = tour === "atp" ? ATP_PLAYERS : WTA_PLAYERS;
    const sr0 = seededRng(`tennis:${dayKey}:${i}:${league}`);
    const p1idx = Math.floor(sr0(1) * (pool.length - 1));
    let p2idx = Math.floor(sr0(2) * (pool.length - 1));
    if (p2idx >= p1idx) p2idx = (p2idx + 1) % pool.length;
    const p1 = pool[p1idx]!;
    const p2 = pool[p2idx]!;

    const sr = seededRng(`tennis:${dayKey}:${i}:${p1}:${p2}`);

    // Match winner: server advantage → p1 slightly favoured (~54%)
    const pP1Win = mc(0.54 + (sr(11) - 0.5) * 0.16, 0.18, 0.82);
    const [matchH, matchA] = probsToDecimalOdds([pP1Win, 1 - pP1Win], 1.06);

    // Set 1 winner (close to match winner probability but more variance)
    const pSet1P1 = mc(pP1Win * 0.9 + 0.05 + (sr(12) - 0.5) * 0.08, 0.18, 0.82);
    const [set1H, set1A] = probsToDecimalOdds([pSet1P1, 1 - pSet1P1], 1.06);

    // Total sets O/U 2.5
    const p3Sets = mc(0.44 + (sr(13) - 0.5) * 0.22, 0.18, 0.72);
    const [oSets, uSets] = probsToDecimalOdds([p3Sets, 1 - p3Sets], 1.06);

    // Tiebreak in match (yes/no)
    const pTiebreak = mc(0.38 + (sr(14) - 0.5) * 0.22, 0.12, 0.68);
    const [tieYes, tieNo] = probsToDecimalOdds([pTiebreak, 1 - pTiebreak], 1.06);

    // Handicap games (spread)
    const diffMean = mc((sr(9) - 0.5) * 5.0, -6, 6);
    const diffSd = mc(3.2 + sr(10) * 1.2, 2.6, 4.8);
    const gamesLine = Math.round(Math.abs(diffMean) * 0.6 + 1) * (diffMean >= 0 ? -1 : 1);
    const zHcap = (-Math.abs(gamesLine) - diffMean) / diffSd;
    const pHcapHome = mc(1 - normalCdf(zHcap), 0.05, 0.95);
    const [hcapH, hcapA] = probsToDecimalOdds([pHcapHome, 1 - pHcapHome], 1.06);

    // Set 2 winner (slightly more variance, different seed)
    const pSet2P1 = mc(pP1Win * 0.85 + 0.075 + (sr(15) - 0.5) * 0.10, 0.18, 0.82);
    const [set2H, set2A] = probsToDecimalOdds([pSet2P1, 1 - pSet2P1], 1.06);

    // Exact sets: P(h20)+P(h21)=pP1Win, P(a02)+P(a12)=1-pP1Win
    const ph20 = mc(pP1Win * (1 - p3Sets), 0.02, 0.70);
    const ph21 = mc(pP1Win * p3Sets, 0.02, 0.55);
    const pa02 = mc((1 - pP1Win) * (1 - p3Sets), 0.02, 0.70);
    const pa12 = mc((1 - pP1Win) * p3Sets, 0.02, 0.55);
    const [xh20, xh21, xa02, xa12] = probsToDecimalOdds([ph20, ph21, pa02, pa12], 1.08);

    // Total games O/U (avg ~22 for best-of-3)
    const meanGames = mc(22 + (sr(16) - 0.5) * 6, 18, 30);
    const sdGames = mc(4.0 + sr(17) * 1.5, 3.0, 6.0);
    const gamesLineRound = Math.floor(meanGames) + 0.5;
    const pGamesOver = mc(1 - normalCdf((gamesLineRound - meanGames) / sdGames), 0.05, 0.95);
    const [oGames, uGames] = probsToDecimalOdds([pGamesOver, 1 - pGamesOver], 1.06);

    return {
      id: `tennis-${dayKey}-${i}`,
      home: p1,
      away: p2,
      league,
      country,
      time,
      date: dateStr,
      sport: "tennis",
      hasRealOdds: true,
      odds: { home: matchH!, draw: 0, away: matchA! },
      markets: {
        doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore: { yes: tieYes!, no: tieNo! },
        totalGoals: {
          over05: 0, under05: 0,
          over15: set1H!, under15: set1A!,
          over25: oSets!, under25: uSets!,
          over35: 0, under35: 0,
          over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
        },
        handicap: {
          homeMinusOne: hcapH!, awayPlusOne: hcapA!,
          homeMinusOneHalf: 0, awayPlusOneHalf: 0,
        },
        halfTime: { home: 0, draw: 0, away: 0 },
        firstGoal: { home: 0, noGoal: 0, away: 0 },
        tennisExtra: computeTennisExtras(pP1Win, {
          set1H: set1H!, set1A: set1A!,
          set2H: set2H!, set2A: set2A!,
          xh20: xh20!, xh21: xh21!, xa02: xa02!, xa12: xa12!,
          gamesLine, gamesLineRound, oGames: oGames!, uGames: uGames!,
          hcapH: hcapH!, hcapA: hcapA!,
        }),
      } as unknown as AdvancedMarkets,
    };
  });
}

// ─── Date helper for upcoming generators ─────────────────────────────────────

function futureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

// ─── Hockey generator (NHL/KHL — Poisson model) ──────────────────────────────

function buildHockeyMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

  const MATCHUPS: [string, string, string, string, string][] = [
    ["Boston Bruins", "Tampa Bay Lightning", "NHL — Playoffs", "usa", "19:00"],
    ["Colorado Avalanche", "Vegas Golden Knights", "NHL — Playoffs", "usa", "22:00"],
    ["Toronto Maple Leafs", "Montreal Canadiens", "NHL — Playoffs", "canada", "19:30"],
    ["New York Rangers", "Carolina Hurricanes", "NHL — Playoffs", "usa", "20:00"],
    ["Edmonton Oilers", "Calgary Flames", "NHL — Playoffs", "canada", "22:30"],
    ["Florida Panthers", "Dallas Stars", "NHL — Playoffs", "usa", "20:00"],
    ["SKA Saint Petersburg", "CSKA Moscow", "KHL — Playoff", "russia", "17:00"],
    ["Metallurg Magnitogorsk", "Ak Bars Kazan", "KHL — Playoff", "russia", "18:30"],
  ];

  return MATCHUPS.map(([home, away, league, country, time], i) => {
    const dateStr = futureDateStr(Math.floor(i / 3));
    const sr = seededRng(`hockey:${dayKey}:${i}:${home}:${away}`);

    // Goal model: NHL avg ~6 goals/game, KHL ~5.5
    const isNHL = league.includes("NHL");
    const meanTotal = mc((isNHL ? 6.1 : 5.6) + (sr(1) - 0.5) * 1.6, 4.5, 8.0);
    const marginMean = mc((sr(2) - 0.5) * 2.2 + 0.15, -2.5, 2.5); // home advantage
    const marginSd = mc(2.0 + sr(3) * 0.8, 1.6, 3.2);

    // Puck Line (±1.5 standard)
    const pHomePuckLine = mc(1 - normalCdf((-1.5 - marginMean) / marginSd), 0.05, 0.95);
    const [plH, plA] = probsToDecimalOdds([pHomePuckLine, 1 - pHomePuckLine], 1.05);

    // Moneyline
    const pHomeML = mc(1 - normalCdf(-marginMean / marginSd), 0.08, 0.92);
    const [mlH, mlA] = probsToDecimalOdds([pHomeML, 1 - pHomeML], 1.05);

    // Total goals O/U
    const totalLine = Math.round(meanTotal * 2) / 2; // nearest 0.5
    const totalSd = mc(1.6 + sr(4) * 0.6, 1.2, 2.4);
    const pTotalOver = mc(1 - normalCdf((totalLine - meanTotal) / totalSd), 0.05, 0.95);
    const [oTotal, uTotal] = probsToDecimalOdds([pTotalOver, 1 - pTotalOver], 1.06);

    // Alt total lines
    const [oAlt1, uAlt1] = probsToDecimalOdds([
      mc(1 - normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine - 0.5 - meanTotal) / totalSd), 0.05, 0.95),
    ], 1.06);
    const [oAlt2, uAlt2] = probsToDecimalOdds([
      mc(1 - normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95),
      mc(normalCdf((totalLine + 0.5 - meanTotal) / totalSd), 0.05, 0.95),
    ], 1.06);

    // 1st period result
    const mean1P = meanTotal / 3;
    const lambdaH1P = mc(mean1P * 0.5 + marginMean * 0.35, 0.3, 2.5);
    const lambdaA1P = mc(mean1P * 0.5 - marginMean * 0.35, 0.3, 2.5);
    const p1H = poissonPmf(lambdaH1P, 5);
    const p1A = poissonPmf(lambdaA1P, 5);
    let p1PHW = 0, p1PD = 0, p1PAW = 0;
    for (let gi = 0; gi <= 5; gi++) {
      for (let gj = 0; gj <= 5; gj++) {
        const p = (p1H[gi] ?? 0) * (p1A[gj] ?? 0);
        if (gi > gj) p1PHW += p; else if (gi < gj) p1PAW += p; else p1PD += p;
      }
    }
    const p1S = p1PHW + p1PD + p1PAW;
    const [per1H, per1D, per1A] = probsToDecimalOdds([p1PHW / p1S, p1PD / p1S, p1PAW / p1S], 1.08);

    // Period 2 result (less home advantage)
    const lambdaH2P = mc(mean1P * 0.5 + marginMean * 0.20, 0.3, 2.5);
    const lambdaA2P = mc(mean1P * 0.5 - marginMean * 0.20, 0.3, 2.5);
    const p2Hd = poissonPmf(lambdaH2P, 5);
    const p2Ad = poissonPmf(lambdaA2P, 5);
    let p2PHW = 0, p2PD = 0, p2PAW = 0;
    for (let gi = 0; gi <= 5; gi++) {
      for (let gj = 0; gj <= 5; gj++) {
        const p = (p2Hd[gi] ?? 0) * (p2Ad[gj] ?? 0);
        if (gi > gj) p2PHW += p; else if (gi < gj) p2PAW += p; else p2PD += p;
      }
    }
    const p2S = p2PHW + p2PD + p2PAW;
    const [per2H, per2D, per2A] = probsToDecimalOdds([p2PHW / p2S, p2PD / p2S, p2PAW / p2S], 1.08);

    // Period 3 result (most random)
    const lambdaH3P = mc(mean1P * 0.5 + marginMean * 0.10, 0.3, 2.5);
    const lambdaA3P = mc(mean1P * 0.5 - marginMean * 0.10, 0.3, 2.5);
    const p3Hd = poissonPmf(lambdaH3P, 5);
    const p3Ad = poissonPmf(lambdaA3P, 5);
    let p3PHW = 0, p3PD = 0, p3PAW = 0;
    for (let gi = 0; gi <= 5; gi++) {
      for (let gj = 0; gj <= 5; gj++) {
        const p = (p3Hd[gi] ?? 0) * (p3Ad[gj] ?? 0);
        if (gi > gj) p3PHW += p; else if (gi < gj) p3PAW += p; else p3PD += p;
      }
    }
    const p3S = p3PHW + p3PD + p3PAW;
    const [per3H, per3D, per3A] = probsToDecimalOdds([p3PHW / p3S, p3PD / p3S, p3PAW / p3S], 1.08);

    // Period 1 total O/U
    const per1TotalLine = Math.round(mean1P * 2) / 2;
    const per1TotalSd = mc(0.9 + sr(15) * 0.4, 0.6, 1.5);
    const pPer1TotalOver = mc(1 - normalCdf((per1TotalLine - mean1P) / per1TotalSd), 0.05, 0.95);
    const [oPer1T, uPer1T] = probsToDecimalOdds([pPer1TotalOver, 1 - pPer1TotalOver], 1.06);

    // Both teams score in game (very common in hockey ~72%)
    const pBTS = mc(0.70 + (sr(16) - 0.5) * 0.18, 0.45, 0.92);
    const [btsYes, btsNo] = probsToDecimalOdds([pBTS, 1 - pBTS], 1.06);

    // Shots on goal O/U (NHL avg ~60 combined, KHL ~55)
    const isNHLCheck = league.includes("NHL");
    const shotsLine = mc((isNHLCheck ? 60.5 : 55.5) + (sr(17) - 0.5) * 8, 48.5, 72.5);
    const pShotsOver = mc(0.5 + (sr(18) - 0.5) * 0.12, 0.38, 0.62);
    const [oShots, uShots] = probsToDecimalOdds([pShotsOver, 1 - pShotsOver], 1.06);

    return {
      id: `hockey-${dayKey}-${i}`,
      home, away, league, country, time,
      date: dateStr,
      sport: "hockey",
      hasRealOdds: true,
      odds: { home: mlH!, draw: 0, away: mlA! },
      markets: {
        doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore: { yes: 0, no: 0 },
        totalGoals: {
          over05: 0, under05: 0,
          over15: oAlt1!, under15: uAlt1!,
          over25: oTotal!, under25: uTotal!,
          over35: oAlt2!, under35: uAlt2!,
          over45: 0, under45: 0, over55: 0, under55: 0, over65: 0, under65: 0,
        },
        handicap: { homeMinusOne: plH!, awayPlusOne: plA!, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
        halfTime: { home: per1H!, draw: per1D!, away: per1A! },
        firstGoal: { home: 0, noGoal: 0, away: 0 },
        _spread: 1.5,
        _total: totalLine,
        hockeyExtra: {
          period2: { home: per2H!, draw: per2D!, away: per2A! },
          period3: { home: per3H!, draw: per3D!, away: per3A! },
          period1Total: { line: per1TotalLine, over: oPer1T!, under: uPer1T! },
          bothTeamsScoreGame: { yes: btsYes!, no: btsNo! },
          shotsOnGoal: { line: shotsLine, over: oShots!, under: uShots! },
        },
      } as unknown as AdvancedMarkets,
    };
  });
}

// ─── Volleyball generator (probabilistic model) ──────────────────────────────

function buildVolleyballMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

  const MATCHUPS: [string, string, string, string, string][] = [
    ["Brazil VB", "Italy VB", "Volleyball Nations League", "brazil", "16:00"],
    ["Poland VB", "France VB", "Volleyball Nations League", "poland", "18:00"],
    ["USA VB", "Japan VB", "Volleyball Nations League", "usa", "20:00"],
    ["Trentino", "Lube Civitanova", "Superlega — Itália", "italy", "17:00"],
    ["Zenit Kazan", "Dinamo Moscow", "Superliga — Rússia", "russia", "17:30"],
    ["Cruzeiro VB", "Sesi Franca", "Superliga — Brasil", "brazil", "20:00"],
    ["Sir Safety Perugia", "Modena VB", "Superlega — Itália", "italy", "19:00"],
    ["Resovia Rzeszow", "Jastrzebski VB", "PlusLiga — Polônia", "poland", "18:30"],
  ];

  return MATCHUPS.map(([home, away, league, country, time], i) => {
    const dateStr = futureDateStr(Math.floor(i / 3));
    const sr = seededRng(`vball:${dayKey}:${i}:${home}:${away}`);

    // Match winner probability (5-set model)
    const skillDiff = mc((sr(1) - 0.5) * 0.3 + 0.04, -0.35, 0.35); // home advantage
    const pSetHomeWin = mc(0.52 + skillDiff, 0.18, 0.82);

    // P(match win) via best-of-5 binomial
    function pMatchWin(pSet: number): number {
      const q = 1 - pSet;
      return (
        Math.pow(pSet, 3) +
        3 * Math.pow(pSet, 3) * q +
        6 * Math.pow(pSet, 3) * Math.pow(q, 2) * 0.5 // 5-set approx
      );
    }
    const pMatchH = mc(pMatchWin(pSetHomeWin), 0.1, 0.9);
    const [matchH, matchA] = probsToDecimalOdds([pMatchH, 1 - pMatchH], 1.05);

    // Total sets O/U 2.5 (3-0 or 3-1 = under, 3-2 = over)
    const p3sets = mc(Math.pow(pSetHomeWin, 3) + Math.pow(1 - pSetHomeWin, 3), 0.15, 0.65);
    const p4sets = mc(
      3 * Math.pow(pSetHomeWin, 3) * (1 - pSetHomeWin) +
      3 * Math.pow(1 - pSetHomeWin, 3) * pSetHomeWin,
      0.15, 0.55
    );
    const p5sets = mc(1 - p3sets - p4sets, 0.1, 0.5);
    const pUnder25 = mc(p3sets + p4sets, 0.30, 0.90); // ≤4 sets total (3-0 or 3-1 = 3 or 4 total)
    const [oSets25, uSets25] = probsToDecimalOdds([1 - pUnder25, pUnder25], 1.06);
    const [oSets35, uSets35] = probsToDecimalOdds([mc(p5sets, 0.10, 0.60), mc(1 - p5sets, 0.40, 0.90)], 1.06);

    // Set handicap — home −1.5 sets (home wins 3-0 or 3-1)
    const pHomeHcap = mc(p3sets * (pSetHomeWin / (pSetHomeWin + (1 - pSetHomeWin))) + p4sets * (pSetHomeWin / (pSetHomeWin + (1 - pSetHomeWin))), 0.05, 0.85);
    const [hcapH, hcapA] = probsToDecimalOdds([pHomeHcap, 1 - pHomeHcap], 1.06);

    // Points O/U per set (avg ~25 pts/set)
    const meanPts = mc(52 + (sr(5) - 0.5) * 8, 46, 60);
    const sdPts = mc(6 + sr(6) * 2, 4, 10);
    const ptsLine = Math.round(meanPts / 2) * 2;
    const pPtsOver = mc(1 - normalCdf((ptsLine - meanPts) / sdPts), 0.05, 0.95);
    const [oPts, uPts] = probsToDecimalOdds([pPtsOver, 1 - pPtsOver], 1.06);

    // Per-set winner markets (individual sets)
    const pS1H = mc(pSetHomeWin + (sr(7) - 0.5) * 0.08, 0.15, 0.85);
    const pS2H = mc(pSetHomeWin + (sr(8) - 0.5) * 0.09, 0.15, 0.85);
    const pS3H = mc(0.5 + (pSetHomeWin - 0.5) * 0.55 + (sr(9) - 0.5) * 0.10, 0.15, 0.85);
    const [vs1H, vs1A] = probsToDecimalOdds([pS1H, 1 - pS1H], 1.06);
    const [vs2H, vs2A] = probsToDecimalOdds([pS2H, 1 - pS2H], 1.06);
    const [vs3H, vs3A] = probsToDecimalOdds([pS3H, 1 - pS3H], 1.06);

    // Points handicap (based on team strength difference)
    const ptsDiffMean = mc((pSetHomeWin - 0.5) * 14, -10, 10);
    const ptsDiffLine = Math.round(Math.abs(ptsDiffMean) * 0.5 + 1.5) * (ptsDiffMean >= 0 ? -1 : 1);
    const ptsDiffSd = mc(4 + sr(10) * 2, 3, 7);
    const pPtsHcapHome = mc(1 - normalCdf((-Math.abs(ptsDiffLine) - ptsDiffMean) / ptsDiffSd), 0.05, 0.95);
    const [ptsHcapH, ptsHcapA] = probsToDecimalOdds([pPtsHcapHome, 1 - pPtsHcapHome], 1.06);

    return {
      id: `vball-${dayKey}-${i}`,
      home, away, league, country, time,
      date: dateStr,
      sport: "volleyball",
      hasRealOdds: true,
      odds: { home: matchH!, draw: 0, away: matchA! },
      markets: {
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
        volleyballExtra: computeVolleyballExtras(pSetHomeWin, {
          vs1H: vs1H!, vs1A: vs1A!, vs2H: vs2H!, vs2A: vs2A!, vs3H: vs3H!, vs3A: vs3A!,
          ptsDiffLine, ptsHcapH: ptsHcapH!, ptsHcapA: ptsHcapA!,
        }),
      } as unknown as AdvancedMarkets,
    };
  });
}

// ─── Persistent Simulated Live State Manager ─────────────────────────────────
// Module-level Maps keep state stable between cache refreshes.
// Each match initialises once per calendar day (from a deterministic daily seed)
// and then advances incrementally on every call, so scores never jump.

const _dayRng = (seed: number) => (n: number) => {
  const x = Math.sin(seed + n * 7919) * 2654435761;
  return x - Math.floor(x);
};
const _tickRng = (seed: number, n: number) => {
  const x = Math.sin(seed + n * 6271) * 1610612741;
  return x - Math.floor(x);
};
const _fmtClock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const _getDay = () => {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

interface _BballSt  { dk: number; q: number; clk: number; home: number; away: number; lms: number }
interface _TennisSt { dk: number; sets: Array<[number,number]>; hS: number; aS: number; inH: number; inA: number; ptH: number; ptA: number; srv: 0|1; lms: number }
interface _VolleySt { dk: number; vollSets: Array<[number,number]>; hS: number; aS: number; ptH: number; ptA: number; lms: number }
interface _HockeySt { dk: number; period: number; clk: number; home: number; away: number; lms: number }

const _bballMap  = new Map<number, _BballSt>();
const _tennisMap = new Map<number, _TennisSt>();
const _volleyMap = new Map<number, _VolleySt>();
const _hockeyMap = new Map<number, _HockeySt>();

function _getBball(si: number): _BballSt {
  const dk = _getDay();
  let s = _bballMap.get(si);
  if (!s || s.dk !== dk) {
    const r = _dayRng(dk * 100 + si);
    const q   = 1 + Math.floor(r(1) * 4);
    const clk = Math.floor(r(2) * 720);
    const played = ((q - 1) * 720 + (720 - clk));
    const rate   = 50 / (4 * 720);
    const home = Math.round(played * rate * (0.9 + r(3) * 0.2));
    const away = Math.round(played * rate * (0.9 + r(4) * 0.2));
    s = { dk, q, clk, home, away, lms: Date.now() };
    _bballMap.set(si, s);
  }
  const realSec = (Date.now() - s.lms) / 1000;
  if (realSec < 2) return s;
  const gameSec = Math.min(Math.round(realSec), 90);
  const ts = Math.floor(s.lms / 1000);
  s.home += Math.round(gameSec * (50 / 2880) * (0.85 + _tickRng(ts, 1) * 0.3));
  s.away += Math.round(gameSec * (50 / 2880) * (0.85 + _tickRng(ts, 2) * 0.3));
  s.clk  -= gameSec;
  while (s.clk <= 0 && s.q < 4) { s.q++; s.clk += 720; }
  if (s.clk < 0) s.clk = 0;
  s.lms = Date.now();
  return s;
}

function _getTennis(si: number): _TennisSt {
  const dk = _getDay();
  let s = _tennisMap.get(si);
  if (!s || s.dk !== dk) {
    const r   = _dayRng(dk * 100 + si);
    const frame = 1 + Math.floor(r(1) * 3);
    const sets: Array<[number,number]> = [];
    let hS = 0, aS = 0;
    for (let i = 0; i < frame - 1; i++) {
      if (hS === 2 || aS === 2) break;
      const hw = r(10 + i) > 0.5;
      const lg = Math.floor(r(11 + i) * 7);
      const wg = lg >= 5 ? 7 : 6;
      sets.push(hw ? [wg, lg] : [lg, wg]);
      if (hw) hS++; else aS++;
    }
    s = { dk, sets, hS, aS, inH: Math.floor(r(20) * 6), inA: Math.floor(r(21) * 5), ptH: 0, ptA: 0, srv: r(22) > 0.5 ? 1 : 0, lms: Date.now() };
    _tennisMap.set(si, s);
  }
  const realSec = (Date.now() - s.lms) / 1000;
  const nPts = Math.min(Math.round(realSec / 12), 8);
  if (nPts < 1) return s;
  const ts = Math.floor(s.lms / 1000);
  for (let p = 0; p < nPts; p++) {
    if (s.hS >= 2 || s.aS >= 2) break;
    const srvWin = _tickRng(ts + p, 3) < 0.58;
    const hw     = s.srv === 0 ? srvWin : !srvWin;
    if (hw) s.ptH++; else s.ptA++;
    const inDeuce = s.ptH >= 3 && s.ptA >= 3;
    const hWon = inDeuce ? s.ptH - s.ptA >= 2 : s.ptH >= 4;
    const aWon = inDeuce ? s.ptA - s.ptH >= 2 : s.ptA >= 4;
    if (hWon || aWon) {
      s.ptH = 0; s.ptA = 0;
      s.srv = s.srv === 0 ? 1 : 0;
      if (hWon) s.inH++; else s.inA++;
      const setOver = (s.inH >= 6 && s.inH - s.inA >= 2) || (s.inA >= 6 && s.inA - s.inH >= 2)
                   || (s.inH === 7 && s.inA === 6) || (s.inH === 6 && s.inA === 7);
      if (setOver) {
        s.sets.push([s.inH, s.inA]);
        if (s.inH > s.inA) s.hS++; else s.aS++;
        s.inH = 0; s.inA = 0;
      }
    }
  }
  s.lms = Date.now();
  return s;
}

function _getVolley(si: number): _VolleySt {
  const dk = _getDay();
  let s = _volleyMap.get(si);
  if (!s || s.dk !== dk) {
    const r   = _dayRng(dk * 100 + si);
    const frame = 1 + Math.floor(r(1) * 4);
    const vollSets: Array<[number,number]> = [];
    let hS = 0, aS = 0;
    for (let i = 0; i < frame - 1; i++) {
      if (hS === 3 || aS === 3) break;
      const isFifth = (hS + aS) === 4;
      const tgt = isFifth ? 15 : 25;
      const hw  = r(10 + i) > 0.5;
      const lp  = Math.floor(r(11 + i) * (tgt - 2));
      vollSets.push(hw ? [tgt, lp] : [lp, tgt]);
      if (hw) hS++; else aS++;
    }
    s = { dk, vollSets, hS, aS, ptH: Math.floor(r(20) * 18), ptA: Math.floor(r(21) * 18), lms: Date.now() };
    _volleyMap.set(si, s);
  }
  const realSec = (Date.now() - s.lms) / 1000;
  const nRallies = Math.min(Math.round(realSec / 8), 12);
  if (nRallies < 1) return s;
  const ts  = Math.floor(s.lms / 1000);
  const tgt = () => (s!.hS + s!.aS) === 4 ? 15 : 25;
  for (let r = 0; r < nRallies; r++) {
    if (s.hS >= 3 || s.aS >= 3) break;
    const hw = _tickRng(ts + r, 7) < 0.5;
    if (hw) s.ptH++; else s.ptA++;
    const t  = tgt();
    const hW = s.ptH >= t && s.ptH - s.ptA >= 2;
    const aW = s.ptA >= t && s.ptA - s.ptH >= 2;
    if (hW || aW) {
      s.vollSets.push([s.ptH, s.ptA]);
      if (hW) s.hS++; else s.aS++;
      s.ptH = 0; s.ptA = 0;
    }
  }
  s.lms = Date.now();
  return s;
}

function _getHockey(si: number): _HockeySt {
  const dk = _getDay();
  let s = _hockeyMap.get(si);
  if (!s || s.dk !== dk) {
    const r   = _dayRng(dk * 100 + si);
    const period = 1 + Math.floor(r(1) * 3);
    const clk    = Math.floor(r(2) * 1200);
    const played = ((period - 1) * 1200 + (1200 - clk));
    const gr     = 3 / 3600;
    const home   = Math.round(played * gr * (0.7 + r(3) * 0.6));
    const away   = Math.round(played * gr * (0.7 + r(4) * 0.6));
    s = { dk, period, clk, home, away, lms: Date.now() };
    _hockeyMap.set(si, s);
  }
  const realSec = (Date.now() - s.lms) / 1000;
  const gameSec = Math.min(Math.round(realSec * 0.5), 60);
  if (gameSec < 1) return s;
  const ts = Math.floor(s.lms / 1000);
  const gr = 3 / 3600;
  if (_tickRng(ts, 8) < gr * gameSec) s.home++;
  if (_tickRng(ts, 9) < gr * gameSec) s.away++;
  s.clk -= gameSec;
  while (s.clk <= 0 && s.period < 3) { s.period++; s.clk += 1200; }
  if (s.clk < 0) s.clk = 0;
  s.lms = Date.now();
  return s;
}

// ─── Simulated live for other sports ─────────────────────────────────────────
// Game state persists in module-level Maps (_bballMap, _tennisMap, etc.) and
// advances incrementally — scores are stable and never jump between refreshes.
// Live odds still drift on a 15-s window for a realistic betting experience.

function buildSimulatedLiveOtherSports(opts: { skipTennis: boolean; skipVolley: boolean }): LiveMatchState[] {
  const basketball = buildBasketballMatches();
  const tennis     = opts.skipTennis ? [] : buildTennisMatches();
  const hockey     = buildHockeyMatches();
  const volleyball = opts.skipVolley ? [] : buildVolleyballMatches();

  const win15s = Math.floor(Date.now() / 15_000);

  const tennisPicks = opts.skipTennis ? [] :
    [tennis[0], tennis[1], tennis[7], tennis[8]].filter((t): t is UpcomingMatch => t != null);
  const picks: Array<{ m: UpcomingMatch; si: number }> = [
    ...basketball.slice(0, 3).map((m, i) => ({ m, si: i })),
    ...tennisPicks.map((m, i) => ({ m, si: i + 3 })),
    ...hockey.slice(0, 2).map((m, i) => ({ m, si: i + 7 })),
    ...(opts.skipVolley ? [] : volleyball.slice(0, 2).map((m, i) => ({ m, si: i + 9 }))),
  ];

  const TENNIS_SEQ = [0, 15, 30, 40] as const;
  const mkOddsRng  = (seed: number) => (n: number) => {
    const x = Math.sin(seed + n * 7919) * 2654435761;
    return x - Math.floor(x);
  };

  return picks.map(({ m, si }) => {
    const rngOdds = mkOddsRng(win15s * 53 + si * 41);
    let homeScore = 0, awayScore = 0, minute = 0, status = "";
    let _liveExtra: LiveMatchState["_liveExtra"] = undefined;

    if (m.sport === "basketball") {
      const st  = _getBball(si);
      homeScore = st.home;
      awayScore = st.away;
      minute    = (st.q - 1) * 12 + Math.floor((720 - st.clk) / 60);
      status    = `Q${st.q}`;
      _liveExtra = { clockStr: _fmtClock(st.clk) };

    } else if (m.sport === "tennis") {
      const st   = _getTennis(si);
      const sets: Array<[number,number]> = [...st.sets, [st.inH, st.inA]];
      homeScore  = st.hS;
      awayScore  = st.aS;
      const currentSet = sets.length;
      status  = `Set ${currentSet}`;
      minute  = currentSet;
      const inDeuce = st.ptH >= 3 && st.ptA >= 3;
      let hPt: number | string, aPt: number | string;
      if (inDeuce) {
        if (st.ptH === st.ptA)    { hPt = "D";   aPt = "D"; }
        else if (st.ptH > st.ptA) { hPt = "AD";  aPt = 40; }
        else                       { hPt = 40;    aPt = "AD"; }
      } else {
        hPt = TENNIS_SEQ[Math.min(st.ptH, 3)]!;
        aPt = TENNIS_SEQ[Math.min(st.ptA, 3)]!;
      }
      _liveExtra = { sets, currentPoints: [hPt, aPt] };

    } else if (m.sport === "hockey") {
      const st  = _getHockey(si);
      homeScore = st.home;
      awayScore = st.away;
      minute    = (st.period - 1) * 20 + Math.floor((1200 - st.clk) / 60);
      status    = `P${st.period}`;
      _liveExtra = { clockStr: _fmtClock(st.clk) };

    } else {
      const st  = _getVolley(si);
      homeScore = st.hS;
      awayScore = st.aS;
      const currentSet = Math.min(st.hS + st.aS + 1, 5);
      status  = `Set ${currentSet}`;
      minute  = currentSet;
      _liveExtra = { vollSets: st.vollSets, currentPts: [st.ptH, st.ptA] };
    }

    // ── Live odds drift (15-s window) ─────────────────────────────────────────
    const scoreDiff = homeScore - awayScore;
    const pressure  = m.sport === "tennis" || m.sport === "volleyball" ? 0.05 : 0.03;
    const noiseH    = (rngOdds(1) - 0.5) * 0.08;
    const noiseA    = (rngOdds(2) - 0.5) * 0.08;
    const noiseD    = (rngOdds(3) - 0.5) * 0.06;
    const drift = (base: number, shift: number) =>
      Math.round(Math.max(1.01, Math.min(base * 1.30, base * (1 + shift))) * 100) / 100;
    const liveOdds = {
      home: drift(m.odds.home, noiseH - scoreDiff * pressure),
      draw: m.odds.draw > 0 ? drift(m.odds.draw, noiseD) : 0,
      away: drift(m.odds.away, noiseA + scoreDiff * pressure),
    };

    return {
      id:          m.id,
      home:        m.home,
      away:        m.away,
      league:      m.league,
      country:     m.country,
      sport:       m.sport,
      homeScore,
      awayScore,
      minute,
      status,
      hasRealOdds: m.hasRealOdds,
      odds:        liveOdds,
      markets:     m.markets,
      events:      [],
      _liveExtra,
    } satisfies LiveMatchState;
  });
}

export { buildLiveMatches, buildUpcomingMatches, buildBasketballMatches, buildTennisMatches, buildHockeyMatches, buildVolleyballMatches };

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/live", async (_req, res) => {
  try {
    const [soccerMatches, nhlTournaments, tennisTournaments, volleyTournaments, tennisStatsMap] = await Promise.all([
      buildLiveMatches(),
      getNHLLive(),
      getTennisLive(),
      getVolleyballLive(),
      getTennisStatsMap(),
    ]);
    const nhlMatches    = buildNHLLiveMatches(nhlTournaments);
    const tennisMatches = buildTennisLiveMatches(tennisTournaments, tennisStatsMap);
    const volleyMatches = buildVolleyballLiveMatches(volleyTournaments);
    const simulated     = buildSimulatedLiveOtherSports({
      skipTennis: tennisMatches.length > 0,
      skipVolley: volleyMatches.length > 0,
    });
    const matches = [...soccerMatches, ...nhlMatches, ...tennisMatches, ...volleyMatches, ...simulated];
    res.json({ matches });
  } catch (err) {
    console.error("[live route] unexpected error:", err);
    res.json({ matches: [] });
  }
});

router.get("/upcoming", async (req, res) => {
  try {
    const sport = String(req.query["sport"] ?? "all");
    const [realFootball, basketball, tennis, hockey, volleyball] = await Promise.all([
      buildUpcomingMatches(),
      Promise.resolve(buildBasketballMatches()),
      Promise.resolve(buildTennisMatches()),
      Promise.resolve(buildHockeyMatches()),
      Promise.resolve(buildVolleyballMatches()),
    ]);
    const simFootball = buildSimulatedFootballMatches();
    const seenKeys = new Set(realFootball.map(m => `${m.home}|${m.away}`));
    const football = [...realFootball, ...simFootball.filter(m => !seenKeys.has(`${m.home}|${m.away}`))];
    let matches: UpcomingMatch[];
    if (sport === "football") matches = football;
    else if (sport === "basketball") matches = basketball;
    else if (sport === "tennis") matches = tennis;
    else if (sport === "hockey") matches = hockey;
    else if (sport === "volleyball") matches = volleyball;
    else matches = [...football, ...basketball, ...tennis, ...hockey, ...volleyball];
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar próximas partidas" });
  }
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
      const resp = await fetch(`${BASE_V2}/soccer/matches/results?access_key=${STATSPAL_KEY}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        const leagueArr = ((data?.["results"] ?? data?.["yesterday_results"]) as Record<string, unknown> | undefined)?.["league"];
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

  res.json({
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
    res.status(500).json({ error: "Ligas indisponíveis" });
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
};
let tennisOddsCache: TennisOddsEntry[] | null = null;
let tennisOddsFetchedAt = 0;
const TENNIS_ODDS_TTL = 60 * 1000; // 1 min — odds fluctuate

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
const VOLLEY_ODDS_TTL = 5 * 60 * 1000;

async function getVolleyballOdds(): Promise<VolleyOddsEntry[]> {
  const now = Date.now();
  if (volleyOddsCache && now - volleyOddsFetchedAt < VOLLEY_ODDS_TTL) return volleyOddsCache;
  const resp = await fetch(`${BASE_V1}/volleyball/odds?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
  volleyOddsCache = results;
  volleyOddsFetchedAt = now;
  return results;
}

router.get("/volleyball-odds", async (_req, res) => {
  try {
    const odds = await getVolleyballOdds();
    res.json({ odds });
  } catch {
    res.status(500).json({ error: "Odds de voleibol indisponíveis" });
  }
});

async function getTennisOdds(): Promise<TennisOddsEntry[]> {
  const now = Date.now();
  if (tennisOddsCache && now - tennisOddsFetchedAt < TENNIS_ODDS_TTL) return tennisOddsCache;
  const resp = await fetch(`${BASE_V1}/tennis/odds?access_key=${STATSPAL_KEY}`, { signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as { odds?: { tournament?: unknown } };
  const rawTours = data?.odds?.tournament;
  if (!rawTours) return [];
  const tours = Array.isArray(rawTours) ? rawTours : [rawTours];

  type RawBk  = { stop?: string; odd?: Array<{ name?: string; value?: string }> };
  type RawType = { value?: string; bookmaker?: RawBk | RawBk[] };
  type RawMatch = {
    id?: string; date?: string; time?: string; status?: string;
    player?: Array<{ id?: string; name?: string }>;
    odds?: { type?: RawType | RawType[] };
  };
  type RawTour = { name?: string; matches?: { match?: RawMatch | RawMatch[] } };

  const avgOdd = (bks: RawBk[], idx: 0 | 1): number => {
    const vals: number[] = [];
    for (const bk of bks) {
      if (bk.stop === "True") continue;
      const v = parseFloat(bk.odd?.[idx]?.value ?? "0");
      if (v > 1) vals.push(v);
    }
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const margined = Math.round(avg * 0.975 * 100) / 100; // 2.5% house margin
    return Math.max(1.01, margined); // floor at 1.01 — odds below 1 are impossible
  };

  const results: TennisOddsEntry[] = [];
  const seen = new Set<string>();

  for (const rawTour of tours as RawTour[]) {
    const rawMatches = rawTour.matches?.match;
    if (!rawMatches) continue;
    const matches = Array.isArray(rawMatches) ? rawMatches : [rawMatches];
    for (const m of matches) {
      if (!m.id || seen.has(m.id)) continue;
      if (m.status !== "1" && m.status !== "0") continue;
      seen.add(m.id);
      const rawTypes = m.odds?.type;
      const types: RawType[] = !rawTypes ? [] : Array.isArray(rawTypes) ? rawTypes : [rawTypes];
      const matchType = types.find(t => t.value === "Home/Away");
      if (!matchType) continue;
      const bks = (Array.isArray(matchType.bookmaker) ? matchType.bookmaker : matchType.bookmaker ? [matchType.bookmaker] : []) as RawBk[];
      const h = avgOdd(bks, 0); const a = avgOdd(bks, 1);
      if (!h || !a) continue;

      const set1Type = types.find(t => t.value === "Home/Away (1st Set)");
      let set1Odds: [number, number] | null = null;
      if (set1Type) {
        const s1bks = (Array.isArray(set1Type.bookmaker) ? set1Type.bookmaker : set1Type.bookmaker ? [set1Type.bookmaker] : []) as RawBk[];
        const s1h = avgOdd(s1bks, 0); const s1a = avgOdd(s1bks, 1);
        if (s1h && s1a) set1Odds = [s1h, s1a];
      }

      const p = m.player ?? [];
      results.push({
        matchId: m.id,
        date: m.date ?? "", time: m.time ?? "",
        tournamentName: rawTour.name ?? "",
        players: [{ id: p[0]?.id ?? "", name: p[0]?.name ?? "" }, { id: p[1]?.id ?? "", name: p[1]?.name ?? "" }],
        matchOdds: [h, a], set1Odds,
      });
    }
  }
  tennisOddsCache = results;
  tennisOddsFetchedAt = now;
  return results;
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

export default router;
