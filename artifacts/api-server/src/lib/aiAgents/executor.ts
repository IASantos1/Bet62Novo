// Applies an APPROVED agent proposal. This is the only place in the AI
// agent system that touches money, account status, or compliance state —
// and it only ever runs after an admin has called
// POST /admin/ai-agents/proposals/:id/approve (routes/adminAiAgents.ts).
// No agent role calls this directly.
//
// Where a privileged mutation already exists elsewhere in the codebase
// (withdrawal decisions, in particular, involve a balance-hold/ledger
// transaction and customer emails — see applyWithdrawalAdminDecision in
// routes/withdrawals.ts), this reuses that exact function instead of
// re-deriving the money-moving logic a second time.
import { db, usersTable, manualReviewQueueTable, kycDocumentsTable, betsTable, type AiAgentProposal } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { applyWithdrawalAdminDecision } from "../../routes/withdrawals.js";
import { settleBet } from "../../services/settlement/settleBet.js";
import { markProposalStatus } from "./proposals.js";

export interface ExecutionResult {
  ok: boolean;
  error?: string;
}

// The one actionType allowed to run without an admin clicking approve
// first — explicit user request, 2026-08-11, follow-up to the "só propõe,
// humano aprova" rule specifically for stuck ticket settlement ("agente
// liquida sozinho, sem aprovação"). Double-gated in
// autoExecuteIfEligible below: both the actionType AND the agentRole must
// match, so a bug in an unrelated role can never fall into this path.
const AUTO_EXECUTE_ACTION_TYPES: ReadonlySet<string> = new Set(["finalize_bet_settlement"]);

export function isAutoExecuteEligible(agentRole: string, actionType: string): boolean {
  return agentRole === "ticketsettlement" && AUTO_EXECUTE_ACTION_TYPES.has(actionType);
}

// Called right after a "ticketsettlement" run creates its proposals
// (routes/adminAiAgents.ts, orchestrator.ts) — executes each
// finalize_bet_settlement proposal immediately and records the outcome,
// instead of leaving it "pending" for /proposals/:id/approve like every
// other agent's proposals. Returns the input array with any
// auto-executed proposals replaced by their post-execution row, so
// callers can hand back accurate status in the same response instead of
// showing a stale "pending".
export async function autoExecuteIfEligible(proposals: AiAgentProposal[]): Promise<AiAgentProposal[]> {
  const result: AiAgentProposal[] = [];
  for (const proposal of proposals) {
    if (!isAutoExecuteEligible(proposal.agentRole, proposal.actionType)) {
      result.push(proposal);
      continue;
    }
    const execResult = await executeProposal(proposal, "sistema (auto-liquidação)");
    const updated = await markProposalStatus({
      id: proposal.id,
      status: execResult.ok ? "executed" : "failed",
      reviewedBy: "ai-agent:ticketsettlement (auto)",
      executionError: execResult.ok ? null : (execResult.error ?? "Erro desconhecido"),
    });
    result.push(updated ?? proposal);
  }
  return result;
}

export async function executeProposal(proposal: AiAgentProposal, adminUsername: string): Promise<ExecutionResult> {
  const reviewedBy = `ai-agent:${proposal.agentRole} (aprovado por ${adminUsername})`;

  try {
    switch (proposal.actionType) {
      case "approve_withdrawal":
      case "reject_withdrawal": {
        const id = Number(proposal.targetId);
        if (!Number.isFinite(id)) return { ok: false, error: "targetId de levantamento inválido" };
        const result = await applyWithdrawalAdminDecision({
          id,
          status: proposal.actionType === "approve_withdrawal" ? "approved" : "rejected",
          reviewedBy,
          decisionReason: proposal.reasoning,
        });
        if (result.ok) return { ok: true };
        // See the matching comment in routes/withdrawals.ts — this
        // package's tsconfig (strict: false) doesn't narrow the other
        // union member via `!result.ok`, only via `if (result.ok) return`.
        const failure = result as { ok: false; httpStatus: number; error: string };
        return { ok: false, error: failure.error };
      }

      case "approve_kyc":
      case "reject_kyc": {
        const userId = Number(proposal.targetId);
        if (!Number.isFinite(userId)) return { ok: false, error: "targetId de utilizador inválido" };
        const kycStatus = proposal.actionType === "approve_kyc" ? "approved" : "rejected";
        const [updated] = await db
          .update(usersTable)
          .set({ kycStatus })
          .where(eq(usersTable.id, userId))
          .returning({ id: usersTable.id });
        if (!updated) return { ok: false, error: "Utilizador não encontrado" };
        const payload = (proposal.payload ?? {}) as { documentId?: number };
        if (payload.documentId) {
          await db
            .update(kycDocumentsTable)
            .set({ status: kycStatus, reviewedAt: new Date() })
            .where(eq(kycDocumentsTable.id, payload.documentId));
        }
        return { ok: true };
      }

      case "block_account":
      case "unblock_account": {
        const userId = Number(proposal.targetId);
        if (!Number.isFinite(userId)) return { ok: false, error: "targetId de utilizador inválido" };
        const selfExcludedUntil = proposal.actionType === "block_account" ? new Date("2099-12-31T23:59:59Z") : null;
        const [updated] = await db
          .update(usersTable)
          .set({ selfExcludedUntil })
          .where(eq(usersTable.id, userId))
          .returning({ id: usersTable.id });
        return updated ? { ok: true } : { ok: false, error: "Utilizador não encontrado" };
      }

      case "annotate_review_queue": {
        const betId = Number(proposal.targetId);
        if (!Number.isFinite(betId)) return { ok: false, error: "targetId de aposta inválido" };
        const note = `[IA - ${proposal.agentRole}] ${proposal.reasoning}`;
        const updated = await db
          .update(manualReviewQueueTable)
          .set({ notes: note, updatedAt: new Date() })
          .where(eq(manualReviewQueueTable.betId, betId))
          .returning({ id: manualReviewQueueTable.id });
        if (updated.length === 0) {
          return { ok: false, error: "Item da fila de revisão manual não encontrado para esta aposta" };
        }
        return { ok: true };
      }

      case "finalize_bet_settlement": {
        const betId = Number(proposal.targetId);
        if (!Number.isFinite(betId)) return { ok: false, error: "targetId de aposta inválido" };
        const [bet] = await db.select().from(betsTable).where(eq(betsTable.id, betId)).limit(1);
        if (!bet) return { ok: false, error: "Aposta não encontrada" };
        if (bet.status !== "pending") return { ok: true }; // already resolved elsewhere — nothing to do, not an error
        const decision = await settleBet({
          bet,
          trigger: "ai-agent:ticketsettlement",
          selections: Array.isArray(bet.selections) ? bet.selections : [],
          cycleId: `ai-agent:ticketsettlement:${proposal.id}`,
          forceVoidReason: proposal.reasoning,
        });
        // undefined means settleBet's own idempotency/optimistic-lock guard
        // caught a race (already settled elsewhere) — not a failure.
        void decision;
        return { ok: true };
      }

      // These two never change platform state on their own — the value was
      // already delivered when the proposal was created (a drafted reply
      // text for an admin to send manually, or a flagged item for a human
      // to look at). Approving one just acknowledges it as reviewed.
      case "draft_support_reply":
      case "flag_for_human_review":
        return { ok: true };

      default:
        return { ok: false, error: `Tipo de ação desconhecido: ${proposal.actionType}` };
    }
  } catch (err) {
    logger.error({ err, proposalId: proposal.id, actionType: proposal.actionType }, "[aiAgents] executeProposal failed");
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
