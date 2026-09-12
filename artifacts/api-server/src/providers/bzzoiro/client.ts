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
