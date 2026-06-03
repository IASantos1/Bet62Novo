import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { initDb } from "@workspace/db";

const app: Express = express();

// Initialise database schema on startup (idempotent — uses IF NOT EXISTS).
initDb()
  .then(() => logger.info("Database schema ready"))
  .catch((err) => logger.error({ err }, "Database schema initialisation failed"));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production (Railway), serve the built React SPA and handle client-side routing.
// __dirname is set by the esbuild banner to the directory of the running bundle
// (e.g. artifacts/api-server/dist/), so ../../bet62/dist/public resolves correctly.
if (process.env.NODE_ENV === "production") {
  const webDistPath = path.resolve(
    (globalThis as Record<string, unknown>).__dirname as string ?? __dirname,
    "../../bet62/dist/public",
  );
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(webDistPath, "index.html"));
    });
    logger.info({ webDistPath }, "Serving web SPA from dist");
  } else {
    logger.warn({ webDistPath }, "Web dist not found — API-only mode");
  }
}

export default app;
