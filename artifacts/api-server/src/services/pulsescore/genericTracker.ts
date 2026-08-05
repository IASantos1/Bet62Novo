// Match Tracker automatic fallback — PulseScore instead of Statpal
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

// Sport slugs aren't confirmed for every real sport besides the common
// ones — matched leniently by substring rather than an exact enum, since
// guessing the wrong exact string would silently send every football/
// tennis/etc event down the "unmapped" path.
async function liveEventsForSport(sport: string): Promise<PulseScoreEvent[]> {
  const s = (sport || "").toLowerCase();
  if (s.includes("soccer") || s.includes("football")) return getPulseScoreFootballLive();
  // "table-tennis" contains "tennis" as a substring — must be excluded
  // explicitly or it's silently misrouted to the real-tennis fetcher, which
  // will never find a table-tennis match by team name (PulseScore has no
  // table-tennis coverage under this integration; falls through to the
  // unmapped "return []" below, same end result but for the right reason).
  if (s.includes("tennis") && !s.includes("table")) return Promise.resolve(getPulseScoreTennisLive());
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
  // Real PulseScore data (verified against bet365/football, 2026-08-05)
  // sends score as a {home, away} object, not the "H-A" string the docs'
  // example implied — kept as a fallback in case some bookmaker/sport
  // combination genuinely differs.
  if (raw && typeof raw === "object") {
    const obj = raw as { home?: unknown; away?: unknown };
    const h = Number(obj.home);
    const a = Number(obj.away);
    if (Number.isFinite(h) && Number.isFinite(a)) return { home: h, away: a };
    return null;
  }
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
  const events = await liveEventsForSport(sport);
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
  // Real bet365 data has no top-level minute/clock field — the live clock
  // lives at moreInfo.TM (verified against real football data, 2026-08-05).
  // Kept the original pick() fallbacks too since this runs for any
  // sport/bookmaker and that hasn't been verified beyond football/bet365.
  const minute =
    parseMinute(ev.moreInfo?.TM) ||
    parseMinute(pick<any>(anyEv, ["minute", "clock", "elapsed", "statusMinute"])) ||
    "";
  const statusText = String(
    pick<string>(anyEv, ["status", "status_text", "statusText", "state"]) ?? "LIVE",
  );
  const incidents = extractIncidents(anyEv);
  return {
    provider: "pulsescore",
    eventId: ev.eventId,
    status: statusText || "LIVE",
    minute,
    homeScore: score.home,
    awayScore: score.away,
    incidents,
  };
}
