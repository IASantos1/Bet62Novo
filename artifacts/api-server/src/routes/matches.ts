import { Router, type IRouter, type Request, type Response } from "express";
import {
  bsdEnabled,
  getBsdEventById,
  getBsdEventH2H,
  getBsdEventIncidents,
  getBsdEventLineups,
  getBsdEventPrediction,
  getBsdEventStats,
  getBsdEvents,
  getBsdLeagueBestXi,
  getBsdLeagueById,
  getBsdLeagueSeason,
  getBsdLeagueStandings,
  getBsdLeagueTopScorers,
  getBsdLiveEvents,
  getBsdOddsForEvent,
  getBsdPlayerById,
  getBsdPlayerCareer,
  getBsdPlayerNationalTeam,
  getBsdPlayerStats,
  getBsdPlayerTransfers,
  type BSDEvent,
  type BSDH2HResponse,
  type BSDLineupsResponse,
  type BSDOddsRow,
  type BSDPredictionResponse,
  type BSDStandingRow,
  type BSDStatsResponse,
} from "../services/bsd/client.js";

type Odds1X2 = {
  home: number;
  draw: number;
  away: number;
};

type GenericMarkets = {
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
  };
  drawNoBet: { home: number; away: number };
  asianHandicap: { line: number; home: number; away: number };
  totalCorners: {
    over85: number;
    under85: number;
    over95: number;
    under95: number;
    over105: number;
    under105: number;
  };
  correctScore: Record<string, number>;
};

type MatchStatsGroup = {
  title: string;
  rows: Array<{ name: string; home: string; away: string }>;
};

type MatchEvent = {
  type: string;
  team: string;
  minute: number;
  player: string;
  playerId?: string;
  detail?: string;
};

export type FootballMarketTier = "A" | "B" | "C";

export type LiveMatchState = {
  id: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeLogoUrl?: string;
  awayLogoUrl?: string;
  league: string;
  country?: string;
  sport: string;
  isLive?: boolean;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  hasRealOdds: boolean;
  odds: Odds1X2;
  markets: GenericMarkets;
  events: MatchEvent[];
  date?: string;
  time?: string;
  stadium?: string;
  referee?: string;
  matchTier?: 1 | 2 | 3 | 4;
  matchStats?: MatchStatsGroup[];
  marketSuspension?: Record<string, number>;
  _suspensionReason?: string;
  _missingSinceAt?: number;
  leagueId?: string;
  seasonId?: string;
  _commentary?: Array<{ id: string; time: string; text: string }>;
};

export type UpcomingMatch = Omit<LiveMatchState, "minute" | "homeScore" | "awayScore" | "events" | "isLive"> & {
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  events?: MatchEvent[];
};

type AllOddsMarket = {
  name: string;
  group: string;
  choices: Array<{ name: string; label: string; odds: number }>;
};

const router: IRouter = Router();

const EMPTY_ODDS: Odds1X2 = { home: 0, draw: 0, away: 0 };
const emptyMarkets = (): GenericMarkets => ({
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
  },
  drawNoBet: { home: 0, away: 0 },
  asianHandicap: { line: 0, home: 0, away: 0 },
  totalCorners: {
    over85: 0,
    under85: 0,
    over95: 0,
    under95: 0,
    over105: 0,
    under105: 0,
  },
  correctScore: {},
});

let upcomingSnapshot: UpcomingMatch[] = [];

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

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function todayIsoDate(offsetDays = 0): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return utc.toISOString().slice(0, 10);
}

function toMatchId(eventId: string | number): string {
  return `football-v2-${String(eventId)}`;
}

function toEventId(matchId: string | number): string {
  return String(matchId)
    .replace(/^football-v\d+-/i, "")
    .trim();
}

function toDateParts(iso: string | null | undefined): { date?: string; time?: string } {
  if (!iso) return {};
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return {};
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 16),
  };
}

function toTeamLogo(teamId: string | number | null | undefined): string | undefined {
  if (teamId == null || `${teamId}`.trim() === "") return undefined;
  return `https://sports.bzzoiro.com/img/team/${encodeURIComponent(String(teamId))}/?bg=transparent`;
}

function mapStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "live") return "live";
  if (normalized === "upcoming") return "upcoming";
  if (normalized === "finished") return "finished";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "postponed") return "postponed";
  return normalized;
}

function mapTier(_league: string, _country?: string): 1 | 2 | 3 | 4 {
  return 2;
}

function impliedPercent(odd: number): number {
  return odd > 1 ? Number((100 / odd).toFixed(1)) : 0;
}

function statsLabel(key: string): string {
  const labels: Record<string, string> = {
    possession: "Posse",
    shots_total: "Remates",
    shots_on_target: "À baliza",
    corners: "Cantos",
    fouls: "Faltas",
    offsides: "Foras de jogo",
    yellow_cards: "Amarelos",
    red_cards: "Vermelhos",
    saves: "Defesas",
    xg: "xG",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function buildMatchStats(stats: BSDStatsResponse | null): MatchStatsGroup[] {
  const home = stats?.stats?.home ?? {};
  const away = stats?.stats?.away ?? {};
  const keys = [
    "possession",
    "shots_total",
    "shots_on_target",
    "corners",
    "fouls",
    "offsides",
    "yellow_cards",
    "red_cards",
    "saves",
    "xg",
  ].filter((key) => home[key] != null || away[key] != null);

  if (keys.length === 0) return [];
  return [
    {
      title: "Estatísticas",
      rows: keys.map((key) => ({
        name: statsLabel(key),
        home: String(home[key] ?? "-"),
        away: String(away[key] ?? "-"),
      })),
    },
  ];
}

function normalizeOutcome(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function applyOddsRows(rows: BSDOddsRow[]): {
  odds: Odds1X2;
  markets: GenericMarkets;
  hasRealOdds: boolean;
  allOdds: AllOddsMarket[];
} {
  const odds: Odds1X2 = { ...EMPTY_ODDS };
  const markets = emptyMarkets();
  const grouped = new Map<string, AllOddsMarket>();

  const putAllOdds = (group: string, name: string, label: string, price: number) => {
    if (!(price > 1)) return;
    const key = `${group}::${name}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.choices.push({ name: label, label, odds: price });
      return;
    }
    grouped.set(key, {
      group,
      name,
      choices: [{ name: label, label, odds: price }],
    });
  };

  for (const row of rows) {
    const market = normalizeOutcome(row.market);
    const outcome = normalizeOutcome(row.outcome);
    const price = parseNumber(row.decimal_odds);
    const line = parseNumber(row.line);
    if (!(price > 1)) continue;

    if (market === "1x2") {
      if (outcome === "home") odds.home = price;
      if (outcome === "draw") odds.draw = price;
      if (outcome === "away") odds.away = price;
      putAllOdds("Resultado Final", "Resultado Final", outcome.toUpperCase(), price);
      continue;
    }

    if (market === "btts") {
      if (outcome === "yes") markets.bothTeamsScore.yes = price;
      if (outcome === "no") markets.bothTeamsScore.no = price;
      putAllOdds("Ambas Equipas Marcam", "Ambas Equipas Marcam", outcome === "yes" ? "Sim" : "Não", price);
      continue;
    }

    if (market === "double_chance") {
      if (outcome.includes("home") && outcome.includes("draw")) markets.doubleChance.homeOrDraw = price;
      else if (outcome.includes("away") && outcome.includes("draw")) markets.doubleChance.awayOrDraw = price;
      else if (outcome.includes("home") && outcome.includes("away")) markets.doubleChance.homeOrAway = price;
      putAllOdds("Dupla Chance", "Dupla Chance", String(row.outcome_name ?? row.outcome ?? "").trim() || outcome, price);
      continue;
    }

    if (market === "draw_no_bet") {
      if (outcome === "home") markets.drawNoBet.home = price;
      if (outcome === "away") markets.drawNoBet.away = price;
      putAllOdds("Draw No Bet", "Draw No Bet", outcome === "home" ? "Casa" : "Fora", price);
      continue;
    }

    if (market === "over_under_15" || market === "over_under_25" || market === "over_under_35") {
      const suffix = market.endsWith("_15") ? "15" : market.endsWith("_25") ? "25" : "35";
      const overKey = `over${suffix}` as "over15" | "over25" | "over35";
      const underKey = `under${suffix}` as "under15" | "under25" | "under35";
      if (outcome === "over") markets.totalGoals[overKey] = price;
      if (outcome === "under") markets.totalGoals[underKey] = price;
      const title = `Golos ${suffix.slice(0, 1)}.${suffix.slice(1)}`;
      putAllOdds("Totais de Golos", title, outcome === "over" ? "Mais" : "Menos", price);
      continue;
    }

    if (market === "total_corners") {
      if (line === 8.5) {
        if (outcome === "over") markets.totalCorners.over85 = price;
        if (outcome === "under") markets.totalCorners.under85 = price;
      }
      if (line === 9.5) {
        if (outcome === "over") markets.totalCorners.over95 = price;
        if (outcome === "under") markets.totalCorners.under95 = price;
      }
      if (line === 10.5) {
        if (outcome === "over") markets.totalCorners.over105 = price;
        if (outcome === "under") markets.totalCorners.under105 = price;
      }
      putAllOdds("Cantos", `Cantos ${line || ""}`.trim(), outcome === "over" ? "Mais" : "Menos", price);
      continue;
    }
  }

  const hasRealOdds =
    odds.home > 1 ||
    odds.draw > 1 ||
    odds.away > 1 ||
    markets.doubleChance.homeOrDraw > 1 ||
    markets.doubleChance.awayOrDraw > 1 ||
    markets.doubleChance.homeOrAway > 1 ||
    markets.bothTeamsScore.yes > 1 ||
    markets.bothTeamsScore.no > 1 ||
    markets.totalGoals.over15 > 1 ||
    markets.totalGoals.over25 > 1 ||
    markets.totalGoals.over35 > 1 ||
    markets.drawNoBet.home > 1 ||
    markets.drawNoBet.away > 1;

  return {
    odds,
    markets,
    hasRealOdds,
    allOdds: Array.from(grouped.values()),
  };
}

function mapIncidentTeam(incident: Record<string, unknown>, home: string, away: string): string {
  const raw = String(
    incident["team"] ??
      incident["team_name"] ??
      incident["participant"] ??
      incident["participant_name"] ??
      incident["side"] ??
      "",
  )
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "home") return home;
  if (raw === "away") return away;
  return String(incident["team_name"] ?? incident["participant_name"] ?? incident["team"] ?? "");
}

function mapIncidents(
  incidents: Array<Record<string, unknown>>,
  home: string,
  away: string,
): MatchEvent[] {
  return incidents
    .map((incident, index) => ({
      type: String(incident["type"] ?? incident["type_name"] ?? incident["kind"] ?? "event"),
      team: mapIncidentTeam(incident, home, away),
      minute: parseNumber(incident["minute"] ?? incident["match_minute"] ?? incident["time"]),
      player: String(
        incident["player_name"] ??
          incident["player"] ??
          incident["name"] ??
          incident["title"] ??
          "",
      ),
      playerId:
        incident["player_id"] != null ? String(incident["player_id"]) : undefined,
      detail: String(
        incident["detail"] ??
          incident["text"] ??
          incident["description"] ??
          incident["note"] ??
          "",
      ),
    }))
    .filter((entry, index) => entry.type || entry.player || index >= 0)
    .slice(0, 80);
}

function mapCommentary(incidents: Array<Record<string, unknown>>) {
  return incidents
    .slice(0, 40)
    .map((incident, index) => ({
      id: String(incident["id"] ?? `${index}`),
      time: String(
        incident["minute"] ??
          incident["match_minute"] ??
          incident["time"] ??
          "",
      ),
      text: String(
        incident["text"] ??
          incident["description"] ??
          incident["detail"] ??
          incident["title"] ??
          "",
      ),
    }))
    .filter((entry) => entry.text.trim().length > 0);
}

function mapMatchFromEvent(
  event: BSDEvent,
  args?: {
    oddsRows?: BSDOddsRow[];
    incidents?: Array<Record<string, unknown>>;
    stats?: BSDStatsResponse | null;
  },
): LiveMatchState {
  const id = toMatchId(event.id);
  const home = text(event.home_team_name ?? event.home_team, "Casa");
  const away = text(event.away_team_name ?? event.away_team, "Fora");
  const league = text(event.league_name ?? event.league, "Futebol");
  const country = text(event.country_name ?? event.country);
  const { odds, markets, hasRealOdds } = applyOddsRows(args?.oddsRows ?? []);
  const incidents = args?.incidents ?? [];
  const status = mapStatus(text(event.status, "upcoming"));
  const { date, time } = toDateParts(event.event_date ?? null);

  return {
    id,
    home,
    away,
    homeTeamId:
      event.home_team_id != null ? String(event.home_team_id) : undefined,
    awayTeamId:
      event.away_team_id != null ? String(event.away_team_id) : undefined,
    homeLogoUrl: toTeamLogo(event.home_team_id),
    awayLogoUrl: toTeamLogo(event.away_team_id),
    league,
    country: country || undefined,
    sport: "football",
    isLive: status === "live",
    homeScore: parseNumber(event.home_score),
    awayScore: parseNumber(event.away_score),
    minute: parseNumber(event.current_minute),
    status,
    hasRealOdds,
    odds,
    markets,
    events: mapIncidents(incidents, home, away),
    date,
    time,
    stadium: text(event.venue_name ?? event.venue) || undefined,
    referee: text(event.referee_name ?? event.referee) || undefined,
    matchTier: mapTier(league, country),
    matchStats: buildMatchStats(args?.stats ?? null),
    leagueId: event.league_id != null ? String(event.league_id) : undefined,
    seasonId: event.season_id != null ? String(event.season_id) : undefined,
    _commentary: mapCommentary(incidents),
  };
}

async function enrichEvent(event: BSDEvent): Promise<LiveMatchState> {
  const [oddsRows, incidents, stats] = await Promise.all([
    getBsdOddsForEvent(event.id).catch(() => []),
    getBsdEventIncidents(event.id).catch(() => []),
    getBsdEventStats(event.id).catch(() => null),
  ]);
  return mapMatchFromEvent(event, { oddsRows, incidents, stats });
}

async function buildLiveMatches(): Promise<LiveMatchState[]> {
  if (!bsdEnabled()) {
    liveMatchState.clear();
    return [];
  }
  const events = await getBsdLiveEvents().catch(() => []);
  const matches = await Promise.all(events.slice(0, 20).map((event) => enrichEvent(event)));
  liveMatchState.clear();
  for (const match of matches) {
    liveMatchState.set(String(match.id), match);
  }
  return matches;
}

export async function buildUpcomingMatches(): Promise<UpcomingMatch[]> {
  if (!bsdEnabled()) {
    upcomingSnapshot = [];
    return [];
  }
  const payload = await getBsdEvents({
    status: "upcoming",
    dateFrom: todayIsoDate(0),
    dateTo: todayIsoDate(30),
    limit: 40,
    offset: 0,
  }).catch(() => ({ results: [] as BSDEvent[] }));
  const events = Array.isArray(payload.results) ? payload.results : [];
  const matches = await Promise.all(events.slice(0, 20).map((event) => enrichEvent(event)));
  upcomingSnapshot = matches.map((match) => ({
    ...match,
    isLive: undefined,
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    events: [],
    status: "upcoming",
  }));
  return upcomingSnapshot;
}

export function getUpcomingMatchesSnapshot(): UpcomingMatch[] {
  return [...upcomingSnapshot];
}

export async function ensureFinishedMatchResult(matchId: string): Promise<boolean> {
  const rawId = toEventId(matchId);
  if (!rawId) return false;
  const event = await getBsdEventById(rawId).catch(() => null);
  if (!event) return false;
  const status = mapStatus(text(event.status));
  if (!["finished", "cancelled", "postponed"].includes(status)) return false;
  finishedMatchResults.set(String(matchId), {
    home: parseNumber(event.home_score),
    away: parseNumber(event.away_score),
    status,
    finishedAt: Date.now(),
    homeTeam: text(event.home_team_name ?? event.home_team),
    awayTeam: text(event.away_team_name ?? event.away_team),
    htHome: parseNumber(event.ht_home_score),
    htAway: parseNumber(event.ht_away_score),
  });
  return true;
}

export function footballMarketTier(
  _leagueDisplayName: string,
  _country?: string,
): FootballMarketTier {
  return "B";
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

function formatErrorStatus(error: unknown, fallback = 500): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isFinite(status) && status >= 100) return status;
  }
  return fallback;
}

function buildStatsFromOdds(req: Request) {
  const homeOdd = parseNumber(req.query["homeOdd"]);
  const drawOdd = parseNumber(req.query["drawOdd"]);
  const awayOdd = parseNumber(req.query["awayOdd"]);
  const total = [homeOdd, drawOdd, awayOdd]
    .filter((odd) => odd > 1)
    .reduce((sum, odd) => sum + 1 / odd, 0);
  const norm = (odd: number) =>
    odd > 1 && total > 0 ? Number((((1 / odd) / total) * 100).toFixed(1)) : 0;
  return {
    winProb: {
      home: norm(homeOdd),
      draw: norm(drawOdd),
      away: norm(awayOdd),
    },
    h2h: { homeWins: 0, draws: 0, awayWins: 0 },
    avgStats: {
      goalsScored: 0,
      leagueGoals: 0,
      over15: 0,
      leagueOver15: 0,
      over25: 0,
      leagueOver25: 0,
      cards: 0,
      corners: 0,
      btts: 0,
      leagueBtts: 0,
    },
    homeForm: [],
    awayForm: [],
    formIsReal: false,
  };
}

function mapStandingZone(zone: BSDStandingRow["zone"]): StandingZone {
  const type = text(zone?.type).toLowerCase();
  if (type === "promotion") return "promotion";
  if (type === "relegation") return "relegation";
  if (type === "playoff") return "relegationPlayoff";
  if (type === "qualification") return "european";
  return "safe";
}

type StandingZone = "promotion" | "european" | "safe" | "relegationPlayoff" | "relegation";

function mapStandingsRows(rows: BSDStandingRow[]) {
  return rows.map((row) => ({
    pos: parseNumber(row.position),
    name: text(row.team_name),
    played: parseNumber(row.played),
    won: parseNumber(row.won),
    drawn: parseNumber(row.drawn),
    lost: parseNumber(row.lost),
    gf: parseNumber(row.goals_for),
    ga: parseNumber(row.goals_against),
    pts: parseNumber(row.points ?? row.pts),
    zone: mapStandingZone(row.zone),
  }));
}

function mapLeagueEventCard(event: BSDEvent) {
  const { date, time } = toDateParts(event.event_date ?? null);
  return {
    id: toMatchId(event.id),
    eventId: String(event.id),
    home: text(event.home_team_name ?? event.home_team),
    away: text(event.away_team_name ?? event.away_team),
    homeScore: parseNumber(event.home_score),
    awayScore: parseNumber(event.away_score),
    status: mapStatus(text(event.status)),
    date,
    time,
    roundNumber: parseNumber(event.round_number),
    roundName: text(event.round_name),
    groupName: text(event.group_name),
  };
}

function mapBestXi(payload: Record<string, unknown> | null | undefined) {
  const players = Array.isArray(payload?.["players"])
    ? (payload?.["players"] as Array<Record<string, unknown>>)
    : Array.isArray(payload?.["lineup"])
      ? (payload?.["lineup"] as Array<Record<string, unknown>>)
      : [];
  return {
    formation: text(payload?.["formation"]) || undefined,
    players: players.map((row) => ({
      id: row["player_id"] != null ? String(row["player_id"]) : String(row["id"] ?? ""),
      name: text(row["player_name"] ?? row["name"]),
      team: text(row["team_name"] ?? row["team"]),
      position: text(row["position"] ?? row["position_name"]),
      rating: row["rating"] != null ? Number(row["rating"]) : null,
      shirtNumber:
        row["shirt_number"] != null ? String(row["shirt_number"]) : null,
      imageUrl:
        row["player_id"] != null
          ? `https://sports.bzzoiro.com/img/player/${encodeURIComponent(String(row["player_id"]))}/`
          : null,
    })),
  };
}

function getNestedRecord(
  row: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function pickText(row: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function pickDate(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 10);
  }
  return "";
}

function sumStat(rows: Record<string, unknown>[], keys: string[]): number {
  return rows.reduce((sum, row) => {
    for (const key of keys) {
      if (row[key] != null) return sum + parseNumber(row[key]);
    }
    return sum;
  }, 0);
}

function sortByDateDesc(rows: Record<string, unknown>[], keys: string[]) {
  return [...rows].sort((a, b) => {
    const daRaw = new Date(pickText(a, keys)).getTime();
    const dbRaw = new Date(pickText(b, keys)).getTime();
    const da = Number.isFinite(daRaw) ? daRaw : 0;
    const db = Number.isFinite(dbRaw) ? dbRaw : 0;
    return db - da;
  });
}

function getNationalityFlagUrl(code: string | null | undefined): string | null {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return `https://flagcdn.com/w40/${normalized}.png`;
}

function getSeasonRowId(row: Record<string, unknown>): string {
  const season = getNestedRecord(row, "season");
  return pickText(season ?? row, ["id", "season_id", "seasonId"]);
}

function resolveSeasonScope(statsRows: Record<string, unknown>[]) {
  const bySeason = new Map<string, number>();
  for (const row of statsRows) {
    const seasonId = getSeasonRowId(row);
    if (!seasonId) continue;
    bySeason.set(seasonId, (bySeason.get(seasonId) ?? 0) + 1);
  }
  return Array.from(bySeason.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function mapRecentMatch(row: Record<string, unknown>, playerTeamId: string | null) {
  const event = getNestedRecord(row, "event", "fixture", "match");
  const homeTeam = getNestedRecord(row, "home_team", "homeTeam");
  const awayTeam = getNestedRecord(row, "away_team", "awayTeam");
  const team = getNestedRecord(row, "team");
  const teamId = pickText(team ?? row, ["id", "team_id", "teamId"]);
  const homeTeamId = pickText(homeTeam ?? row, ["id", "home_team_id", "homeTeamId"]);
  const awayTeamId = pickText(awayTeam ?? row, ["id", "away_team_id", "awayTeamId"]);
  const homeName =
    pickText(homeTeam ?? row, ["name", "home_team_name", "homeTeam"]) ||
    pickText(event ?? row, ["home_team", "home_team_name"]);
  const awayName =
    pickText(awayTeam ?? row, ["name", "away_team_name", "awayTeam"]) ||
    pickText(event ?? row, ["away_team", "away_team_name"]);
  const isHome =
    (playerTeamId && homeTeamId === playerTeamId) ||
    (teamId && homeTeamId === teamId);
  const teamScore = isHome
    ? parseNumber((event ?? row)["home_score"] ?? row["home_score"])
    : parseNumber((event ?? row)["away_score"] ?? row["away_score"]);
  const opponentScore = isHome
    ? parseNumber((event ?? row)["away_score"] ?? row["away_score"])
    : parseNumber((event ?? row)["home_score"] ?? row["home_score"]);
  return {
    fixtureId: pickText(event ?? row, ["id", "event_id", "fixture_id"], pickText(row, ["id"])),
    date: pickDate(event ?? row, ["event_date", "date", "match_date", "played_at"]),
    opponent: isHome ? awayName : homeName,
    competition: pickText(
      getNestedRecord(row, "league", "competition") ?? event ?? row,
      ["name", "league_name", "competition_name", "league"],
    ),
    isHome,
    teamScore: Number.isFinite(teamScore) ? teamScore : null,
    opponentScore: Number.isFinite(opponentScore) ? opponentScore : null,
    goals: parseNumber(row["goals"] ?? row["goals_scored"]),
    assists: parseNumber(row["assists"]),
    yellowCards: parseNumber(row["yellow_cards"] ?? row["yellowCards"]),
    redCards: parseNumber(row["red_cards"] ?? row["redCards"]),
    minutesPlayed: parseNumber(row["minutes"] ?? row["minutes_played"]) || null,
    rating: (() => {
      const rating = parseNumber(row["rating"] ?? row["match_rating"]);
      return rating > 0 ? rating : null;
    })(),
  };
}

function mapTransfer(row: Record<string, unknown>) {
  const fromTeam = getNestedRecord(row, "from_team", "fromTeam");
  const toTeam = getNestedRecord(row, "to_team", "toTeam");
  return {
    id: pickText(row, ["id"], `${pickText(row, ["date", "transfer_date"])}-${pickText(row, ["to_team_name", "to"])}`),
    date: pickDate(row, ["date", "transfer_date", "moved_at"]),
    fromTeam: pickText(fromTeam ?? row, ["name", "from_team_name", "from"]),
    toTeam: pickText(toTeam ?? row, ["name", "to_team_name", "to"]),
    fee: pickText(row, ["fee", "fee_eur", "amount"]),
    type: pickText(row, ["type", "transfer_type"]),
  };
}

function mapCareerRow(row: Record<string, unknown>) {
  return {
    season: pickText(row, ["season_name", "season", "year"]),
    team: pickText(getNestedRecord(row, "team") ?? row, ["name", "team_name", "team"]),
    competition: pickText(
      getNestedRecord(row, "league", "competition") ?? row,
      ["name", "league_name", "competition_name", "competition"],
    ),
    appearances: parseNumber(row["appearances"] ?? row["apps"]) || null,
    goals: parseNumber(row["goals"]) || null,
    assists: parseNumber(row["assists"]) || null,
  };
}

async function getCatalogEvents(range: string): Promise<BSDEvent[]> {
  const dateFrom = todayIsoDate(0);
  const dateTo = todayIsoDate(range === "month" ? 30 : 7);
  const [live, upcoming] = await Promise.all([
    getBsdLiveEvents().catch(() => []),
    getBsdEvents({
      status: "upcoming",
      dateFrom,
      dateTo,
      limit: 200,
      offset: 0,
    })
      .then((payload) => payload.results ?? [])
      .catch(() => [] as BSDEvent[]),
  ]);
  const deduped = new Map<string, BSDEvent>();
  for (const event of [...live, ...upcoming]) {
    deduped.set(String(event.id), event);
  }
  return Array.from(deduped.values());
}

function mapLineupPlayers(rows: unknown[]): Array<{
  name: string;
  shortName?: string;
  position: string;
  number: string;
  rating?: number;
}> {
  return rows.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      name: text(row["name"] ?? row["player_name"] ?? row["player"]),
      shortName: text(row["short_name"] ?? row["shortName"]) || undefined,
      position: text(row["position"] ?? row["position_name"], "-"),
      number: text(row["number"] ?? row["shirt_number"] ?? row["jersey_number"], ""),
      rating:
        row["rating"] != null ? Number(row["rating"]) : undefined,
    };
  });
}

function mapLineups(payload: BSDLineupsResponse | null) {
  const home = Array.isArray(payload?.home) ? payload?.home : [];
  const away = Array.isArray(payload?.away) ? payload?.away : [];
  const benchHome = Array.isArray(payload?.bench_home) ? payload?.bench_home : [];
  const benchAway = Array.isArray(payload?.bench_away) ? payload?.bench_away : [];
  return {
    confirmed: Boolean(payload?.confirmed) && !payload?.predicted,
    home: {
      formation: text(payload?.formation_home) || undefined,
      starters: mapLineupPlayers(home),
      bench: mapLineupPlayers(benchHome),
    },
    away: {
      formation: text(payload?.formation_away) || undefined,
      starters: mapLineupPlayers(away),
      bench: mapLineupPlayers(benchAway),
    },
  };
}

function mapPrediction(payload: BSDPredictionResponse | null) {
  if (!payload?.markets) return null;
  return {
    result: {
      home: Number(payload.markets.match_result?.prob_home ?? 0),
      draw: Number(payload.markets.match_result?.prob_draw ?? 0),
      away: Number(payload.markets.match_result?.prob_away ?? 0),
    },
    doubleChance: {
      homeOrDraw: Math.max(
        Number(payload.markets.match_result?.prob_home ?? 0) +
          Number(payload.markets.match_result?.prob_draw ?? 0),
        Number(payload.markets.draw_no_bet?.prob_home ?? 0),
      ),
      awayOrDraw:
        Number(payload.markets.match_result?.prob_away ?? 0) +
        Number(payload.markets.match_result?.prob_draw ?? 0),
      homeOrAway:
        Number(payload.markets.match_result?.prob_home ?? 0) +
        Number(payload.markets.match_result?.prob_away ?? 0),
    },
    overUnder25: {
      over: Number(payload.markets.over_under?.prob_over_25 ?? 0),
      under: Number(
        100 - Number(payload.markets.over_under?.prob_over_25 ?? 0),
      ),
    },
    bothTeamsScore: {
      yes: Number(payload.markets.btts?.prob_yes ?? 0),
      no: Number(payload.markets.btts?.prob_no ?? 100 - Number(payload.markets.btts?.prob_yes ?? 0)),
    },
    handicap: payload.markets.draw_no_bet
      ? {
          line: 0,
          home: Number(payload.markets.draw_no_bet.prob_home ?? 0),
          away: Number(payload.markets.draw_no_bet.prob_away ?? 0),
        }
      : null,
  };
}

function mapConfrontos(payload: BSDH2HResponse | null, req: Request) {
  return {
    homeWins: parseNumber(payload?.home_wins),
    awayWins: parseNumber(payload?.away_wins),
    draws: parseNumber(payload?.draws),
    recentMeetings: Array.isArray(payload?.recent_meetings) ? payload?.recent_meetings : [],
    homeRecentMatches: Array.isArray(payload?.home_form) ? payload?.home_form : [],
    awayRecentMatches: Array.isArray(payload?.away_form) ? payload?.away_form : [],
    team1Name: String(req.query["home"] ?? ""),
    team2Name: String(req.query["away"] ?? ""),
    sport: String(req.query["sport"] ?? "football"),
  };
}

router.get("/live", async (_req: Request, res: Response) => {
  try {
    sendJson(res, { matches: await buildLiveMatches() });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ matches: [] });
  }
});

router.get("/live-filler", async (_req: Request, res: Response) => {
  try {
    sendJson(res, { matches: await buildLiveMatches() });
  } catch {
    sendJson(res, { matches: [] });
  }
});

router.get("/live-match/:id", async (req: Request, res: Response) => {
  try {
    const eventId = toEventId(req.params["id"] ?? "");
    const event = await getBsdEventById(eventId);
    const match = await enrichEvent(event);
    sendJson(res, match);
  } catch (error) {
    res.status(formatErrorStatus(error, 404)).json({ error: "match unavailable" });
  }
});

router.get("/upcoming-match/:id", async (req: Request, res: Response) => {
  try {
    const eventId = toEventId(req.params["id"] ?? "");
    const event = await getBsdEventById(eventId);
    const match = await enrichEvent(event);
    sendJson(res, { ...match, isLive: false, status: "upcoming" });
  } catch (error) {
    res.status(formatErrorStatus(error, 404)).json({ error: "match unavailable" });
  }
});

router.get("/all-odds/:id", async (req: Request, res: Response) => {
  try {
    const eventId = toEventId(req.params["id"] ?? "");
    const rows = await getBsdOddsForEvent(eventId);
    const { allOdds } = applyOddsRows(rows);
    sendJson(res, { markets: allOdds });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ markets: [] });
  }
});

router.get("/live-stream", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const push = async () => {
    try {
      const matches = await buildLiveMatches();
      res.write(`data: ${JSON.stringify({ matches })}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ matches: [] })}\n\n`);
    }
  };

  await push();
  const interval = setInterval(() => {
    void push();
  }, 10_000);

  res.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

router.get("/catalog", async (_req: Request, res: Response) => {
  try {
    const sport = String(_req.query["sport"] ?? "football").trim().toLowerCase();
    if (sport !== "football") return sendJson(res, { regions: [] });
    const range = String(_req.query["range"] ?? "week").trim().toLowerCase();
    const events = await getCatalogEvents(range);
    const byCountry = new Map<string, { id: number; name: string; eventCount: number; competitionIds: Set<string> }>();
    for (const event of events) {
      const country = text(event.country_name ?? event.country, "Internacional");
      const leagueId = String(event.league_id ?? "");
      const current =
        byCountry.get(country) ??
        {
          id: byCountry.size + 1,
          name: country,
          eventCount: 0,
          competitionIds: new Set<string>(),
        };
      current.eventCount += 1;
      if (leagueId) current.competitionIds.add(leagueId);
      byCountry.set(country, current);
    }
    sendJson(res, {
      regions: Array.from(byCountry.values())
        .map((region) => ({
          id: region.id,
          name: region.name,
          eventCount: region.eventCount,
          competitionCount: region.competitionIds.size,
        }))
        .sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name)),
    });
  } catch {
    sendJson(res, { regions: [] });
  }
});

router.get("/catalog/competitions", async (req: Request, res: Response) => {
  try {
    const sport = String(req.query["sport"] ?? "football").trim().toLowerCase();
    if (sport !== "football") return sendJson(res, { competitions: [] });
    const regionId = parseNumber(req.query["regionId"]);
    const range = String(req.query["range"] ?? "week").trim().toLowerCase();
    const events = await getCatalogEvents(range);
    const countries = Array.from(
      new Set(events.map((event) => text(event.country_name ?? event.country, "Internacional"))),
    ).sort((a, b) => a.localeCompare(b));
    const targetCountry = regionId > 0 ? countries[regionId - 1] : "";
    const grouped = new Map<string, { id: number; name: string; regionId: number; eventCount: number }>();
    for (const event of events) {
      const country = text(event.country_name ?? event.country, "Internacional");
      if (targetCountry && country !== targetCountry) continue;
      const leagueName = text(event.league_name ?? event.league, "Liga");
      const leagueId = parseNumber(event.league_id) || grouped.size + 1;
      const current =
        grouped.get(`${leagueId}`) ??
        { id: leagueId, name: leagueName, regionId: regionId || 1, eventCount: 0 };
      current.eventCount += 1;
      grouped.set(`${leagueId}`, current);
    }
    sendJson(res, {
      competitions: Array.from(grouped.values()).sort(
        (a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name),
      ),
    });
  } catch {
    sendJson(res, { competitions: [] });
  }
});

router.get("/upcoming", async (_req: Request, res: Response) => {
  try {
    sendJson(res, { matches: await buildUpcomingMatches() });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ matches: [] });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    sendJson(res, { matches: await buildLiveMatches() });
  } catch {
    sendJson(res, { matches: [] });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  sendJson(res, buildStatsFromOdds(req));
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

router.get("/football-results", async (req: Request, res: Response) => {
  try {
    const range = String(req.query["range"] ?? "yesterday");
    const dateFrom = range === "yesterday" ? todayIsoDate(-1) : todayIsoDate(0);
    const dateTo = range === "yesterday" ? todayIsoDate(-1) : todayIsoDate(0);
    const payload = await getBsdEvents({
      status: "finished",
      leagueId: req.query["leagueId"] ? String(req.query["leagueId"]) : undefined,
      dateFrom,
      dateTo,
      limit: 30,
      offset: 0,
    });
    const results = (payload.results ?? []).map((event) => {
      const { date, time } = toDateParts(event.event_date ?? null);
      return {
        id: toMatchId(event.id),
        home: text(event.home_team_name ?? event.home_team),
        away: text(event.away_team_name ?? event.away_team),
        homeScore: parseNumber(event.home_score),
        awayScore: parseNumber(event.away_score),
        league: text(event.league_name ?? event.league),
        country: text(event.country_name ?? event.country),
        date,
        time,
      };
    });
    sendJson(res, { results });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ results: [] });
  }
});

router.get("/football-results-stats", async (_req: Request, res: Response) => {
  sendJson(res, { stats: null });
});

router.get("/league-standings", async (req: Request, res: Response) => {
  try {
    const leagueId = String(req.query["leagueId"] ?? "").trim();
    if (!leagueId) return sendJson(res, { league: null, teams: [], groups: [] });
    const season = await getBsdLeagueSeason(leagueId);
    const standings = await getBsdLeagueStandings({
      leagueId,
      seasonId: season?.id != null ? String(season.id) : undefined,
    });
    const groups = Array.isArray(standings?.groups)
      ? standings.groups.map((group) => ({
          name: text(group.name, "Grupo"),
          teams: mapStandingsRows(
            Array.isArray(group.standings)
              ? group.standings
              : Array.isArray(group.rows)
                ? group.rows
                : [],
          ),
        }))
      : [];
    const teams = mapStandingsRows(Array.isArray(standings?.standings) ? standings!.standings! : []);
    sendJson(res, {
      league: leagueId,
      teams,
      groups,
    });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ league: null, teams: [], groups: [] });
  }
});

router.get("/leagues/:id/page", async (req: Request, res: Response) => {
  try {
    const leagueId = String(req.params["id"] ?? "").trim();
    if (!leagueId) {
      return res.status(400).json({ error: "league id required" });
    }
    const today = todayIsoDate(0);
    const [league, season] = await Promise.all([
      getBsdLeagueById(leagueId),
      getBsdLeagueSeason(leagueId),
    ]);
    const seasonId =
      season?.id != null && `${season.id}`.trim() !== ""
        ? String(season.id)
        : undefined;
    const [standings, upcoming, results, topScorers, bestXi] = await Promise.all([
      getBsdLeagueStandings({ leagueId, seasonId }),
      getBsdEvents({
        leagueId,
        seasonId,
        status: "upcoming",
        dateFrom: today,
        limit: 20,
        offset: 0,
      }).catch(() => ({ results: [] as BSDEvent[] })),
      getBsdEvents({
        leagueId,
        seasonId,
        status: "finished",
        limit: 20,
        offset: 0,
      }).catch(() => ({ results: [] as BSDEvent[] })),
      getBsdLeagueTopScorers({ leagueId, seasonId, limit: 10 }).catch(() => []),
      seasonId ? getBsdLeagueBestXi({ leagueId, seasonId }).catch(() => null) : Promise.resolve(null),
    ]);

    res.json({
      header: {
        id: Number(league?.id ?? leagueId),
        name: text(league?.name, `Liga ${leagueId}`),
        country: text(league?.country),
        isWomen: Boolean(league?.is_women),
        logoUrl: `https://sports.bzzoiro.com/img/league/${encodeURIComponent(leagueId)}/`,
      },
      season: season
        ? {
            id: season.id != null ? String(season.id) : null,
            name: text(season.name),
            year: season.year != null ? String(season.year) : null,
            startDate: text(season.start_date),
            endDate: text(season.end_date),
            isCurrent: Boolean(season.is_current),
          }
        : null,
      standings: {
        table: mapStandingsRows(
          Array.isArray(standings?.standings) ? standings.standings : [],
        ),
        groups: Array.isArray(standings?.groups)
          ? standings.groups.map((group) => ({
              name: text(group.name, "Grupo"),
              table: mapStandingsRows(
                Array.isArray(group.standings)
                  ? group.standings
                  : Array.isArray(group.rows)
                    ? group.rows
                    : [],
              ),
            }))
          : [],
      },
      fixtures: Array.isArray(upcoming.results)
        ? upcoming.results.map(mapLeagueEventCard)
        : [],
      results: Array.isArray(results.results)
        ? results.results.map(mapLeagueEventCard)
        : [],
      topScorers: topScorers.map((row) => ({
        rank: parseNumber(row.rank),
        playerId: row.player_id != null ? String(row.player_id) : null,
        name: text(row.player_name),
        teamId: row.team_id != null ? String(row.team_id) : null,
        team: text(row.team_name),
        value: parseNumber(row.value),
        matches: parseNumber(row.matches),
        position: text(row.position),
        imageUrl:
          row.player_id != null
            ? `https://sports.bzzoiro.com/img/player/${encodeURIComponent(String(row.player_id))}/`
            : null,
      })),
      bestXi: mapBestXi(bestXi as Record<string, unknown> | null),
    });
  } catch (error) {
    res
      .status(formatErrorStatus(error, 500))
      .json({ error: "league page unavailable" });
  }
});

router.get("/football-leagues", async (_req: Request, res: Response) => {
  try {
    const range = String(_req.query["range"] ?? "week").trim().toLowerCase();
    const events = await getCatalogEvents(range);
    const grouped = new Map<string, { id: number; name: string; country: string; eventCount: number }>();
    for (const event of events) {
      const leagueId = parseNumber(event.league_id) || grouped.size + 1;
      const key = String(leagueId);
      const current =
        grouped.get(key) ??
        {
          id: leagueId,
          name: text(event.league_name ?? event.league, "Liga"),
          country: text(event.country_name ?? event.country, "Internacional"),
          eventCount: 0,
        };
      current.eventCount += 1;
      grouped.set(key, current);
    }
    sendJson(res, {
      leagues: Array.from(grouped.values()).sort(
        (a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name),
      ),
    });
  } catch {
    sendJson(res, { leagues: [] });
  }
});

router.get("/football-livescores", async (_req: Request, res: Response) => {
  try {
    const matches = await buildLiveMatches();
    const grouped = new Map<string, { league: string; matches: LiveMatchState[] }>();
    for (const match of matches) {
      const key = `${match.leagueId ?? match.league}`;
      const current = grouped.get(key) ?? { league: match.league, matches: [] };
      current.matches.push(match);
      grouped.set(key, current);
    }
    sendJson(res, { leagues: Array.from(grouped.values()) });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ leagues: [] });
  }
});

router.get("/football-daily/:offset", async (req: Request, res: Response) => {
  try {
    const offset = parseNumber(req.params["offset"] ?? 0);
    const date = todayIsoDate(offset);
    const payload = await getBsdEvents({
      dateFrom: date,
      dateTo: date,
      limit: 80,
      offset: 0,
    });
    const leagues = new Map<string, { league: string; matches: Array<Record<string, unknown>> }>();
    for (const event of payload.results ?? []) {
      const league = text(event.league_name ?? event.league, "Futebol");
      const current = leagues.get(league) ?? { league, matches: [] };
      current.matches.push({
        id: toMatchId(event.id),
        home: text(event.home_team_name ?? event.home_team),
        away: text(event.away_team_name ?? event.away_team),
        status: mapStatus(text(event.status)),
        homeScore: parseNumber(event.home_score),
        awayScore: parseNumber(event.away_score),
        ...toDateParts(event.event_date ?? null),
      });
      leagues.set(league, current);
    }
    sendJson(res, { leagues: Array.from(leagues.values()) });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ leagues: [] });
  }
});

router.get("/confrontos", async (req: Request, res: Response) => {
  try {
    const matchId = String(req.query["matchId"] ?? "").trim();
    if (!matchId) return sendJson(res, mapConfrontos(null, req));
    const payload = await getBsdEventH2H(toEventId(matchId));
    sendJson(res, mapConfrontos(payload, req));
  } catch {
    sendJson(res, mapConfrontos(null, req));
  }
});

router.get("/team-upcoming", async (req: Request, res: Response) => {
  try {
    const matchId = String(req.query["matchId"] ?? "").trim();
    const side = String(req.query["side"] ?? "home").trim().toLowerCase();
    const limit = Math.max(1, Math.min(10, parseNumber(req.query["limit"] ?? 5)));
    const event = await getBsdEventById(toEventId(matchId));
    const teamId =
      side === "away" ? event.away_team_id : event.home_team_id;
    if (teamId == null) return sendJson(res, { fixtures: [] });
    const payload = await getBsdEvents({
      teamId: String(teamId),
      status: "upcoming",
      dateFrom: todayIsoDate(0),
      dateTo: todayIsoDate(30),
      limit,
      offset: 0,
    });
    const fixtures = (payload.results ?? []).map((item) => ({
      id: toMatchId(item.id),
      home: text(item.home_team_name ?? item.home_team),
      away: text(item.away_team_name ?? item.away_team),
      league: text(item.league_name ?? item.league),
      country: text(item.country_name ?? item.country),
      ...toDateParts(item.event_date ?? null),
      status: mapStatus(text(item.status, "upcoming")),
    }));
    sendJson(res, { fixtures });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ fixtures: [] });
  }
});

router.get("/player-profile/:id", async (_req: Request, res: Response) => {
  try {
    const sport = String(_req.query["sport"] ?? "football").trim().toLowerCase();
    if (sport !== "football") {
      return res.status(404).json({ error: "player profile unavailable" });
    }
    if (!bsdEnabled()) {
      return res.status(503).json({ error: "player profile unavailable" });
    }

    const playerId = String(_req.params["id"] ?? "").trim();
    if (!playerId) {
      return res.status(400).json({ error: "player id required" });
    }

    const requestedSeasonId = String(_req.query["seasonId"] ?? "").trim() || undefined;
    const requestedTeamId = String(_req.query["teamId"] ?? "").trim() || undefined;
    const requestedLeagueId = String(_req.query["leagueId"] ?? "").trim() || undefined;
    const requestedDateFrom = String(_req.query["dateFrom"] ?? "").trim() || undefined;
    const requestedDateTo = String(_req.query["dateTo"] ?? "").trim() || undefined;

    const profile = await getBsdPlayerById(playerId);
    if (!profile) {
      return res.status(404).json({ error: "player profile unavailable" });
    }

    const profileTeam = profile.current_team ?? null;
    const profileTeamId =
      requestedTeamId ??
      (profileTeam?.id != null && `${profileTeam.id}`.trim() !== ""
        ? String(profileTeam.id)
        : profile.team_id != null && `${profile.team_id}`.trim() !== ""
          ? String(profile.team_id)
          : undefined);

    const [allStatsRows, transferRows, careerRows, nationalTeamRow] = await Promise.all([
      getBsdPlayerStats({
        playerId,
        seasonId: requestedSeasonId,
        teamId: profileTeamId,
        leagueId: requestedLeagueId,
        dateFrom: requestedDateFrom,
        dateTo: requestedDateTo,
        limit: 100,
      }).then((rows) => rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))),
      getBsdPlayerTransfers(playerId).then((rows) =>
        rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")),
      ),
      getBsdPlayerCareer(playerId).then((rows) =>
        rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")),
      ),
      getBsdPlayerNationalTeam(playerId).then((row) =>
        row && typeof row === "object" ? (row as Record<string, unknown>) : null,
      ),
    ]);

    const seasonScope = requestedSeasonId ?? resolveSeasonScope(allStatsRows);
    const seasonRows =
      seasonScope != null
        ? allStatsRows.filter((row) => getSeasonRowId(row) === seasonScope)
        : allStatsRows;
    const statsRows = seasonRows.length > 0 ? seasonRows : allStatsRows;
    const fallbackCareer = careerRows[0] ?? null;
    const fallbackCompetitionSource = statsRows[0] ?? fallbackCareer ?? {};
    const statsTeamId =
      pickText(getNestedRecord(statsRows[0] ?? {}, "team") ?? (statsRows[0] ?? {}), [
        "id",
        "team_id",
        "teamId",
      ]) || undefined;
    const derivedTeamId =
      profileTeamId ?? statsTeamId;

    const recentMatchesMap = new Map<
      string,
      {
        fixtureId: string;
        date: string;
        opponent: string;
        competition: string;
        isHome: boolean;
        teamScore: number | null;
        opponentScore: number | null;
        goals: number;
        assists: number;
        yellowCards: number;
        redCards: number;
        minutesPlayed: number | null;
        rating: number | null;
      }
    >();
    for (const row of sortByDateDesc(statsRows, [
      "event_date",
      "date",
      "match_date",
      "played_at",
      "updated_at",
    ])) {
      const mapped = mapRecentMatch(row, derivedTeamId ?? null);
      if (!mapped.fixtureId && !mapped.date && !mapped.opponent) continue;
      const key = mapped.fixtureId || `${mapped.date}-${mapped.opponent}`;
      if (!recentMatchesMap.has(key)) {
        recentMatchesMap.set(key, mapped);
      }
      if (recentMatchesMap.size >= 8) break;
    }

    const height = parseNumber(profile.height);
    const weight = parseNumber(profile.weight);
    const shirtNumber = parseNumber(profile.shirt_number);
    const marketValue = parseNumber(profile.market_value);
    const nationalTeam = nationalTeamRow
      ? {
          team: pickText(getNestedRecord(nationalTeamRow, "team") ?? nationalTeamRow, [
            "name",
            "team_name",
            "national_team",
            "team",
          ]) || null,
          appearances: (() => {
            const value = parseNumber(
              nationalTeamRow["appearances"] ??
                nationalTeamRow["caps"] ??
                nationalTeamRow["matches"],
            );
            return value > 0 ? value : null;
          })(),
          goals: (() => {
            const value = parseNumber(nationalTeamRow["goals"]);
            return value > 0 ? value : null;
          })(),
        }
      : null;

    res.json({
      id: String(profile.id ?? playerId),
      sport: "football",
      name: text(profile.name, `Jogador ${playerId}`),
      imageUrl: `https://sports.bzzoiro.com/img/player/${encodeURIComponent(playerId)}/`,
      nationality: text(profile.nationality ?? profile.country_name) || null,
      nationalityFlagUrl: getNationalityFlagUrl(profile.nationality_code),
      position: text(profile.position) || null,
      height: height > 0 ? height : null,
      weight: weight > 0 ? weight : null,
      dateOfBirth: text(profile.birth_date ?? profile.date_of_birth) || null,
      preferredFoot: text(profile.preferred_foot) || null,
      shirtNumber: shirtNumber > 0 ? shirtNumber : null,
      marketValue: marketValue > 0 ? marketValue : null,
      contractUntil: text(profile.contract_until) || null,
      team:
        text(profileTeam?.name ?? profile.team_name) ||
        pickText(getNestedRecord(fallbackCareer ?? {}, "team") ?? (fallbackCareer ?? {}), [
          "name",
          "team_name",
          "team",
        ]) ||
        null,
      teamLogoUrl: derivedTeamId ? toTeamLogo(derivedTeamId) ?? null : null,
      competition:
        pickText(
          getNestedRecord(fallbackCompetitionSource, "league", "competition") ??
            fallbackCompetitionSource,
          ["name", "league_name", "competition_name", "league", "competition"],
        ) || null,
      season: seasonScope,
      seasonStats: {
        appearances: statsRows.length > 0 ? statsRows.length : null,
        goals: statsRows.length > 0 ? sumStat(statsRows, ["goals", "goals_scored"]) : null,
        assists: statsRows.length > 0 ? sumStat(statsRows, ["assists"]) : null,
        yellowCards:
          statsRows.length > 0 ? sumStat(statsRows, ["yellow_cards", "yellowCards"]) : null,
        redCards: statsRows.length > 0 ? sumStat(statsRows, ["red_cards", "redCards"]) : null,
        minutesPlayed:
          statsRows.length > 0 ? sumStat(statsRows, ["minutes", "minutes_played"]) : null,
      },
      recentMatches: Array.from(recentMatchesMap.values()),
      transfers: sortByDateDesc(transferRows, ["date", "transfer_date", "moved_at"])
        .map(mapTransfer)
        .slice(0, 20),
      career: careerRows.map(mapCareerRow).slice(0, 20),
      nationalTeam,
    });
  } catch (error) {
    res
      .status(formatErrorStatus(error, 500))
      .json({ error: "player profile unavailable" });
  }
});

router.get("/storylines/:matchId", async (_req: Request, res: Response) => {
  sendJson(res, { storyline: null });
});

router.get("/top-scorers/:leagueId", async (req: Request, res: Response) => {
  try {
    const leagueId = String(req.params["leagueId"] ?? "").trim();
    if (!leagueId) return sendJson(res, { scorers: [] });
    const season = await getBsdLeagueSeason(leagueId);
    const scorers = await getBsdLeagueTopScorers({
      leagueId,
      seasonId: season?.id != null ? String(season.id) : undefined,
      limit: 20,
    });
    sendJson(
      res,
      {
        scorers: scorers.map((row) => ({
          rank: parseNumber(row.rank),
          playerId: row.player_id != null ? String(row.player_id) : null,
          name: text(row.player_name),
          teamId: row.team_id != null ? String(row.team_id) : null,
          team: text(row.team_name),
          value: parseNumber(row.value),
          matches: parseNumber(row.matches),
          position: text(row.position),
        })),
      },
    );
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ scorers: [] });
  }
});

router.get("/lineups/:matchId", async (req: Request, res: Response) => {
  try {
    const payload = await getBsdEventLineups(toEventId(req.params["matchId"] ?? ""));
    sendJson(res, mapLineups(payload));
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json(
      mapLineups({
        home: [],
        away: [],
        bench_home: [],
        bench_away: [],
        confirmed: false,
      }),
    );
  }
});

router.get("/prediction/:matchId", async (req: Request, res: Response) => {
  try {
    const payload = await getBsdEventPrediction(toEventId(req.params["matchId"] ?? ""));
    sendJson(res, { prediction: mapPrediction(payload) });
  } catch (error) {
    res.status(formatErrorStatus(error, 500)).json({ prediction: null });
  }
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
