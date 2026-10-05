// Self-scheduling poll loop for the WinHouse PREMATCH -> LIVE -> FINISHED ->
// DELETE lifecycle (services/winhouse/liveMonitor.ts). Same pattern as
// winhousePromotionCron.ts, including the same production-only guard — a
// PR-preview deploy editing/deleting the SAME live Telegram messages as
// production would be at least as disruptive as the duplicate-posting bug
// winhousePromotionCron.ts was already fixed for, so this never runs
// outside RAILWAY_ENVIRONMENT_NAME=production (or off Railway entirely).
//
// Env vars (all optional):
//   WINHOUSE_LIVE_MONITOR_ENABLED      = "true" | "false" — default: "true"
//   WINHOUSE_LIVE_MONITOR_INTERVAL_MS  default: 15_000 (15s) — how often to
//     poll /ajax/livegames. The edit throttle (WINHOUSE_LIVE_MIN_EDIT_GAP_MS,
//     read in liveMonitor.ts) is what actually limits editMessageText calls,
//     not this interval.
import { logger } from "./logger.js";
import { runWinHouseLiveMonitorTick, type LiveMonitorTickResult } from "../services/winhouse/liveMonitor.js";

let running = false;

type LastTickSnapshot = { at: string; outcome: LiveMonitorTickResult } | { at: string; outcome: "error"; error: string };

let lastTick: LastTickSnapshot | null = null;

export function getLastWinHouseLiveMonitorTick(): LastTickSnapshot | null {
  return lastTick;
}

const rawEnabledEnv: string | null = process.env.WINHOUSE_LIVE_MONITOR_ENABLED ?? null;
const railwayEnvironmentName: string | null = process.env.RAILWAY_ENVIRONMENT_NAME ?? null;

function isProductionEnvironment(): boolean {
  return railwayEnvironmentName === null || railwayEnvironmentName.trim().toLowerCase() === "production";
}

type CronStatus =
  | { enabled: true; startedAt: string; rawEnabledEnv: string | null; railwayEnvironmentName: string | null }
  | { enabled: false; rawEnabledEnv: string | null; railwayEnvironmentName: string | null };
let cronStatus: CronStatus = { enabled: false, rawEnabledEnv, railwayEnvironmentName };

export function getWinHouseLiveMonitorCronStatus(): CronStatus {
  return cronStatus;
}

async function tick(): Promise<void> {
  if (running) {
    logger.debug("[winhouseLiveMonitorCron] skipping: previous tick still in progress");
    return;
  }
  running = true;
  try {
    const result = await runWinHouseLiveMonitorTick();
    lastTick = { at: new Date().toISOString(), outcome: result };
    if (result.edited > 0 || result.finished > 0 || result.deleted > 0) {
      logger.info(result, "[winhouseLiveMonitorCron] tick");
    } else {
      logger.debug(result, "[winhouseLiveMonitorCron] tick (no-op)");
    }
  } catch (err) {
    lastTick = { at: new Date().toISOString(), outcome: "error", error: err instanceof Error ? err.message : String(err) };
    logger.error({ err }, "[winhouseLiveMonitorCron] tick failed");
  } finally {
    running = false;
  }
}

function parseIntervalMs(envName: string, fallbackMs: number, minMs: number): number {
  const raw = process.env[envName];
  if (!raw) return fallbackMs;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < minMs) {
    logger.error({ key: envName, raw, fallbackMs, minMs }, "Invalid winhouse live monitor cron interval env; using fallback");
    return fallbackMs;
  }
  return n;
}

export function startWinHouseLiveMonitorCron(): void {
  if (!isProductionEnvironment()) {
    logger.info(
      { railwayEnvironmentName },
      "[winhouseLiveMonitorCron] disabled — not the production environment (prevents PR-preview deploys from editing/deleting the live Telegram messages)",
    );
    return;
  }

  const explicitlyDisabled = rawEnabledEnv !== null && rawEnabledEnv.trim().toLowerCase() === "false";
  if (explicitlyDisabled) {
    logger.info({ rawEnabledEnv }, "[winhouseLiveMonitorCron] disabled via WINHOUSE_LIVE_MONITOR_ENABLED=false");
    return;
  }

  const intervalMs = parseIntervalMs("WINHOUSE_LIVE_MONITOR_INTERVAL_MS", 15_000, 5_000);
  cronStatus = { enabled: true, startedAt: new Date().toISOString(), rawEnabledEnv, railwayEnvironmentName };
  setTimeout(() => {
    void tick().finally(() => {
      setInterval(() => void tick(), intervalMs);
    });
  }, 20_000);
  logger.info({ intervalMs, rawEnabledEnv, railwayEnvironmentName }, "[winhouseLiveMonitorCron] scheduled");
}
