// Ao Vivo Agent — audits the health of the live-event pipeline across a
// match's full lifecycle (kickoff through full-time): events the runtime
// engine (event_runtime_states, see lib/liveCompetitionCatalog.ts) still
// marks LIVE/ACTIVE/HALFTIME + VISIBLE despite match_results already
// holding a finished/abandoned record (finishedAt set) — a direct
// contradiction meaning the match should have been cleared from the Ao
// Vivo page but wasn't — and events LIVE/ACTIVE with no provider update in
// hours, the same "stuck live" pattern already fixed once for
// basketball/volleyball (see git history) but which can recur for any
// sport if a feed goes silent mid-match.
//
// Read-only: the deterministic GC/cleanup pipeline already owns actually
// removing matches from Ao Vivo. This agent's only action is
// "flag_for_human_review" (targetType "match", targetId = eventId), so an
// admin can force-hide the event if the automatic pipeline missed it.
import { db, eventRuntimeStatesTable, matchResultsTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const LIVE_STATES = ["LIVE", "ACTIVE", "HALFTIME", "SUSPENDED", "UNSTABLE_FEED"] as const;
const STALE_FEED_CUTOFF_MS = 3 * 60 * 60 * 1000; // 3h without a provider update while still marked live

const SYSTEM_PROMPT = `És o Agente Ao Vivo (Live Match Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é vigiar o ciclo de vida completo de um jogo ao vivo, do início (minuto 0) ao fim (minuto 90 ou equivalente no desporto em causa): confirmar que um jogo que já terminou é reconhecido como terminado e removido da página Ao Vivo, e sinalizar jogos que ficaram "presos" — marcados como ao vivo há horas sem qualquer atualização da fonte de dados, o que normalmente indica um problema técnico e não um jogo real a decorrer.
Recebes dois conjuntos de dados: (1) eventos marcados como ativos/ao vivo no motor interno mas que já têm um resultado final gravado (match_results com finishedAt preenchido) — isto é uma contradição direta e quase sempre significa que o jogo devia ter sido limpo da página Ao Vivo; (2) eventos marcados como ativos/ao vivo sem qualquer atualização do fornecedor de dados há mais de 3 horas — um jogo real nunca fica tanto tempo sem atualização de placar/relógio.
Não tens autoridade para remover eventos diretamente da página Ao Vivo — isso é feito pelo pipeline de limpeza automático existente. A tua única ação possível é "flag_for_human_review" (targetType "match", targetId = o eventId do evento), para um humano confirmar e forçar a remoção manualmente se o pipeline automático falhou.
Sê conservador: só assinala quando a contradição ou o silêncio de dados é claro, não qualquer jogo simplesmente demorado (prolongamentos, atrasos, VAR longo são normais).`;

export async function runLiveMatchAgent(): Promise<AgentAnalysisResult | null> {
  const staleCutoff = new Date(Date.now() - STALE_FEED_CUTOFF_MS);

  const [markedLive, endedButStillLive] = await Promise.all([
    db
      .select({
        eventId: eventRuntimeStatesTable.eventId,
        sport: eventRuntimeStatesTable.sport,
        state: eventRuntimeStatesTable.state,
        visibilityStatus: eventRuntimeStatesTable.visibilityStatus,
        feedHealth: eventRuntimeStatesTable.feedHealth,
        lastProviderUpdateAt: eventRuntimeStatesTable.lastProviderUpdateAt,
      })
      .from(eventRuntimeStatesTable)
      .where(
        and(
          inArray(eventRuntimeStatesTable.state, [...LIVE_STATES]),
          eq(eventRuntimeStatesTable.visibilityStatus, "VISIBLE"),
          or(
            lt(eventRuntimeStatesTable.lastProviderUpdateAt, staleCutoff),
            isNull(eventRuntimeStatesTable.lastProviderUpdateAt),
          ),
        ),
      )
      .limit(30),
    db
      .select({
        eventId: eventRuntimeStatesTable.eventId,
        sport: eventRuntimeStatesTable.sport,
        state: eventRuntimeStatesTable.state,
        visibilityStatus: eventRuntimeStatesTable.visibilityStatus,
        homeTeam: matchResultsTable.homeTeam,
        awayTeam: matchResultsTable.awayTeam,
        home: matchResultsTable.home,
        away: matchResultsTable.away,
        resultStatus: matchResultsTable.status,
        finishedAt: matchResultsTable.finishedAt,
      })
      .from(eventRuntimeStatesTable)
      .innerJoin(matchResultsTable, eq(matchResultsTable.matchId, eventRuntimeStatesTable.eventId))
      .where(
        and(
          inArray(eventRuntimeStatesTable.state, [...LIVE_STATES]),
          eq(eventRuntimeStatesTable.visibilityStatus, "VISIBLE"),
          isNotNull(matchResultsTable.finishedAt),
        ),
      )
      .limit(30),
  ]);

  if (markedLive.length === 0 && endedButStillLive.length === 0) {
    return { summary: "Nenhum jogo ao vivo preso ou por limpar — pipeline de Ao Vivo saudável.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "livematch",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: {
      staleLiveEvents: markedLive.map((m) => ({
        ...m,
        hoursSinceLastProviderUpdate: m.lastProviderUpdateAt
          ? Number(((Date.now() - m.lastProviderUpdateAt.getTime()) / 3_600_000).toFixed(1))
          : null,
      })),
      endedButStillMarkedLive: endedButStillLive,
    },
  });
}
