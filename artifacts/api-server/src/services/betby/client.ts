import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { LiveEvent } from "./types.js";

// No real BetBY API documentation has been provided yet — this client is
// scaffolding, not a verified integration. BETBY_LIVE_EVENTS_URL/
// BETBY_API_TOKEN are unset by default, so fetchBetbyLiveEvents() no-ops
// (returns []) rather than guessing at a URL that would just 404/fail
// silently in a more confusing way. Once BetBY's real "live events" list
// endpoint + auth scheme are known (same way Palace Casino's contract was
// nailed down from their PHP reference), update:
//   1. the fetch call below (URL/headers/query params), and
//   2. normalizeBetbyEvent()'s field lookups to match their real response
//      shape (currently best-effort common-sense key names).
let warnedNotConfigured = false;

async function fetchRaw(): Promise<unknown[]> {
  if (!CONFIG.BETBY_LIVE_EVENTS_URL || !CONFIG.BETBY_API_TOKEN) {
    if (!warnedNotConfigured) {
      logger.warn(
        "[betby] BETBY_LIVE_EVENTS_URL/BETBY_API_TOKEN not configured — live poller disabled.",
      );
      warnedNotConfigured = true;
    }
    return [];
  }
  const resp = await fetch(CONFIG.BETBY_LIVE_EVENTS_URL, {
    headers: {
      Authorization: `Bearer ${CONFIG.BETBY_API_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) {
    throw new Error(`[betby] live events fetch failed: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as unknown;
  if (Array.isArray(data)) return data;
  const nested = (data as { events?: unknown[]; data?: unknown[] } | null)?.events
    ?? (data as { data?: unknown[] } | null)?.data;
  return Array.isArray(nested) ? nested : [];
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function normalizeBetbyEvent(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const betbyEventId = String(pick(o, ["id", "event_id", "eventId"]) ?? "").trim();
  const home = String(pick(o, ["home", "home_team", "homeTeam"]) ?? "").trim();
  const away = String(pick(o, ["away", "away_team", "awayTeam"]) ?? "").trim();
  if (!betbyEventId || !home || !away) return null;

  const statusRaw = String(pick(o, ["status"]) ?? "").toLowerCase();
  const status: LiveEvent["status"] =
    statusRaw.includes("finish") || statusRaw.includes("ended")
      ? "FINISHED"
      : statusRaw.includes("live") || statusRaw.includes("progress")
        ? "LIVE"
        : "PREMATCH";

  const homeScoreRaw = pick(o, ["homeScore", "home_score"]);
  const awayScoreRaw = pick(o, ["awayScore", "away_score"]);

  return {
    betbyEventId,
    sport: String(pick(o, ["sport", "sport_name"]) ?? "football"),
    league: String(pick(o, ["league", "tournament", "competition"]) ?? ""),
    country: String(pick(o, ["country"]) ?? ""),
    home,
    away,
    status,
    minute: pick(o, ["minute", "time"]) != null ? String(pick(o, ["minute", "time"])) : undefined,
    homeScore: homeScoreRaw != null ? Number(homeScoreRaw) : undefined,
    awayScore: awayScoreRaw != null ? Number(awayScoreRaw) : undefined,
  };
}

export async function fetchBetbyLiveEvents(): Promise<LiveEvent[]> {
  const raw = await fetchRaw();
  return raw
    .map(normalizeBetbyEvent)
    .filter((e): e is LiveEvent => e !== null);
}
