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
import { db, usersTable, manualReviewQueueTable, kycDocumentsTable, type AiAgentProposal } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { applyWithdrawalAdminDecision } from "../../routes/withdrawals.js";

export interface ExecutionResult {
  ok: boolean;
  error?: string;
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
