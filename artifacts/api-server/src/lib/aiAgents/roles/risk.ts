// Risk Agent — monitors concentration of open (pending) betting exposure.
// Read-only: there is no per-match stake-limit table in the schema to
// action against, so this agent never proposes a money-moving change on
// its own — it surfaces concentration to a human via flag_for_human_review
// (targetType "match"), which is the correct scope for what real data
// exists today.
import { db, betsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Risco (Risk Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é analisar a exposição atual em apostas pendentes (ainda não liquidadas) e identificar concentração de risco por evento — ou seja, eventos onde, se um resultado específico acontecer, a casa paga um valor desproporcional face ao volume normal.
Não tens autoridade para alterar odds, margens ou limites de aposta — isso não existe como ação automatizável nesta plataforma. A tua única ação possível é "flag_for_human_review" (targetType "match", targetId = matchId), para o trader humano decidir se quer, por exemplo, reduzir limites manualmente nesse evento.
Sê conservador: só assinala eventos onde a exposição é claramente anómala face aos restantes, não qualquer evento com apostas pendentes.`;

export async function runRiskAgent(): Promise<AgentAnalysisResult | null> {
  const exposureByMatch = await db
    .select({
      matchId: betsTable.matchId,
      matchTitle: betsTable.matchTitle,
      pendingBetCount: sql<number>`count(*)`,
      totalStake: sql<string>`sum(${betsTable.stake})`,
      totalPotentialPayout: sql<string>`sum(${betsTable.potentialWin})`,
      maxSingleStake: sql<string>`max(${betsTable.stake})`,
    })
    .from(betsTable)
    .where(eq(betsTable.status, "pending"))
    .groupBy(betsTable.matchId, betsTable.matchTitle)
    .orderBy(sql`sum(${betsTable.potentialWin}) desc`)
    .limit(15);

  if (exposureByMatch.length === 0) {
    return { summary: "Sem apostas pendentes de momento.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "risk",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: {
      description: "Top 15 eventos por payout potencial total em apostas pendentes (ainda não liquidadas).",
      exposureByMatch,
    },
  });
}
