const UPDATE_KEY = "bet62_sw_reloading";

function safeReloadOnce() {
  try {
    if (sessionStorage.getItem(UPDATE_KEY) === "1") {
      return;
    }
    sessionStorage.setItem(UPDATE_KEY, "1");
  } catch {}
  window.location.reload();
}

export function registerAppServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

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
        }, 60_000);
      })
      .catch(() => {});
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    safeReloadOnce();
  });
}
