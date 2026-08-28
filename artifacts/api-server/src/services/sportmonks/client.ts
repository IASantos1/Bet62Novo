// Shared HTTP plumbing for SportMonks Football API v3 (api.sportmonks.com).
// Auth is a `api_token` query param (not a header — unlike PulseScore's
// X-Secret), confirmed against real GET /v3/football/rounds/{id} and
// /v3/football/livescores/inplay samples, 2026-08-28. Every response also
// carries a `rate_limit: { resets_in_seconds, remaining, requested_entity }`
// object — used here directly instead of self-counting requests the way
// pulsescore/football.ts's getPulseScoreFootballUsage does, since SportMonks
// already tells us the real remaining budget.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type SportMonksRateLimit = {
  resets_in_seconds: number;
  remaining: number;
  requested_entity: string;
};

let lastKnownRateLimit: SportMonksRateLimit | null = null;

export function getSportMonksUsage(): SportMonksRateLimit | null {
  return lastKnownRateLimit;
}

export function sportMonksUrl(
  path: string,
  params?: Record<string, string | undefined>,
): string {
  const url = new URL(`${CONFIG.SPORTMONKS_BASE_URL}${path}`);
  url.searchParams.set("api_token", CONFIG.SPORTMONKS_API_KEY);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function sportMonksGet<T>(
  path: string,
  params?: Record<string, string | undefined>,
  timeoutMs = 8000,
): Promise<T> {
  const resp = await fetch(sportMonksUrl(path, params), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new Error(`[sportmonks] ${resp.status} on ${path}`);
  }
  const json = (await resp.json()) as T & { rate_limit?: SportMonksRateLimit };
  if (json && typeof json === "object" && json.rate_limit) {
    lastKnownRateLimit = json.rate_limit;
  }
  return json;
}

export async function sportMonksGetWithRetry<T>(
  path: string,
  params?: Record<string, string | undefined>,
  opts?: { timeoutMs?: number; retries?: number; retryDelayMs?: number },
): Promise<T | null> {
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.retryDelayMs ?? 1500;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await sportMonksGet<T>(path, params, opts?.timeoutMs);
    } catch (err) {
      if (attempt === retries) {
        logger.warn({ err, path }, "[sportmonks] giving up on this request after retries");
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  return null;
}
