import { type Request, type Response, type NextFunction } from "express";
import Redis from "ioredis";
import { logger } from "../lib/logger.js";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  key?: (req: Request) => string;
  /** Namespaces the counter so multiple limiters don't share buckets. */
  name: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

let redisClient: any | null | undefined;

// Rate limiting only protects against brute-force/credential-stuffing if the
// counter is shared across all server instances behind the load balancer —
// a per-process in-memory Map lets each instance grant its own quota. Reuse
// REDIS_URL (already optional elsewhere in this repo) when available, and
// fall back to in-memory so a single-instance/dev setup still gets basic
// protection instead of none.
function getRateLimitRedis(): any | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env["REDIS_URL"];
  if (!url || url.trim() === "") {
    redisClient = null;
    return null;
  }

  redisClient = new (Redis as any)(url, { maxRetriesPerRequest: 1 });
  redisClient.on("error", (err: unknown) => {
    logger.warn({ err }, "Rate limit Redis client error");
  });
  return redisClient;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, name } = options;
  const message = options.message ?? "Too many requests";
  const keyFn = options.key ?? ((req: Request) => req.ip);

  // In-memory fallback, used when Redis isn't configured or is unreachable.
  const buckets = new Map<string, Bucket>();

  const checkInMemory = (
    key: string,
    res: Response,
    next: NextFunction,
  ): void => {
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;

    if (existing.count > max) {
      res.status(429).json({ error: message });
      return;
    }

    next();
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = keyFn(req) || "unknown";
    const redis = getRateLimitRedis();

    if (redis) {
      try {
        const redisKey = `ratelimit:${name}:${key}`;
        const count = await redis.incr(redisKey);
        if (count === 1) {
          await redis.pexpire(redisKey, windowMs);
        }
        if (count > max) {
          res.status(429).json({ error: message });
          return;
        }
        next();
        return;
      } catch (err) {
        logger.warn(
          { err },
          "Rate limit Redis error, falling back to in-memory for this request",
        );
      }
    }

    checkInMemory(key, res, next);
  };
}
