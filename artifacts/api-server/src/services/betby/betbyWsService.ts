// =====================================================================
//  BETBY WEBSOCKET SERVICE (SINGLETON) — HANDshake → get_match_tracker → get_stream
// =====================================================================
//  Estratégia DUAL HYBRID (pois Cloudflare costuma bloquear WS Node diretamente):
//
//    MODO 1 (PRIMÁRIO - PADRÃO): BTRenderer.action() via Browser Integrated
//            (btInstance.action('get_match_tracker', {eventId}, cb)
//             btInstance.action('get_stream', {eventId}, cb)
//            já provado que BTRenderer carrega com JWT no renderer)
//
//    MODO 2 (FALLBACK): WebSocket nativo Node 24 → wss://<host>/api/v1/ws_new
//            (action=handshake params {jwt,brand,lang}  →  requestId tracker/stream)
//
//  Exemplo uso:
//    import { betbyWsService } from "./betbyWsService.js";
//    await betbyWsService.connectIfNeeded();
//    const tracker = await betbyWsService.getMatchTracker("2695856240139055124");
//    const stream  = await betbyWsService.getStream("2695856240139055124");
//
//  Rotas HTTP correspondentes: /betby/ws/* (ver routes/betby.ts)
// =====================================================================

import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { betbyJwt } from "./jwtService.js";

export type BetbyWsStatus = "disconnected" | "connecting" | "open" | "error" | "closing";

export interface BetbyWsState {
  status: BetbyWsStatus;
  hostWs: string | null;
  connectedAtMs: number | null;
  msgsIn: number;
  msgsOut: number;
  bytesIn: number;
  handshakeResp: any | null;
  erroUltimo: string | null;
  closeCode: number | null;
  requestsPendentes: string[];
  modo: "browser_renderer" | "ws_nativo";
}

interface PendingReq {
  action: string;
  params: Record<string, any>;
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
  rawSent: string | null;
}

// Hosts de tentativa WS nativo (ordem: sessão primeiro, depois feed)
const HOSTS_PADRAO_WS = [
  "ff7828db6a5af99c.hdonegame.com",
  "api-h-c7818b61-608.sptpub.com",
];

function uoid(prefix = "r"): string {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

class BetbyWsService {
  private state: BetbyWsState;
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingReq>();
  private connectPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

  constructor() {
    const modo: BetbyWsState["modo"] =
      String((CONFIG as any).BETBY_WS_MODE || process.env.BETBY_WS_MODE || "browser_renderer")
        .trim()
        .toLowerCase()
        .includes("ws")
        ? "ws_nativo"
        : "browser_renderer";
    this.state = {
      status: "disconnected",
      hostWs: null,
      connectedAtMs: null,
      msgsIn: 0,
      msgsOut: 0,
      bytesIn: 0,
      handshakeResp: null,
      erroUltimo: null,
      closeCode: null,
      requestsPendentes: [],
      modo,
    };
    logger.info({ modo }, "[betby-ws] service inicializado");
  }

  getEstado(): BetbyWsState {
    return { ...this.state, requestsPendentes: Array.from(this.pending.keys()) };
  }

  modo(): BetbyWsState["modo"] {
    return this.state.modo;
  }

  setModo(modo: BetbyWsState["modo"]) {
    this.state.modo = modo;
    logger.info({ modo }, "[betby-ws] modo alterado");
  }

  // -----------------------------------------------------------------
  // MODO 2 (fallback): WebSocket nativo Node
  // -----------------------------------------------------------------
  private obterJwt(): string {
    const snap = betbyJwt.snapshot();
    return (
      snap.token ||
      (CONFIG as any).BETBY_JWT ||
      process.env.BETBY_JWT ||
      ""
    ).trim();
  }

  private obterBrand(): string {
    return ((CONFIG as any).BETBY_BRAND_ID || process.env.BETBY_BRAND_ID || "2633251597353889792").trim();
  }

  private obterLang(): string {
    return ((CONFIG as any).BETBY_LANG || process.env.BETBY_LANG || "en").trim();
  }

  private buildHosts(): string[] {
    const fromCfg = String((CONFIG as any).BETBY_WS_HOST || process.env.BETBY_WS_HOST || "").trim();
    if (fromCfg) return [fromCfg, ...HOSTS_PADRAO_WS.filter(h => h !== fromCfg)];
    return [...HOSTS_PADRAO_WS];
  }

  async connectIfNeeded(hostWsExplicito?: string, timeoutMs = 14_000): Promise<void> {
    if (this.state.status === "open") return;
    if (this.state.status === "connecting" && this.connectPromise) return this.connectPromise;

    if (this.state.modo === "browser_renderer") {
      // Não precisa de conexão ativa (ação via renderer browser integrado).
      // Marca como "open" virtual.
      this.state.status = "open";
      this.state.connectedAtMs = Date.now();
      this.state.hostWs = hostWsExplicito || "browser_renderer";
      logger.info("[betby-ws] MODO browser_renderer: conexão virtual aberta (usa BTRenderer.action)");
      return;
    }

    this.connectPromise = (async () => {
      this.state.status = "connecting";
      this.state.erroUltimo = null;
      this.state.closeCode = null;
      const hosts = hostWsExplicito ? [hostWsExplicito] : this.buildHosts();
      let ultimoErr: string | null = null;
      for (const host of hosts) {
        try {
          await this._connectOnce(host, timeoutMs);
          return; // sucesso
        } catch (e) {
          ultimoErr = String(e);
          logger.warn({ host, err: ultimoErr.slice(0, 240) }, "[betby-ws] tentativa falhou");
        }
      }
      this.state.status = "error";
      this.state.erroUltimo = ultimoErr || "todos hosts falharam";
      this.connectPromise = null;
      throw new Error("[betby-ws] não foi possível conectar em nenhum host WS: " + this.state.erroUltimo);
    })();

    return this.connectPromise;
  }

  private _connectOnce(host: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `wss://${host}/api/v1/ws_new`;
        logger.debug({ url }, "[betby-ws] tentando conectar");
        // @ts-ignore — Node 24 WebSocket global, sem headers no ctor
        const ws = new WebSocket(url) as WebSocket;
        this.ws = ws;
        this.state.hostWs = host;

        const toHandshake = setTimeout(() => {
          try { ws.close(1000, "handshake_timeout"); } catch {}
          reject(new Error("handshake timeout after " + timeoutMs + "ms"));
        }, timeoutMs);

        const onOpen = async () => {
          this.state.status = "open";
          this.state.connectedAtMs = Date.now();
          this.state.msgsIn = 0;
          this.state.msgsOut = 0;
          this.state.bytesIn = 0;
          logger.debug("[betby-ws] ws open — enviando handshake");
          // handshake
          const reqId = uoid("handshake");
          const msg = {
            action: "handshake",
            params: {
              jwt: this.obterJwt(),
              brand: this.obterBrand(),
              lang: this.obterLang(),
            },
            requestId: reqId,
          };
          this.pending.set(reqId, {
            action: "handshake",
            params: msg.params,
            resolve: (resp: any) => {
              clearTimeout(toHandshake);
              this.state.handshakeResp = resp || true;
              logger.info({ keys: Object.keys(resp || {}).slice(0, 12).join(",") }, "[betby-ws] handshake ok");
              resolve();
            },
            reject: (e) => { clearTimeout(toHandshake); reject(e); },
            timer: setTimeout(() => {
              this.pending.delete(reqId);
              reject(new Error("handshake resposta timeout"));
            }, timeoutMs),
            createdAt: Date.now(),
            rawSent: JSON.stringify(msg),
          });
          ws.send(JSON.stringify(msg));
          this.state.msgsOut++;
        };

        const onMessage = (ev: MessageEvent<any>) => {
          const raw = typeof ev.data === "string" ? ev.data : "";
          this.state.msgsIn++;
          this.state.bytesIn += raw.length;
          let js: any = null;
          try { js = raw ? JSON.parse(raw) : null; } catch {}
          if (!js) return;
          const rid: string | undefined = js.requestId || js.request_id;
          const action = js.action || "?";

          // Handshake sem requestId (resposta top-level): busca primeiro pending handshake
          if (action === "handshake" && !rid) {
            for (const [id, p] of this.pending.entries()) {
              if (p.action === "handshake") {
                clearTimeout(p.timer);
                this.pending.delete(id);
                p.resolve(js);
                break;
              }
            }
            return;
          }

          if (rid && this.pending.has(rid)) {
            const p = this.pending.get(rid)!;
            clearTimeout(p.timer);
            this.pending.delete(rid);
            if (js.error) p.reject(new Error(js.error?.message || String(js.error)));
            else p.resolve(js);
            return;
          }

          // match por action sem requestId (get_match_tracker / get_stream)
          if (rid === undefined && (action === "get_match_tracker" || action === "get_stream")) {
            for (const [id, p] of this.pending.entries()) {
              if (p.action === action) {
                clearTimeout(p.timer);
                this.pending.delete(id);
                p.resolve(js);
                return;
              }
            }
          }
        };

        const onError = (ev: Event) => {
          const msg = String((ev as any).message || (ev as any).error || "WS error event");
          logger.warn({ err: msg.slice(0, 240) }, "[betby-ws] erro WS");
          this.state.status = "error";
          this.state.erroUltimo = msg;
        };

        const onClose = (ev: CloseEvent) => {
          logger.debug({ code: ev.code, reason: String(ev.reason || "").slice(0, 120) }, "[betby-ws] close");
          this.state.closeCode = ev.code;
          if (this.state.status === "connecting") {
            this.state.status = "error";
            this.state.erroUltimo = this.state.erroUltimo || "close antes de open — code " + ev.code;
            clearTimeout(toHandshake);
            reject(new Error(this.state.erroUltimo));
          } else if (this.state.status === "open") {
            this.state.status = "disconnected";
          }
          for (const [id, p] of this.pending.entries()) {
            clearTimeout(p.timer);
            p.reject(new Error("WS fechado (code=" + ev.code + ") antes de receber resposta para action=" + p.action));
          }
          this.pending.clear();
          this.ws = null;
          this.connectPromise = null;
        };

        // @ts-ignore addEventListener
        ws.addEventListener("open", onOpen);
        ws.addEventListener("message", onMessage);
        ws.addEventListener("error", onError);
        ws.addEventListener("close", onClose);
      } catch (e) {
        this.state.status = "error";
        this.state.erroUltimo = String(e);
        reject(e);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.ws) { this.state.status = "disconnected"; return; }
    if (this.state.status === "closing" && this.closePromise) return this.closePromise;
    this.state.status = "closing";
    this.closePromise = (async () => {
      try { this.ws?.close(1000, "betbyWsService.disconnect"); } catch {}
      await new Promise<void>((r) => setTimeout(r, 300));
      this.state.status = "disconnected";
      this.ws = null;
      this.connectPromise = null;
      this.closePromise = null;
    })();
    return this.closePromise;
  }

  /**
   * Envia action/params pela conexão WS (ou MODO browser_renderer retorna placeholder).
   * Resolve quando chega resposta com mesmo requestId / mesma action.
   */
  async request<T = any>(
    action: string,
    params: Record<string, any> = {},
    timeoutMs = 18_000,
  ): Promise<T> {
    await this.connectIfNeeded();

    if (this.state.modo === "browser_renderer") {
      // MODO 1 — Chamada via BTRenderer.action no Integrated Browser.
      // NÂO podemos abrir evaluate a partir do backend: então retornamos um ticket
      // para o cliente resolver via bridge. Também preenchemos status erro para
      // rotas HTTP explicitarem a necessidade do bridge.
      const ticket: any = {
        _via: "browser_renderer_bridge_required",
        action,
        params,
        ticket: uoid("tk_" + action),
        instruction:
          "No Integrated Browser viewId do renderer BetBY, execute: " +
          "window.btInstance.action(" +
          JSON.stringify(action) +
          ", " +
          JSON.stringify(params) +
          ", (resposta) => window.__betby_ws_resp[" + JSON.stringify(uoid("tk_")) + "] = resposta)",
        hint:
          "Rotas /betby/ws/tracker/:id e /betby/ws/stream/:id retornam ticket quando WS node bloqueado. " +
          "Use Integrated Browser BTRenderer.action() para pegar a resposta real e enviar via POST /betby/ws/bridge-result.",
      };
      logger.debug({ action, params: Object.keys(params) }, "[betby-ws] MODO browser_renderer: retornando ticket bridge");
      return ticket as unknown as T;
    }

    // MODO 2 — WS nativo aberto.
    if (this.state.status !== "open" || !this.ws) {
      throw new Error("[betby-ws] conexão não aberta (status=" + this.state.status + ")");
    }

    return new Promise<T>((resolve, reject) => {
      const rid = uoid(action);
      const payload = { action, params, requestId: rid };
      const raw = JSON.stringify(payload);
      const timer = setTimeout(() => {
        if (this.pending.has(rid)) {
          this.pending.delete(rid);
          reject(new Error(`[betby-ws] timeout ${timeoutMs}ms action=${action}`));
        }
      }, timeoutMs);
      this.pending.set(rid, {
        action,
        params,
        resolve: (v) => resolve(v as T),
        reject,
        timer,
        createdAt: Date.now(),
        rawSent: raw,
      });
      try {
        this.ws!.send(raw);
        this.state.msgsOut++;
      } catch (e) {
        this.pending.delete(rid);
        clearTimeout(timer);
        reject(new Error("[betby-ws] send failed: " + String(e)));
      }
    });
  }

  // --- Helpers tipados ----------------------------------------------------
  async getMatchTracker(eventId: string, timeoutMs = 18_000) {
    const r = await this.request("get_match_tracker", { eventId }, timeoutMs);
    return r as any;
  }

  async getStream(eventId: string, timeoutMs = 18_000) {
    const r = await this.request("get_stream", { eventId }, timeoutMs);
    return r as any;
  }

  async handshake() {
    return this.request("handshake", {
      jwt: this.obterJwt(),
      brand: this.obterBrand(),
      lang: this.obterLang(),
    });
  }
}

export const betbyWsService = new BetbyWsService();
export default betbyWsService;

/**
 * Bridge (usado quando browser renderer responde via POST).
 * Map de tickets → resultados resolvidos para rotas HTTP consumirem.
 */
const _bridgeResults = new Map<string, any>();

export function betbyBridgeStore(ticket: string, result: any, ttlMs = 5 * 60 * 1000) {
  _bridgeResults.set(ticket, { at: Date.now(), result });
  setTimeout(() => _bridgeResults.delete(ticket), ttlMs);
}

export function betbyBridgeTake(ticket: string): any | null {
  const e = _bridgeResults.get(ticket) || null;
  return e ? e.result : null;
}
