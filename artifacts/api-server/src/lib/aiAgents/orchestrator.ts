// Orchestrator ("CEO agent") — runs every specialist agent in sequence,
// records each one's run + proposals exactly like a standalone run would,
// then asks Claude for a short executive rollup across all of them. It
// never creates proposals of its own; its job is coordination and
// reporting, not decisions — every actionable item still comes from the
// specialist that actually gathered the relevant data.
import { runAgentAnalysis } from "./client.js";
import { recordRun, createProposals } from "./proposals.js";
import { autoExecuteIfEligible } from "./executor.js";
import { AGENT_REGISTRY } from "./roles/index.js";
import type { AgentRole } from "./types.js";
import { logger } from "../logger.js";

export interface OrchestratorRunReport {
  role: AgentRole;
  status: "ok" | "error" | "skipped";
  summary: string;
  findingsCount: number;
  proposalsCreated: number;
}

export interface OrchestratorResult {
  executiveSummary: string;
  runs: OrchestratorRunReport[];
  totalProposalsCreated: number;
}

const ORCHESTRATOR_SYSTEM_PROMPT = `És o Agente Orquestrador (CEO Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Recebes os resumos e achados de todos os agentes especializados (Risco, Odds, Liquidação, Fraude, Pagamentos, Compliance, Suporte, Ao Vivo, Pré-Jogo, Liquidação de Bilhetes) que acabaram de correr.
A tua função é escrever um resumo executivo curto (3-6 frases) para o dono da plataforma: o que precisa da atenção dele primeiro, e porquê. Não repitas tudo, prioriza.
Não tens proposals próprias — cada ação concreta já foi proposta pelo agente especializado relevante e fica pendente de aprovação humana como sempre. Deixa "proposals" como array vazio.`;

export async function runOrchestrator(triggeredBy: string | null): Promise<OrchestratorResult> {
  const roles = Object.keys(AGENT_REGISTRY) as Array<Exclude<AgentRole, "orchestrator">>;
  const runs: OrchestratorRunReport[] = [];

  for (const role of roles) {
    const startedAt = Date.now();
    try {
      const result = await AGENT_REGISTRY[role]();
      const durationMs = Date.now() - startedAt;
      if (result === null) {
        const run = await recordRun({
          role,
          trigger: "orchestrator",
          triggeredBy,
          status: "skipped",
          summary: "Sem resposta da IA (chave não configurada ou falha na chamada).",
          proposalsCreated: 0,
          durationMs,
        });
        runs.push({ role, status: "skipped", summary: run.summary ?? "", findingsCount: 0, proposalsCreated: 0 });
        continue;
      }
      const run = await recordRun({
        role,
        trigger: "orchestrator",
        triggeredBy,
        status: "ok",
        summary: result.summary,
        proposalsCreated: result.proposals.length,
        durationMs,
      });
      const createdProposals = await createProposals(role, run.id, result.proposals);
      await autoExecuteIfEligible(createdProposals);
      runs.push({
        role,
        status: "ok",
        summary: result.summary,
        findingsCount: result.findings.length,
        proposalsCreated: result.proposals.length,
      });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      logger.error({ err, role }, "[aiAgents] orchestrator: sub-agent run failed");
      await recordRun({
        role,
        trigger: "orchestrator",
        triggeredBy,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Erro desconhecido",
        proposalsCreated: 0,
        durationMs,
      });
      runs.push({ role, status: "error", summary: "Falhou — ver logs.", findingsCount: 0, proposalsCreated: 0 });
    }
  }

  const totalProposalsCreated = runs.reduce((sum, r) => sum + r.proposalsCreated, 0);

  const synthesis = await runAgentAnalysis({
    role: "orchestrator",
    roleSystemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    contextData: { subAgentRuns: runs },
    maxTokens: 600,
  });

  return {
    executiveSummary: synthesis?.summary || "Não foi possível gerar o resumo executivo (ver runs individuais abaixo).",
    runs,
    totalProposalsCreated,
  };
}
