import { createServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { buildLiveMatches } from "./routes/matches";
import { CONFIG } from "./lib/config";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/ws" });

async function broadcastLive() {
  if (wss.clients.size === 0) return;
  try {
    const matches = await buildLiveMatches();
    const payload = JSON.stringify({ type: "live", matches });
    for (const client of wss.clients) {
      if ((client as WebSocket).readyState === 1) {
        (client as WebSocket).send(payload);
      }
    }
  } catch (err) {
    logger.warn({ err }, "WebSocket broadcast failed");
  }
}

wss.on("connection", (ws: WebSocket) => {
  logger.info("WebSocket client connected");
  buildLiveMatches()
    .then(matches => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "live", matches }));
      }
    })
    .catch(() => {});
  ws.on("close", () => logger.info("WebSocket client disconnected"));
});

setInterval(broadcastLive, CONFIG.LIVE_UPDATE_INTERVAL);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
