import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { CONFIG } from "../lib/config.js";
import { startSettlementWorker } from "../settlement.js";
import { startAiAgentsCron } from "../lib/aiAgentsCron.js";
import { startApiTennisWebSocket } from "../services/apitennis/websocketClient.js";
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

server.listen(port, () => {
  logger.info({ port }, "API server started");

  // Start the auto-settlement worker after the server is up.
  // This scans all pending bets and settles them as matches finish
  // (or early in-play when the outcome is already determined).
  startSettlementWorker();
  logger.info("Auto-settlement worker started");

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
    void runPulseScoreShadowMatchSync();
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
