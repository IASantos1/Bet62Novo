// BET62 Live + Match Tracker + Streaming — tracker source.
//
// The original plan called for StatScore's get_pushes endpoint, but there's
// no real StatScore account/documentation for this project. Statpal, on the
// other hand, is already the platform's live-football data source with real
// credentials — routes/matches.ts already maintains `liveMatchState`, an
// in-memory map of every live match (score, minute, status, incidents) fed
// by Statpal's own live poller. Reusing it here means the tracker needs no
// separate fetch, no separate cache, and no per-event ID mapping: a BetBY
// event is matched to its Statpal live-match entry by team name, fresh, on
// every tracker request.
import { liveMatchState, type LiveMatchState } from "../../routes/matches.js";

export interface MatchTracker {
  provider: "statpal";
  eventId: string;
  status: string;
  minute: string;
  homeScore: number;
  awayScore: number;
  incidents: Array<{ type: string; team: string; minute: number; player: string }>;
}

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
