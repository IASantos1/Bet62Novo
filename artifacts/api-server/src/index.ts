import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";


const port = Number(process.env.PORT);

if (!port) throw new Error("PORT missing");

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "Server running");

});
