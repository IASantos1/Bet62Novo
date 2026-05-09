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

function makeOdds(seed: number): { home: number; draw: number; away: number } {
  const h = (((seed * 1664525 + 1013904223) & 0x7fffffff) % 350) / 100 + 1.40;
  const d = (((seed * 22695477 + 1) & 0x7fffffff) % 200) / 100 + 2.80;
  const a = (((seed * 1566083941 + 1) & 0x7fffffff) % 450) / 100 + 1.50;
  return {
    home: Math.round(h * 100) / 100,
    draw: Math.round(d * 100) / 100,
    away: Math.round(Math.abs(a) * 100) / 100,
  };
}

function makeAdvancedMarkets(home: number, draw: number, away: number): AdvancedMarkets {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    doubleChance: {
      homeOrDraw: r(1 / (1 / home + 1 / draw) * 0.92),
      awayOrDraw: r(1 / (1 / away + 1 / draw) * 0.92),
      homeOrAway: r(1 / (1 / home + 1 / away) * 0.92),
    },
    bothTeamsScore: {
      yes: r(home > 2.5 ? 1.65 : home > 1.8 ? 1.80 : 1.95),
      no: r(home > 2.5 ? 2.10 : home > 1.8 ? 1.95 : 1.82),
    },
    totalGoals: {
      over15: r(1.28),
      under15: r(3.40),
      over25: r(home > 2 ? 1.75 : 1.90),
      under25: r(home > 2 ? 2.05 : 1.88),
      over35: r(home > 2 ? 2.50 : 2.80),
      under35: r(home > 2 ? 1.50 : 1.42),
    },
    handicap: {
      homeMinusOne: r(home * 1.35),
      awayPlusOne: r(away * 0.72),
      homeMinusOneHalf: r(home * 1.65),
      awayPlusOneHalf: r(away * 0.60),
    },
    halfTime: {
      home: r(home * 1.15),
      draw: r(draw * 0.85),
      away: r(away * 1.20),
    },
    firstGoal: {
      home: r(home * 0.85),
      noGoal: r(8.50),
      away: r(away * 0.88),
    },
  };
}

// Build advanced markets from real odds data where possible
function makeAdvancedMarketsReal(
  home: number,
  draw: number,
  away: number,
  types: OddsType[]
): AdvancedMarkets {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = makeAdvancedMarkets(home, draw, away);

  // Both Teams To Score
  const bttsType = types.find(t => t.name.toLowerCase().includes("both teams"));
  if (bttsType) {
    const bk = Array.isArray(bttsType.bookmaker) ? bttsType.bookmaker[0] : bttsType.bookmaker;
    if (bk?.odd) {
      const odds = Array.isArray(bk.odd) ? bk.odd : [bk.odd];
      const yes = parseFloat2(odds.find(o => o.name === "Yes")?.value);
      const no = parseFloat2(odds.find(o => o.name === "No")?.value);
      if (yes > 0 && no > 0) { base.bothTeamsScore = { yes: r(yes), no: r(no) }; }
    }
  }

  // Over/Under
  const ouType = types.find(t => t.name.toLowerCase().includes("over/under"));
  if (ouType) {
    const bk = Array.isArray(ouType.bookmaker) ? ouType.bookmaker[0] : ouType.bookmaker;
    if (bk?.total) {
      const totals = Array.isArray(bk.total) ? bk.total : [bk.total];
      const line25 = totals.find(t => t.name === "2.5");
      if (line25) {
        const odds25 = Array.isArray(line25.odd) ? line25.odd : [line25.odd];
        const over = parseFloat2(odds25.find(o => o.name === "Over")?.value);
        const under = parseFloat2(odds25.find(o => o.name === "Under")?.value);
        if (over > 0 && under > 0) {
          base.totalGoals.over25 = r(over);
          base.totalGoals.under25 = r(under);
        }
      }
      const line15 = totals.find(t => t.name === "1.5");
      if (line15) {
        const odds15 = Array.isArray(line15.odd) ? line15.odd : [line15.odd];
        const over = parseFloat2(odds15.find(o => o.name === "Over")?.value);
        const under = parseFloat2(odds15.find(o => o.name === "Under")?.value);
        if (over > 0 && under > 0) { base.totalGoals.over15 = r(over); base.totalGoals.under15 = r(under); }
      }
      const line35 = totals.find(t => t.name === "3.5");
      if (line35) {
        const odds35 = Array.isArray(line35.odd) ? line35.odd : [line35.odd];
        const over = parseFloat2(odds35.find(o => o.name === "Over")?.value);
        const under = parseFloat2(odds35.find(o => o.name === "Under")?.value);
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

// Find real odds for a v2 match using fallback IDs
function resolveOdds(
  m: StatpalMatchV2,
  map: Map<string, RealOdds>,
  seed: number
): { odds: { home: number; draw: number; away: number }; markets: AdvancedMarkets; real: boolean } {
  const r = (n: number) => Math.round(n * 100) / 100;
  const real =
    map.get(m.fallback_id_1) ??
    map.get(m.fallback_id_2) ??
    map.get(m.fallback_id_3);

  if (real) {
    return {
      odds: { home: r(real.home), draw: r(real.draw), away: r(real.away) },
      markets: makeAdvancedMarketsReal(real.home, real.draw, real.away, real.types),
      real: true,
    };
  }

  // Fallback: deterministic pseudo-random
  const generated = makeOdds(seed);
  return {
    odds: generated,
    markets: makeAdvancedMarkets(generated.home, generated.draw, generated.away),
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
        // Score changed or first seen — resolve from real odds or generate
        const seed = parseInt(m.main_id.slice(-6)) || 42;
        const resolved = resolveOdds(m, odds, seed);
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
          matchMarkets = makeAdvancedMarkets(matchOdds.home, matchOdds.draw, matchOdds.away);
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

      const seed = parseInt(m.main_id.slice(-6)) || 99;
      const { odds: matchOdds, markets, real } = resolveOdds(m, odds, seed);

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
  const rng = dayRng(dayKey);
  const r = (n: number) => Math.round(n * 100) / 100;

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
    const homeAdv = 0.48 + rng(i * 3 + 1) * 0.14;
    const homeOdd = r(1 / homeAdv * 0.92);
    const awayOdd = r(1 / (1 - homeAdv) * 0.92);
    const spread = Math.round(4 + rng(i * 3 + 2) * 12);
    const total = Math.round(200 + rng(i * 3 + 3) * 30);
    return {
      id: `bball-${dayKey}-${i}`,
      home,
      away,
      league,
      country,
      time,
      date: dateStr,
      sport: "basketball",
      hasRealOdds: false,
      odds: { home: homeOdd, draw: 0, away: awayOdd },
      markets: {
        doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore: { yes: 0, no: 0 },
        totalGoals: {
          over15: 0, under15: 0,
          over25: r(1 + rng(i * 5 + 1) * 0.5),
          under25: r(1 + rng(i * 5 + 2) * 0.5),
          over35: r(1.5 + rng(i * 5 + 3) * 0.6),
          under35: r(1.5 + rng(i * 5 + 4) * 0.6),
        },
        handicap: {
          homeMinusOne: r(homeOdd * 1.12),
          awayPlusOne: r(awayOdd * 0.90),
          homeMinusOneHalf: r(homeOdd * 1.22),
          awayPlusOneHalf: r(awayOdd * 0.82),
        },
        halfTime: {
          home: r(homeOdd * 1.08),
          draw: 0,
          away: r(awayOdd * 1.10),
        },
        firstGoal: { home: 0, noGoal: 0, away: 0 },
        _spread: spread,
        _total: total,
      } as unknown as AdvancedMarkets,
    };
  });
}

function buildTennisMatches(): UpcomingMatch[] {
  const today = new Date();
  const dayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const rng = dayRng(dayKey + 1);
  const r = (n: number) => Math.round(n * 100) / 100;

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
    const p1idx = Math.floor(rng(i * 7 + 1) * (pool.length - 1));
    let p2idx = Math.floor(rng(i * 7 + 2) * (pool.length - 1));
    if (p2idx >= p1idx) p2idx = (p2idx + 1) % pool.length;
    const p1 = pool[p1idx];
    const p2 = pool[p2idx];
    const p1Fav = rng(i * 7 + 3) > 0.5;
    const favOdd = r(1.25 + rng(i * 7 + 4) * 0.80);
    const undOdd = r(1.80 + rng(i * 7 + 5) * 1.40);
    return {
      id: `tennis-${dayKey}-${i}`,
      home: p1,
      away: p2,
      league,
      country,
      time,
      date: dateStr,
      sport: "tennis",
      hasRealOdds: false,
      odds: { home: p1Fav ? favOdd : undOdd, draw: 0, away: p1Fav ? undOdd : favOdd },
      markets: {
        doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
        bothTeamsScore: { yes: 0, no: 0 },
        totalGoals: { over15: 0, under15: 0, over25: 0, under25: 0, over35: 0, under35: 0 },
        handicap: { homeMinusOne: 0, awayPlusOne: 0, homeMinusOneHalf: 0, awayPlusOneHalf: 0 },
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
