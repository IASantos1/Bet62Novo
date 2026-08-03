// BetBY Match Tracker automatic fallback — PulseScore instead of Statpal
// (explicit user decision: replace, not add). Reuses the same live-events
// caches already kept warm by the odds-overlay feature (football.ts,
// tennisWs.ts, genericSportLive.ts) rather than polling PulseScore again —
// this is read-only against their in-memory state, so it costs nothing
// beyond what the odds overlay already spends against the rate limit.
//
// PulseScore's documented schema only shows `score` explicitly, but real
// production payloads have been observed to also carry `minute`, `clock`,
// `elapsed`, `status_text`, and even a partial `events`/`timeline` array on
// some sports. All extra fields are read DEFENSIVELY via pick() — anything
// not present (or that doesn't match the expected shape) silently falls
// back to empty rather than throwing. `minute`/`incidents` are best-effort;
// when they're absent, the tracker still returns with a scoreboard only
// (the historical accepted degradation vs StatScore / StatScore).
import { getPulseScoreFootballLive } from "./football.js";
import { getPulseScoreTennisLive } from "./tennisWs.js";
import {
  pulseScoreBasketball,
  pulseScoreHockey,
  pulseScoreBaseball,
  pulseScoreVolleyball,
} from "./genericSportLive.js";
import { teamNamesMatch } from "./teamMatch.js";
import type { PulseScoreEvent } from "./client.js";
import type { MatchTracker } from "../liveStream/trackerTypes.js";

function pick<T = unknown>(o: any, keys: string[]): T | undefined {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    if ((o as Record<string, unknown>)[k] !== undefined && (o as Record<string, unknown>)[k] !== null) {
      return (o as Record<string, unknown>)[k] as T;
    }
  }
  return undefined;
}

// BetBY's own sport slug isn't confirmed for any real sport besides the one
// virtual example seen ("eSoccer") — matched leniently by substring rather
// than an exact enum, since guessing the wrong exact string would silently
// send every football/tennis/etc event down the "unmapped" path.
async function liveEventsForBetbySport(sport: string): Promise<PulseScoreEvent[]> {
  const s = (sport || "").toLowerCase();
  if (s.includes("soccer") || s.includes("football")) return getPulseScoreFootballLive();
  if (s.includes("tennis")) return Promise.resolve(getPulseScoreTennisLive());
  if (s.includes("basketball") || s.includes("basket")) return pulseScoreBasketball.getLive();
  if (s.includes("hockey")) return pulseScoreHockey.getLive();
  if (s.includes("baseball")) return pulseScoreBaseball.getLive();
  if (s.includes("volleyball") || s.includes("volley")) return pulseScoreVolleyball.getLive();
  return [];
}

// Defensive against the field simply not matching what's documented (real
// upstream data has repeatedly diverged from PulseScore's docs elsewhere in
// this integration) — anything other than a plain "H-A" string is treated
// as "no score yet" rather than risking a throw on unexpected input.
function parseScore(raw: unknown): { home: number; away: number } | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function parseMinute(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number") return Number.isFinite(raw) ? `${raw}` : "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    if (/^\d+$/.test(s)) return s;
    return s;
  }
  return "";
}

function extractIncidents(ev: PulseScoreEvent & Record<string, any>): MatchTracker["incidents"] {
  const out: MatchTracker["incidents"] = [];
  const raw = pick<any[]>(ev, ["events", "timeline", "incidents", "match_events"]);
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const t = String(pick<string>(e, ["type", "event_type", "event", "kind", "name"]) ?? "").toLowerCase();
    let type = "";
    if (t.includes("goal") && !t.includes("missed") && !t.includes("own")) type = "goal";
    else if (t.includes("own")) type = "own_goal";
    else if (t.includes("penalty")) type = "penalty";
    else if (t.includes("yellow")) type = t.includes("red") ? "yellow_red" : "yellow";
    else if (t.includes("red")) type = "red_card";
    else if (t.includes("var")) type = "var";
    else if (t.includes("sub")) type = "substitution";
    if (!type) continue;
    const team = String(pick<string>(e, ["team", "team_name", "club", "side"]) ?? "").trim();
    const minStr = pick(e, ["minute", "time", "elapsed", "min"]);
    const minute = typeof minStr === "number" ? minStr : Number(minStr) || 0;
    const player = String(
      pick<string>(e, ["player", "player_name", "playerName", "name", "scorer"]) ?? "",
    ).trim();
    out.push({ type, team, minute, player });
  }
  return out;
}

export async function getPulseScoreTrackerForTeams(
  home: string,
  away: string,
  sport: string,
): Promise<MatchTracker | null> {
  const events = await liveEventsForBetbySport(sport);
  if (events.length === 0) return null;
  const ev = events.find(
    (e) =>
      typeof e?.home === "string" &&
      typeof e?.away === "string" &&
      teamNamesMatch(home, e.home) &&
      teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const score = parseScore(ev.score);
  if (!score) return null; // no usable score yet — same "not ready" behavior as before
  const anyEv = ev as PulseScoreEvent & Record<string, any>;
  const minute =
    parseMinute(pick<any>(anyEv, ["minute", "clock", "elapsed", "statusMinute"])) || "";
  const statusText = String(
    pick<string>(anyEv, ["status", "status_text", "statusText", "state"]) ??
      (ev.live ? "LIVE" : "FINISHED"),
  );
  const incidents = extractIncidents(anyEv);
  return {
    provider: "pulsescore",
    eventId: ev.eventId,
    status: statusText || (ev.live ? "LIVE" : "FINISHED"),
    minute,
    homeScore: score.home,
    awayScore: score.away,
    incidents,
  };
}
