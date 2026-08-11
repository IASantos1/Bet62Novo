// Support Agent — drafts a plain-language customer explanation for recent
// negative decisions (KYC rejection, withdrawal rejection) an affected user
// received. There is no ticketing/messaging system in this codebase, so
// "executing" a draft_support_reply proposal doesn't send anything — the
// value is the draft text itself (in payload.message), which a human
// support agent can copy into whatever channel they use (email, in-app,
// etc.) once they approve it. This agent never contacts a user directly.
import { db, withdrawalsTable, kycDocumentsTable, usersTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Suporte (Support Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Recebes uma lista de levantamentos rejeitados e documentos KYC rejeitados recentemente. A tua função é redigir, para cada um, uma explicação clara, empática e em português europeu, adequada para o cliente ler, explicando o motivo da rejeição e o que pode fazer a seguir (ex.: resubmeter documento com melhor qualidade, corrigir dados).
NUNCA reveles informação de outro utilizador. NUNCA prometas prazos ou exceções que não estão nos dados fornecidos.
A tua única ação possível é "draft_support_reply" (targetType "user", targetId = id do utilizador, payload.message = o texto redigido, payload.context = "kyc_rejected" ou "withdrawal_rejected"). Isto nunca envia nada automaticamente — fica pendente para um humano rever e enviar pelo canal apropriado.`;

export async function runSupportAgent(): Promise<AgentAnalysisResult | null> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [rejectedWithdrawals, rejectedKyc] = await Promise.all([
    db
      .select({
        id: withdrawalsTable.id,
        userId: withdrawalsTable.userId,
        amount: withdrawalsTable.amount,
        decisionReason: withdrawalsTable.decisionReason,
        reviewedAt: withdrawalsTable.reviewedAt,
        userName: usersTable.name,
      })
      .from(withdrawalsTable)
      .innerJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
      .where(and(eq(withdrawalsTable.status, "rejected"), gte(withdrawalsTable.updatedAt, since7d)))
      .limit(15),
    db
      .select({
        id: kycDocumentsTable.id,
        userId: kycDocumentsTable.userId,
        kind: kycDocumentsTable.kind,
        reviewedAt: kycDocumentsTable.reviewedAt,
        userName: usersTable.name,
      })
      .from(kycDocumentsTable)
      .innerJoin(usersTable, eq(kycDocumentsTable.userId, usersTable.id))
      .where(and(eq(kycDocumentsTable.status, "rejected"), gte(kycDocumentsTable.reviewedAt, since7d)))
      .limit(15),
  ]);

  if (rejectedWithdrawals.length === 0 && rejectedKyc.length === 0) {
    return { summary: "Sem rejeições recentes de levantamentos ou KYC que necessitem de resposta ao cliente.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "support",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: { recentRejectedWithdrawals: rejectedWithdrawals, recentRejectedKycDocuments: rejectedKyc },
  });
}
