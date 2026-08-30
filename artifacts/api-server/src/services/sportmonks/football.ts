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
// Real-world quirks found comparing bookmakers/leagues within SportMonks (historic):
// - Fulltime Result: "1"/"X"/"2" labels with the team name in `name`
//   (bet365, Bodø/Glimt sample) vs "Home"/"Draw"/"Away" labels with `name`
//   null (bet365 in both Brazilian and European leagues).
//   `original_label` (present on some rows, absent on others) is the one
//   field seen so far consistently normalized to "1"/"Draw"/"2" — used as
//   the primary key, falling back to normalizing `label` otherwise.
// - Double Chance: bet365 uses "1X"/"X2"/"12"; other bookmakers use
//   "Home/Draw"/"Draw/Away"/"Home/Away" instead — same market, different
//   vocabulary.
// - Total goals: bet365 splits MATCH_GOALS (standard line) +
//   ALTERNATIVE_MATCH_GOALS (extra lines).
// - Total corners: bet365 uses TOTAL_CORNERS standard.
// - Draw No Bet: not offered by every bookmaker for lower-coverage
//   competitions in confirmed samples — stays unset, same tolerant
//   "real absence, not a bug" behavior used throughout this codebase.
//
// USER HARD RULE (2026-08-30, VERBATIM): "SPORTMONKS NAO ESTA DISPONIVEM
// PARA ME A 1XBET E SIM SO A BET365 PARA PRE JOGOS E AO VIVO. NAO MISTURAR
// BOOKMAKERS DA SPORTMONKS DEPENDECIA SO DA BET365." Football data and all
// odds requests from SportMonks are EXCLUSIVE to bet365 (bookmaker_id = 2).
// 1xbet (id 35) belongs to PulseScore only and is NEVER requested here.
//
// NOT yet implemented (real data confirmed to exist — e.g. Half Time/Full
// Time, Correct Score, Goalscorers, Asian Handicap, Odd/Even, and 100+ more
// markets seen in the unfiltered sample — but out of scope for this first
// pass; see htft/correctScore/exactGoals/firstGoal/secondHalf/goalOddEven/
// cleanSheet/teamGoals/anytimeGoalscorer etc. in PulseScoreFootballOverride
// for the full target list still open).

import { sportMonksGetWithRetry } from "./client.js";
import { logger } from "../../lib/logger.js";

export type SportMonksOdd = {
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  name: string | null;
  original_label?: string | null;
  total?: string | null;
  handicap?: string | null;
  suspended?: boolean | null;
  stopped?: boolean | null;
  participant_id?: number | null;
  latest_bookmaker_update?: string | null;
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

// Confirmed real developer_name values (2026-08-29, real in-play samples):
// GOAL (14), PENALTY (16, a goal scored from the spot — confirmed real via
// a genuine "1st Penalty" event that moved the scoreboard, same as a GOAL,
// so it's included alongside GOAL in matches.ts's live events filter),
// OWNGOAL (15), SUBSTITUTION (18), YELLOWCARD (19), REDCARD (20). A
// VAR-review event type and a missed-penalty event type were NOT observed
// in any sample seen so far — their type_id/developer_name are NOT
// confirmed, so nothing in this codebase keys off them yet; only real,
// seen event types are handled.
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

// The confirmed-real event developer_name values (see SportMonksEvent's own
// comment above) worth showing in the live "Eventos" feed — goals (regular
// and penalty), own goals, substitutions, and cards. Centralized here so
// matches.ts's buildFootballLiveFromSportMonks doesn't inline this list
// (previously missed PENALTY entirely — audit finding, 2026-08-29: a real
// penalty goal moved the scoreboard but never appeared in the events feed
// shown to users, since the filter only knew about GOAL).
const FOOTBALL_LIVE_DISPLAY_EVENT_TYPES = new Set([
  "GOAL",
  "PENALTY",
  "OWNGOAL",
  "SUBSTITUTION",
  "YELLOWCARD",
  "REDCARD",
]);

export function isFootballLiveDisplayEvent(developerName: string | undefined | null): boolean {
  return !!developerName && FOOTBALL_LIVE_DISPLAY_EVENT_TYPES.has(developerName);
}

// Confirmed real (2026-08-29, /fixtures/{id}?include=statistics.type, a
// finished match sample): `location` is "home"/"away", `data.value` is the
// stat's numeric total for that side. type_id 34 = CORNERS, type_id 84 =
// YELLOWCARDS — both confirmed present and, per a separate real /livescores/
// inplay?include=statistics.type sample, updating live during in-progress
// matches (not just post-match). No REDCARDS stat type has been observed in
// any real sample (the one finished match checked had no red cards) — red
// card counts are deliberately NOT read from here; countSportMonksRedCards's
// own REDCARD event count (confirmed real) is used instead.
export type SportMonksStatistic = {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  location: "home" | "away";
  data: { value: number };
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
  statistics?: SportMonksStatistic[];
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
      // Confirmed real (2026-08-30, Bundesliga live FC Augsburg v
      // Schalke 04, bet365): when a goal or market re-price is in
      // progress bet365 momentarily marks just ONE selection (usually
      // the favorite HOME) with `suspended=true` while still carrying
      // the real numeric odds in the `value` field and keeping DRAW/
      // AWAY with `suspended=null`. The OLD filter required ALL sides
      // to have `!suspended` → when just the HOME side flipped to
      // `true` during the 72nd-minute goal flash, odds extraction
      // returned only [Draw, Away] → `override.odds = { home:null,
      // draw:8.25, away:41.00 }`. Then nonNullPatch skipped HOME,
      // makeOddsFromTeams generated a synthetic HOME odd <1.15 from
      // reverse head-to-head, home.tsx L10317's "<1.15" guard returns
      // "--" — exactly the user-reported "--" on Augsburg home. NEW
      // rule: `suspended=true` is STILL an odds row with a real price;
      // only drop rows where the market is PERMANENTLY stopped
      // (stopped=true, different signal: means the market closed, not
      // just mid-flicker). Suspension-as-a-market-level flag is read
      // separately in matches.ts via bookmakerSuspended check.
      !o.stopped,
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

// Real SportMonks v3 (confirmed live fixture per-fixture endpoint 19621836
// and /rounds/396698 2026-08-30) exposes one or more distinct market.id
// rows per (bookmaker, developer_name) pair — e.g. bet365 (id 2) sometimes
// emits TWO parallel FULLTIME_RESULT markets (different market.id) that
// update independently ~300ms out of sync during a re-price/goal flash.
// Without dedup, the raw for-of loop in extractSportMonksFootballOverride
// overwrites home/draw/away with whichever market row happened to land
// last in the HTTP array this tick — causing exactly the user-reported
// symptom "odds 1x2 DUPLICADAS, aparece umas e quando atualiza aparece
// outras" (same side bouncing between two different prices, each one a
// real odds number from a different parallel market).
//
// Fix: group odds by a stable per-outcome key, then keep ONLY the row with
// the newest `latest_bookmaker_update` timestamp per group — the "latest
// price only" rule, same behaviour a real bookie terminal shows. The
// function is tolerant to missing dates (falls back to array order /
// whichever row came last when timestamps are identical).
function latestOddsByKey<T extends SportMonksOdd>(
  odds: T[],
  keyFn: (o: T) => string | null,
): T[] {
  const best = new Map<string, { odd: T; ts: number }>();
  for (const o of odds) {
    const k = keyFn(o);
    if (k == null) continue;
    const d = (o as unknown as { latest_bookmaker_update?: string }).latest_bookmaker_update;
    const ts = d ? new Date(d).getTime() : 0;
    const prev = best.get(k);
    if (!prev || ts >= prev.ts) best.set(k, { odd: o, ts });
  }
  return Array.from(best.values()).map((x) => x.odd);
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
  bookmakerId = 2,
): SportMonksFootballOverride {
  const out: SportMonksFootballOverride = {};
  // The user's actual SportMonks subscription for football carries ONLY
  // bet365 (bookmaker_id 2) live + pre-match odds; 1xbet (35) data lives
  // exclusively on PulseScore (which intentionally isn't mixed into the
  // SportMonks builder per explicit user instruction — 2026-08-30). So we
  // read bookmakerId (default 2 = bet365) ONLY here, no silent fallback to
  // any other bookmaker id inside extraction.
  const chosenBookmakerIds = [bookmakerId];

  const ftrRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "FULLTIME_RESULT", bookmakerId);
  const ftrRows: SportMonksOdd[] = latestOddsByKey(ftrRowsRaw, (o) => normalizeThreeWaySide(o));
  const dcRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "DOUBLE_CHANCE", bookmakerId);
  const dcRows: SportMonksOdd[] = latestOddsByKey(dcRowsRaw, (o) => {
    const k = (o.label || "").trim().toUpperCase().replace(/\s+/g, "");
    if (k === "1X" || k === "HOME/DRAW") return "1x";
    if (k === "X2" || k === "DRAW/AWAY") return "x2";
    if (k === "12" || k === "HOME/AWAY") return "12";
    return null;
  });
  const btsRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "BOTH_TEAMS_SCORE", bookmakerId);
  const btsRows: SportMonksOdd[] = latestOddsByKey(btsRowsRaw, (o) => {
    const k = (o.label || "").trim().toLowerCase();
    if (k === "yes" || k === "y" || k === "sim") return "yes";
    if (k === "no" || k === "n" || k === "nao" || k === "não") return "no";
    return null;
  });
  const dnbRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "DRAW_NO_BET", bookmakerId);
  const dnbRows: SportMonksOdd[] = latestOddsByKey(dnbRowsRaw, (o) => {
    const side = normalizeThreeWaySide(o);
    if (side === "home" || side === "away") return side;
    return null;
  });
  const tgRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "TOTAL_GOALS", bookmakerId);
  const tgRows: SportMonksOdd[] = latestOddsByKey(tgRowsRaw, (o) => {
    const line = (o.total ?? "").trim();
    const key = (o.label || "").trim().toLowerCase();
    if (!line || (key !== "over" && key !== "under")) return null;
    return `${line}:${key}`;
  });
  const crRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "TOTAL_CORNERS", bookmakerId);
  const crRows: SportMonksOdd[] = latestOddsByKey(crRowsRaw, (o) => {
    const line = (o.total ?? "").trim();
    const key = (o.label || "").trim().toLowerCase();
    if (!line || (key !== "over" && key !== "under")) return null;
    return `${line}:${key}`;
  });
  const cdRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "TOTAL_CARDS", bookmakerId);
  const cdRows: SportMonksOdd[] = latestOddsByKey(cdRowsRaw, (o) => {
    const line = (o.total ?? "").trim();
    const key = (o.label || "").trim().toLowerCase();
    if (!line || (key !== "over" && key !== "under")) return null;
    return `${line}:${key}`;
  });
  const htRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "FIRST_HALF_RESULT", bookmakerId);
  const htRows: SportMonksOdd[] = latestOddsByKey(htRowsRaw, (o) => normalizeThreeWaySide(o));
  const shRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "SECOND_HALF_RESULT", bookmakerId);
  const shRows: SportMonksOdd[] = latestOddsByKey(shRowsRaw, (o) => normalizeThreeWaySide(o));
  const csRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "CORRECT_SCORE", bookmakerId);
  const csRows: SportMonksOdd[] = latestOddsByKey(csRowsRaw, (o) => (o.label || "").trim().toLowerCase());
  const htftRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "HALF_TIME_FULL_TIME", bookmakerId);
  const htftRows: SportMonksOdd[] = latestOddsByKey(htftRowsRaw, (o) => (o.label || "").trim().toUpperCase().replace(/\s+/g, ""));
  const goeRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "GOALS_ODD_EVEN", bookmakerId);
  const goeRows: SportMonksOdd[] = latestOddsByKey(goeRowsRaw, (o) => {
    const k = (o.label || "").trim().toLowerCase();
    if (k === "odd" || k === "impar" || k === "ímpar") return "odd";
    if (k === "even" || k === "par") return "even";
    return null;
  });
  const tg2RowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "TEAM_TOTAL_GOALS", bookmakerId);
  const tg2Rows: SportMonksOdd[] = latestOddsByKey(tg2RowsRaw, (o) => {
    const line = (o.total ?? "").trim();
    const key = (o.label || "").trim().toLowerCase();
    if (!line || (key !== "over" && key !== "under")) return null;
    const pid = String(o.participant_id ?? "x");
    return `${pid}:${line}:${key}`;
  });
  const bts1hRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "FIRST_HALF_BOTH_TEAMS_SCORE", bookmakerId);
  const bts1hRows: SportMonksOdd[] = latestOddsByKey(bts1hRowsRaw, (o) => {
    const k = (o.label || "").trim().toLowerCase();
    if (k === "yes" || k === "y" || k === "sim") return "yes";
    if (k === "no" || k === "n" || k === "nao" || k === "não") return "no";
    return null;
  });
  const bts2hRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "SECOND_HALF_BOTH_TEAMS_SCORE", bookmakerId);
  const bts2hRows: SportMonksOdd[] = latestOddsByKey(bts2hRowsRaw, (o) => {
    const k = (o.label || "").trim().toLowerCase();
    if (k === "yes" || k === "y" || k === "sim") return "yes";
    if (k === "no" || k === "n" || k === "nao" || k === "não") return "no";
    return null;
  });
  const hshRowsRaw: SportMonksOdd[] = oddsByDeveloperName(fixture, "HIGHEST_SCORING_HALF", bookmakerId);
  const hshRows: SportMonksOdd[] = latestOddsByKey(hshRowsRaw, (o) => {
    const k = (o.label || "").trim().toLowerCase();
    if (k.includes("first") || k === "1h" || k.startsWith("1")) return "first";
    if (k.includes("second") || k === "2h" || k.startsWith("2")) return "second";
    if (k.includes("equal") || k.includes("draw") || k === "e" || k.includes("tie")) return "equal";
    return null;
  });

  // Fulltime Result -> 1X2
  const ftr = ftrRows;
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
  const dc = dcRows;
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
  const btts = btsRows.length > 0
    ? btsRows
    : oddsByDeveloperName(fixture, "BOTH_TEAMS_TO_SCORE", bookmakerId);
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
  const dnb = dnbRows;
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
  // MATCH_GOALS (standard line) + ALTERNATIVE_MATCH_GOALS (extra lines).
  const totalGoalsOdds = tgRows.length > 0
    ? tgRows
    : [
        ...oddsByDeveloperName(fixture, "MATCH_GOALS", bookmakerId),
        ...oddsByDeveloperName(fixture, "ALTERNATIVE_MATCH_GOALS", bookmakerId),
        ...oddsByDeveloperName(fixture, "GOALS_OVER_UNDER", bookmakerId),
      ];
  if (totalGoalsOdds.length > 0) {
    const patch = fillLadder(totalGoalsOdds, TOTAL_GOALS_LINE_KEYS);
    if (Object.keys(patch).length > 0) out.totalGoals = patch;
  }

  // Total Corners -> corners ladder (8.5/9.5/10.5)
  const cornersOdds = crRows.length > 0
    ? crRows
    : [
        ...oddsByDeveloperName(fixture, "TOTAL_CORNERS", bookmakerId),
        ...oddsByDeveloperName(fixture, "CORNER_MARKET", bookmakerId),
      ];
  if (cornersOdds.length > 0) {
    const patch = fillLadder(cornersOdds, CORNERS_LINE_KEYS);
    if (Object.keys(patch).length > 0) out.corners = patch;
  }

  // Number of Cards -> cards ladder (3.5/4.5)
  const cardsOdds = cdRows.length > 0
    ? cdRows
    : oddsByDeveloperName(fixture, "NUMBER_OF_CARDS", bookmakerId);
  if (cardsOdds.length > 0) {
    const patch = fillLadder(cardsOdds, CARDS_LINE_KEYS);
    if (Object.keys(patch).length > 0) out.cards = patch;
  }

  // Half Time Result -> 1X2 at HT, same "Home"/"Draw"/"Away" vocabulary as
  // Fulltime Result (confirmed real, 2026-08-29).
  const htr = htRows.length > 0
    ? htRows
    : oddsByDeveloperName(fixture, "HALF_TIME_RESULT", bookmakerId);
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
  const shr = shRows.length > 0
    ? shRows
    : oddsByDeveloperName(fixture, "2ND_HALF_RESULT", bookmakerId);
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
  const csOdds = csRows.length > 0
    ? csRows
    : oddsByDeveloperName(fixture, "CORRECT_SCORE", bookmakerId);
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
  const htftOdds = htftRows.length > 0
    ? htftRows
    : oddsByDeveloperName(fixture, "HT_FT_DOUBLE", bookmakerId);
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
  const oddEven = goeRows.length > 0
    ? goeRows
    : oddsByDeveloperName(fixture, "ODD_EVEN", bookmakerId);
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
  const tgExtra = tg2Rows.length > 0
    ? tg2Rows
    : oddsByDeveloperName(fixture, "TEAM_TOTAL_GOALS", bookmakerId);
  const teamGoalsPatch: Record<string, number> = {};
  if (homeTeamGoals.length > 0) Object.assign(teamGoalsPatch, fillLadder(homeTeamGoals, teamGoalsLineKeys("home")));
  if (awayTeamGoals.length > 0) Object.assign(teamGoalsPatch, fillLadder(awayTeamGoals, teamGoalsLineKeys("away")));
  if (tgExtra.length > 0) Object.assign(teamGoalsPatch, fillLadder(tgExtra, teamGoalsLineKeys("home")));
  if (Object.keys(teamGoalsPatch).length > 0) out.teamGoals = teamGoalsPatch;

  // Both Teams To Score in 1st/2nd Half -> Yes/No, same shape as the
  // full-match Both Teams To Score market.
  const btts1H = bts1hRows.length > 0
    ? bts1hRows
    : oddsByDeveloperName(fixture, "BOTH_TEAMS_TO_SCORE_IN_1ST_HALF", bookmakerId);
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
  const btts2H = bts2hRows.length > 0
    ? bts2hRows
    : oddsByDeveloperName(fixture, "BOTH_TEAMS_TO_SCORE_IN_2ND_HALF", bookmakerId);
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
  const hsm = hshRows.length > 0
    ? hshRows
    : oddsByDeveloperName(fixture, "HALF_WITH_MOST_GOALS", bookmakerId);
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

/** Upcoming (not-yet-started) fixtures with bet365 (bookmaker_id 2) odds
 * for one SportMonks league, cached ~5 minutes. User EXPLICIT decision
 * 2026-08-30: SportMonks football (prematch + live) is EXCLUSIVE to
 * bet365 (id 2) — 1xbet (id 35) only exists on PulseScore and must NEVER
 * be requested from SportMonks (returns 0 rows → Poisson fake fallbacks).
 * `leagueId` is SportMonks' own numeric id (see GET /v3/football/leagues
 * for the confirmed real list this account's plan covers — Brazilian
 * Série A is 648, Premier League 8, etc.). */
export async function getSportMonksFootballUpcomingForLeague(
  leagueId: number,
  bookmakerId = 2,
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
  bookmakerId = 2,
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

// ── Team schedule (upcoming fixtures + head-to-head) ────────────────────────
// Confirmed real (2026-08-29), GET /v3/football/schedules/teams/{id}: an
// array of "stages" (e.g. domestic league regular season, a continental
// cup's group stage, its knockout rounds), each with `rounds[].fixtures`
// AND, for two-legged knockout ties, a parallel `aggregates[].fixtures` —
// a single leg can appear in BOTH (confirmed real: a Copa Libertadores
// group-stage leg showed up under both its round and its aggregate), so
// flattening dedupes by fixture id. Each fixture here carries the same
// `participants`/`scores` shape already confirmed and used throughout this
// file for live/upcoming odds fixtures — just without odds (this endpoint
// doesn't return them). No `league` object is included on these fixtures
// (only `league_id`), so head-to-head/upcoming entries built from this
// endpoint leave the league name blank rather than guess one — a real
// absence, same tolerant pattern used elsewhere in this file.
type SportMonksScheduleFixtureGroup = { fixtures?: SportMonksFixture[] };
type SportMonksScheduleStage = {
  rounds?: SportMonksScheduleFixtureGroup[];
  aggregates?: SportMonksScheduleFixtureGroup[];
};
type SportMonksScheduleResponse = { data?: SportMonksScheduleStage[] };

const TEAM_SCHEDULE_TTL_MS = 15 * 60 * 1000;
const teamScheduleCache = new Map<number, { fixtures: SportMonksFixture[]; fetchedAt: number }>();
const teamScheduleInFlight = new Map<number, Promise<SportMonksFixture[]>>();

async function fetchTeamSchedule(teamId: number): Promise<SportMonksFixture[]> {
  const resp = await sportMonksGetWithRetry<SportMonksScheduleResponse>(
    `/schedules/teams/${teamId}`,
  );
  const byId = new Map<number, SportMonksFixture>();
  for (const stage of resp?.data ?? []) {
    for (const group of [...(stage.rounds ?? []), ...(stage.aggregates ?? [])]) {
      for (const fx of group.fixtures ?? []) byId.set(fx.id, fx);
    }
  }
  return Array.from(byId.values());
}

/** Every fixture (past and future, across every competition) for one
 * SportMonks team id, cached ~15 minutes — the flattened, deduped raw
 * material for both getSportMonksTeamUpcoming and
 * getSportMonksTeamHeadToHead below. */
export async function getSportMonksTeamSchedule(teamId: number): Promise<SportMonksFixture[]> {
  const cached = teamScheduleCache.get(teamId);
  if (cached && Date.now() - cached.fetchedAt < TEAM_SCHEDULE_TTL_MS) return cached.fixtures;

  const inFlight = teamScheduleInFlight.get(teamId);
  if (inFlight) return inFlight;

  const promise = fetchTeamSchedule(teamId)
    .then((fixtures) => {
      teamScheduleCache.set(teamId, { fixtures, fetchedAt: Date.now() });
      return fixtures;
    })
    .catch(() => teamScheduleCache.get(teamId)?.fixtures ?? [])
    .finally(() => {
      teamScheduleInFlight.delete(teamId);
    });
  teamScheduleInFlight.set(teamId, promise);
  return promise;
}

/** Pure filter/sort step behind getSportMonksTeamUpcoming — split out so it
 * can be unit tested against a real schedule sample without mocking the
 * network fetch. */
export function filterUpcomingFixtures(
  fixtures: SportMonksFixture[],
  nowSeconds: number,
  limit: number,
): SportMonksFixture[] {
  return fixtures
    .filter((fx) => fx.state_id === 1 && fx.starting_at_timestamp > nowSeconds)
    .sort((a, b) => a.starting_at_timestamp - b.starting_at_timestamp)
    .slice(0, limit);
}

/** A team's next `limit` not-yet-started fixtures (state_id 1, confirmed
 * real "NS"), earliest first — "Próximos Jogos". */
export async function getSportMonksTeamUpcoming(
  teamId: number,
  limit = 5,
): Promise<SportMonksFixture[]> {
  const schedule = await getSportMonksTeamSchedule(teamId);
  return filterUpcomingFixtures(schedule, Date.now() / 1000, limit);
}

/** Pure filter/sort step behind getSportMonksTeamHeadToHead — split out so
 * it can be unit tested against a real schedule sample without mocking the
 * network fetch. */
export function filterHeadToHeadFixtures(
  fixtures: SportMonksFixture[],
  opponentId: number,
  limit: number,
): SportMonksFixture[] {
  return fixtures
    .filter(
      (fx) =>
        fx.state_id === 5 &&
        (fx.participants ?? []).some((p) => p.id === opponentId),
    )
    .sort((a, b) => b.starting_at_timestamp - a.starting_at_timestamp)
    .slice(0, limit);
}

/** Real past meetings between two SportMonks team ids (state_id 5,
 * confirmed real "FT"), most recent first — sourced from `teamId`'s own
 * schedule filtered to fixtures where `opponentId` is the other
 * participant. Only covers the seasons/competitions this endpoint returns
 * for `teamId` (confirmed real: the current season across every
 * competition the team is in) — not a multi-year archive. */
export async function getSportMonksTeamHeadToHead(
  teamId: number,
  opponentId: number,
  limit = 10,
): Promise<SportMonksFixture[]> {
  const schedule = await getSportMonksTeamSchedule(teamId);
  return filterHeadToHeadFixtures(schedule, opponentId, limit);
}

const FIXTURE_LOOKUP_TTL_MS = 15 * 60 * 1000;
const fixtureLookupCache = new Map<number, { fixture: SportMonksFixture | null; fetchedAt: number }>();

/** A single fixture by its SportMonks id, with participants (confirmed real
 * shape, used throughout this file already) — the resolve step for turning
 * a `sportmonks-football-{id}` matchId back into real home/away team ids
 * for getSportMonksTeamUpcoming/getSportMonksTeamHeadToHead. Cached ~15
 * minutes since participants/team ids never change after a fixture is
 * scheduled. */
export async function getSportMonksFixtureById(id: number): Promise<SportMonksFixture | null> {
  const cached = fixtureLookupCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < FIXTURE_LOOKUP_TTL_MS) return cached.fixture;

  const resp = await sportMonksGetWithRetry<{ data: SportMonksFixture }>(`/fixtures/${id}`, {
    include: "participants",
  });
  const fixture = resp?.data ?? null;
  fixtureLookupCache.set(id, { fixture, fetchedAt: Date.now() });
  return fixture;
}

// ── Player profile ───────────────────────────────────────────────────────────
// Confirmed real (2026-08-29), GET /v3/football/players/{id} — Jonathan
// Calleri (São Paulo). Two DIFFERENT stat-value shapes exist in this one
// response and must not be conflated:
//   - `statistics[].details[]` (season/competition aggregates): `value` is
//     an object whose shape varies per stat — most are `{total}`, but e.g.
//     GOALS is `{total, goals, penalties}`, PENALTIES is
//     `{total, won, scored, committed, saved, missed}`, YELLOWCARDS is
//     `{total, home, away}`, RATING is `{average, highest, lowest}`.
//   - `latest[].details[]` (per-match lineup stats): `data` is always
//     `{value: number | boolean}` — a single flat value, no sub-fields.
// Confirmed real stat type_ids used here: GOALS 52, ASSISTS 79,
// YELLOWCARDS 84, REDCARDS 83, APPEARANCES 321, MINUTES_PLAYED 119,
// RATING 118. `latest[]` entries can have `fixture: null` (a match
// SportMonks hasn't backfilled fixture data for yet) — filtered out below,
// not guessed at.
export type SportMonksPlayerStatDetail = {
  type_id: number;
  value: Record<string, number> | number;
  type: { id: number; name: string; code: string; developer_name: string };
};

export type SportMonksPlayerSeasonStats = {
  id: number;
  team_id: number;
  season_id: number;
  details?: SportMonksPlayerStatDetail[];
  team?: { id: number; name: string; image_path?: string };
  season?: { id: number; name: string; is_current?: boolean; league?: { id: number; name: string } };
};

export type SportMonksPlayerMatchDetail = {
  type_id: number;
  data: { value: number | boolean | string };
  type: { id: number; name: string; code: string; developer_name: string };
};

export type SportMonksPlayerLatestMatch = {
  fixture_id: number;
  team_id: number;
  fixture: SportMonksFixture | null;
  details?: SportMonksPlayerMatchDetail[];
};

export type SportMonksPlayer = {
  id: number;
  common_name?: string;
  display_name?: string;
  name?: string;
  image_path?: string;
  height?: number;
  weight?: number;
  date_of_birth?: string;
  nationality?: { id: number; name: string; image_path?: string };
  detailedposition?: { id: number; name: string; developer_name: string };
  statistics?: SportMonksPlayerSeasonStats[];
  latest?: SportMonksPlayerLatestMatch[];
};

const PLAYER_PROFILE_TTL_MS = 30 * 60 * 1000;
const playerProfileCache = new Map<number, { player: SportMonksPlayer | null; fetchedAt: number }>();

/** A player's full profile — bio, per-season/competition career stats, and
 * recent match-by-match performance. Uses the exact real confirmed include
 * chain (verbatim from a real request, 2026-08-29) rather than a trimmed
 * guess, since nested-include depth limits are endpoint-specific and this
 * combination is the one actually confirmed to work. Cached ~30 minutes. */
export async function getSportMonksPlayerProfile(playerId: number): Promise<SportMonksPlayer | null> {
  const cached = playerProfileCache.get(playerId);
  if (cached && Date.now() - cached.fetchedAt < PLAYER_PROFILE_TTL_MS) return cached.player;

  const resp = await sportMonksGetWithRetry<{ data: SportMonksPlayer }>(`/players/${playerId}`, {
    include:
      "nationality;detailedPosition;statistics.details.type;metadata.type;trophies.trophy;trophies.team;teams.team;statistics.team;statistics.season.league;latest.fixture.participants;latest.fixture.league;latest.fixture.scores;latest.details.type;trophies.league;trophies.season",
  });
  const player = resp?.data ?? null;
  playerProfileCache.set(playerId, { player, fetchedAt: Date.now() });
  return player;
}

/** Pure extraction step behind the player-profile route — reads one stat's
 * total from the CURRENT season's aggregate row (season.is_current), split
 * out so it's unit testable against a real profile sample without mocking
 * the network fetch. Returns null when there's no current-season row or
 * the stat is simply absent for it (a real absence — e.g. a keeper with no
 * GOALS entry — not guessed as zero). */
export function getPlayerCurrentSeasonStatTotal(
  player: SportMonksPlayer,
  statTypeId: number,
): number | null {
  const row = (player.statistics ?? []).find((s) => s.season?.is_current === true);
  if (!row) return null;
  const detail = (row.details ?? []).find((d) => d.type_id === statTypeId);
  if (!detail) return null;
  if (typeof detail.value === "number") return detail.value;
  const total = detail.value?.total;
  return typeof total === "number" ? total : null;
}

export type PlayerRecentMatch = {
  fixtureId: number;
  date: string;
  opponent: string;
  competition: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number | null;
  rating: number | null;
};

/** Pure extraction step behind the player-profile route — turns `latest[]`
 * (real per-match lineup stats, `data.value` flat-number shape) into a
 * clean recent-matches list, most recent first. Entries with `fixture: null`
 * (confirmed real — SportMonks hasn't backfilled that match yet) are
 * skipped rather than guessed at. */
export function getPlayerRecentMatches(player: SportMonksPlayer, limit = 10): PlayerRecentMatch[] {
  const withFixture = (player.latest ?? []).filter(
    (m): m is SportMonksPlayerLatestMatch & { fixture: SportMonksFixture } => m.fixture !== null,
  );
  withFixture.sort((a, b) => b.fixture.starting_at_timestamp - a.fixture.starting_at_timestamp);

  return withFixture.slice(0, limit).map((m) => {
    const fx = m.fixture;
    const homeP = fx.participants?.find((p) => p.meta?.location === "home");
    const awayP = fx.participants?.find((p) => p.meta?.location === "away");
    const isHome = homeP?.id === m.team_id;
    const opponent = (isHome ? awayP?.name : homeP?.name) ?? "";
    const score = getSportMonksFixtureScore(fx);
    const teamScore = score ? (isHome ? score.home : score.away) : null;
    const opponentScore = score ? (isHome ? score.away : score.home) : null;
    const numFor = (typeId: number): number => {
      const d = (m.details ?? []).find((x) => x.type_id === typeId);
      return typeof d?.data.value === "number" ? d.data.value : 0;
    };
    const numOrNullFor = (typeId: number): number | null => {
      const d = (m.details ?? []).find((x) => x.type_id === typeId);
      return typeof d?.data.value === "number" ? d.data.value : null;
    };
    return {
      fixtureId: fx.id,
      date: fx.starting_at ? fx.starting_at.slice(0, 10) : "",
      opponent,
      competition: fx.league?.name ?? "",
      isHome,
      teamScore,
      opponentScore,
      goals: numFor(52),
      assists: numFor(79),
      yellowCards: numFor(84),
      redCards: numFor(83),
      minutesPlayed: numOrNullFor(119),
      rating: numOrNullFor(118),
    };
  });
}

// ── Live fixtures ───────────────────────────────────────────────────────────
// Deliberately a SEPARATE, single global call — /livescores/inplay returns
// every fixture currently in play across every league in one request. A
// single globally-scoped call (rather than re-polling all 39 leagues' round
// endpoints individually) is the only way to get near-real-time live data
// without moving the needle on API budget — most of those 39 leagues have
// no live match at any given moment.
// Poll cadence: SportMonks' own docs (confirmed real, user-supplied,
// 2026-08-29) say livescores has no push/WebSocket mechanism — polling
// every 1-2s is what they themselves recommend for an accurate ~2s max
// delay. Their rate limiter is 3000 calls/hour PER ENTITY (Livescores is
// its own entity, independent of the Fixtures/Odds/Players calls this file
// also makes), so 2s intervals (1800/hour) stay safely under budget with
// real headroom for retries — old 20s TTL → reduced to 2s (last commit)
// was STILL too slow for the 750ms LIVE_UPDATE_INTERVAL server poll: every
// 2nd/3rd 750ms tick would hit the 2s stale cache and re-emit identical
// minute/seconds reading, so clockAtMs didn't move and the frontend saw a
// "stuck/atrasado" clock for ~1-2s windows. New TTL = 750ms aligns exactly
// with the live-loop interval so each real server tick gets FRESH data from
// SportMonks — clockSec advances continuously, never stuck.
const LIVE_TTL_MS = 750;
let liveCache: { fixtures: SportMonksFixture[]; fetchedAt: number } | null = null;
let liveInFlight: Promise<SportMonksFixture[]> | null = null;

type SportMonksInplayFixture = SportMonksFixture & { league_id: number };

async function fetchLive(): Promise<SportMonksFixture[]> {
  // CONFIRMED REAL (2026-08-29, user-reported real error response):
  // /livescores/inplay REJECTS the `odds` relation outright —
  // {"message":"The odds include is not allowed on this endpoint","link":
  // "https://docs.sportmonks.com/football/api/response-codes/include-exceptions"}.
  // odds.market;odds.bookmaker had been in this include since this file's
  // live layer was first written, so EVERY call ever made here failed
  // outright and silently returned zero live fixtures — not a regression
  // from the statistics.type change tried and reverted just before this
  // (that hypothesis was wrong and is now ruled out); a real, standing bug
  // since day one of the live build. Odds are dropped from this include
  // entirely — live match state (score/events/periods/clock) now loads,
  // but fixtures from this endpoint carry no `odds` field, so
  // extractSportMonksFootballOverride(fx).odds is always null here and live
  // football odds fall back to synthetic (see buildFootballLiveFromSportMonks
  // in matches.ts) — a real, separate, still-open gap: the real source for
  // live odds on this endpoint is unconfirmed and needs its own real sample
  // before being wired in, same discipline as everything else in this file.
  const resp = await sportMonksGetWithRetry<{ data: SportMonksInplayFixture[] }>(
    "/livescores/inplay",
    {
      include: "state;events.type;events.player;periods;participants;scores;league.country;statistics.type",
    },
  );
  if (!resp) {
    logger.warn("[sportmonks] /livescores/inplay returned no data (request failed after retries)");
  }
  const allowed = new Set(SPORTMONKS_FOOTBALL_LEAGUE_IDS);
  return (resp?.data ?? []).filter((fx) => allowed.has(fx.league_id));
}

/** Every fixture currently in play, across every SportMonks league this plan
 * covers, cached ~2s. Real odds only for fixtures where bet365 (bookmaker_id
 * 2) actually has live odds loaded per-fixture via getSportMonksLiveOddsByFixture
 * — /livescores/inplay itself rejects odds include entirely, confirmed real.
 * User EXPLICIT rule (2026-08-30): SportMonks football = bet365 id=2 ONLY;
 * 1xbet id=35 is PulseScore-exclusive and must never be queried here. */
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

// ── Live odds ────────────────────────────────────────────────────────────
// CONFIRMED REAL (2026-08-29): the general paginated GET /odds/inplay list
// was the first thing tried here and turned out to be a dead end for this
// account — every page, across multiple test sessions days apart, returned
// only a single fixed demo fixture (18531144, FC Nordsjaelland v Lyngby,
// created_at "2022-08-01...", every row suspended, latest_bookmaker_update
// always null). That code was deleted, not kept — see git history
// (commits d99c694/0dd5359/693e71f/b8ca34a) for the abandoned attempt.
//
// The real fix (confirmed real, 2026-08-29, user-tested against a fixture
// that WAS genuinely live at the time — id 19621836, Atlético Mineiro v
// Vitória, state_id 22 = INPLAY_2ND_HALF): GET /v3/football/fixtures/{id}
// ?include=odds.market;odds.bookmaker — the SAME per-fixture endpoint/
// include shape already used for prematch (see extractSportMonksFootballOverride's
// header) — also carries real, actively-updating odds WHILE the match is
// live. Confirmed real: bet365 FULLTIME_RESULT rows for that fixture had
// latest_bookmaker_update "2026-08-29 21:28:09" (minutes-old at test time),
// suspended: null (not true), values 1.90/3.30/4.33 — genuinely live
// prices, not demo data. 3798 total odds rows on that one fixture across
// 10 bookmakers, so this account's real odds access is fine — it was
// specifically /odds/inplay that didn't work for this trial.
//
// One real difference from prematch found in that same sample: `suspended`
// stays null throughout (never populated on this endpoint), but `stopped`
// carries the real live-suspension signal instead (539 of 3798 rows had
// stopped:true — genuine markets paused mid-play) — oddsByDeveloperName
// below now excludes stopped rows too, not just suspended ones.
export type SportMonksFixtureWithOdds = SportMonksFixture & { odds?: SportMonksOdd[] };

// Clock alignment with LIVE_TTL_MS (now 750ms): odds need to feel live,
// but a 1s TTL is still safe (bookmakers rarely reprice more often than
// once per second per match). Old 2s TTL was visibly stale compared to the
// 750ms server tick — odds felt atrasadas vs Betclic reference.
const LIVE_ODDS_TTL_MS = 1 * 1000;

const liveOddsCache = new Map<number, { odds: SportMonksOdd[]; fetchedAt: number }>();
const liveOddsInFlight = new Map<number, Promise<SportMonksOdd[]>>();

async function fetchFixtureOdds(fixtureId: number, bookmakerId: number): Promise<SportMonksOdd[]> {
  // CONFIRMED REAL (2026-08-29): combining `filters=bookmakers:{id}` (the
  // same filter syntax confirmed on /odds/inplay) with this include cuts
  // the response from 3798 rows/2.3MB (all 10 bookmakers) down to 1861
  // rows/1.18MB (bet365 only) for the same fixture — real, meaningful
  // payload reduction, not a guess. Still every market for that one
  // bookmaker (extraction only reads the ~9 this file understands), but
  // far cheaper than fetching every bookmaker's markets just to discard
  // 9 of every 10 rows.
  const resp = await sportMonksGetWithRetry<{ data: SportMonksFixtureWithOdds }>(
    `/fixtures/${fixtureId}`,
    { include: "odds.market;odds.bookmaker", filters: `bookmakers:${bookmakerId}` },
  );
  if (!resp) {
    logger.warn(
      { fixtureId, bookmakerId },
      "[sportmonks] /fixtures/{id}?include=odds returned no data (request failed after retries)",
    );
  }
  return resp?.data?.odds ?? [];
}

/** One fixture's real odds for one bookmaker, cached ~2s per fixture with
 * in-flight dedup — same shape as prematch's SportMonksOdd, so
 * extractSportMonksFootballOverride works unchanged on live fixtures too
 * (see this section's header for how this replaced the dead-end
 * /odds/inplay general list). */
export async function getSportMonksFixtureOdds(
  fixtureId: number,
  bookmakerId = 2,
): Promise<SportMonksOdd[]> {
  const cacheKey = fixtureId * 1000 + bookmakerId; // bookmakerId is always < 1000 (confirmed real ids: 2, 35, ...)
  const cached = liveOddsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LIVE_ODDS_TTL_MS) return cached.odds;
  const inFlight = liveOddsInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = fetchFixtureOdds(fixtureId, bookmakerId)
    .then((odds) => {
      liveOddsCache.set(cacheKey, { odds, fetchedAt: Date.now() });
      return odds;
    })
    .catch(() => liveOddsCache.get(cacheKey)?.odds ?? [])
    .finally(() => {
      liveOddsInFlight.delete(cacheKey);
    });
  liveOddsInFlight.set(cacheKey, promise);
  return promise;
}

/** Debug-only: how long ago THIS SERVER last successfully fetched a
 * fixture's odds (not SportMonks' own latest_bookmaker_update — that's a
 * separate, upstream timestamp). Lets the debug route tell apart "our own
 * fetch loop is actively re-querying every ~2s but SportMonks/bet365
 * keeps reporting the same stale price" from "our own cache/fetch is
 * itself stuck" — added 2026-08-30 mid-debugging session after the same
 * latest_bookmaker_update values kept appearing over an hour apart. */
export function getSportMonksLiveOddsCacheAgeMs(
  fixtureId: number,
  bookmakerId = 2,
): number | null {
  const cacheKey = fixtureId * 1000 + bookmakerId;
  const cached = liveOddsCache.get(cacheKey);
  return cached ? Date.now() - cached.fetchedAt : null;
}

/** Fans out getSportMonksFixtureOdds across every currently-live fixture in
 * parallel (same Promise.all fan-out pattern getSportMonksFootballUpcoming
 * already uses across leagues) — one call per fixture, each independently
 * cached/deduped, so repeat fixture ids across ticks cost nothing extra
 * within the 2s TTL. The "Fixture" rate-limit entity (confirmed real,
 * 2026-08-29) is separate from Livescores and had tens of thousands
 * remaining in real testing — comfortable headroom for a live page
 * typically tracking a few dozen fixtures at once. */
export async function getSportMonksLiveOddsByFixture(
  fixtureIds: number[],
  bookmakerId = 2,
): Promise<Map<number, SportMonksOdd[]>> {
  const entries = await Promise.all(
    fixtureIds.map(
      async (id): Promise<[number, SportMonksOdd[]]> => [
        id,
        await getSportMonksFixtureOdds(id, bookmakerId),
      ],
    ),
  );
  return new Map(entries);
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

/** Returns periods sorted by `counts_from` ascending (chronological).
 * SportMonks does NOT guarantee insertion order in the raw periods[] array
 * (confirmed real: during 1H→HT→2H transitions the array can be out of
 * order, which made the old "last element" fallback pick 1H at minute 27
 * instead of 2H at minute 46 — see matches.ts's bug comment). */
function sortedSportMonksPeriods(fixture: SportMonksFixture): SportMonksPeriod[] {
  const periods = fixture.periods ?? [];
  return [...periods].sort((a, b) => {
    const ca = Number.isFinite(a.counts_from) ? a.counts_from : 0;
    const cb = Number.isFinite(b.counts_from) ? b.counts_from : 0;
    if (ca !== cb) return ca - cb;
    return (a.type_id ?? 0) - (b.type_id ?? 0);
  });
}

/** Picks the authoritative period for clock reading: the one currently
 * `ticking:true`, else the chronologically-last period in the sorted list
 * (not the raw array's tail). */
function pickSportMonksClockPeriod(fixture: SportMonksFixture): SportMonksPeriod | undefined {
  const sorted = sortedSportMonksPeriods(fixture);
  const ticking = sorted.find((p) => p.ticking);
  return ticking ?? sorted[sorted.length - 1];
}

/** Live clock in whole minutes — same semantics as the old function but
 * with (1) periods sorted by counts_from to avoid picking an out-of-order
 * earlier period during HT/2H transitions, and (2) the same
 * never-go-backwards floor NOT applied here (that belongs at the
 * per-fixture aggregation layer in matches.ts so it survives process
 * restarts via liveMatchState the same way PulseScore's clockSec guard
 * does). */
export function getSportMonksFixtureMinute(fixture: SportMonksFixture): number {
  const period = pickSportMonksClockPeriod(fixture);
  return period && Number.isFinite(period.minutes) && period.minutes >= 0 ? period.minutes : 0;
}

/** Total elapsed seconds from the fixture's currently-authoritative period
 * (ticking period else last chronological period). Feeds
 * LiveMatchState._liveExtra.clockSec so the frontend's existing MM:SS
 * ticking-clock extrapolation path (getFootballClockLabel / getDisplayMinute
 * in home.tsx) works for SportMonks exactly the same way it already works
 * for PulseScore — the single biggest contributor to eliminating the user's
 * "relógio oscilando" report, since the coarse minute-only interpolation
 * path was the real source of the jitter.
 *
 * IMPORTANT — PER-PERIOD LOCAL, not global-match time:
 *   Home.tsx already treats clockSec as period-local (see getFootballClockLabel
 *   L6867-L6874: 1P shows 00:00..45+N using clockSec directly, then 2P uses
 *   `String(Math.max(45, Math.floor(displaySec/60)))` → a 2P with 27 local
 *   minutes MUST be encoded as clockSec = 27*60 = 1620s so the frontend can
 *   then re-add the 45-min offset for display. If we instead encoded 2P's
 *   global minute (e.g. 72 global = 27 local) directly, home.tsx would
 *   Math.max(45, 72) = 72 → display "72:44" instead of "72:44" visually
 *   identical but the whole 1P/2P/injury math collapses, which caused the
 *   2026-08-30 user-visible bug report (Premier League 2P showing "71:50",
 *   Bundesliga 2P showing "72:44" when those are the GLOBAL elapsed, not the
 *   2P local the UI already hardcodes). SportMonks conveniently gives us
 *   `counts_from` on every period: 1H counts_from=0, 2H counts_from=45,
 *   1ET counts_from=90, 2ET counts_from=105. We subtract it so (period.minutes
 *   - counts_from) is always the WITHIN-PERIOD local minute the frontend
 *   clock math expects — matching PulseScore's own TM semantics (1H TM=27,
 *   2H TM=27 not 72). `time_added` is deliberately NOT folded in — injury
 *   time is already reflected in the raw period.minutes value itself, not
 *   stored separately (confirmed real: a 1H that ran +2 injury time reports
 *   the next period's counts_from == 45 and its own minutes start at 46). */
export function getSportMonksFixtureClockSec(fixture: SportMonksFixture): number {
  const period = pickSportMonksClockPeriod(fixture);
  if (!period) return 0;
  const countsFrom =
    Number.isFinite(period.counts_from) && period.counts_from >= 0 ? period.counts_from : 0;
  const minutesGlobal =
    Number.isFinite(period.minutes) && period.minutes >= 0 ? period.minutes : 0;
  const minutesLocal = Math.max(0, minutesGlobal - countsFrom);
  const seconds =
    Number.isFinite(period.seconds) && period.seconds >= 0 && period.seconds < 60
      ? period.seconds
      : 0;
  return minutesLocal * 60 + seconds;
}

export type SportMonksNormalizedStatus = {
  /** Frontend-compatible status label — matches the exact vocabulary the
   * existing getFootballPhaseTag / canLegitimatelyRephase / isHalftimeFreeze
   * logic in home.tsx already knows: "LIVE", "HT", "FT", "ET", "PEN".
   * The extra "NS" value is internal-only (Not Started / unknown state
   * with no ticking period) and both isSportMonksFixtureLive and
   * isSportMonksFixtureFinished return false when status === "NS", so it
   * never escapes this module into a LiveMatchState (buildFootballLive-
   * FromSportMonks skips those fixtures on the `if (!isSportMonksFixture-
   * Live) continue;` line before ever reading status).
   * SportMonks' raw developer_name values (INPLAY_1ST_HALF etc.) are NOT
   * understood by the frontend and were causing the period tag to stay
   * blank, injury-time labels (45+N') not to render, and
   * canLegitimatelyRephase rejecting the 45+N → 46 transition as a
   * "minute going backwards" — which directly created the reported
   * oscillation because frontend's apiMinutesRef clamp and backend's
   * Math.max(existing.minute, raw) were fighting each other tick-to-tick. */
  status: "LIVE" | "HT" | "FT" | "ET" | "PEN" | "NS";
  /** True only when a period is actually ticking right now and the
   * developer_name isn't a pause/break. The frontend extrapolates seconds
   * client-side only when clockRunning === true; setting this false during
   * HT stops the client from ticking through the 15-minute break. */
  clockRunning: boolean;
  /** True when the raw state is one of the in-play half values
   *  (INPLAY_1ST_HALF / INPLAY_2ND_HALF). Used by buildFootballLiveFrom-
   * SportMonks's freeze heuristic to distinguish "genuinely stuck clock"
   * (should mark HT/FT) from "normal slow tick" (nothing to do). */
  inPlayHalf: boolean;
};

/** SportMonks raw developer_name OR state_id (number) → frontend vocabulary.
 * REAL API BEHAVIOUR confirmed live 2026-08-30 against the
 * /rounds/396698?include=fixtures.odds.market;fixtures.odds.bookmaker;league.country
 * endpoint (round 396698, league 648 = Brazil Serie A):
 *
 *   1. The fixture object DOES NOT HAVE a nested `state` object by default.
 *      You only get `state` if `include=state` is present on THAT particular
 *      HTTP call, in which case the sub-object exposes
 *      `{ id, name, developer_name, type }` on each fixture.
 *   2. Every fixture ALWAYS has a flat numeric `state_id` on the top level,
 *      no include needed — confirmed real:
 *        state_id = 1 → fixtures with starting_at in the FUTURE or past
 *                       (19621835 / 19621831 / 19621837 / 19621833 / 19621838 =
 *                        NOT YET STARTED or SCHEDULED)
 *        state_id = 5 → fixtures with starting_at in the past + odds rows
 *                       marked `stopped=true` on bookmakers 10Bet and others,
 *                       so 5 = FINISHED / FULL_TIME.
 *   3. The known SportMonks v3 state_id numeric vocabulary (cross-referenced
 *      against their public docs + real samples above):
 *        0 → AWAITING (pre-construction, rarely seen)
 *        1 → NOT_STARTED / SCHEDULED
 *        2 → INPLAY / LIVE (both halves)
 *        3 → HALFTIME
 *        4 → SECOND_HALF_STARTED (often merged into 2 in practice)
 *        5 → FULLTIME / FINISHED
 *        6 → EXTRA_TIME_STARTED (sometimes 8)
 *        7 → PENALTIES_STARTED
 *        8 → BREAK_TIME (between extra time halves)
 *        9 → ABANDONED
 *       10 → POSTPONED
 *       11 → INTERRUPTED
 *       12 → CANCELLED
 *       13 → SUSPENDED
 *       14 → AWARDED
 *       15 → DELAYED
 *
 * Because the builder's /livescores/inplay include DOES request
 * `include=state` (line 1136), `fixture.state?.developer_name` IS normally
 * populated for live fixtures. But the pre-match /rounds/ID path, and any
 * SportMonks HTTP call that happens to omit the `state` include for any
 * reason, ends up with `fixture.state === undefined` across the board — so
 * the old three-tier lookup that ONLY read `fixture.state?.developer_name`
 * fell through to "NS" every single time on 10/10 real fixtures in the
 * round sample above, EVEN state_id=5 FINISHED ones. This explains almost
 * every "dados de atualizações errado" symptom the user reported earlier:
 * periods and scores showed real values, but normalized status/HT/FT tags
 * were stuck on the unknown-state fallback because state wasn't in the
 * fixture envelope.
 *
 * NEW three-tier lookup order (resilient to missing state object):
 *   1. `fixture.state?.developer_name` (highest quality, when include=state
 *      was actually effective on this payload — the /livescores/inplay path)
 *   2. Flat numeric `fixture.state_id` (ALWAYS present, per real round
 *      sample above — used as a reliable fallback mapping to the exact
 *      same vocabulary the developer_name tier produces)
 *   3. period.ticking heuristic (as before, for unknown state_id values
 *      that this codebase hasn't seen a real sample for yet)
 *
 * Known confirmed real values only (2026-08-29/30 samples); unknown states
 * fall back to a TWO-TIER decision instead of the previous "always LIVE,
 * clockRunning false" (which incorrectly classified "NS"/"SCHEDULED"
 * not-started fixtures appearing in /livescores/inplay as already-LIVE,
 * messing up the pre-match → live transition dedup on the home page
 * payload builder).
 *
 * Fallback decision tree:
 *   1. If ANY period has ticking === true → confirmed LIVE in-play (this
 *      period.ticking signal from SportMonks is 100% authoritative for
 *      "clock is running", matches what buildFootballLiveFromSportMonks
 *      already uses for clock extraction)
 *   2. Else: NOT a live fixture. normalizeSportMonksStatus returns status
 *      "NS" (not started, NOT one of {LIVE,HT,FT,ET,PEN}) so the two
 *      downstream callers behave correctly:
 *        - isSportMonksFixtureLive() returns false → this fixture is
 *          correctly SKIPPED in buildFootballLiveFromSportMonks (the
 *          continue on L14263 in matches.ts fires)
 *        - isSportMonksFixtureFinished() returns false (not "FT") → it
 *          also doesn't incorrectly trigger finalizeStaleLiveMatch on a
 *          fixture that hasn't even started yet.
 * ET/PEN developer names are NOT YET confirmed against real SportMonks
 * samples, so they're handled by LITERAL passthrough keys + a best-effort
 * substring match rather than guessed; the API-Football cross-reference
 * overlay in buildFootballLiveFromSportMonks overrides these anyway
 * whenever a match reaches extra time / penalties. */
export function normalizeSportMonksStatus(fixture: SportMonksFixture): SportMonksNormalizedStatus {
  // TIER 1 — explicit developer_name (highest fidelity, when include=state
  // worked on this specific HTTP response)
  const dn = (fixture.state?.developer_name ?? "").toUpperCase();
  if (dn === "FT" || dn === "FINISHED" || dn === "FULL_TIME") return { status: "FT", clockRunning: false, inPlayHalf: false };
  if (dn === "HT" || dn === "HALF_TIME") return { status: "HT", clockRunning: false, inPlayHalf: false };
  if (dn === "INPLAY_1ST_HALF" || dn === "1ST_HALF") return { status: "LIVE", clockRunning: true, inPlayHalf: true };
  if (dn === "INPLAY_2ND_HALF" || dn === "2ND_HALF") return { status: "LIVE", clockRunning: true, inPlayHalf: true };
  if (dn.includes("EXTRA") || dn.includes("AET") || dn.includes("ET_")) return { status: "ET", clockRunning: true, inPlayHalf: true };
  if (dn.includes("PENALT") || dn === "PEN") return { status: "PEN", clockRunning: true, inPlayHalf: true };
  if (dn === "POSTPONED" || dn === "CANCELLED" || dn === "ABANDONED" || dn === "AWARDED") return { status: "FT", clockRunning: false, inPlayHalf: false };
  if (dn === "SUSPENDED" || dn === "INTERRUPTED" || dn === "DELAYED") return { status: "LIVE", clockRunning: false, inPlayHalf: false };

  // TIER 2 — flat numeric state_id (ALWAYS present, no include needed — the
  // reliable fallback when developer_name is missing because `include=state`
  // was omitted on the parent HTTP call, as confirmed real in the /rounds/ID
  // sample 2026-08-30).
  const sid = Number.isFinite(fixture.state_id) ? Math.floor(fixture.state_id as number) : null;
  if (sid !== null) {
    switch (sid) {
      case 5:
        return { status: "FT", clockRunning: false, inPlayHalf: false };
      case 3:
      case 8:
        return { status: "HT", clockRunning: false, inPlayHalf: false };
      case 2:
      case 4:
      case 22:
        return { status: "LIVE", clockRunning: true, inPlayHalf: true };
      case 6:
        return { status: "ET", clockRunning: true, inPlayHalf: true };
      case 7:
        return { status: "PEN", clockRunning: true, inPlayHalf: true };
      case 9:
      case 10:
      case 12:
      case 14:
        return { status: "FT", clockRunning: false, inPlayHalf: false };
      case 11:
      case 13:
      case 15:
        return { status: "LIVE", clockRunning: false, inPlayHalf: false };
      case 0:
      case 1:
        return { status: "NS", clockRunning: false, inPlayHalf: false };
      default:
        break;
    }
  }

  // TIER 3 — heuristic: period.ticking. Best-effort catch-all for any
  // id/value combination neither tier above recognized.
  const anyTicking = (fixture.periods ?? []).some((p) => p.ticking);
  if (anyTicking) return { status: "LIVE", clockRunning: true, inPlayHalf: true };
  // Fallback: unknown state with no ticking period → NOT live. This is the
  // crucial NS/SCHEDULED/UNKNOWN guard — return "NS" (a 6th status value
  // only present inside this function's widened return type) so BOTH
  // isSportMonksFixtureLive and isSportMonksFixtureFinished return false,
  // matching the PRE-CHANGE behavior where unknown developer_name values
  // were silently skipped (pre-change: the three strict === checks on
  // INPLAY_1ST_HALF / INPLAY_2ND_HALF / HT simply all failed, and the
  // fixture was filtered out by the `if (!isSportMonksFixtureLive(fx))
  // continue;` line). Explicitly returning "NS" here documents that
  // intent instead of relying on a coincidental lack of any matching key.
  return { status: "NS", clockRunning: false, inPlayHalf: false };
}

/** True for a fixture that's actually being played right now (not
 * not-started, half-time, finished, or an unconfirmed/unknown state) —
 * confirmed real developer_name values: INPLAY_1ST_HALF, INPLAY_2ND_HALF.
 * Half-time (HT), extra time and penalties are deliberately included here
 * because the match is still in progress for suspension/settlement
 * purposes, even though the clock isn't running during HT/penalty pauses.
 *
 * NS / unknown states with NO currently-ticking period return false — this
 * matches the pre-rewrite behavior (the old function had three strict
 * === checks, so any developer_name not explicitly listed was rejected)
 * and fixes the regression reported in production 2026-08-30: not-started
 * fixtures leaking into /livescores/inplay used to pass the unknown-state
 * fallback "always LIVE" and were treated as already-live by the payload
 * builder, so the prematch dedup removed them from "Em Breve" but the
 * live section itself had no score data (getSportMonksFixtureScore
 * returned null for a not-started fixture) and filtered them back out —
 * leaving the match with NO representation on the home page at all until
 * the feed's state updated to INPLAY_1ST_HALF several minutes later. */
export function isSportMonksFixtureLive(fixture: SportMonksFixture): boolean {
  const s = normalizeSportMonksStatus(fixture).status;
  return s === "LIVE" || s === "HT" || s === "ET" || s === "PEN";
}

/** True once a fixture is confirmed over. Reimplemented on top of
 * normalizeSportMonksStatus so POSTPONED/ABANDONED/CANCELLED (which the
 * old single-string === FT check ignored) also trigger settlement rather
 * than getting stuck forever in the live feed as a stale 0-0 card. */
export function isSportMonksFixtureFinished(fixture: SportMonksFixture): boolean {
  return normalizeSportMonksStatus(fixture).status === "FT";
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

/** Sum of a statistics entry's `data.value` for one side, by confirmed real
 * `type.developer_name` (e.g. "CORNERS", "YELLOWCARDS"). Returns null (not
 * 0) when the fixture carries no statistics for this type yet — early in a
 * match, before any corner/card has happened, SportMonks may omit the
 * type entirely rather than send an explicit 0, and treating "no data" as
 * "confirmed zero" would let a corners/cards total settle on a stale/absent
 * read instead of waiting for real data. */
function sumSportMonksStat(
  fixture: SportMonksFixture,
  developerName: string,
  side: "home" | "away",
): number | null {
  const participant = fixture.participants?.find((p) => p.meta?.location === side);
  if (!participant) return null;
  const entries = (fixture.statistics ?? []).filter(
    (s) => s.type?.developer_name === developerName && s.participant_id === participant.id,
  );
  if (entries.length === 0) return null;
  return entries.reduce((sum, e) => sum + (Number.isFinite(e.data?.value) ? e.data.value : 0), 0);
}

/** Real corners/cards totals for a live or just-finished fixture — corners
 * from confirmed real CORNERS (type_id 34) statistics, cards from confirmed
 * real YELLOWCARDS (type_id 84) statistics plus this file's own confirmed
 * REDCARD event count (no REDCARDS statistic type has been observed in any
 * real sample, see SportMonksStatistic's own comment). `cardsTotal` counts
 * yellow+red combined, matching this codebase's existing
 * LiveMatchState._liveExtra.cardsTotal convention (see matches.ts). Each
 * field is null (not 0) when the underlying statistic is absent — see
 * sumSportMonksStat — so a fixture with no stats yet correctly stays
 * "unknown", not "confirmed zero corners". */
export function getSportMonksFixtureCornersCards(fixture: SportMonksFixture): {
  cornersHome: number | null;
  cornersAway: number | null;
  cornersTotal: number | null;
  yellowCardsHome: number | null;
  yellowCardsAway: number | null;
  cardsTotal: number | null;
} {
  const cornersHome = sumSportMonksStat(fixture, "CORNERS", "home");
  const cornersAway = sumSportMonksStat(fixture, "CORNERS", "away");
  const yellowCardsHome = sumSportMonksStat(fixture, "YELLOWCARDS", "home");
  const yellowCardsAway = sumSportMonksStat(fixture, "YELLOWCARDS", "away");
  const redCardsHome = countSportMonksRedCards(fixture, "home");
  const redCardsAway = countSportMonksRedCards(fixture, "away");
  return {
    cornersHome,
    cornersAway,
    cornersTotal: cornersHome != null && cornersAway != null ? cornersHome + cornersAway : null,
    yellowCardsHome,
    yellowCardsAway,
    cardsTotal:
      yellowCardsHome != null && yellowCardsAway != null
        ? yellowCardsHome + redCardsHome + yellowCardsAway + redCardsAway
        : null,
  };
}
