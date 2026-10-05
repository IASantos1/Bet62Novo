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

// Whether startWinHousePromotionCron() actually scheduled the loop (vs.
// returning early because WINHOUSE_PROMO_CRON_ENABLED=false), and when —
// so "lastTick is still null" can be told apart from "disabled" and from
// "started N seconds ago, first tick just hasn't fired yet" instead of
// leaving that to guesswork too.
type CronStatus = { enabled: true; startedAt: string } | { enabled: false };
let cronStatus: CronStatus = { enabled: false };

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
  const explicitlyDisabled =
    process.env.WINHOUSE_PROMO_CRON_ENABLED !== undefined &&
    String(process.env.WINHOUSE_PROMO_CRON_ENABLED).toLowerCase() === "false";
  if (explicitlyDisabled) {
    logger.info("[winhousePromoCron] disabled via WINHOUSE_PROMO_CRON_ENABLED=false");
    return;
  }

  const intervalMs = parseIntervalMs("WINHOUSE_PROMO_CRON_INTERVAL_MS", 2 * 60 * 1000, 60 * 1000);
  cronStatus = { enabled: true, startedAt: new Date().toISOString() };
  setTimeout(() => {
    void tick().finally(() => {
      setInterval(() => void tick(), intervalMs);
    });
  }, 15_000);
  logger.info({ intervalMs }, "[winhousePromoCron] scheduled");
}
