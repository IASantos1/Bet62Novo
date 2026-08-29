// SportMonks Football API v3 — odds extraction. Confirmed against three real
// samples (2026-08-28/29): (1) a finished Brazilian Série A round, GET
// /v3/football/rounds/{id}?include=fixtures.odds.market;fixtures.odds.bookmaker;league.country
// (2) a single live fixture's full odds (Bodø/Glimt v NEC), same include
// shape, and (3) the same Brazilian round unfiltered (all 130 markets ×
// 22 bookmakers) — confirmed the aggregator carries onexbet (1xbet,
// bookmaker_id 35) alongside bet365, bwin, Pinnacle, etc. Bookmaker chosen
// (2026-08-29, explicit user decision): 1xbet — same brand the rest of the
// platform already standardized on for every other sport.
//
// Markets are matched by `market.developer_name` (SportMonks' stable English
// canonical name) rather than `market_id`, since market_id collisions are
// unconfirmed — developer_name is what SportMonks' own docs key off.
//
// Deliberately mirrors the exact target shapes already defined for football
// in matches.ts's AdvancedMarkets / pulsescore/football.ts's
// PulseScoreFootballOverride (same field names, same fixed-line "ladder"
// buckets for totalGoals/corners/cards) so matches.ts can merge this in the
// same way it already merges extractFootballOverride's result — no new UI
// needed for these seven, just a new real data source.
//
// Real-world quirks found comparing bookmakers/leagues within SportMonks:
// - Fulltime Result: "1"/"X"/"2" labels with the team name in `name`
//   (bet365, Bodø/Glimt sample) vs "Home"/"Draw"/"Away" labels with `name`
//   null (both bet365-Brazilian-league AND 1xbet use this style).
//   `original_label` (present on some rows, absent on others) is the one
//   field seen so far consistently normalized to "1"/"Draw"/"2" — used as
//   the primary key, falling back to normalizing `label` otherwise.
// - Double Chance: bet365 uses "1X"/"X2"/"12"; 1xbet uses
//   "Home/Draw"/"Draw/Away"/"Home/Away" instead — same market, different
//   vocabulary.
// - Total goals: bet365 splits MATCH_GOALS (standard line) +
//   ALTERNATIVE_MATCH_GOALS (extra lines); 1xbet uses a single
//   GOALS_OVER_UNDER market instead — same Over/Under + `total` shape,
//   just a different developer_name, merged in here.
// - Total corners: bet365 uses TOTAL_CORNERS; 1xbet uses CORNER_MARKET —
//   same shape, different developer_name, merged in here too.
// - Draw No Bet: not offered by 1xbet at all for this (lower-coverage)
//   competition in the confirmed sample — stays unset, same tolerant
//   "real absence, not a bug" behavior used throughout this codebase.
//
// NOT yet implemented (real data confirmed to exist — e.g. Half Time/Full
// Time, Correct Score, Goalscorers, Asian Handicap, Odd/Even, and 100+ more
// markets seen in the unfiltered sample — but out of scope for this first
// pass; see htft/correctScore/exactGoals/firstGoal/secondHalf/goalOddEven/
// cleanSheet/teamGoals/anytimeGoalscorer etc. in PulseScoreFootballOverride
// for the full target list still open).

import { sportMonksGetWithRetry } from "./client.js";

export type SportMonksOdd = {
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  name: string | null;
  original_label?: string | null;
  total?: string | null;
  handicap?: string | null;
  suspended?: boolean;
  stopped?: boolean;
  market: { id: number; name: string; developer_name: string };
  bookmaker: { id: number; name: string };
};

export type SportMonksParticipant = {
  id: number;
  name: string;
  image_path?: string;
  meta?: { location?: "home" | "away"; position?: number };
};

// Confirmed real (2026-08-29, GET /v3/football/livescores/inplay):
// state_id 1 = NS (not started), 2 = INPLAY_1ST_HALF, 3 = HT, 22 =
// INPLAY_2ND_HALF, 5 = FT (finished). `state.developer_name` is the
// stable, human-readable key — used in preference to the raw numeric
// state_id, which has no full documented mapping. Other real states (ET,
// penalties, postponed, etc.) not yet confirmed — treated as "unknown,
// not live" by isSportMonksFixtureLive below rather than guessed.
export type SportMonksFixtureState = {
  id: number;
  state: string;
  name: string;
  short_name: string;
  developer_name: string;
};

// Confirmed real: `description` values seen are "CURRENT" (running total),
// "1ST_HALF", "2ND_HALF", "2ND_HALF_ONLY" — "CURRENT" is what's used for
// the live score everywhere in this file.
export type SportMonksScore = {
  description: string;
  participant_id: number;
  score: { goals: number; participant: "home" | "away" };
};

// Confirmed real: type_id 1 = 1st-half, type_id 2 = 2nd-half.
// `ticking: true` marks whichever period is actively running right now.
export type SportMonksPeriod = {
  id: number;
  type_id: number;
  description: string;
  ticking: boolean;
  minutes: number;
  seconds: number;
  counts_from: number;
  time_added: number | null;
};

// Confirmed real developer_name values (2026-08-29, a real in-play sample):
// GOAL, OWNGOAL, SUBSTITUTION, YELLOWCARD, REDCARD. A VAR-review event type
// was NOT observed in that sample (no VAR incident happened to occur in it)
// — its type_id/developer_name is NOT confirmed, so nothing in this codebase
// keys off "VAR" yet; only real, seen event types are handled.
export type SportMonksEvent = {
  id: number;
  fixture_id: number;
  period_id: number;
  participant_id: number;
  type_id: number;
  player_id: number | null;
  related_player_id: number | null;
  player_name: string | null;
  related_player_name: string | null;
  result: string | null;
  info: string | null;
  addition: string | null;
  minute: number;
  extra_minute: number | null;
  rescinded: boolean | null;
  type: { id: number; name: string; code: string; developer_name: string };
};

export type SportMonksFixture = {
  id: number;
  name: string;
  starting_at: string;
  starting_at_timestamp: number;
  state_id: number;
  has_odds?: boolean;
  odds?: SportMonksOdd[];
  participants?: SportMonksParticipant[];
  state?: SportMonksFixtureState;
  scores?: SportMonksScore[];
  periods?: SportMonksPeriod[];
  events?: SportMonksEvent[];
  // Present per-fixture on /livescores/inplay (confirmed real, 2026-08-29)
  // when `league.country` is included — unlike the rounds/{id} endpoint,
  // where league sits at the ROUND level instead (see
  // SportMonksLeagueUpcoming.league in the fetch layer below).
  league_id?: number;
  league?: SportMonksLeagueRef;
};

export type SportMonksLeagueRef = {
  id: number;
  name: string;
  image_path?: string;
  country?: { id: number; name: string; image_path?: string };
};

function oddsToNumber(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function oddsByDeveloperName(
  fixture: SportMonksFixture,
  developerName: string,
  bookmakerId: number,
): SportMonksOdd[] {
  return (fixture.odds ?? []).filter(
    (o) =>
      o.market?.developer_name === developerName &&
      o.bookmaker_id === bookmakerId &&
      !o.suspended,
  );
}

// "1"/"X"/"2" or "Home"/"Draw"/"Away" -> normalized side. Prefers
// original_label (stable "1"/"Draw"/"2" vocabulary) when present.
function normalizeThreeWaySide(odd: SportMonksOdd): "home" | "draw" | "away" | null {
  const key = (odd.original_label || odd.label || "").trim().toLowerCase();
  if (key === "1" || key === "home") return "home";
  if (key === "x" || key === "draw") return "draw";
  if (key === "2" || key === "away") return "away";
  return null;
}

const TOTAL_GOALS_LINE_KEYS: Record<string, { over: string; under: string }> = {
  "0.5": { over: "over05", under: "under05" },
  "1.5": { over: "over15", under: "under15" },
  "2.5": { over: "over25", under: "under25" },
  "3.5": { over: "over35", under: "under35" },
  "4.5": { over: "over45", under: "under45" },
  "5.5": { over: "over55", under: "under55" },
  "6.5": { over: "over65", under: "under65" },
};

const CORNERS_LINE_KEYS: Record<string, { over: string; under: string }> = {
  "8.5": { over: "o85", under: "u85" },
  "9.5": { over: "o95", under: "u95" },
  "10.5": { over: "o105", under: "u105" },
};

const CARDS_LINE_KEYS: Record<string, { over: string; under: string }> = {
  "3.5": { over: "o35", under: "u35" },
  "4.5": { over: "o45", under: "u45" },
};

function teamGoalsLineKeys(side: "home" | "away"): Record<string, { over: string; under: string }> {
  return {
    "0.5": { over: `${side}Over05`, under: `${side}Under05` },
    "1.5": { over: `${side}Over15`, under: `${side}Under15` },
    "2.5": { over: `${side}Over25`, under: `${side}Under25` },
  };
}

// "Home"/"Draw"/"Away" -> "h"/"d"/"a", for building HT/FT-style combo keys.
function threeWayLetter(raw: string): "h" | "d" | "a" | null {
  const key = raw.trim().toLowerCase();
  if (key === "home" || key === "1") return "h";
  if (key === "draw" || key === "x") return "d";
  if (key === "away" || key === "2") return "a";
  return null;
}

// Shared by totalGoals/corners/cards: groups an Over/Under market's odds by
// their `total` line, then fills in a fixed-line "ladder" (only the lines
// SportMonks actually confirms — an unrecognized line, e.g. a live
// mid-match re-price at a whole number, is silently skipped, same tolerant
// pattern pulsescore/football.ts's own corners/cards extraction already
// uses).
function fillLadder(
  odds: SportMonksOdd[],
  lineKeys: Record<string, { over: string; under: string }>,
): Record<string, number> {
  const byLine = new Map<string, { over: number | null; under: number | null }>();
  for (const o of odds) {
    const line = (o.total ?? "").trim();
    const val = oddsToNumber(o.value);
    if (!line || val === null) continue;
    const key = (o.label || "").trim().toLowerCase();
    if (key !== "over" && key !== "under") continue;
    const entry = byLine.get(line) ?? { over: null, under: null };
    if (key === "over") entry.over = val;
    else entry.under = val;
    byLine.set(line, entry);
  }
  const patch: Record<string, number> = {};
  for (const [line, keys] of Object.entries(lineKeys)) {
    const entry = byLine.get(line);
    if (entry?.over != null) patch[keys.over] = entry.over;
    if (entry?.under != null) patch[keys.under] = entry.under;
  }
  return patch;
}

export type SportMonksFootballOverride = {
  odds?: { home: number | null; draw: number | null; away: number | null };
  doubleChance?: { homeOrDraw: number | null; awayOrDraw: number | null; homeOrAway: number | null };
  bothTeamsScore?: { yes: number; no: number };
  drawNoBet?: { home: number | null; away: number | null };
  totalGoals?: Partial<Record<string, number>>;
  corners?: Partial<Record<string, number>>;
  cards?: Partial<Record<string, number>>;
  halfTime?: { home: number | null; draw: number | null; away: number | null };
  secondHalf?: { home: number | null; draw: number | null; away: number | null };
  correctScore?: Record<string, number>;
  htft?: Partial<Record<string, number>>;
  goalOddEven?: { odd: number; even: number };
  teamGoals?: Partial<Record<string, number>>;
  btts1H?: { yes: number; no: number };
  btts2H?: { yes: number; no: number };
  highestScoringHalf?: { first: number | null; second: number | null; equal: number | null };
};

export function extractSportMonksFootballOverride(
  fixture: SportMonksFixture,
  bookmakerId = 35,
): SportMonksFootballOverride {
  const out: SportMonksFootballOverride = {};

  // Fulltime Result -> 1X2
  const ftr = oddsByDeveloperName(fixture, "FULLTIME_RESULT", bookmakerId);
  if (ftr.length > 0) {
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const o of ftr) {
      const side = normalizeThreeWaySide(o);
      const val = oddsToNumber(o.value);
      if (val === null || !side) continue;
      if (side === "home") home = val;
      else if (side === "draw") draw = val;
      else away = val;
    }
    if (home !== null || draw !== null || away !== null) out.odds = { home, draw, away };
  }

  // Double Chance -> bet365 uses "1X"/"X2"/"12"; 1xbet (confirmed real,
  // 2026-08-29) uses "Home/Draw"/"Draw/Away"/"Home/Away" instead — same
  // market, different label vocabulary, same quirk already seen on
  // Fulltime Result.
  const dc = oddsByDeveloperName(fixture, "DOUBLE_CHANCE", bookmakerId);
  if (dc.length > 0) {
    let homeOrDraw: number | null = null;
    let awayOrDraw: number | null = null;
    let homeOrAway: number | null = null;
    for (const o of dc) {
      const key = (o.label || "").trim().toUpperCase();
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      if (key === "1X" || key === "HOME/DRAW") homeOrDraw = val;
      else if (key === "X2" || key === "DRAW/AWAY") awayOrDraw = val;
      else if (key === "12" || key === "HOME/AWAY") homeOrAway = val;
    }
    if (homeOrDraw !== null || awayOrDraw !== null || homeOrAway !== null)
      out.doubleChance = { homeOrDraw, awayOrDraw, homeOrAway };
  }

  // Both Teams To Score -> Yes/No
  const btts = oddsByDeveloperName(fixture, "BOTH_TEAMS_TO_SCORE", bookmakerId);
  if (btts.length > 0) {
    let yes: number | null = null;
    let no: number | null = null;
    for (const o of btts) {
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      const key = (o.label || "").trim().toLowerCase();
      if (key === "yes") yes = val;
      else if (key === "no") no = val;
    }
    if (yes !== null && no !== null) out.bothTeamsScore = { yes, no };
  }

  // Draw No Bet -> home/away
  const dnb = oddsByDeveloperName(fixture, "DRAW_NO_BET", bookmakerId);
  if (dnb.length > 0) {
    let home: number | null = null;
    let away: number | null = null;
    for (const o of dnb) {
      const side = normalizeThreeWaySide(o);
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      if (side === "home") home = val;
      else if (side === "away") away = val;
    }
    if (home !== null || away !== null) out.drawNoBet = { home, away };
  }

  // Total goals -> totalGoals ladder (0.5..6.5). bet365 splits this across
  // MATCH_GOALS (standard line) + ALTERNATIVE_MATCH_GOALS (extra lines);
  // 1xbet (confirmed real, 2026-08-29) uses a single GOALS_OVER_UNDER
  // market instead, same Over/Under + `total` shape — merged in here too.
  const totalGoalsOdds = [
    ...oddsByDeveloperName(fixture, "MATCH_GOALS", bookmakerId),
    ...oddsByDeveloperName(fixture, "ALTERNATIVE_MATCH_GOALS", bookmakerId),
    ...oddsByDeveloperName(fixture, "GOALS_OVER_UNDER", bookmakerId),
  ];
  if (totalGoalsOdds.length > 0) {
    const patch = fillLadder(totalGoalsOdds, TOTAL_GOALS_LINE_KEYS);
    if (Object.keys(patch).length > 0) out.totalGoals = patch;
  }

  // Total Corners -> corners ladder (8.5/9.5/10.5). 1xbet (confirmed real)
  // uses developer_name CORNER_MARKET instead of bet365's TOTAL_CORNERS,
  // same Over/Under + `total` shape.
  const cornersOdds = [
    ...oddsByDeveloperName(fixture, "TOTAL_CORNERS", bookmakerId),
    ...oddsByDeveloperName(fixture, "CORNER_MARKET", bookmakerId),
  ];
  if (cornersOdds.length > 0) {
    const patch = fillLadder(cornersOdds, CORNERS_LINE_KEYS);
    if (Object.keys(patch).length > 0) out.corners = patch;
  }

  // Number of Cards -> cards ladder (3.5/4.5)
  const cardsOdds = oddsByDeveloperName(fixture, "NUMBER_OF_CARDS", bookmakerId);
  if (cardsOdds.length > 0) {
    const patch = fillLadder(cardsOdds, CARDS_LINE_KEYS);
    if (Object.keys(patch).length > 0) out.cards = patch;
  }

  // Half Time Result -> 1X2 at HT, same "Home"/"Draw"/"Away" vocabulary as
  // Fulltime Result (confirmed real, 2026-08-29).
  const htr = oddsByDeveloperName(fixture, "HALF_TIME_RESULT", bookmakerId);
  if (htr.length > 0) {
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const o of htr) {
      const side = normalizeThreeWaySide(o);
      const val = oddsToNumber(o.value);
      if (val === null || !side) continue;
      if (side === "home") home = val;
      else if (side === "draw") draw = val;
      else away = val;
    }
    if (home !== null || draw !== null || away !== null) out.halfTime = { home, draw, away };
  }

  // 2nd Half Result -> 1X2 for the 2nd half only, same vocabulary.
  const shr = oddsByDeveloperName(fixture, "2ND_HALF_RESULT", bookmakerId);
  if (shr.length > 0) {
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const o of shr) {
      const side = normalizeThreeWaySide(o);
      const val = oddsToNumber(o.value);
      if (val === null || !side) continue;
      if (side === "home") home = val;
      else if (side === "draw") draw = val;
      else away = val;
    }
    if (home !== null || draw !== null || away !== null) out.secondHalf = { home, draw, away };
  }

  // Correct Score (full match) -> "H:A" labels (confirmed real, colon —
  // NOT bet365's "H-A" dash format), converted to the "H-A" key shape
  // settlement.ts/home.tsx's cs-{k} selection keys already expect.
  const csOdds = oddsByDeveloperName(fixture, "CORRECT_SCORE", bookmakerId);
  if (csOdds.length > 0) {
    const scores: Record<string, number> = {};
    for (const o of csOdds) {
      const label = (o.label || "").trim();
      const val = oddsToNumber(o.value);
      if (val === null || !/^\d+:\d+$/.test(label)) continue;
      scores[label.replace(":", "-")] = val;
    }
    if (Object.keys(scores).length > 0) out.correctScore = scores;
  }

  // Half Time/Full Time double -> 9-combo labels like "Home/Home",
  // "Draw/Away" (confirmed real) mapped to the htft-hh/htft-hd/... keys
  // settlement.ts already grades.
  const htftOdds = oddsByDeveloperName(fixture, "HT_FT_DOUBLE", bookmakerId);
  if (htftOdds.length > 0) {
    const patch: Record<string, number> = {};
    for (const o of htftOdds) {
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      const parts = (o.label || "").split("/");
      if (parts.length !== 2) continue;
      const ht = threeWayLetter(parts[0]!);
      const ft = threeWayLetter(parts[1]!);
      if (!ht || !ft) continue;
      patch[`${ht}${ft}`] = val;
    }
    if (Object.keys(patch).length > 0) out.htft = patch;
  }

  // Odd/Even (total match goals) -> "Odd"/"Even" labels.
  const oddEven = oddsByDeveloperName(fixture, "ODD_EVEN", bookmakerId);
  if (oddEven.length > 0) {
    let odd: number | null = null;
    let even: number | null = null;
    for (const o of oddEven) {
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      const key = (o.label || "").trim().toLowerCase();
      if (key === "odd") odd = val;
      else if (key === "even") even = val;
    }
    if (odd !== null && even !== null) out.goalOddEven = { odd, even };
  }

  // Home/Away Team Goals -> per-team totalGoals-style ladder (0.5/1.5/2.5).
  const homeTeamGoals = oddsByDeveloperName(fixture, "HOME_TEAM_GOALS", bookmakerId);
  const awayTeamGoals = oddsByDeveloperName(fixture, "AWAY_TEAM_GOALS", bookmakerId);
  const teamGoalsPatch: Record<string, number> = {};
  if (homeTeamGoals.length > 0) Object.assign(teamGoalsPatch, fillLadder(homeTeamGoals, teamGoalsLineKeys("home")));
  if (awayTeamGoals.length > 0) Object.assign(teamGoalsPatch, fillLadder(awayTeamGoals, teamGoalsLineKeys("away")));
  if (Object.keys(teamGoalsPatch).length > 0) out.teamGoals = teamGoalsPatch;

  // Both Teams To Score in 1st/2nd Half -> Yes/No, same shape as the
  // full-match Both Teams To Score market.
  const btts1H = oddsByDeveloperName(fixture, "BOTH_TEAMS_TO_SCORE_IN_1ST_HALF", bookmakerId);
  if (btts1H.length > 0) {
    let yes: number | null = null;
    let no: number | null = null;
    for (const o of btts1H) {
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      const key = (o.label || "").trim().toLowerCase();
      if (key === "yes") yes = val;
      else if (key === "no") no = val;
    }
    if (yes !== null && no !== null) out.btts1H = { yes, no };
  }
  const btts2H = oddsByDeveloperName(fixture, "BOTH_TEAMS_TO_SCORE_IN_2ND_HALF", bookmakerId);
  if (btts2H.length > 0) {
    let yes: number | null = null;
    let no: number | null = null;
    for (const o of btts2H) {
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      const key = (o.label || "").trim().toLowerCase();
      if (key === "yes") yes = val;
      else if (key === "no") no = val;
    }
    if (yes !== null && no !== null) out.btts2H = { yes, no };
  }

  // Half With Most Goals -> "1st Half"/"2nd Half"/"Draw" labels (confirmed
  // real) mapped onto the first/second/equal shape settlement.ts's
  // hsf-1/hsf-2/hsf-e keys already grade. Not present anywhere in the
  // PulseScore/bwin extraction this replaces — genuinely new real coverage,
  // not a port.
  const hsm = oddsByDeveloperName(fixture, "HALF_WITH_MOST_GOALS", bookmakerId);
  if (hsm.length > 0) {
    let first: number | null = null;
    let second: number | null = null;
    let equal: number | null = null;
    for (const o of hsm) {
      const val = oddsToNumber(o.value);
      if (val === null) continue;
      const key = (o.label || "").trim().toLowerCase();
      if (key === "1st half") first = val;
      else if (key === "2nd half") second = val;
      else if (key === "draw") equal = val;
    }
    if (first !== null || second !== null || equal !== null) {
      out.highestScoringHalf = { first, second, equal };
    }
  }

  return out;
}

// ── Fetching: current round discovery + upcoming fixtures ──────────────────
// SportMonks has no single "list upcoming fixtures across leagues" endpoint
// confirmed real yet — the real path found (2026-08-29, by trial against the
// live API): a league only exposes its `currentSeason` (note: the response
// key comes back lowercase, "currentseason", regardless of the include's
// casing — confirmed real), and a season only exposes ALL its `rounds`
// (each carrying its own `is_current` flag) — there's no direct
// "currentRound" relation on either League or Season (both attempts 404'd
// with "include ... does not exist"). So finding "what's the next round for
// this league" is a two-step lookup, cached below since a league's current
// round only changes roughly weekly.
//
// The include chain that then actually returns fixtures+odds
// (fixtures.odds.market;fixtures.odds.bookmaker;fixtures.participants;
// league.country) is confirmed real and within SportMonks' "max 2 nested
// includes per chain" limit (each semicolon-separated chain is checked
// independently — fixtures.odds.market is 2 levels deep, league.country is
// 1, etc.); the earlier single-call attempt at
// currentRound.fixtures.odds.market (3 levels in one chain) was rejected
// with exactly that error, confirming the limit is per-chain.

type SportMonksLeagueWithCurrentSeason = {
  id: number;
  currentseason?: { id: number };
};

type SportMonksSeasonWithRounds = {
  id: number;
  rounds?: Array<{ id: number; is_current: boolean; finished: boolean }>;
};

const CURRENT_ROUND_TTL_MS = 6 * 60 * 60 * 1000; // current round changes ~weekly at most
const currentRoundCache = new Map<number, { roundId: number | null; fetchedAt: number }>();

async function resolveCurrentRoundId(leagueId: number): Promise<number | null> {
  const cached = currentRoundCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < CURRENT_ROUND_TTL_MS) return cached.roundId;

  const league = await sportMonksGetWithRetry<{ data: SportMonksLeagueWithCurrentSeason }>(
    `/leagues/${leagueId}`,
    { include: "currentSeason" },
  );
  const seasonId = league?.data?.currentseason?.id;
  if (seasonId === undefined) {
    currentRoundCache.set(leagueId, { roundId: null, fetchedAt: Date.now() });
    return null;
  }

  const season = await sportMonksGetWithRetry<{ data: SportMonksSeasonWithRounds }>(
    `/seasons/${seasonId}`,
    { include: "rounds" },
  );
  const roundId = season?.data?.rounds?.find((r) => r.is_current)?.id ?? null;
  currentRoundCache.set(leagueId, { roundId, fetchedAt: Date.now() });
  return roundId;
}

type SportMonksRoundResponse = {
  id: number;
  league_id: number;
  finished: boolean;
  is_current: boolean;
  fixtures: SportMonksFixture[];
  league?: SportMonksLeagueRef;
};

export type SportMonksLeagueUpcoming = {
  leagueId: number;
  league?: SportMonksLeagueRef;
  fixtures: SportMonksFixture[];
};

const UPCOMING_TTL_MS = 5 * 60 * 1000;
const upcomingCache = new Map<number, { result: SportMonksLeagueUpcoming; fetchedAt: number }>();
const upcomingInFlight = new Map<number, Promise<SportMonksLeagueUpcoming>>();

async function fetchUpcomingForLeague(leagueId: number, bookmakerId: number): Promise<SportMonksLeagueUpcoming> {
  const roundId = await resolveCurrentRoundId(leagueId);
  if (roundId === null) return { leagueId, fixtures: [] };

  const round = await sportMonksGetWithRetry<{ data: SportMonksRoundResponse }>(
    `/rounds/${roundId}`,
    {
      include: "fixtures.odds.market;fixtures.odds.bookmaker;fixtures.participants;league.country",
      filters: `bookmakers:${bookmakerId}`,
    },
  );
  return {
    leagueId,
    league: round?.data?.league,
    fixtures: round?.data?.fixtures ?? [],
  };
}

/** Upcoming (not-yet-started) fixtures with 1xbet odds for one SportMonks
 * league, cached ~5 minutes. `leagueId` is SportMonks' own numeric id (see
 * GET /v3/football/leagues for the confirmed real list this account's plan
 * covers — Brazilian Série A is 648, Premier League 8, etc.). */
export async function getSportMonksFootballUpcomingForLeague(
  leagueId: number,
  bookmakerId = 35,
): Promise<SportMonksLeagueUpcoming> {
  const cached = upcomingCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < UPCOMING_TTL_MS) return cached.result;

  const inFlight = upcomingInFlight.get(leagueId);
  if (inFlight) return inFlight;

  const promise = fetchUpcomingForLeague(leagueId, bookmakerId)
    .then((result) => {
      upcomingCache.set(leagueId, { result, fetchedAt: Date.now() });
      return result;
    })
    .finally(() => {
      upcomingInFlight.delete(leagueId);
    });
  upcomingInFlight.set(leagueId, promise);
  return promise;
}

/** Same as getSportMonksFootballUpcomingForLeague, fanned out across
 * several leagues in parallel. A single league's fetch failure (network
 * error, league not on this plan, etc.) doesn't take the others down with
 * it — logged and just contributes an empty fixture list. */
export async function getSportMonksFootballUpcoming(
  leagueIds: number[],
  bookmakerId = 35,
): Promise<SportMonksLeagueUpcoming[]> {
  return Promise.all(
    leagueIds.map((leagueId) =>
      getSportMonksFootballUpcomingForLeague(leagueId, bookmakerId).catch(
        (): SportMonksLeagueUpcoming => ({ leagueId, fixtures: [] }),
      ),
    ),
  );
}

// Confirmed real (2026-08-29, GET /v3/football/leagues) — every league this
// account's SportMonks plan covers. Explicit user decision (2026-08-29):
// show all of them, no additional allow-list filtering the way football's
// PulseScore builders needed — this list is already curated by the
// subscription itself.
export const SPORTMONKS_FOOTBALL_LEAGUE_IDS = [
  2, 5, 8, 9, 24, 27, 72, 82, 85, 181, 208, 271, 301, 304, 384, 387, 390, 444,
  453, 462, 501, 564, 567, 570, 573, 591, 600, 603, 636, 648, 779, 944, 968,
  1034, 1116, 1122, 1328, 1371, 2286,
];

// ── Live fixtures ───────────────────────────────────────────────────────────
// Deliberately a SEPARATE, single global call — /livescores/inplay returns
// every fixture currently in play across every league in one request,
// confirmed real (2026-08-29) to accept the same combined include this file
// already uses for odds (fixtures.odds.market/bookmaker-equivalent, just
// without the "fixtures." prefix since this endpoint's fixtures ARE the top
// level) plus state/events/periods/scores. Polling this ONE endpoint every
// ~20s is drastically cheaper than re-polling all 39 leagues' round
// endpoints that often would be (39 leagues x 3 polls/min x 1440 min/day
// would blow well past the 50k/day plan budget on its own) — most of those
// 39 leagues have no live match at any given moment, so a single
// globally-scoped call is the only way to get near-real-time live data
// within budget.
const LIVE_TTL_MS = 20 * 1000;
let liveCache: { fixtures: SportMonksFixture[]; fetchedAt: number } | null = null;
let liveInFlight: Promise<SportMonksFixture[]> | null = null;

type SportMonksInplayFixture = SportMonksFixture & { league_id: number };

async function fetchLive(): Promise<SportMonksFixture[]> {
  const resp = await sportMonksGetWithRetry<{ data: SportMonksInplayFixture[] }>(
    "/livescores/inplay",
    {
      include:
        "state;events.type;events.player;periods;participants;scores;league.country;odds.market;odds.bookmaker",
    },
  );
  const allowed = new Set(SPORTMONKS_FOOTBALL_LEAGUE_IDS);
  return (resp?.data ?? []).filter((fx) => allowed.has(fx.league_id));
}

/** Every fixture currently in play, across every SportMonks league this plan
 * covers, cached ~20s. Real odds only for fixtures where the requested
 * bookmaker (1xbet, id 35) actually has live odds — extractSportMonksFootballOverride
 * already handles that gracefully (empty override, not an error). */
export async function getSportMonksFootballLive(): Promise<SportMonksFixture[]> {
  if (liveCache && Date.now() - liveCache.fetchedAt < LIVE_TTL_MS) return liveCache.fixtures;
  if (liveInFlight) return liveInFlight;

  const promise = fetchLive()
    .then((fixtures) => {
      liveCache = { fixtures, fetchedAt: Date.now() };
      return fixtures;
    })
    .catch(() => liveCache?.fixtures ?? [])
    .finally(() => {
      liveInFlight = null;
    });
  liveInFlight = promise;
  return promise;
}

/** Live score from a fixture's `scores` array — the "CURRENT" running
 * total (confirmed real, 2026-08-29: description "CURRENT" per participant,
 * distinct from "1ST_HALF"/"2ND_HALF"/"2ND_HALF_ONLY" period breakdowns).
 * Returns null (not 0-0) when no CURRENT score row exists yet — a genuine
 * 0-0 is a real, common football score and must not be confused with "no
 * data yet". */
export function getSportMonksFixtureScore(
  fixture: SportMonksFixture,
): { home: number; away: number } | null {
  let home: number | null = null;
  let away: number | null = null;
  for (const s of fixture.scores ?? []) {
    if (s.description !== "CURRENT") continue;
    if (s.score.participant === "home") home = s.score.goals;
    else if (s.score.participant === "away") away = s.score.goals;
  }
  return home !== null && away !== null ? { home, away } : null;
}

/** Live clock in whole minutes, from the currently-ticking period
 * (confirmed real: `periods[].ticking` marks exactly one period as
 * actively running; `.minutes` already accounts for stoppage time added
 * to earlier periods — e.g. a 2nd-half period starting at minute 46+ after
 * a 1st half that ran into injury time). Falls back to the last period in
 * the list (not ticking — half-time or full-time) when none is actively
 * ticking, so the clock still shows a sensible "45" during HT rather than 0. */
export function getSportMonksFixtureMinute(fixture: SportMonksFixture): number {
  const periods = fixture.periods ?? [];
  const ticking = periods.find((p) => p.ticking);
  const period = ticking ?? periods[periods.length - 1];
  return period && Number.isFinite(period.minutes) && period.minutes >= 0 ? period.minutes : 0;
}

/** True for a fixture that's actually being played right now (not
 * not-started, half-time, finished, or an unconfirmed/unknown state) —
 * confirmed real developer_name values: INPLAY_1ST_HALF, INPLAY_2ND_HALF.
 * Half-time (HT) is deliberately excluded — the clock isn't running and
 * nothing new can happen, but the match is still live for suspension
 * purposes (see isSportMonksFixtureFinished for the separate FT check). */
export function isSportMonksFixtureLive(fixture: SportMonksFixture): boolean {
  const dn = fixture.state?.developer_name;
  return dn === "INPLAY_1ST_HALF" || dn === "INPLAY_2ND_HALF" || dn === "HT";
}

/** True once a fixture is confirmed over (state.developer_name "FT",
 * confirmed real) — the signal this codebase's football settlement trigger
 * needs (see buildFootballLiveFromSportMonks in matches.ts). Deliberately
 * narrow: an unconfirmed/unknown state is never treated as finished, so an
 * unrecognized real state this hasn't seen yet fails safe (stays "not
 * finished, not live either") rather than risking a false settlement. */
export function isSportMonksFixtureFinished(fixture: SportMonksFixture): boolean {
  return fixture.state?.developer_name === "FT";
}

/** Count of real REDCARD events for one side (confirmed real developer_name,
 * 2026-08-29) — used to detect a NEW red card tick-to-tick the same way
 * this codebase's PulseScore+API-Football live builder does, just off
 * SportMonks' own events instead of a second cross-referenced provider. */
export function countSportMonksRedCards(
  fixture: SportMonksFixture,
  side: "home" | "away",
): number {
  const participant = fixture.participants?.find((p) => p.meta?.location === side);
  if (!participant) return 0;
  return (fixture.events ?? []).filter(
    (e) => e.type?.developer_name === "REDCARD" && e.participant_id === participant.id,
  ).length;
}
