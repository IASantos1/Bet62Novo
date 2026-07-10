import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hardResetPwaAndReload, registerAppServiceWorker } from "@/lib/pwa";

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
