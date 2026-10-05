import { useEffect, useId, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

type WinHouseSportsbookEmbedProps = {
  isDarkTheme: boolean;
  isAuthenticated?: boolean;
};

// Fills the content area between BET62's header (h-16 = 4rem) and footer,
// matching the calc(100vh-4rem) used elsewhere in home.tsx for the same
// header height.
const EMBED_HEIGHT = "calc(100dvh - 4rem)";

// User-reported pattern (2026-10-05, unverified against a fresh/direct
// load): WinHouse's own router uses this hash to jump to one fixture.
// embed.js injects the real <iframe> itself — we never build its src — so
// this polls the container for that element to appear, then appends the
// hash once the iframe exists. A few retries because embed.js's own
// internal bootstrapping can lag slightly behind the external script's
// "loaded" event.
function applyDeepLink(container: HTMLElement, gameId: string, attemptsLeft = 10): void {
  const iframe = container.querySelector("iframe");
  if (!iframe) {
    if (attemptsLeft <= 0) return;
    window.setTimeout(() => applyDeepLink(container, gameId, attemptsLeft - 1), 300);
    return;
  }
  const src = iframe.getAttribute("src");
  if (!src) return;
  const base = src.split("#")[0];
  iframe.setAttribute("src", `${base}#/event/${encodeURIComponent(gameId)}`);
}

export default function WinHouseSportsbookEmbed({
  isDarkTheme,
  isAuthenticated,
}: WinHouseSportsbookEmbedProps) {
  const containerId = useId().replace(/:/g, "");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const embedKey = useMemo(
    () => String(import.meta.env.VITE_WINHOUSE_EMBED_KEY ?? "").trim(),
    [],
  );
  const language = useMemo(
    () => String(import.meta.env.VITE_WINHOUSE_LANG ?? "pt").trim() || "pt",
    [],
  );
  // Deep-link from a Telegram promotion post (?gameId=…) straight to that
  // fixture inside the embedded WinHouse iframe. Best-effort: WinHouse's
  // embed.js builds the iframe itself (we never see its src up front), so
  // this waits for the <iframe> to show up inside our container, then
  // appends WinHouse's own event-route hash to its src. Unverified against
  // a real production load as of 2026-10-05 — if WinHouse's router doesn't
  // pick up a hash set this way, the embed just opens on its normal
  // default view, same as today; nothing else depends on this working.
  const deepLinkGameId = useMemo(
    () => new URLSearchParams(window.location.search).get("gameId")?.trim() || "",
    [],
  );

  useEffect(() => {
    const target = document.getElementById(containerId);
    if (!target) return;
    let cancelled = false;
    let resizeId = 0;

    const mountEmbed = async () => {
      target.innerHTML = "";
      setLoadState("loading");

      let launchToken = "";
      if (isAuthenticated) {
        try {
          // No Authorization header needed — the bet62_session cookie
          // authenticates this same-origin request automatically.
          const res = await fetch("/api/winhouse/launch");
          const data = await res.json().catch(() => ({}));
          if (res.ok && typeof data?.launch === "string" && data.launch.trim()) {
            launchToken = data.launch.trim();
          } else if (!cancelled) {
            // Logged-in users landing on WinHouse's own login/register modal
            // instead of being auto-signed-in trace back to exactly this
            // failing silently — most commonly a missing/misconfigured
            // WINHOUSE_WALLET_API_KEY on the backend (503 here), which the
            // embed has no other way to surface (Santos, 2026-09-25).
            console.warn(
              "[WinHouse] launch token request failed — the embed will show WinHouse's own login instead of SSO-signing the user in.",
              { status: res.status, body: data },
            );
          }
        } catch (err) {
          if (!cancelled) {
            console.warn("[WinHouse] launch token request threw", err);
          }
        }
      }
      if (cancelled) return;

      const script = document.createElement("script");
      script.src = "https://iframe.winhouse.bet/embed.js";
      script.async = true;
      if (embedKey) script.dataset.key = embedKey;
      script.dataset.target = `#${containerId}`;
      script.dataset.width = "100%";
      // BET62's header (h-16, i.e. 4rem) stays visible above this tab (see
      // isFullScreenSportsbook in home.tsx) and the footer follows right
      // after — the embed only owns the space between them, not the whole
      // viewport.
      script.dataset.height = EMBED_HEIGHT;
      script.dataset.bottomGap = "0";
      script.dataset.embed = "1";
      script.dataset.lang = language;
      script.dataset.theme = isDarkTheme ? "dark" : "light";
      if (launchToken) script.dataset.launch = launchToken;

      script.onload = () => {
        setLoadState("ready");
        if (deepLinkGameId) applyDeepLink(target, deepLinkGameId);
      };
      script.onerror = () => {
        setLoadState("error");
      };

      target.appendChild(script);

      resizeId = window.setTimeout(() => {
        const embedApi = (
          window as Window & {
            WinHouseEmbed?: { refit?: () => void };
          }
        ).WinHouseEmbed;
        embedApi?.refit?.();
      }, 350);
    };

    void mountEmbed();

    return () => {
      cancelled = true;
      window.clearTimeout(resizeId);
      target.innerHTML = "";
    };
  }, [isAuthenticated, containerId, embedKey, isDarkTheme, language]);

  return (
    <div className="relative bg-background" style={{ height: EMBED_HEIGHT, width: "100%" }}>
      {loadState !== "ready" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 text-sm text-zinc-300 shadow-xl shadow-black/40">
            {loadState === "error" ? (
              <>
                <ExternalLink size={16} className="text-red-400" />
                <span>
                  Nao foi possivel carregar o embed. Verifique dominio,
                  chave e CSP.
                </span>
              </>
            ) : (
              <>
                <RefreshCw size={16} className="animate-spin text-red-400" />
                <span>A carregar sportsbook...</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="sportsbook h-full w-full" id={containerId} />
    </div>
  );
}
