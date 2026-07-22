import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { startSettlementWorker } from "../settlement.js";

const port = Number(process.env.API_PORT ?? process.env.PORT ?? "8080");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid port: ${port}`);
}

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "API server started");

  // Start the auto-settlement worker after the server is up.
  // This scans all pending bets and settles them as matches finish
  // (or early in-play when the outcome is already determined).
  startSettlementWorker();
  logger.info("Auto-settlement worker started");
});
