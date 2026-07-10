import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";

const port = Number(process.env.API_PORT ?? process.env.PORT ?? "8080");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid port: ${port}`);
}

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "API server started");
});
