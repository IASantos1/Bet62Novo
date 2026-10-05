// Self-scheduling poll loop for the WinHouse odds -> Telegram promotion
// pipeline (services/winhouse/promotionScheduler.ts). Same pattern as
// aiAgentsCron.ts — no external cron/queue dependency, just a setTimeout/
// setInterval loop guarded against overlap.
//
// Env vars (both optional):
//   WINHOUSE_PROMO_CRON_ENABLED      = "true" | "false"  — default: "true"
//   WINHOUSE_PROMO_CRON_INTERVAL_MS  default: 2 * 60 * 1000 (2m) — how often
//     to check for a new fixture to post. The actual publish pacing (at
//     least 10 minutes between posts) is enforced inside the scheduler
//     itself (WINHOUSE_PROMO_MIN_GAP_MS), not by this interval.
//
// Production-only by default — confirmed necessary (2026-10-05): Railway's
// PR preview environments get their own isolated database but INHERIT the
// same secrets as production, TELEGRAM_BOT_TOKEN/TELEGRAM_CHANNEL_ID
// included. Without this guard, every open PR that touches this service
// runs its own independent copy of this cron, each with its own
// DB-isolated pacing/dedupe, all posting to the SAME real Telegram
// channel — confirmed in production as interleaved old/new-format posts
// from two different environments. RAILWAY_ENVIRONMENT_NAME is a standard
// Railway-provided variable; only "production" may run this. Outside
// Railway (the var is simply unset) it runs as before.
import { logger } from "./logger.js";
import { runWinHousePromotionTick, type WinHousePromotionTickResult } from "../services/winhouse/promotionScheduler.js";

let running = false;

// Last tick's outcome, kept in memory so GET /api/winhouse/promotion-posts
// can show *why* nothing has posted yet (too soon, no candidates, a thrown
// error, ...) instead of that being a guess — this is a single-instance
// service, so in-memory is enough; it resets on redeploy like any other
// in-memory state.
type LastTickSnapshot =
  | { at: string; outcome: WinHousePromotionTickResult }
  | { at: string; outcome: "error"; error: string };

let lastTick: LastTickSnapshot | null = null;

export function getLastWinHousePromotionTick(): LastTickSnapshot | null {
  return lastTick;
}

// Captured at module load, unconditionally — so if `enabled` ever reads
// false, this says exactly what Railway (or wherever) actually has set for
// WINHOUSE_PROMO_CRON_ENABLED (including a stray value that isn't literally
// "false" but also isn't unset), rather than that being a second guess on
// top of the first.
const rawEnabledEnv: string | null = process.env.WINHOUSE_PROMO_CRON_ENABLED ?? null;

const railwayEnvironmentName: string | null = process.env.RAILWAY_ENVIRONMENT_NAME ?? null;

// true only when we can positively confirm this is production: the
// variable is unset (not on Railway at all — local/other host, runs as
// before) or it reads "production". Any other Railway environment name
// (a PR preview among them) is blocked.
function isProductionEnvironment(): boolean {
  return railwayEnvironmentName === null || railwayEnvironmentName.trim().toLowerCase() === "production";
}

// Whether startWinHousePromotionCron() actually scheduled the loop, and
// when — so "lastTick is still null" can be told apart from "disabled",
// "blocked (not production)" and "started N seconds ago, first tick just
// hasn't fired yet" instead of leaving that to guesswork too.
type CronStatus =
  | { enabled: true; startedAt: string; rawEnabledEnv: string | null; railwayEnvironmentName: string | null }
  | { enabled: false; rawEnabledEnv: string | null; railwayEnvironmentName: string | null };
let cronStatus: CronStatus = { enabled: false, rawEnabledEnv, railwayEnvironmentName };

export function getWinHousePromotionCronStatus(): CronStatus {
  return cronStatus;
}

async function tick(): Promise<void> {
  if (running) {
    logger.debug("[winhousePromoCron] skipping: previous tick still in progress");
    return;
  }
  running = true;
  try {
    const result = await runWinHousePromotionTick();
    lastTick = { at: new Date().toISOString(), outcome: result };
    if (result.action === "posted") {
      logger.info({ gameId: result.gameId, status: result.status }, "[winhousePromoCron] tick posted");
    } else {
      logger.debug({ reason: result.reason }, "[winhousePromoCron] tick skipped");
    }
  } catch (err) {
    lastTick = { at: new Date().toISOString(), outcome: "error", error: err instanceof Error ? err.message : String(err) };
    logger.error({ err }, "[winhousePromoCron] tick failed");
  } finally {
    running = false;
  }
}

function parseIntervalMs(envName: string, fallbackMs: number, minMs: number): number {
  const raw = process.env[envName];
  if (!raw) return fallbackMs;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < minMs) {
    logger.error({ key: envName, raw, fallbackMs, minMs }, "Invalid winhouse promo cron interval env; using fallback");
    return fallbackMs;
  }
  return n;
}

export function startWinHousePromotionCron(): void {
  if (!isProductionEnvironment()) {
    logger.info(
      { railwayEnvironmentName },
      "[winhousePromoCron] disabled — not the production environment (prevents PR-preview deploys from posting to the live Telegram channel)",
    );
    return;
  }

  const explicitlyDisabled = rawEnabledEnv !== null && rawEnabledEnv.trim().toLowerCase() === "false";
  if (explicitlyDisabled) {
    logger.info({ rawEnabledEnv }, "[winhousePromoCron] disabled via WINHOUSE_PROMO_CRON_ENABLED=false");
    return;
  }

  const intervalMs = parseIntervalMs("WINHOUSE_PROMO_CRON_INTERVAL_MS", 2 * 60 * 1000, 60 * 1000);
  cronStatus = { enabled: true, startedAt: new Date().toISOString(), rawEnabledEnv, railwayEnvironmentName };
  setTimeout(() => {
    void tick().finally(() => {
      setInterval(() => void tick(), intervalMs);
    });
  }, 15_000);
  logger.info({ intervalMs, rawEnabledEnv, railwayEnvironmentName }, "[winhousePromoCron] scheduled");
}
