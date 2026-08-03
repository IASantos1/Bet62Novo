// =====================================================================
//  BETBY SCRAPER COM AUTENTICAÇÃO MÁXIMA (URLS + CHAVE TOKEN + JWT ES256)
//  + MAPPER → SCHEMA BET62 Match
// =====================================================================
//
//  ✅  CONFIGURAÇÃO DEFINITIVA (Agora SIM usa TUDO):
//      Em CADA requisição BetBY enviamos TUDO para obter o MÁXIMO de dados:
//        1. URLS COMPLETAS: brand_id + lang + version
//        2. CHAVE TOKEN BETBY_API_TOKEN (API key v1 do operador)
//        3. JWT ES256 (Bearer Token de sessão operador: betbyJwt.snapshot)
//        4. Headers completos Chrome: Origin + Referer + UA + Sec-Fetch
//
//  OBJETIVO:
//    Garantir MÁXIMA cobertura de eventos, mercados customizados do operador,
//    broadcasts prioritários, score minuto a minuto e tracker.
//    BetBY é a FONTE PRINCIPAL de:
//      • Eventos live (jogos ao vivo)
//      • Score + minuto + status (tracker de lista)
//      • Streams broadcasts (iframes SMD/Twitch/vpplayer)
//      • Dados de esporte / liga / campeonato / país
//
//  MAPEAMENTO:
//    BetBYEvent (chunk) → Bet62 Match (home, away, league, country, sport,
//                                isLive, homeScore, awayScore, minute, status,
//                                stream.hls, _liveExtra (corners/cards/clock))
// =====================================================================

import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { betbyJwt } from "./jwtService.js";

// --- Tipos BetBY (públicos extraídos do chunk v4) ---------------------
type BetbySport = { id: string; name: string | null; slug: string | null };
type BetbyCategory = { id: string; name: string | null; country: string | null };
type BetbyTournament = { id: string; name: string | null; slug: string | null };
type BetbyCompetitor = { id: string; name: string | null; abbr: string | null; sport_id?: string; country_code?: string };
type BetbyBroadcast = { id: string; type: string; url: string };
type BetbyWidget = { id: string; type: string; url: string };

type BetbyEventScore = {
  home_score?: string | number;
  away_score?: string | number;
  home_penalty_score?: number;
  away_penalty_score?: number;
  period_scores?: Array<{ match_status_code: number; number: number; home_score: number; away_score: number }>;
  statistics?: {
    yellow_cards?: { home: number; away: number };
    red_cards?: { home: number; away: number };
    yellow_red_cards?: { home: number; away: number };
    corners?: { home: number; away: number };
    [k: string]: any;
  };
  [k: string]: any;
};

type BetbyEvent = {
  id: string;
  virtual: boolean;
  scheduled: number | null;
  sport: BetbySport;
  category: BetbyCategory;
  tournament: BetbyTournament;
  home: BetbyCompetitor;
  away: BetbyCompetitor;
  state: {
    status: number | null;
    match_status: number | null;
    provider: string | null;
    clock?: { match_time?: string; stopped?: boolean; timestamp?: number };
    [k: string]: any;
  } | null;
  score: BetbyEventScore | null;
  broadcasts: BetbyBroadcast[];
  widgets: BetbyWidget[];
  _n: string;
};

type BetbyPublicFeedDoc = {
  generated: number;
  source: { manifestVersionTop: number | null; manifestVersionRest: number | null; authSideVersion: number | null };
  stats: {
    total: number; real: number; virtual: number;
    futebol_real: number; broadcasts_total: number; widgets_total: number;
    com_broadcasts: number; com_widgets: number;
  };
  events: BetbyEvent[];
};

// --- Tipos Match (SCHEMA ESPERADO PELO FRONTEND BET62) ---------------
type Odds = {
  home: number; draw?: number; away: number;
  overUnder?: { line: number; over: number; under: number };
  handicaps?: { line: number; home: number; away: number };
  btts?: { yes: number; no: number };
  doubleChance?: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
  bothToScore?: { yes: number; no: number };
};

type Match = {
  id: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  league: string;
  country?: string;
  sport: "football" | "basketball" | "tennis" | "baseball" | "hockey" | "volleyball" | string;
  hasRealOdds: boolean;
  odds: Odds;
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  status?: string;
  markets?: any;
  events?: Array<{ type: string; team: string; minute: number; player: string }>;
  _liveExtra?: {
    clockStr?: string;
    clockSec?: number;
    clockAtMs?: number;
    clockRunning?: boolean;
    kickoffSec?: number;
    cornersTotal?: number;
    cardsTotal?: number;
    htScore?: [number, number];
    periods?: Array<[number, number]>;
    yellowCardsHome?: number;
    yellowCardsAway?: number;
    redCardsHomeCount?: number;
    redCardsAwayCount?: number;
    [k: string]: any;
  };
  stream?: { hls?: string; iframeUrl?: string; iframeType?: string };
  betbyEventId?: string;
  betbyStreams?: BetbyBroadcast[];
  startsIn?: number;
  isFiller?: boolean;
  [k: string]: any;
};

// ---- Manifest / Chunk / AuthSide Interfaces (raw BetBY v4) ----------
type BetbyV4Manifest = {
  version?: number;
  top_events_versions?: number[];
  rest_events_versions?: number[];
  generated?: number;
  status?: any;
  [k: string]: any;
};
type BetbyV4Chunk = {
  epoch?: number;
  version?: number;
  generated?: number;
  snapshot_complete?: boolean;
  fixtures_complete?: boolean;
  status?: any;
  strict_providers?: any;
  sports?: Record<string, any>;
  categories?: Record<string, any>;
  tournaments?: Record<string, any>;
  events?: Record<string, any>;
  [k: string]: any;
};

// =====================================================================
// INSTÂNCIA SINGLETON
// =====================================================================
let feedCache: BetbyPublicFeedDoc | null = null;
let lastFetchMs = 0;
let fetchingNow = false;
const POLL_INTERVAL_MS = 20_000; // 20s (razão entre atualidade e evitar rate limit)

const BRAND_ID = (CONFIG.BETBY_BRAND_ID || process.env.BETBY_BRAND_ID || "2633251597353889792").trim();
const BASE_URL =
  (CONFIG as any).BETBY_API_BASE_URL ||
  process.env.BETBY_API_BASE_URL ||
  "https://api-h-c7818b61-608.sptpub.com";
const LANG = (CONFIG as any).BETBY_LANG || process.env.BETBY_LANG || "en";
const BETBY_ORIGIN =
  (CONFIG as any).BETBY_ORIGIN || process.env.BETBY_ORIGIN || "https://hdonegame.com";
const BETBY_REFERER =
  (CONFIG as any).BETBY_REFERER || process.env.BETBY_REFERER || "https://hdonegame.com/game/gamesUrl";
const BETBY_API_KEY_V1 =
  ((CONFIG as any).BETBY_API_TOKEN || process.env.BETBY_API_TOKEN || "").trim();

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
  Origin: BETBY_ORIGIN,
  Referer: BETBY_REFERER,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Chromium";v="142", "Not_A Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
  "X-BetBy-Brand": BRAND_ID,
  "X-BetBy-Lang": LANG,
};
if (BETBY_API_KEY_V1.length > 10) {
  BASE_HEADERS["X-Api-Key"] = BETBY_API_KEY_V1;
  BASE_HEADERS["X-BetBy-Token"] = BETBY_API_KEY_V1;
}

/**
 * Retorna headers para CADA request — pega o JWT ATUALIZADO (betbyJwt.snapshot())
 * e também a chave BETBY_API_TOKEN em TODAS as chamadas.
 */
function buildRequestHeaders(): Record<string, string> {
  const h: Record<string, string> = { ...BASE_HEADERS };
  const snap = betbyJwt.snapshot();
  const jwt = snap.token || (CONFIG as any).BETBY_JWT || process.env.BETBY_JWT || "";
  if (jwt && jwt.length > 100) {
    h["Authorization"] = "Bearer " + jwt;
  }
  if (BETBY_API_KEY_V1.length > 10) {
    h["X-Token"] = BETBY_API_KEY_V1;
  }
  return h;
}

// =====================================================================
// FETCHES RAW com CHAVE TOKEN v1 + JWT ES256 em TODAS as requests
// =====================================================================
async function fetchJson<T = any>(u: string, t = 12_000): Promise<T | null> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), t);
    const headers = buildRequestHeaders();
    const r = await fetch(u, { headers: headers as any, signal: ac.signal });
    clearTimeout(to);
    if (!r.ok) {
      logger.warn({ url: u.slice(0, 120), status: r.status, hasJwt: Boolean(headers["Authorization"]), hasKey: Boolean(BETBY_API_KEY_V1) }, "[betby-auth] HTTP não-200");
      return null;
    }
    return (await r.json()) as T;
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 180), url: u.slice(0, 120) }, "[betby-auth] fetch falhou");
    return null;
  }
}

async function fetchManifestV4(): Promise<BetbyV4Manifest | null> {
  const u = `${BASE_URL}/api/v4/live/brand/${BRAND_ID}/${LANG}/0`;
  return fetchJson<BetbyV4Manifest>(u, 10_000);
}

async function fetchChunkV4(v: number): Promise<BetbyV4Chunk | null> {
  const u = `${BASE_URL}/api/v4/live/brand/${BRAND_ID}/${LANG}/${v}`;
  return fetchJson<BetbyV4Chunk>(u, 10_000);
}

// auth_side retorna broadcasts e widgets por eventId
async function fetchAuthSide(v: number): Promise<any | null> {
  const u = `${BASE_URL}/api/v1/auth_side/brand/${BRAND_ID}/${v}`;
  return fetchJson<any>(u, 8_000);
}

// =====================================================================
// PARSE DO CHUNK + AUTH_SIDE → BetbyEvent (estrutura plana nomeada)
// =====================================================================
function extractAuthSideMap(authRaw: any): {
  broadcasts: Record<string, BetbyBroadcast[]>;
  widgets: Record<string, BetbyWidget[]>;
  authVersion: number | null;
} {
  const broadcasts: Record<string, BetbyBroadcast[]> = {};
  const widgets: Record<string, BetbyWidget[]> = {};
  let authVersion: number | null = (authRaw && typeof authRaw.version === "number") ? authRaw.version : null;
  const items = (authRaw && Array.isArray(authRaw.items)) ? authRaw.items : [];
  for (const row of items) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [eventIdStr, tipo, arr] = row as [string, string, any[]];
    const target = tipo === "broadcasts" ? broadcasts : tipo === "widget" ? widgets : null;
    if (!target || !Array.isArray(arr)) continue;
    target[eventIdStr] = arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: String(x.id ?? ""),
        type: String(x.type ?? ""),
        url: String(x.url ?? ""),
      }))
      .filter((x) => x.url.length >= 10);
  }
  return { broadcasts, widgets, authVersion };
}

function parseChunksToBetbyEvents(
  chunks: BetbyV4Chunk[],
  authSide: ReturnType<typeof extractAuthSideMap>,
): BetbyPublicFeedDoc {
  // merge maps (chunk posterior prevalece para categories/sports/tournaments/events)
  const sports: Record<string, BetbySport> = {};
  const categories: Record<string, BetbyCategory> = {};
  const tournaments: Record<string, BetbyTournament> = {};
  const evMap: Record<string, BetbyV4Chunk["events"][string] & { desc: any; state: any; score: any }> = {};

  let generated = 0;
  for (const c of chunks) {
    if (c.sports) for (const k of Object.keys(c.sports)) {
      const s = c.sports[k] || {};
      sports[k] = { id: k, name: s.name ?? null, slug: s.slug ?? null };
    }
    if (c.categories) for (const k of Object.keys(c.categories)) {
      const cat = c.categories[k] || {};
      categories[k] = { id: k, name: cat.name ?? null, country: cat.country_code ?? cat.country ?? null };
    }
    if (c.tournaments) for (const k of Object.keys(c.tournaments)) {
      const t = c.tournaments[k] || {};
      tournaments[k] = { id: k, name: t.name ?? null, slug: t.slug ?? null };
    }
    if (typeof c.generated === "number" && c.generated > generated) generated = c.generated;
    if (c.events) for (const k of Object.keys(c.events)) {
      const prev = evMap[k] ?? { desc: undefined, state: undefined, score: undefined };
      const incoming = c.events[k] || {};
      evMap[k] = {
        ...(prev as any),
        ...(incoming as any),
        desc: (incoming as any).desc ?? prev.desc,
        state: (incoming as any).state ?? prev.state,
        score: (incoming as any).score ?? prev.score,
      } as any;
    }
  }

  const events: BetbyEvent[] = [];
  for (const [id, raw] of Object.entries(evMap)) {
    const desc = (raw as any).desc ?? {};
    const state = (raw as any).state ?? null;
    const score = (raw as any).score ?? null;
    const comps = Array.isArray(desc.competitors) ? desc.competitors : [];
    const compHome = comps[0] ?? (typeof comps === "object" && comps ? comps : null);
    const compAway = comps[1] ?? null;
    const ev: BetbyEvent = {
      id,
      virtual: !!desc.virtual,
      scheduled: typeof desc.scheduled === "number" ? desc.scheduled * (desc.scheduled < 1e12 ? 1000 : 1) : null,
      sport: sports[desc.sport] ?? { id: String(desc.sport ?? ""), name: null, slug: null },
      category: categories[desc.category] ?? { id: String(desc.category ?? ""), name: null, country: null },
      tournament: tournaments[desc.tournament] ?? { id: String(desc.tournament ?? ""), name: null, slug: null },
      home: {
        id: String(compHome?.id ?? ""),
        name: String(compHome?.name ?? "").trim() || null,
        abbr: String(compHome?.abbreviation ?? compHome?.abbr ?? "").trim() || null,
        sport_id: compHome?.sport_id,
        country_code: compHome?.country_code,
      },
      away: {
        id: String(compAway?.id ?? ""),
        name: String(compAway?.name ?? "").trim() || null,
        abbr: String(compAway?.abbreviation ?? compAway?.abbr ?? "").trim() || null,
        sport_id: compAway?.sport_id,
        country_code: compAway?.country_code,
      },
      state: state
        ? {
            status: typeof state.status === "number" ? state.status : null,
            match_status: typeof state.match_status === "number" ? state.match_status : null,
            provider: String(state.provider ?? "").trim() || null,
            clock: state.clock && typeof state.clock === "object" ? state.clock : undefined,
          }
        : null,
      score: score as any,
      broadcasts: authSide.broadcasts[id] ?? [],
      widgets: authSide.widgets[id] ?? [],
      _n: ((compHome?.name ?? "") + " x " + (compAway?.name ?? "")).trim(),
    };
    // pular eventos sem nome de time (ainda não tem desc no chunk)
    if (!ev.home.name || !ev.away.name) continue;
    events.push(ev);
  }

  const total = events.length;
  const real = events.filter((e) => !e.virtual).length;
  const virtual = total - real;
  const futebol_real = events.filter((e) => !e.virtual && (e.sport.id === "1" || /soccer|football/i.test(e.sport.name ?? ""))).length;
  const comB = events.filter((e) => e.broadcasts.length > 0).length;
  const comW = events.filter((e) => e.widgets.length > 0).length;
  const broadcasts_total = events.reduce((s, e) => s + e.broadcasts.length, 0);
  const widgets_total = events.reduce((s, e) => s + e.widgets.length, 0);

  const stats = {
    total, real, virtual,
    futebol_real, com_broadcasts: comB, com_widgets: comW,
    broadcasts_total, widgets_total,
  };
  return {
    generated: generated || Date.now(),
    source: { manifestVersionTop: null, manifestVersionRest: null, authSideVersion: authSide.authVersion },
    stats,
    events,
  };
}

// =====================================================================
// REFRESH PÚBLICO (chama manifesto → chunks → auth_side)
// =====================================================================
export async function refreshPublicBetbyFeed(): Promise<BetbyPublicFeedDoc | null> {
  if (fetchingNow) return feedCache;
  fetchingNow = true;
  try {
    const manifest = await fetchManifestV4();
    if (!manifest) return feedCache;
    const topV = Array.isArray(manifest.top_events_versions) ? manifest.top_events_versions : [];
    const restV = Array.isArray(manifest.rest_events_versions) ? manifest.rest_events_versions : [];
    const versions = [...topV, ...restV];

    const chunkRaws = await Promise.all(versions.map((v) => fetchChunkV4(v)));
    const chunks = chunkRaws.filter((x): x is BetbyV4Chunk => !!x);

    // auth_side: tenta a maior versão do manifesto como auth version (heurística)
    let authRaw: any = null;
    let authVersionUsed: number | null = null;
    const authCandidates = [
      ...(typeof manifest.version === "number" ? [manifest.version] : []),
      ...versions.slice().sort((a, b) => b - a).slice(0, 3),
    ];
    for (const v of authCandidates) {
      const a = await fetchAuthSide(v);
      if (a && (Array.isArray(a.items) || typeof a.items === "object")) {
        authRaw = a;
        authVersionUsed = v;
        break;
      }
    }
    const auth = extractAuthSideMap(authRaw || {});

    const doc = parseChunksToBetbyEvents(chunks, auth);
    doc.source = {
      manifestVersionTop: topV[0] ?? null,
      manifestVersionRest: restV[restV.length - 1] ?? null,
      authSideVersion: authVersionUsed ?? auth.authVersion,
    };
    feedCache = doc;
    lastFetchMs = Date.now();
    logger.info(
      { stats: doc.stats, source: doc.source },
      "[betby-public] feed atualizado via scraping público",
    );
    return doc;
  } catch (err) {
    logger.error({ err }, "[betby-public] refresh falhou");
    return feedCache;
  } finally {
    fetchingNow = false;
  }
}

// =====================================================================
// MAPPER BetbyEvent → Bet62 Match
// =====================================================================
function sportIdToSlug(ev: BetbyEvent): Match["sport"] {
  const sid = ev.sport.id;
  const name = (ev.sport.name || ev.sport.slug || "").toLowerCase();
  if (sid === "1" || /soccer|football|futebol/i.test(name)) return "football";
  if (sid === "2" || /basketball|basquete/i.test(name)) return "basketball";
  if (sid === "5" || /tennis|tênis|tenis/i.test(name)) return "tennis";
  if (sid === "3" || /baseball|beisebol/i.test(name)) return "baseball";
  if (sid === "4" || /hockey|hoquei/i.test(name)) return "hockey";
  if (/volley|volei|vôlei/i.test(name)) return "volleyball";
  return name || ev.sport.slug || `sport_${sid}`;
}

// status BetBY: documentado empíricamente:
//  status=1 ou clock.match_time → LIVE
//  status=3 → FINISHED
//  match_status: 1=1T, 2=2T, 31=intervalo, 3=HT final, 7=penaltis, etc.
function matchStatusAndMinute(ev: BetbyEvent): {
  isLive: boolean;
  status: string;
  minute: number | undefined;
  clockStr: string | undefined;
  clockSec: number | undefined;
  clockRunning: boolean | undefined;
} {
  const st = ev.state?.status ?? null;
  const clock = ev.state?.clock;
  const mt = clock?.match_time ?? null;
  let minute: number | undefined = undefined;
  if (mt && typeof mt === "string") {
    // pode ser "12:34" ou "45+2" ou "67"
    const m = mt.match(/^(\d{1,3})/);
    if (m) minute = Number(m[1]);
  }
  let isLive = st === 1 || !!mt;
  let statusStr = "PREMATCH";
  if (st === 3) statusStr = "FINISHED";
  else if (isLive) statusStr = "LIVE";
  else if (ev.scheduled && ev.scheduled > Date.now()) statusStr = "PREMATCH";
  return {
    isLive,
    status: statusStr,
    minute,
    clockStr: mt || undefined,
    clockSec: minute ? minute * 60 : undefined,
    clockRunning: clock?.stopped === false,
  };
}

function buildOddsMock(ev: BetbyEvent): Odds {
  // Odds reais podem ser extraídas de markets do chunk v4 quando existirem.
  // Enquanto isso (para manter o layout renderizando), retorna valores neutros
  // com hasRealOdds=false se não tiver markets no chunk.
  // TODO: extrair markets de ev.markets quando o chunk carregar a key markets.
  const anyE = ev as any;
  const hasMarkets = !!(anyE.markets && typeof anyE.markets === "object" && Object.keys(anyE.markets).length > 0);
  if (!hasMarkets) {
    // valores placeholder (NÃO são considerados reais)
    return { home: 2.1, draw: 3.4, away: 3.2 };
  }
  return { home: 2.0, draw: 3.3, away: 3.3 };
}

function hasRealBetbyMarkets(ev: BetbyEvent): boolean {
  const anyE = ev as any;
  return !!(anyE.markets && typeof anyE.markets === "object" && Object.keys(anyE.markets).length > 0);
}

export function betbyEventToBet62Match(ev: BetbyEvent): Match {
  const st = matchStatusAndMinute(ev);
  const score = ev.score || ({} as BetbyEventScore);
  const homeScore = score.home_score != null ? Number(score.home_score) : undefined;
  const awayScore = score.away_score != null ? Number(score.away_score) : undefined;

  const periods: Array<[number, number]> = [];
  let htScore: [number, number] | undefined;
  if (Array.isArray(score.period_scores)) {
    for (const p of score.period_scores) {
      const par: [number, number] = [Number(p.home_score || 0), Number(p.away_score || 0)];
      periods.push(par);
      if (p.number === 1 || p.match_status_code === 31 || p.match_status_code === 3) htScore = par;
    }
  }

  const stats = score.statistics || {};
  const yc = stats.yellow_cards;
  const rc = stats.red_cards;
  const co = stats.corners;
  const cornersTotal = co ? co.home + co.away : undefined;
  const cardsTotal = (yc ? yc.home + yc.away : 0) + (rc ? rc.home + rc.away : 0) || undefined;

  // stream: betby não entrega .m3u8 direto no v4 chunk (precisa auth JWT
  // de sessão BetBY), então entrega broadcasts[0].url como iframeUrl no stream.
  const primaryBroadcast = ev.broadcasts[0];
  const streamObj: Match["stream"] = {};
  if (primaryBroadcast) {
    streamObj.iframeUrl = primaryBroadcast.url;
    streamObj.iframeType = primaryBroadcast.type;
  }

  const id = `betby-${ev.id}`; // prefixar evita colisão com IDs da Bet62

  const now = Date.now();
  const startsIn =
    !st.isLive && ev.scheduled && ev.scheduled > now
      ? Math.max(0, Math.round((ev.scheduled - now) / 60_000))
      : undefined;

  const odds = buildOddsMock(ev);

  const m: Match = {
    id,
    home: ev.home.name || "Home",
    away: ev.away.name || "Away",
    homeTeamId: ev.home.id || undefined,
    awayTeamId: ev.away.id || undefined,
    league: ev.tournament.name || ev.category.name || "",
    country: ev.category.country || undefined,
    sport: sportIdToSlug(ev),
    hasRealOdds: hasRealBetbyMarkets(ev),
    odds,
    isLive: st.isLive,
    homeScore: st.isLive || st.status === "FINISHED" ? (homeScore ?? 0) : undefined,
    awayScore: st.isLive || st.status === "FINISHED" ? (awayScore ?? 0) : undefined,
    minute: st.minute,
    status: st.status,
    events: undefined,
    markets: undefined,
    _liveExtra: {
      clockStr: st.clockStr,
      clockSec: st.clockSec,
      clockAtMs: now,
      clockRunning: st.clockRunning,
      kickoffSec: ev.scheduled ? Math.round(ev.scheduled / 1000) : undefined,
      htScore,
      periods: periods.length > 0 ? periods : undefined,
      yellowCardsHome: yc?.home,
      yellowCardsAway: yc?.away,
      redCardsHomeCount: rc?.home,
      redCardsAwayCount: rc?.away,
      cornersTotal,
      cardsTotal,
    },
    stream: Object.keys(streamObj).length > 0 ? streamObj : undefined,
    betbyEventId: ev.id,
    betbyStreams: ev.broadcasts.length > 0 ? ev.broadcasts : undefined,
    startsIn,
    isFiller: false,
  };
  return m;
}

// =====================================================================
// API PÚBLICA DO SERVICE (usar no routes/matches.ts)
// =====================================================================
export function getCachedFeed(): BetbyPublicFeedDoc | null {
  return feedCache;
}

export function getAllBetbyEventsAsMatches(
  filter: { onlyLive?: boolean; onlyReal?: boolean; sport?: Match["sport"]; hasStream?: boolean } = {},
): Match[] {
  if (!feedCache) {
    // boot frio: dispara refresh background, retorna vazio primeiro tick
    void refreshPublicBetbyFeed();
    return [];
  }
  let list = feedCache.events;
  if (filter.onlyReal) list = list.filter((e) => !e.virtual);
  if (filter.onlyLive) list = list.filter((e) => {
    const st = matchStatusAndMinute(e);
    return st.isLive;
  });
  if (filter.sport) {
    list = list.filter((e) => sportIdToSlug(e) === filter.sport);
  }
  if (filter.hasStream) list = list.filter((e) => e.broadcasts.length > 0);

  // ordenar: futebol live primeiro, depois outros esportes live, depois prematch próximos
  const now = Date.now();
  list.sort((a, b) => {
    const aLive = matchStatusAndMinute(a).isLive;
    const bLive = matchStatusAndMinute(b).isLive;
    if (aLive !== bLive) return aLive ? -1 : 1;
    const aFoot = sportIdToSlug(a) === "football";
    const bFoot = sportIdToSlug(b) === "football";
    if (aFoot !== bFoot) return aFoot ? -1 : 1;
    const ta = a.scheduled ?? Infinity;
    const tb = b.scheduled ?? Infinity;
    return Math.abs(ta - now) - Math.abs(tb - now);
  });

  return list.map(betbyEventToBet62Match);
}

export function findBet62MatchByBetbyIdOrMatchId(matchId: string): Match | null {
  if (!feedCache) return null;
  // prefixado?
  let betbyId = matchId;
  if (matchId.startsWith("betby-")) betbyId = matchId.slice("betby-".length);
  const ev = feedCache.events.find((e) => e.id === betbyId);
  return ev ? betbyEventToBet62Match(ev) : null;
}

let startedBgTimer = false;
export function startBackgroundPoller(intervalMs = POLL_INTERVAL_MS): void {
  if (startedBgTimer) return;
  startedBgTimer = true;
  // primeiro tick imediato
  void refreshPublicBetbyFeed();
  setInterval(() => void refreshPublicBetbyFeed(), intervalMs);
  logger.info({ intervalMs }, "[betby-public] poller background iniciado");
}

export function getLastRefreshMs(): number {
  return lastFetchMs;
}

export type { BetbyPublicFeedDoc, BetbyEvent, BetbyBroadcast, BetbyWidget, Match as Bet62MatchShape };
