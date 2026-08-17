// Real BetBY architecture, reverse-engineered 2026-08-16 by inspecting
// demo.betby.com's own network traffic (mobile browser devtools, a real
// live match — SC Corinthians SP vs Cruzeiro EC MG):
//
//   Playwright captures JWT from demo.betby.com
//     -> GET https://{apiHost}/api/v4/live/brand/{brandId}/{lang}/0   (live events list)
//     -> GET https://{apiHost}/api/v3/descriptions/brand/{brandId}/event/{eventId}/{lang}  (teams, competition, state, markets)
//     -> wss://{apiHost}/api/v1/ws_new?brand_id={brandId}&lang={lang}  (real-time updates)
//
// Two things this corrects about every previous version of this
// integration: (1) the real API host is NOT demoapi.betby.com (what every
// endpoint in proxy.ts/pulseBridge.ts assumed) — it's a separate,
// dynamically-fronted host (confirmed real example:
// api-h-c7818b61-608.sptpub.com) that the web app's own JS discovers at
// runtime, not a fixed documented value; (2) that host requires
// authentication — a JWT the web app obtains as part of loading
// demo.betby.com normally, not a plain unauthenticated GET. Both of those
// are exactly why every previous attempt at auto-discovery here failed
// closed 100% of the time regardless of team-name-matching logic quality:
// it was calling the wrong host with no auth at all.
//
// Rather than reimplement BetBY's auth handshake (undocumented, and
// reverse-engineering it further risks being subtly wrong in a way that's
// invisible until it silently breaks), this launches a real (headless)
// browser against the actual site and sniffs the real host + auth headers
// off the first live-events request the page itself makes — the exact
// same request a real user's browser sends, so whatever auth mechanism
// BetBY actually uses is satisfied automatically, unconditionally. Those
// captured headers are then replayed on subsequent plain server-side
// fetch() calls, which is far cheaper than launching a browser per lookup.
//
// Not independently verified against real production traffic beyond what
// a single manual capture confirmed (no outbound network access to
// demo.betby.com or sptpub.com from any environment this was written or
// reviewed in — see this repo's other PulseScore/BetBY integration files
// for the same recurring constraint). If the real auth mechanism turns out
// to need more than header replay (e.g. a short-lived nonce tied to the
// exact request, or IP-binding), captureBetbySession's health check below
// will catch that (a 401/403 forces a fresh capture rather than silently
// reusing broken headers) and this degrades to "no session available",
// which every caller already treats as "no automatic match" — never a
// crash.
import { chromium } from "playwright";
import { logger } from "../../lib/logger.js";

export type BetbySession = {
  apiHost: string;
  headers: Record<string, string>;
  capturedAt: number;
};

const SESSION_TTL_MS = 20 * 60_000;
const CAPTURE_TIMEOUT_MS = 20_000;
const LIVE_EVENTS_PATH_PATTERN = /\/api\/v4\/live\/brand\//;

// Headers that describe THIS specific HTTP/2 request/connection rather
// than being real application headers — replaying these on a fresh
// server-side fetch() would be meaningless or actively wrong.
const NON_REPLAYABLE_HEADER_PREFIXES = [":", "content-length", "content-encoding"];

function isReplayableHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return !NON_REPLAYABLE_HEADER_PREFIXES.some((p) => lower.startsWith(p));
}

let cached: BetbySession | null = null;
let inFlight: Promise<BetbySession | null> | null = null;
// Deliberately separate from `cached`: a FAILED capture leaves `cached`
// null forever, and gating the "block on first call" behavior on
// `!cached` would then re-block every single subsequent call for up to
// CAPTURE_TIMEOUT_MS, indefinitely, any time capture keeps failing (e.g.
// real network trouble, or BetBY changing something this depends on) — a
// production incident (every live-tracker request hanging ~20s) rather
// than the intended "degrade to no automatic match" behavior every other
// failure path in this integration already has.
let everAttempted = false;

async function captureBetbySession(): Promise<BetbySession | null> {
  // Sandbox/dev escape hatch only — the pre-installed Chromium build in
  // some sandboxed dev environments doesn't match the exact revision this
  // playwright version expects, and `playwright install` isn't available
  // there. Production deploys never set this; a plain pnpm install
  // downloads the matching browser automatically and chromium.launch()
  // finds it with no override needed.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      executablePath,
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    });
    const page = await context.newPage();

    const captured = await new Promise<BetbySession | null>((resolve) => {
      let settled = false;
      const finish = (v: BetbySession | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      page.on("request", (req) => {
        if (settled) return;
        const url = req.url();
        if (!LIVE_EVENTS_PATH_PATTERN.test(url)) return;
        try {
          const parsed = new URL(url);
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers())) {
            if (isReplayableHeader(k)) headers[k] = v;
          }
          finish({ apiHost: parsed.host, headers, capturedAt: Date.now() });
        } catch {
          finish(null);
        }
      });
      setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);
      // The live-events request this listens for is fired by demo.betby.com's
      // own app shell on load (a "what's live right now" sidebar/nav call,
      // per the manually-observed real traffic this module is built from) —
      // navigating to the bare origin should be enough to trigger it without
      // needing to know an exact lobby route. `waitUntil: "load"` is NOT
      // awaited here on purpose: the goal is only to have started navigation
      // so the request listener above gets a chance to fire; a slow/never-
      // finishing full page load must never block capture past
      // CAPTURE_TIMEOUT_MS, which the listener's own setTimeout already
      // enforces regardless of what this promise does.
      page.goto("https://demo.betby.com/", { waitUntil: "load", timeout: CAPTURE_TIMEOUT_MS }).catch(() => {
        finish(null);
      });
    });

    if (!captured) {
      logger.warn("[betbySession] no live-events request observed while loading demo.betby.com — capture timed out");
      return null;
    }

    // Cookies set during the page load (session/auth cookies BetBY's own
    // JS may rely on alongside or instead of a request header) — merged
    // into the captured header set so a plain server-side fetch() carries
    // the same session state a real browser tab would.
    try {
      const cookies = await context.cookies();
      if (cookies.length > 0) {
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        captured.headers["cookie"] = captured.headers["cookie"]
          ? `${captured.headers["cookie"]}; ${cookieHeader}`
          : cookieHeader;
      }
    } catch {
      /* cookies are a best-effort addition, not required */
    }

    logger.info({ apiHost: captured.apiHost }, "[betbySession] captured a fresh BetBY session via Playwright");
    return captured;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[betbySession] Playwright capture failed",
    );
    return null;
  } finally {
    try {
      await browser?.close();
    } catch {
      /* already closing/closed */
    }
  }
}

/** Returns a cached session if still fresh, refreshing (stale-while-
 * revalidate) otherwise. Only the very first capture attempt EVER (success
 * or failure) blocks the caller (bounded by CAPTURE_TIMEOUT_MS), since
 * there's nothing to serve yet; every call after that returns immediately
 * — a background refresh replaces the cache once it lands, so a real
 * request is never held up waiting on a browser launch cycle, even when
 * captures keep failing. `forceRefresh` blocks on a fresh capture
 * unconditionally (used after a request comes back 401/403, signalling
 * the cached headers stopped working) — that one case is expected to be
 * rare enough not to matter for request latency. */
export async function getBetbySession(forceRefresh = false): Promise<BetbySession | null> {
  const now = Date.now();
  if (!forceRefresh && cached && now - cached.capturedAt < SESSION_TTL_MS) return cached;

  const shouldBlock = (!everAttempted && !cached) || forceRefresh;
  if (!inFlight) {
    everAttempted = true;
    inFlight = captureBetbySession()
      .then((s) => {
        if (s) cached = s;
        return s;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  if (shouldBlock) return inFlight;
  // Stale cache (or no cache at all, if every attempt so far has failed)
  // beats waiting on a fresh capture for any request that doesn't strictly
  // need to force a refresh — a background refresh is already in flight
  // and will replace `cached` once it lands.
  return cached;
}
