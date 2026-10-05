import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startAiAgentsCron } from "./lib/aiAgentsCron.js";
import { startWinHousePromotionCron } from "./lib/winhousePromotionCron.js";
import { startWinHouseLiveMonitorCron } from "./lib/winhouseLiveMonitorCron.js";
import { ensureBigBangCatalogFresh } from "./services/bigbang/sync.js";

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

  void ensureBigBangCatalogFresh().catch((err) => {
    logger.warn({ err }, "[bigbang] initial catalog sync failed");
  });

  startAiAgentsCron();

  // WinHouse odds -> Telegram promotion poll loop. Safe to unconditionally
  // call: each tick no-ops when Telegram isn't configured (checked inside
  // runWinHousePromotionTick), same reasoning as the AI-agents cron above.
  // This is the file Railway actually runs (railway.json's startCommand ->
  // package.json's "start" -> dist/index.mjs, built from THIS file, not
  // src/api/index.ts — the near-duplicate entrypoint this call was
  // originally, and mistakenly, added to in #569).
  startWinHousePromotionCron();

  // PREMATCH -> LIVE -> FINISHED -> DELETE lifecycle for the fixtures the
  // promotion cron above already posted — edits/deletes those same
  // messages in place, never sends a new one. Same "safe to unconditionally
  // call" reasoning (no-ops per tick when Telegram isn't configured, or
  // there's nothing currently posted to watch).
  startWinHouseLiveMonitorCron();
});
