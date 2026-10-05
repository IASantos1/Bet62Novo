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
import { logger } from "./logger.js";
import { runWinHousePromotionTick } from "../services/winhouse/promotionScheduler.js";

let running = false;

async function tick(): Promise<void> {
  if (running) {
    logger.debug("[winhousePromoCron] skipping: previous tick still in progress");
    return;
  }
  running = true;
  try {
    const result = await runWinHousePromotionTick();
    if (result.action === "posted") {
      logger.info({ gameId: result.gameId, status: result.status }, "[winhousePromoCron] tick posted");
    } else {
      logger.debug({ reason: result.reason }, "[winhousePromoCron] tick skipped");
    }
  } catch (err) {
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
  const explicitlyDisabled =
    process.env.WINHOUSE_PROMO_CRON_ENABLED !== undefined &&
    String(process.env.WINHOUSE_PROMO_CRON_ENABLED).toLowerCase() === "false";
  if (explicitlyDisabled) {
    logger.info("[winhousePromoCron] disabled via WINHOUSE_PROMO_CRON_ENABLED=false");
    return;
  }

  const intervalMs = parseIntervalMs("WINHOUSE_PROMO_CRON_INTERVAL_MS", 2 * 60 * 1000, 60 * 1000);
  setTimeout(() => {
    void tick().finally(() => {
      setInterval(() => void tick(), intervalMs);
    });
  }, 15_000);
  logger.info({ intervalMs }, "[winhousePromoCron] scheduled");
}
