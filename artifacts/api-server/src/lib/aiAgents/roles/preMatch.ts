// Pré-Jogo Agent — monitors pre-match data quality only (names/competition
// data, not live scores): (1) the same normalized competition name mapped
// to more than one internal competitionId across providers/aliases — the
// exact "compare names between APIs" case, since it means two data
// sources are being treated as different competitions when they're
// actually the same one (or a genuine collision under a generic name);
// (2) competitions currently live/prematch-enabled with a suspiciously
// low configured market cap (maxMarkets), a proxy for a competition whose
// market catalog likely wasn't populated correctly.
//
// Read-only: there is no schema-level "market catalog" table to action
// against, and no code path lets this agent edit aliases/configs/team-name
// matching directly. The only action is "flag_for_human_review"
// (targetType "match", using the competitionId/match-map id/match id as
// targetId), so a human can confirm the mapping/market gap in the admin
// panel.
import { db, competitionAliasesTable, competitionConfigsTable, competitionsTable } from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const LOW_MARKET_COUNT_THRESHOLD = 15;

const SYSTEM_PROMPT = `És o Agente Pré-Jogo (Pre-Match Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é vigiar APENAS a qualidade dos dados de pré-jogo — nomes de equipas/competições e cobertura de mercados — nunca placares ou eventos ao vivo (isso é o Agente Ao Vivo).
Recebes dois conjuntos de dados: (1) nomes de competições que aparecem mapeados para mais do que um ID interno de competição — isto significa que diferentes fornecedores de dados (APIs) estão a usar nomes ligeiramente diferentes para o que é provavelmente a mesma competição, ou que há uma colisão de nomes genuína entre competições distintas; a tua função é comparar os nomes e decidir qual é mais provável; (2) competições atualmente ativas (ao vivo ou pré-jogo) com um número de mercados configurado anormalmente baixo, o que pode indicar que faltam mercados por adicionar/mapear.
Não tens autoridade para editar aliases, configs de competição, mapeamentos ou lógica de correspondência de nomes diretamente — isso não existe como ação automatizável nesta plataforma. A tua única ação possível é "flag_for_human_review" (targetType "match", targetId = o ID relevante fornecido nos dados), para um humano confirmar a correção nos dados.
Sê conservador: só assinala quando o nome ou a lacuna de mercado é claramente suspeita, não qualquer variação menor de nome esperada entre fornecedores.`;

export async function runPreMatchAgent(): Promise<AgentAnalysisResult | null> {
  const [aliasCollisions, lowMarketCompetitions] = await Promise.all([
    db
      .select({
        normalizedAlias: competitionAliasesTable.normalizedAlias,
        distinctCompetitionCount: sql<number>`count(distinct ${competitionAliasesTable.competitionId})`,
        competitionIds: sql<string>`string_agg(distinct ${competitionAliasesTable.competitionId}::text, ',')`,
        providers: sql<string>`string_agg(distinct ${competitionAliasesTable.provider}, ',')`,
        aliases: sql<string>`string_agg(distinct ${competitionAliasesTable.alias}, ' | ')`,
      })
      .from(competitionAliasesTable)
      .groupBy(competitionAliasesTable.normalizedAlias)
      .having(sql`count(distinct ${competitionAliasesTable.competitionId}) > 1`)
      .limit(20),
    db
      .select({
        competitionId: competitionsTable.id,
        sport: competitionsTable.sport,
        name: competitionsTable.name,
        country: competitionsTable.country,
        liveEnabled: competitionConfigsTable.liveEnabled,
        prematchEnabled: competitionConfigsTable.prematchEnabled,
        maxMarkets: competitionConfigsTable.maxMarkets,
      })
      .from(competitionConfigsTable)
      .innerJoin(competitionsTable, eq(competitionsTable.id, competitionConfigsTable.competitionId))
      .where(
        and(
          eq(competitionsTable.isActive, true),
          sql`${competitionConfigsTable.maxMarkets} < ${LOW_MARKET_COUNT_THRESHOLD}`,
          or(eq(competitionConfigsTable.liveEnabled, true), eq(competitionConfigsTable.prematchEnabled, true)),
        ),
      )
      .orderBy(competitionConfigsTable.maxMarkets)
      .limit(20),
  ]);

  if (aliasCollisions.length === 0 && lowMarketCompetitions.length === 0) {
    return { summary: "Sem colisões de nomes ou lacunas de mercado a assinalar.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "prematch",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: {
      competitionNameCollisionsAcrossProviders: aliasCollisions,
      activeCompetitionsWithLowMarketCount: lowMarketCompetitions,
    },
  });
}
