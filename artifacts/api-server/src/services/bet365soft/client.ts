// Shared HTTP plumbing for the Bet365Soft sportsbook API (host w7api.com) —
// a candidate to replace Statyx/TheRundown as the real odds+settlement
// provider (2026-09-06, user-pasted docs). Nothing here is confirmed
// against a real response yet — only the documented endpoint list and
// request/error shapes. Treat every field name as doc-derived until a real
// sample confirms it, same discipline used for every other provider in
// this codebase before it had one.
//
// Auth is an `apikey` QUERY PARAM (not a header, not Bearer — different
// from every other provider integrated so far). Three directories share
// the same host + key:
//   sportsbook: {BASE}/api/v2/{endpoint}      e.g. /api/v2/sports
//   history:    {BASE}/history/v2/{endpoint}  e.g. /history/v2/summary
//   settlement: {BASE}/settle/{endpoint}      e.g. /settle/result (POST)
//
// v2 over v1: same endpoints/params/auth on both (their own migration guide
// calls v2 "backward compatible" with v1 — only the /v1/ → /v2/ path
// segment changes), v2 just adds pagination, player stats in event
// payloads, structured error detail, and a smaller/faster response. No
// reason to touch v1 for a new integration — using v2 throughout.
//
// The docs' own sample response for /sports is WRONG — confirmed real
// (GET /api/v2/sports, 2026-09-06): it does NOT return the documented
// { success, data: [{id,name,icon}] } envelope at all. The real shape is a
// flat { "<SportName>": <id> } map, e.g.:
//   {"Football":1,"Ice Hockey":2,"Basketball":3,"Tennis":4,"Baseball":5,
//    "Volleyball":6,"Rugby League":7,"Handball":8,"Boxing":9,
//    "Table Tennis":10,"American Footbal":13,"Badminton":16,"Snooker":30,
//    "Cricket":66}
// (sic: "American Footbal" — one "l", straight from the API). Football's
// sport id is confirmed 1. Treat EVERY other documented shape in this file
// as unverified until checked the same way — this API's docs cannot be
// trusted at face value.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type Bet365SoftErrorBody = {
  success: false;
  error: string;
};

export class Bet365SoftApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(`[bet365soft] ${status}: ${message}`);
    this.name = "Bet365SoftApiError";
    this.status = status;
    this.body = body;
  }
}

function bet365SoftKey(): string {
  if (!CONFIG.BET365SOFT_API_KEY) {
    logger.warn("[bet365soft] BET365SOFT_API_KEY vazia — chamadas vão falhar");
  }
  return CONFIG.BET365SOFT_API_KEY;
}

export function bet365SoftUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const url = new URL(`${CONFIG.BET365SOFT_BASE_URL}${path}`);
  url.searchParams.set("apikey", bet365SoftKey());
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function redactKeyUrl(url: string): string {
  return url.replace(bet365SoftKey(), "<KEY>");
}

async function bet365SoftFetch<T>(
  url: string,
  timeoutMs: number,
  opts?: { skipKillswitch?: boolean; method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  if (!CONFIG.ENABLE_BET365SOFT && !opts?.skipKillswitch) {
    throw new Error("[bet365soft] killswitch ENABLE_BET365SOFT=false — no network");
  }
  const resp = await fetch(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    logger.warn(
      { err, url: redactKeyUrl(url), sample: text.slice(0, 200) },
      "[bet365soft] JSON parse failed",
    );
    throw err;
  }
  if (!resp.ok) {
    const errBody = json as Partial<Bet365SoftErrorBody> | null;
    throw new Bet365SoftApiError(resp.status, errBody?.error ?? resp.statusText, json);
  }
  // Docs show a {success:false, error:"..."} shape for logical errors even
  // on a 200 status — check it explicitly rather than trusting resp.ok alone.
  const asResult = json as { success?: boolean; error?: string } | null;
  if (asResult && asResult.success === false) {
    throw new Bet365SoftApiError(200, asResult.error ?? "unknown error", json);
  }
  const gt = (globalThis as any).__lastFetchTs ?? {};
  gt.bet365soft = Date.now();
  (globalThis as any).__lastFetchTs = gt;
  return json as T;
}

export async function bet365SoftGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 8000,
): Promise<T> {
  return bet365SoftFetch<T>(bet365SoftUrl(path, params), timeoutMs);
}

// Bypasses the ENABLE_BET365SOFT killswitch — used ONLY by the manual
// /api/debug-bet365soft route (routes/health.ts) so the integration can be
// explored/verified against real responses while the feature itself is
// still off in production. Still requires BET365SOFT_API_KEY to be set;
// never wired into any live matches.ts code path. `path` must include the
// directory prefix, e.g. "/api/v2/sports", "/history/v2/summary" or
// "/settle/result".
export async function bet365SoftGetDebug<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 8000,
): Promise<T> {
  return bet365SoftFetch<T>(bet365SoftUrl(path, params), timeoutMs, { skipKillswitch: true });
}
