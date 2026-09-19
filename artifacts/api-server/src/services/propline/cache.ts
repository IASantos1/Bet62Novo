import Redis from "ioredis";

function getRedisUrl(): string | null {
  const url = process.env["REDIS_URL"];
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

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

let _redis: any | null = null;
let _redisAvailable = true;

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

export const proplineCache = {
  async get(key: string): Promise<string | null> {
    const redis = getRedis();
    if (redis) {
      try {
        return await redis.get(key);
      } catch {
        /* fall through */
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
        /* fall through */
      }
    }
    memSet(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    memStore.delete(key);
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(key);
      } catch {
        /* ignore */
      }
    }
  },
};

export const PROPLINE_TTL = {
  // Was 15s — leftover from when the only caller was a 15s periodic timer.
  // User-reported real-world lag (2026-09-19): tennis point score/football/
  // basketball/hockey/baseball live odds "arriving ~30s late," must be
  // ≤1-2s, "no polling, pure websocket." The tri-fallback live builder
  // (buildLivePayload, routes/matches.ts) already reruns every ~750-900ms
  // regardless of this value, and PropLine's real WebSocket already wakes
  // the sport-specific sync on every real change — but both were still
  // serving this exact 15s-stale cache underneath, so neither the fast
  // rebuild loop nor the WS wake-up ever actually saw fresher data more
  // than 4x/min. 2s keeps real cache value (collapses the ~750ms tri-
  // fallback loop's repeat calls within any 2s window into one upstream
  // request) while meeting the ≤1-2s freshness ceiling.
  LIVE: 2,
  EVENTS: 20,
  LINEUPS: 60,
  FIXTURES: 120,
  TEAM_STATS: 300,
  PLAYER_STATS: 300,
  STANDINGS: 300,
  H2H: 3600,
  PREMATCH: 300,
  HISTORY: 3600,
  CLOSING: 3600,
  EV: 15,
  BEST_LINE: 15,
  RESULTS: 600,
  FRESHNESS: 60,
  PLAYER_TRENDS: 300,
  HIT_RATES: 300,
} as const;
