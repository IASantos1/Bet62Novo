import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { CONFIG } from "../lib/config.js";
import { startSettlementWorker } from "../settlement.js";
import { startAiAgentsCron } from "../lib/aiAgentsCron.js";
import { propline } from "../services/propline/index.js";
import { proplineAllActiveSports } from "../services/propline/football.js";
import { startGoalApiWebSocket, syncGoalApiSubscriptions } from "../services/goalapi/websocketClient.js";
import { startApiTennisWebSocket } from "../services/apitennis/websocketClient.js";
import { applyGoalApiWebhookEvent, liveMatchState } from "../routes/matches.js";
import { runPulseScoreShadowMatchSync } from "../providers/pulsescore/shadowMatchSync.js";
import { startPulseScoreWebSocket } from "../providers/pulsescore/websocketClient.js";

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

// ── PropLine Startup Probe + Quota Check ────────────────────────────────────
// PropLine já retorna quota/daily-usage via headers em TODA resposta autenticada.
// O probe() acerta /sports (barato, conta 1 req de 1M/dia) e preenche os
// snapshots internos. Avisa no log a qualquer sinal de <10% remaining.
let lastProplineWarnRemainingPct = -1;
async function proplineStartupAndPeriodicCheck(phase: "startup" | "periodic"): Promise<void> {
  if (!CONFIG.PROPLINE_API_KEY) {
    logger.debug("[propline] PROPLINE_API_KEY não configurada — skip check");
    return;
  }
  try {
    const probe = await propline.probe();
    const usage = propline.usage();
    const dailyLimit = usage.dailyLimit ?? 1_000_000;
    const dailyUsed = usage.dailyUsed ?? 0;
    const dailyRemaining = usage.dailyRemaining ?? Math.max(0, dailyLimit - dailyUsed);
    const remainingPct = dailyLimit > 0 ? Math.round((dailyRemaining / dailyLimit) * 1000) / 10 : 100;
    const info = {
      ok: probe.ok,
      sportCount: probe.sportCount,
      enabledSports: proplineAllActiveSports(),
      defaultBookmakers: CONFIG.PROPLINE_DEFAULT_BOOKMAKERS,
      dailyLimit,
      dailyUsed,
      dailyRemaining,
      remainingPct,
      rateLimitRemaining: usage.rateLimitRemaining,
      rateLimitResetSec: usage.rateLimitReset,
      dailyResetAtUnix: usage.dailyReset,
      phase,
    };
    if (remainingPct < 5) {
      logger.error(info, "[propline] CRÍTICO: <5% de quota restante");
    } else if (remainingPct < 10) {
      if (lastProplineWarnRemainingPct >= 10 || phase === "startup") {
        logger.warn(info, "[propline] ATENÇÃO: <10% de quota restante");
      }
    } else if (phase === "startup") {
      logger.info(info, "[propline] Startup probe OK");
    } else {
      logger.debug(info, "[propline] Periodic check OK");
    }
    lastProplineWarnRemainingPct = remainingPct < 10 ? 10 : remainingPct;
  } catch (err) {
    logger.warn({ err, phase }, "[propline] probe falhou (transiente) — ignora");
  }
}

server.listen(port, () => {
  logger.info({ port }, "API server started");

  // Start the auto-settlement worker after the server is up.
  // This scans all pending bets and settles them as matches finish
  // (or early in-play when the outcome is already determined).
  startSettlementWorker();
  logger.info("Auto-settlement worker started");

  void proplineStartupAndPeriodicCheck("startup");
  setInterval(() => void proplineStartupAndPeriodicCheck("periodic"), 60 * 60 * 1000);

  // GOAL API Data Collector — no-op while GOAL_API_MAX_WS_MATCHES is 0
  // (the FREE plan's real concurrent-match limit for WebSocket
  // subscriptions), so this activates automatically once the account
  // upgrades, with no code change. Every match_update just triggers a
  // refresh through the same REST-derived state path the webhook receiver
  // and poll loop use (routes/matches.ts's applyGoalApiWebhookEvent) —
  // one source of truth for state regardless of what woke it up.
  if (CONFIG.GOAL_API_KEY) {
    startGoalApiWebSocket((fixtureId) => {
      applyGoalApiWebhookEvent({ event: "score.changed", data: { fixtureId } }).catch((err) => {
        logger.error({ err, fixtureId }, "[goal-api-ws] update handling failed");
      });
    });
    setInterval(() => {
      const ids = [...liveMatchState.keys()]
        .filter((id) => id.startsWith("goalapi-football-"))
        .map((id) => id.slice("goalapi-football-".length));
      syncGoalApiSubscriptions(ids);
    }, 30_000);
  }

  // api-tennis.com live push — no-op while TENNIS_API_KEY is unset.
  // Lowers latency on top of buildTennisLiveFromApiTennis's REST poll;
  // never a hard dependency (see websocketClient.ts's own comment).
  if (CONFIG.TENNIS_API_KEY) {
    startApiTennisWebSocket();
  }

  // PulseScore Fase 1 — matching + the REAL live football odds source as
  // of 2026-09-10 (see providers/pulsescore/shadowMatchSync.ts's header):
  // once a fixture is matched, this round also writes PulseScore's own
  // price into liveMatchState/routes/bets.ts's read path. 15s (down from
  // the original 120s, which was sized for matching cadence, not odds
  // freshness) — PulseScore's own REST throttle (1 req/sec via the
  // client's serialized queue) already caps real request volume regardless
  // of how often this fires, so the shorter interval only makes already-
  // fetched data get re-applied more often. Inert until PULSESCORE_API_KEY
  // is set.
  if (CONFIG.PULSESCORE_API_KEY) {
    setInterval(() => runPulseScoreShadowMatchSync(), 15_000);
  }

  // PulseScore WebSocket — confirmed real via the docs the user pasted
  // 2026-09-10: the PRO plan (this account's) includes 1 concurrent
  // connection. Treated purely as a wake-up signal (see
  // providers/pulsescore/websocketClient.ts's header for why) — not yet
  // wired into shadowMatchSync's fetch cadence, just connected and logging
  // for now. Inert until PULSESCORE_API_KEY is set.
  if (CONFIG.PULSESCORE_API_KEY) {
    startPulseScoreWebSocket();
  }

  // Background AI-agents cron (Risk / Odds / Payments / Compliance / ... + Orchestrator).
  // Safe to unconditionally call: the function is no-op when AI_AGENTS_API_KEY
  // is unset or AI_CRON_ENABLED=false. No user traffic is affected.
  startAiAgentsCron();
});
