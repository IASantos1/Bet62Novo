const SPORTSAPI_KEY =
  process.env["SPORTSAPIPRO_KEY"] ??
  process.env["SPORTSAPI_PRO_KEY"] ??
  process.env["SPORTSAPI_KEY"] ??
  "";

const STATPAL_API_KEY =
  process.env["STATPAL_API_KEY"] ??
  process.env["STATSPAL_API_KEY"] ??
  "";

const STATPAL_BASE_URL =
  process.env["STATPAL_BASE_URL"]?.trim() || "https://statpal.io/api";

// Default to "statpal" — Statpal is the primary and only live data source.
// Set FOOTBALL_LIVE_PROVIDER=auto to also try SportsAPI Pro as fallback,
// or FOOTBALL_LIVE_PROVIDER=sportsapipro to use only SportsAPI Pro.
const FOOTBALL_LIVE_PROVIDER =
  process.env["FOOTBALL_LIVE_PROVIDER"]?.trim() || "statpal";

const FOOTBALL_DAILY_PROVIDER =
  process.env["FOOTBALL_DAILY_PROVIDER"]?.trim() || "statpal";

const FOOTBALL_REFERENCE_PROVIDER =
  process.env["FOOTBALL_REFERENCE_PROVIDER"]?.trim() || "statpal";

// When true, ALL SportsAPI Pro calls are disabled (WebSockets, HTTP fetches,
// basketball/baseball/tennis live). This avoids consuming quota when the
// subscription is Statpal-only. Automatically true when provider = "statpal".
const STATPAL_ONLY =
  FOOTBALL_LIVE_PROVIDER === "statpal" ||
  process.env["STATPAL_ONLY"] === "true";

// SilentAPI — third-party casino game aggregator (game launch + wallet
// callback). Secrets only ever come from the environment, never hardcoded —
// same convention as SPORTSAPI_KEY/STATPAL_API_KEY above.
const SILENTAPI_BASE_URL =
  process.env["SILENTAPI_BASE_URL"]?.trim() || "https://silentapi.org/api";
const SILENTAPI_AUTH_TOKEN = process.env["SILENTAPI_AUTH_TOKEN"] ?? "";
const SILENTAPI_CALLBACK_SECRET =
  process.env["SILENTAPI_CALLBACK_SECRET"] ?? "";

// Palace Casino (Gold Slot Palace) — third-party casino game aggregator,
// same shape of integration as SilentAPI above (game launch + wallet
// callback). Intended to replace SilentAPI as the catalog source per the
// user's plan to install a new system. Base URL confirmed by the user;
// PALACE_CASINO_API_TOKEN is not set yet — the integration is inert
// (empty catalog fetch) until it's added in Railway. Launch endpoint and
// webhook/callback signing scheme are not documented yet either — only
// wallet (deposit/withdraw-all) and game listing (providers/games) are
// wired in so far.
const PALACE_CASINO_BASE_URL =
  process.env["PALACE_CASINO_BASE_URL"]?.trim() ||
  "https://agent.goldslotpalase.com/v4";
const PALACE_CASINO_API_TOKEN = process.env["PALACE_CASINO_API_TOKEN"] ?? "";
// Shared token Palace Casino sends back in the "Callback-Token" header on
// every wallet callback (bet/win/cancel/balance/auth) — our auth mechanism
// for that inbound webhook, configured on their side under Settings.
const PALACE_CASINO_CALLBACK_TOKEN =
  process.env["PALACE_CASINO_CALLBACK_TOKEN"] ?? "";

// PulseScore — AGREGADOR DE ODDS E MERCADOS MULTI-BOOKMAKERS NORMALIZADO.
//   - RESPONSABILIDADES: Odds em tempo real, mercados, bookmakers agregadas (bet365, pinnacle, fanduel etc.), WebSocket ~1s push.
//   - NÃO FAZ: Estatísticas detalhadas, H2H, rankings, logos, play-by-play.
// Futebol puxado via REST polling; tênis via WebSocket (PRO plan permite 1 conexão WS concorrente — tênis foi o escolhido por atualização point-by-point).
// Cota: ilimitada conforme plano do usuário. Usar sempre que possível para overlay de odds e comparação multi-bookmaker.
const PULSESCORE_API_KEY = process.env["PULSESCORE_API_KEY"] ?? "";
const PULSESCORE_BASE_URL =
  process.env["PULSESCORE_BASE_URL"]?.trim() || "https://api.pulsescore.net/api";
const PULSESCORE_BOOKMAKER =
  process.env["PULSESCORE_BOOKMAKER"]?.trim() || "bet365";

// Optional — powers the admin "AI-assisted casino banner" copy generator
// (routes/admin.ts POST /casino/banners/ai-generate). Falls back to a
// deterministic template when unset, so the feature works either way.
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? "";

// ── BET62 Live + Match Tracker + Streaming (Arquitetura 4 CAMADAS) ──
//
//  CAMADA 1 (ODDS/MERCADOS): PulseScore — agregador odds multi-bookmaker.
//    • Odds em tempo real, mercados normalizados (canonicalMarket), WebSocket ~1s (tênis).
//    • Cota ilimitada. Nunca usar para estatísticas/H2H/rankings/logos.
//
//  CAMADA 2 (TRACKER LIVE): StatScore — placar/minuto/incidentes AO VIVO.
//    • Endpoint: /get_pushes/{eventId}. Auth: header X-Auth (OBRIGATÓRIO) + query ?auth= fallback compat.
//    • Requer Referer: https://widgets.statscore.com/. Payload mais rico (minute, status, incidents[]).
//    • Requer mapeamento MANUAL do admin (live_stream_mappings.statscore_event_id).
//
//  CAMADA 3 (STATS/EVENTOS): StatPal — dados estatísticos, play-by-play, metadados.
//    • RESPONSABILIDADES: Estatísticas de jogo, play-by-play, H2H, rankings/standings, logos, ligas detalhadas.
//    • NÃO FAZ: Agregação multi-bookmaker de odds (isso é PulseScore).
//    • Soccer: /v2/soccer/matches/live + /match/{id}/statistics. Outros esportes: /v1/*
//    • Cota: 300.000 requests/dia. Cache TTL rigoroso. Verificação de quota via /user-request-count (GRÁTIS, não conta na cota).
//    • 100% AUTOMÁTICO por nome de time (ZERO trabalho manual por partida — futebol apenas).
//
//  CAMADA 4 (STREAM HLS): SMYTDRYT (BetBY deep-scan) — extração de URLs .m3u8.
//    • O BetBY entrega a playlist HLS final em chunks do feed v4 quando tiver cobertura vídeo;
//      se não tiver, admin preenche manualmente os 7 campos de vídeo em live_stream_mappings.
//
//  BetBY fornece a lista de eventos (score/minute/status) via REST v4 (delta manifest, cache persistente de
//  desc.competitors através das versões). poller.ts.resolveTracker() executa a cascata 2→3→1 a cada 5s.
const BETBY_API_BASE_URL = process.env["BETBY_API_BASE_URL"]?.trim() || "";
const BETBY_BRAND_ID = process.env["BETBY_BRAND_ID"]?.trim() || "";
const BETBY_LANG = process.env["BETBY_LANG"]?.trim() || "en";
const BETBY_API_TOKEN = process.env["BETBY_API_TOKEN"] ?? "";
// Short-lived (24h) ES256 JWT generated by the bet62 frontend handshake with
// BetBY. Required to call stream/tracker endpoints over HTTP and to open the
// wss://.../api/v1/ws_new WebSocket that returns handshake_success. Will be
// refreshed by BetbyJwtService whenever frontend pushes a new token.
const BETBY_JWT = process.env["BETBY_JWT"] ?? "";
// WebSocket path for the BetBY session WS that performs handshake_success and
// accepts get_stream/get_match_tracker actions. User confirmed
// /api/v1/ws_new works in their existing session capture; overridable for
// staging mirrors.
const BETBY_WS_PATH = process.env["BETBY_WS_PATH"]?.trim() || "/api/v1/ws_new";
// The BetBY live feed (confirmed against api-h-*.sptpub.com) validates
// browser-origin headers before returning data — omitting these yields 403
// or empty payloads even with the correct brandId. Defaults point at the
// production frontend domain the user shared, overridable for dev/staging
// mirrors.
const BETBY_ORIGIN = process.env["BETBY_ORIGIN"]?.trim() || "https://bet62.plus";
const BETBY_REFERER = process.env["BETBY_REFERER"]?.trim() || "https://bet62.plus/";
const BETBY_POLL_INTERVAL_MS = 5_000;
// SCRAPING BETBY COM AUTENTICAÇÃO MÁXIMA COMO FONTE PRINCIPAL (V26b-definitivo 2026-08-03):
//   Quando true, os endpoints /api/live e /api/matches/live-match/:id
//   passam a usar TODOS OS RECURSOS da BetBY para OBTER MÁXIMO DE DADOS:
//
//   ✅ 1. URLS COMPLETAS v4 (brand_id + lang + version)
//   ✅ 2. CHAVE TOKEN BETBY_API_TOKEN (API key v1 do operador X-Api-Key / X-BetBy-Token)
//   ✅ 3. JWT ES256 (Bearer BetBY de sessão via betbyJwt service)
//   ✅ 4. Headers completos Chrome + X-BetBy-Brand + X-BetBy-Lang
//
//   Tudo é enviado em CADA requisição (manifest, chunk v4, auth_side broadcasts).
//   Frontend (home.tsx) NÃO precisa de nenhuma alteração: continua recebendo
//   schema Match Bet62 idêntico.
// Default OFF: this path was shipping identical placeholder odds
// ({home:2.1, draw:3.4, away:3.2}) for every match (ev.markets is never
// populated by the chunk parser — see the TODO in
// publicScraperWithMapper.ts's buildOddsMock) and returning ~300+ events
// unfiltered by liveness, which froze the Ao Vivo tab on mobile. Confirmed
// in production: when this path errors and the old Statpal pipeline takes
// over as fallback, the tab immediately becomes usable again with real,
// differentiated odds. Flip back to true only once real markets are wired
// up and the feed-refresh cache does incremental merges instead of a full
// destructive replace per cycle.
const SCRAPER_BETBY_PUBLIC_PRIMARY =
  (process.env["SCRAPER_BETBY_PUBLIC_PRIMARY"]?.trim() || "false").toLowerCase() === "true";
const SCRAPER_BETBY_PUBLIC_POLL_MS = Number(
  process.env["SCRAPER_BETBY_PUBLIC_POLL_MS"] ?? 20_000,
);

// StatScore Match Tracker — GET {base}/get_pushes/{eventId}?timestamp={ts}&
// auth={auth}. Confirmed real by the user with a live example URL; auth is
// a static partner token (same value also works against
// standings.pc.statscore.com/get_standings/{leagueId}), not set here as a
// default since it's a secret — set STATSCORE_AUTH in the environment.
const STATSCORE_TRACKER_BASE_URL =
  process.env["STATSCORE_TRACKER_BASE_URL"]?.trim() ||
  "https://events-d.pc.statscore.com";
const STATSCORE_AUTH = process.env["STATSCORE_AUTH"] ?? "";

// SMYTDRYT HLS stream — only the host is fixed/global. The hex path segment
// between the host and /playlist.m3u8 was originally assumed to be a fixed
// per-account value, but two real BetBY captures for two different matches
// showed two different segments — it's per-match/per-stream, so it lives in
// live_stream_mappings.videoBasePath (admin-set per event, like the key)
// rather than as a config default here. statsHost + per-video
// matchId/sportId/tournamentId/key/basePath come from live_stream_mappings.
const SMYTDRYT_HOST_URL =
  process.env["SMYTDRYT_HOST_URL"]?.trim() || "https://edg05.smytdryt.live";
const SMYTDRYT_DEFAULT_STATS_HOST =
  process.env["SMYTDRYT_DEFAULT_STATS_HOST"]?.trim() || "statsstart26.sptpub.com";

export const CONFIG = {
  SPORTSAPI_KEY,
  STATPAL_API_KEY,
  STATPAL_BASE_URL,
  SILENTAPI_BASE_URL,
  SILENTAPI_AUTH_TOKEN,
  SILENTAPI_CALLBACK_SECRET,
  PALACE_CASINO_BASE_URL,
  PALACE_CASINO_API_TOKEN,
  PALACE_CASINO_CALLBACK_TOKEN,
  PULSESCORE_API_KEY,
  PULSESCORE_BASE_URL,
  PULSESCORE_BOOKMAKER,
  ANTHROPIC_API_KEY,
  BETBY_API_BASE_URL,
  BETBY_BRAND_ID,
  BETBY_LANG,
  BETBY_API_TOKEN,
  BETBY_JWT,
  BETBY_WS_PATH,
  BETBY_ORIGIN,
  BETBY_REFERER,
  BETBY_POLL_INTERVAL_MS,
  SCRAPER_BETBY_PUBLIC_PRIMARY,
  SCRAPER_BETBY_PUBLIC_POLL_MS,
  STATSCORE_TRACKER_BASE_URL,
  STATSCORE_AUTH,
  SMYTDRYT_HOST_URL,
  SMYTDRYT_DEFAULT_STATS_HOST,
  FOOTBALL_LIVE_PROVIDER,
  FOOTBALL_DAILY_PROVIDER,
  FOOTBALL_REFERENCE_PROVIDER,
  STATPAL_ONLY,
  LIVE_UPDATE_INTERVAL: 1000,
  PREMATCH_UPDATE_INTERVAL: 300_000,
  REOPEN_DELAY_GOAL_LOW: 12_000,
  REOPEN_DELAY_VAR_LOW: 20_000,
  REOPEN_DELAY_GOAL_HIGH: 25_000,
  REOPEN_DELAY_VAR_HIGH: 45_000,
  MAX_ODDS_DRIFT: 0.40,
  CACHE_TTL_MS: 86_400_000,

  // Kept below LIVE_UPDATE_INTERVAL (the SSE broadcastLive() tick) on
  // purpose: broadcastLive() forces a fresh payload rebuild every tick, but
  // that rebuild reads these same per-sport caches — if this TTL matched or
  // exceeded the tick interval, the two timers could drift out of phase and
  // serve up to ~2x LIVE_UPDATE_INTERVAL-stale data at some ticks instead of
  // the ~1s the broadcast cadence implies.
  LIVE_CACHE_TTL: 700,
  DAILY_CACHE_TTL: 300_000,
  TOMORROW_CACHE_TTL: 1_800_000,
  ODDS_CACHE_TTL: 300_000,
} as const;

export const CRITICAL_EVENTS = ["goal", "var", "red_card", "penalty", "touchdown"] as const;

export type CriticalEvent = typeof CRITICAL_EVENTS[number];

export const FOOTBALL_SUSP_KEYS = [
  "result",
  "doubleChance",
  "totalGoals",
  "handicap",
  "halfTime",
  "htft",
  "correctScore",
  "asianHandicap",
  "asianTotals",
  "drawNoBet",
  "firstGoal",
  "winToNil",
  "cleanSheet",
  "goalOddEven",
  "exactGoals",
  "btts1H",
  "btts2H",
  "toWinBothHalves",
  "highestScoringHalf",
  "htCorrectScore",
  "h2CorrectScore",
  "teamGoals",
  "secondHalf",
  "drawNoBet2",
  "handicapPoints",
] as const;

export type FootballSuspensionEvent = "goal" | "var";

const FOOTBALL_LOW_RISK_KEYS = new Set([
  "result",
  "doubleChance",
  "halfTime",
  "drawNoBet",
  "firstGoal",
  "winToNil",
  "cleanSheet",
  "btts1H",
  "btts2H",
  "highestScoringHalf",
  "secondHalf",
  "drawNoBet2",
] as const);

const FOOTBALL_GOAL_HIGH_MULT: Record<string, number> = {
  totalGoals: 28 / 25,
  handicap: 28 / 25,
  goalOddEven: 28 / 25,
  toWinBothHalves: 28 / 25,
  teamGoals: 28 / 25,
  handicapPoints: 28 / 25,
  htft: 30 / 25,
  asianHandicap: 30 / 25,
  asianTotals: 30 / 25,
  exactGoals: 30 / 25,
  correctScore: 35 / 25,
  htCorrectScore: 35 / 25,
  h2CorrectScore: 35 / 25,
};

const FOOTBALL_VAR_HIGH_MULT: Record<string, number> = {
  totalGoals: 50 / 45,
  handicap: 50 / 45,
  goalOddEven: 50 / 45,
  toWinBothHalves: 50 / 45,
  teamGoals: 50 / 45,
  handicapPoints: 50 / 45,
  asianHandicap: 55 / 45,
  asianTotals: 55 / 45,
  exactGoals: 55 / 45,
  htft: 60 / 45,
  correctScore: 60 / 45,
  htCorrectScore: 60 / 45,
  h2CorrectScore: 60 / 45,
};

export function footballSuspensionDelayMs(event: FootballSuspensionEvent, marketKey: string): number {
  const low = FOOTBALL_LOW_RISK_KEYS.has(marketKey as any);
  const base =
    event === "goal"
      ? (low ? CONFIG.REOPEN_DELAY_GOAL_LOW : CONFIG.REOPEN_DELAY_GOAL_HIGH)
      : (low ? CONFIG.REOPEN_DELAY_VAR_LOW : CONFIG.REOPEN_DELAY_VAR_HIGH);
  const mult = event === "goal" ? (FOOTBALL_GOAL_HIGH_MULT[marketKey] ?? 1) : (FOOTBALL_VAR_HIGH_MULT[marketKey] ?? 1);
  const ms = Math.round(base * mult);
  return Number.isFinite(ms) && ms > 0 ? ms : base;
}

export function shouldSuspend(eventType: string): boolean {
  return (CRITICAL_EVENTS as readonly string[]).includes(eventType);
}

export function detectOddsDrift(oldOdd: number, newOdd: number): boolean {
  return Math.abs(newOdd - oldOdd) > CONFIG.MAX_ODDS_DRIFT;
}
