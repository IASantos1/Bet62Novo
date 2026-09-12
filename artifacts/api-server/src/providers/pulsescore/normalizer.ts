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
  teamGoalsHomeLines?: Map<number, { over: number; under: number }>;
  teamGoalsAwayLines?: Map<number, { over: number; under: number }>;
  homeCornersLines?: Map<number, { over: number; under: number }>;
  awayCornersLines?: Map<number, { over: number; under: number }>;
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

/** Plural version of findMarketLoose — bet365 commonly splits a single
 *  conceptual line-market into several PulseScore market groups sharing the
 *  same canonicalMarket+period (confirmed real 2026-09-12: a live match
 *  carried THREE separate OVER_UNDER/FULL_TIME groups — "Match Goals" with
 *  just the main 2.5 line, "Alternative Match Goals" with 0.5/1.5/3.5/4.5/
 *  5.5, and a third "Goal Line" group). findMarketLoose's first-match-wins
 *  behavior silently dropped every line except whichever group happened to
 *  come first in the array — this returns every matching group so callers
 *  needing a line-indexed union (aggregateLineMarkets) can merge them. */
function findMarketsLoose(ev: PulseScoreEvent, needles: string[], period: string): PulseScoreMarket[] {
  return ev.markets.filter((m) => {
    if (m.period !== period) return false;
    return (
      needles.some((n) => m.canonicalMarket.toLowerCase().includes(n.toLowerCase())) ||
      needles.some((n) => m.rawName.toLowerCase().includes(n.toLowerCase()))
    );
  });
}

function findOutcomeOdds(
  selections: PulseScoreEvent["markets"][number]["selections"],
  outcome: string,
): number | undefined {
  return selections.find((s) => s.canonicalOutcome === outcome)?.odds;
}

// bet365's canonicalMarket classifier tags the FULL_TIME 1X2 market as
// "OTHER" (confirmed 2026-09-11 against a real captured payload) instead
// of "MATCH_RESULT" — only its rawName ("Fulltime Result"/"To Win 2nd
// Half", etc.) actually distinguishes it. This is the single
// most-critical market (it gates `_priceSource: "pulsescore"` — see
// shadowMatchSync.ts), so it gets a dedicated rawName fallback rather
// than relying on canonicalMarket alone the way onexbet's feed allowed.
const MATCH_RESULT_RAW_NAMES: Record<string, string[]> = {
  FULL_TIME: ["fulltime result", "full time result", "match result", "1x2"],
  FIRST_HALF: ["half time result", "1st half result", "to win 1st half"],
  SECOND_HALF: ["to win 2nd half", "2nd half result"],
};

function extractMatchResult(ev: PulseScoreEvent, period: string) {
  const m =
    findMarket(ev, "MATCH_RESULT", period) ??
    findMarketLoose(ev, MATCH_RESULT_RAW_NAMES[period] ?? [], period);
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
    selections: m.selections.map((s, i) => ({
      outcome: s.canonicalOutcome,
      odds: s.odds,
      line: s.line,
      isActive: s.isActive,
      // onexbet had a flat selectionId; bet365 carries its own id under
      // moreInfo.ID instead (see types.ts header) — fall back to a
      // synthesized-but-stable id so this is never empty. Never parsed as
      // anything meaningful either way (traceability only).
      selectionId: s.selectionId ?? s.moreInfo?.["ID"] ?? `${m.marketId}:${i}`,
    })),
  }));

  const doubleChanceMarket = findMarket(ev, "DOUBLE_CHANCE", "FULL_TIME");
  const doubleChance = doubleChanceMarket
    ? (() => {
        let homeOrDraw = findOutcomeOdds(doubleChanceMarket.selections, "HOME_DRAW");
        let homeOrAway = findOutcomeOdds(doubleChanceMarket.selections, "HOME_AWAY");
        let drawOrAway = findOutcomeOdds(doubleChanceMarket.selections, "DRAW_AWAY");
        // Real bet365 payload (confirmed 2026-09-12) tags every DOUBLE_CHANCE
        // selection generic canonicalOutcome "OTHER" — but its rawName spells
        // out the real pairing verbatim ("<home> or Draw", "<away> or Draw",
        // "<home> or <away>"), so match on that text instead of an outcome
        // name this feed never sends.
        if (homeOrDraw == null || homeOrAway == null || drawOrAway == null) {
          const homeLower = ev.home.toLowerCase();
          const awayLower = ev.away.toLowerCase();
          for (const s of doubleChanceMarket.selections) {
            const raw = s.rawName.toLowerCase();
            const hasHome = raw.includes(homeLower);
            const hasAway = raw.includes(awayLower);
            const hasDraw = raw.includes("draw");
            if (hasHome && hasDraw && homeOrDraw == null) homeOrDraw = s.odds;
            else if (hasAway && hasDraw && drawOrAway == null) drawOrAway = s.odds;
            else if (hasHome && hasAway && homeOrAway == null) homeOrAway = s.odds;
          }
        }
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

  // Same bet365 canonicalMarket-inconsistency as MATCH_RESULT above:
  // "Goals Odd/Even" also comes back tagged "OTHER" (confirmed 2026-09-11
  // against the same real payload) rather than TOTAL_GOALS_ODD_EVEN.
  const oddEvenMarket =
    findMarket(ev, "TOTAL_GOALS_ODD_EVEN", "FULL_TIME") ??
    findMarketLoose(ev, ["goals odd/even", "odd/even", "total goals odd"], "FULL_TIME");
  const totalGoalsOddEven = oddEvenMarket
    ? (() => {
        let even = findOutcomeOdds(oddEvenMarket.selections, "EVEN");
        let odd = findOutcomeOdds(oddEvenMarket.selections, "ODD");
        // Real bet365 payload (confirmed 2026-09-12) tags both selections
        // generic canonicalOutcome "OTHER" — rawName is literally "Odd"/"Even"
        // though, so fall back to that exact text.
        if (even == null) {
          even = oddEvenMarket.selections.find((s) => s.rawName.trim().toLowerCase() === "even")?.odds;
        }
        if (odd == null) {
          odd = oddEvenMarket.selections.find((s) => s.rawName.trim().toLowerCase() === "odd")?.odds;
        }
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

  // "FIRST_TEAM_TO_SCORE" is PulseScore's real canonicalMarket name for this
  // on some feeds (confirmed 2026-09-11); a different real payload
  // (confirmed 2026-09-12) instead sent it as canonicalMarket "OTHER" with
  // rawName "1st Goal" — "1st goal" added below to catch that shape too.
  const fgTeamMarket = findMarketLoose(ev, ["FIRST_TEAM_TO_SCORE", "NEXT_GOAL_TEAM", "FIRST_GOAL_TEAM", "NEXT_GOAL", "WHICH_TEAM_SCORES_NEXT", "1st goal"], "FULL_TIME");
  const firstGoalTeam = fgTeamMarket
    ? (() => {
        const homeSel = fgTeamMarket.selections.find(
          (s) => s.canonicalOutcome === "HOME" || s.canonicalOutcome === "HOME_FIRST" || s.canonicalOutcome === "HOME_NEXT",
        );
        const awaySel = fgTeamMarket.selections.find(
          (s) => s.canonicalOutcome === "AWAY" || s.canonicalOutcome === "AWAY_FIRST" || s.canonicalOutcome === "AWAY_NEXT",
        );
        const home = homeSel?.odds;
        const away = awaySel?.odds;
        // "NEITHER" is PulseScore's real canonicalOutcome for "no goal at
        // all" on some feeds (confirmed 2026-09-11); the "1st Goal" shape
        // above (confirmed 2026-09-12) instead tags this same selection
        // generic "OTHER" with no distinguishing outcome name at all — in a
        // confirmed exactly-3-way market where the other two selections are
        // already identified as HOME/AWAY, the remaining selection can only
        // be the no-goal case, so pick it by elimination rather than by a
        // name that doesn't exist on this shape.
        let noGoal =
          findOutcomeOdds(fgTeamMarket.selections, "NEITHER") ??
          findOutcomeOdds(fgTeamMarket.selections, "NO_GOAL") ??
          findOutcomeOdds(fgTeamMarket.selections, "NONE") ??
          findOutcomeOdds(fgTeamMarket.selections, "NO_MORE_GOALS");
        if (noGoal == null && homeSel && awaySel && fgTeamMarket.selections.length === 3) {
          noGoal = fgTeamMarket.selections.find((s) => s !== homeSel && s !== awaySel)?.odds;
        }
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

  // Real bet365 payload (confirmed 2026-09-12): the full-time correct-score
  // market comes back as rawName "Final Score" (canonicalMarket "OTHER"),
  // not "Correct Score"/"Exact Score" — added as its own needle. The
  // per-selection parsing below already has a rawName-regex fallback
  // ("1-0" etc match directly), so finding the market is the only gap.
  const correctScoreMarket = findMarketLoose(ev, ["CORRECT_SCORE", "EXACT_SCORE", "final score"], "FULL_TIME");
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
  // Real bug fixed 2026-09-11 (user-reported: goalscorer buttons showing
  // "2nd"/"Anytime"/"Yes" instead of a player name): right after a goal,
  // bet365 can briefly return this market in a degenerate placeholder
  // shape — generic rows like "2nd"/"Anytime" instead of the full player
  // breakdown — before repopulating real players once it settles. Every
  // genuine player row observed carries a bet365 player id under
  // `moreInfo.PI`; a placeholder row never does. Requiring it is a
  // principled filter (a real person, not a category label) rather than
  // a blocklist of specific known-bad strings that would miss the next
  // one bet365 invents.
  const pluckPlayers = (mkt: PulseScoreMarket | undefined) =>
    mkt
      ? mkt.selections
          .filter((s) => s.odds != null && Number.isFinite(s.odds) && s.odds > 1 && !!s.moreInfo?.["PI"])
          .map((s) => ({ player: s.rawName.replace(/^(anytime|first|last)\s*[:\-]\s*/i, "").trim() || s.canonicalOutcome, odds: s.odds }))
          .slice(0, 60)
      : undefined;
  const anytimeGoalscorer = pluckPlayers(anytimeGsMarket);
  const firstGoalscorer = pluckPlayers(firstGsMarket);
  const lastGoalscorer = pluckPlayers(lastGsMarket);

  // Real PulseScore Asian handicap data (confirmed 2026-09-11) prices HOME
  // and AWAY at OPPOSITE-signed lines for the same pairing — "HOME -1" (the
  // favorite giving a goal) sits alongside "AWAY +1" (the underdog getting
  // it), never "AWAY -1". Grouping selections by their raw `line` value
  // (as both this and handicapLines below used to) therefore never finds a
  // home+away match at the same key and silently returns nothing — pairing
  // each HOME line with the AWAY entry at its negation is the fix.
  function pairAsianHandicapLines(
    selections: PulseScoreEvent["markets"][number]["selections"],
  ): Map<number, { home: number; away: number }> | undefined {
    const homeByLine = new Map<number, number>();
    const awayByLine = new Map<number, number>();
    for (const s of selections) {
      if (s.line == null || !Number.isFinite(s.line)) continue;
      if (s.canonicalOutcome === "HOME" || s.canonicalOutcome === "1") homeByLine.set(s.line, s.odds);
      else if (s.canonicalOutcome === "AWAY" || s.canonicalOutcome === "2") awayByLine.set(s.line, s.odds);
    }
    const combined = new Map<number, { home: number; away: number }>();
    for (const [line, home] of homeByLine) {
      const away = awayByLine.get(-line) ?? awayByLine.get(line);
      if (away != null) combined.set(line, { home, away });
    }
    return combined.size ? combined : undefined;
  }

  // Asian handicap full-time line market — pick line 0 first (DNB duplicate),
  // else the absolute-smallest absolute line the provider emits.
  const ahMarket = findMarketLoose(ev, ["ASIAN_HANDICAP", "HANDICAP_ASIAN"], "FULL_TIME");
  const asianHandicapAllLines = ahMarket ? pairAsianHandicapLines(ahMarket.selections) : undefined;
  const asianHandicapFull: NormalizedFootballEvent["asianHandicapFull"] = (() => {
    if (!asianHandicapAllLines) return undefined;
    const available = [...asianHandicapAllLines.entries()].map(([line, v]) => ({ line, ...v }));
    available.sort((a, b) => Math.abs(a.line) - Math.abs(b.line));
    return available[0];
  })();

  // Generic over/under line-market aggregator. (A "handicap" mode used to
  // live here too, grouping HOME/AWAY selections by their raw `line` — removed
  // 2026-09-11 since real Asian handicap data pairs HOME/AWAY at *opposite*
  // signs per line, not the same one, so that mode always returned nothing
  // useful; see pairAsianHandicapLines above for the correct approach.)
  const aggregateLineMarkets = (needles: string[], period: string) => {
    // Merges every matching market group, not just the first — see
    // findMarketsLoose's header for why a single findMarketLoose() call
    // here used to silently drop bet365's "alternative lines" groups.
    const mkts = findMarketsLoose(ev, needles, period);
    if (mkts.length === 0) return undefined;
    const m = new Map<number, { over: number; under: number }>();
    for (const mkt of mkts) {
      for (const s of mkt.selections) {
        if (s.line == null || !Number.isFinite(s.line)) continue;
        const rec = m.get(s.line) ?? { over: undefined as number | undefined, under: undefined as number | undefined };
        const out = s.canonicalOutcome.toUpperCase();
        // Real bet365 payload (confirmed 2026-09-12): corners over/under
        // markets ("Match Corners", "2-Way Corners", "Asian Corners") tag
        // EVERY selection generic canonicalOutcome "OTHER" — the previous
        // `out.startsWith("O")` fuzzy match treated "OTHER" itself as a
        // match for "Over", so a same-line "Exactly" selection (also
        // "OTHER", also with a `line`) could silently clobber the real Over
        // price. Match exact canonicalOutcome first, falling back to
        // rawName only when canonicalOutcome is the generic placeholder —
        // never a fuzzy prefix that "OTHER" itself satisfies.
        const rawOut = s.rawName.trim().toUpperCase();
        const isOver = out === "OVER" || out === "MORE" || (out === "OTHER" && rawOut === "OVER");
        const isUnder = out === "UNDER" || out === "LESS" || (out === "OTHER" && rawOut === "UNDER");
        if (isOver) rec.over = s.odds;
        else if (isUnder) rec.under = s.odds;
        m.set(s.line, rec as { over: number; under: number });
      }
    }
    const clean = new Map<number, { over: number; under: number }>();
    for (const [l, v] of m.entries()) if (v.over != null && v.under != null) clean.set(l, v);
    return clean.size ? clean : undefined;
  };
  // None of "MATCH_HANDICAP"/"RESULT_HANDICAP"/"HOME_AWAY_HANDICAP"/
  // "HANDICAP_RESULT" ever matched anything real (confirmed 2026-09-11
  // against real captured payloads) — this silently returned undefined
  // every time, so BET62's 2-way `handicap` field (homeMinusOne/
  // awayPlusOne/...) was always zeroed. The real 2-way market is
  // "ASIAN_HANDICAP" — reuse the same correctly opposite-sign-paired map
  // asianHandicapFull is built from above (fixing this at the source, not
  // via aggregateLineMarkets's generic "handicap" mode, which shares the
  // exact same same-sign assumption bug the header comment above just
  // described — see pairAsianHandicapLines). PulseScore's other handicap
  // market, "EUROPEAN_HANDICAP", is a genuine 3-way (home/draw/away) price
  // per line — a different shape from this 2-way field, deliberately not
  // mapped here (would need its own market type, out of scope for this
  // pass; see the session notes on this decision).
  const handicapLines = asianHandicapAllLines;
  // Real bet365 payload (confirmed 2026-09-12): the actual corners
  // over/under markets ("Match Corners", "2-Way Corners", "Asian Corners")
  // come back tagged canonicalMarket "OTHER" — CORNERS_OVER_UNDER only ever
  // matched a HOME/AWAY-winner "Corners" market with no lines at all
  // (contributes nothing here since it has no OVER/UNDER selections), so
  // the real lines were never found. "corners" as a rawName needle catches
  // all three real markets; findMarketsLoose already scopes to FULL_TIME,
  // and any non-over/under corners market it also matches (the winner
  // market, "Corners Race") is harmlessly dropped by the clean-map filter
  // above since it never populates both sides of a line.
  const cornersLines = aggregateLineMarkets(["CORNERS_TOTAL", "TOTAL_CORNERS", "CORNERS_OVER_UNDER", "corners"], "FULL_TIME");
  const cardsLines = aggregateLineMarkets(["BOOKINGS_TOTAL", "TOTAL_CARDS", "CARDS_OVER_UNDER"], "FULL_TIME");
  const asianTotalLines = aggregateLineMarkets(["TOTAL_GOALS", "GOALS_TOTAL", "TOTAL"], "FULL_TIME");
  // Per-team goals/corners over-under — real canonicalMarkets
  // "HOME_OVER_UNDER"/"AWAY_OVER_UNDER" and "HOME_CORNERS_OVER_UNDER"/
  // "AWAY_CORNERS_OVER_UNDER" (all confirmed 2026-09-11), previously not
  // extracted at all.
  const teamGoalsHomeLines = aggregateLineMarkets(["HOME_OVER_UNDER"], "FULL_TIME");
  const teamGoalsAwayLines = aggregateLineMarkets(["AWAY_OVER_UNDER"], "FULL_TIME");
  const homeCornersLines = aggregateLineMarkets(["HOME_CORNERS_OVER_UNDER"], "FULL_TIME");
  const awayCornersLines = aggregateLineMarkets(["AWAY_CORNERS_OVER_UNDER"], "FULL_TIME");

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
    teamGoalsHomeLines,
    teamGoalsAwayLines,
    homeCornersLines,
    awayCornersLines,
  };
}
