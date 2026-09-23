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
// Goal API is the authoritative football state/event/statistics source.
// PropLine is the authoritative odds and multi-sport source. Both clients
// live in the API server; the browser only sees the normalized Bet62 routes.
const GOAL_API_KEY = process.env["GOAL_API_KEY"] ?? "";
const GOAL_API_BASE_URL =
  process.env["GOAL_API_BASE_URL"]?.trim() || "https://api.goal-api.com/v1";
const GOAL_API_WS_URL =
  process.env["GOAL_API_WS_URL"]?.trim() || "wss://api.goal-api.com/ws";
const PROPLINE_API_KEY = process.env["PROPLINE_API_KEY"] ?? "";
const PROPLINE_BASE_URL =
  process.env["PROPLINE_BASE_URL"]?.trim() || "https://api.prop-line.com";
const PROPLINE_WS_URL = process.env["PROPLINE_WS_URL"]?.trim() || "";
const SPORTS_API_TIMEOUT_MS = Number(process.env["SPORTS_API_TIMEOUT_MS"] ?? "5000");
const SPORTS_API_LIVE_CACHE_MS = Number(process.env["SPORTS_API_LIVE_CACHE_MS"] ?? "3000");
const SPORTS_API_ODDS_CACHE_MS = Number(process.env["SPORTS_API_ODDS_CACHE_MS"] ?? "5000");
const PUSH_ODDS_MAX_AGE_MS = Number(process.env["PUSH_ODDS_MAX_AGE_MS"] ?? "5000");
const PREMATCH_ODDS_MAX_AGE_MS = Number(process.env["PREMATCH_ODDS_MAX_AGE_MS"] ?? "45000");

// Mr. Doge remains available only as a legacy compatibility module while
// deployments migrate; it is deliberately not selected by the match routes.
// The old comments below document the SDK for the isolated compatibility code.
//
// Mr. Doge (api.mrdoge.co, @mrdoge/node) — legacy provider
// (matches.subscribeLive pushes deltas for every live match matching a
// sports filter in ONE connection, rather than one poll per sport). Auth
// is a Bearer-style `sk_live_...` key passed to the SDK constructor, not a
// header this codebase builds itself. Confirmed real via the account's own
// Business-tier key and the actual published package's shipped .d.ts
// (not just doc prose) 2026-09-20: matches.list/subscribeLive cover
// soccer/basketball/american_football/baseball/ice_hockey/volleyball/
// handball/tennis — darts and MMA (two of BET62's 8 sports) are NOT
// covered by this provider, no code here can produce real data for them
// until a separate source is found. odds.list/odds.subscribe (Business
// tier) are a separate per-match resource, keyed by matchId, not embedded
// on Match — only 3 market sysnames are confirmed real so far
// (SOCCER_MATCH_RESULT[_PRELIVE], SOCCER_UNDER_OVER,
// SOCCER_BOTH_TEAMS_TO_SCORE); betType is an open string at the protocol
// level (no enum to enumerate from), so any other market requires a real
// API probe before being wired in — never guess a sysname the way an
// earlier bzzoiro/PulseScore market mapping did and shipped a
// misclassified BTTS/corners market.
const MRDOGE_API_KEY = process.env["MRDOGE_API_KEY"] ?? "";
const BIGBANG_API_KEY = process.env["BIGBANG_API_KEY"] ?? "";

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
  GOAL_API_KEY,
  GOAL_API_BASE_URL,
  GOAL_API_WS_URL,
  PROPLINE_API_KEY,
  PROPLINE_BASE_URL,
  PROPLINE_WS_URL,
  SPORTS_API_TIMEOUT_MS: Number.isFinite(SPORTS_API_TIMEOUT_MS) && SPORTS_API_TIMEOUT_MS > 0 ? SPORTS_API_TIMEOUT_MS : 5_000,
  SPORTS_API_LIVE_CACHE_MS: Number.isFinite(SPORTS_API_LIVE_CACHE_MS) && SPORTS_API_LIVE_CACHE_MS > 0 ? SPORTS_API_LIVE_CACHE_MS : 3_000,
  SPORTS_API_ODDS_CACHE_MS: Number.isFinite(SPORTS_API_ODDS_CACHE_MS) && SPORTS_API_ODDS_CACHE_MS > 0 ? SPORTS_API_ODDS_CACHE_MS : 5_000,
  PUSH_ODDS_MAX_AGE_MS: Number.isFinite(PUSH_ODDS_MAX_AGE_MS) && PUSH_ODDS_MAX_AGE_MS > 0 ? PUSH_ODDS_MAX_AGE_MS : 5_000,
  PREMATCH_ODDS_MAX_AGE_MS: Number.isFinite(PREMATCH_ODDS_MAX_AGE_MS) && PREMATCH_ODDS_MAX_AGE_MS > 0 ? PREMATCH_ODDS_MAX_AGE_MS : 45_000,
  MRDOGE_API_KEY,
  BIGBANG_API_KEY,
  ANTHROPIC_API_KEY,
  AI_AGENTS_API_KEY,
  AI_AGENTS_BASE_URL,
  AI_AGENTS_MODEL,
  SMYTDRYT_HOST_URL,
  SMYTDRYT_DEFAULT_STATS_HOST,
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
