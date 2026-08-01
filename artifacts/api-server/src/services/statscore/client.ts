import { CONFIG } from "../../lib/config.js";

// GET {base}/get_pushes/{eventId}?timestamp={ts}&auth={auth} — confirmed
// real, working request/response (the user supplied a live example URL with
// a real auth value: events-d.pc.statscore.com/get_pushes/6309926?
// timestamp=...&auth=0ed7b262 — the same auth also works against
// standings.pc.statscore.com/get_standings/{id}, so it's a static partner
// token, not a per-request signature). Response shape beyond the fields
// tracker.ts reads isn't fully documented, so getPushes() returns the raw
// JSON untyped and tracker.ts normalizes defensively.
export async function getPushes(eventId: number): Promise<unknown> {
  if (!CONFIG.STATSCORE_AUTH) {
    throw new Error("STATSCORE_AUTH not configured");
  }
  const ts = Math.floor(Date.now() / 1000);
  const url =
    `${CONFIG.STATSCORE_TRACKER_BASE_URL}/get_pushes/${eventId}` +
    `?timestamp=${ts}&auth=${encodeURIComponent(CONFIG.STATSCORE_AUTH)}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) {
    throw new Error(`[statscore] get_pushes failed: HTTP ${resp.status}`);
  }
  return resp.json();
}
