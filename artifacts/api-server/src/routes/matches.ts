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
): { odds: { home: number; draw: number; away: number }; markets: AdvancedMarkets } {
  const r = (n: number) => Math.round(n * 100) / 100;
  const real =
    map.get(m.fallback_id_1) ??
    map.get(m.fallback_id_2) ??
    map.get(m.fallback_id_3);

  if (real) {
    return {
      odds: { home: r(real.home), draw: r(real.draw), away: r(real.away) },
      markets: makeAdvancedMarketsReal(real.home, real.draw, real.away, real.types),
    };
  }

  // Fallback: deterministic pseudo-random
  const generated = makeOdds(seed);
  return { odds: generated, markets: makeAdvancedMarkets(generated.home, generated.draw, generated.away) };
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
      const { odds: matchOdds, markets } = resolveOdds(m, odds, seed);

      results.push({
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
        country: league.country,
        time: m.status,
        date: m.date,
        odds: matchOdds,
        markets,
      });
    }
  }

  return results;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/live", async (_req, res) => {
  try {
    const matches = await buildLiveMatches();
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar partidas ao vivo" });
  }
});

router.get("/upcoming", async (_req, res) => {
  try {
    const matches = await buildUpcomingMatches();
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

export default router;
