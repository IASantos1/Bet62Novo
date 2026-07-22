/**
 * StatpalCache — Redis-backed cache with in-memory fallback.
 *
 * Uses the REDIS_URL env var (same connection as settlement queue).
 * Falls back to an in-process Map when Redis is unavailable so the
 * server still works without Redis configured.
 *
 *   import { statpalCache } from "./cache.js";
 *   const data = await statpalCache.get("key");
 *   await statpalCache.set("key", data, 60);   // TTL in seconds
 */

import Redis from "ioredis";

function getRedisUrl(): string | null {
  const url = process.env["REDIS_URL"];
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

// ── In-memory fallback ───────────────────────────────────────────────────────

type MemEntry = { value: string; expiresAt: number };
const memStore = new Map<string, MemEntry>();

function memGet(key: string): string | null {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── Redis client (lazy) ──────────────────────────────────────────────────────

let _redis: any | null = null;
let _redisAvailable = true;   // flips to false on first connection error

function getRedis(): any | null {
  if (!_redisAvailable) return null;
  if (_redis) return _redis;
  const url = getRedisUrl();
  if (!url) return null;
  try {
    _redis = new (Redis as any)(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
    });
    _redis.on("error", () => {
      _redisAvailable = false;
      _redis = null;
    });
    return _redis;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export const statpalCache = {
  async get(key: string): Promise<string | null> {
    const redis = getRedis();
    if (redis) {
      try {
        return await redis.get(key);
      } catch {
        // Redis error — fall through to memory
      }
    }
    return memGet(key);
  },

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.set(key, value, "EX", ttlSeconds);
        return;
      } catch {
        // Redis error — fall through to memory
      }
    }
    memSet(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    memStore.delete(key);
    const redis = getRedis();
    if (redis) {
      try { await redis.del(key); } catch { /* ignore */ }
    }
  },
};

// ── TTL presets (seconds) ────────────────────────────────────────────────────
// Used by StatpalClient.cachedGet() to pick the right TTL per endpoint type.

export const STATPAL_TTL = {
  /** Live scores / live odds — real-time, poll frequently */
  LIVE:         15,
  /** In-match events (goals, cards, lineups once set) */
  EVENTS:       20,
  /** Match lineups — set at kickoff, then stable */
  LINEUPS:      60,
  /** Daily fixtures / schedule */
  FIXTURES:    120,
  /** Team & player stats — changes only after matches */
  TEAM_STATS:  300,
  PLAYER_STATS:300,
  /** League standings */
  STANDINGS:   300,
  /** Head-to-head history — fully historical, very static */
  H2H:        3600,
  /** Predictions / weather — pre-match context */
  PREMATCH:    300,
} as const;
