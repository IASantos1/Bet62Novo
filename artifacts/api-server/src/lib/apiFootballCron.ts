// Self-scheduling cron for the api-football.com banner-automation sync —
// same shape as aiAgentsCron.ts (no external cron/queue dependency, a
// self-chaining setTimeout → setInterval loop, an in-memory overlap guard,
// and a fail-closed no-op when the required API key isn't configured).
//
// Deliberately conservative on request budget: api-football.com's free
// tier allows 100 requests/day, and each sync cycle makes at most 2
// requests total (see services/apiFootball/bannerSync.ts) regardless of
// how many competitions are enabled. A 30-minute default interval means
// 48 requests/day — safe margin, still tunable via env var for paid plans.
//
// Env vars (all optional):
//   API_FOOTBALL_CRON_ENABLED       = "true" | "false" — default: "true" if API_FOOTBALL_KEY is set
//   API_FOOTBALL_CRON_INTERVAL_MS   default: 30 * 60 * 1000 (30m), floor 5m
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";
import { syncFeaturedBannersFromApiFootball } from "../services/apiFootball/bannerSync.js";

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let currentlyRunning = false;

function parseIntervalMs(): number {
  const raw = process.env["API_FOOTBALL_CRON_INTERVAL_MS"];
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_INTERVAL_MS) {
    logger.error(
      { raw, fallbackMs: DEFAULT_INTERVAL_MS, minMs: MIN_INTERVAL_MS },
      "[apiFootballCron] invalid API_FOOTBALL_CRON_INTERVAL_MS; using fallback",
    );
    return DEFAULT_INTERVAL_MS;
  }
  return n;
}

async function runGuarded(): Promise<void> {
  if (currentlyRunning) {
    logger.debug("[apiFootballCron] skipping tick — previous sync still in progress");
    return;
  }
  currentlyRunning = true;
  try {
    await syncFeaturedBannersFromApiFootball();
  } catch (err) {
    logger.error({ err }, "[apiFootballCron] sync tick failed");
  } finally {
    currentlyRunning = false;
  }
}

export function startApiFootballCron(): void {
  const explicitlyDisabled =
    process.env["API_FOOTBALL_CRON_ENABLED"] !== undefined &&
    String(process.env["API_FOOTBALL_CRON_ENABLED"]).toLowerCase() === "false";
  if (explicitlyDisabled) {
    logger.info("[apiFootballCron] disabled via API_FOOTBALL_CRON_ENABLED=false");
    return;
  }
  if (!CONFIG.API_FOOTBALL_KEY) {
    logger.info("[apiFootballCron] not starting — API_FOOTBALL_KEY is not set");
    return;
  }

  const intervalMs = parseIntervalMs();
  const firstRunDelay = Math.max(5_000, Math.floor(intervalMs / 10));
  setTimeout(() => {
    void runGuarded().finally(() => {
      setInterval(() => {
        void runGuarded();
      }, intervalMs);
    });
  }, firstRunDelay);
  logger.info({ intervalMs, firstRunDelay }, "[apiFootballCron] scheduled");
}
