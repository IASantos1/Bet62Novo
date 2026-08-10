import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { CONFIG } from "../lib/config.js";
import { startSettlementWorker } from "../settlement.js";
import { startPulseScoreFootballWs } from "../services/pulsescore/footballWs.js";
import { startPulseScoreBasketballWs } from "../services/pulsescore/basketballWs.js";

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

// ── StatPal Quota Health Check ──────────────────────────────────────────────
// Chamada GRATUITA (/user-request-count NÃO conta na cota de 300k/dia,
// confirmado statpal docs "Monitoring Usage"). Roda uma vez no startup e
// depois a cada 60 minutos para alertar no log se estourarmos 75% da cota.
// Avisa o operador via logger (sem interromper o servidor — Statpal é só
// camada 3 de tracker, temos StatScore e PulseScore de fallback).
let lastQuotaWarnPct = -1;
async function statpalQuotaCheck(phase: "startup" | "periodic"): Promise<void> {
  if (!CONFIG.STATPAL_API_KEY) {
    logger.debug("[statpal-quota] STATPAL_API_KEY não configurada — skip check");
    return;
  }
  try {
    const url = new URL("https://statpal.io/api/user-request-count");
    url.searchParams.set("access_key", CONFIG.STATPAL_API_KEY);
    const r = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      logger.warn({ status: r.status, phase }, "[statpal-quota] /user-request-count falhou");
      return;
    }
    const raw = (await r.json()) as Record<string, unknown>;
    const cnt = Number(
      raw["contagem_de_solicitações"] ?? raw["request_count"] ?? raw["requestCount"] ?? 0,
    );
    const DAILY_LIMIT = 300_000;
    const pct = DAILY_LIMIT > 0 ? Math.round((cnt / DAILY_LIMIT) * 1000) / 10 : 0;
    const info = {
      count: cnt,
      dailyLimit: DAILY_LIMIT,
      usedPct: pct,
      date: raw["data_atual"] ?? raw["date"] ?? new Date().toISOString().slice(0, 10),
      phase,
    };
    if (pct >= 95) {
      logger.error(info, "[statpal-quota] CRÍTICO: >95% da cota diária usada — risco de 429");
    } else if (pct >= 75) {
      if (lastQuotaWarnPct < 75 || phase === "startup") {
        logger.warn(info, "[statpal-quota] ATENÇÃO: >75% da cota diária usada");
      }
    } else {
      if (phase === "startup") {
        logger.info(info, "[statpal-quota] Startup check OK");
      } else {
        logger.debug(info, "[statpal-quota] Periodic check OK");
      }
    }
    lastQuotaWarnPct = pct >= 75 ? 75 : pct >= 95 ? 95 : 0;
  } catch (err) {
    logger.warn({ err, phase }, "[statpal-quota] check falhou (transiente) — ignora");
  }
}

server.listen(port, () => {
  logger.info({ port }, "API server started");

  // Start the auto-settlement worker after the server is up.
  // This scans all pending bets and settles them as matches finish
  // (or early in-play when the outcome is already determined).
  startSettlementWorker();
  logger.info("Auto-settlement worker started");

  // Football's dedicated WS connection — see getPulseScoreFootballLive
  // (football.ts) for the per-event merge design. Safe to call even before
  // PULSESCORE_API_KEY is set, it just no-ops until then.
  startPulseScoreFootballWs();
  // startPulseScoreBasketballWs() is DELIBERATELY NOT called here.
  // Confirmed via the real PulseScore docs (2026-08-10): connection limits
  // are per PLAN for the WHOLE ACCOUNT, not per sport — PRO gets exactly 1
  // simultaneous WS connection, MAX gets 3. A PRO account can never hold
  // this connection AND football's at the same time; the second one gets
  // closed with code 4029 (non-retryable per the docs). Basketball is
  // REST-only by design on the current plan, not a workaround — REST-only
  // is already fully functional (getPulseScoreBasketballLive works
  // standalone, mergeBasketballWsFreshness is a safe no-op with nothing
  // ever populated in basketballWs.ts's liveByEventId while this stays
  // uncalled). Reactivating this needs a MAX plan upgrade — see
  // basketballWs.ts's own header for the rest of this history.

  void statpalQuotaCheck("startup");
  setInterval(() => void statpalQuotaCheck("periodic"), 60 * 60 * 1000);
});
