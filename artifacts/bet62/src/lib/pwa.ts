const UPDATE_KEY = "bet62_sw_reloading";
const HARD_RESET_KEY = "bet62_pwa_hard_reset";

// Shared with App.tsx (which uses it to skip the splash screen on admin) so
// both places agree on what counts as the admin route.
export function isAdminPath(pathname: string): boolean {
  return pathname.replace(/\/$/, "").endsWith("/admin");
}

// There's one index.html for the whole SPA, so it can only declare one
// static <link rel="manifest">. Installing "as a PWA" from /admin used that
// single manifest.json (start_url "/", scope "/") — the installed app's
// icon opened the main site instead of the admin panel. Swapping the
// link's href to a separate admin-scoped manifest, as early as possible
// (synchronously in main.tsx, before React even mounts — same reasoning as
// captureAffiliateReferral there), makes Chrome/Edge pick up
// manifest-admin.json's own start_url "/admin" + scope "/admin" instead.
export function applyAdminManifestIfNeeded(): void {
  if (!isAdminPath(window.location.pathname)) return;
  try {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = `${import.meta.env.BASE_URL}manifest-admin.json`;
    document.title = "Bet62 Admin";
  } catch {}
}

function clearReloadSearchParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_reload")) {
      return;
    }
    url.searchParams.delete("_reload");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  } catch {}
}

function safeReloadOnce() {
  try {
    if (sessionStorage.getItem(UPDATE_KEY) === "1") {
      return;
    }
    sessionStorage.setItem(UPDATE_KEY, "1");
  } catch {}
  window.location.reload();
}

export async function hardResetPwaAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
    }
  } catch {}

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {}

  try {
    sessionStorage.setItem(HARD_RESET_KEY, "1");
    sessionStorage.removeItem(UPDATE_KEY);
  } catch {}

  const url = new URL(window.location.href);
  url.searchParams.set("_reload", String(Date.now()));
  window.location.replace(url.toString());
}

export function registerAppServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  clearReloadSearchParam();

  const baseUrl = import.meta.env.BASE_URL;
  const swUrl = `${baseUrl}sw.js`;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(swUrl, { scope: baseUrl })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) {
            return;
          }

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        setInterval(() => {
          registration.update().catch(() => {});
        }, 21_600_000);
      })
      .catch(() => {});
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    safeReloadOnce();
  });
}
