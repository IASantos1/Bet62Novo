// Cron-like scheduler for the internal AI operations agents.
//
// DESIGN:
//   - No external cron/queue dependency. Uses a lightweight self-scheduling
//     setTimeout loop (same pattern as startSettlementWorker).
//   - Only runs if AI_AGENTS_API_KEY is actually set (no-op otherwise,
//     benign fail-closed, no logs flood).
//   - Environment-tunable intervals; defaults are conservative
//     (e.g. payments/compliance every 6h, not every 15m, because those
//     queues grow slowly and human review is the bottleneck anyway).
//   - Each cycle also runs the Orchestrator a couple of times per day to
//     produce an executive summary visible in the admin panel.
//   - Overlap-safe: every run is guarded by an in-memory "currently
//     running" flag. If a previous invocation is still running, the
//     trigger is skipped (logged) rather than queued up — this matters
//     because the orchestrator itself takes ~30-60s to run 10+ sub-agents.
//
// Env vars (all optional, with safe defaults):
//   AI_CRON_ENABLED              = "true" | "false"   — default: "true" if AI_AGENTS_API_KEY is set
//   AI_CRON_PAYMENTS_INTERVAL_MS   default: 6 * 60 * 60 * 1000  (6h)
//   AI_CRON_COMPLIANCE_INTERVAL_MS default: 6 * 60 * 60 * 1000  (6h)
//   AI_CRON_RISK_INTERVAL_MS       default: 1 * 60 * 60 * 1000  (1h)
//   AI_CRON_ODDS_INTERVAL_MS       default: 30 * 60 * 1000       (30m)  — catches stuck feeds fast
//   AI_CRON_FRAUD_INTERVAL_MS      default: 12 * 60 * 60 * 1000 (12h)
//   AI_CRON_SUPPORT_INTERVAL_MS    default: 2 * 60 * 60 * 1000  (2h)
//   AI_CRON_LIVEMATCH_INTERVAL_MS  default: 15 * 60 * 1000       (15m) — stale live cleanup
//   AI_CRON_PREMATCH_INTERVAL_MS   default: 6 * 60 * 60 * 1000  (6h)
//   AI_CRON_SETTLEMENT_INTERVAL_MS default: 3 * 60 * 60 * 1000  (3h)
//   AI_CRON_TICKETSETTLE_INTERVAL_MS default: 1 * 60 * 60 * 1000 (1h) — catches stuck bets
//   AI_CRON_ORCHESTRATOR_INTERVAL_MS default: 8 * 60 * 60 * 1000 (8h, ~3x/dia)
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";
import { isAgentRole, type AgentRole } from "./aiAgents/types.js";
import { runSingleAgent } from "./aiAgents/runner.js";
import type {
  RunSingleAgentResult } from "./aiAgents/runner.js";

type RunningFlags = Partial<Record<AgentRole | "orchestrator", boolean>>;
const currentlyRunning: RunningFlags = {};

function parseIntervalMs(
  envName: string,
  fallbackMs: number,
  minMs: number,
): number {
  const raw = process.env[envName];
  if (!raw) return fallbackMs;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < minMs) {
    logger.error(
      { key: envName, raw, fallbackMs, minMs },
      "Invalid ai-agents cron interval env; using fallback",
    );
    return fallbackMs;
  }
  return n;
}

const INTERVALS: { role: Exclude<AgentRole, "orchestrator"> | "orchestrator"; env: string; defaultMs: number; minMs: number }[] = [
  { role: "odds",            env: "AI_CRON_ODDS_INTERVAL_MS",            defaultMs: 30 * 60 * 1000,            minMs: 5 * 60 * 1000 },
  { role: "livematch",       env: "AI_CRON_LIVEMATCH_INTERVAL_MS",       defaultMs: 15 * 60 * 1000,            minMs: 5 * 60 * 1000 },
  { role: "risk",            env: "AI_CRON_RISK_INTERVAL_MS",            defaultMs: 60 * 60 * 1000,            minMs: 15 * 60 * 1000 },
  { role: "ticketsettlement", env: "AI_CRON_TICKETSETTLE_INTERVAL_MS",   defaultMs: 60 * 60 * 1000,            minMs: 15 * 60 * 1000 },
  { role: "settlement",      env: "AI_CRON_SETTLEMENT_INTERVAL_MS",      defaultMs: 3 * 60 * 60 * 1000,        minMs: 60 * 60 * 1000 },
  { role: "support",         env: "AI_CRON_SUPPORT_INTERVAL_MS",         defaultMs: 2 * 60 * 60 * 1000,        minMs: 60 * 60 * 1000 },
  { role: "payments",        env: "AI_CRON_PAYMENTS_INTERVAL_MS",        defaultMs: 6 * 60 * 60 * 1000,        minMs: 60 * 60 * 1000 },
  { role: "compliance",      env: "AI_CRON_COMPLIANCE_INTERVAL_MS",      defaultMs: 6 * 60 * 60 * 1000,        minMs: 60 * 60 * 1000 },
  { role: "prematch",        env: "AI_CRON_PREMATCH_INTERVAL_MS",        defaultMs: 6 * 60 * 60 * 1000,        minMs: 60 * 60 * 1000 },
  { role: "fraud",           env: "AI_CRON_FRAUD_INTERVAL_MS",           defaultMs: 12 * 60 * 60 * 1000,       minMs: 60 * 60 * 1000 },
  { role: "orchestrator",    env: "AI_CRON_ORCHESTRATOR_INTERVAL_MS",    defaultMs: 8 * 60 * 60 * 1000,        minMs: 2 * 60 * 60 * 1000 },
];

async function runGuarded(role: AgentRole | "orchestrator"): Promise<void> {
  const roleOk = role === "orchestrator" || isAgentRole(role);
  if (!roleOk) return;
  if (currentlyRunning[role]) {
    logger.debug({ role }, "[aiCron] skipping: previous run still in progress");
    return;
  }
  currentlyRunning[role] = true;
  try {
    const outcome = await runSingleAgent(role as AgentRole, "system:cron");
    // Cast necessário: com strict=false o TypeScript não reduz a union
    // RunSingleAgentResult via boolean check. Mesmo padrão usado em
    // routes/adminAiAgents.ts e console.ts.
    const res = outcome as unknown as {
      orchestrator: boolean;
      result?: { totalProposalsCreated?: number };
      proposals?: unknown[];
    };
    const proposalsCreated = res.orchestrator
      ? (res.result?.totalProposalsCreated ?? 0)
      : (res.proposals?.length ?? 0);
    logger.info(
      { role, proposalsCreated, orchestrator: res.orchestrator },
      "[aiCron] agent run completed",
    );
  } catch (err) {
    logger.error({ err, role }, "[aiCron] agent run failed");
  } finally {
    currentlyRunning[role] = false;
  }
}

function startScheduler() {
  for (const def of INTERVALS) {
    const intervalMs = parseIntervalMs(def.env, def.defaultMs, def.minMs);
    const tick = async () => {
      await runGuarded(def.role);
    };
    // First run delayed by 1/10 of the interval (not immediately at startup,
    // to avoid stampede with the settlement worker + WS connections).
    const firstRunDelay = Math.max(5_000, Math.floor(intervalMs / 10));
    setTimeout(() => {
      void tick().finally(() => {
        setInterval(() => {
          void tick();
        }, intervalMs);
      });
    }, firstRunDelay);
    logger.info(
      { role: def.role, intervalMs, firstRunDelay },
      "[aiCron] scheduled",
    );
  }
}

export function startAiAgentsCron(): void {
  const explicitlyDisabled =
    process.env.AI_CRON_ENABLED !== undefined &&
    String(process.env.AI_CRON_ENABLED).toLowerCase() === "false";
  if (explicitlyDisabled) {
    logger.info("[aiCron] disabled via AI_CRON_ENABLED=false");
    return;
  }
  if (!CONFIG.AI_AGENTS_API_KEY) {
    logger.info("[aiCron] not starting — AI_AGENTS_API_KEY is not set");
    return;
  }
  startScheduler();
}
