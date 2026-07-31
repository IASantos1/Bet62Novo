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

// PulseScore — normalized real-bookmaker odds aggregator (bet365, etc.).
// Football pulled via REST polling; tennis via its WebSocket feed (PRO plan
// allows exactly 1 concurrent WS connection, so only one sport can stream
// live at a time — tennis was chosen since point-by-point pricing benefits
// most from push updates). Running in parallel with the existing in-house
// odds engine for comparison, not replacing it yet.
const PULSESCORE_API_KEY = process.env["PULSESCORE_API_KEY"] ?? "";
const PULSESCORE_BASE_URL =
  process.env["PULSESCORE_BASE_URL"]?.trim() || "https://api.pulsescore.net/api";
const PULSESCORE_BOOKMAKER =
  process.env["PULSESCORE_BOOKMAKER"]?.trim() || "bet365";

export const CONFIG = {
  SPORTSAPI_KEY,
  STATPAL_API_KEY,
  STATPAL_BASE_URL,
  SILENTAPI_BASE_URL,
  SILENTAPI_AUTH_TOKEN,
  SILENTAPI_CALLBACK_SECRET,
  PULSESCORE_API_KEY,
  PULSESCORE_BASE_URL,
  PULSESCORE_BOOKMAKER,
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
