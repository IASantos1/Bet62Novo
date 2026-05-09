import { Router, type IRouter } from "express";

const router: IRouter = Router();

const STATSPAL_KEY = process.env.STATSPAL_API_KEY;
const BASE_V2 = "https://statpal.io/api/v2";
const BASE_V1 = "https://statpal.io/api/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdvancedMarkets = {
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore: { yes: number; no: number };
  totalGoals: { over15: number; under15: number; over25: number; under25: number; over35: number; under35: number };
  handicap: { homeMinusOne: number; awayPlusOne: number; homeMinusOneHalf: number; awayPlusOneHalf: number };
  halfTime: { home: number; draw: number; away: number };
  firstGoal: { home: number; noGoal: number; away: number };
};

export type LiveMatchState = {
  id: string;
  home: string;
  away: string;
  league: string;
  country: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  hasRealOdds: boolean;
  odds: { home: number; draw: number; away: number };
  markets: AdvancedMarkets;
  events: Array<{ type: string; team: string; minute: number; player: string }>;
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

  // BTTS: P(home ≥ 1) × P(away ≥ 1)
  const pBttsYes = mc((1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway)), 0.02, 0.98);
  const [bttsYes, bttsNo] = probsToDecimalOdds([pBttsYes, 1 - pBttsYes], 1.06);

  // Total Goals via Poisson CDF
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

  // First Goal: proportional to lambdas, with P(no goal) = e^-(λH+λA)
  const pNoGoal = mc(Math.exp(-(lambdaHome + lambdaAway)), 0.01, 0.20);
  const pFGHome = mc((lambdaHome / (lambdaHome + lambdaAway + 1e-9)) * (1 - pNoGoal), 0.02, 0.90);
  const pFGAway = mc((lambdaAway / (lambdaHome + lambdaAway + 1e-9)) * (1 - pNoGoal), 0.02, 0.90);
  const [fgH, fgNG, fgA] = probsToDecimalOdds([pFGHome, pNoGoal, pFGAway], 1.08);

  return {
    doubleChance: { homeOrDraw: dcHD!, awayOrDraw: dcDA!, homeOrAway: dcHA! },
    bothTeamsScore: { yes: bttsYes!, no: bttsNo! },
    totalGoals: { over15: o15!, under15: u15!, over25: o25!, under25: u25!, over35: o35!, under35: u35! },
    handicap: { homeMinusOne: hm1H!, awayPlusOne: hm1A!, homeMinusOneHalf: hm15H!, awayPlusOneHalf: hm15A! },
    halfTime: { home: htH!, draw: htX!, away: htA! },
    firstGoal: { home: fgH!, noGoal: fgNG!, away: fgA! },
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

// Live state: stable odds across refreshes
export const liveMatchState = new Map<string, LiveMatchState>();

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getLiveLeagues(): Promise<StatpalLeagueV2[]> {
  const now = Date.now();
  if (liveCache && now - liveFetchedAt < 30_000) return liveCache;
  const resp = await fetch(`${BASE_V2}/soccer/matches/live?access_key=${STATSPAL_KEY}`, {
    signal: AbortSignal.timeout(9000),
  });
  if (!resp.ok) throw new Error(`Statpal live HTTP ${resp.status}`);
  const data = (await resp.json()) as { live_matches: { league: StatpalLeagueV2[] } };
  liveCache = data?.live_matches?.league ?? [];
  liveFetchedAt = now;
  return liveCache;
}

async function getDailyLeagues(): Promise<StatpalLeagueV2[]> {
  const now = Date.now();
  if (dailyCache && now - dailyFetchedAt < 300_000) return dailyCache;
  const resp = await fetch(`${BASE_V2}/soccer/matches/daily?offset=0&access_key=${STATSPAL_KEY}`, {
    signal: AbortSignal.timeout(9000),
  });
  if (!resp.ok) throw new Error(`Statpal daily HTTP ${resp.status}`);
  const raw = (await resp.json()) as Record<string, { league: StatpalLeagueV2[] }>;
  const dayData = Object.values(raw)[0];
  dailyCache = dayData?.league ?? [];
  dailyFetchedAt = now;
  return dailyCache;
}

async function getTomorrowLeagues(): Promise<StatpalLeagueV2[]> {
  const now = Date.now();
  if (dailyTomorrowCache && now - dailyTomorrowFetchedAt < 1_800_000) return dailyTomorrowCache;
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
  if (oddsMap && now - oddsFetchedAt < 600_000) return oddsMap;

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

// ─── Match builders ────────────────────────────────────────────────────────────

async function buildLiveMatches(): Promise<LiveMatchState[]> {
  const [leagues, odds] = await Promise.all([getLiveLeagues(), getOddsMap()]);

  const sorted = [...leagues].sort((a, b) => leaguePriority(a.name, a.country) - leaguePriority(b.name, b.country));

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

      // Stable odds: once assigned, keep unless score changes significantly
      const existing = liveMatchState.get(m.main_id);
      let matchOdds: { home: number; draw: number; away: number };
      let matchMarkets: AdvancedMarkets;

      let hasRealOdds = existing?.hasRealOdds ?? false;

      if (existing && existing.homeScore === homeScore && existing.awayScore === awayScore) {
        // Score unchanged — reuse odds to avoid drift
        matchOdds = existing.odds;
        matchMarkets = existing.markets;
      } else {
        // Score changed or first seen — resolve from real odds or model
        const resolved = resolveOdds(m, odds);
        matchOdds = resolved.odds;
        matchMarkets = resolved.markets;
        hasRealOdds = resolved.real;

        // Adjust based on live score differential
        const diff = homeScore - awayScore;
        if (diff !== 0) {
          const factor = Math.min(0.35, Math.abs(diff) * 0.12);
          if (diff > 0) {
            matchOdds = {
              home: Math.max(1.04, +(matchOdds.home * (1 - factor)).toFixed(2)),
              draw: matchOdds.draw,
              away: Math.min(15, +(matchOdds.away * (1 + factor)).toFixed(2)),
            };
          } else {
            matchOdds = {
              home: Math.min(15, +(matchOdds.home * (1 + factor)).toFixed(2)),
              draw: matchOdds.draw,
              away: Math.max(1.04, +(matchOdds.away * (1 - factor)).toFixed(2)),
            };
          }
          matchMarkets = makeAdvancedMarketsFromTeams(m.home.name, m.away.name);
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

      const state: LiveMatchState = {
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
        country: league.country,
        homeScore,
        awayScore,
        minute,
        status: m.status,
        hasRealOdds,
        odds: matchOdds,
        markets: matchMarkets,
        events,
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

      results.push({
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
        country: league.country,
        time: m.status,
        date: m.date,
        sport: "football",
        hasRealOdds: real,
        odds: matchOdds,
        markets,
      });
    }
  }

  return results;
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
  const dayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

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

  const dateStr = today.toISOString().slice(0, 10);
  return MATCHUPS.map(([home, away, league, country, time], i) => {
    const seedKey = `bball:${dayKey}:${i}:${home}:${away}`;
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
          over15: oTotal1H!, under15: uTotal1H!,
          over25: oTotal!, under25: uTotal!,
          over35: oHT!, under35: uHT!,
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
      } as unknown as AdvancedMarkets,
    };
  });
}

function buildTennisMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  const ATP_PLAYERS = [
    "Novak Djokovic", "Carlos Alcaraz", "Jannik Sinner", "Daniil Medvedev",
    "Alexander Zverev", "Andrey Rublev", "Casper Ruud", "Taylor Fritz",
    "Grigor Dimitrov", "Hubert Hurkacz",
  ];
  const WTA_PLAYERS = [
    "Aryna Sabalenka", "Iga Swiatek", "Coco Gauff", "Elena Rybakina",
    "Qinwen Zheng", "Jasmine Paolini", "Daria Kasatkina", "Emma Navarro",
  ];

  const TOURNAMENTS: [string, string, string, string][] = [
    ["ATP 500 — Roma", "italy", "14:00", "atp"],
    ["ATP 250 — Hamburgo", "germany", "15:30", "atp"],
    ["WTA 1000 — Roma", "italy", "13:00", "wta"],
    ["WTA 250 — Estrasburgo", "france", "14:30", "wta"],
    ["Roland Garros — Qualificação", "france", "11:00", "atp"],
    ["Roland Garros — Qualificação", "france", "12:30", "wta"],
  ];

  const dateStr = today.toISOString().slice(0, 10);
  return TOURNAMENTS.map(([league, country, time, tour], i) => {
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
          over15: set1H!, under15: set1A!,
          over25: oSets!, under25: uSets!,
          over35: 0, under35: 0,
        },
        handicap: {
          homeMinusOne: hcapH!, awayPlusOne: hcapA!,
          homeMinusOneHalf: 0, awayPlusOneHalf: 0,
        },
        halfTime: { home: 0, draw: 0, away: 0 },
        firstGoal: { home: 0, noGoal: 0, away: 0 },
      },
    };
  });
}

export { buildLiveMatches, buildUpcomingMatches, buildBasketballMatches, buildTennisMatches };

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/live", async (_req, res) => {
  try {
    const matches = await buildLiveMatches();
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar partidas ao vivo" });
  }
});

router.get("/upcoming", async (req, res) => {
  try {
    const sport = String(req.query["sport"] ?? "all");
    const [football, basketball, tennis] = await Promise.all([
      buildUpcomingMatches(),
      Promise.resolve(buildBasketballMatches()),
      Promise.resolve(buildTennisMatches()),
    ]);
    let matches: UpcomingMatch[];
    if (sport === "football") matches = football;
    else if (sport === "basketball") matches = basketball;
    else if (sport === "tennis") matches = tennis;
    else matches = [...football, ...basketball, ...tennis];
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

  const homeWins = ri(3, 11, 1.1);
  const draws    = ri(2,  6, 2.3);
  const awayWins = ri(2,  9, 3.7);
  const avgGoals = rng(2.1, 3.2, 4.1);
  const over15   = Math.min(94, Math.max(66, ri(68, 92, 5.3)));
  const over25   = Math.min(74, Math.max(36, ri(42, 70, 6.1)));
  const cards    = rng(3.0, 4.5, 7.2);
  const corners  = rng(9.5, 12.5, 8.4);
  const btts     = ri(40, 62, 12.1);

  const fakeOpponents = ["Arsenal","Chelsea","Liverpool","Man City","Tottenham","Newcastle","Brighton","Juventus","Bayern","Roma","PSG","Inter","Dortmund","Sevilla","Benfica"];
  const formPool: Array<{ result: "W"|"D"|"L"; score: string }> = [
    { result: "W", score: "2-0" }, { result: "W", score: "1-0" }, { result: "W", score: "3-1" },
    { result: "W", score: "2-1" }, { result: "D", score: "1-1" }, { result: "D", score: "0-0" },
    { result: "D", score: "2-2" }, { result: "L", score: "0-1" }, { result: "L", score: "1-2" },
    { result: "L", score: "0-2" }, { result: "W", score: "4-0" },
  ];

  let homeForm: FormEntry[] = [];
  let awayForm: FormEntry[] = [];

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

  if (homeForm.length < 5) {
    homeForm = Array.from({ length: 5 }, (_, i) => {
      const fp = formPool[ri(0, formPool.length - 1, i + 1.13)];
      return { ...fp, opponent: fakeOpponents[ri(0, fakeOpponents.length - 1, i + 2.27)], home: i % 2 === 0 };
    });
  }
  if (awayForm.length < 5) {
    awayForm = Array.from({ length: 5 }, (_, i) => {
      const fp = formPool[ri(0, formPool.length - 1, i + 4.31)];
      return { ...fp, opponent: fakeOpponents[ri(0, fakeOpponents.length - 1, i + 5.47)], home: i % 2 === 1 };
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

// ─── Standings endpoint ───────────────────────────────────────────────────────

router.get("/standings", async (req, res) => {
  const league = String(req.query["league"] ?? "");
  try {
    const resp = await fetch(`${BASE_V2}/soccer/tables?access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, unknown>;
    const leagueArr = (data?.["tables"] as Record<string, unknown> | undefined)?.["league"];
    const leagues: unknown[] = Array.isArray(leagueArr) ? leagueArr : leagueArr ? [leagueArr] : [];
    const leagueSlug = league.toLowerCase();
    let found: unknown = null;
    for (const l of leagues) {
      const lo = l as Record<string, unknown>;
      if (String(lo["name"] ?? "").toLowerCase().includes(leagueSlug) || leagueSlug === "") {
        found = lo;
        break;
      }
    }
    if (!found && leagues.length > 0) found = leagues[0];
    const lo = found as Record<string, unknown> | null;
    const teamArr = (lo?.["teams"] as Record<string, unknown> | undefined)?.["team"];
    const teams: unknown[] = Array.isArray(teamArr) ? teamArr : teamArr ? [teamArr] : [];
    res.json({
      league: String(lo?.["name"] ?? league),
      teams: teams.slice(0, 20).map((t, i) => {
        const to = t as Record<string, unknown>;
        return {
          pos: i + 1,
          name: String(to["name"] ?? ""),
          played: Number(to["played"] ?? 0),
          won: Number(to["won"] ?? 0),
          drawn: Number(to["drawn"] ?? 0),
          lost: Number(to["lost"] ?? 0),
          gf: Number(to["goals_for"] ?? 0),
          ga: Number(to["goals_against"] ?? 0),
          pts: Number(to["points"] ?? 0),
        };
      }),
    });
  } catch {
    res.status(500).json({ error: "Classificação indisponível" });
  }
});

export default router;
