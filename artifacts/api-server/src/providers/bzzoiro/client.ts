// sports.bzzoiro.com REST client — confirmed real 2026-09-11 via the
// user's own captured responses (GET /coverage/, GET /events/,
// GET /events/:id/stats/), all using `Authorization: Token <key>`.
// Only the one endpoint this integration actually needs (live events, for
// matching against GOAL API fixtures) is wrapped here — no /stats/,
// /odds/, /h2h/ etc. wrappers, since this provider's sole job is real
// ball position via the WebSocket (see websocketClient.ts), not REST.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type {
  BzzoiroEventsListResponse,
  BzzoiroEvent,
  BzzoiroUpcomingEventsResponse,
  BzzoiroUpcomingEvent,
  BzzoiroEventOddsSummary,
  BzzoiroOddsFeedResponse,
  BzzoiroOddsFeedRow,
  BzzoiroEventStatsResponse,
  BzzoiroEventIncidentsResponse,
  BzzoiroIncident,
} from "./types.js";

async function rawGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${CONFIG.BZZOIRO_BASE_URL.replace(/\/+$/, "")}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Token ${CONFIG.BZZOIRO_API_KEY}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`[bzzoiro] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return (await resp.json()) as T;
}

export async function getBzzoiroLiveEvents(): Promise<BzzoiroEvent[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  try {
    const resp = await rawGet<BzzoiroEventsListResponse>("/events/live/");
    return resp.events ?? [];
  } catch (err) {
    logger.error({ err }, "[bzzoiro] getBzzoiroLiveEvents failed");
    return [];
  }
}

const UPCOMING_PAGE_LIMIT = 50;
const UPCOMING_MAX_PAGES = 40;

export async function getBzzoiroUpcomingEvents(dateFrom: string, dateTo: string): Promise<BzzoiroUpcomingEvent[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  const out: BzzoiroUpcomingEvent[] = [];
  try {
    let resp = await rawGet<BzzoiroUpcomingEventsResponse>("/events/", {
      date_from: dateFrom,
      date_to: dateTo,
      limit: UPCOMING_PAGE_LIMIT,
    });
    out.push(...resp.results);
    let pages = 1;
    while (resp.next && pages < UPCOMING_MAX_PAGES) {
      const nextResp = await fetch(resp.next, {
        signal: AbortSignal.timeout(8_000),
        headers: { Authorization: `Token ${CONFIG.BZZOIRO_API_KEY}` },
      });
      if (!nextResp.ok) break;
      resp = (await nextResp.json()) as BzzoiroUpcomingEventsResponse;
      out.push(...resp.results);
      pages++;
    }
    return out;
  } catch (err) {
    logger.error({ err }, "[bzzoiro] getBzzoiroUpcomingEvents failed");
    return out;
  }
}

export async function getBzzoiroCoverageRaw(): Promise<unknown> {
  return rawGet<unknown>("/coverage/");
}

const STATS_CACHE_TTL_MS = 90_000;
const INCIDENTS_CACHE_TTL_MS = 60_000;
const INFLIGHT_MAX_AGE_MS = 30_000;

type CacheEntry<T> = { data: T; fetchedAt: number };

const statsCache = new Map<string, CacheEntry<BzzoiroEventStatsResponse>>();
const incidentsCache = new Map<string, CacheEntry<BzzoiroEventIncidentsResponse>>();
const statsInflight = new Map<string, Promise<BzzoiroEventStatsResponse>>();
const incidentsInflight = new Map<string, Promise<BzzoiroEventIncidentsResponse>>();
const statsInflightStartedAt = new Map<string, number>();
const incidentsInflightStartedAt = new Map<string, number>();

function cachedGet<T>(
  key: string,
  cache: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  inflightStartedAt: Map<string, number>,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return Promise.resolve(cached.data);
  }
  const existingInflight = inflight.get(key);
  if (existingInflight) {
    const startedAt = inflightStartedAt.get(key) ?? 0;
    if (Date.now() - startedAt < INFLIGHT_MAX_AGE_MS) {
      return existingInflight;
    }
    inflight.delete(key);
    inflightStartedAt.delete(key);
  }
  const promise = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { data, fetchedAt: Date.now() });
      return data;
    } finally {
      inflight.delete(key);
      inflightStartedAt.delete(key);
    }
  })();
  inflight.set(key, promise);
  inflightStartedAt.set(key, Date.now());
  return promise;
}

export async function getBzzoiroEventStatsRaw(eventId: number | string): Promise<BzzoiroEventStatsResponse> {
  const key = String(eventId);
  return cachedGet(
    key,
    statsCache,
    statsInflight,
    statsInflightStartedAt,
    STATS_CACHE_TTL_MS,
    () => rawGet<BzzoiroEventStatsResponse>(`/events/${encodeURIComponent(String(eventId))}/stats/`),
  );
}

export async function getBzzoiroEventIncidentsRaw(eventId: number | string): Promise<BzzoiroEventIncidentsResponse> {
  const key = String(eventId);
  return cachedGet(
    key,
    incidentsCache,
    incidentsInflight,
    incidentsInflightStartedAt,
    INCIDENTS_CACHE_TTL_MS,
    () => rawGet<BzzoiroEventIncidentsResponse>(`/events/${encodeURIComponent(String(eventId))}/incidents/`),
  );
}

export async function getBzzoiroEventOddsSummary(eventId: number | string): Promise<BzzoiroEventOddsSummary> {
  return rawGet<BzzoiroEventOddsSummary>(`/events/${encodeURIComponent(String(eventId))}/odds/`);
}

export async function getBzzoiroOddsFeed(eventId: number | string, market: string): Promise<BzzoiroOddsFeedRow[]> {
  const resp = await rawGet<BzzoiroOddsFeedResponse>("/odds/", { event_id: eventId, market });
  return resp.results ?? [];
}

const BZZOIRO_STAT_LABELS: Record<string, string> = {
  possession: "Posse de bola",
  ball_possession: "Posse de bola",
  shots: "Remates",
  total_shots: "Remates",
  shots_on_target: "Remates à baliza",
  on_target: "Remates à baliza",
  shots_off_target: "Remates fora",
  off_target: "Remates fora",
  corners: "Cantos",
  corner_kicks: "Cantos",
  fouls: "Faltas",
  fouls_committed: "Faltas",
  attacks: "Ataques",
  dangerous_attacks: "Ataques perigosos",
  free_kicks: "Livres",
  goal_kicks: "Pontapé de baliza",
  throw_ins: "Lançamentos laterais",
  penalties: "Grandes penalidades",
  substitutions: "Substituições",
  offsides: "Fora de jogo",
  yellow_cards: "Cartões amarelos",
  red_cards: "Cartões vermelhos",
  saves: "Defesas",
  goalkeeper_saves: "Defesas",
  passes: "Passes",
  pass_accuracy: "Precisão de passes",
  crosses: "Cruzamentos",
  woodwork: "Travões",
  blocked_shots: "Remates bloqueados",
  xg: "xG (Golos Esperados)",
  expected_goals: "xG (Golos Esperados)",
};

type MatchStatsGroup = { title: string; rows: Array<{ name: string; home: string; away: string }> };
type LiveExtraStats = {
  cornersTotal?: number;
  cardsTotal?: number;
  cornersHome?: number;
  cornersAway?: number;
  possessionHome?: number;
  possessionAway?: number;
  shotsTotalHome?: number;
  shotsTotalAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  shotsOffTargetHome?: number;
  shotsOffTargetAway?: number;
  shotsBlockedHome?: number;
  shotsBlockedAway?: number;
  woodworkHome?: number;
  woodworkAway?: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  offsidesHome?: number;
  offsidesAway?: number;
  savesHome?: number;
  savesAway?: number;
  dangerousAttacksHome?: number;
  dangerousAttacksAway?: number;
  attacksHome?: number;
  attacksAway?: number;
  xgHome?: number;
  xgAway?: number;
  throwInsHome?: number;
  throwInsAway?: number;
  crossesHome?: number;
  crossesAway?: number;
  passesHome?: number;
  passesAway?: number;
  passAccuracyHome?: number;
  passAccuracyAway?: number;
};

export function normalizeBzzoiroStats(raw: BzzoiroEventStatsResponse | null | undefined): {
  matchStats: MatchStatsGroup[];
  liveExtra: LiveExtraStats;
  redCardsHome?: number;
  redCardsAway?: number;
} {
  const matchStatsRows: Array<{ name: string; home: string; away: string }> = [];
  const liveExtra: LiveExtraStats = {};
  let redCardsHome: number | undefined;
  let redCardsAway: number | undefined;

  const n = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n2 = Number(v);
    return Number.isFinite(n2) ? n2 : undefined;
  };
  const add = (name: string, home: unknown, away: unknown) => {
    if (home == null && away == null) return;
    matchStatsRows.push({
      name,
      home: home != null ? String(home) : "-",
      away: away != null ? String(away) : "-",
    });
  };

  const xgHome = n(raw?.xg_home);
  const xgAway = n(raw?.xg_away);
  if (xgHome != null || xgAway != null) {
    add("xG (Golos Esperados)", xgHome ?? "-", xgAway ?? "-");
    if (xgHome != null) liveExtra.xgHome = xgHome;
    if (xgAway != null) liveExtra.xgAway = xgAway;
  }

  const possessionHome = n(raw?.possession_home);
  const possessionAway = n(raw?.possession_away);
  if (possessionHome != null || possessionAway != null) {
    const ph = possessionHome != null ? `${possessionHome}%` : "-";
    const pa = possessionAway != null ? `${possessionAway}%` : "-";
    add("Posse de bola", ph, pa);
    if (possessionHome != null) liveExtra.possessionHome = possessionHome;
    if (possessionAway != null) liveExtra.possessionAway = possessionAway;
  }

  const shotsHome = n(raw?.shots_home);
  const shotsAway = n(raw?.shots_away);
  if (shotsHome != null || shotsAway != null) {
    add("Remates", shotsHome ?? "-", shotsAway ?? "-");
    if (shotsHome != null) liveExtra.shotsTotalHome = shotsHome;
    if (shotsAway != null) liveExtra.shotsTotalAway = shotsAway;
  }

  const shotsOnTargetHome = n(raw?.shots_on_target_home);
  const shotsOnTargetAway = n(raw?.shots_on_target_away);
  if (shotsOnTargetHome != null || shotsOnTargetAway != null) {
    add("Remates à baliza", shotsOnTargetHome ?? "-", shotsOnTargetAway ?? "-");
    if (shotsOnTargetHome != null) liveExtra.shotsOnTargetHome = shotsOnTargetHome;
    if (shotsOnTargetAway != null) liveExtra.shotsOnTargetAway = shotsOnTargetAway;
  }

  const cornersHome = n(raw?.corners_home);
  const cornersAway = n(raw?.corners_away);
  if (cornersHome != null || cornersAway != null) {
    add("Cantos", cornersHome ?? "-", cornersAway ?? "-");
    if (cornersHome != null) liveExtra.cornersHome = cornersHome;
    if (cornersAway != null) liveExtra.cornersAway = cornersAway;
    if (cornersHome != null && cornersAway != null) liveExtra.cornersTotal = cornersHome + cornersAway;
    else if (cornersHome != null) liveExtra.cornersTotal = cornersHome;
    else if (cornersAway != null) liveExtra.cornersTotal = cornersAway;
  }

  const yellowCardsHome = n(raw?.yellow_cards_home);
  const yellowCardsAway = n(raw?.yellow_cards_away);
  if (yellowCardsHome != null || yellowCardsAway != null) {
    add("Cartões amarelos", yellowCardsHome ?? "-", yellowCardsAway ?? "-");
    if (yellowCardsHome != null) liveExtra.yellowCardsHome = yellowCardsHome;
    if (yellowCardsAway != null) liveExtra.yellowCardsAway = yellowCardsAway;
  }

  const redCardsHomeRaw = n(raw?.red_cards_home);
  const redCardsAwayRaw = n(raw?.red_cards_away);
  if (redCardsHomeRaw != null || redCardsAwayRaw != null) {
    add("Cartões vermelhos", redCardsHomeRaw ?? "-", redCardsAwayRaw ?? "-");
    if (redCardsHomeRaw != null) redCardsHome = redCardsHomeRaw;
    if (redCardsAwayRaw != null) redCardsAway = redCardsAwayRaw;
  }

  if ((yellowCardsHome != null || redCardsHomeRaw != null) && (yellowCardsAway != null || redCardsAwayRaw != null)) {
    const ch = (yellowCardsHome ?? 0) + (redCardsHomeRaw ?? 0);
    const ca = (yellowCardsAway ?? 0) + (redCardsAwayRaw ?? 0);
    liveExtra.cardsTotal = ch + ca;
  }

  const foulsHome = n(raw?.fouls_home);
  const foulsAway = n(raw?.fouls_away);
  if (foulsHome != null || foulsAway != null) {
    add("Faltas", foulsHome ?? "-", foulsAway ?? "-");
    if (foulsHome != null) liveExtra.foulsHome = foulsHome;
    if (foulsAway != null) liveExtra.foulsAway = foulsAway;
  }

  const offsidesHome = n(raw?.offsides_home);
  const offsidesAway = n(raw?.offsides_away);
  if (offsidesHome != null || offsidesAway != null) {
    add("Fora de jogo", offsidesHome ?? "-", offsidesAway ?? "-");
    if (offsidesHome != null) liveExtra.offsidesHome = offsidesHome;
    if (offsidesAway != null) liveExtra.offsidesAway = offsidesAway;
  }

  const savesHome = n(raw?.saves_home);
  const savesAway = n(raw?.saves_away);
  if (savesHome != null || savesAway != null) {
    add("Defesas", savesHome ?? "-", savesAway ?? "-");
    if (savesHome != null) liveExtra.savesHome = savesHome;
    if (savesAway != null) liveExtra.savesAway = savesAway;
  }

  const dangerousAttacksHome = n(raw?.dangerous_attacks_home);
  const dangerousAttacksAway = n(raw?.dangerous_attacks_away);
  if (dangerousAttacksHome != null || dangerousAttacksAway != null) {
    add("Ataques perigosos", dangerousAttacksHome ?? "-", dangerousAttacksAway ?? "-");
    if (dangerousAttacksHome != null) liveExtra.dangerousAttacksHome = dangerousAttacksHome;
    if (dangerousAttacksAway != null) liveExtra.dangerousAttacksAway = dangerousAttacksAway;
  }

  const attacksHome = n(raw?.attacks_home);
  const attacksAway = n(raw?.attacks_away);
  if (attacksHome != null || attacksAway != null) {
    add("Ataques", attacksHome ?? "-", attacksAway ?? "-");
    if (attacksHome != null) liveExtra.attacksHome = attacksHome;
    if (attacksAway != null) liveExtra.attacksAway = attacksAway;
  }

  const throwInsHome = n(raw?.throw_ins_home);
  const throwInsAway = n(raw?.throw_ins_away);
  if (throwInsHome != null || throwInsAway != null) {
    add("Lançamentos laterais", throwInsHome ?? "-", throwInsAway ?? "-");
    if (throwInsHome != null) liveExtra.throwInsHome = throwInsHome;
    if (throwInsAway != null) liveExtra.throwInsAway = throwInsAway;
  }

  const passesHome = n(raw?.passes_home);
  const passesAway = n(raw?.passes_away);
  if (passesHome != null || passesAway != null) {
    add("Passes", passesHome ?? "-", passesAway ?? "-");
    if (passesHome != null) liveExtra.passesHome = passesHome;
    if (passesAway != null) liveExtra.passesAway = passesAway;
  }

  const passAccuracyHome = n(raw?.pass_accuracy_home);
  const passAccuracyAway = n(raw?.pass_accuracy_away);
  if (passAccuracyHome != null || passAccuracyAway != null) {
    const pah = passAccuracyHome != null ? `${passAccuracyHome}%` : "-";
    const paa = passAccuracyAway != null ? `${passAccuracyAway}%` : "-";
    add("Precisão de passes", pah, paa);
    if (passAccuracyHome != null) liveExtra.passAccuracyHome = passAccuracyHome;
    if (passAccuracyAway != null) liveExtra.passAccuracyAway = passAccuracyAway;
  }

  const fullTimeStats = raw?.stats?.find((s) => s.period?.toLowerCase() === "fulltime" || s.period?.toLowerCase() === "full_time" || s.period === "FULL_TIME" || s.period === "1H2H");
  if (fullTimeStats?.stats?.length) {
    const seenKeys = new Set(matchStatsRows.map((r) => r.name));
    for (const row of fullTimeStats.stats) {
      const label = BZZOIRO_STAT_LABELS[row.type] ?? row.type;
      if (seenKeys.has(label)) continue;
      seenKeys.add(label);
      add(label, row.home, row.away);
    }
  }

  const matchStats: MatchStatsGroup[] = matchStatsRows.length > 0 ? [{ title: "Estatísticas do Jogo", rows: matchStatsRows }] : [];

  return { matchStats, liveExtra, redCardsHome, redCardsAway };
}

export type NormalizedBzzoiroEvent = {
  type: string;
  team: "home" | "away";
  minute: number;
  player: string;
  playerId?: string;
  detail?: string;
};

export function normalizeBzzoiroIncidents(raw: BzzoiroEventIncidentsResponse | null | undefined): NormalizedBzzoiroEvent[] {
  if (!raw?.incidents?.length) return [];
  const out: NormalizedBzzoiroEvent[] = [];
  const sorted = [...raw.incidents].sort((a, b) => {
    const sa = a.sort_order ?? 0;
    const sb = b.sort_order ?? 0;
    if (sa !== sb) return sa - sb;
    const ma = a.minute ?? 0;
    const mb = b.minute ?? 0;
    return ma - mb;
  });
  for (const inc of sorted) {
    const team = inc.team === "away" ? "away" : "home";
    const minute = Number(inc.minute) || 0;
    const player = inc.player ?? "?";
    const playerId = inc.player_id != null ? String(inc.player_id) : undefined;
    const typeLower = String(inc.type ?? "").toLowerCase();

    let typeOut: string | null = null;
    const details: string[] = [];

    if (typeLower === "goal") {
      typeOut = "goal";
      if (inc.is_own_goal) details.push("Golo contra");
      if (inc.is_penalty) details.push("Grande Penalidade");
      if (inc.detail) details.push(inc.detail);
      if (inc.secondary_player) details.push(`Assistência: ${inc.secondary_player}`);
    } else if (typeLower === "yellow_card" || typeLower === "yellow") {
      typeOut = "yellow_card";
      if (inc.detail) details.push(inc.detail);
    } else if (typeLower === "red_card" || typeLower === "red") {
      typeOut = "red_card";
      if (inc.detail) details.push(inc.detail);
    } else if (typeLower === "substitution" || typeLower === "sub") {
      typeOut = "substitution";
      if (inc.secondary_player) details.push(`Saiu: ${inc.secondary_player}`);
    } else if (typeLower === "penalty" || typeLower === "penalty_shootout_kick") {
      typeOut = "goal";
      details.push("Grande Penalidade");
      if (inc.detail) details.push(inc.detail);
    } else if (typeLower === "penalty_missed") {
      typeOut = "penalty_missed";
      if (inc.detail) details.push(inc.detail);
    } else if (typeLower === "penalty_saved") {
      typeOut = "penalty_saved";
      if (inc.detail) details.push(inc.detail);
    } else {
      continue;
    }

    if (!typeOut) continue;

    out.push({
      type: typeOut,
      team,
      minute,
      player,
      playerId,
      detail: details.length > 0 ? details.join(" · ") : inc.detail ?? undefined,
    });
  }

  const homeGoalMinutes: number[] = [];
  const awayGoalMinutes: number[] = [];
  for (const ev of out) {
    if (ev.type === "goal") {
      if (ev.team === "home") homeGoalMinutes.push(ev.minute);
      else awayGoalMinutes.push(ev.minute);
    }
  }
  (out as NormalizedBzzoiroEvent[] & { _homeGoalMinutes?: number[]; _awayGoalMinutes?: number[] })._homeGoalMinutes = homeGoalMinutes;
  (out as NormalizedBzzoiroEvent[] & { _homeGoalMinutes?: number[]; _awayGoalMinutes?: number[] })._awayGoalMinutes = awayGoalMinutes;

  return out;
}

export function extractBzzoiroGoalMinutes(events: NormalizedBzzoiroEvent[]): { homeGoalMinutes: number[]; awayGoalMinutes: number[] } {
  const augmented = events as NormalizedBzzoiroEvent[] & { _homeGoalMinutes?: number[]; _awayGoalMinutes?: number[] };
  if (augmented._homeGoalMinutes || augmented._awayGoalMinutes) {
    return { homeGoalMinutes: augmented._homeGoalMinutes ?? [], awayGoalMinutes: augmented._awayGoalMinutes ?? [] };
  }
  const homeGoalMinutes: number[] = [];
  const awayGoalMinutes: number[] = [];
  for (const ev of events) {
    if (ev.type === "goal") {
      if (ev.team === "home") homeGoalMinutes.push(ev.minute);
      else awayGoalMinutes.push(ev.minute);
    }
  }
  return { homeGoalMinutes, awayGoalMinutes };
}

export function getCachedBzzoiroEventStatsSync(eventId: number | string): BzzoiroEventStatsResponse | undefined {
  const key = String(eventId);
  const cached = statsCache.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.fetchedAt >= STATS_CACHE_TTL_MS) {
    statsCache.delete(key);
    return undefined;
  }
  return cached.data;
}

export function getCachedBzzoiroEventIncidentsSync(eventId: number | string): BzzoiroEventIncidentsResponse | undefined {
  const key = String(eventId);
  const cached = incidentsCache.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.fetchedAt >= INCIDENTS_CACHE_TTL_MS) {
    incidentsCache.delete(key);
    return undefined;
  }
  return cached.data;
}
