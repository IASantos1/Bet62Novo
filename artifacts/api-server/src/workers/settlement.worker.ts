import "dotenv/config";
import { logger } from "../lib/logger.js";
import { startSettlementWorkerLoop } from "../engine/settlement/worker/workerLoop.js";

/**
 * Standalone settlement worker process.
 *
 * ⚠️  GUARD: The main API server (api/index.ts) already runs startSettlementWorker()
 * inline. This standalone worker is ONLY meant to run as a separate process when
 * ENABLE_STANDALONE_WORKER=true is set explicitly.
 *
 * Running both simultaneously will process the same bets twice — the idempotency
 * key in ensureSettlementTransitionIdempotency() prevents double-payouts, but it
 * wastes resources and creates noisy logs.
 */
const enableStandalone = process.env["ENABLE_STANDALONE_WORKER"] === "true";

if (!enableStandalone) {
  logger.warn(
    "Standalone settlement worker is disabled. " +
    "The main API server runs settlement inline. " +
    "Set ENABLE_STANDALONE_WORKER=true to override.",
  );
  // Keep the process alive so it doesn't crash the workflow, but do nothing.
  setInterval(() => {}, 60_000);
} else {
  async function bootstrap() {
    logger.info("Starting standalone Settlement Worker...");
    try {
      await startSettlementWorkerLoop();
      logger.info("Standalone Settlement Worker started successfully.");
    } catch (err) {
      logger.error({ err }, "Standalone Settlement Worker failed to start");
      process.exit(1);
    }
  }
  bootstrap();
}
