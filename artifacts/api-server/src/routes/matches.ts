import { Router, type IRouter } from "express";

const router: IRouter = Router();

const STATSPAL_KEY = process.env.STATSPAL_API_KEY;
const STATSPAL_BASE = "https://statpal.io/api/v2";

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

type StatpalMatch = {
  main_id: string;
  status: string;
  date: string;
  time: string;
  home: { id: string; name: string; goals: string };
  away: { id: string; name: string; goals: string };
  events: null | { event: Array<{ type: string; team: string; minute: string; player: string }> | { type: string; team: string; minute: string; player: string } };
  inplay_odds_running: string;
};

type StatpalLeague = {
  id: string;
  name: string;
  country: string;
  cup: string;
  match: StatpalMatch | StatpalMatch[];
};

const PRIORITY_LEAGUES = [
  "brazil: serie a",
  "england: premier league",
  "germany: bundesliga",
  "spain: laliga",
  "italy: serie a",
  "france: ligue 1",
  "brazil: copa do brasil",
  "uefa champions league",
  "uefa europa league",
  "brazil: serie b",
  "germany: 2. bundesliga",
  "spain: laliga2",
];

function makeOdds(seed: number): { home: number; draw: number; away: number } {
  // Deterministic pseudo-random odds based on match ID seed
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

// Shared Statpal cache — fetched once per 15s
let statpalCache: StatpalLeague[] | null = null;
let statpalFetchedAt = 0;

async function getStatpalLeagues(): Promise<StatpalLeague[]> {
  const now = Date.now();
  if (statpalCache && now - statpalFetchedAt < 15000) return statpalCache;

  const resp = await fetch(
    `${STATSPAL_BASE}/soccer/matches/live?access_key=${STATSPAL_KEY}`,
    { signal: AbortSignal.timeout(9000) }
  );
  if (!resp.ok) throw new Error(`Statpal HTTP ${resp.status}`);

  const data = (await resp.json()) as { live_matches: { league: StatpalLeague[] } };
  statpalCache = data?.live_matches?.league ?? [];
  statpalFetchedAt = now;
  return statpalCache;
}

// Keep live odds stable between requests (no random drift per request)
export const liveMatchState = new Map<string, LiveMatchState>();

async function buildLiveMatches(): Promise<LiveMatchState[]> {
  const leagues = await getStatpalLeagues();

  const prioritized = [
    ...leagues.filter(l => PRIORITY_LEAGUES.some(p => l.name?.toLowerCase().includes(p))),
    ...leagues.filter(l => !PRIORITY_LEAGUES.some(p => l.name?.toLowerCase().includes(p))),
  ];

  let count = 0;
  for (const league of prioritized) {
    if (count >= 15) break;
    const matches: StatpalMatch[] = Array.isArray(league.match) ? league.match : [league.match];
    for (const m of matches) {
      if (count >= 15) break;
      const isLiveMinute = /^\d{1,3}$/.test(m.status);
      const isHT = m.status === "HT";
      const isET = m.status === "ET";
      if (!isLiveMinute && !isHT && !isET) continue;

      const homeScore = m.home.goals === "?" ? 0 : parseInt(m.home.goals) || 0;
      const awayScore = m.away.goals === "?" ? 0 : parseInt(m.away.goals) || 0;
      const minute = isHT ? 45 : isET ? 105 : parseInt(m.status) || 1;

      // Keep existing odds stable; compute new ones if first seen
      let odds = liveMatchState.get(m.main_id)?.odds;
      if (!odds) {
        const seed = parseInt(m.main_id.slice(-6)) || 42;
        odds = makeOdds(seed);
        // Adjust based on live score
        const scoreDiff = homeScore - awayScore;
        if (scoreDiff > 0) { odds.home = Math.max(1.05, +(odds.home * 0.80).toFixed(2)); odds.away = Math.max(1.05, +(odds.away * 1.25).toFixed(2)); }
        if (scoreDiff < 0) { odds.away = Math.max(1.05, +(odds.away * 0.80).toFixed(2)); odds.home = Math.max(1.05, +(odds.home * 1.25).toFixed(2)); }
      }

      const events: LiveMatchState["events"] = [];
      if (m.events?.event) {
        const evArr = Array.isArray(m.events.event) ? m.events.event : [m.events.event];
        for (const ev of evArr) {
          events.push({ type: ev.type, team: ev.team, minute: parseInt(ev.minute) || 0, player: ev.player || "" });
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
        odds,
        markets: makeAdvancedMarkets(odds.home, odds.draw, odds.away),
        events,
      };
      liveMatchState.set(m.main_id, state);
      count++;
    }
  }

  return Array.from(liveMatchState.values()).slice(0, 15);
}

async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  const leagues = await getStatpalLeagues();

  const prioritized = [
    ...leagues.filter(l => PRIORITY_LEAGUES.some(p => l.name?.toLowerCase().includes(p))),
    ...leagues.filter(l => !PRIORITY_LEAGUES.some(p => l.name?.toLowerCase().includes(p))),
  ];

  const results: UpcomingMatch[] = [];
  for (const league of prioritized) {
    if (results.length >= 20) break;
    const matches: StatpalMatch[] = Array.isArray(league.match) ? league.match : [league.match];
    for (const m of matches) {
      if (results.length >= 20) break;
      // Only scheduled matches: status looks like "HH:MM" and goals = "?"
      if (!/^\d{2}:\d{2}$/.test(m.status)) continue;
      if (m.home.goals !== "?" || m.away.goals !== "?") continue;

      const seed = parseInt(m.main_id.slice(-6)) || 99;
      const odds = makeOdds(seed);

      results.push({
        id: m.main_id,
        home: m.home.name,
        away: m.away.name,
        league: league.name,
        country: league.country,
        time: m.status,
        date: m.date,
        odds,
        markets: makeAdvancedMarkets(odds.home, odds.draw, odds.away),
      });
    }
  }
  return results;
}

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
