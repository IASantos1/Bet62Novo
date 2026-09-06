// Shared HTTP plumbing for TheRundown API (therundown.io/api/v2) — read-only
// HTTPS/JSON sports odds feed. Candidate to replace Statyx (2026-09-06),
// after Statyx turned out to have no game-level odds for soccer at all.
//
// Confirmed real (user-pasted docs, GET /v2/sports): auth is a `key`
// HEADER (not Bearer, not query param); this specific endpoint's envelope
// is `{ "sports": [...] }`, NOT the generic `{ data, meta }` shape used by
// some other providers in this codebase — do NOT assume every endpoint
// shares one envelope shape until each is checked. Nothing beyond /sports
// has been confirmed yet (no events/schedule/odds endpoint sample seen),
// so this client only provides a raw pass-through for exploration — mirror
// the statyx/client.ts pattern (already removed from this codebase) once
// real endpoint shapes are confirmed and dedicated typed fetchers are worth
// writing.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type RundownErrorBody = {
  error?: string;
  message?: string;
  [key: string]: unknown;
};

export class RundownApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(`[rundown] ${status}: ${message}`);
    this.name = "RundownApiError";
    this.status = status;
    this.body = body;
  }
}

function rundownKey(): string {
  if (!CONFIG.RUNDOWN_API_KEY) {
    logger.warn("[rundown] RUNDOWN_API_KEY vazia — chamadas vão falhar");
  }
  return CONFIG.RUNDOWN_API_KEY;
}

export function rundownUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const url = new URL(`${CONFIG.RUNDOWN_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function rundownFetch<T>(
  url: string,
  timeoutMs: number,
  opts?: { skipKillswitch?: boolean },
): Promise<T> {
  if (!CONFIG.ENABLE_RUNDOWN && !opts?.skipKillswitch) {
    throw new Error("[rundown] killswitch ENABLE_RUNDOWN=false — no network");
  }
  const resp = await fetch(url, {
    headers: { key: rundownKey() },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    logger.warn(
      { err, url: url.replace(rundownKey(), "<KEY>"), sample: text.slice(0, 200) },
      "[rundown] JSON parse failed",
    );
    throw err;
  }
  if (!resp.ok) {
    const errBody = json as RundownErrorBody | null;
    const message = errBody?.message ?? errBody?.error ?? resp.statusText;
    throw new RundownApiError(resp.status, message, json);
  }
  const gt = (globalThis as any).__lastFetchTs ?? {};
  gt.rundown = Date.now();
  (globalThis as any).__lastFetchTs = gt;
  return json as T;
}

export async function rundownGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 8000,
): Promise<T> {
  return rundownFetch<T>(rundownUrl(path, params), timeoutMs);
}

// Bypasses the ENABLE_RUNDOWN killswitch — used ONLY by the manual
// /api/debug-rundown route (routes/health.ts) so the integration can be
// explored/verified against real responses while the feature itself is
// still off in production. Still requires RUNDOWN_API_KEY to be set; never
// wired into any live matches.ts code path.
export async function rundownGetDebug<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 8000,
): Promise<T> {
  return rundownFetch<T>(rundownUrl(path, params), timeoutMs, { skipKillswitch: true });
}
