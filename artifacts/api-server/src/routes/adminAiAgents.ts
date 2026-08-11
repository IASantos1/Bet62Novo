// Admin routes for the internal AI-operations agent system (CEO/
// Orchestrator, Risk, Odds, Settlement, Fraud, Payments, Compliance,
// Support). Binding constraint (user request, 2026-08-11 — "só propõe,
// humano aprova"): every proposal that touches money or compliance state
// is created "pending" and is ONLY ever applied via the /approve route
// below, which calls executor.ts. No route here lets an agent act
// directly on money/account/compliance state.
import { Router, type IRouter, type Response } from "express";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth.js";
import { logger } from "../lib/logger.js";
import { AGENT_ROLES, isAgentRole } from "../lib/aiAgents/types.js";
import { listProposals, listRuns } from "../lib/aiAgents/proposals.js";
import { runSingleAgent, approveProposal, rejectProposal } from "../lib/aiAgents/runner.js";
import { runConsoleCommand } from "../lib/aiAgents/console.js";

const router: IRouter = Router();

router.get("/ai-agents/roles", adminMiddleware, (_req: AdminRequest, res: Response) => {
  res.json({ roles: AGENT_ROLES });
});

// POST /api/admin/ai-agents/run/:role — trigger a single agent (or
// "orchestrator" to run all of them + an executive summary).
router.post("/ai-agents/run/:role", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const role = String(req.params["role"]);
  if (!isAgentRole(role)) {
    res.status(400).json({ error: "Agente desconhecido" });
    return;
  }

  try {
    const outcome = await runSingleAgent(role, req.admin?.username ?? null);
    if (outcome.orchestrator) {
      res.json({ role, orchestrator: true, ...outcome.result });
      return;
    }
    // Narrowing via the implicit negative branch doesn't eliminate the
    // other union member under this package's tsconfig (strict: false —
    // see the identical note in routes/withdrawals.ts) — cast explicitly.
    const single = outcome as Extract<typeof outcome, { orchestrator: false }>;
    res.json({ role, run: single.run, findings: single.findings, proposals: single.proposals });
  } catch (err) {
    logger.error({ err, role }, "POST /api/admin/ai-agents/run/:role error");
    res.status(500).json({ error: "Erro ao correr o agente" });
  }
});

// POST /api/admin/ai-agents/console — the "BET62 Brain" natural-language
// panel (user request, 2026-08-11): an admin types a command in Portuguese
// and the model maps it to one of a small, fixed set of safe tools
// (console.ts) — it can never invent SQL or an arbitrary action, only pick
// from that allow-list. Every tool just calls the exact same functions the
// REST routes above already use, so a typed command has no more power than
// the equivalent button in this same panel.
router.post("/ai-agents/console", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Mensagem em falta" });
    return;
  }
  try {
    const result = await runConsoleCommand(message, req.admin?.username ?? "admin");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /api/admin/ai-agents/console error");
    res.status(500).json({ error: "Erro ao processar o comando" });
  }
});

// GET /api/admin/ai-agents/proposals?status=pending&role=payments
router.get("/ai-agents/proposals", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const status = typeof req.query["status"] === "string" ? req.query["status"] : "pending";
    const role = typeof req.query["role"] === "string" ? req.query["role"] : undefined;
    const proposals = await listProposals({ status, role });
    res.json({ proposals });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/ai-agents/proposals error");
    res.status(500).json({ error: "Erro ao carregar propostas" });
  }
});

router.get("/ai-agents/runs", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const runs = await listRuns(50);
    res.json({ runs });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/ai-agents/runs error");
    res.status(500).json({ error: "Erro ao carregar histórico de execuções" });
  }
});

// POST /api/admin/ai-agents/proposals/:id/approve — the ONLY route that
// causes a proposal's actionType to actually execute (executor.ts).
router.post("/ai-agents/proposals/:id/approve", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const adminUsername = req.admin?.username ?? "admin";

  try {
    const result = await approveProposal(id, adminUsername);
    if (!result.ok) {
      const status = result.error === "Proposta não encontrada" ? 404 : result.proposal ? 500 : 409;
      res.status(status).json({ error: result.error, proposal: result.proposal });
      return;
    }
    res.json({ proposal: result.proposal });
  } catch (err) {
    logger.error({ err, id }, "POST /api/admin/ai-agents/proposals/:id/approve error");
    res.status(500).json({ error: "Erro ao aprovar proposta" });
  }
});

router.post("/ai-agents/proposals/:id/reject", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const result = await rejectProposal(id, req.admin?.username ?? "admin");
    if (!result.ok) {
      res.status(result.error === "Proposta não encontrada" ? 404 : 409).json({ error: result.error });
      return;
    }
    res.json({ proposal: result.proposal });
  } catch (err) {
    logger.error({ err, id }, "POST /api/admin/ai-agents/proposals/:id/reject error");
    res.status(500).json({ error: "Erro ao rejeitar proposta" });
  }
});

export default router;
