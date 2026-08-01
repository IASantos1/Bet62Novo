import Redis from "ioredis";
import { logger } from "./logger.js";

// Shared lazy singleton — same inert-without-REDIS_URL pattern used by
// settlement.ts/settlementQueue.ts, but centralized here since the BET62
// Live + Match Tracker + Streaming feature (services/betby, services/
// smytdryt) needs the same connection across otherwise-unrelated modules.
let client: any | null | undefined;

export function getRedis(): any | null {
  if (client !== undefined) return client;
  const url = process.env["REDIS_URL"];
  if (typeof url !== "string" || url.trim() === "") {
    logger.warn("[redis] REDIS_URL not configured — live-stream caching disabled.");
    client = null;
    return client;
  }
  client = new (Redis as any)(url, { maxRetriesPerRequest: null });
  client.on("error", (err: Error) => logger.error({ err }, "[redis] connection error"));
  return client;
}
