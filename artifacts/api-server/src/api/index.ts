import "dotenv/config";
import { createServer } from "http";
import app from "../app.js";
import { logger } from "../lib/logger.js";
import { startSettlementWorker } from "../settlement.js";
import { startPulseScoreFootballWs } from "../services/pulsescore/footballWs.js";
import { startPulseScoreBasketballWs } from "../services/pulsescore/basketballWs.js";
import { startPulseScoreTennisWs } from "../services/pulsescore/tennisWs.js";
import { startPulseScoreHockeyWs } from "../services/pulsescore/hockeyWs.js";
import { startPulseScoreVolleyballWs } from "../services/pulsescore/volleyballWs.js";
import { startAiAgentsCron } from "../lib/aiAgentsCron.js";

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

  // Football/Tennis/Basketball's dedicated WS connections — see
  // getPulseScoreFootballLive (football.ts), getPulseScoreTennisLive
  // (tennis.ts), and getPulseScoreBasketballLive (basketball.ts) for each
  // sport's per-event merge design. Safe to call even before
  // PULSESCORE_API_KEY is set, they just no-op until then.
  //
  // All three calls together were the actual reason for the 2026-08-11 MAX
  // plan upgrade (€149/mês, 3 concurrent connections) — until then, PulseScore
  // docs confirm connection limits are per PLAN for the WHOLE ACCOUNT, not
  // per sport (PRO's 1 connection meant only one sport at a time; a second
  // simultaneous connection gets closed with non-retryable code 4029). Each
  // REST poller already tolerates its WS overlay being empty/stale/absent —
  // if the account ever drops back to a lower tier, whichever connections
  // get closed by PulseScore simply degrade to REST-only for that sport,
  // nothing needs to change here.
  // MAX plan (2026-08-15 docs) allows 3 concurrent WebSocket connections
  // (one per sport) across the ENTIRE account — per-plan connections are NOT
  // per-sport independent. The 3 highest-volume live sports (soccer, tennis,
  // basketball) get the real-time WS feed; the rest (hockey, volleyball,
  // baseball, ...) are intentionally left REST-polled via genericSportLive
  // + per-sport builders below, which already tolerate no WS overlay cleanly.
  // If the plan ever upgrades to ULTRA (10 concurrent) simply uncomment the
  // disabled lines; the hockeyWs/volleyballWs modules themselves already
  // exist and are safe to start — we just skip them here to stay under the
  // 4029 "Connection limit reached" close code.
  startPulseScoreFootballWs();
  startPulseScoreTennisWs();
  startPulseScoreBasketballWs();
  // startPulseScoreHockeyWs();      // MAX limit 3/3 used — REST fallback
  // startPulseScoreVolleyballWs();  // MAX limit 3/3 used — REST fallback

  // Background AI-agents cron (Risk / Odds / Payments / Compliance / ... + Orchestrator).
  // Safe to unconditionally call: the function is no-op when AI_AGENTS_API_KEY
  // is unset or AI_CRON_ENABLED=false. No user traffic is affected.
  startAiAgentsCron();
});
