import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { getUpcomingAll, initSportWebSockets, initV1SportWebSockets, initLiveWsServer } from "./routes/matches";
import { startSettlementWorker } from "./settlement";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Pre-warm all upcoming caches so first user request is instant
  getUpcomingAll().catch(() => {});

  // Open persistent WebSocket connections to SportsAPI Pro V2 for real-time live scores
  initSportWebSockets();

  // Open V1 WebSocket connections for faster score-only updates (1-2s latency)
  initV1SportWebSockets();

  // WebSocket endpoint for mobile clients (/api/matches/ws)
  initLiveWsServer(server);

  // Start background bet auto-settlement worker
  startSettlementWorker();
});
