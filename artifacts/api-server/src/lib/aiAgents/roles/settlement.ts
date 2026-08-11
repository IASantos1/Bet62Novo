// Settlement Agent — reviews items already sitting in the existing manual
// review queue (manual_review_queue, routes/manualReview.ts) and drafts a
// recommendation for the human reviewer.
//
// Deliberately does NOT get an actionType that flips a bet's outcome.
// Settlement is already handled by a deterministic, tested pipeline
// (settlement.ts / settlementQueue.ts) with its own human-approval queue —
// this agent's only action is "annotate_review_queue", which writes its
// recommendation into that existing queue's notes field for the human to
// read before they click approve/reject there. Two competing approval
// paths for something this financially sensitive would be a correctness
// regression, not an improvement.
import { db, manualReviewQueueTable, betsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Liquidação (Settlement Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Recebes uma lista de apostas na fila de revisão manual (settlement_result já calculado automaticamente, mas sinalizado para confirmação humana antes de aplicar).
A tua função é analisar cada item e escrever uma recomendação clara (concordas com o resultado proposto? haveria motivo para anular/reembolsar em vez disso?).
IMPORTANTE: não tens autoridade para liquidar apostas — isso é feito exclusivamente pelo pipeline de liquidação determinístico existente, com aprovação humana na mesma fila. A tua única ação possível é "annotate_review_queue" (targetType "bet", targetId = betId), que apenas escreve a tua recomendação como nota para o humano ler antes de decidir — nunca aprova nem rejeita a aposta por ti.`;

export async function runSettlementAgent(): Promise<AgentAnalysisResult | null> {
  const pendingItems = await db
    .select({
      queueId: manualReviewQueueTable.id,
      betId: manualReviewQueueTable.betId,
      matchId: manualReviewQueueTable.matchId,
      reason: manualReviewQueueTable.reason,
      priority: manualReviewQueueTable.priority,
      settlementResult: manualReviewQueueTable.settlementResult,
      createdAt: manualReviewQueueTable.createdAt,
      matchTitle: betsTable.matchTitle,
      selections: betsTable.selections,
      stake: betsTable.stake,
      potentialWin: betsTable.potentialWin,
      betStatus: betsTable.status,
    })
    .from(manualReviewQueueTable)
    .innerJoin(betsTable, eq(manualReviewQueueTable.betId, betsTable.id))
    .where(eq(manualReviewQueueTable.status, "pending"))
    .orderBy(manualReviewQueueTable.createdAt)
    .limit(15);

  if (pendingItems.length === 0) {
    return { summary: "Fila de revisão manual de liquidação está vazia.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "settlement",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: { pendingReviewItems: pendingItems },
  });
}
