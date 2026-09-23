import { Router, type IRouter, type Request, type Response } from "express";

type Odds1X2 = {
  home: number;
  draw: number;
  away: number;
};

type GenericMarkets = Record<string, unknown>;

export type FootballMarketTier = "A" | "B" | "C";

export type LiveMatchState = {
  id: string;
  home: string;
  away: string;
  league: string;
  country?: string;
  sport: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  hasRealOdds: boolean;
  odds: Odds1X2;
  markets: GenericMarkets;
  events: Array<Record<string, unknown>>;
  marketSuspension?: Record<string, number>;
  _suspensionReason?: string;
  _missingSinceAt?: number;
  leagueId?: string;
  seasonId?: string;
  matchTier?: FootballMarketTier;
};

export type UpcomingMatch = {
  id: string;
  home: string;
  away: string;
  league: string;
  country?: string;
  sport: string;
  hasRealOdds: boolean;
  odds: Odds1X2;
  markets: GenericMarkets;
  date?: string;
  time?: string;
  leagueId?: string;
  seasonId?: string;
};

const router: IRouter = Router();

const EMPTY_ODDS: Odds1X2 = { home: 0, draw: 0, away: 0 };
const EMPTY_LIVE: LiveMatchState[] = [];
const EMPTY_UPCOMING: UpcomingMatch[] = [];

export const liveMatchState = new Map<string, LiveMatchState>();
export const finishedMatchResults = new Map<
  string,
  {
    home: number;
    away: number;
    status: string;
    finishedAt: number;
    homeTeam?: string;
    awayTeam?: string;
    htHome?: number;
    htAway?: number;
    cornersTotal?: number;
    cardsTotal?: number;
    firstGoal?: string;
    extras?: Record<string, unknown>;
  }
>();

export async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  return EMPTY_UPCOMING;
}

export function getUpcomingMatchesSnapshot(): UpcomingMatch[] {
  return EMPTY_UPCOMING;
}

export async function ensureFinishedMatchResult(_matchId: string): Promise<boolean> {
  return false;
}

export function footballMarketTier(
  _leagueDisplayName: string,
  _country?: string,
): FootballMarketTier {
  return "C";
}

export function footballMarketTierMaxStake(
  _tier: FootballMarketTier,
  defaultMaxStake: number,
): number {
  return defaultMaxStake;
}

function sendJson(res: Response, payload: unknown): void {
  res.json(payload);
}

router.get("/live", async (_req: Request, res: Response) => {
  sendJson(res, { matches: EMPTY_LIVE });
});

router.get("/live-filler", async (_req: Request, res: Response) => {
  sendJson(res, { matches: EMPTY_LIVE });
});

router.get("/live-match/:id", async (_req: Request, res: Response) => {
  res.status(404).json({ error: "sports api removed" });
});

router.get("/upcoming-match/:id", async (_req: Request, res: Response) => {
  res.status(404).json({ error: "sports api removed" });
});

router.get("/all-odds/:id", async (_req: Request, res: Response) => {
  sendJson(res, { markets: [] });
});

router.get("/live-stream", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ matches: EMPTY_LIVE })}\n\n`);
  const ping = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);
  res.on("close", () => {
    clearInterval(ping);
    res.end();
  });
});

router.get("/catalog", async (_req: Request, res: Response) => {
  sendJson(res, { regions: [] });
});

router.get("/catalog/competitions", async (_req: Request, res: Response) => {
  sendJson(res, { competitions: [] });
});

router.get("/upcoming", async (_req: Request, res: Response) => {
  sendJson(res, { matches: EMPTY_UPCOMING });
});

router.get("/", async (_req: Request, res: Response) => {
  sendJson(res, { matches: EMPTY_LIVE });
});

router.get("/stats", async (_req: Request, res: Response) => {
  sendJson(res, null);
});

router.get("/tournaments", async (_req: Request, res: Response) => {
  sendJson(res, { tournaments: [] });
});

router.get("/standings", async (_req: Request, res: Response) => {
  sendJson(res, { teams: [], groups: [] });
});

router.get("/tournaments/:id", async (_req: Request, res: Response) => {
  sendJson(res, { tournament: null, matches: [] });
});

router.get("/tournaments/:id/draw", async (_req: Request, res: Response) => {
  sendJson(res, { rounds: [] });
});

router.get("/results", async (_req: Request, res: Response) => {
  sendJson(res, { results: [] });
});

router.get("/tennis-news", async (_req: Request, res: Response) => {
  sendJson(res, { articles: [] });
});

router.get("/volleyball-results", async (_req: Request, res: Response) => {
  sendJson(res, { results: [] });
});

router.get("/hockey-results", async (_req: Request, res: Response) => {
  sendJson(res, { results: [] });
});

router.get("/basketball-results", async (_req: Request, res: Response) => {
  sendJson(res, { results: [] });
});

router.get("/mlb-results", async (_req: Request, res: Response) => {
  sendJson(res, { results: [] });
});

router.get("/football-results", async (_req: Request, res: Response) => {
  sendJson(res, { results: [] });
});

router.get("/football-results-stats", async (_req: Request, res: Response) => {
  sendJson(res, { stats: null });
});

router.get("/league-standings", async (_req: Request, res: Response) => {
  sendJson(res, { league: null, teams: [], groups: [] });
});

router.get("/football-leagues", async (_req: Request, res: Response) => {
  sendJson(res, { leagues: [] });
});

router.get("/football-livescores", async (_req: Request, res: Response) => {
  sendJson(res, { leagues: [] });
});

router.get("/football-daily/:offset", async (_req: Request, res: Response) => {
  sendJson(res, { leagues: [] });
});

router.get("/confrontos", async (req: Request, res: Response) => {
  sendJson(res, {
    homeWins: 0,
    awayWins: 0,
    draws: 0,
    recentMeetings: [],
    homeRecentMatches: [],
    awayRecentMatches: [],
    team1Name: String(req.query["home"] ?? ""),
    team2Name: String(req.query["away"] ?? ""),
    sport: String(req.query["sport"] ?? ""),
  });
});

router.get("/team-upcoming", async (_req: Request, res: Response) => {
  sendJson(res, { fixtures: [] });
});

router.get("/player-profile/:id", async (_req: Request, res: Response) => {
  res.status(404).json({ error: "player profile unavailable" });
});

router.get("/storylines/:matchId", async (_req: Request, res: Response) => {
  sendJson(res, { storyline: null });
});

router.get("/top-scorers/:leagueId", async (_req: Request, res: Response) => {
  sendJson(res, { scorers: [] });
});

router.get("/lineups/:matchId", async (_req: Request, res: Response) => {
  sendJson(res, {
    confirmed: false,
    formationHome: null,
    formationAway: null,
    home: [],
    away: [],
    benchHome: [],
    benchAway: [],
  });
});

router.get("/prediction/:matchId", async (_req: Request, res: Response) => {
  sendJson(res, { prediction: null });
});

router.get("/volleyball-leagues", async (_req: Request, res: Response) => {
  sendJson(res, { leagues: [] });
});

router.get("/tennis-odds", async (_req: Request, res: Response) => {
  sendJson(res, { matches: [] });
});

router.get("/basketball-odds", async (_req: Request, res: Response) => {
  sendJson(res, { matches: [] });
});

router.get("/volleyball-odds", async (_req: Request, res: Response) => {
  sendJson(res, { matches: [] });
});

router.get("/hockey-odds", async (_req: Request, res: Response) => {
  sendJson(res, { matches: [] });
});

router.get("/mlb-odds", async (_req: Request, res: Response) => {
  sendJson(res, { matches: [] });
});

router.get("/volleyball-schedule/:id", async (_req: Request, res: Response) => {
  sendJson(res, { matches: [] });
});

router.get("/volleyball-standings/:id", async (_req: Request, res: Response) => {
  sendJson(res, { teams: [] });
});

export default router;
