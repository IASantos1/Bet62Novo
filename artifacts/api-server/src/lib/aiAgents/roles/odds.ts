// Odds Agent — monitors market-suspension health: matches an admin has
// suspended for betting (suspended_matches) and how long they've been
// stuck, plus the recent rate of voided settlements (a proxy for
// suspension/odds-feed problems — see the 2026-08-11 sticky-cache TTL fix
// in routes/matches.ts, which was found exactly this way: an unusual void
// pattern on a narrow class of matches). Read-only signals; the only
// action available is flag_for_human_review, since there is no
// margin/RTP-adjustment mechanism in the schema to propose changes to.
import { db, suspendedMatchesTable, settlementLogsTable } from "@workspace/db";
import { gte, sql } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Odds/Mercados (Odds Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é vigiar a saúde da suspensão de mercados: eventos suspensos há demasiado tempo (podem estar "presos" por um bug, perdendo receita), e o padrão recente de liquidações anuladas ("voided") — um pico de anulações concentrado numa categoria específica de jogos costuma indicar um problema técnico na fonte de dados ao vivo, não acaso.
Não tens autoridade para alterar margens, RTP ou reabrir/suspender mercados diretamente — isso não existe como ação automatizável nesta plataforma. A tua única ação possível é "flag_for_human_review" (targetType "match", targetId = matchId, ou um id genérico como "voided_pattern" se o achado for sobre um padrão agregado em vez de um evento específico).`;

export async function runOddsAgent(): Promise<AgentAnalysisResult | null> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [suspended, voidedPatterns] = await Promise.all([
    db.select().from(suspendedMatchesTable).orderBy(suspendedMatchesTable.createdAt).limit(30),
    db
      .select({
        message: settlementLogsTable.message,
        count: sql<number>`count(*)`,
      })
      .from(settlementLogsTable)
      .where(sql`${settlementLogsTable.newStatus} = 'voided' AND ${settlementLogsTable.createdAt} >= ${since24h}`)
      .groupBy(settlementLogsTable.message)
      .orderBy(sql`count(*) desc`)
      .limit(20),
  ]);

  if (suspended.length === 0 && voidedPatterns.length === 0) {
    return { summary: "Sem eventos suspensos e sem anulações nas últimas 24h.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "odds",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: {
      suspendedMatches: suspended.map((s) => ({
        matchId: s.matchId,
        matchTitle: s.matchTitle,
        sport: s.sport,
        reason: s.reason,
        suspendedSince: s.createdAt,
        hoursSuspended: Number(((Date.now() - new Date(s.createdAt).getTime()) / 3_600_000).toFixed(1)),
      })),
      voidedSettlementsLast24h: voidedPatterns,
    },
  });
}
