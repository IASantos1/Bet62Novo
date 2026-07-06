import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error("PORT environment variable is required.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "API server started");
});
