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
import { AGENT_REGISTRY } from "../lib/aiAgents/roles/index.js";
import { runOrchestrator } from "../lib/aiAgents/orchestrator.js";
import { recordRun, createProposals, listProposals, listRuns, getProposal, markProposalStatus } from "../lib/aiAgents/proposals.js";
import { executeProposal, autoExecuteIfEligible } from "../lib/aiAgents/executor.js";

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
    if (role === "orchestrator") {
      const report = await runOrchestrator(req.admin?.username ?? null);
      res.json({ role, orchestrator: true, ...report });
      return;
    }

    const startedAt = Date.now();
    const result = await AGENT_REGISTRY[role]();
    const durationMs = Date.now() - startedAt;

    if (result === null) {
      const run = await recordRun({
        role,
        trigger: "manual",
        triggeredBy: req.admin?.username ?? null,
        status: "skipped",
        summary: "Sem resposta da IA (ANTHROPIC_API_KEY não configurada, ou falha na chamada — ver logs).",
        proposalsCreated: 0,
        durationMs,
      });
      res.json({ role, run, findings: [], proposals: [] });
      return;
    }

    const run = await recordRun({
      role,
      trigger: "manual",
      triggeredBy: req.admin?.username ?? null,
      status: "ok",
      summary: result.summary,
      proposalsCreated: result.proposals.length,
      durationMs,
    });
    const createdProposals = await createProposals(role, run.id, result.proposals);
    const proposals = await autoExecuteIfEligible(createdProposals);

    res.json({ role, run, findings: result.findings, proposals });
  } catch (err) {
    logger.error({ err, role }, "POST /api/admin/ai-agents/run/:role error");
    res.status(500).json({ error: "Erro ao correr o agente" });
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
    const proposal = await getProposal(id);
    if (!proposal) {
      res.status(404).json({ error: "Proposta não encontrada" });
      return;
    }
    if (proposal.status !== "pending") {
      res.status(409).json({ error: "Proposta já foi processada", status: proposal.status });
      return;
    }

    await markProposalStatus({ id, status: "approved", reviewedBy: adminUsername });

    const execResult = await executeProposal(proposal, adminUsername);
    const updated = await markProposalStatus({
      id,
      status: execResult.ok ? "executed" : "failed",
      reviewedBy: adminUsername,
      executionError: execResult.ok ? null : (execResult.error ?? "Erro desconhecido"),
    });

    if (!execResult.ok) {
      res.status(500).json({ error: `Proposta aprovada mas falhou ao aplicar: ${execResult.error}`, proposal: updated });
      return;
    }

    res.json({ proposal: updated });
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
    const proposal = await getProposal(id);
    if (!proposal) {
      res.status(404).json({ error: "Proposta não encontrada" });
      return;
    }
    if (proposal.status !== "pending") {
      res.status(409).json({ error: "Proposta já foi processada", status: proposal.status });
      return;
    }

    const updated = await markProposalStatus({
      id,
      status: "rejected",
      reviewedBy: req.admin?.username ?? "admin",
    });
    res.json({ proposal: updated });
  } catch (err) {
    logger.error({ err, id }, "POST /api/admin/ai-agents/proposals/:id/reject error");
    res.status(500).json({ error: "Erro ao rejeitar proposta" });
  }
});

export default router;
