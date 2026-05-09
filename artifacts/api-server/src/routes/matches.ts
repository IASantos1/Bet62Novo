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

type LiveMatchState = {
  id: string;
  home: string;
  away: string;
  league: string;
  country: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  odds: { home: number; draw: number; away: number };
  markets: AdvancedMarkets;
  statpalId?: string;
  events: Array<{ type: string; team: string; minute: number; player: string }>;
};

const liveMatchState = new Map<string, LiveMatchState>();
let lastStatpalFetch = 0;
let upcomingCache: unknown[] = [];
let upcomingLastFetch = 0;

const PRIORITY_LEAGUES = [
  "Brazil: Serie A Betano",
  "England: Premier League",
  "Germany: Bundesliga",
  "Spain: Laliga",
  "Italy: Serie A",
  "France: Ligue 1",
  "Brazil: Serie B",
  "Germany: 2. Bundesliga",
  "Brazil: Copa Do Brasil",
  "UEFA Champions League",
  "UEFA Europa League",
];

type StatpalMatch = {
  main_id: string;
  status: string;
  date: string;
  time: string;
  home: { id: string; name: string; goals: string };
  away: { id: string; name: string; goals: string };
  events: null | { event: Array<{ type: string; team: string; minute: string; player: string }> };
  inplay_odds_running: string;
};

type StatpalLeague = {
  id: string;
  name: string;
  country: string;
  cup: string;
  match: StatpalMatch | StatpalMatch[];
};

async function fetchStatpalLive(): Promise<LiveMatchState[]> {
  const now = Date.now();
  if (now - lastStatpalFetch < 15000) {
    return Array.from(liveMatchState.values());
  }
  lastStatpalFetch = now;

  try {
    const resp = await fetch(`${STATSPAL_BASE}/soccer/matches/live?access_key=${STATSPAL_KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`Statpal ${resp.status}`);
    const data = (await resp.json()) as { live_matches: { league: StatpalLeague[] } };
    const leagues: StatpalLeague[] = data?.live_matches?.league ?? [];

    const prioritized = [
      ...leagues.filter(l => PRIORITY_LEAGUES.some(p => l.name?.toLowerCase().includes(p.toLowerCase()))),
      ...leagues.filter(l => !PRIORITY_LEAGUES.some(p => l.name?.toLowerCase().includes(p.toLowerCase()))),
    ];

    let count = 0;
    for (const league of prioritized) {
      if (count >= 12) break;
      const matches = Array.isArray(league.match) ? league.match : [league.match];
      for (const m of matches) {
        if (count >= 12) break;
        const minute = parseInt(m.status);
        if (isNaN(minute) && m.status !== "HT" && m.status !== "ET") continue;

        const homeGoals = m.home.goals === "?" ? 0 : parseInt(m.home.goals) || 0;
        const awayGoals = m.away.goals === "?" ? 0 : parseInt(m.away.goals) || 0;
        const matchMinute = m.status === "HT" ? 45 : m.status === "ET" ? 105 : (minute || 1);

        const existing = liveMatchState.get(m.main_id);
        let odds: { home: number; draw: number; away: number };

        if (existing) {
          const scoreDiff = homeGoals - awayGoals;
          const minuteProgress = matchMinute / 90;
          const base = existing.odds;
          const drift = (Math.random() - 0.5) * 0.08;
          const homeFactor = scoreDiff > 0 ? 0.88 : scoreDiff < 0 ? 1.15 : 1.0;
          odds = {
            home: Math.max(1.05, Math.round((base.home * homeFactor + drift) * 100) / 100),
            draw: Math.max(1.10, Math.round((base.draw * (1 - minuteProgress * 0.3) + drift) * 100) / 100),
            away: Math.max(1.05, Math.round((base.away / homeFactor + drift) * 100) / 100),
          };
        } else {
          const r = () => 1.5 + Math.random() * 3;
          odds = { home: r(), draw: r(), away: r() };
          odds.home = Math.round(odds.home * 100) / 100;
          odds.draw = Math.round(odds.draw * 100) / 100;
          odds.away = Math.round(odds.away * 100) / 100;
        }

        const events: LiveMatchState["events"] = [];
        if (m.events?.event) {
          for (const ev of m.events.event) {
            events.push({ type: ev.type, team: ev.team, minute: parseInt(ev.minute) || 0, player: ev.player || "" });
          }
        }

        liveMatchState.set(m.main_id, {
          id: m.main_id,
          home: m.home.name,
          away: m.away.name,
          league: league.name,
          country: league.country,
          homeScore: homeGoals,
          awayScore: awayGoals,
          minute: matchMinute,
          odds,
          markets: makeAdvancedMarkets(odds.home, odds.draw, odds.away),
          statpalId: m.main_id,
          events,
        });
        count++;
      }
    }
  } catch {
    // keep stale data
  }

  return Array.from(liveMatchState.values());
}

async function fetchUpcoming(): Promise<unknown[]> {
  const now = Date.now();
  if (now - upcomingLastFetch < 300000 && upcomingCache.length > 0) {
    return upcomingCache;
  }
  upcomingLastFetch = now;

  const UPCOMING_MATCHES = [
    { id: "up-1", home: "Arsenal", away: "Chelsea", league: "Premier League", country: "england", time: "19:45", odds: { home: 2.05, draw: 3.40, away: 3.60 } },
    { id: "up-2", home: "Manchester United", away: "Liverpool", league: "Premier League", country: "england", time: "18:30", odds: { home: 2.80, draw: 3.50, away: 2.40 } },
    { id: "up-3", home: "Manchester City", away: "Aston Villa", league: "Premier League", country: "england", time: "20:00", odds: { home: 1.45, draw: 4.80, away: 7.00 } },
    { id: "up-4", home: "Flamengo", away: "Palmeiras", league: "Brasileirão Série A", country: "brazil", time: "19:30", odds: { home: 2.15, draw: 3.40, away: 3.25 } },
    { id: "up-5", home: "Corinthians", away: "São Paulo", league: "Brasileirão Série A", country: "brazil", time: "21:00", odds: { home: 2.60, draw: 3.20, away: 2.80 } },
    { id: "up-6", home: "Real Madrid", away: "Barcelona", league: "La Liga", country: "spain", time: "22:00", odds: { home: 2.30, draw: 3.50, away: 3.10 } },
    { id: "up-7", home: "Juventus", away: "Inter Milan", league: "Serie A", country: "italy", time: "18:45", odds: { home: 2.10, draw: 3.30, away: 3.50 } },
    { id: "up-8", home: "PSG", away: "Olympique Lyon", league: "Ligue 1", country: "france", time: "20:00", odds: { home: 1.55, draw: 4.00, away: 5.50 } },
    { id: "up-9", home: "Bayern München", away: "Borussia Dortmund", league: "Bundesliga", country: "germany", time: "17:30", odds: { home: 1.70, draw: 4.00, away: 4.50 } },
    { id: "up-10", home: "Atlético Mineiro", away: "Botafogo", league: "Brasileirão Série A", country: "brazil", time: "20:30", odds: { home: 2.00, draw: 3.30, away: 3.80 } },
  ];

  upcomingCache = UPCOMING_MATCHES.map(m => ({
    ...m,
    markets: makeAdvancedMarkets(m.odds.home, m.odds.draw, m.odds.away),
  }));

  return upcomingCache;
}

router.get("/live", async (_req, res) => {
  try {
    const matches = await fetchStatpalLive();
    res.json({ matches, updatedAt: new Date().toISOString() });
  } catch {
    res.status(500).json({ error: "Failed to fetch live matches" });
  }
});

router.get("/upcoming", async (_req, res) => {
  try {
    const matches = await fetchUpcoming();
    res.json({ matches });
  } catch {
    res.status(500).json({ error: "Failed to fetch upcoming matches" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const [live, upcoming] = await Promise.all([fetchStatpalLive(), fetchUpcoming()]);
    res.json({ live, upcoming });
  } catch {
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

export { liveMatchState };
export default router;
