// BetBY Match Tracker automatic fallback — PulseScore instead of Statpal
// (explicit user decision: replace, not add). Reuses the same live-events
// caches already kept warm by the odds-overlay feature (football.ts,
// tennisWs.ts, genericSportLive.ts) rather than polling PulseScore again —
// this is read-only against their in-memory state, so it costs nothing
// beyond what the odds overlay already spends against the rate limit.
//
// Real gap vs the old Statpal fallback: PulseScore's documented schema has
// no minute/clock and no incidents feed at all — only `score` (and even
// that is only shown in the docs' WebSocket frame example, not the REST
// one, so it's read defensively here and a tracker is only returned once a
// parseable score actually shows up). `minute`/`incidents` are always
// empty for this provider; that's a known, accepted degradation versus
// Statpal, not a bug.
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
  return {
    provider: "pulsescore",
    eventId: ev.eventId,
    status: ev.live ? "LIVE" : "FINISHED",
    minute: "",
    homeScore: score.home,
    awayScore: score.away,
    incidents: [],
  };
}
