// Bilhete (Ticket) Settlement Agent — evaluates and finalizes stuck
// pending bets. Two-stage, defence-in-depth design:
//
// 1. Runs the existing deterministic recovery job (jobs/settlementRecovery.ts)
//    first — it re-attempts the exact same tested settleBet() pipeline used
//    for normal settlement on any bet stuck "pending" for 3h+. That job
//    already existed in the codebase but was never scheduled/called
//    anywhere, so this agent is what actually wires it into use. Anything
//    resolvable this way (a leg's result finally arrived) gets settled with
//    zero AI involvement.
// 2. For bets STILL pending after that fresh deterministic pass — meaning
//    the settlement engine genuinely cannot derive an outcome (typically:
//    the event was abandoned/cancelled/postponed and no result will ever
//    arrive) — the model reviews the match data and decides whether it's safe
//    to force-void (refund the stake) so the customer's money isn't frozen
//    forever.
//
// By explicit user request (2026-08-11, follow-up to the platform's
// general "só propõe, humano aprova" rule): finalize_bet_settlement
// proposals from this role auto-execute immediately — see
// executor.ts's autoExecuteIfEligible/isAutoExecuteEligible, which is
// gated to this exact role + actionType only. To keep that safe despite
// running without human review, the action can ONLY ever refund a stake
// (settleBet's forceVoidReason path) — it can never invent a win amount,
// so a wrong call here costs at most the house's own margin on that one
// bet, never someone else's money.
import { db, betsTable, matchResultsTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";
import { runSettlementRecovery } from "../../../jobs/settlementRecovery.js";

const STUCK_THRESHOLD_MS = 3 * 60 * 60 * 1000; // matches jobs/settlementRecovery.ts's own threshold

const SYSTEM_PROMPT = `És o Agente de Liquidação de Bilhetes (Ticket Settlement Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Recebes uma lista de bilhetes (apostas) que continuam "pending" horas depois do início do evento, e que o motor de liquidação determinístico já tentou resolver de novo mesmo agora e continua sem conseguir — ou seja, não é uma questão de esperar mais um pouco, é um bilhete genuinamente preso.
A tua função é avaliar, para cada bilhete, se há evidência clara de que o(s) evento(s) associados nunca vão produzir um resultado (evento abandonado, cancelado, ou sem qualquer dado de resultado muito tempo depois do início previsto) — nesse caso, o correto é anular o bilhete e devolver a aposta ao cliente, para o dinheiro não ficar preso indefinidamente.
IMPORTANTE: a tua única ação possível é "finalize_bet_settlement" (targetType "bet", targetId = betId), e ela SÓ pode anular e reembolsar — nunca podes decidir que um bilhete "ganhou" ou "perdeu" nem inventar um valor de pagamento; isso continua a ser calculado exclusivamente pelo motor determinístico com dados reais de resultado. Se não tiveres a certeza de que o evento nunca vai resolver, não proponhas nada para esse bilhete — subestimar é sempre mais seguro que anular um bilhete que ainda podia resolver-se corretamente.`;

export async function runTicketSettlementAgent(): Promise<AgentAnalysisResult | null> {
  await runSettlementRecovery();

  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const stuckBets = await db
    .select({
      id: betsTable.id,
      matchId: betsTable.matchId,
      matchTitle: betsTable.matchTitle,
      selections: betsTable.selections,
      stake: betsTable.stake,
      kickoffTime: betsTable.kickoffTime,
      updatedAt: betsTable.updatedAt,
    })
    .from(betsTable)
    .where(
      and(
        eq(betsTable.status, "pending"),
        lt(betsTable.updatedAt, stuckCutoff),
        isNotNull(betsTable.kickoffTime),
        lt(betsTable.kickoffTime, stuckCutoff),
      ),
    )
    .limit(15);

  if (stuckBets.length === 0) {
    return { summary: "Sem bilhetes presos — recuperação determinística não encontrou nada por resolver.", findings: [], proposals: [] };
  }

  const matchIds = [...new Set(stuckBets.map((b) => b.matchId))];
  const results = matchIds.length > 0
    ? await db
        .select({
          matchId: matchResultsTable.matchId,
          status: matchResultsTable.status,
          home: matchResultsTable.home,
          away: matchResultsTable.away,
          finishedAt: matchResultsTable.finishedAt,
        })
        .from(matchResultsTable)
        .where(inArray(matchResultsTable.matchId, matchIds))
    : [];
  const resultsByMatchId = new Map(results.map((r) => [r.matchId, r]));

  return runAgentAnalysis({
    role: "ticketsettlement",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: {
      description: "Bilhetes pending há mais de 3h desde o kickoff, que o motor de liquidação acabou de tentar resolver de novo e continua sem conseguir.",
      stuckBets: stuckBets.map((b) => ({
        betId: b.id,
        matchId: b.matchId,
        matchTitle: b.matchTitle,
        stake: b.stake,
        kickoffTime: b.kickoffTime,
        hoursSinceKickoff: b.kickoffTime ? Number(((Date.now() - b.kickoffTime.getTime()) / 3_600_000).toFixed(1)) : null,
        selections: b.selections,
        matchResult: resultsByMatchId.get(b.matchId) ?? null,
      })),
    },
  });
}
