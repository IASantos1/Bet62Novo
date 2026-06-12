import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerAppServiceWorker } from "@/lib/pwa";

const shouldReloadForMessage = (msg: string): boolean => {
  const m = (msg ?? "").toLowerCase();
  if (!m) return false;
  if (m.includes("chunkloaderror")) return true;
  if (m.includes("loading chunk")) return true;
  if (m.includes("failed to fetch dynamically imported module")) return true;
  if (m.includes("importing a module script failed")) return true;
  return false;
};

const safeReloadOnce = (): void => {
  try {
    const key = "bet62_reload_once";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {}
  window.location.reload();
};

window.addEventListener("error", (e) => {
  const anyE = e as unknown as { message?: string; error?: any };
  const msg = String(anyE?.message ?? anyE?.error?.message ?? "");
  if (shouldReloadForMessage(msg)) safeReloadOnce();
});

window.addEventListener("unhandledrejection", (e) => {
  const anyE = e as unknown as { reason?: any };
  const reason = anyE?.reason;
  const msg = String(reason?.message ?? reason ?? "");
  if (shouldReloadForMessage(msg)) safeReloadOnce();
});

registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
