const VERSION = "v2026-08-12-1";
const SHELL_CACHE = `bet62-shell-${VERSION}`;
const ASSET_CACHE = `bet62-assets-${VERSION}`;
const DATA_CACHE = `bet62-data-${VERSION}`;

// PWA crash-loop report (2026-08-12, "problema ocorreu repetidamente" on
// /ao-vivo): DATA_CACHE/ASSET_CACHE had no eviction policy at all — every
// distinct request URL ever cached (staleWhileRevalidate/networkFirst below)
// stayed in Cache Storage forever within one SW version, only cleared on a
// deploy bumping VERSION. /api/matches/* alone covers a dozen+ per-match
// endpoints (v2-statistics, v2-incidents, v2-standings, v2-match-odds,
// v2-lineups, stats, storylines, confrontos, ...), each keyed by matchId —
// a long live-betting session tapping through many different matches over
// hours/days without an app update could accumulate an unbounded number of
// cache entries with nothing ever pruning old ones, real memory/storage
// pressure on a mobile PWA (iOS Safari enforces tighter storage/memory
// ceilings for installed PWAs than a regular browser tab). Capped both
// caches to MAX_CACHE_ENTRIES, evicting the oldest entry (Cache API
// preserves insertion order) whenever a put would exceed it.
const MAX_CACHE_ENTRIES = 120;

async function putWithEviction(cache, request, response) {
  await cache.put(request, response);
  const keys = await cache.keys();
  if (keys.length > MAX_CACHE_ENTRIES) {
    await Promise.all(
      keys.slice(0, keys.length - MAX_CACHE_ENTRIES).map((key) => cache.delete(key)),
    );
  }
}

function getScopePath() {
  const scopeUrl = new URL(self.registration.scope);
  return scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
}

function scopeUrl(path) {
  return new URL(path.replace(/^\//, ""), self.registration.scope).toString();
}

function isSameScope(url) {
  const scopePath = getScopePath();
  return url.origin === self.location.origin && url.pathname.startsWith(scopePath);
}

function isLiveApi(url) {
  const scopePath = getScopePath();
  // Widened 2026-08-12 from just the 3 live-stream paths to ALL of
  // /api/matches/ and /api/bets/ — every one of these is real-time sports/
  // betting data (odds, scores, lineups, standings, a user's own bet
  // status) that's actively WRONG once stale, not just slower: serving a
  // cached response here on a flaky connection means a bettor could see
  // out-of-date odds or a ticket status that's already changed, a real-
  // money correctness risk on top of the unbounded-cache-growth pressure
  // these per-matchId/per-bet endpoints put on Cache Storage (see
  // MAX_CACHE_ENTRIES above). Never worth caching either way — a network
  // failure here should surface as an error the page's own retry logic
  // handles, not a silently-stale answer.
  return (
    url.pathname.startsWith(`${scopePath}api/matches/`) ||
    url.pathname.startsWith(`${scopePath}api/bets/`)
  );
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll([
    scopeUrl("./"),
    scopeUrl("./index.html"),
    scopeUrl("./manifest.json"),
    scopeUrl("./favicon.svg"),
    scopeUrl("./icon-192.svg"),
    scopeUrl("./icon-512.svg"),
  ]);
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      putWithEviction(cache, request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await caches.match(scopeUrl(fallbackUrl));
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        putWithEviction(cache, request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const response = await networkPromise;
  if (response) {
    return response;
  }

  return Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const expected = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !expected.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameScope(url)) {
    return;
  }

  if (isLiveApi(url)) {
    // Never let the passthrough fetch reject straight into respondWith —
    // that's what produces the "FetchEvent resulted in a network error
    // response: the promise was rejected" + "Uncaught (in promise)" console
    // spam every time a live-stream connection drops (e.g. during a server
    // deploy restart). The page's own EventSource already auto-reconnects
    // on its own, so this only needs to resolve to a network-error Response
    // instead of leaving the promise rejected.
    event.respondWith(fetch(request).catch(() => Response.error()));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "./index.html"));
    return;
  }

  if (["font", "image"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  if (url.pathname.includes("/api/")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (["style", "script", "worker"].includes(request.destination)) {
    event.respondWith(networkFirst(request, ASSET_CACHE));
    return;
  }
});
