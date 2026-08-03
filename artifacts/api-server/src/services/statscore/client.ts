import { CONFIG } from "../../lib/config.js";

// GET {base}/get_pushes/{eventId}?timestamp={ts}&auth={auth}
// 
// AUTENTICAÇÃO (confirmada via probes reais V14/V15):
//   1. HEADER OBRIGATÓRIO: X-Auth: <token> (preferencial, não negociável — investigação confirmou
//      que servidores do StatScore validam este header primeiro e bloqueiam requisições sem ele).
//   2. Query ?auth=<token>: enviado como fallback de compatibilidade com clients antigos.
//   3. HEADER OBRIGATÓRIO: Referer: https://widgets.statscore.com/ — CDN do StatScore rejeita 403
//      requests sem este Origin/Referer (probed em betbyNewUrlsDeepScan.ts linha 169).
//
// Respota bruta não tipificada; tracker.ts normaliza defensivamente (homeScore/home_score, etc).
export async function getPushes(eventId: number): Promise<unknown> {
  if (!CONFIG.STATSCORE_AUTH) {
    throw new Error("STATSCORE_AUTH not configured");
  }
  const ts = Math.floor(Date.now() / 1000);
  const url =
    `${CONFIG.STATSCORE_TRACKER_BASE_URL}/get_pushes/${eventId}` +
    `?timestamp=${ts}&auth=${encodeURIComponent(CONFIG.STATSCORE_AUTH)}`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Auth": CONFIG.STATSCORE_AUTH,
      Referer: "https://widgets.statscore.com/",
      Origin: "https://widgets.statscore.com",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) {
    throw new Error(`[statscore] get_pushes failed: HTTP ${resp.status}`);
  }
  return resp.json();
}
