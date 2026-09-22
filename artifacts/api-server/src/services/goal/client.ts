import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type JsonRecord = Record<string, unknown>;

const cache = new Map<string, { expiresAt: number; value: unknown }>();
let missingKeyLogged = false;
let rateLimitedUntil = 0;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function joinUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.replace(/^\/+/, ""), `${CONFIG.GOAL_API_BASE_URL.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestGoal(path: string, query?: Record<string, string | number | boolean | undefined>, ttlMs = 0): Promise<unknown> {
  if (!CONFIG.GOAL_API_KEY) {
    if (!missingKeyLogged) {
      logger.warn("[goal-api] GOAL_API_KEY not set — football integration is disabled");
      missingKeyLogged = true;
    }
    return null;
  }
  if (Date.now() < rateLimitedUntil) return null;
  const url = joinUrl(path, query);
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.SPORTS_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CONFIG.GOAL_API_KEY}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("retry-after") ?? 30);
        rateLimitedUntil = Date.now() +
          (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 30_000);
      }
      if (response.status !== 404) logger.warn({ status: response.status, path }, "[goal-api] request failed");
      return null;
    }
    const value = await response.json();
    if (ttlMs > 0) cache.set(url, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (err) {
    logger.warn({ err, path }, "[goal-api] request error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function firstSuccessful(paths: Array<{ path: string; query?: Record<string, string | number | boolean | undefined> }>, ttlMs: number): Promise<unknown> {
  for (const candidate of paths) {
    const value = await requestGoal(candidate.path, candidate.query, ttlMs);
    if (value !== null) return value;
  }
  return null;
}

export function goalApiEnabled(): boolean {
  return Boolean(CONFIG.GOAL_API_KEY);
}

export async function getGoalFixtures(options: {
  live?: boolean;
  from?: string;
  to?: string;
} = {}): Promise<unknown> {
  if (options.live) {
    return firstSuccessful(
      [
        { path: "/fixtures/live" },
        { path: "/fixtures", query: { status: "live" } },
        { path: "/matches/live" },
      ],
      CONFIG.SPORTS_API_LIVE_CACHE_MS,
    );
  }
  const query = { from: options.from, to: options.to };
  const first = await requestGoal("/fixtures", { ...query, limit: 100, offset: 0 }, 5 * 60_000);
  const firstRoot = asRecord(first);
  const firstItems = unwrapGoalCollection(first);
  const pagination = asRecord(firstRoot["pagination"]);
  const total = Number(pagination["total"] ?? firstItems.length);
  if (!Number.isFinite(total) || total <= firstItems.length) return firstItems;

  const cappedTotal = Math.min(total, 3_000);
  const offsets: number[] = [];
  for (let offset = 100; offset < cappedTotal; offset += 100) offsets.push(offset);
  const pages: JsonRecord[][] = [];
  for (let i = 0; i < offsets.length; i += 5) {
    const batch = offsets.slice(i, i + 5);
    const values = await Promise.all(
      batch.map((offset) =>
        requestGoal("/fixtures", { ...query, limit: 100, offset }, 5 * 60_000),
      ),
    );
    pages.push(...values.map(unwrapGoalCollection));
  }
  return [...firstItems, ...pages.flat()];
}

export async function getGoalFixtureDetail(id: string): Promise<unknown> {
  return firstSuccessful(
    [
      { path: `/fixtures/${encodeURIComponent(id)}` },
      { path: `/matches/${encodeURIComponent(id)}` },
    ],
    CONFIG.SPORTS_API_LIVE_CACHE_MS,
  );
}

export async function getGoalFixtureResource(
  id: string,
  resource: "events" | "statistics" | "lineups" | "commentary" | "odds",
): Promise<unknown> {
  const encoded = encodeURIComponent(id);
  return firstSuccessful(
    [
      { path: `/fixtures/${encoded}/${resource}` },
      { path: `/matches/${encoded}/${resource}` },
    ],
    resource === "statistics" || resource === "lineups" ? 30_000 : 15_000,
  );
}

export function unwrapGoalCollection(value: unknown): JsonRecord[] {
  const root = asRecord(value);
  const preferred = ["fixtures", "matches", "data", "results", "items", "events", "statistics", "lineups", "commentary"];
  for (const key of preferred) {
    const candidate = root[key];
    if (Array.isArray(candidate)) return candidate.map(asRecord).filter((item) => Object.keys(item).length > 0);
    if (candidate && typeof candidate === "object") {
      const nested = unwrapGoalCollection(candidate);
      if (nested.length > 0) return nested;
    }
  }
  if (Array.isArray(value)) return value.map(asRecord).filter((item) => Object.keys(item).length > 0);
  return Object.keys(root).length > 0 ? [root] : [];
}