import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { getGoalFixtureResource, getGoalFixtures } from "../goal/client.js";
import {
  enrichGoalFixture,
  normalizeGoalFixtures,
  type GoalFixture,
} from "../goal/mapper.js";
import { getPropLineEvents, propLineEnabled } from "../propline/client.js";
import {
  freshestOpenMarkets,
  normalizePropLineEvents,
  normalizePropLineOdds,
  type NormalizedMarket,
  type PropLineEvent,
} from "../propline/mapper.js";

export type ProviderMatch = {
  provider: "goal_api" | "propline";
  id: string;
  sport: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  league: string;
  country: string;
  leagueId?: string;
  kickoffUtc?: string;
  homeScore: number;
  awayScore: number;
  status: string;
  minute: number;
  stadium?: string;
  referee?: string;
  events: GoalFixture["events"];
  statistics: Record<string, unknown>[];
  commentary: Array<{ id: string; time: string; text: string }>;
  odds: NormalizedMarket[];
  isLive: boolean;
};

const LIVE_ODDS_MAX_AGE_MS = CONFIG.PUSH_ODDS_MAX_AGE_MS;
const PREMATCH_ODDS_MAX_AGE_MS = CONFIG.PREMATCH_ODDS_MAX_AGE_MS;

const normalizeName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|club)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function sameEvent(a: GoalFixture, b: PropLineEvent): boolean {
  if (a.id === b.id) return true;
  const sameTeamIds =
    a.homeTeamId &&
    a.awayTeamId &&
    b.homeTeamId &&
    b.awayTeamId &&
    a.homeTeamId === b.homeTeamId &&
    a.awayTeamId === b.awayTeamId;
  if (sameTeamIds) {
    if (!a.kickoffUtc || !b.kickoffUtc) return true;
    const aTime = Date.parse(a.kickoffUtc);
    const bTime = Date.parse(b.kickoffUtc);
    return !Number.isFinite(aTime) || !Number.isFinite(bTime) || Math.abs(aTime - bTime) <= 20 * 60_000;
  }
  const similarity = (left: string, right: string): number => {
    const aTokens = new Set(normalizeName(left).split(" ").filter(Boolean));
    const bTokens = new Set(normalizeName(right).split(" ").filter(Boolean));
    if (!aTokens.size || !bTokens.size) return 0;
    const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
    return intersection / Math.max(aTokens.size, bTokens.size);
  };
  const teams = similarity(a.home, b.home) >= 0.6 && similarity(a.away, b.away) >= 0.6;
  if (!teams) return false;
  const leagueScore = (() => {
    const left = normalizeName(a.league);
    const right = normalizeName(b.league);
    if (!left || !right) return 1;
    if (left === right) return 1;
    const leftTokens = new Set(left.split(" ").filter(Boolean));
    const rightTokens = new Set(right.split(" ").filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;
    const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    return common / Math.max(leftTokens.size, rightTokens.size);
  })();
  if (leagueScore < 0.34) return false;
  if (!a.kickoffUtc || !b.kickoffUtc) return true;
  const aTime = Date.parse(a.kickoffUtc);
  const bTime = Date.parse(b.kickoffUtc);
  return !Number.isFinite(aTime) || !Number.isFinite(bTime) || Math.abs(aTime - bTime) <= 20 * 60_000;
}

function toProviderMatch(fixture: GoalFixture, odds: NormalizedMarket[]): ProviderMatch {
  return {
    provider: "goal_api",
    id: fixture.id,
    sport: "football",
    home: fixture.home,
    away: fixture.away,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    league: fixture.league,
    country: fixture.country,
    leagueId: fixture.leagueId,
    kickoffUtc: fixture.kickoffUtc,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    status: fixture.status,
    minute: fixture.minute,
    stadium: fixture.stadium,
    referee: fixture.referee,
    events: fixture.events,
    statistics: fixture.statistics,
    commentary: fixture.commentary,
    odds,
    isLive: !["NS", "NOT_STARTED", "SCHEDULED"].includes(fixture.status.toUpperCase()),
  };
}

function toPropLineMatch(event: PropLineEvent, odds: NormalizedMarket[]): ProviderMatch {
  const kickoff = event.kickoffUtc ? Date.parse(event.kickoffUtc) : Number.NaN;
  const elapsedMinutes = Number.isFinite(kickoff)
    ? Math.max(0, Math.floor((Date.now() - kickoff) / 60_000))
    : 0;
  const inferredLiveStatus = (() => {
    if (event.status.toUpperCase() !== "LIVE") return event.status;
    if (event.sport === "tennis" || event.sport === "table-tennis") {
      const maxSets = event.sport === "tennis" ? 3 : 5;
      return `S${Math.min(maxSets, Math.floor(elapsedMinutes / 50) + 1)}`;
    }
    if (event.sport === "basketball") {
      return `Q${Math.min(4, Math.floor(elapsedMinutes / 30) + 1)}`;
    }
    if (event.sport === "hockey") {
      return `P${Math.min(3, Math.floor(elapsedMinutes / 35) + 1)}`;
    }
    if (event.sport === "baseball") {
      const inning = Math.min(9, Math.floor(elapsedMinutes / 25) + 1);
      return `${inning}th Inning`;
    }
    if (event.sport === "volleyball") {
      return `S${Math.min(5, Math.floor(elapsedMinutes / 30) + 1)}`;
    }
    return event.status;
  })();
  return {
    provider: "propline",
    id: event.id,
    sport: event.sport,
    home: event.home,
    away: event.away,
    homeTeamId: event.homeTeamId,
    awayTeamId: event.awayTeamId,
    league: event.league,
    country: event.country,
    kickoffUtc: event.kickoffUtc,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    status: inferredLiveStatus,
    minute: event.minute || elapsedMinutes,
    events: [],
    statistics: [],
    commentary: [],
    odds,
    isLive: event.status.toUpperCase() === "LIVE",
  };
}

export async function getGoalFootballMatches(options: {
  live?: boolean;
  from?: string;
  to?: string;
} = {}): Promise<ProviderMatch[]> {
  if (!CONFIG.GOAL_API_KEY) return [];
  const fixtures = normalizeGoalFixtures(await getGoalFixtures(options));
  const enriched: GoalFixture[] = [];
  if (options.live) {
    const concurrency = 4;
    for (let index = 0; index < fixtures.length; index += concurrency) {
      enriched.push(...await Promise.all(
        fixtures
          .slice(index, index + concurrency)
          .map((fixture) => enrichGoalFixture(fixture, true)),
      ));
    }
  } else {
    enriched.push(...fixtures);
  }
  const propEvents = propLineEnabled()
    ? normalizePropLineEvents(await getPropLineEvents({ sport: "football", live: options.live, from: options.from, to: options.to }), "football")
    : [];
  const output: ProviderMatch[] = [];
  for (const fixture of enriched) {
    const matchingEvent = propEvents.find((event) => sameEvent(fixture, event));
    let odds = matchingEvent
      ? freshestOpenMarkets(
          normalizePropLineOdds(matchingEvent.raw),
          options.live ? LIVE_ODDS_MAX_AGE_MS : PREMATCH_ODDS_MAX_AGE_MS,
        )
      : [];
    if (odds.length === 0) {
      odds = normalizeGoalFallbackOdds(
        await getGoalFixtureResource(fixture.id, options.live ? "odds" : "odds"),
        Boolean(options.live),
      );
    }
    output.push(toProviderMatch(fixture, odds));
  }
  return output;
}

export async function getPropLineMatches(options: {
  sport: string;
  live?: boolean;
  from?: string;
  to?: string;
}): Promise<ProviderMatch[]> {
  if (!propLineEnabled()) return [];
  const events = normalizePropLineEvents(
    await getPropLineEvents(options),
    options.sport,
  ).filter((event) => event.sport === options.sport || options.sport === "other")
    .filter((event) => {
      if (!options.live || !event.kickoffUtc) return true;
      const kickoff = Date.parse(event.kickoffUtc);
      if (!Number.isFinite(kickoff)) return true;
      const elapsed = Date.now() - kickoff;
      const maxDurationBySport: Record<string, number> = {
        football: 4 * 60 * 60_000,
        tennis: 4 * 60 * 60_000,
        "table-tennis": 3 * 60 * 60_000,
        basketball: 4 * 60 * 60_000,
        hockey: 4 * 60 * 60_000,
        baseball: 7 * 60 * 60_000,
        volleyball: 4 * 60 * 60_000,
        cricket: 12 * 60 * 60_000,
      };
      return elapsed >= -15 * 60_000 &&
        elapsed <= (maxDurationBySport[options.sport] ?? 5 * 60 * 60_000);
    });
  return events.map((event) =>
    toPropLineMatch(
      event,
      freshestOpenMarkets(
        normalizePropLineOdds(event.raw),
        options.live ? LIVE_ODDS_MAX_AGE_MS : PREMATCH_ODDS_MAX_AGE_MS,
      ),
    ),
  );
}

export function providerMatchHasFreshOdds(match: ProviderMatch): boolean {
  return freshestOpenMarkets(
    match.odds,
    match.isLive ? LIVE_ODDS_MAX_AGE_MS : PREMATCH_ODDS_MAX_AGE_MS,
  ).length > 0;
}

function normalizeGoalFallbackOdds(value: unknown, live: boolean): NormalizedMarket[] {
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rows = Array.isArray(root["data"]) ? root["data"] : Array.isArray(value) ? value : [];
  const receivedTimestamp = Date.now();
  return freshestOpenMarkets(
    rows.flatMap((candidate): NormalizedMarket[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const row = candidate as Record<string, unknown>;
      const oddsDecimal = Number(row["value"]);
      const sourceTimestamp = Date.parse(
        String(row["updatedAt"] ?? row["providerUpdatedAt"] ?? ""),
      );
      if (!Number.isFinite(oddsDecimal) || oddsDecimal <= 1.001 || !Number.isFinite(sourceTimestamp)) return [];
      return [{
        bookmaker: "goal_api",
        market: String(row["oddName"] ?? ""),
        selection: String(row["type"] ?? ""),
        selectionId: String(row["id"] ?? "") || undefined,
        line: row["handicap"] == null ? undefined : Number(row["handicap"]),
        oddsDecimal,
        status: String(row["suspended"] ?? "").toLowerCase() === "yes" ? "SUSPENDED" : "OPEN",
        sourceTimestamp,
        receivedTimestamp,
      }];
    }),
    live ? LIVE_ODDS_MAX_AGE_MS : PREMATCH_ODDS_MAX_AGE_MS,
  );
}

const simplify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function isMarket(market: NormalizedMarket, patterns: RegExp[]): boolean {
  const value = simplify(`${market.market} ${market.period ?? ""}`);
  return patterns.some((pattern) => pattern.test(value));
}

function selectionIs(market: NormalizedMarket, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(simplify(market.selection)));
}

function grouped(
  markets: NormalizedMarket[],
  marketPatterns: RegExp[],
): Map<string, NormalizedMarket[]> {
  const groups = new Map<string, NormalizedMarket[]>();
  for (const market of markets) {
    if (!isMarket(market, marketPatterns)) continue;
    const key = `${market.bookmaker}|${market.market}|${market.period ?? ""}|${market.line ?? ""}`;
    const rows = groups.get(key) ?? [];
    rows.push(market);
    groups.set(key, rows);
  }
  return groups;
}

function firstPrice(
  rows: NormalizedMarket[],
  patterns: RegExp[],
): number {
  return rows.find((row) => selectionIs(row, patterns))?.oddsDecimal ?? 0;
}

function lineValue(rows: NormalizedMarket[]): number {
  const value = rows.find((row) => Number.isFinite(row.line))?.line;
  return value == null ? 0 : value;
}

function threeWay(
  rows: NormalizedMarket[],
): { home: number; draw: number; away: number } | undefined {
  const home = firstPrice(rows, [/^home$/, /^1$/, /\bhome\b/, /\bteam 1\b/]);
  const draw = firstPrice(rows, [/^draw$/, /^x$/, /\btie\b/]);
  const away = firstPrice(rows, [/^away$/, /^2$/, /\baway\b/, /\bteam 2\b/]);
  return home > 1 && draw > 1 && away > 1 ? { home, draw, away } : undefined;
}

function twoWay(
  rows: NormalizedMarket[],
  homePatterns: RegExp[] = [/^home$/, /^1$/, /\bhome\b/, /\bteam 1\b/],
  awayPatterns: RegExp[] = [/^away$/, /^2$/, /\baway\b/, /\bteam 2\b/],
): { home: number; away: number } | undefined {
  const home = firstPrice(rows, homePatterns);
  const away = firstPrice(rows, awayPatterns);
  return home > 1 && away > 1 ? { home, away } : undefined;
}

export type Bet62OddsProjection = {
  moneyline?: { home: number; draw: number; away: number };
  markets: Record<string, unknown>;
  freshestAt?: number;
};

/**
 * Convert only markets returned by PropLine/Goal API into the existing Bet62
 * response contract. It never creates a price: an unrecognized market is
 * omitted until the provider returns a documented market/selection.
 */
export function projectBet62Odds(
  markets: NormalizedMarket[],
  teams?: { home: string; away: string },
  maxAgeMs = PREMATCH_ODDS_MAX_AGE_MS,
): Bet62OddsProjection {
  const fresh = freshestOpenMarkets(markets, maxAgeMs);
  const projection: Bet62OddsProjection = { markets: {} };
  if (!fresh.length) return projection;
  projection.freshestAt = Math.max(...fresh.map((market) => market.sourceTimestamp));

  const homeName = teams ? simplify(teams.home) : "";
  const awayName = teams ? simplify(teams.away) : "";
  const homePatterns = [/^home$/, /^1$/, /\bhome\b/, /\bteam 1\b/];
  const awayPatterns = [/^away$/, /^2$/, /\baway\b/, /\bteam 2\b/];
  if (homeName) homePatterns.push(new RegExp(`^${homeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  if (awayName) awayPatterns.push(new RegExp(`^${awayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  const moneylineGroups = grouped(fresh, [
    /moneyline/, /match winner/, /match result/, /three way/, /^1x2$/, /^h2h$/,
  ]);
  let bestThreeWay: { home: number; draw: number; away: number } | undefined;
  for (const rows of moneylineGroups.values()) {
    const home = firstPrice(rows, homePatterns);
    const draw = firstPrice(rows, [/^draw$/, /^x$/, /\btie\b/]);
    const away = firstPrice(rows, awayPatterns);
    const value = home > 1 && draw > 1 && away > 1 ? { home, draw, away } : undefined;
    if (value) {
      bestThreeWay = bestThreeWay
        ? {
            home: Math.max(bestThreeWay.home, value.home),
            draw: Math.max(bestThreeWay.draw, value.draw),
            away: Math.max(bestThreeWay.away, value.away),
          }
        : value;
    }
  }
  projection.moneyline = bestThreeWay;
  if (!projection.moneyline) {
    const twoWayGroups = grouped(fresh, [/moneyline/, /match winner/, /match result/, /^h2h$/]);
    let bestTwoWay: { home: number; away: number } | undefined;
    for (const rows of twoWayGroups.values()) {
      const value = twoWay(rows, homePatterns, awayPatterns);
      if (value) {
        bestTwoWay = bestTwoWay
          ? {
              home: Math.max(bestTwoWay.home, value.home),
              away: Math.max(bestTwoWay.away, value.away),
            }
          : value;
      }
    }
    if (bestTwoWay) projection.moneyline = { ...bestTwoWay, draw: 0 };
  }

  const totalGroups = grouped(fresh, [/total/, /over under/, /totals/]);
  const totalGoals: Record<string, number> = {};
  for (const rows of totalGroups.values()) {
    const line = lineValue(rows);
    const over = firstPrice(rows, [/^over\b/, /^o\b/, /\bover\b/]);
    const under = firstPrice(rows, [/^under\b/, /^u\b/, /\bunder\b/]);
    if (over <= 1 || under <= 1) continue;
    const suffix = ({ 0.5: "05", 1.5: "15", 2.5: "25", 3.5: "35", 4.5: "45", 5.5: "55", 6.5: "65" } as Record<number, string>)[line];
    if (suffix) {
      totalGoals[`over${suffix}`] = Math.max(totalGoals[`over${suffix}`] ?? 0, over);
      totalGoals[`under${suffix}`] = Math.max(totalGoals[`under${suffix}`] ?? 0, under);
    }
    if (projection.markets["_total"] == null) projection.markets["_total"] = line;
    if (projection.markets["_over"] == null) projection.markets["_over"] = over;
    if (projection.markets["_under"] == null) projection.markets["_under"] = under;
  }
  if (Object.keys(totalGoals).length) {
    projection.markets["totalGoals"] = totalGoals;
  }

  const bttsGroups = grouped(fresh, [/both teams/, /btts/, /both score/]);
  for (const rows of bttsGroups.values()) {
    const yes = firstPrice(rows, [/^yes$/, /^y$/, /\byes\b/]);
    const no = firstPrice(rows, [/^no$/, /^n$/, /\bno\b/]);
    if (yes > 1 && no > 1) {
      projection.markets["bothTeamsScore"] = { yes, no };
      break;
    }
  }

  const doubleChanceGroups = grouped(fresh, [/double chance/]);
  for (const rows of doubleChanceGroups.values()) {
    const homeOrDraw = firstPrice(rows, [/1x/, /home.*draw/, /home or draw/]);
    const awayOrDraw = firstPrice(rows, [/x2/, /away.*draw/, /away or draw/]);
    const homeOrAway = firstPrice(rows, [/12/, /home.*away/, /home or away/]);
    if (homeOrDraw > 1 || awayOrDraw > 1 || homeOrAway > 1) {
      projection.markets["doubleChance"] = { homeOrDraw, awayOrDraw, homeOrAway };
      break;
    }
  }

  const spreadRows = fresh.filter((market) => isMarket(market, [/spread/, /handicap/, /point spread/]));
  const spreadGroups = new Map<string, NormalizedMarket[]>();
  for (const market of spreadRows) {
    const key = `${market.bookmaker}|${market.market}|${market.period ?? ""}|${Math.abs(market.line ?? 0)}`;
    const rows = spreadGroups.get(key) ?? [];
    rows.push(market);
    spreadGroups.set(key, rows);
  }
  for (const rows of spreadGroups.values()) {
    const value = twoWay(rows, homePatterns, awayPatterns);
    if (value) {
      projection.markets["_spread"] = value;
      projection.markets["_spreadLine"] = lineValue(rows);
      projection.markets["asianHandicap"] = { ...value, line: lineValue(rows) };
      break;
    }
  }

  const firstHalfGroups = grouped(fresh, [/first half/, /1st half/, /half time/]);
  for (const rows of firstHalfGroups.values()) {
    const value = threeWay(rows);
    if (value) {
      projection.markets["halfTime"] = value;
      break;
    }
  }

  projection.markets["_allOdds"] = fresh.map((market) => ({
    bookmaker: market.bookmaker,
    market: market.market,
    period: market.period,
    line: market.line,
    selection: market.selection,
    selectionId: market.selectionId,
    odds: market.oddsDecimal,
    status: market.status,
    sourceTimestamp: market.sourceTimestamp,
    receivedTimestamp: market.receivedTimestamp,
  }));
  return projection;
}

export function clearProviderCachesForTests(): void {
  // Kept as an explicit test seam; the provider clients own their caches.
  logger.debug("[providers] cache reset requested");
}
