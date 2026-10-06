import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyAdminManifestIfNeeded, hardResetPwaAndReload, registerAppServiceWorker } from "@/lib/pwa";
import { captureAffiliateReferral } from "@/lib/affiliateReferral";

// Must run synchronously, before the router mounts — home.tsx's own
// activeTab→pathname sync effect rewrites "/" to "/sportsbook" (dropping
// the query string) on its very first effect pass, which races ahead of
// any capture attempted from inside App.tsx's own useEffect and silently
// loses ?ref=CODE before it's ever read (confirmed via Playwright,
// 2026-09-30: window.location.href was already "/sportsbook" with no
// query by the time a same-tick App-level effect got to run).
captureAffiliateReferral();

// Also synchronous, same reasoning: the manifest <link> needs to point at
// manifest-admin.json before the browser evaluates installability, not
// after React's first effect pass.
applyAdminManifestIfNeeded();

const shouldReloadForMessage = (msg: string): boolean => {
  const m = (msg ?? "").toLowerCase();
  if (!m) return false;
  if (m.includes("chunkloaderror")) return true;
  if (m.includes("loading chunk")) return true;
  if (m.includes("failed to fetch dynamically imported module")) return true;
  if (m.includes("importing a module script failed")) return true;
  return false;
};

const safeHardResetOnce = (): void => {
  try {
    const key = "bet62_hard_reset_once";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {}
  void hardResetPwaAndReload();
};

window.addEventListener("error", (e) => {
  const anyE = e as unknown as { message?: string; error?: any };
  const msg = String(anyE?.message ?? anyE?.error?.message ?? "");
  if (shouldReloadForMessage(msg)) safeHardResetOnce();
});

window.addEventListener("unhandledrejection", (e) => {
  const anyE = e as unknown as { reason?: any };
  const reason = anyE?.reason;
  const msg = String(reason?.message ?? reason ?? "");
  if (shouldReloadForMessage(msg)) safeHardResetOnce();
});

registerAppServiceWorker();

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (error) {
  const msg = String((error as { message?: string } | null)?.message ?? error ?? "");
  if (shouldReloadForMessage(msg)) {
    safeHardResetOnce();
  } else {
    throw error;
  }
}
