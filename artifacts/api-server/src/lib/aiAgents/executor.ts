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
import { db, usersTable, manualReviewQueueTable, kycDocumentsTable, betsTable, eventAdminOverridesTable, type AiAgentProposal } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { applyWithdrawalAdminDecision } from "../../routes/withdrawals.js";
import { settleBet } from "../../services/settlement/settleBet.js";
import { markProposalStatus } from "./proposals.js";

export interface ExecutionResult {
  ok: boolean;
  error?: string;
}

// The only (agentRole, actionType) pairs allowed to run without an admin
// clicking approve first — explicit, one-at-a-time user requests,
// 2026-08-11, each a deliberate follow-up to the platform's general "só
// propõe, humano aprova" rule:
//  - ticketsettlement/finalize_bet_settlement: "agente liquida sozinho,
//    sem aprovação" for stuck ticket settlement. Can only force a stake
//    refund, never invent a win payout (settleBet.ts's forceVoidReason).
//  - odds/suspend_event: real execution authority for the Odds agent to
//    protect the house when a live feed goes unstable. Can only turn
//    betting OFF (event_admin_overrides.forceSuspend=true, the same lever
//    routes/adminPro.ts already exposes to a human admin) — never
//    unsuspends, never touches odds/margin/RTP.
//  - risk/suspend_event: same lever, granted to the Risk agent for a
//    different trigger — a single event with clearly dangerous exposure
//    concentration in pending bets. Reuses the exact same safe-direction
//    action as odds/suspend_event (see roles/risk.ts) rather than a new
//    per-match stake-limit mechanism, which doesn't exist in this schema
//    (only a per-competition one, a much bigger blast radius).
// All entries are double-gated below: the actionType AND the agentRole
// must match together, so a bug in an unrelated role can never fall into
// this path, and every other agent's proposals keep requiring approval.
const AUTO_EXECUTE_PAIRS: ReadonlySet<string> = new Set([
  "ticketsettlement:finalize_bet_settlement",
  "odds:suspend_event",
  "risk:suspend_event",
]);

export function isAutoExecuteEligible(agentRole: string, actionType: string): boolean {
  return AUTO_EXECUTE_PAIRS.has(`${agentRole}:${actionType}`);
}

// Called right after a run creates its proposals (routes/adminAiAgents.ts,
// orchestrator.ts) — executes any auto-execute-eligible proposal
// immediately and records the outcome, instead of leaving it "pending"
// for /proposals/:id/approve like every other agent's proposals. Returns
// the input array with any auto-executed proposals replaced by their
// post-execution row, so callers can hand back accurate status in the
// same response instead of showing a stale "pending".
export async function autoExecuteIfEligible(proposals: AiAgentProposal[]): Promise<AiAgentProposal[]> {
  const result: AiAgentProposal[] = [];
  for (const proposal of proposals) {
    if (!isAutoExecuteEligible(proposal.agentRole, proposal.actionType)) {
      result.push(proposal);
      continue;
    }
    const execResult = await executeProposal(proposal, "sistema (auto-execução)");
    const updated = await markProposalStatus({
      id: proposal.id,
      status: execResult.ok ? "executed" : "failed",
      reviewedBy: `ai-agent:${proposal.agentRole} (auto)`,
      executionError: execResult.ok ? null : (execResult.error ?? "Erro desconhecido"),
    });
    result.push(updated ?? proposal);
  }
  return result;
}

// Shared by the "suspend_event" proposal action above and by the natural-
// language console's suspend_events_above_exposure tool (console.ts) —
// same underlying mutation either way: force-suspend one event via the
// event_admin_overrides lever routes/adminPro.ts already exposes to a
// human admin. Kept here (not duplicated) so there is exactly one place
// that writes this override.
export async function forceSuspendEvent(eventId: string, note: string, actor: string): Promise<void> {
  await db
    .insert(eventAdminOverridesTable)
    .values({ eventId, forceSuspend: true, overrideNote: note, updatedBy: actor })
    .onConflictDoUpdate({
      target: eventAdminOverridesTable.eventId,
      set: { forceSuspend: true, overrideNote: note, updatedBy: actor, updatedAt: new Date() },
    });
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

      case "suspend_event": {
        const eventId = proposal.targetId;
        if (!eventId) return { ok: false, error: "targetId de evento inválido" };
        await forceSuspendEvent(eventId, `[IA - ${proposal.agentRole}] ${proposal.reasoning}`, reviewedBy);
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
