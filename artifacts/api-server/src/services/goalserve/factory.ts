import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  goalServeFeedUrl,
  goalServeLivescoreUrl,
  goalServeGetWithRetry,
  goalServeOddsUrl,
  goalServeOddsCandidateUrls,
  goalServeGetWithRetryCandidates,
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
  unpackGoalServeRoot,
  extractMatchesFromCategory,
  pickTeamName,
  pickTeamId,
  flattenAtAttributes,
} from "./normalize.js";
import type { ProviderRawFixture, ProviderRawOddsSelection } from "./types.js";

export type SportOpts = {
  sport: ProviderRawFixture["sport"];
  matchIdPrefix: string;
  scoresFeedPrefix: string;
  useDedicatedLivescoreAPI?: boolean;
  dedicatedLivescoreSport?: "soccer";
  oddsCategory: string;
  upcomingFeeds: string[];
  liveFilterFromUpcoming?: boolean;
};

const PREGAME_TTL_MS = 2 * 60 * 1000;
const LIVE_TTL_MS = 3 * 1000;
const ODDS_TTL_MS = 30 * 1000;

function stateIdFromGoalServe(raw: any): 0 | 1 | 2 | 3 | 5 | 22 | 99 {
  if (raw == null) return 1;
  const s = String(raw).toLowerCase().trim();
  if (!s) return 1;
  if ([
    "not started", "ns", "scheduled", "upcoming",
    "pre-match", "prematch", "pregame", "pre game",
    "fixture", "waiting", "tbd", "to be determined",
    "to be announced", "tba", "to be confirmed", "tbc",
    "delayed", "postponed", "suspend", "suspended",
    "ap", "a decorrer", "nao iniciado", "não iniciado",
    "nao começado", "não começado", "programado",
    "antes do jogo", "prejogo", "pré-jogo",
  ].includes(s)) return 1;
  if (["ended", "finalizado", "terminado", "completed", "complete", "closed"].includes(s)) return 5;
  if (s.includes("1st") || s === "1h" || s === "1st half" || s.startsWith("primeiro") || s.startsWith("1 º") || s.startsWith("1º")) return 2;
  if (["ht", "half time", "halftime", "intervalo", "descanso"].includes(s)) return 3;
  if (
    s.includes("2nd") || s === "2h" || s === "2nd half" ||
    s.includes("live") || s.includes("in play") || s.includes("inplay") ||
    s.includes("em jogo") || s.includes("a decorrer") || s.includes("live score") ||
    s.startsWith("segundo") || s.startsWith("2 º") || s.startsWith("2º")
  ) return 22;
  if (["finished", "ft", "final", "ended", "full time", "terminado", "completo", "encerrado"].includes(s)) return 5;
  return 1;
}

export function isUpcomingFixtureByStateOrKickoff(fx: {
  stateId?: number;
  kickoffTimestamp?: number;
}): boolean {
  const sid = fx?.stateId ?? 0;
  if (sid === 5) return false;
  if (sid === 2 || sid === 3 || sid === 22) return false;
  const tsSec = Number(fx?.kickoffTimestamp ?? 0);
  const nowSec = Math.floor(Date.now() / 1000);
  const twoHoursAgo = nowSec - 7200;
  if (!Number.isFinite(tsSec) || tsSec <= 0) return sid === 1 || sid === 0 || sid === 99;
  if (tsSec >= twoHoursAgo) return true;
  return sid === 1 || sid === 0 || sid === 99;
}

function mapScoresCategory(
  matchElement: any,
): Pick<
  ProviderRawFixture,
  | "home"
  | "away"
  | "league"
  | "country"
  | "kickoffISO"
  | "kickoffTimestamp"
  | "stateId"
  | "score"
  | "liveMinute"
  | "livePeriod"
  | "liveRunning"
  | "providerId"
> & { rawHomeId?: string; rawAwayId?: string } {
  const m = flattenAtAttributes(matchElement ?? {});
  const rawId = String(
    m?.id ?? m?.static_id ?? m?.alternate_id ?? m?.fix_id ?? m?.match_id ?? "",
  );
  const matchLeague = String(
    m?.league ?? m?.league_name ?? m?.category ?? m?.tournament_name ?? m?.tournament ?? "",
  );
  const categoryLeague = String(m?._categoryName ?? m?.category_name ?? m?.leagueFromCategory ?? "");
  const league = categoryLeague || matchLeague;
  const matchCountry = String(m?.country ?? m?.country_name ?? m?.nation ?? "");
  const categoryCountry = String(m?._categoryCountry ?? m?.countryFromCategory ?? "");
  const country = categoryCountry || matchCountry;
  let home = pickTeamName(m?.localteam ?? m?.local ?? m?.home ?? m?.localTeam ?? m?.homeTeam);
  if (!home && typeof m?.localteam === "string") home = m.localteam.trim();
  if (!home && typeof m?.home === "string") home = m.home.trim();
  let away = pickTeamName(m?.visitorteam ?? m?.visitor ?? m?.away ?? m?.visitorTeam ?? m?.awayTeam);
  if (!away && typeof m?.visitorteam === "string") away = m.visitorteam.trim();
  if (!away && typeof m?.away === "string") away = m.away.trim();
  const homeId = pickTeamId(m?.localteam ?? m?.local ?? m?.home ?? m?.localTeam ?? m?.homeTeam);
  const awayId = pickTeamId(m?.visitorteam ?? m?.visitor ?? m?.away ?? m?.visitorTeam ?? m?.awayTeam);
  const date = m?.date ?? m?.formatted_date ?? m?.date_start ?? m?.starting_date ?? null;
  const time = m?.time ?? m?.time_start ?? m?.starting_time ?? null;
  const parsed =
    parseGoalServeDDMMYYYY(date, time) ??
    parseISO8601Any(
      m?.date_start_iso ?? m?.starting_at ?? m?.kickoff ?? m?.start_at ?? m?.start_time ?? null,
    ) ?? { iso: new Date(0).toISOString(), tsSec: 0 };
  const status =
    m?.status ?? m?.state ?? m?.status_long ?? m?.match_status ?? m?.match_state ?? m?.stage ?? null;
  const stateId = stateIdFromGoalServe(status);
  const homeScoreRaw =
    m?.localteam_score ??
    m?.local_score ??
    m?.home_score ??
    m?.localteam?.goals ??
    m?.home?.goals ??
    m?.localteam_goals ??
    m?.home_goals ??
    m?.home_team_score ??
    null;
  const awayScoreRaw =
    m?.visitorteam_score ??
    m?.visitor_score ??
    m?.away_score ??
    m?.visitorteam?.goals ??
    m?.away?.goals ??
    m?.visitorteam_goals ??
    m?.away_goals ??
    m?.away_team_score ??
    null;
  const hs =
    homeScoreRaw === null ||
    homeScoreRaw === undefined ||
    homeScoreRaw === "" ||
    String(homeScoreRaw) === "?"
      ? undefined
      : Number(homeScoreRaw);
  const as =
    awayScoreRaw === null ||
    awayScoreRaw === undefined ||
    awayScoreRaw === "" ||
    String(awayScoreRaw) === "?"
      ? undefined
      : Number(awayScoreRaw);
  const score =
    Number.isFinite(hs) && Number.isFinite(as) ? { home: hs!, away: as! } : undefined;
  const minuteRaw = m?.minute ?? m?.timer ?? m?.clock ?? m?.elapsed ?? null;
  const liveMinute =
    minuteRaw == null || String(minuteRaw) === ""
      ? undefined
      : typeof minuteRaw === "number"
      ? minuteRaw
      : Number(String(minuteRaw).replace(/\D/g, "")) || undefined;
  const livePeriod = m?.period ?? m?.half ?? m?.stage ?? m?.current_period ?? undefined;
  const liveRunning = m?.running ?? m?.inplay ?? m?.live ?? m?.in_play ?? undefined;
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

function parseOddsBookmakerOdds(typeName: string, bm: any): ProviderRawOddsSelection[] {
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
        (["HOME", "DRAW", "AWAY"].includes(String(hint.outcomeMaybe))
          ? (hint.outcomeMaybe as any)
          : rawName),
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
          (rawName.toLowerCase().includes("over") ||
          rawName.toLowerCase().includes("mais") ||
          rawName.startsWith("O")
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

type SportAdapter = {
  getUpcomingRaw: () => Promise<ProviderRawFixture[]>;
  getLiveRaw: () => Promise<ProviderRawFixture[]>;
  attachOdds: (fixtures: ProviderRawFixture[]) => Promise<ProviderRawFixture[]>;
};

export function makeGoalServeSportAdapter(opts: SportOpts): SportAdapter {
  const {
    sport,
    matchIdPrefix,
    scoresFeedPrefix,
    useDedicatedLivescoreAPI = false,
    dedicatedLivescoreSport,
    oddsCategory,
    upcomingFeeds,
    liveFilterFromUpcoming = true,
  } = opts;

  const logTag = `[goalserve/${sport}]`;

  type UpcomingCached = {
    fixtures: ProviderRawFixture[];
    fetchedAt: number;
    lastTs?: string | number;
  };
  let upcomingCache: UpcomingCached | null = null;
  let upcomingInFlight: Promise<ProviderRawFixture[]> | null = null;

  type LiveCached = { fixtures: ProviderRawFixture[]; fetchedAt: number };
  let liveCache: LiveCached | null = null;
  let liveInFlight: Promise<ProviderRawFixture[]> | null = null;

  type OddsCached = {
    byId: Map<string, ProviderRawOddsSelection[]>;
    fetchedAt: number;
    lastTs?: string | number;
  };
  let oddsCache: OddsCached | null = null;
  let oddsInFlight: Promise<Map<string, ProviderRawOddsSelection[]>> | null = null;

  function buildRawFixtureFromScoreMatch(m: any, isLive = false): ProviderRawFixture | null {
    const core = mapScoresCategory(m);
    if (!core.providerId || (!core.home && !core.away)) return null;
    const id = `${matchIdPrefix}${core.providerId}`;
    return {
      matchId: id,
      providerId: core.providerId,
      sport,
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
    const results = await Promise.all(
      upcomingFeeds.map(async (sub) => {
        const url = goalServeFeedUrl(`${scoresFeedPrefix}/${sub}`);
        const resp = await goalServeGetWithRetry<any>(url, { timeoutMs: 12000 });
        if (!resp) return [];
        const matches: any[] = [];
        const unpacked = unpackGoalServeRoot(resp);
        for (const cat of unpacked.categories) {
          for (const m of extractMatchesFromCategory(cat)) {
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

  async function getUpcomingRaw(): Promise<ProviderRawFixture[]> {
    if (!CONFIG.ENABLE_GOALSERVE) return [];
    if (!CONFIG.GOALSERVE_API_KEY) return [];
    const now = Date.now();
    if (upcomingCache && now - upcomingCache.fetchedAt < PREGAME_TTL_MS)
      return upcomingCache.fixtures;
    if (upcomingInFlight) return upcomingInFlight;
    upcomingInFlight = fetchUpcoming()
      .then((fixtures) => {
        upcomingCache = { fixtures, fetchedAt: Date.now() };
        return fixtures;
      })
      .catch((err) => {
        logger.warn({ err }, `${logTag} upcoming fetch failed`);
        return upcomingCache?.fixtures ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
    return upcomingInFlight;
  }

  async function fetchLiveDedicated(): Promise<ProviderRawFixture[]> {
    if (!dedicatedLivescoreSport) return [];
    const url = goalServeLivescoreUrl(dedicatedLivescoreSport, "live");
    const resp = await goalServeGetWithRetry<any>(url, { timeoutMs: 8000 });
    if (!resp) return [];
    const out: ProviderRawFixture[] = [];
    const unpacked = unpackGoalServeRoot(resp);
    for (const cat of unpacked.categories) {
      for (const m of extractMatchesFromCategory(cat)) {
        const fx = buildRawFixtureFromScoreMatch(m, true);
        if (fx) out.push(fx);
      }
    }
    if (out.length === 0 && Array.isArray(resp)) {
      for (const m of resp) {
        const fx = buildRawFixtureFromScoreMatch(m, true);
        if (fx) out.push(fx);
      }
    }
    return out;
  }

  async function fetchLiveFromUpcoming(): Promise<ProviderRawFixture[]> {
    const upcoming = await fetchUpcoming();
    return upcoming.filter((fx) => fx.stateId >= 2);
  }

  async function fetchLive(): Promise<ProviderRawFixture[]> {
    if (useDedicatedLivescoreAPI) return fetchLiveDedicated();
    if (liveFilterFromUpcoming) return fetchLiveFromUpcoming();
    return [];
  }

  async function getLiveRaw(): Promise<ProviderRawFixture[]> {
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
        logger.warn({ err }, `${logTag} live fetch failed`);
        return liveCache?.fixtures ?? [];
      })
      .finally(() => {
        liveInFlight = null;
      });
    return liveInFlight;
  }

  async function fetchOdds(): Promise<Map<string, ProviderRawOddsSelection[]>> {
    const params: Record<string, string | number> = {};
    if (oddsCache?.lastTs != null) params.ts = String(oddsCache.lastTs);
    const candidates = goalServeOddsCandidateUrls(oddsCategory, params);
    const resp = await goalServeGetWithRetryCandidates<any>(candidates, { timeoutMs: 18000, retriesPerCandidate: 0 });
    const byId = oddsCache?.byId
      ? new Map(oddsCache.byId)
      : new Map<string, ProviderRawOddsSelection[]>();
    if (!resp) return byId;
    const unpacked = unpackGoalServeRoot(resp);
    const ts =
      (resp as any)?.ts ??
      (resp as any)?._ts ??
      (unpacked as any)?.ts ??
      undefined;
    for (const league of unpacked.categories) {
      for (const m of extractMatchesFromCategory(league)) {
        const flat = flattenAtAttributes(m ?? {});
        const id = String(flat?.id ?? flat?.alternate_id ?? flat?.fix_id ?? "");
        if (!id) continue;
        const perMatch: ProviderRawOddsSelection[] = [];
        const oddsContainer = flattenAtAttributes(flat?.odds ?? flat ?? {});
        for (const t of coerceArray<any>(oddsContainer?.type ?? oddsContainer?.market ?? [])) {
          const typeName = String(t?.name ?? t?.type_name ?? "");
          for (const bm of coerceArray<any>(t?.bookmaker ?? t?.bookmakers ?? t)) {
            perMatch.push(...parseOddsBookmakerOdds(typeName, bm));
          }
        }
        if (perMatch.length === 0) continue;
        const key = `${matchIdPrefix}${id}`;
        byId.set(key, perMatch);
      }
    }
    oddsCache = { byId, fetchedAt: Date.now(), lastTs: ts };
    return byId;
  }

  async function getOddsByMatchId(): Promise<Map<string, ProviderRawOddsSelection[]>> {
    if (!CONFIG.ENABLE_GOALSERVE) return new Map();
    if (!CONFIG.GOALSERVE_API_KEY) return new Map();
    const now = Date.now();
    if (oddsCache && now - oddsCache.fetchedAt < ODDS_TTL_MS) return oddsCache.byId;
    if (oddsInFlight) return oddsInFlight;
    oddsInFlight = fetchOdds()
      .catch((err) => {
        logger.warn({ err }, `${logTag} odds fetch failed`);
        return oddsCache?.byId ?? new Map();
      })
      .finally(() => {
        oddsInFlight = null;
      });
    return oddsInFlight;
  }

  async function attachOdds(fixtures: ProviderRawFixture[]): Promise<ProviderRawFixture[]> {
    if (!CONFIG.ENABLE_GOALSERVE || fixtures.length === 0) return fixtures;
    const oddsById = await getOddsByMatchId();
    return fixtures.map((fx) => {
      const odds = oddsById.get(fx.matchId);
      if (!odds || odds.length === 0) return fx;
      return { ...fx, odds: [...(fx.odds ?? []), ...odds] };
    });
  }

  return { getUpcomingRaw, getLiveRaw, attachOdds };
}
