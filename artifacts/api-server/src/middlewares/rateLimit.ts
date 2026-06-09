import { type Request, type Response, type NextFunction } from "express";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  key?: (req: Request) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const message = options.message ?? "Too many requests";
  const keyFn = options.key ?? ((req: Request) => req.ip);

  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyFn(req) || "unknown";

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
}
