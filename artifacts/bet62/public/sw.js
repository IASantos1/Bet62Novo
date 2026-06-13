const VERSION = "v2026-06-13-2";
const SHELL_CACHE = `bet62-shell-${VERSION}`;
const ASSET_CACHE = `bet62-assets-${VERSION}`;
const DATA_CACHE = `bet62-data-${VERSION}`;

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
  return (
    url.pathname.startsWith(`${scopePath}api/matches/live`) ||
    url.pathname.startsWith(`${scopePath}api/matches/live-stream`) ||
    url.pathname.startsWith(`${scopePath}api/matches/ws`)
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
      cache.put(request, response.clone());
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
        cache.put(request, response.clone());
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
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "./index.html"));
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

  if (["font", "image"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});
