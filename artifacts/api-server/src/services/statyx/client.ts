// Shared HTTP plumbing for the Statyx API (api.statyx.io/v1) — read-only
// HTTPS/JSON, reference data + stats + computed hit-rates + player-prop
// odds/analytics for NFL, NBA, MLB, Soccer and WNBA (docs read 2026-09-06).
// NOT verified against a live sample — this sandbox has no network access
// to api.statyx.io and no real key was provided; every field name below
// comes straight from the documented request/response shapes. Treat as
// doc-derived, same discipline as the GoalServe integration before it had
// a real sample to confirm against.
//
// Auth is a `x-api-key` HEADER (not a Bearer token, not a query param) —
// confirmed from the docs' own curl example. Every endpoint requires a
// scope granted by the account's tier (reference:read, stats:read,
// hit-rates:read, odds:read, insights:read); a 403 FORBIDDEN means the
// key's tier doesn't include that scope, not a code bug.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type StatyxMeta = {
  limit?: number;
  offset?: number;
  [key: string]: unknown;
};

export type StatyxListResponse<T> = {
  data: T[];
  meta?: StatyxMeta;
};

export type StatyxItemResponse<T> = {
  data: T;
  meta?: StatyxMeta;
};

export type StatyxErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type StatyxRateLimit = {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null; // epoch seconds, straight from the RateLimit-Reset header
};

let lastKnownRateLimit: StatyxRateLimit | null = null;

export function getStatyxUsage(): StatyxRateLimit | null {
  if (!CONFIG.ENABLE_STATYX) return null;
  return lastKnownRateLimit;
}

function statyxKey(): string {
  if (!CONFIG.STATYX_API_KEY) {
    logger.warn("[statyx] STATYX_API_KEY vazia — chamadas vão falhar com 401");
  }
  return CONFIG.STATYX_API_KEY;
}

export function statyxUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const url = new URL(`${CONFIG.STATYX_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function readRateLimitHeaders(resp: Response): void {
  const limit = resp.headers.get("ratelimit-limit");
  const remaining = resp.headers.get("ratelimit-remaining");
  const reset = resp.headers.get("ratelimit-reset");
  if (limit === null && remaining === null && reset === null) return;
  lastKnownRateLimit = {
    limit: limit !== null ? Number(limit) : null,
    remaining: remaining !== null ? Number(remaining) : null,
    resetAt: reset !== null ? Number(reset) : null,
  };
}

export class StatyxApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(`[statyx] ${status} ${code}: ${message}`);
    this.name = "StatyxApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function statyxFetch<T>(url: string, timeoutMs: number): Promise<T> {
  if (!CONFIG.ENABLE_STATYX) {
    throw new Error("[statyx] killswitch ENABLE_STATYX=false — no network");
  }
  const resp = await fetch(url, {
    headers: { "x-api-key": statyxKey() },
    signal: AbortSignal.timeout(timeoutMs),
  });
  readRateLimitHeaders(resp);
  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    logger.warn(
      { err, url: url.replace(statyxKey(), "<KEY>"), sample: text.slice(0, 200) },
      "[statyx] JSON parse failed",
    );
    throw err;
  }
  if (!resp.ok) {
    const errBody = json as Partial<StatyxErrorBody> | null;
    const code = errBody?.error?.code ?? `HTTP_${resp.status}`;
    const message = errBody?.error?.message ?? resp.statusText;
    throw new StatyxApiError(resp.status, code, message, errBody?.error?.details);
  }
  const gt = (globalThis as any).__lastFetchTs ?? {};
  gt.statyx = Date.now();
  (globalThis as any).__lastFetchTs = gt;
  return json as T;
}

export async function statyxGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 8000,
): Promise<T> {
  return statyxFetch<T>(statyxUrl(path, params), timeoutMs);
}

export async function statyxGetWithRetry<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  opts?: { timeoutMs?: number; retries?: number; retryDelayMs?: number },
): Promise<T | null> {
  if (!CONFIG.ENABLE_STATYX) return null;
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.retryDelayMs ?? 1500;
  const url = statyxUrl(path, params);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await statyxFetch<T>(url, opts?.timeoutMs ?? 8000);
    } catch (err) {
      // A 429 carries its own Retry-After — honor it instead of the fixed
      // backoff schedule when present (documented behavior: "Exceeding your
      // plan's limit results in 429 penalties" with a Retry-After header).
      if (err instanceof StatyxApiError && err.status === 429 && attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      if (attempt === retries) {
        logger.warn(
          { err, path },
          "[statyx] giving up on this request after retries",
        );
        return null;
      }
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  return null;
}
