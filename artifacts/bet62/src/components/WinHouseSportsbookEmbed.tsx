import { useEffect, useId, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

type WinHouseSportsbookEmbedProps = {
  isDarkTheme: boolean;
  isLoggedIn: boolean;
};

function buildStatusLabel(isLoggedIn: boolean): string {
  return isLoggedIn ? "Conta pronta para SSO" : "Visualizacao publica";
}

export default function WinHouseSportsbookEmbed({
  isDarkTheme,
  isLoggedIn,
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

    target.innerHTML = "";
    setLoadState("loading");

    const script = document.createElement("script");
    script.src = "https://iframe.winhouse.bet/embed.js";
    script.async = true;
    if (embedKey) script.dataset.key = embedKey;
    script.dataset.target = `#${containerId}`;
    script.dataset.width = "100%";
    script.dataset.height = "calc(100dvh - 9rem)";
    script.dataset.bottomGap = "84";
    script.dataset.embed = "1";
    script.dataset.lang = language;
    script.dataset.theme = isDarkTheme ? "dark" : "light";

    script.onload = () => {
      setLoadState("ready");
    };
    script.onerror = () => {
      setLoadState("error");
    };

    target.appendChild(script);

    const resizeId = window.setTimeout(() => {
      const embedApi = (
        window as Window & {
          WinHouseEmbed?: { refit?: () => void };
        }
      ).WinHouseEmbed;
      embedApi?.refit?.();
    }, 350);

    return () => {
      window.clearTimeout(resizeId);
      target.innerHTML = "";
    };
  }, [containerId, embedKey, isDarkTheme, language]);

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-zinc-800/60 bg-zinc-900 shadow-[0_4px_20px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="border-b border-zinc-800/60 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-red-400">
                <span className="relative flex h-2 w-2">
                  <span className="b62-live-dot relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                Sportsbook
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Desporto ao vivo e pre-jogo dentro do BET62
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
                O book abre no nosso layout. Sem login, o utilizador pode navegar
                e visualizar os mercados; com login, a ligacao SSO fica pronta
                para a proxima fase da integracao.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-[11px] font-bold text-zinc-300">
                {embedKey ? "Chave configurada" : "Modo por dominio"}
              </div>
              <div className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-[11px] font-bold text-zinc-300">
                {buildStatusLabel(isLoggedIn)}
              </div>
              <a
                href="https://iframe.winhouse.bet/docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors"
              >
                Docs
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="relative bg-black">
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

          <div
            className="sportsbook min-h-[calc(100dvh-10rem)] w-full"
            id={containerId}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Experiencia
          </div>
          <div className="mt-2 text-sm font-semibold text-white">
            Abre dentro do shell do BET62
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            O utilizador permanece no nosso header, navegacao e identidade visual.
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Login
          </div>
          <div className="mt-2 text-sm font-semibold text-white">
            Navegacao publica, SSO depois
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            Nesta fase o visitante ja consegue visualizar o sportsbook sem popup
            e sem sair do BET62.
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Tema
          </div>
          <div className="mt-2 text-sm font-semibold text-white">
            Preparado para dark/light
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            O embed acompanha o tema do app e fica pronto para alinhar as cores
            finais no portal da WinHouse.
          </div>
        </div>
      </div>
    </div>
  );
}
