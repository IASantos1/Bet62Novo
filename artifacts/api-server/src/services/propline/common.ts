// Shared, sport-agnostic PropLine extraction helpers — basketball, hockey,
// volleyball, and mma all build on the same real /odds and /scores shapes
// (see index.ts's ProplineEvent/ProplineScore/ProplineBookmaker types), so
// this factors the common extraction logic out instead of each sport
// module re-duplicating it.
import type { ProplineBookmaker, ProplineScore } from "./index.js";
import { normalizeTeamName, isFuzzyMatch } from "./football.js";

/** PropLine's `oddsFormat: "decimal"` request param isn't honored for every
 * sport/market — basketball/hockey/volleyball/mma responses observed in
 * production 2026-09-09 came back as raw American prices (e.g. -7000, 1100)
 * despite the request, producing wildly wrong "decimal" odds once displayed
 * as-is. American odds are never in the [-99, 99] range by definition, so
 * any price outside that band is converted; anything already inside it is
 * assumed to already be a real decimal price and passed through untouched. */
function proplineNormalizeOddsPrice(price: number): number {
  if (!Number.isFinite(price)) return price;
  if (price <= -100) return Math.round((1 + 100 / Math.abs(price)) * 100) / 100;
  if (price >= 100) return Math.round((1 + price / 100) * 100) / 100;
  return price;
}

/** Extracts one bookmaker's h2h (moneyline) prices — matches outcomes by
 * team name, falling back to outcome POSITION only when PropLine's own
 * documented ordering guarantee applies (home, away, then draw when
 * threeWay) and the count matches exactly. Returns null when this
 * particular bookmaker didn't price the market (a different bookmaker may
 * still have it — see extractProplineH2HOdds, which calls this once per
 * bookmaker). */
function extractH2HFromBookmaker(
  bm: ProplineBookmaker,
  home: string,
  away: string,
  threeWay: boolean,
): { home: number; draw: number | null; away: number } | null {
  const market = bm.markets.find((m) => m.key === "h2h");
  if (!market) return null;
  let homePrice: number | null = null;
  let awayPrice: number | null = null;
  let drawPrice: number | null = null;
  for (const o of market.outcomes) {
    const name = (o.name || "").toLowerCase();
    if (name === "draw") drawPrice = o.price;
    else if (name === home.toLowerCase() || o.name === home) homePrice = o.price;
    else if (name === away.toLowerCase() || o.name === away) awayPrice = o.price;
  }
  const expectedCount = threeWay ? 3 : 2;
  if (
    (homePrice == null || awayPrice == null || (threeWay && drawPrice == null)) &&
    market.outcomes.length === expectedCount
  ) {
    const [h, a, d] = market.outcomes;
    if (h && a) {
      homePrice ??= h.price;
      awayPrice ??= a.price;
      if (threeWay && d) drawPrice ??= d.price;
    }
  }
  if (homePrice == null || awayPrice == null) return null;
  if (threeWay && drawPrice == null) return null;
  return { home: homePrice, draw: drawPrice, away: awayPrice };
}

function average(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/** H2H (moneyline) extraction, averaged across every bookmaker that priced
 * the market — same "average across all real quotes" approach bzzoiro's
 * oddsNormalizer.ts used, adopted here 2026-09-18 in place of the previous
 * "first bookmaker from a curated preference order" behavior (a single
 * bookmaker's price is one opinion, not BET62's line). Every price is run
 * through proplineNormalizeOddsPrice before being averaged (see its own
 * comment — requesting oddsFormat: "decimal" doesn't guarantee a decimal
 * response, so a stray American price must be converted before it's mixed
 * into an average with real decimal ones). Returns null (never a
 * fabricated price) when no bookmaker priced this market at all. */
export function extractProplineH2HOdds(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
  threeWay: boolean,
): { home: number; draw: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homePrices: number[] = [];
  const awayPrices: number[] = [];
  const drawPrices: number[] = [];
  for (const bm of bookmakers) {
    const prices = extractH2HFromBookmaker(bm, home, away, threeWay);
    if (!prices) continue;
    homePrices.push(proplineNormalizeOddsPrice(prices.home));
    awayPrices.push(proplineNormalizeOddsPrice(prices.away));
    if (threeWay && prices.draw != null) drawPrices.push(proplineNormalizeOddsPrice(prices.draw));
  }
  if (homePrices.length === 0 || awayPrices.length === 0) return null;
  if (threeWay && drawPrices.length === 0) return null;
  return {
    home: average(homePrices),
    draw: threeWay ? average(drawPrices) : 0,
    away: average(awayPrices),
  };
}

/** Soccer's standard Over/Under lines — the only ones AdvancedMarkets.totalGoals
 * has slots for. PropLine's real `totals` market (confirmed 2026-09-18,
 * markets=totals against real EPL/LaLiga/etc events) carries a `point` per
 * outcome (e.g. 2.5) set independently by each bookmaker — this only keeps
 * a bookmaker's quote when its point lands on one of these seven lines
 * (within float rounding), rather than forcing every odd line into a
 * nearest-neighbor bucket. */
const TOTAL_GOALS_LINES: Array<[number, string]> = [
  [0.5, "05"],
  [1.5, "15"],
  [2.5, "25"],
  [3.5, "35"],
  [4.5, "45"],
  [5.5, "55"],
  [6.5, "65"],
];

export type ProplineTotalGoals = Partial<{
  over05: number; under05: number;
  over15: number; under15: number;
  over25: number; under25: number;
  over35: number; under35: number;
  over45: number; under45: number;
  over55: number; under55: number;
  over65: number; under65: number;
}>;

/** Over/Under (total goals), averaged per line across every bookmaker that
 * quoted that exact line — same "average across all real quotes" policy as
 * extractProplineH2HOdds. Confirmed real market key `totals`, outcomes
 * named "Over"/"Under" with a numeric `point` (2026-09-18). Returns null
 * (never a fabricated line) when no bookmaker priced any of the seven
 * standard lines. */
export function extractProplineTotalGoals(
  bookmakers: ProplineBookmaker[] | null | undefined,
): ProplineTotalGoals | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const byLine = new Map<string, { over: number[]; under: number[] }>();
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "totals");
    if (!market) continue;
    for (const o of market.outcomes) {
      if (o.point == null) continue;
      const line = TOTAL_GOALS_LINES.find(([value]) => Math.abs(value - o.point!) < 0.01);
      if (!line) continue;
      const suffix = line[1];
      const bucket = byLine.get(suffix) ?? { over: [], under: [] };
      const name = (o.name || "").toLowerCase();
      const price = proplineNormalizeOddsPrice(o.price);
      if (name === "over") bucket.over.push(price);
      else if (name === "under") bucket.under.push(price);
      byLine.set(suffix, bucket);
    }
  }
  const result: Record<string, number> = {};
  for (const [suffix, bucket] of byLine) {
    if (bucket.over.length === 0 || bucket.under.length === 0) continue;
    result[`over${suffix}`] = average(bucket.over);
    result[`under${suffix}`] = average(bucket.under);
  }
  return Object.keys(result).length > 0 ? (result as ProplineTotalGoals) : null;
}

/** Asian handicap, averaged across every bookmaker quoting the SAME line
 * (mixing a -0.25 line with a -0.75 line into one average would misprice
 * both) — the most-quoted line wins, same "real coverage decides" approach
 * matchFixtureRef matching already uses elsewhere. Confirmed real market
 * key `spreads`, outcomes named by team with a numeric `point`
 * (2026-09-18, e.g. Tottenham -0.25 / Aston Villa +0.25). Team-name
 * matching reuses isFuzzyMatch (same normalization tolerance as h2h) since
 * a bookmaker's outcome name doesn't always match the fixture's full team
 * name exactly. Returns null when no bookmaker priced this market. */
export function extractProplineAsianHandicap(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { line: number; home: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const byLine = new Map<number, { home: number[]; away: number[] }>();
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "spreads");
    if (!market) continue;
    let homePoint: number | null = null;
    let homePrice: number | null = null;
    let awayPrice: number | null = null;
    for (const o of market.outcomes) {
      if (o.point == null) continue;
      const outcomeNorm = normalizeTeamName(o.name || "");
      if (isFuzzyMatch(outcomeNorm, homeNorm, 0.22)) {
        homePoint = o.point;
        homePrice = o.price;
      } else if (isFuzzyMatch(outcomeNorm, awayNorm, 0.22)) {
        awayPrice = o.price;
      }
    }
    if (homePoint == null || homePrice == null || awayPrice == null) continue;
    const bucket = byLine.get(homePoint) ?? { home: [], away: [] };
    bucket.home.push(proplineNormalizeOddsPrice(homePrice));
    bucket.away.push(proplineNormalizeOddsPrice(awayPrice));
    byLine.set(homePoint, bucket);
  }
  let bestLine: number | null = null;
  let bestCount = -1;
  for (const [line, bucket] of byLine) {
    const count = bucket.home.length + bucket.away.length;
    if (count > bestCount) {
      bestLine = line;
      bestCount = count;
    }
  }
  if (bestLine == null) return null;
  const bucket = byLine.get(bestLine);
  if (!bucket || bucket.home.length === 0 || bucket.away.length === 0) return null;
  return { line: bestLine, home: average(bucket.home), away: average(bucket.away) };
}

/** Both Teams To Score, averaged across every bookmaker — confirmed real
 * 2026-09-18 (market key `both_teams_to_score`, outcomes named "Yes"/"No").
 * Earlier check used the wrong key ("btts") and wrongly concluded this
 * market didn't exist for soccer; PropLine's own GET
 * /sports/{sport}/events/{id}/markets confirmed the real key. */
export function extractProplineBothTeamsToScore(
  bookmakers: ProplineBookmaker[] | null | undefined,
): { yes: number; no: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const yesPrices: number[] = [];
  const noPrices: number[] = [];
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "both_teams_to_score");
    if (!market) continue;
    for (const o of market.outcomes) {
      const name = (o.name || "").toLowerCase();
      const price = proplineNormalizeOddsPrice(o.price);
      if (name === "yes") yesPrices.push(price);
      else if (name === "no") noPrices.push(price);
    }
  }
  if (yesPrices.length === 0 || noPrices.length === 0) return null;
  return { yes: average(yesPrices), no: average(noPrices) };
}

/** Draw No Bet, averaged across every bookmaker — confirmed real
 * 2026-09-18 (market key `draw_no_bet`, outcomes named by team). Team-name
 * matching reuses isFuzzyMatch, same tolerance as h2h. */
export function extractProplineDrawNoBet(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { home: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const homePrices: number[] = [];
  const awayPrices: number[] = [];
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "draw_no_bet");
    if (!market) continue;
    for (const o of market.outcomes) {
      const outcomeNorm = normalizeTeamName(o.name || "");
      const price = proplineNormalizeOddsPrice(o.price);
      if (isFuzzyMatch(outcomeNorm, homeNorm, 0.22)) homePrices.push(price);
      else if (isFuzzyMatch(outcomeNorm, awayNorm, 0.22)) awayPrices.push(price);
    }
  }
  if (homePrices.length === 0 || awayPrices.length === 0) return null;
  return { home: average(homePrices), away: average(awayPrices) };
}

/** Double Chance, averaged across every bookmaker — confirmed real
 * 2026-09-18 (market key `double_chance`, outcomes named "{Team} or Draw"
 * / "{TeamA} or {TeamB}", e.g. "Aston Villa or Draw"). Splits each
 * outcome's name on " or " and classifies each side as home/draw/away via
 * isFuzzyMatch, same tolerance as h2h — order-independent since bookmakers
 * don't agree on which side comes first. */
export function extractProplineDoubleChance(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { homeOrDraw: number; awayOrDraw: number; homeOrAway: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const homeOrDrawPrices: number[] = [];
  const awayOrDrawPrices: number[] = [];
  const homeOrAwayPrices: number[] = [];
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "double_chance");
    if (!market) continue;
    for (const o of market.outcomes) {
      const parts = (o.name || "").split(/\s+or\s+/i).map((p) => normalizeTeamName(p));
      if (parts.length !== 2) continue;
      const isDraw = (p: string) => p === "draw";
      const isHome = (p: string) => isFuzzyMatch(p, homeNorm, 0.22);
      const isAway = (p: string) => isFuzzyMatch(p, awayNorm, 0.22);
      const price = proplineNormalizeOddsPrice(o.price);
      if (parts.some(isHome) && parts.some(isDraw)) homeOrDrawPrices.push(price);
      else if (parts.some(isAway) && parts.some(isDraw)) awayOrDrawPrices.push(price);
      else if (parts.some(isHome) && parts.some(isAway)) homeOrAwayPrices.push(price);
    }
  }
  if (homeOrDrawPrices.length === 0 || awayOrDrawPrices.length === 0 || homeOrAwayPrices.length === 0) return null;
  return {
    homeOrDraw: average(homeOrDrawPrices),
    awayOrDraw: average(awayOrDrawPrices),
    homeOrAway: average(homeOrAwayPrices),
  };
}

/** Half Time / Full Time, averaged per combo across every bookmaker —
 * confirmed real 2026-09-18 (market key `half_time_full_time`, outcomes
 * named "{HT result} / {FT result}", e.g. "Tottenham / Aston Villa"). Only
 * returns a result when all 9 combos (hh..aa) got at least one real quote —
 * AdvancedMarkets.htft has no partial form, and filling the missing combos
 * with 0 would look like a real (and very wrong) quote rather than an
 * absent one. */
export function extractProplineHalfTimeFullTime(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): {
  hh: number; hd: number; ha: number;
  dh: number; dd: number; da: number;
  ah: number; ad: number; aa: number;
} | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const classify = (label: string): "h" | "d" | "a" | null => {
    const norm = normalizeTeamName(label);
    if (norm === "draw") return "d";
    if (isFuzzyMatch(norm, homeNorm, 0.22)) return "h";
    if (isFuzzyMatch(norm, awayNorm, 0.22)) return "a";
    return null;
  };
  const buckets = new Map<string, number[]>();
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "half_time_full_time");
    if (!market) continue;
    for (const o of market.outcomes) {
      const parts = (o.name || "").split("/").map((p) => p.trim());
      if (parts.length !== 2) continue;
      const ht = classify(parts[0]);
      const ft = classify(parts[1]);
      if (!ht || !ft) continue;
      const key = `${ht}${ft}`;
      const list = buckets.get(key) ?? [];
      list.push(proplineNormalizeOddsPrice(o.price));
      buckets.set(key, list);
    }
  }
  const result: Record<string, number> = {};
  for (const [key, prices] of buckets) {
    if (prices.length === 0) continue;
    result[key] = average(prices);
  }
  const keys = ["hh", "hd", "ha", "dh", "dd", "da", "ah", "ad", "aa"];
  if (!keys.every((k) => k in result)) return null;
  return result as {
    hh: number; hd: number; ha: number;
    dh: number; dd: number; da: number;
    ah: number; ad: number; aa: number;
  };
}

/** Correct Score, averaged per exact score across every bookmaker —
 * confirmed real 2026-09-18 (market key `correct_score`, outcomes named
 * "H - A", e.g. "2 - 1"). Key format `"${home}-${away}"` matches the
 * convention pulsescore/normalizer.ts's own correct-score extraction
 * already uses (settlement/frontend key on exact score, not the raw
 * "H - A" spacing). */
export function extractProplineCorrectScore(
  bookmakers: ProplineBookmaker[] | null | undefined,
): Record<string, number> | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const buckets = new Map<string, number[]>();
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "correct_score");
    if (!market) continue;
    for (const o of market.outcomes) {
      const m = (o.name || "").match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) continue;
      const key = `${parseInt(m[1]!, 10)}-${parseInt(m[2]!, 10)}`;
      const list = buckets.get(key) ?? [];
      list.push(proplineNormalizeOddsPrice(o.price));
      buckets.set(key, list);
    }
  }
  const result: Record<string, number> = {};
  for (const [key, prices] of buckets) {
    if (prices.length === 0) continue;
    result[key] = average(prices);
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Shared by extractProplineTotalCorners/extractProplineTotalCards below —
 * groups an Over/Under market's outcomes by their exact `point` line
 * across every bookmaker, same "average across all real quotes" policy as
 * extractProplineTotalGoals (kept separate from that function rather than
 * generalized into it, so an edit here can't accidentally change the
 * already-shipped/tested totalGoals behavior). */
function groupOverUnderByPoint(
  bookmakers: ProplineBookmaker[] | null | undefined,
  marketKey: string,
): Map<number, { over: number[]; under: number[] }> {
  const byPoint = new Map<number, { over: number[]; under: number[] }>();
  if (!bookmakers) return byPoint;
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === marketKey);
    if (!market) continue;
    for (const o of market.outcomes) {
      if (o.point == null) continue;
      const name = (o.name || "").toLowerCase();
      if (name !== "over" && name !== "under") continue;
      const bucket = byPoint.get(o.point) ?? { over: [], under: [] };
      const price = proplineNormalizeOddsPrice(o.price);
      if (name === "over") bucket.over.push(price);
      else bucket.under.push(price);
      byPoint.set(o.point, bucket);
    }
  }
  return byPoint;
}

const CORNERS_LINES: Array<[number, string]> = [
  [8.5, "85"],
  [9.5, "95"],
  [10.5, "105"],
];

export type ProplineTotalCorners = Partial<{ o85: number; u85: number; o95: number; u95: number; o105: number; u105: number }>;

/** Total Corners, averaged per line — confirmed real 2026-09-18 (market key
 * `total_corners`, outcomes "Over"/"Under" with a numeric `point`, e.g.
 * 10.5). Only keeps the three lines AdvancedMarkets.corners has slots for. */
export function extractProplineTotalCorners(
  bookmakers: ProplineBookmaker[] | null | undefined,
): ProplineTotalCorners | null {
  const byPoint = groupOverUnderByPoint(bookmakers, "total_corners");
  const result: Record<string, number> = {};
  for (const [point, bucket] of byPoint) {
    const line = CORNERS_LINES.find(([value]) => Math.abs(value - point) < 0.01);
    if (!line || bucket.over.length === 0 || bucket.under.length === 0) continue;
    result[`o${line[1]}`] = average(bucket.over);
    result[`u${line[1]}`] = average(bucket.under);
  }
  return Object.keys(result).length > 0 ? (result as ProplineTotalCorners) : null;
}

const CARDS_LINES: Array<[number, string]> = [
  [3.5, "35"],
  [4.5, "45"],
];

export type ProplineTotalCards = Partial<{ o35: number; u35: number; o45: number; u45: number }>;

/** Total Cards, averaged per line — confirmed real 2026-09-18 (market key
 * `total_cards`, outcomes "Over"/"Under" with a numeric `point`, e.g. 3.5).
 * Only keeps the two lines AdvancedMarkets.cards has slots for. */
export function extractProplineTotalCards(
  bookmakers: ProplineBookmaker[] | null | undefined,
): ProplineTotalCards | null {
  const byPoint = groupOverUnderByPoint(bookmakers, "total_cards");
  const result: Record<string, number> = {};
  for (const [point, bucket] of byPoint) {
    const line = CARDS_LINES.find(([value]) => Math.abs(value - point) < 0.01);
    if (!line || bucket.over.length === 0 || bucket.under.length === 0) continue;
    result[`o${line[1]}`] = average(bucket.over);
    result[`u${line[1]}`] = average(bucket.under);
  }
  return Object.keys(result).length > 0 ? (result as ProplineTotalCards) : null;
}

/** Per-team corners, one dynamic line each (whichever the bookmakers
 * actually offer, same "book decides the line" approach corners already
 * documents for other sports) — confirmed real 2026-09-18 (market key
 * `team_corners`, outcomes "Over"/"Under" with a numeric `point` AND a
 * `description` carrying the team name, e.g. point 4.5 / description
 * "Aston Villa"). Team-name matching reuses isFuzzyMatch. Each side picks
 * whichever line has the most bookmaker coverage, same policy as
 * extractProplineAsianHandicap. */
export function extractProplineTeamCorners(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): {
  home: { line: number; over: number; under: number } | null;
  away: { line: number; over: number; under: number } | null;
} {
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const homeByPoint = new Map<number, { over: number[]; under: number[] }>();
  const awayByPoint = new Map<number, { over: number[]; under: number[] }>();
  if (bookmakers) {
    for (const bm of bookmakers) {
      const market = bm.markets.find((m) => m.key === "team_corners");
      if (!market) continue;
      for (const o of market.outcomes) {
        if (o.point == null) continue;
        const name = (o.name || "").toLowerCase();
        if (name !== "over" && name !== "under") continue;
        const teamLabel = normalizeTeamName(o.description || "");
        let bucketMap: Map<number, { over: number[]; under: number[] }> | null = null;
        if (isFuzzyMatch(teamLabel, homeNorm, 0.22)) bucketMap = homeByPoint;
        else if (isFuzzyMatch(teamLabel, awayNorm, 0.22)) bucketMap = awayByPoint;
        if (!bucketMap) continue;
        const bucket = bucketMap.get(o.point) ?? { over: [], under: [] };
        const price = proplineNormalizeOddsPrice(o.price);
        if (name === "over") bucket.over.push(price);
        else bucket.under.push(price);
        bucketMap.set(o.point, bucket);
      }
    }
  }
  const pickBest = (
    map: Map<number, { over: number[]; under: number[] }>,
  ): { line: number; over: number; under: number } | null => {
    let bestLine: number | null = null;
    let bestCount = -1;
    for (const [line, bucket] of map) {
      const count = bucket.over.length + bucket.under.length;
      if (count > bestCount) {
        bestLine = line;
        bestCount = count;
      }
    }
    if (bestLine == null) return null;
    const bucket = map.get(bestLine);
    if (!bucket || bucket.over.length === 0 || bucket.under.length === 0) return null;
    return { line: bestLine, over: average(bucket.over), under: average(bucket.under) };
  };
  return { home: pickBest(homeByPoint), away: pickBest(awayByPoint) };
}

/** Corners Handicap (Asian-style spread on corner count) — confirmed real
 * 2026-09-18 (market key `corners_spread`, outcomes named by team with a
 * signed `point` per bookmaker, e.g. Tottenham point=-1 price=-132 /
 * Aston Villa point=1 price=102). Identical shape to `spreads` (Asian
 * handicap on the match score), same line-selection policy as
 * extractProplineAsianHandicap: pick whichever line the most bookmakers
 * quote, then average prices at that line. */
export function extractProplineCornersHandicap(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { line: number; home: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const byLine = new Map<number, { home: number[]; away: number[] }>();
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "corners_spread");
    if (!market) continue;
    let homePoint: number | null = null;
    let homePrice: number | null = null;
    let awayPrice: number | null = null;
    for (const o of market.outcomes) {
      if (o.point == null) continue;
      const outcomeNorm = normalizeTeamName(o.name || "");
      if (isFuzzyMatch(outcomeNorm, homeNorm, 0.22)) {
        homePoint = o.point;
        homePrice = o.price;
      } else if (isFuzzyMatch(outcomeNorm, awayNorm, 0.22)) {
        awayPrice = o.price;
      }
    }
    if (homePoint == null || homePrice == null || awayPrice == null) continue;
    const bucket = byLine.get(homePoint) ?? { home: [], away: [] };
    bucket.home.push(proplineNormalizeOddsPrice(homePrice));
    bucket.away.push(proplineNormalizeOddsPrice(awayPrice));
    byLine.set(homePoint, bucket);
  }
  let bestLine: number | null = null;
  let bestCount = -1;
  for (const [line, bucket] of byLine) {
    const count = bucket.home.length + bucket.away.length;
    if (count > bestCount) {
      bestLine = line;
      bestCount = count;
    }
  }
  if (bestLine == null) return null;
  const bucket = byLine.get(bestLine);
  if (!bucket || bucket.home.length === 0 || bucket.away.length === 0) return null;
  return { line: bestLine, home: average(bucket.home), away: average(bucket.away) };
}

/** Team Cards O/U (per-team card count) — confirmed real 2026-09-18
 * (market key `team_cards`, outcomes "Over"/"Under" with a numeric
 * `point` AND a `description` carrying the team name — identical shape
 * to `team_corners`). Same per-side best-line policy as
 * extractProplineTeamCorners. */
export function extractProplineTeamCards(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): {
  home: { line: number; over: number; under: number } | null;
  away: { line: number; over: number; under: number } | null;
} {
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const homeByPoint = new Map<number, { over: number[]; under: number[] }>();
  const awayByPoint = new Map<number, { over: number[]; under: number[] }>();
  if (bookmakers) {
    for (const bm of bookmakers) {
      const market = bm.markets.find((m) => m.key === "team_cards");
      if (!market) continue;
      for (const o of market.outcomes) {
        if (o.point == null) continue;
        const name = (o.name || "").toLowerCase();
        if (name !== "over" && name !== "under") continue;
        const teamLabel = normalizeTeamName(o.description || "");
        let bucketMap: Map<number, { over: number[]; under: number[] }> | null = null;
        if (isFuzzyMatch(teamLabel, homeNorm, 0.22)) bucketMap = homeByPoint;
        else if (isFuzzyMatch(teamLabel, awayNorm, 0.22)) bucketMap = awayByPoint;
        if (!bucketMap) continue;
        const bucket = bucketMap.get(o.point) ?? { over: [], under: [] };
        const price = proplineNormalizeOddsPrice(o.price);
        if (name === "over") bucket.over.push(price);
        else bucket.under.push(price);
        bucketMap.set(o.point, bucket);
      }
    }
  }
  const pickBest = (
    map: Map<number, { over: number[]; under: number[] }>,
  ): { line: number; over: number; under: number } | null => {
    let bestLine: number | null = null;
    let bestCount = -1;
    for (const [line, bucket] of map) {
      const count = bucket.over.length + bucket.under.length;
      if (count > bestCount) {
        bestLine = line;
        bestCount = count;
      }
    }
    if (bestLine == null) return null;
    const bucket = map.get(bestLine);
    if (!bucket || bucket.over.length === 0 || bucket.under.length === 0) return null;
    return { line: bestLine, over: average(bucket.over), under: average(bucket.under) };
  };
  return { home: pickBest(homeByPoint), away: pickBest(awayByPoint) };
}

/** European Handicap, averaged across every bookmaker quoting the SAME
 * line — confirmed real 2026-09-18 (market key `european_handicap`,
 * 3 outcomes named by team + "Draw", sharing one `point` per bookmaker,
 * e.g. Tottenham -332 / Draw 495 / Aston Villa 775, all at point=1).
 * Genuinely different from extractProplineAsianHandicap/`spreads`: this is
 * a real 3-way result market on the handicap-adjusted score (the draw
 * outcome pays its own real price), not a 2-way line with a push on an
 * exact-margin tie — so it needs its own field/settlement, not reuse of
 * the existing 2-way `handicap`/`asianHandicap` ones. Sign convention:
 * `point` is subtracted from the home score before comparing (so a
 * positive point — the common case, the away side's head start — makes
 * the home side need to win by MORE than `point` to cover; a negative
 * point flips that, same generalization spreads/asianHandicap already
 * use for signed lines). */
export function extractProplineEuropeanHandicap(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { line: number; home: number; draw: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const byLine = new Map<number, { home: number[]; draw: number[]; away: number[] }>();
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "european_handicap");
    if (!market) continue;
    const byPoint = new Map<number, { home: number | null; draw: number | null; away: number | null }>();
    for (const o of market.outcomes) {
      if (o.point == null) continue;
      const entry = byPoint.get(o.point) ?? { home: null, draw: null, away: null };
      const outcomeNorm = normalizeTeamName(o.name || "");
      if (outcomeNorm === "draw") entry.draw = o.price;
      else if (isFuzzyMatch(outcomeNorm, homeNorm, 0.22)) entry.home = o.price;
      else if (isFuzzyMatch(outcomeNorm, awayNorm, 0.22)) entry.away = o.price;
      byPoint.set(o.point, entry);
    }
    for (const [point, entry] of byPoint) {
      if (entry.home == null || entry.draw == null || entry.away == null) continue;
      const bucket = byLine.get(point) ?? { home: [], draw: [], away: [] };
      bucket.home.push(proplineNormalizeOddsPrice(entry.home));
      bucket.draw.push(proplineNormalizeOddsPrice(entry.draw));
      bucket.away.push(proplineNormalizeOddsPrice(entry.away));
      byLine.set(point, bucket);
    }
  }
  let bestLine: number | null = null;
  let bestCount = -1;
  for (const [line, bucket] of byLine) {
    const count = bucket.home.length + bucket.draw.length + bucket.away.length;
    if (count > bestCount) {
      bestLine = line;
      bestCount = count;
    }
  }
  if (bestLine == null) return null;
  const bucket = byLine.get(bestLine);
  if (!bucket || bucket.home.length === 0 || bucket.draw.length === 0 || bucket.away.length === 0) return null;
  return {
    line: bestLine,
    home: average(bucket.home),
    draw: average(bucket.draw),
    away: average(bucket.away),
  };
}

function normalizePersonName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Real bug found 2026-09-18: PropLine and GOAL API spell the SAME real
 * player differently often enough to matter — confirmed live in
 * production (Central Córdoba vs Defensa y Justicia, 2026-09-18): GOAL
 * API's own lineup has "Alejandro Maciel" and "Facundo Mansilla" where
 * PropLine's roster has "Alejandro Ramon Maciel" and "Zahir Facundo
 * Mansilla" — neither is even a plain substring of the other, so a naive
 * exact-or-substring check misses both. settlement.ts's player-market
 * grading (parseSelectionPlayerMarket) is an EXACT match against GOAL
 * API's own live goal-event names with no fuzzy fallback, so
 * extractProplineGoalscorerMatchedToRoster below never uses PropLine's own
 * spelling as the player identity — only GOAL API's, matched here via last
 * name (exact) plus at least one more shared name token, which correctly
 * resolves both real cases above without needing an exact full-name match. */
function isFuzzyPersonNameMatch(rosterName: string, proplineName: string): boolean {
  if (!rosterName || !proplineName) return false;
  if (rosterName === proplineName) return true;
  const rParts = rosterName.split(" ").filter(Boolean);
  const pParts = proplineName.split(" ").filter(Boolean);
  if (rParts.length === 0 || pParts.length === 0) return false;
  const rLast = rParts[rParts.length - 1];
  const pLast = pParts[pParts.length - 1];
  if (rLast !== pLast) return false;
  if (rParts.length === 1 || pParts.length === 1) return true;
  const pSet = new Set(pParts);
  return rParts.slice(0, -1).some((part) => pSet.has(part));
}

/** Anytime/First Goalscorer, matched against GOAL API's own real lineup —
 * never PropLine's own player-name spelling (see isFuzzyPersonNameMatch's
 * comment for the real, confirmed-in-production reason). `rosterNames` is
 * GOAL API's real lineup (starting XI + substitutes) for this exact
 * fixture; a PropLine outcome that doesn't confidently match any of them
 * is dropped rather than guessed. Never averaged across bookmakers (unlike
 * every other market here) — the richest single bookmaker's outcome list
 * wins, since player-prop coverage/pricing varies too much book to book to
 * average meaningfully. Returns null when lineups aren't posted yet
 * (`rosterNames` empty) or PropLine has no real roster for this market. */
export function extractProplineGoalscorerMatchedToRoster(
  bookmakers: ProplineBookmaker[] | null | undefined,
  marketKey: "anytime_goal_scorer" | "first_goal_scorer",
  rosterNames: string[],
): Array<{ player: string; odds: number }> | null {
  if (!bookmakers || bookmakers.length === 0 || rosterNames.length === 0) return null;
  let bestOutcomes: ProplineBookmaker["markets"][number]["outcomes"] | null = null;
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === marketKey);
    if (market && market.outcomes.length > (bestOutcomes?.length ?? 0)) {
      bestOutcomes = market.outcomes;
    }
  }
  if (!bestOutcomes) return null;
  const rosterNormalized = rosterNames.map((r) => ({ raw: r, norm: normalizePersonName(r) }));
  const result: Array<{ player: string; odds: number }> = [];
  const seen = new Set<string>();
  for (const o of bestOutcomes) {
    if (marketKey === "anytime_goal_scorer" && (o.name || "").toLowerCase() !== "yes") continue;
    const raw = (o.description || o.name || "").trim();
    if (!raw || raw.toLowerCase() === "no goalscorer") continue;
    const cleaned = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const proplineNorm = normalizePersonName(cleaned);
    const match = rosterNormalized.find((r) => isFuzzyPersonNameMatch(r.norm, proplineNorm));
    if (!match || seen.has(match.raw)) continue;
    seen.add(match.raw);
    result.push({ player: match.raw, odds: proplineNormalizeOddsPrice(o.price) });
  }
  return result.length > 0 ? result : null;
}

/** Win To Nil, averaged across every bookmaker — confirmed real 2026-09-18
 * (market key `to_win_without_conceding`, outcomes named by team only, no
 * draw/third outcome). Maps directly onto the existing `winToNil` field —
 * settlement.ts's wtn-h/wtn-a already grade this straight off the final
 * score (`home > away && away === 0`), no extra data needed, so this is
 * safe to bet on the moment it's priced. */
export function extractProplineWinToNil(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { home: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const homePrices: number[] = [];
  const awayPrices: number[] = [];
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "to_win_without_conceding");
    if (!market) continue;
    for (const o of market.outcomes) {
      const outcomeNorm = normalizeTeamName(o.name || "");
      const price = proplineNormalizeOddsPrice(o.price);
      if (isFuzzyMatch(outcomeNorm, homeNorm, 0.22)) homePrices.push(price);
      else if (isFuzzyMatch(outcomeNorm, awayNorm, 0.22)) awayPrices.push(price);
    }
  }
  if (homePrices.length === 0 || awayPrices.length === 0) return null;
  return { home: average(homePrices), away: average(awayPrices) };
}

/** First Team To Score, averaged across every bookmaker — confirmed real
 * 2026-09-18 (market key `first_team_to_score`, 3 outcomes: home team,
 * away team, "Neither"). Maps directly onto the existing `firstGoal`
 * field. Real settlement gap fixed alongside this (2026-09-18):
 * fg-home/fg-away/fg-none reads extra.firstGoal, which was declared
 * everywhere but never actually SET for GOAL API football — a bet here
 * would have sat pending forever without routes/matches.ts's live builder
 * now deriving it from footballGoalLog's first real goal event. */
export function extractProplineFirstTeamToScore(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
): { home: number; noGoal: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const homeNorm = normalizeTeamName(home);
  const awayNorm = normalizeTeamName(away);
  const homePrices: number[] = [];
  const awayPrices: number[] = [];
  const noGoalPrices: number[] = [];
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === "first_team_to_score");
    if (!market) continue;
    for (const o of market.outcomes) {
      const outcomeNorm = normalizeTeamName(o.name || "");
      const price = proplineNormalizeOddsPrice(o.price);
      if (outcomeNorm === "neither" || outcomeNorm === "none") noGoalPrices.push(price);
      else if (isFuzzyMatch(outcomeNorm, homeNorm, 0.22)) homePrices.push(price);
      else if (isFuzzyMatch(outcomeNorm, awayNorm, 0.22)) awayPrices.push(price);
    }
  }
  if (homePrices.length === 0 || awayPrices.length === 0 || noGoalPrices.length === 0) return null;
  return { home: average(homePrices), noGoal: average(noGoalPrices), away: average(awayPrices) };
}

/** Extracts {home, away, status} from a ProplineScore entry defensively —
 * the real /scores payload shape wasn't re-confirmed against a live sample
 * for this restoration (no API key available in this environment), so this
 * accepts either the explicit home_score/away_score/status/period fields
 * confirmed real in this session's earlier PropLine work, or the generic
 * `scores: [{name, score}]` pairing the-odds-api-style APIs also use —
 * matched back to home/away by team name. Returns null (never a fabricated
 * 0-0) when neither shape yields a usable pair. */
export function extractProplineScore(
  ev: ProplineScore & {
    home_score?: number | string | null;
    away_score?: number | string | null;
    status?: string | null;
    period?: string | null;
    live?: boolean | null;
  },
): { home: number; away: number; status: string | null } | null {
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const direct = { home: toNum(ev.home_score), away: toNum(ev.away_score) };
  if (direct.home !== null && direct.away !== null) {
    return { home: direct.home, away: direct.away, status: ev.status ?? ev.period ?? null };
  }
  if (Array.isArray(ev.scores) && ev.scores.length >= 2) {
    const homeEntry = ev.scores.find((s) => s.name === ev.home_team);
    const awayEntry = ev.scores.find((s) => s.name === ev.away_team);
    const home = toNum(homeEntry?.score);
    const away = toNum(awayEntry?.score);
    if (home !== null && away !== null) {
      return { home, away, status: ev.completed ? "final" : null };
    }
  }
  return null;
}

/** ISO-datetime → { date: "DD.MM.YYYY", time: "HH:MM" } in Europe/Lisbon —
 * same helper this file has always used for every ISO-timestamp-based
 * provider (PulseScore, SportMonks); PropLine's commence_time is also a
 * real ISO string. */
export function proplineEventDateTime(startTime: string): { date: string; time: string } {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const hh = p["hour"] === "24" ? "00" : (p["hour"] ?? "00");
  const mm = p["minute"] ?? "00";
  return {
    date: `${p["day"] ?? "01"}.${p["month"] ?? "01"}.${p["year"] ?? "2025"}`,
    time: `${hh}:${mm}`,
  };
}

/** PropLine sometimes lists the exact same real-world fixture as two
 * separate events when a bookmaker/region reports a team's name in a
 * different language — confirmed in production 2026-09-09 with a
 * volleyball "Turkiye vs Alemanha" and "Turquia vs Alemanha" pair at the
 * same kickoff time and nearly identical odds. normalizeTeamName's
 * accent/case folding can't unify genuinely different-language spellings
 * of the same country, so this dedupes by exact kickoff date+time plus a
 * fuzzy match on at least one side's team name (checked both straight and
 * crossed, in case one language pairs differently) — keeping whichever
 * duplicate carries real bookmaker odds when only one of them does. */
export function dedupeProplineFixtures<
  T extends { date: string; time: string; home: string; away: string; hasRealOdds?: boolean },
>(matches: T[]): T[] {
  const kept: T[] = [];
  for (const m of matches) {
    const mHome = normalizeTeamName(m.home);
    const mAway = normalizeTeamName(m.away);
    const dupIndex = kept.findIndex((k) => {
      if (k.date !== m.date || k.time !== m.time) return false;
      const kHome = normalizeTeamName(k.home);
      const kAway = normalizeTeamName(k.away);
      return (
        isFuzzyMatch(kHome, mHome, 0.22) ||
        isFuzzyMatch(kAway, mAway, 0.22) ||
        isFuzzyMatch(kHome, mAway, 0.22) ||
        isFuzzyMatch(kAway, mHome, 0.22)
      );
    });
    if (dupIndex === -1) {
      kept.push(m);
      continue;
    }
    if (!kept[dupIndex].hasRealOdds && m.hasRealOdds) {
      kept[dupIndex] = m;
    }
  }
  return kept;
}
