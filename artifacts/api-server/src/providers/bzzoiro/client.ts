// sports.bzzoiro.com REST client — confirmed real 2026-09-11 via the
// user's own captured responses (GET /coverage/, GET /events/,
// GET /events/:id/stats/), all using `Authorization: Token <key>`.
// Only the one endpoint this integration actually needs (live events, for
// matching against GOAL API fixtures) is wrapped here — no /stats/,
// /odds/, /h2h/ etc. wrappers, since this provider's sole job is real
// ball position via the WebSocket (see websocketClient.ts), not REST.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { BzzoiroEventsListResponse, BzzoiroEvent } from "./types.js";

// Two more real, captured-but-never-wrapped endpoints (see this file's own
// header) — exposed now (2026-09-13) purely for the capabilities probe the
// user requested: before pausing GOAL API/PulseScore in favor of bzzoiro
// alone (odds + stats + xG + ball position, now that a paid plan is in
// hand), we need to see real /coverage/ and /events/:id/stats/ payloads to
// know bzzoiro's actual league breadth and whether xG/possession/shots are
// really in there — not guessed from the docs. Returns the raw JSON
// untyped on purpose: this is a one-off investigation, not a shape BET62
// commits to reading yet.

async function rawGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${CONFIG.BZZOIRO_BASE_URL.replace(/\/+$/, "")}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Token ${CONFIG.BZZOIRO_API_KEY}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`[bzzoiro] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return (await resp.json()) as T;
}

/** GET /events/live/ — the real dedicated live-events endpoint (confirmed
 * real 2026-09-11 via the user's own live requests). NOT /events/?status=
 * live: that generic list silently ignores the status query param
 * server-side and always returns the same fixed dump of unrelated
 * "notstarted" fixtures (confirmed by the user getting an identical
 * count/status distribution with and without the param) — this dedicated
 * path is the one that actually returns only currently-relevant matches.
 * Used only to find a live football fixture's event id to match against a
 * live GOAL API fixture — see matchSync.ts, which still filters on
 * `status === "inprogress"` itself since this endpoint can also list a
 * just-finished match. */
export async function getBzzoiroLiveEvents(): Promise<BzzoiroEvent[]> {
  if (!CONFIG.BZZOIRO_API_KEY) return [];
  try {
    const resp = await rawGet<BzzoiroEventsListResponse>("/events/live/");
    return resp.events ?? [];
  } catch (err) {
    logger.error({ err }, "[bzzoiro] getBzzoiroLiveEvents failed");
    return [];
  }
}

/** GET /coverage/ raw — real endpoint, never wrapped before (see header).
 * Investigation-only: tells us which leagues/competitions bzzoiro actually
 * covers, to compare against GOAL API + PulseScore's combined breadth
 * before considering either replaceable. */
export async function getBzzoiroCoverageRaw(): Promise<unknown> {
  return rawGet<unknown>("/coverage/");
}

/** GET /events/:id/stats/ raw — real endpoint, never wrapped before (see
 * header). Investigation-only: tells us whether xG/possession/shots/
 * corners/cards are actually present and in what shape, before wiring
 * anything to read them for real. */
export async function getBzzoiroEventStatsRaw(eventId: number | string): Promise<unknown> {
  return rawGet<unknown>(`/events/${encodeURIComponent(String(eventId))}/stats/`);
}
