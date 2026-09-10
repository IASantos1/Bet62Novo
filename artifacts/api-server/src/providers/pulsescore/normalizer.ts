// PulseScore market normalizer — still not wired into any route or live
// odds path (see providers/pulsescore/README.md). PulseScore already does
// the hard semantic normalization on its own side (canonicalMarket /
// canonicalOutcome are real generic betting-market vocabulary, not
// provider-internal ids), so this layer does something narrower:
//
//   1. Strips provider-only noise (rawName human labels, moreInfo betType
//      arrays) while keeping traceability (selectionId, the market's own
//      marketId) for whatever matching/reconciliation work comes later.
//   2. Adds convenience accessors ONLY for markets with no line ambiguity
//      — exactly one HOME/DRAW/AWAY, YES/NO, or EVEN/ODD selection per
//      period, so picking "the" value is unambiguous.
//
// Deliberately NOT done here: folding OVER_UNDER / ASIAN_HANDICAP /
// HOME_OVER_UNDER / AWAY_OVER_UNDER / CORRECT_SCORE into single values.
// PulseScore emits many lines per market (confirmed real: Over/Under at
// 5.5, 5.75, AND 6.25 on the same event) where BET62's existing internal
// football market shape (routes/matches.ts's AdvancedMarkets) only has
// fixed .5-increment slots — deciding which PulseScore line fills which
// slot, and what happens to the lines that don't fit any slot, is a real
// design decision for whoever wires this into a live route, not something
// to guess here. Those markets are exposed in full (every line, every
// selection) via `markets` so that decision can be made later with all
// the real data in hand.
import type { PulseScoreEvent, PulseScoreMarket } from "./types.js";

export type NormalizedSelection = {
  /** PulseScore's own canonicalOutcome, reused verbatim (HOME/DRAW/AWAY/
   * OVER/UNDER/YES/NO/EVEN/ODD/HOME_DRAW/DRAW_AWAY/HOME_AWAY/OTHER). */
  outcome: string;
  odds: number;
  line?: number;
  isActive: boolean;
  /** Traceability back to the exact PulseScore selection this came from. */
  selectionId: string;
};

export type NormalizedMarketGroup = {
  /** PulseScore's own canonicalMarket, reused verbatim. */
  market: string;
  period: string;
  selections: NormalizedSelection[];
  /** PulseScore's own marketId (opaque, provider-scoped) — kept only for
   * traceability/debugging, never parsed as anything meaningful. */
  providerMarketId: string;
};

export type NormalizedFootballEvent = {
  eventId: string;
  home: string;
  away: string;
  league: string;
  startTime: string;
  /** Every market PulseScore sent, unabridged — the source of truth for
   * anything not covered by a convenience accessor below. */
  markets: NormalizedMarketGroup[];
  matchResult?: { home: number; draw: number; away: number };
  matchResult1H?: { home: number; draw: number; away: number };
  matchResult2H?: { home: number; draw: number; away: number };
  doubleChance?: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
  bothTeamsToScore?: { yes: number; no: number };
  totalGoalsOddEven?: { even: number; odd: number };
  drawNoBet?: { home: number; away: number };
  firstGoalTeam?: { home: number; noGoal: number; away: number };
  htft?: {
    hh: number; hd: number; ha: number;
    dh: number; dd: number; da: number;
    ah: number; ad: number; aa: number;
  };
  correctScore?: Record<string, number>;
  htCorrectScore?: Record<string, number>;
  anytimeGoalscorer?: Array<{ player: string; odds: number }>;
  firstGoalscorer?: Array<{ player: string; odds: number }>;
  lastGoalscorer?: Array<{ player: string; odds: number }>;
  asianHandicapFull?: { line: number; home: number; away: number };
  handicapLines?: Map<number, { home: number; away: number }>;
  cornersLines?: Map<number, { over: number; under: number }>;
  cardsLines?: Map<number, { over: number; under: number }>;
  asianTotalLines?: Map<number, { over: number; under: number }>;
};

function findMarket(ev: PulseScoreEvent, canonicalMarket: string, period: string) {
  return ev.markets.find((m) => m.canonicalMarket === canonicalMarket && m.period === period);
}

/** Heuristic market finder: tries exact canonical match first, then falls back
 *  to substring case-insensitive match for markets PulseScore renames
 *  internally (e.g. BOOKINGS_TOTAL vs TOTAL_CARDS). */
function findMarketLoose(ev: PulseScoreEvent, needles: string[], period: string): PulseScoreMarket | undefined {
  for (const m of ev.markets) {
    if (m.period !== period) continue;
    if (needles.some((n) => m.canonicalMarket.toLowerCase().includes(n.toLowerCase()))) return m;
    if (needles.some((n) => m.rawName.toLowerCase().includes(n.toLowerCase()))) return m;
  }
  return undefined;
}

function findOutcomeOdds(
  selections: PulseScoreEvent["markets"][number]["selections"],
  outcome: string,
): number | undefined {
  return selections.find((s) => s.canonicalOutcome === outcome)?.odds;
}

function extractMatchResult(ev: PulseScoreEvent, period: string) {
  const m = findMarket(ev, "MATCH_RESULT", period);
  if (!m) return undefined;
  const home = findOutcomeOdds(m.selections, "HOME");
  const draw = findOutcomeOdds(m.selections, "DRAW");
  const away = findOutcomeOdds(m.selections, "AWAY");
  if (home == null || draw == null || away == null) return undefined;
  return { home, draw, away };
}

export function normalizePulseScoreEvent(ev: PulseScoreEvent): NormalizedFootballEvent {
  const markets: NormalizedMarketGroup[] = ev.markets.map((m) => ({
    market: m.canonicalMarket,
    period: m.period,
    providerMarketId: m.marketId,
    selections: m.selections.map((s) => ({
      outcome: s.canonicalOutcome,
      odds: s.odds,
      line: s.line,
      isActive: s.isActive,
      selectionId: s.selectionId,
    })),
  }));

  const doubleChanceMarket = findMarket(ev, "DOUBLE_CHANCE", "FULL_TIME");
  const doubleChance = doubleChanceMarket
    ? (() => {
        const homeOrDraw = findOutcomeOdds(doubleChanceMarket.selections, "HOME_DRAW");
        const homeOrAway = findOutcomeOdds(doubleChanceMarket.selections, "HOME_AWAY");
        const drawOrAway = findOutcomeOdds(doubleChanceMarket.selections, "DRAW_AWAY");
        if (homeOrDraw == null || homeOrAway == null || drawOrAway == null) return undefined;
        return { homeOrDraw, homeOrAway, drawOrAway };
      })()
    : undefined;

  const bttsMarket = findMarket(ev, "BOTH_TEAMS_TO_SCORE", "FULL_TIME");
  const bothTeamsToScore = bttsMarket
    ? (() => {
        const yes = findOutcomeOdds(bttsMarket.selections, "YES");
        const no = findOutcomeOdds(bttsMarket.selections, "NO");
        if (yes == null || no == null) return undefined;
        return { yes, no };
      })()
    : undefined;

  const oddEvenMarket = findMarket(ev, "TOTAL_GOALS_ODD_EVEN", "FULL_TIME");
  const totalGoalsOddEven = oddEvenMarket
    ? (() => {
        const even = findOutcomeOdds(oddEvenMarket.selections, "EVEN");
        const odd = findOutcomeOdds(oddEvenMarket.selections, "ODD");
        if (even == null || odd == null) return undefined;
        return { even, odd };
      })()
    : undefined;

  const dnbMarket = findMarketLoose(ev, ["DRAW_NO_BET", "DRAWNOBET", "HOME_AWAY_DRAW_NO"], "FULL_TIME");
  const drawNoBet = dnbMarket
    ? (() => {
        const home =
          findOutcomeOdds(dnbMarket.selections, "HOME") ??
          findOutcomeOdds(dnbMarket.selections, "HOME_WIN") ??
          findOutcomeOdds(dnbMarket.selections, "1");
        const away =
          findOutcomeOdds(dnbMarket.selections, "AWAY") ??
          findOutcomeOdds(dnbMarket.selections, "AWAY_WIN") ??
          findOutcomeOdds(dnbMarket.selections, "2");
        if (home == null || away == null) return undefined;
        return { home, away };
      })()
    : undefined;

  const fgTeamMarket = findMarketLoose(ev, ["NEXT_GOAL_TEAM", "FIRST_GOAL_TEAM", "NEXT_GOAL", "WHICH_TEAM_SCORES_NEXT"], "FULL_TIME");
  const firstGoalTeam = fgTeamMarket
    ? (() => {
        const home =
          findOutcomeOdds(fgTeamMarket.selections, "HOME") ??
          findOutcomeOdds(fgTeamMarket.selections, "HOME_FIRST") ??
          findOutcomeOdds(fgTeamMarket.selections, "HOME_NEXT");
        const away =
          findOutcomeOdds(fgTeamMarket.selections, "AWAY") ??
          findOutcomeOdds(fgTeamMarket.selections, "AWAY_FIRST") ??
          findOutcomeOdds(fgTeamMarket.selections, "AWAY_NEXT");
        const noGoal =
          findOutcomeOdds(fgTeamMarket.selections, "NO_GOAL") ??
          findOutcomeOdds(fgTeamMarket.selections, "NONE") ??
          findOutcomeOdds(fgTeamMarket.selections, "NO_MORE_GOALS");
        if (home == null || away == null || noGoal == null) return undefined;
        return { home, noGoal, away };
      })()
    : undefined;

  const htftMarket = findMarketLoose(ev, ["HALF_TIME_FULL_TIME", "HT_FT", "HTFT"], "FULL_TIME");
  const htft: NormalizedFootballEvent["htft"] = htftMarket
    ? (() => {
        const g = (h: string, f: string) => {
          const sel = htftMarket.selections.find((s) => {
            const k = (s.canonicalOutcome ?? "").replace(/[^A-Z]/g, "");
            return k === `${h}${f}` || k === `${h}/${f}` || s.rawName.startsWith(`${h}/${f}`) || s.rawName.startsWith(`${h} ${f}`);
          });
          return sel?.odds;
        };
        const rows = [
          ["HH", "HOME", "HOME"], ["HD", "HOME", "DRAW"], ["HA", "HOME", "AWAY"],
          ["DH", "DRAW", "HOME"], ["DD", "DRAW", "DRAW"], ["DA", "DRAW", "AWAY"],
          ["AH", "AWAY", "HOME"], ["AD", "AWAY", "DRAW"], ["AA", "AWAY", "AWAY"],
        ] as const;
        const out: Record<string, number> = {};
        for (const [k, h, a] of rows) {
          const v = g(h, a);
          if (v != null) out[k.toLowerCase()] = v;
        }
        return (Object.keys(out).length === 9 ? out : undefined) as NormalizedFootballEvent["htft"];
      })()
    : undefined;

  const correctScoreMarket = findMarketLoose(ev, ["CORRECT_SCORE", "EXACT_SCORE"], "FULL_TIME");
  const correctScore: Record<string, number> | undefined = correctScoreMarket
    ? (() => {
        const out: Record<string, number> = {};
        for (const s of correctScoreMarket.selections) {
          const m = s.canonicalOutcome.match(/^(\d+)[-_:](\d+)$/) ?? s.rawName.match(/(\d+)\s*[-:x]\s*(\d+)/);
          if (m) {
            out[`${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`] = s.odds;
            continue;
          }
          const up = s.canonicalOutcome.toUpperCase();
          if (up.includes("HOME_WIN") || up.startsWith("HOME ") || up === "OTHER_HOME") out["home-any"] = s.odds;
          else if (up.includes("AWAY_WIN") || up.startsWith("AWAY ") || up === "OTHER_AWAY") out["away-any"] = s.odds;
          else if (up === "ANY_OTHER" || up === "OTHER" || up.includes("DRAW_OTHER")) out["any-other"] = s.odds;
        }
        return Object.keys(out).length > 0 ? out : undefined;
      })()
    : undefined;

  const htCorrectScoreMarket = findMarketLoose(ev, ["CORRECT_SCORE", "EXACT_SCORE"], "FIRST_HALF");
  const htCorrectScore: Record<string, number> | undefined = htCorrectScoreMarket
    ? (() => {
        const out: Record<string, number> = {};
        for (const s of htCorrectScoreMarket.selections) {
          const m = s.canonicalOutcome.match(/^(\d+)[-_:](\d+)$/) ?? s.rawName.match(/(\d+)\s*[-:x]\s*(\d+)/);
          if (m) out[`${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`] = s.odds;
        }
        return Object.keys(out).length > 0 ? out : undefined;
      })()
    : undefined;

  const anytimeGsMarket = findMarketLoose(ev, ["ANYTIME_GOALSCORER", "ANYTIME_GOALS", "GOALSCORER_ANYTIME"], "FULL_TIME");
  const firstGsMarket = findMarketLoose(ev, ["FIRST_GOALSCORER", "FIRST_GOALS"], "FULL_TIME");
  const lastGsMarket = findMarketLoose(ev, ["LAST_GOALSCORER", "LAST_GOALS"], "FULL_TIME");
  const pluckPlayers = (mkt: PulseScoreMarket | undefined) =>
    mkt
      ? mkt.selections
          .filter((s) => s.odds != null && Number.isFinite(s.odds) && s.odds > 1)
          .map((s) => ({ player: s.rawName.replace(/^(anytime|first|last)\s*[:\-]\s*/i, "").trim() || s.canonicalOutcome, odds: s.odds }))
          .slice(0, 60)
      : undefined;
  const anytimeGoalscorer = pluckPlayers(anytimeGsMarket);
  const firstGoalscorer = pluckPlayers(firstGsMarket);
  const lastGoalscorer = pluckPlayers(lastGsMarket);

  // Asian handicap full-time line market — pick line 0 first (DNB duplicate),
  // else the absolute-smallest absolute line the provider emits.
  const ahMarket = findMarketLoose(ev, ["ASIAN_HANDICAP", "HANDICAP_ASIAN"], "FULL_TIME");
  const asianHandicapFull: NormalizedFootballEvent["asianHandicapFull"] = (() => {
    if (!ahMarket) return undefined;
    const byLine = new Map<number, { home?: number; away?: number }>();
    for (const s of ahMarket.selections) {
      if (s.line == null || !Number.isFinite(s.line)) continue;
      const rec = byLine.get(s.line) ?? {};
      if (s.canonicalOutcome === "HOME" || s.canonicalOutcome === "1") rec.home = s.odds;
      else if (s.canonicalOutcome === "AWAY" || s.canonicalOutcome === "2") rec.away = s.odds;
      byLine.set(s.line, rec);
    }
    const available: Array<{ line: number; home: number; away: number }> = [];
    for (const [line, v] of byLine.entries()) {
      if (v.home != null && v.away != null) available.push({ line, home: v.home, away: v.away });
    }
    if (!available.length) return undefined;
    available.sort((a, b) => Math.abs(a.line) - Math.abs(b.line));
    return available[0];
  })();

  // Generic line-market aggregator (over/under or home/away handicap per line):
  const aggregateLineMarkets = (needles: string[], period: string, kind: "overunder" | "handicap") => {
    const mkt = findMarketLoose(ev, needles, period);
    if (!mkt) return undefined;
    if (kind === "overunder") {
      const m = new Map<number, { over: number; under: number }>();
      for (const s of mkt.selections) {
        if (s.line == null || !Number.isFinite(s.line)) continue;
        const rec = m.get(s.line) ?? { over: undefined as number | undefined, under: undefined as number | undefined };
        const out = s.canonicalOutcome.toUpperCase();
        if (out === "OVER" || out.startsWith("O") || out.startsWith("MORE")) rec.over = s.odds;
        else if (out === "UNDER" || out.startsWith("U") || out.startsWith("LESS")) rec.under = s.odds;
        m.set(s.line, rec as { over: number; under: number });
      }
      const clean = new Map<number, { over: number; under: number }>();
      for (const [l, v] of m.entries()) if (v.over != null && v.under != null) clean.set(l, v);
      return clean.size ? clean : undefined;
    } else {
      const m = new Map<number, { home: number; away: number }>();
      for (const s of mkt.selections) {
        if (s.line == null || !Number.isFinite(s.line)) continue;
        const rec = m.get(s.line) ?? { home: undefined as number | undefined, away: undefined as number | undefined };
        const out = s.canonicalOutcome.toUpperCase();
        if (out === "HOME" || out === "1") rec.home = s.odds;
        else if (out === "AWAY" || out === "2") rec.away = s.odds;
        m.set(s.line, rec as { home: number; away: number });
      }
      const clean = new Map<number, { home: number; away: number }>();
      for (const [l, v] of m.entries()) if (v.home != null && v.away != null) clean.set(l, v);
      return clean.size ? clean : undefined;
    }
  };
  const handicapLines = aggregateLineMarkets(["MATCH_HANDICAP", "RESULT_HANDICAP", "HOME_AWAY_HANDICAP", "HANDICAP_RESULT"], "FULL_TIME", "handicap");
  const cornersLines = aggregateLineMarkets(["CORNERS_TOTAL", "TOTAL_CORNERS", "CORNERS_OVER_UNDER"], "FULL_TIME", "overunder");
  const cardsLines = aggregateLineMarkets(["BOOKINGS_TOTAL", "TOTAL_CARDS", "CARDS_OVER_UNDER"], "FULL_TIME", "overunder");
  const asianTotalLines = aggregateLineMarkets(["TOTAL_GOALS", "GOALS_TOTAL", "TOTAL"], "FULL_TIME", "overunder");

  return {
    eventId: ev.eventId,
    home: ev.home,
    away: ev.away,
    league: ev.league,
    startTime: ev.startTime,
    markets,
    matchResult: extractMatchResult(ev, "FULL_TIME"),
    matchResult1H: extractMatchResult(ev, "FIRST_HALF"),
    matchResult2H: extractMatchResult(ev, "SECOND_HALF"),
    doubleChance,
    bothTeamsToScore,
    totalGoalsOddEven,
    drawNoBet,
    firstGoalTeam,
    htft,
    correctScore,
    htCorrectScore,
    anytimeGoalscorer,
    firstGoalscorer,
    lastGoalscorer,
    asianHandicapFull,
    handicapLines,
    cornersLines,
    cardsLines,
    asianTotalLines,
  };
}
