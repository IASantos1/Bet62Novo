// Shared agent-execution helpers, factored out of routes/adminAiAgents.ts
// so the exact same code path backs both the admin REST routes (buttons in
// the "IA Operações" panel) and the natural-language console (console.ts,
// user request 2026-08-11 — "BET62 Brain"). The console must never
// re-derive or shortcut any of this: a typed command can only ever trigger
// the same agent runs / proposal approvals a human clicking the
// equivalent button already could.
import type { AgentRole } from "./types.js";
import type { AiAgentProposal, AiAgentRun } from "@workspace/db";
import { AGENT_REGISTRY } from "./roles/index.js";
import { runOrchestrator, type OrchestratorResult } from "./orchestrator.js";
import { recordRun, createProposals, getProposal, markProposalStatus } from "./proposals.js";
import { executeProposal, autoExecuteIfEligible } from "./executor.js";

export type RunSingleAgentResult =
  | { role: AgentRole; orchestrator: true; result: OrchestratorResult }
  | { role: AgentRole; orchestrator: false; run: AiAgentRun; findings: Array<{ description: string; severity: string }>; proposals: AiAgentProposal[] };

export async function runSingleAgent(role: AgentRole, triggeredBy: string | null): Promise<RunSingleAgentResult> {
  if (role === "orchestrator") {
    const result = await runOrchestrator(triggeredBy);
    return { role, orchestrator: true, result };
  }

  const startedAt = Date.now();
  const result = await AGENT_REGISTRY[role]();
  const durationMs = Date.now() - startedAt;

  if (result === null) {
    const run = await recordRun({
      role,
      trigger: "manual",
      triggeredBy,
      status: "skipped",
      summary: "Sem resposta da IA (AI_AGENTS_API_KEY não configurada, ou falha na chamada — ver logs).",
      proposalsCreated: 0,
      durationMs,
    });
    return { role, orchestrator: false, run, findings: [], proposals: [] };
  }

  const run = await recordRun({
    role,
    trigger: "manual",
    triggeredBy,
    status: "ok",
    summary: result.summary,
    proposalsCreated: result.proposals.length,
    durationMs,
  });
  const createdProposals = await createProposals(role, run.id, result.proposals);
  const proposals = await autoExecuteIfEligible(createdProposals);

  return { role, orchestrator: false, run, findings: result.findings, proposals };
}

export type ProposalDecisionResult = { ok: boolean; proposal?: AiAgentProposal; error?: string };

export async function approveProposal(id: number, adminUsername: string): Promise<ProposalDecisionResult> {
  const proposal = await getProposal(id);
  if (!proposal) return { ok: false, error: "Proposta não encontrada" };
  if (proposal.status !== "pending") return { ok: false, error: `Proposta já foi processada (estado: ${proposal.status})` };

  await markProposalStatus({ id, status: "approved", reviewedBy: adminUsername });
  const execResult = await executeProposal(proposal, adminUsername);
  const updated = await markProposalStatus({
    id,
    status: execResult.ok ? "executed" : "failed",
    reviewedBy: adminUsername,
    executionError: execResult.ok ? null : (execResult.error ?? "Erro desconhecido"),
  });

  if (!execResult.ok) return { ok: false, error: execResult.error, proposal: updated ?? proposal };
  return { ok: true, proposal: updated ?? proposal };
}

export async function rejectProposal(id: number, adminUsername: string): Promise<ProposalDecisionResult> {
  const proposal = await getProposal(id);
  if (!proposal) return { ok: false, error: "Proposta não encontrada" };
  if (proposal.status !== "pending") return { ok: false, error: `Proposta já foi processada (estado: ${proposal.status})` };

  const updated = await markProposalStatus({ id, status: "rejected", reviewedBy: adminUsername });
  return { ok: true, proposal: updated ?? proposal };
}
