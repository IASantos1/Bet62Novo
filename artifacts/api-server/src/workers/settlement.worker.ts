import "dotenv/config";
import { logger } from "../lib/logger.js";
import { startSettlementWorkerLoop } from "../engine/settlement/worker/workerLoop.js";

async function bootstrap() {
  logger.info("Starting Settlement Worker...");

  try {
    await startSettlementWorkerLoop();

    logger.info("Settlement Worker started successfully.");
  } catch (err) {
    logger.error({ err }, "Settlement Worker failed to start");
    process.exit(1);
  }
}

bootstrap();
