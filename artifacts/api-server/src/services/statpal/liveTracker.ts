// BET62 Live + Match Tracker + Streaming — automatic tracker fallback.
//
// StatScore's get_pushes (services/statscore/tracker.ts) is the primary
// tracker source now that real auth is confirmed, but it still needs an
// admin to map a statscoreEventId per BetBY event (no "list live events"
// endpoint is documented for StatScore). Statpal needs no such mapping —
// routes/matches.ts already maintains `liveMatchState`, an in-memory map of
// every live match (score, minute, status, incidents) fed by Statpal's own
// live poller — so a BetBY event is matched to it by team name, fresh, on
// every tracker request, giving every live event *some* tracker data
// immediately even before an admin has mapped a StatScore id.
import { liveMatchState, type LiveMatchState } from "../../routes/matches.js";
import type { MatchTracker } from "../liveStream/trackerTypes.js";

export type { MatchTracker };

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Loose fallback: one name contains the other's first significant token
  // (handles provider suffixes like "FC"/"Women"/city qualifiers).
  const firstA = na.split(" ")[0]!;
  const firstB = nb.split(" ")[0]!;
  return na.includes(firstB) || nb.includes(firstA);
}

export function findLiveMatchState(home: string, away: string): LiveMatchState | null {
  for (const state of liveMatchState.values()) {
    if (teamsMatch(state.home, home) && teamsMatch(state.away, away)) return state;
  }
  return null;
}

export function buildTracker(state: LiveMatchState): MatchTracker {
  return {
    provider: "statpal",
    eventId: state.id,
    status: state.status,
    minute: String(state.minute ?? ""),
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    incidents: state.events ?? [],
  };
}

export function getTrackerForTeams(home: string, away: string): MatchTracker | null {
  const state = findLiveMatchState(home, away);
  return state ? buildTracker(state) : null;
}
