// Payments Agent — reviews withdrawals sitting in "pending_review", using
// the exact same risk-flag data an admin sees in the withdrawals panel
// (buildWithdrawalRiskFlags, routes/withdrawals.ts — computed at request
// time and stored on the row). Proposes approve_withdrawal /
// reject_withdrawal / flag_for_human_review — all of which stay "pending"
// until an admin approves the proposal (executor.ts then calls the same
// applyWithdrawalAdminDecision used by the human-facing admin panel, so
// there is exactly one code path that actually moves money).
import { db, withdrawalsTable, usersTable, betsTable } from "@workspace/db";
import { eq, and, ne, count } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Pagamentos (Payments Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Recebes pedidos de levantamento pendentes de revisão, com os risk_flags já calculados automaticamente (ex.: conta recente, depósito recente, valor elevado, levantamento acima dos depósitos históricos).
A tua função é propor "approve_withdrawal", "reject_withdrawal" ou, quando o caso é ambíguo e precisa de mais contexto humano, "flag_for_human_review" — em todos os casos (targetType "withdrawal", targetId = id do levantamento).
IMPORTANTE: mesmo "approve_withdrawal" NUNCA é aplicado automaticamente nesta plataforma — fica sempre pendente até um humano aprovar explicitamente a tua proposta. Não sejas complacente com risk_flags de severidade "high": nesses casos, o mais correto é normalmente "flag_for_human_review" em vez de aprovar ou rejeitar sozinho, a menos que a justificação seja muito clara.`;

export async function runPaymentsAgent(): Promise<AgentAnalysisResult | null> {
  const pending = await db
    .select({
      id: withdrawalsTable.id,
      userId: withdrawalsTable.userId,
      amount: withdrawalsTable.amount,
      riskFlags: withdrawalsTable.riskFlags,
      createdAt: withdrawalsTable.createdAt,
      userName: usersTable.name,
      userBalance: usersTable.balance,
      kycStatus: usersTable.kycStatus,
      userCreatedAt: usersTable.createdAt,
    })
    .from(withdrawalsTable)
    .innerJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
    .where(eq(withdrawalsTable.status, "pending_review"))
    .orderBy(withdrawalsTable.createdAt)
    .limit(15);

  if (pending.length === 0) {
    return { summary: "Sem levantamentos pendentes de revisão.", findings: [], proposals: [] };
  }

  const withHistory = await Promise.all(
    pending.map(async (w) => {
      const [{ settledCount }] = await db
        .select({ settledCount: count() })
        .from(betsTable)
        .where(and(eq(betsTable.userId, w.userId), ne(betsTable.status, "pending")));
      return { ...w, settledBetCount: Number(settledCount) };
    }),
  );

  return runAgentAnalysis({
    role: "payments",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: { pendingWithdrawals: withHistory },
  });
}
