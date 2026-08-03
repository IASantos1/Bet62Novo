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

// /v2/soccer/matches/live is not included in every Statpal subscription (see
// matches.ts's fetchStatpalFootballLiveV2, which already established this
// for bet62's account: that endpoint returns nothing here, and the
// confirmed-working source is /v2/soccer/odds/live instead — same envelope,
// Portuguese-keyed ("informação_da_partida", "lar"/"ausente", "nome" — see
// statpalOddsMatchToV2Event). Try matches/live first anyway (harmless, and
// correct for any subscription that does include it) and fall back to
// odds/live otherwise, so this doesn't silently return nothing for the
// account it's actually running against.
async function getFootballLiveList(): Promise<any> {
  const now = Date.now();
  if (liveListCache && now - liveListCache.fetchedAt < LIVE_LIST_TTL_MS) {
    return liveListCache.data;
  }
  if (!liveListInFlight) {
    liveListInFlight = statpal
      .client
      .getFootballLive()
      .then((d) => (flattenLiveList(d).length > 0 ? d : null))
      .catch((err) => {
        // bet62's subscription doesn't include matches/live (confirmed HTTP
        // 429 in production) — a rejection here must still fall through to
        // the odds/live endpoint below, same as an empty-but-successful
        // response. Without this catch, the .then() chain skips straight to
        // the outer .catch() and the fallback never runs.
        logger.warn({ err }, "[statpal-live-tracker] matches/live fetch failed, trying odds/live");
        return null;
      })
      .then(async (d) => {
        if (d) return d;
        return statpal.client.getFootballOddsLive().catch((err) => {
          logger.warn({ err }, "[statpal-live-tracker] odds/live fallback fetch failed");
          return null;
        });
      })
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

// bet62's Statpal subscription responds in Portuguese, nested two levels
// deep: { "informação_da_partida": { main_id, minuto, placar, liga, ... },
// "informações_da_equipe": { lar: { nome, id }, ausente: { nome, id } } }
// (English equivalents "match_info"/"team_info"/"home"/"away"/"name" are
// supported too, in case a different subscription plan uses them — same
// convention as statpalOddsMatchToV2Event in matches.ts, which is the
// proven-working reference this was ported from).
function tryParsePortugueseMatch(r: Record<string, any>): StatpalLiveEvent | null {
  const info = r["informação_da_partida"] ?? r["match_info"];
  const teams = r["informações_da_equipe"] ?? r["team_info"];
  if (!info || typeof info !== "object" || !teams || typeof teams !== "object") return null;

  const id = info["main_id"] ?? info["id"];
  if (id == null) return null;

  const homeRaw = teams["lar"] ?? teams["home"];
  const awayRaw = teams["ausente"] ?? teams["away"];
  const homeName = String(homeRaw?.["nome"] ?? homeRaw?.["name"] ?? "").trim();
  const awayName = String(awayRaw?.["nome"] ?? awayRaw?.["name"] ?? "").trim();
  if (!homeName || !awayName) return null;

  const scoreParts = String(info["placar"] ?? info["score"] ?? "0:0").split(":");
  const homeScore = homeRaw?.["pontuação"] ?? homeRaw?.["score"] ?? scoreParts[0];
  const awayScore = awayRaw?.["pontuação"] ?? awayRaw?.["score"] ?? scoreParts[1];

  return {
    match_id: String(id),
    home: { name: homeName, id: homeRaw?.["id"] != null ? String(homeRaw["id"]) : undefined },
    away: { name: awayName, id: awayRaw?.["id"] != null ? String(awayRaw["id"]) : undefined },
    minute: info["minuto"] ?? info["minute"],
    status: (r["status"] as any)?.["concluído"] === "1" || (r["status"] as any)?.["finished"] === "1" ? "FT" : "LIVE",
    home_score: homeScore,
    away_score: awayScore,
  };
}

function flattenLiveList(raw: any): StatpalLiveEvent[] {
  const out: StatpalLiveEvent[] = [];
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const item of raw) out.push(...flattenLiveList(item));
    return out;
  }
  if (typeof raw !== "object") return out;
  const r = raw as Record<string, any>;

  const ptMatch = tryParsePortugueseMatch(r);
  if (ptMatch) {
    out.push(ptMatch);
    return out; // matched leaf — no need to recurse further into this node
  }

  const id = pick<string>(r, ["match_id", "matchId", "id", "fixture_id", "event_id"]);
  const hasTeams =
    (r.home?.name || r.homeName || r.home_team) && (r.away?.name || r.awayName || r.away_team);
  if (id && hasTeams) {
    out.push({
      match_id: String(id),
      home: {
        name: String(r.home?.name ?? r.homeName ?? r.home_team ?? r.homeTeam ?? "").trim() || undefined,
        id: r.home?.id != null ? String(r.home.id) : (r.homeId ?? r.home_team_id),
      },
      away: {
        name: String(r.away?.name ?? r.awayName ?? r.away_team ?? r.awayTeam ?? "").trim() || undefined,
        id: r.away?.id != null ? String(r.away.id) : (r.awayId ?? r.away_team_id),
      },
      minute: pick(r, ["minute", "time", "clock", "elapsed"]),
      status: pick(r, ["status", "status_name", "state", "match_status"]),
      home_score: r.home_score ?? r.homeScore ?? r.scores?.home,
      away_score: r.away_score ?? r.awayScore ?? r.scores?.away,
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
