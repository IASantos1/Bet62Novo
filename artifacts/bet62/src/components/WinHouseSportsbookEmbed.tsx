import { useEffect, useId, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

type WinHouseSportsbookEmbedProps = {
  isDarkTheme: boolean;
  authToken?: string | null;
};

// Fills the content area between BET62's header (h-16 = 4rem) and footer,
// matching the calc(100vh-4rem) used elsewhere in home.tsx for the same
// header height.
const EMBED_HEIGHT = "calc(100dvh - 4rem)";

export default function WinHouseSportsbookEmbed({
  isDarkTheme,
  authToken,
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

  useEffect(() => {
    const target = document.getElementById(containerId);
    if (!target) return;
    let cancelled = false;
    let resizeId = 0;

    const mountEmbed = async () => {
      target.innerHTML = "";
      setLoadState("loading");

      let launchToken = "";
      if (authToken) {
        try {
          const res = await fetch("/api/winhouse/launch", {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && typeof data?.launch === "string" && data.launch.trim()) {
            launchToken = data.launch.trim();
          }
        } catch {}
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
  }, [authToken, containerId, embedKey, isDarkTheme, language]);

  return (
    <div className="relative bg-black" style={{ height: EMBED_HEIGHT, width: "100%" }}>
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
