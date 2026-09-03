const STATPAL_API_KEY =
  process.env["STATPAL_API_KEY"] ??
  process.env["STATSPAL_API_KEY"] ??
  "";

const STATPAL_BASE_URL =
  process.env["STATPAL_BASE_URL"]?.trim() || "https://statpal.io/api";

const FOOTBALL_DAILY_PROVIDER =
  process.env["FOOTBALL_DAILY_PROVIDER"]?.trim() || "statpal";

const FOOTBALL_REFERENCE_PROVIDER =
  process.env["FOOTBALL_REFERENCE_PROVIDER"]?.trim() || "statpal";

// SilentAPI — third-party casino game aggregator (game launch + wallet
// callback). Secrets only ever come from the environment, never hardcoded —
// same convention as STATPAL_API_KEY above.
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
// Futebol e tênis ao vivo puxados via REST polling. O PRO plan só permite 1
// conexão WS concorrente; ela está atualmente dedicada ao futebol
// (footballWs.ts) rodando em paralelo apenas para observação — ainda não
// alimenta o payload ao vivo, pois o comportamento snapshot-vs-delta dos
// frames de futebol não foi confirmado (ver comentário em
// pulsescore/football.ts). O módulo WS do tênis (tennisWs.ts) existe mas
// está dormente (zero call sites) desde que a conexão foi movida pro futebol
// em 2026-08-08.
// Cota: ilimitada conforme plano do usuário. Usar sempre que possível para overlay de odds e comparação multi-bookmaker.
const PULSESCORE_API_KEY = process.env["PULSESCORE_API_KEY"] ?? "";
const PULSESCORE_BASE_URL =
  process.env["PULSESCORE_BASE_URL"]?.trim() || "https://api.pulsescore.net/api";
const PULSESCORE_BOOKMAKER =
  process.env["PULSESCORE_BOOKMAKER"]?.trim() || "bet365";

// SportMonks Football API v3 — replacing PulseScore/bwin as football's odds
// provider (PulseScore's football feed was deliberately blocked 2026-08-28,
// see pulsescore/football.ts's FOOTBALL_PULSESCORE_BLOCKED) and eventually
// its live match-state feed too. Auth is a `api_token` query
// param (not a header, unlike PulseScore's X-Secret) — confirmed against
// real GET /v3/football/rounds/{id} and /v3/football/livescores/inplay
// samples, 2026-08-28. Odds come pre-aggregated across bookmakers
// (fixtures.odds.bookmaker) — the sample confirmed real so far is all
// bookmaker_id 2 ("bet365"); which bookmaker(s) to standardize on is not
// yet decided.
const SPORTMONKS_API_KEY = process.env["SPORTMONKS_API_KEY"] ?? "";
const SPORTMONKS_BASE_URL =
  process.env["SPORTMONKS_BASE_URL"]?.trim() || "https://api.sportmonks.com/v3/football";

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

// ── BET62 Live + Streaming ──
//
//  ODDS/MERCADOS: PulseScore — agregador odds multi-bookmaker.
//    • Odds em tempo real, mercados normalizados (canonicalMarket). REST
//      polling para futebol e tênis; WebSocket (~1s) dedicado ao futebol
//      mas ainda não consumido no payload ao vivo (só observação — ver
//      footballWs.ts).
//    • Cota ilimitada. Nunca usar para estatísticas/H2H/rankings/logos.
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

export const CONFIG = {
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
  SPORTMONKS_API_KEY,
  SPORTMONKS_BASE_URL,
  ANTHROPIC_API_KEY,
  AI_AGENTS_API_KEY,
  AI_AGENTS_BASE_URL,
  AI_AGENTS_MODEL,
  SMYTDRYT_HOST_URL,
  SMYTDRYT_DEFAULT_STATS_HOST,
  FOOTBALL_DAILY_PROVIDER,
  FOOTBALL_REFERENCE_PROVIDER,
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
