import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { CONFIG } from "../lib/config.js";
import { startSettlementWorker } from "../settlement.js";
import { startAiAgentsCron } from "../lib/aiAgentsCron.js";
import { startApiTennisWebSocket } from "../services/apitennis/websocketClient.js";
import { liveMatchState } from "../routes/matches.js";
import { startBzzoiroBallSync } from "../providers/bzzoiro/ballMatchSync.js";
import { getBzzoiroUpcomingEvents } from "../providers/bzzoiro/client.js";
import { primeBzzoiroPrematchPrices } from "../providers/bzzoiro/prematchPriceCache.js";

function isBlockedLeague(name: string): boolean {
  const n = name.toLowerCase();
  if (/\bu(1[5-9]|2[013])\b/.test(n)) return true;
  if (/\bunder[- ]?(1[5-9]|2[013])\b/.test(n)) return true;
  if (/\bjuni(or|oren|oer|or)\b/.test(n)) return true;
  if (/\bacademy|reserve|b[- ]team|squadra\s*b|équipe\s*b|equipo\s*b\b/.test(n)) return true;
  return false;
}
function isWomensLeague(name: string): boolean {
  return /women|feminine|féminin|feminino|femminile|frauen|femenin|damall|nwsl|wsl/i.test(name);
}
function stripGenderTeamSuffix(name: string | null | undefined): string | null {
  if (name == null) return null;
  const n = name.trim();
  if (!n) return n;
  return n.replace(/\s*[-–—]\s*(Women|Men|Mulheres|Homens|Femenino|Masculino|Damen|Herren|Donne|Uomini|Femme|Homme)\s*$/i, "").trim() || n;
}

// ── Never let one unhandled rejection take the whole server down ───────────
// Node's default behavior since v15 is to crash the process on an unhandled
// promise rejection. This codebase has several fire-and-forget
// `void someAsyncFn()` calls (e.g. finalizeStaleLiveMatch in matches.ts) —
// if one of those throws, without this handler the entire server crashes
// and Railway restarts it (railway.json: restartPolicyMaxRetries: 5), which
// drops every open SSE live-stream connection and freezes odds for every
// sport until the restart completes — not just whatever briefly failed.
// Logging and continuing is the correct behavior here: a single bad match's
// settlement write failing should never cost every other live match its
// connection.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "[process] unhandledRejection — not crashing");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[process] uncaughtException — not crashing");
});

const port = Number(process.env.API_PORT ?? process.env.PORT ?? "8080");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid port: ${port}`);
}

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "API server started");

  logger.info("=== Provedores Esportivos ===");
  logger.info({ provider: "bzzoiro", status: CONFIG.BZZOIRO_API_KEY ? "ATIVO" : "DESLIGADO" }, "bzzoiro");
  logger.info({ provider: "apitennis", status: CONFIG.TENNIS_API_KEY ? "ATIVO" : "DESLIGADO" }, "apitennis");
  logger.info({ provider: "goalapi", status: CONFIG.GOAL_API_KEY ? "ATIVO" : "DESLIGADO" }, "goalapi");
  logger.info({ provider: "pulsescore", status: CONFIG.PULSESCORE_API_KEY ? "ATIVO" : "DESLIGADO" }, "pulsescore");
  logger.info({ provider: "propline", status: CONFIG.PROPLINE_API_KEY ? "ATIVO" : "DESLIGADO" }, "propline");

  if (!CONFIG.BZZOIRO_API_KEY) {
    logger.warn("BZZOIRO_API_KEY NÃO CONFIGURADA: futebol pré-jogo/ao-vivo, basquete, hóquei, darts não terão fixture/odds/stats");
  }

  logger.info({ footballDaily: CONFIG.FOOTBALL_DAILY_PROVIDER, footballOdds: CONFIG.FOOTBALL_ODDS_PROVIDER, footballReference: CONFIG.FOOTBALL_REFERENCE_PROVIDER }, "[routing] Seleção de provedores de futebol inicializada");

  // Start the auto-settlement worker after the server is up.
  // This scans all pending bets and settles them as matches finish
  // (or early in-play when the outcome is already determined).
  startSettlementWorker();
  logger.info("Auto-settlement worker started");

  logger.info({ provedor: "BZZOIRO como fonte única", apiTennis: "paralelo tênis mantido" }, "[providers] Módulos de provedores esportivos carregados (PulseScore/GoalAPI/PropLine removidos 2026-09-14)");

  // api-tennis.com live push — no-op while TENNIS_API_KEY is unset.
  // Lowers latency on top of buildTennisLiveFromApiTennis's REST poll;
  // never a hard dependency (see websocketClient.ts's own comment).
  if (CONFIG.TENNIS_API_KEY) {
    startApiTennisWebSocket();
  }

  // sports.bzzoiro.com — FONTE ÚNICA (desde 2026-09-14). Liga tudo:
  // bola x/y mini-campo, fixtures, odds, stats, xg, timeline de eventos
  // para futebol, basquete, hóquei, tênis, dardos e outros cobertos.
  if (CONFIG.BZZOIRO_API_KEY) {
    startBzzoiroBallSync();
  }

  // BZZOIRO Fase 2 — PRÉ-JOGO (upcoming 8 dias): sweep periodico dos IDs das
  // partidas para popular o cache de odds prematch. Executa 1x no startup e
  // depois a cada 3 min, mesmo sem tráfego. Assim quando o primeiro usuário
  // bate na home os preços já estão cacheados.
  if (CONFIG.BZZOIRO_API_KEY) {
    async function runBzzoiroPrematchSweep(): Promise<void> {
      const today = new Date();
      const dateFrom = today.toISOString().slice(0, 10);
      const dateTo = new Date(today.getTime() + 8 * 86_400_000).toISOString().slice(0, 10);
      try {
        const events = await getBzzoiroUpcomingEvents(dateFrom, dateTo);
        const ids = events.map((ev) => ev.id);
        logger.info(
          { events: ids.length, dateFrom, dateTo },
          "[bzzoiro-prematch-sweep] iniciando prime de preços prematch",
        );
        await primeBzzoiroPrematchPrices(ids);
      } catch (err) {
        logger.error({ err }, "[bzzoiro-prematch-sweep] falhou");
      }
    }
    void runBzzoiroPrematchSweep();
    setInterval(() => void runBzzoiroPrematchSweep(), 3 * 60 * 1000);
  }

  logger.info({
    apiTennisWs: !!CONFIG.TENNIS_API_KEY,
    bzzoiroWs: !!CONFIG.BZZOIRO_API_KEY,
  }, "[websocket] Inicialização de conexões WebSocket de provedores concluída (BZZOIRO único, GoalAPI/PulseScore/PropLine removidos)");

  // Background AI-agents cron (Risk / Odds / Payments / Compliance / ... + Orchestrator).
  // Safe to unconditionally call: the function is no-op when AI_AGENTS_API_KEY
  // is unset or AI_CRON_ENABLED=false. No user traffic is affected.
  startAiAgentsCron();
  logger.info({ aiAgentsKey: !!CONFIG.AI_AGENTS_API_KEY, model: CONFIG.AI_AGENTS_MODEL }, "[ai-agents] Sistema de agentes de IA (Risk/Odds/Payments/Compliance/Orchestrator) inicializado");
});
