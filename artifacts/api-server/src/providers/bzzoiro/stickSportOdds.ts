// Shared odds-averaging helpers for bzzoiro's "stick sport" REST odds feed
// (basketball, hockey, darts all confirmed to share the exact same
// bookmakers/markets shape — see basketball.ts's BzzoiroStickSportOddsResponse
// header). Pure functions, no fetch — kept separate so every sport's client
// module can reuse the same averaging rules instead of re-deriving them.
import type { BzzoiroStickSportOddsResponse, BzzoiroStickSportMarketRow } from "./basketball.js";

/** Real decimal odds are already per-bookmaker; BET62 shows one number per
 * side, so we average across every bookmaker that priced it — same
 * approach already used for football's REST odds normalizer
 * (buildBzzoiroMarketsFromRestData). Returns null when no bookmaker priced
 * the side. */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Moneyline / 1X2 from the flat top-level `bookmakers` array. */
export function averageStickSportMoneyline(
  resp: BzzoiroStickSportOddsResponse,
): { home: number; draw: number; away: number } | null {
  const home = average(resp.bookmakers.map((b) => b.odds_home).filter((v): v is number => typeof v === "number"));
  const away = average(resp.bookmakers.map((b) => b.odds_away).filter((v): v is number => typeof v === "number"));
  if (home === null || away === null) return null;
  const draw = average(resp.bookmakers.map((b) => b.odds_draw).filter((v): v is number => typeof v === "number"));
  return { home, draw: draw ?? 0, away };
}

/** Picks the first market of a given kind at the full-time period (or with
 * no period reported, which the docs show as equivalent to FT) — the real
 * captured examples for every stick sport show at most one line per kind,
 * so "first" is the only line there normally is. */
function findMarket(
  resp: BzzoiroStickSportOddsResponse,
  kind: string,
): BzzoiroStickSportMarketRow | undefined {
  return resp.markets.find((m) => m.market_kind === kind && (!m.market_period || m.market_period === "FT"));
}

function averageSelection(market: BzzoiroStickSportMarketRow, selection: string): number | null {
  const prices = market.bookmakers
    .map((b) => b.prices[selection]?.price)
    .filter((v): v is number => typeof v === "number");
  return average(prices);
}

/** Point/goal spread (AH market) — real line + averaged home/away cover
 * prices, or null when no bookmaker quoted a spread for this event. */
export function averageStickSportSpread(
  resp: BzzoiroStickSportOddsResponse,
): { line: number; home: number; away: number } | null {
  const market = findMarket(resp, "AH");
  if (!market || market.market_line === null) return null;
  const home = averageSelection(market, "HOME");
  const away = averageSelection(market, "AWAY");
  if (home === null || away === null) return null;
  return { line: market.market_line, home, away };
}

/** Game total (OU market) — real line + averaged over/under prices, or
 * null when no bookmaker quoted a total for this event. */
export function averageStickSportTotal(
  resp: BzzoiroStickSportOddsResponse,
): { line: number; over: number; under: number } | null {
  const market = findMarket(resp, "OU");
  if (!market || market.market_line === null) return null;
  const over = averageSelection(market, "OVER");
  const under = averageSelection(market, "UNDER");
  if (over === null || under === null) return null;
  return { line: market.market_line, over, under };
}
