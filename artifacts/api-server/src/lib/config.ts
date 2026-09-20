// SilentAPI — third-party casino game aggregator (game launch + wallet
// callback). Secrets only ever come from the environment, never hardcoded.
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

// Optional — powers the admin "AI-assisted casino banner" copy generator
// (routes/admin.ts POST /casino/banners/ai-generate) only. Falls back to a
// deterministic template when unset. Kept separate from the AI_AGENTS_*
// vars below on purpose: the banner generator and the ops-agent system are
// unrelated features that happen to have both used Anthropic at first —
// they no longer have to share a provider.
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? "";

// The internal AI-operations agent system (Risk/Odds/Settlement/Fraud/
// Payments/Compliance/Support/Orchestrator/Ao Vivo/Pré-Jogo/Liquidação de
// Bilhetes — see lib/aiAgents/). Deliberately NOT tied to Anthropic — user
// request, 2026-08-11: run this on a free/open-source model instead of a
// paid one, without needing to self-host a GPU server. Talks to any
// OpenAI-compatible chat-completions endpoint (client.ts), so the default
// below points at OpenRouter, which fronts open-source models (Llama,
// Qwen, GPT-OSS, ...) including a genuinely free ":free" tier — but the
// same code works unchanged against Groq, Together AI, or a self-hosted
// Ollama/vLLM server later by just changing these two vars.
const AI_AGENTS_API_KEY = process.env["AI_AGENTS_API_KEY"] ?? "";
const AI_AGENTS_BASE_URL =
  process.env["AI_AGENTS_BASE_URL"]?.trim() || "https://openrouter.ai/api/v1";
// meta-llama/llama-3.3-70b-instruct:free — a 70B model, not a tiny 7-8B
// one, specifically because these agents reason over real financial/
// compliance data and need to reliably follow the strict JSON contract in
// client.ts. OpenRouter's free-tier roster changes over time (verify at
// openrouter.ai/models) and free models are capped at 20 req/min and
// 50 req/day with no credits purchased (1,000/day after a one-time $10
// credit purchase) — the agents are meant to be run on demand from the
// admin panel, not on a tight schedule, to stay well under that.
const AI_AGENTS_MODEL =
  process.env["AI_AGENTS_MODEL"]?.trim() || "meta-llama/llama-3.3-70b-instruct:free";

// ── BET62 Live + Match Tracker + Streaming ──
//
//  ODDS/MERCADOS: PulseScore — agregador odds multi-bookmaker.
//    • Odds em tempo real, mercados normalizados (canonicalMarket). REST
//      polling para futebol e tênis; WebSocket (~1s) dedicado ao futebol
//      mas ainda não consumido no payload ao vivo (só observação — ver
//      footballWs.ts).
//    • Cota ilimitada. Nunca usar para estatísticas/H2H/rankings/logos.
//
//  TRACKER LIVE: StatScore — placar/minuto/incidentes AO VIVO.
//    • Endpoint: /get_pushes/{eventId}. Auth: header X-Auth (OBRIGATÓRIO) + query ?auth= fallback compat.
//    • Requer Referer: https://widgets.statscore.com/. Payload mais rico (minute, status, incidents[]).
//    • Requer mapeamento MANUAL do admin (live_stream_mappings.statscore_event_id).
//    • Fallback automático: SportScore -> Statpal -> PulseScore (por nome de time, zero trabalho manual).
//
//  STATS/EVENTOS: StatPal — dados estatísticos, play-by-play, metadados.
//    • RESPONSABILIDADES: Estatísticas de jogo, play-by-play, H2H, rankings/standings, logos, ligas detalhadas.
//    • NÃO FAZ: Agregação multi-bookmaker de odds (isso é PulseScore).
//    • Soccer: /v2/soccer/matches/live + /match/{id}/statistics. Outros esportes: /v1/*
//    • Cota: 300.000 requests/dia. Cache TTL rigoroso. Verificação de quota via /user-request-count (GRÁTIS, não conta na cota).
//    • 100% AUTOMÁTICO por nome de time (ZERO trabalho manual por partida — futebol apenas).
//
//  STREAM HLS: SMYTDRYT — playlist .m3u8, admin preenche manualmente os
//  7 campos de vídeo em live_stream_mappings por evento.
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

// api-tennis.com — dedicated tennis provider (2026-09-09). Auth is an
// `APIkey` QUERY PARAM (not a Bearer header like GOAL API), and every
// operation goes through one endpoint with a `method=` selector rather than
// separate REST paths — the response envelope is `{success, result}`, not
// GOAL API's `{success, data}`. get_fixtures/get_livescore already embed
// pointbypoint/scores/statistics inline (no separate per-match calls
// needed). A real inbound WebSocket (confirmed 2026-09-09) pushes live
// event + point-by-point updates using the SAME APIkey.
// api-tennis is tennis's match-state authority (fixtures/live score/sets/
// server/H2H/rankings/statistics).
const TENNIS_API_KEY = process.env["TENNIS_API_KEY"] ?? "";
const TENNIS_API_BASE_URL =
  process.env["TENNIS_API_BASE_URL"]?.trim() || "https://api.api-tennis.com/tennis/";
const TENNIS_API_WS_URL = process.env["TENNIS_API_WS_URL"]?.trim() || "wss://wss.api-tennis.com/live";

// PulseScore (api.pulsescore.net) — dedicated odds/markets/bookmakers
// provider (2026-09-10), confirmed real via 5 endpoints the user pasted
// (soccer/leagues, soccer/events list+detail, live-events list+detail).
// Auth is a plain `x-secret: <key>` header — a third distinct auth style
// from GOAL API's Bearer and api-tennis's APIkey query param. Every
// response is already normalized on PulseScore's side into
// canonicalMarket/canonicalOutcome (MATCH_RESULT, OVER_UNDER,
// ASIAN_HANDICAP, ...) with numeric `odds` and a raw `rawOdds` string kept
// alongside — this client only wraps the transport, real market/odds
// normalization into BET62's own shape is a separate, later step (see
// providers/pulsescore/README.md).
// Deactivated 2026-09-14 on explicit user instruction. Forced to "" here
// rather than deleting the integration outright — every PulseScore call
// site (shadowMatchSync's live/prematch crons, the WebSocket wake-up
// signal, matches.ts's odds path) already gates on
// `if (CONFIG.PULSESCORE_API_KEY)`, so this one line turns all of them
// off regardless of whether the real key is still set in Railway.
// Reversible by deleting this line if PulseScore is ever needed again.
const PULSESCORE_API_KEY = "";
const PULSESCORE_BASE_URL =
  process.env["PULSESCORE_BASE_URL"]?.trim() || "https://api.pulsescore.net";
// Confirmed real in production (2026-09-10): the account's PRO plan enforces
// 1 request/second per bookmaker (HTTP 429 "Too many requests..." on the
// second request), and PulseScoreClient had no throttling — the shadow-match
// sync's own pagination loop tripped it (two requests 27ms apart). Default
// is slightly over 1000ms to leave margin for clock/network jitter.
const PULSESCORE_MIN_REQUEST_INTERVAL_MS =
  Number(process.env["PULSESCORE_MIN_REQUEST_INTERVAL_MS"] ?? "1100") || 1100;
// Confirmed real via the user-provided PulseScore docs (2026-09-10): the
// PRO plan (this account's plan) includes 1 concurrent WebSocket
// connection per bookmaker, auth via a `key` QUERY PARAM (not the REST
// client's `x-secret` header) — this is the 1xBet ("onexbet") bookmaker's
// endpoint specifically, matching every REST path this integration already
// uses.
// UNCONFIRMED 2026-09-11: mirrors the REST path's onexbet->v3/bet365
// switch, but unlike the REST paths (each verified via a real request),
// this exact WS path was never tested against bet365. Low risk either
// way — startPulseScoreWebSocket() is called with no callback (see
// api/index.ts), so nothing consumes its frames yet; a wrong URL just
// means silent reconnect attempts, no functional impact.
const PULSESCORE_WS_URL =
  process.env["PULSESCORE_WS_URL"]?.trim() || "wss://api.pulsescore.net/api/v3/bet365/ws/live";

export const CONFIG = {
  SILENTAPI_BASE_URL,
  SILENTAPI_AUTH_TOKEN,
  SILENTAPI_CALLBACK_SECRET,
  PALACE_CASINO_BASE_URL,
  PALACE_CASINO_API_TOKEN,
  PALACE_CASINO_CALLBACK_TOKEN,
  ANTHROPIC_API_KEY,
  AI_AGENTS_API_KEY,
  AI_AGENTS_BASE_URL,
  AI_AGENTS_MODEL,
  SMYTDRYT_HOST_URL,
  SMYTDRYT_DEFAULT_STATS_HOST,
  TENNIS_API_KEY,
  TENNIS_API_BASE_URL,
  TENNIS_API_WS_URL,
  PULSESCORE_API_KEY,
  PULSESCORE_BASE_URL,
  PULSESCORE_MIN_REQUEST_INTERVAL_MS,
  PULSESCORE_WS_URL,
  LIVE_UPDATE_INTERVAL: 750,
  PREMATCH_UPDATE_INTERVAL: 300_000,
  REOPEN_DELAY_GOAL_LOW: 12_000,
  REOPEN_DELAY_VAR_LOW: 20_000,
  REOPEN_DELAY_GOAL_HIGH: 25_000,
  REOPEN_DELAY_VAR_HIGH: 45_000,
  MAX_ODDS_DRIFT: 0.40,
  CACHE_TTL_MS: 86_400_000,

  // Kept well below LIVE_UPDATE_INTERVAL (the SSE broadcastLive() tick) on
  // purpose: broadcastLive() forces a fresh payload rebuild every tick, but
  // that rebuild reads these same per-sport caches — if this TTL matched or
  // exceeded the tick interval, the two timers could drift out of phase and
  // serve up to ~2x LIVE_UPDATE_INTERVAL-stale data at some ticks instead of
  // the ~750ms the broadcast cadence implies.
  // MAX plan allows 3 req/sec per bookmaker, so 350ms is safe (~2.85 req/s
  // = ~95% of the 333ms floor, leaving headroom for manual debug calls).
  LIVE_CACHE_TTL: 350,
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
  "anytimeGoalscorer",
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
