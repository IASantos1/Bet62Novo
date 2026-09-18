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
