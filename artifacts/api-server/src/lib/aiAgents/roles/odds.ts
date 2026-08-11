// Odds Agent — monitors market-suspension health: matches an admin has
// suspended for betting (suspended_matches) and how long they've been
// stuck, the recent rate of voided settlements (a proxy for
// suspension/odds-feed problems — see the 2026-08-11 sticky-cache TTL fix
// in routes/matches.ts, which was found exactly this way: an unusual void
// pattern on a narrow class of matches), and — real execution authority,
// user request 2026-08-11 — live events whose feed just turned unstable.
//
// Everything except suspend_event stays read-only (flag_for_human_review):
// there is still no margin/RTP-adjustment mechanism in the schema to
// propose changes to, and this agent was never asked for that authority.
// suspend_event is bounded to the SAFE direction only — it can turn
// betting OFF (event_admin_overrides.forceSuspend=true, the exact lever
// routes/adminPro.ts already gives a human admin) when a feed is reporting
// unstable, protecting the house from trading on bad data. It can never
// unsuspend, and an admin can always reverse it from the existing
// admin-pro panel exactly like a manual suspension would be reversed.
import { db, suspendedMatchesTable, settlementLogsTable, eventRuntimeStatesTable, eventAdminOverridesTable } from "@workspace/db";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Odds/Mercados (Odds Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é vigiar a saúde da suspensão de mercados: eventos suspensos há demasiado tempo (podem estar "presos" por um bug, perdendo receita), o padrão recente de liquidações anuladas ("voided") — um pico de anulações concentrado numa categoria específica de jogos costuma indicar um problema técnico na fonte de dados ao vivo, não acaso — e eventos ao vivo cuja fonte de dados (feed) está atualmente reportada como instável.
Não tens autoridade para alterar margens, RTP ou reabrir mercados — isso não existe como ação automatizável nesta plataforma. TENS autoridade real para SUSPENDER um evento ao vivo cujo feed está instável: usa "suspend_event" (targetType "match", targetId = eventId) apenas para eventos claramente instáveis, nunca para um evento apenas porque está a decorrer normalmente. Para tudo o resto (eventos presos há muito tempo, padrões de anulação), a tua única ação é "flag_for_human_review" (targetType "match", targetId = matchId, ou um id genérico como "voided_pattern" se o achado for sobre um padrão agregado em vez de um evento específico).
Sê conservador com "suspend_event": suspender um evento pára as apostas nele, o que tem custo de negócio — só o faças quando o feed instável é o achado real, não como reação a qualquer coisa incerta.`;

export async function runOddsAgent(): Promise<AgentAnalysisResult | null> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [suspended, voidedPatterns, unstableFeedRows] = await Promise.all([
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
    db
      .select({
        eventId: eventRuntimeStatesTable.eventId,
        sport: eventRuntimeStatesTable.sport,
        state: eventRuntimeStatesTable.state,
        feedHealth: eventRuntimeStatesTable.feedHealth,
        lastProviderUpdateAt: eventRuntimeStatesTable.lastProviderUpdateAt,
        alreadySuspended: eventAdminOverridesTable.forceSuspend,
      })
      .from(eventRuntimeStatesTable)
      .leftJoin(eventAdminOverridesTable, eq(eventAdminOverridesTable.eventId, eventRuntimeStatesTable.eventId))
      .where(
        and(
          eq(eventRuntimeStatesTable.visibilityStatus, "VISIBLE"),
          or(eq(eventRuntimeStatesTable.feedHealth, "unstable"), eq(eventRuntimeStatesTable.state, "UNSTABLE_FEED")),
        ),
      )
      .limit(30),
  ]);
  const unstableFeedEvents = unstableFeedRows.filter((e) => !e.alreadySuspended);

  if (suspended.length === 0 && voidedPatterns.length === 0 && unstableFeedEvents.length === 0) {
    return { summary: "Sem eventos suspensos, sem anulações nas últimas 24h, e nenhum feed instável.", findings: [], proposals: [] };
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
      liveEventsWithUnstableFeedNotYetSuspended: unstableFeedEvents,
    },
  });
}
