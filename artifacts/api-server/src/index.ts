import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startSettlementWorker } from "./settlement.js";
import { startAiAgentsCron } from "./lib/aiAgentsCron.js";
import { ensureBigBangCatalogFresh } from "./services/bigbang/sync.js";
import { startMrDogeLiveSync } from "./services/mrdoge/liveSync.js";

// Keep the API process alive through unexpected async failures. The app has
// deliberate fire-and-forget work for settlement, live refresh and catalog
// warming; logging and continuing is safer than letting a single rejection
// restart the whole server and drop live clients.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "[process] unhandledRejection - not crashing");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[process] uncaughtException - not crashing");
});

const rawPort = process.env["API_PORT"] ?? process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid port value: "${rawPort}"`);
}

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "API server started");

  startSettlementWorker();
  logger.info("Auto-settlement worker started");

  void ensureBigBangCatalogFresh().catch((err) => {
    logger.warn({ err }, "[bigbang] initial catalog sync failed");
  });

  void startMrDogeLiveSync().catch((err) => {
    logger.warn({ err }, "[mrdoge] initial live sync start failed");
  });

  startAiAgentsCron();
});
