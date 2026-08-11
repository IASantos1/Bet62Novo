// Risk Agent — monitors concentration of open (pending) betting exposure.
// There is still no per-match stake-limit lever in the schema (only a
// per-COMPETITION multiplier, competition_configs.stakeLimitMultiplier —
// touching that for one over-exposed match would throttle every other
// match in the same competition too, a far bigger blast radius than
// intended), so this agent does NOT get a limit/margin-editing action.
//
// Real execution authority it DOES get (user request, 2026-08-11, same
// bounded design as the Odds agent): "suspend_event" — reusing the exact
// same safe-direction-only lever (event_admin_overrides.forceSuspend=true,
// see roles/odds.ts and executor.ts's AUTO_EXECUTE_PAIRS) instead of
// inventing a second one. Stopping all further stakes on one specific
// match is a strictly more conservative, more surgical response to
// dangerous concentration than reducing a whole competition's limits
// would have been — and it's the exact same lever a human trader already
// has in the admin-pro panel, fully reversible from there.
import { db, betsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Risco (Risk Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é analisar a exposição atual em apostas pendentes (ainda não liquidadas) e identificar concentração de risco por evento — ou seja, eventos onde, se um resultado específico acontecer, a casa paga um valor desproporcional face ao volume normal.
Não tens autoridade para alterar odds, margens ou limites de aposta — isso não existe como ação automatizável nesta plataforma para um único evento (só existe por competição inteira, o que seria afetar demasiados jogos por causa de um só). TENS autoridade real para SUSPENDER um evento específico: usa "suspend_event" (targetType "match", targetId = matchId) quando a concentração de exposição nesse evento é claramente perigosa — muito acima do resto da lista, não apenas o primeiro de 15. Suspender pára novas apostas nesse evento até um humano rever; é reversível a qualquer momento no painel de admin.
Para tudo o resto (concentração notável mas não claramente perigosa), a tua ação é "flag_for_human_review" (targetType "match", targetId = matchId).
Sê conservador: "suspend_event" tem um custo de negócio real (pára receita nesse evento), por isso reserva-o para os casos claramente anómalos, não qualquer evento no topo da lista.`;

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
