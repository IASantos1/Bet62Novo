import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  goalServeFeedUrl,
  goalServeLivescoreUrl,
  goalServeGetWithRetry,
  goalServeOddsUrl,
} from "./client.js";
import {
  parseCorrectScoreFromLabel,
  coerceArray,
  guessMarketFromGoalServeNames,
  looksOkOddString,
  parseOddDecimal,
  parseGoalServeDDMMYYYY,
  parseISO8601Any,
  extractLineNumberFromLabel,
  formatCorrectScoreKey,
} from "./normalize.js";
import type { ProviderRawFixture, ProviderRawOddsSelection } from "./types.js";

const PREGAME_TTL_MS = 2 * 60 * 1000;
const LIVE_TTL_MS = 15 * 1000;
const ODDS_TTL_MS = 30 * 1000;

type UpcomingCached = { fixtures: ProviderRawFixture[]; fetchedAt: number; lastTs?: string | number };
let upcomingCache: UpcomingCached | null = null;
let upcomingInFlight: Promise<ProviderRawFixture[]> | null = null;

type LiveCached = { fixtures: ProviderRawFixture[]; fetchedAt: number };
let liveCache: LiveCached | null = null;
let liveInFlight: Promise<ProviderRawFixture[]> | null = null;

type OddsCached = { byId: Map<string, ProviderRawOddsSelection[]>; fetchedAt: number; lastTs?: string | number };
let oddsCache: OddsCached | null = null;
let oddsInFlight: Promise<Map<string, ProviderRawOddsSelection[]>> | null = null;

function stateIdFromGoalServe(raw: any): 0 | 1 | 2 | 3 | 5 | 22 | 99 {
  if (raw == null) return 0;
  const s = String(raw).toLowerCase();
  if (["not started", "ns", "scheduled", "upcoming"].includes(s)) return 1;
  if (s.includes("1st") || s === "1h" || s === "1st half") return 2;
  if (["ht", "half time", "halftime"].includes(s)) return 3;
  if (s.includes("2nd") || s === "2h" || s === "2nd half" || s.includes("live")) return 22;
  if (["finished", "ft", "final", "ended", "full time"].includes(s)) return 5;
  return 99;
}

function mapScoresCategory(
  matchElement: any,
): Pick<ProviderRawFixture, "home" | "away" | "league" | "country" | "kickoffISO" | "kickoffTimestamp" | "stateId" | "score" | "liveMinute" | "livePeriod" | "liveRunning" | "providerId"> & { rawHomeId?: string; rawAwayId?: string } {
  const rawId = String(matchElement?.id ?? matchElement?.static_id ?? matchElement?.alternate_id ?? "");
  const league = String(matchElement?.league ?? matchElement?.league_name ?? matchElement?.category ?? "");
  const country = String(matchElement?.country ?? matchElement?.country_name ?? "");
  const localTeam = matchElement?.localteam ?? matchElement?.local ?? matchElement?.home ?? {};
  const visitorTeam = matchElement?.visitorteam ?? matchElement?.visitor ?? matchElement?.away ?? {};
  const home = String(localTeam?.name ?? localTeam ?? "").trim();
  const away = String(visitorTeam?.name ?? visitorTeam ?? "").trim();
  const homeId = localTeam?.id ? String(localTeam.id) : undefined;
  const awayId = visitorTeam?.id ? String(visitorTeam.id) : undefined;
  const date = matchElement?.date ?? matchElement?.formatted_date ?? matchElement?.date_start ?? null;
  const time = matchElement?.time ?? matchElement?.time_start ?? null;
  const parsed =
    parseGoalServeDDMMYYYY(date, time) ??
    parseISO8601Any(matchElement?.date_start_iso ?? matchElement?.starting_at ?? matchElement?.kickoff ?? null) ??
    { iso: new Date(0).toISOString(), tsSec: 0 };
  const status = matchElement?.status ?? matchElement?.state ?? matchElement?.status_long ?? null;
  const stateId = stateIdFromGoalServe(status);
  const homeScoreRaw = matchElement?.localteam_score ?? matchElement?.local_score ?? matchElement?.home_score ?? null;
  const awayScoreRaw = matchElement?.visitorteam_score ?? matchElement?.visitor_score ?? matchElement?.away_score ?? null;
  const hs = homeScoreRaw === null || homeScoreRaw === undefined || homeScoreRaw === "" ? undefined : Number(homeScoreRaw);
  const as = awayScoreRaw === null || awayScoreRaw === undefined || awayScoreRaw === "" ? undefined : Number(awayScoreRaw);
  const score = Number.isFinite(hs) && Number.isFinite(as) ? { home: hs!, away: as! } : undefined;
  const minuteRaw = matchElement?.minute ?? matchElement?.timer ?? matchElement?.clock ?? null;
  const liveMinute =
    minuteRaw == null || String(minuteRaw) === ""
      ? undefined
      : typeof minuteRaw === "number"
      ? minuteRaw
      : Number(String(minuteRaw).replace(/\D/g, "")) || undefined;
  const livePeriod = matchElement?.period ?? matchElement?.half ?? undefined;
  const liveRunning = matchElement?.running ?? matchElement?.inplay ?? matchElement?.live ?? undefined;
  return {
    providerId: rawId,
    home,
    away,
    league,
    country,
    kickoffISO: parsed.iso,
    kickoffTimestamp: parsed.tsSec,
    stateId,
    score,
    liveMinute,
    livePeriod: livePeriod == null ? undefined : String(livePeriod),
    liveRunning: typeof liveRunning === "boolean" ? liveRunning : undefined,
    rawHomeId: homeId,
    rawAwayId: awayId,
  };
}

function buildRawFixtureFromScoreMatch(m: any, isLive = false): ProviderRawFixture | null {
  const core = mapScoresCategory(m);
  if (!core.providerId || (!core.home && !core.away)) return null;
  const id = `gs-soccer-${core.providerId}`;
  return {
    matchId: id,
    providerId: core.providerId,
    sport: "soccer",
    home: core.home,
    away: core.away,
    league: core.league,
    country: core.country,
    kickoffISO: core.kickoffISO,
    kickoffTimestamp: core.kickoffTimestamp,
    stateId: isLive && core.stateId === 0 ? 22 : core.stateId,
    score: core.score,
    liveMinute: core.liveMinute,
    livePeriod: core.livePeriod,
    liveRunning: core.liveRunning,
    homeTeamId: core.rawHomeId,
    awayTeamId: core.rawAwayId,
    odds: [],
  };
}

async function fetchUpcoming(): Promise<ProviderRawFixture[]> {
  const subfeeds = ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"];
  const results = await Promise.all(
    subfeeds.map(async (sub) => {
      const url = goalServeFeedUrl(`soccernew/${sub}`);
      const resp = await goalServeGetWithRetry<any>(url, { timeoutMs: 12000 });
      if (!resp) return [];
      const matches: any[] = [];
      const root = resp?.scores ?? resp?.score ?? resp;
      for (const cat of coerceArray<any>(root?.category ?? root?.league ?? [])) {
        for (const m of coerceArray<any>(cat?.match ?? cat?.matches ?? [])) {
          const fx = buildRawFixtureFromScoreMatch(m, false);
          if (fx) matches.push(fx);
        }
      }
      return matches;
    }),
  );
  const byId = new Map<string, ProviderRawFixture>();
  for (const list of results) {
    for (const fx of list) byId.set(fx.providerId, fx);
  }
  return Array.from(byId.values());
}

export async function getGoalServeFootballUpcomingRaw(): Promise<ProviderRawFixture[]> {
  if (!CONFIG.ENABLE_GOALSERVE) return [];
  if (!CONFIG.GOALSERVE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < PREGAME_TTL_MS) return upcomingCache.fixtures;
  if (upcomingInFlight) return upcomingInFlight;
  upcomingInFlight = fetchUpcoming()
    .then((fixtures) => {
      upcomingCache = { fixtures, fetchedAt: Date.now() };
      return fixtures;
    })
    .catch((err) => {
      logger.warn({ err }, "[goalserve/football] upcoming fetch failed");
      return upcomingCache?.fixtures ?? [];
    })
    .finally(() => {
      upcomingInFlight = null;
    });
  return upcomingInFlight;
}

async function fetchLive(): Promise<ProviderRawFixture[]> {
  const url = goalServeLivescoreUrl("soccer", "live");
  const resp = await goalServeGetWithRetry<any>(url, { timeoutMs: 8000 });
  if (!resp) return [];
  const out: ProviderRawFixture[] = [];
  const root = resp?.scores ?? resp?.score ?? resp?.data ?? resp;
  for (const cat of coerceArray<any>(root?.category ?? root?.league ?? root ?? [])) {
    for (const m of coerceArray<any>(cat?.match ?? cat?.matches ?? [])) {
      const fx = buildRawFixtureFromScoreMatch(m, true);
      if (fx) out.push(fx);
    }
  }
  if (out.length === 0 && Array.isArray(root)) {
    for (const m of root) {
      const fx = buildRawFixtureFromScoreMatch(m, true);
      if (fx) out.push(fx);
    }
  }
  return out;
}

export async function getGoalServeFootballLiveRaw(): Promise<ProviderRawFixture[]> {
  if (!CONFIG.ENABLE_GOALSERVE) return [];
  if (!CONFIG.GOALSERVE_API_KEY) return [];
  const now = Date.now();
  if (liveCache && now - liveCache.fetchedAt < LIVE_TTL_MS) return liveCache.fixtures;
  if (liveInFlight) return liveInFlight;
  liveInFlight = fetchLive()
    .then((fixtures) => {
      liveCache = { fixtures, fetchedAt: Date.now() };
      return fixtures;
    })
    .catch((err) => {
      logger.warn({ err }, "[goalserve/football] live fetch failed");
      return liveCache?.fixtures ?? [];
    })
    .finally(() => {
      liveInFlight = null;
    });
  return liveInFlight;
}

function parseOddsBookmakerOdds(
  typeName: string,
  bm: any,
): ProviderRawOddsSelection[] {
  const out: ProviderRawOddsSelection[] = [];
  const bookmakerName = String(bm?.name ?? bm?.id ?? "unknown");
  for (const odd of coerceArray<any>(bm?.odd ?? [])) {
    const rawName = String(odd?.name ?? "");
    const hint = guessMarketFromGoalServeNames(typeName, rawName);
    const line = hint.lineMaybe ?? extractLineNumberFromLabel(odd?.stop ?? odd?.total ?? typeName);
    const value = odd?.value ?? odd?.price ?? odd?.odd_value;
    if (!looksOkOddString(value)) continue;
    const oddNum = parseOddDecimal(value)!;
    const selection: ProviderRawOddsSelection = {
      canonicalMarket: hint.market,
      canonicalOutcome:
        hint.outcomeMaybe ??
        (["HOME", "DRAW", "AWAY"].includes(String(hint.outcomeMaybe)) ? (hint.outcomeMaybe as any) : rawName),
      label: rawName,
      odd: oddNum,
      line,
      rawMarketName: typeName,
      rawBookmaker: bookmakerName,
    };
    if (hint.market === "CS") {
      const sc = parseCorrectScoreFromLabel(rawName);
      if (sc) {
        selection.score = sc;
        selection.label = formatCorrectScoreKey(sc.home, sc.away);
      }
    }
    out.push(selection);
  }
  for (const total of coerceArray<any>(bm?.total ?? [])) {
    const typeMarket = total?.name ?? typeName;
    const hint = guessMarketFromGoalServeNames(typeMarket, "");
    const line = hint.lineMaybe ?? extractLineNumberFromLabel(total?.stop ?? total?.name ?? "");
    for (const odd of coerceArray<any>(total?.odd ?? [])) {
      const rawName = String(odd?.name ?? "");
      const h2 = guessMarketFromGoalServeNames(typeMarket, rawName);
      const value = odd?.value ?? odd?.price ?? odd?.odd_value;
      if (!looksOkOddString(value)) continue;
      out.push({
        canonicalMarket: h2.market === typeMarket ? "OU" : h2.market,
        canonicalOutcome:
          h2.outcomeMaybe ??
          (rawName.toLowerCase().includes("over") || rawName.toLowerCase().includes("mais") || rawName.startsWith("O")
            ? "OVER"
            : "UNDER"),
        label: rawName,
        odd: parseOddDecimal(value)!,
        line: h2.lineMaybe ?? line,
        rawMarketName: typeMarket,
        rawBookmaker: bookmakerName,
      });
    }
  }
  for (const h of coerceArray<any>(bm?.handicap ?? [])) {
    const typeMarket = h?.name ?? typeName;
    const hint = guessMarketFromGoalServeNames(typeMarket, "");
    const line = hint.lineMaybe ?? extractLineNumberFromLabel(h?.stop ?? h?.name ?? "");
    for (const odd of coerceArray<any>(h?.odd ?? [])) {
      const rawName = String(odd?.name ?? "");
      const value = odd?.value ?? odd?.price ?? odd?.odd_value;
      if (!looksOkOddString(value)) continue;
      out.push({
        canonicalMarket: "AH",
        canonicalOutcome:
          rawName.toLowerCase().includes("home") || rawName.startsWith("1") || rawName.startsWith("H")
            ? "HOME"
            : "AWAY",
        label: rawName,
        odd: parseOddDecimal(value)!,
        line,
        rawMarketName: typeMarket,
        rawBookmaker: bookmakerName,
      });
    }
  }
  return out;
}

async function fetchOdds(): Promise<Map<string, ProviderRawOddsSelection[]>> {
  const params: Record<string, string | number> = {};
  if (oddsCache?.lastTs != null) params.ts = String(oddsCache.lastTs);
  const url = goalServeOddsUrl("soccer", params);
  const resp = await goalServeGetWithRetry<any>(url, { timeoutMs: 20000 });
  const byId = oddsCache?.byId ? new Map(oddsCache.byId) : new Map<string, ProviderRawOddsSelection[]>();
  if (!resp) return byId;
  const root = resp?.scores ?? resp?.odds ?? resp;
  const ts = root?.ts ?? root?._ts ?? undefined;
  const leagues = coerceArray<any>(root?.category ?? root?.league ?? root?.odds ?? []);
  for (const league of leagues) {
    for (const m of coerceArray<any>(league?.match ?? league?.matches ?? [])) {
      const id = String(m?.id ?? m?.alternate_id ?? "");
      if (!id) continue;
      const perMatch: ProviderRawOddsSelection[] = [];
      for (const t of coerceArray<any>(m?.odds?.type ?? m?.odds ?? m?.markets ?? [])) {
        const typeName = String(t?.name ?? t?.type_name ?? "");
        for (const bm of coerceArray<any>(t?.bookmaker ?? t?.bookmakers ?? t)) {
          perMatch.push(...parseOddsBookmakerOdds(typeName, bm));
        }
      }
      if (perMatch.length === 0) continue;
      const key = `gs-soccer-${id}`;
      byId.set(key, perMatch);
    }
  }
  oddsCache = { byId, fetchedAt: Date.now(), lastTs: ts };
  return byId;
}

export async function getGoalServeFootballOddsByMatchId(): Promise<Map<string, ProviderRawOddsSelection[]>> {
  if (!CONFIG.ENABLE_GOALSERVE) return new Map();
  if (!CONFIG.GOALSERVE_API_KEY) return new Map();
  const now = Date.now();
  if (oddsCache && now - oddsCache.fetchedAt < ODDS_TTL_MS) return oddsCache.byId;
  if (oddsInFlight) return oddsInFlight;
  oddsInFlight = fetchOdds()
    .catch((err) => {
      logger.warn({ err }, "[goalserve/football] odds fetch failed");
      return oddsCache?.byId ?? new Map();
    })
    .finally(() => {
      oddsInFlight = null;
    });
  return oddsInFlight;
}

export async function attachGoalServeFootballOdds(
  fixtures: ProviderRawFixture[],
): Promise<ProviderRawFixture[]> {
  if (!CONFIG.ENABLE_GOALSERVE || fixtures.length === 0) return fixtures;
  const oddsById = await getGoalServeFootballOddsByMatchId();
  return fixtures.map((fx) => {
    const odds = oddsById.get(fx.matchId);
    if (!odds || odds.length === 0) return fx;
    return { ...fx, odds: [...(fx.odds ?? []), ...odds] };
  });
}
