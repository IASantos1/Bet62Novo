import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { getUpcomingAll, initSportWebSockets, initV1SportWebSockets, initLiveWsServer, primeSportLiveCaches } from "./routes/matches";
import { startSettlementWorker, autoSettlePendingBets, regradeSettledBetsForMatch } from "./settlement";
import { startSettlementQueueWorker } from "./lib/settlementQueue";

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
  primeSportLiveCaches().catch(() => {});

  const wsMode = String(process.env.SPORTSAPI_WS_MODE ?? "hybrid").toLowerCase();
  const enableV2 = wsMode === "v2" || wsMode === "hybrid" || wsMode === "v1+v2" || wsMode === "v1v2";
  const enableV1 = wsMode !== "none";

  if (enableV2) initSportWebSockets();
  if (enableV1) initV1SportWebSockets();

  // WebSocket endpoint for mobile clients (/api/matches/ws)
  initLiveWsServer(server);

  // Start background bet auto-settlement worker
  startSettlementQueueWorker(async ({ matchId, jobId }) => {
    await autoSettlePendingBets({ matchIds: [matchId] });
    await regradeSettledBetsForMatch(matchId, jobId);
  });
  startSettlementWorker();
});
