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

// Optional — powers the admin "AI-assisted casino banner" copy generator
// (routes/admin.ts POST /casino/banners/ai-generate). Falls back to a
// deterministic template when unset, so the feature works either way.
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? "";

// ── BET62 Live + Match Tracker + Streaming (BetBY / StatScore+Statpal / SMYTDRYT) ──
// BetBY supplies the live events list (score/minute/status). The Match
// Tracker is primarily StatScore's get_pushes (real auth confirmed — see
// STATSCORE_AUTH below), which needs an admin-mapped eventId per BetBY
// event (services/statscore/resolver.ts); Statpal (services/statpal/
// liveTracker.ts, matched by team name, no mapping needed) is the automatic
// fallback for events not yet mapped. SMYTDRYT supplies the HLS stream URL
// keyed by its own matchId. Neither StatScore nor SMYTDRYT share BetBY's ID
// scheme, so live_stream_mappings (see lib/db) bridges both.
//
// BetBY's real live feed is REST, not the WebSocket originally assumed:
//   GET {BETBY_API_BASE_URL}/api/v4/live/brand/{BETBY_BRAND_ID}/{BETBY_LANG}/0
// returns a manifest ({ version, top_events_versions, rest_events_versions }
// among other bookkeeping fields); fetching that same path with a specific
// version number instead of 0 returns a chunk of event data for that
// version. Chunks are deltas, not full snapshots — an event's team names
// (desc.competitors) only appear once, the first time it's seen, so
// services/betby/client.ts keeps a persistent merged cache across polls
// rather than treating each poll as self-contained (confirmed from a real
// captured response: only 1 of ~40 events in one chunk carried `desc`).
// The WebSocket (wss://.../api/v1/ws_new) + JWT handshake is believed to be
// for session/auth purposes only, not required to read this public feed —
// unconfirmed, so BETBY_API_TOKEN is sent as a Bearer header when present
// but the poller still attempts the request without one.
const BETBY_API_BASE_URL = process.env["BETBY_API_BASE_URL"]?.trim() || "";
const BETBY_BRAND_ID = process.env["BETBY_BRAND_ID"]?.trim() || "";
const BETBY_LANG = process.env["BETBY_LANG"]?.trim() || "en";
const BETBY_API_TOKEN = process.env["BETBY_API_TOKEN"] ?? "";
const BETBY_POLL_INTERVAL_MS = 5_000;

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
  BETBY_POLL_INTERVAL_MS,
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
