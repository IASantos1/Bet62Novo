import { statpal } from "./index.js";
import { teamNamesMatch } from "../pulsescore/teamMatch.js";
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { MatchTracker } from "../liveStream/trackerTypes.js";

const LIVE_LIST_TTL_MS = 1_500;
const PER_MATCH_STATS_TTL_MS = 3_000;

type LiveListCache = { data: any; fetchedAt: number };
let liveListCache: LiveListCache | null = null;
let liveListInFlight: Promise<any> | null = null;

type MatchStatsCacheEntry = { data: any; fetchedAt: number };
const matchStatsCache = new Map<string, MatchStatsCacheEntry>();
const matchStatsInFlight = new Map<string, Promise<any>>();

async function getFootballLiveList(): Promise<any> {
  const now = Date.now();
  if (liveListCache && now - liveListCache.fetchedAt < LIVE_LIST_TTL_MS) {
    return liveListCache.data;
  }
  if (!liveListInFlight) {
    liveListInFlight = statpal
      .client
      .getFootballLive()
      .then((d) => {
        liveListCache = { data: d, fetchedAt: Date.now() };
        return d;
      })
      .catch((err) => {
        logger.warn({ err }, "[statpal-live-tracker] live list fetch failed");
        return null;
      })
      .finally(() => {
        liveListInFlight = null;
      });
  }
  return liveListInFlight;
}

async function getFootballMatchStatsCached(matchId: string): Promise<any> {
  const now = Date.now();
  const cached = matchStatsCache.get(matchId);
  if (cached && now - cached.fetchedAt < PER_MATCH_STATS_TTL_MS) {
    return cached.data;
  }
  let inFlight = matchStatsInFlight.get(matchId);
  if (!inFlight) {
    inFlight = statpal
      .client
      .getFootballMatchStats(matchId)
      .then((d) => {
        matchStatsCache.set(matchId, { data: d, fetchedAt: Date.now() });
        return d;
      })
      .catch((err) => {
        logger.warn({ err, matchId }, "[statpal-live-tracker] match stats fetch failed");
        return null;
      })
      .finally(() => {
        matchStatsInFlight.delete(matchId);
      });
    matchStatsInFlight.set(matchId, inFlight);
  }
  return inFlight;
}

function pick<T = unknown>(o: any, keys: string[]): T | undefined {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type StatpalLiveEvent = {
  match_id: string;
  home?: { id?: string; name?: string };
  away?: { id?: string; name?: string };
  minute?: string | number;
  status?: string | number;
  home_score?: string | number;
  away_score?: string | number;
  [k: string]: any;
};

function flattenLiveList(raw: any): StatpalLiveEvent[] {
  const out: StatpalLiveEvent[] = [];
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const item of raw) out.push(...flattenLiveList(item));
    return out;
  }
  if (typeof raw !== "object") return out;
  const r = raw as Record<string, any>;
  const id = pick<string>(r, ["match_id", "matchId", "id", "fixture_id", "event_id"]);
  const hasTeams =
    (r.home?.name || r.homeName || r.home_team) && (r.away?.name || r.awayName || r.away_team);
  if (id && hasTeams) {
    out.push({
      match_id: String(id),
      home: {
        name:
          String(pick(r, ["home.name", "homeName", "home_team", "homeTeam"]) ?? "").trim() ||
          undefined,
        id: pick<string>(r, ["home.id", "homeId", "home_team_id"]),
      },
      away: {
        name:
          String(pick(r, ["away.name", "awayName", "away_team", "awayTeam"]) ?? "").trim() ||
          undefined,
        id: pick<string>(r, ["away.id", "awayId", "away_team_id"]),
      },
      minute: pick(r, ["minute", "time", "clock", "elapsed"]),
      status: pick(r, ["status", "status_name", "state", "match_status"]),
      home_score: pick(r, ["home_score", "homeScore", "scores.home"]),
      away_score: pick(r, ["away_score", "awayScore", "scores.away"]),
      ...r,
    });
  }
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (Array.isArray(v) || (v && typeof v === "object")) {
      out.push(...flattenLiveList(v));
    }
  }
  return out;
}

type Incident = { type: string; team: string; minute: number; player: string };

function extractIncidents(stats: any): Incident[] {
  const out: Incident[] = [];
  if (!stats || typeof stats !== "object") return out;
  const events = pick<any[]>(stats, ["events", "timeline", "incidents", "match_events"]);
  if (!Array.isArray(events)) return out;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const typeRaw = String(
      pick(ev, ["type", "event_type", "event", "kind", "name"]) ?? "",
    ).toLowerCase();
    let type = "";
    if (typeRaw.includes("goal") && !typeRaw.includes("missed") && !typeRaw.includes("own")) {
      type = "goal";
    } else if (typeRaw.includes("own") || typeRaw.includes("og")) {
      type = "own_goal";
    } else if (typeRaw.includes("penalty")) {
      type = "penalty";
    } else if (typeRaw.includes("yellow") || typeRaw.includes("card")) {
      if (typeRaw.includes("red") || typeRaw.includes("second")) type = "yellow_red";
      else type = "yellow";
    } else if (typeRaw.includes("red")) {
      type = "red_card";
    } else if (typeRaw.includes("var")) {
      type = "var";
    } else if (typeRaw.includes("sub")) {
      type = "substitution";
    }
    if (!type) continue;
    const team = String(pick(ev, ["team", "team_name", "club", "side"]) ?? "").trim();
    const minRaw = pick(ev, ["minute", "time", "elapsed", "min"]);
    const minute = toNum(minRaw);
    const player =
      String(
        pick(ev, ["player", "player_name", "playerName", "name", "assist", "scorer"]) ?? "",
      ).trim() || "";
    out.push({ type, team, minute, player });
  }
  return out;
}

function normalizeTracker(ev: StatpalLiveEvent, stats: any | null): MatchTracker {
  const home = stats ? pick(stats, ["home_score", "homeScore"]) ?? ev.home_score : ev.home_score;
  const away = stats ? pick(stats, ["away_score", "awayScore"]) ?? ev.away_score : ev.away_score;
  let minute = String(pick(stats, ["minute", "time", "elapsed"]) ?? ev.minute ?? "").trim();
  if (!minute) {
    const status = String(pick(stats, ["status", "status_name", "state"]) ?? ev.status ?? "");
    if (status.toLowerCase().includes("half") || status.includes("HT")) minute = "HT";
    else if (status.toLowerCase().includes("finished") || status.toLowerCase().includes("ft"))
      minute = "FT";
  }
  const status =
    String(pick(stats, ["status", "status_name", "match_status"]) ?? ev.status ?? "LIVE") ||
    "LIVE";
  const incidents = extractIncidents(stats);
  return {
    provider: "statpal",
    eventId: ev.match_id,
    status,
    minute,
    homeScore: toNum(home),
    awayScore: toNum(away),
    incidents,
  };
}

export async function getStatpalTrackerForTeams(
  home: string,
  away: string,
): Promise<MatchTracker | null> {
  if (!CONFIG.STATPAL_API_KEY) return null;
  const list = await getFootballLiveList();
  const flat = flattenLiveList(list);
  if (flat.length === 0) return null;
  const ev = flat.find(
    (e) =>
      e.home?.name &&
      e.away?.name &&
      teamNamesMatch(home, e.home.name) &&
      teamNamesMatch(away, e.away.name),
  );
  if (!ev) return null;
  const stats = await getFootballMatchStatsCached(ev.match_id);
  return normalizeTracker(ev, stats);
}

export async function listStatpalLiveEvents(): Promise<StatpalLiveEvent[]> {
  const list = await getFootballLiveList();
  return flattenLiveList(list);
}

function cleanupOldStatsEntries(): void {
  const now = Date.now();
  for (const [k, v] of matchStatsCache.entries()) {
    if (now - v.fetchedAt > 10 * 60_000) matchStatsCache.delete(k);
  }
}
setInterval(cleanupOldStatsEntries, 5 * 60_000).unref?.();
