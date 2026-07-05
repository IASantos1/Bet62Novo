import { startSettlementWorkerLoop } from "../engine/settlement/worker/workerLoop";
import { logger } from "../lib/logger.js";

async function bootstrap() {
  logger.info("[SettlementWorker] starting...");

  await startSettlementWorkerLoop();
}

bootstrap().catch((err) => {
  logger.error({ err }, "[SettlementWorker] crashed");
  process.exit(1);
});
