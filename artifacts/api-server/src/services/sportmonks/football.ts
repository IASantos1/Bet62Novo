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
  meta?: { location?: "home" | "away" };
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

  return out;
}
