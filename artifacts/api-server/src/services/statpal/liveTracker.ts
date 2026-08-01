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

// Club-suffix/qualifier tokens that carry no identifying signal, dropped
// before comparing — otherwise "Chelsea FC" vs "Chelsea Women U20" would
// share only noise tokens and never usefully overlap.
const IGNORED_TOKENS = new Set([
  "fc", "cf", "sc", "ac", "cd", "ud", "if", "bk", "sk", "sv", "vfl", "fk",
  "the", "club", "futbol", "futebol", "calcio", "women", "w",
  "u15", "u16", "u17", "u18", "u19", "u20", "u21", "u23",
  "reserves", "res", "ii", "b",
]);

function significantTokens(name: string): string[] {
  return normalizeTeamName(name)
    .split(" ")
    .filter((t) => t && !IGNORED_TOKENS.has(t) && !/^\d+$/.test(t));
}

// BetBY sends full team names; the pre-existing Statpal/SportsAPI feed this
// falls back to may send shortened ones ("Man Utd", "PSG") for the same
// fixture, so a plain equality check misses most real matches. Layered
// heuristics, cheapest/strictest first:
//   1. exact normalized match
//   2. one full name is a substring of the other ("Chelsea" ⊂ "Chelsea FC",
//      "Man Utd" ⊂ "Manchester United" — short codes are usually a prefix
//      contraction of the full name)
//   3. acronym match — a short all-caps-ish code ("PSG") against the
//      initials of the other name's significant tokens ("Paris Saint
//      Germain" → "psg")
//   4. every significant token of the shorter name appears in the longer
//      one (handles reordering / extra qualifiers)
function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;

  const acronym = (tokens: string[]) => tokens.map((t) => t[0]).join("");
  const rawA = na.replace(/ /g, "");
  const rawB = nb.replace(/ /g, "");
  if (rawA.length > 0 && rawA.length <= 5 && rawA === acronym(tb)) return true;
  if (rawB.length > 0 && rawB.length <= 5 && rawB === acronym(ta)) return true;

  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  return shorter.every((t) => longerSet.has(t));
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
