// "BET62 Brain" — natural-language admin console (user request, 2026-08-11,
// part 2 of 2: "Pode avançar 1 depois o 2"). An admin types a command in
// European Portuguese ("Qual é a exposição atual da casa?", "Suspende
// eventos com exposição acima de €10.000", "Liquida os bilhetes presos",
// "Mostra as propostas pendentes") and the model maps it to exactly ONE
// tool from TOOL_REGISTRY below — it never writes SQL, never invents an
// action, never gets arbitrary code-execution power. Every tool handler is
// a thin call into an already-existing, already-audited function (runner.ts
// for agent runs/proposal decisions, executor.ts's forceSuspendEvent for
// suspension, or a plain read query) — a typed command has exactly the
// same power as the equivalent button elsewhere in this admin panel, never
// more. If the model can't confidently match a command to a tool, it says
// so (tool: null) instead of guessing.
import { db, betsTable, aiConsoleCommandsTable, type AiAgentProposal, type AiAgentRun } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import { AGENT_ROLES, isAgentRole } from "./types.js";
import { runSingleAgent, approveProposal, rejectProposal } from "./runner.js";
import { listProposals, listRuns } from "./proposals.js";
import { forceSuspendEvent } from "./executor.js";

interface ToolResult {
  summary: string;
  data?: unknown;
}

type ToolHandler = (params: Record<string, unknown>, adminUsername: string) => Promise<ToolResult>;

interface ToolDef {
  name: string;
  description: string;
  handler: ToolHandler;
}

async function pendingExposureByMatch(limit: number) {
  return db
    .select({
      matchId: betsTable.matchId,
      matchTitle: betsTable.matchTitle,
      pendingBetCount: sql<number>`count(*)`,
      totalStake: sql<string>`sum(${betsTable.stake})`,
      totalPotentialPayout: sql<string>`sum(${betsTable.potentialWin})`,
    })
    .from(betsTable)
    .where(eq(betsTable.status, "pending"))
    .groupBy(betsTable.matchId, betsTable.matchTitle)
    .orderBy(sql`sum(${betsTable.potentialWin}) desc`)
    .limit(limit);
}

function formatEur(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `€${n.toFixed(2)}` : "€0.00";
}

const TOOL_REGISTRY: ToolDef[] = [
  {
    name: "get_exposure_summary",
    description: "Mostra a exposição atual (payout potencial) das top 15 apostas pendentes por evento. Sem parâmetros. Usa para perguntas como \"qual é a exposição atual da casa\".",
    handler: async () => {
      const rows = await pendingExposureByMatch(15);
      if (rows.length === 0) return { summary: "Sem apostas pendentes de momento." };
      const total = rows.reduce((sum, r) => sum + Number(r.totalPotentialPayout), 0);
      return {
        summary: `${rows.length} eventos com apostas pendentes (top 15). Payout potencial somado: ${formatEur(total)}. Maior exposição: ${rows[0]!.matchTitle} (${formatEur(rows[0]!.totalPotentialPayout)}).`,
        data: rows,
      };
    },
  },
  {
    name: "suspend_events_above_exposure",
    description: `Suspende (pára apostas em) todos os eventos com apostas pendentes cujo payout potencial total ultrapasse um valor em euros. Parâmetro obrigatório: thresholdEur (número). Usa para comandos como "fecha/suspende os mercados com exposição acima de €X" — NOTA: não filtra por competição/liga específica, aplica-se a todos os eventos ativos.`,
    handler: async (params, adminUsername) => {
      const threshold = Number(params["thresholdEur"]);
      if (!Number.isFinite(threshold) || threshold <= 0) {
        return { summary: "Valor de limite em falta ou inválido — indica um número em euros (ex: 10000)." };
      }
      const rows = await db
        .select({
          matchId: betsTable.matchId,
          matchTitle: betsTable.matchTitle,
          totalPotentialPayout: sql<string>`sum(${betsTable.potentialWin})`,
        })
        .from(betsTable)
        .where(eq(betsTable.status, "pending"))
        .groupBy(betsTable.matchId, betsTable.matchTitle)
        .having(sql`sum(${betsTable.potentialWin}) > ${threshold}`);
      for (const row of rows) {
        await forceSuspendEvent(
          row.matchId,
          `[IA - console] Suspenso por comando do admin: exposição de ${formatEur(row.totalPotentialPayout)} acima do limite de €${threshold} pedido.`,
          `ai-agent:console (comando de ${adminUsername})`,
        );
      }
      if (rows.length === 0) return { summary: `Nenhum evento com exposição acima de €${threshold} neste momento — nada suspenso.` };
      return {
        summary: `${rows.length} evento(s) suspenso(s) por exposição acima de €${threshold}: ${rows.map((r) => r.matchTitle).join(", ")}.`,
        data: rows,
      };
    },
  },
  {
    name: "run_agent",
    description: `Corre um dos agentes especializados agora mesmo. Parâmetro obrigatório: role (um de: ${AGENT_ROLES.join(", ")}). Usa "ticketsettlement" para "liquida os bilhetes presos/confirmados", "fraud" para "mostra utilizadores com risco de fraude", "orchestrator" para correr todos e obter um resumo executivo.`,
    handler: async (params) => {
      const role = String(params["role"] ?? "");
      if (!isAgentRole(role)) return { summary: `Agente desconhecido: "${role}". Agentes disponíveis: ${AGENT_ROLES.join(", ")}.` };
      const outcome = await runSingleAgent(role, "console");
      if (outcome.orchestrator) {
        return { summary: outcome.result.executiveSummary, data: outcome.result };
      }
      // Explicit cast, not implicit narrowing — see the identical note in
      // routes/withdrawals.ts (this package's tsconfig has strict: false).
      const single = outcome as Extract<typeof outcome, { orchestrator: false }>;
      const proposalsNote = single.proposals.length > 0 ? ` ${single.proposals.length} proposta(s) criada(s)/aplicada(s).` : "";
      return {
        summary: `${single.run.summary ?? "Sem resumo."}${proposalsNote}`,
        data: { findings: single.findings, proposals: single.proposals },
      };
    },
  },
  {
    name: "list_pending_proposals",
    description: "Lista propostas pendentes de aprovação. Parâmetro opcional: role (filtra por agente). Usa para \"mostra as propostas pendentes\".",
    handler: async (params) => {
      const role = typeof params["role"] === "string" ? (params["role"] as string) : undefined;
      const proposals: AiAgentProposal[] = await listProposals({ status: "pending", role });
      if (proposals.length === 0) return { summary: "Sem propostas pendentes." };
      return {
        summary: `${proposals.length} proposta(s) pendente(s): ${proposals.slice(0, 10).map((p) => `#${p.id} [${p.agentRole}] ${p.summary}`).join("; ")}`,
        data: proposals,
      };
    },
  },
  {
    name: "approve_proposal",
    description: "Aprova E aplica uma proposta pendente pelo ID. Parâmetro obrigatório: id (número). Usa apenas quando o admin refere um número de proposta explícito.",
    handler: async (params, adminUsername) => {
      const id = Number(params["id"]);
      if (!Number.isFinite(id)) return { summary: "ID de proposta em falta ou inválido." };
      const result = await approveProposal(id, adminUsername);
      if (!result.ok) return { summary: `Falhou: ${result.error}` };
      return { summary: `Proposta #${id} aprovada e aplicada.`, data: result.proposal };
    },
  },
  {
    name: "reject_proposal",
    description: "Rejeita uma proposta pendente pelo ID, sem a aplicar. Parâmetro obrigatório: id (número).",
    handler: async (params, adminUsername) => {
      const id = Number(params["id"]);
      if (!Number.isFinite(id)) return { summary: "ID de proposta em falta ou inválido." };
      const result = await rejectProposal(id, adminUsername);
      if (!result.ok) return { summary: `Falhou: ${result.error}` };
      return { summary: `Proposta #${id} rejeitada.`, data: result.proposal };
    },
  },
  {
    name: "list_recent_runs",
    description: "Lista o histórico recente de execuções de agentes. Sem parâmetros obrigatórios.",
    handler: async () => {
      const runs: AiAgentRun[] = await listRuns(15);
      if (runs.length === 0) return { summary: "Sem execuções registadas." };
      return { summary: `${runs.length} execuções recentes.`, data: runs };
    },
  },
  {
    name: "help",
    description: "Explica o que este painel consegue fazer. Usa quando o comando não é claramente nenhuma das outras ferramentas.",
    handler: async () => ({
      summary:
        "Consigo: mostrar a exposição atual, suspender eventos acima de um valor de exposição, correr qualquer agente (Risco, Odds, Liquidação, Fraude, Pagamentos, Compliance, Suporte, Ao Vivo, Pré-Jogo, Liquidação de Bilhetes, ou todos via Orquestrador), listar/aprovar/rejeitar propostas pendentes, e mostrar o histórico de execuções. Escreve o que precisas em português normal.",
    }),
  },
];

function buildSystemPrompt(): string {
  const toolList = TOOL_REGISTRY.map((t) => `- "${t.name}": ${t.description}`).join("\n");
  return `És o "BET62 Brain", o assistente do painel de administração de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Um admin escreve-te um comando em português. A tua ÚNICA função é escolher, das ferramentas abaixo, a que melhor corresponde ao pedido, e extrair os parâmetros necessários. NUNCA inventes uma ferramenta que não esteja nesta lista, NUNCA escrevas SQL ou código, NUNCA executes nada tu próprio — só escolhes.
Ferramentas disponíveis:
${toolList}
Se o comando não corresponder claramente a nenhuma ferramenta, ou faltar informação obrigatória (ex: um valor em euros, um ID de proposta), usa "tool": null e explica em "message" o que falta.
Responde APENAS com um objeto JSON válido, sem markdown, exatamente neste formato:
{ "tool": string|null, "params": object, "message": string (curta explicação da tua escolha, ou do que falta se tool for null) }`;
}

interface ConsoleCommandResult {
  ok: boolean;
  toolUsed: string | null;
  message: string;
  summary?: string;
  data?: unknown;
}

async function callModelForToolChoice(message: string): Promise<{ tool: string | null; params: Record<string, unknown>; message: string } | null> {
  if (!CONFIG.AI_AGENTS_API_KEY) return null;
  try {
    const resp = await fetch(`${CONFIG.AI_AGENTS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.AI_AGENTS_API_KEY}`,
        "HTTP-Referer": "https://bet62.pt",
        "X-Title": "Bet62 IA Operações — BET62 Brain",
      },
      body: JSON.stringify({
        model: CONFIG.AI_AGENTS_MODEL,
        max_tokens: 500,
        temperature: 0.1,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: message },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "[aiConsole] LLM call failed");
      return null;
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    const raw = JSON.parse(text.slice(start, end + 1)) as { tool?: unknown; params?: unknown; message?: unknown };
    const tool = typeof raw.tool === "string" ? raw.tool : null;
    const params = typeof raw.params === "object" && raw.params !== null ? (raw.params as Record<string, unknown>) : {};
    const msg = typeof raw.message === "string" ? raw.message : "";
    return { tool, params, message: msg };
  } catch (err) {
    logger.warn({ err }, "[aiConsole] LLM call errored");
    return null;
  }
}

export async function runConsoleCommand(message: string, adminUsername: string): Promise<ConsoleCommandResult> {
  const choice = await callModelForToolChoice(message);

  if (!choice) {
    const result: ConsoleCommandResult = { ok: false, toolUsed: null, message: "Sem resposta da IA (AI_AGENTS_API_KEY não configurada, ou falha na chamada — ver logs)." };
    await logConsoleCommand(adminUsername, message, result);
    return result;
  }

  if (!choice.tool) {
    const result: ConsoleCommandResult = { ok: true, toolUsed: null, message: choice.message || "Não percebi o comando." };
    await logConsoleCommand(adminUsername, message, result);
    return result;
  }

  const tool = TOOL_REGISTRY.find((t) => t.name === choice.tool);
  if (!tool) {
    const result: ConsoleCommandResult = { ok: false, toolUsed: choice.tool, message: `A IA escolheu uma ferramenta desconhecida: "${choice.tool}".` };
    await logConsoleCommand(adminUsername, message, result);
    return result;
  }

  try {
    const toolResult = await tool.handler(choice.params, adminUsername);
    const result: ConsoleCommandResult = { ok: true, toolUsed: tool.name, message: toolResult.summary, summary: toolResult.summary, data: toolResult.data };
    await logConsoleCommand(adminUsername, message, result, choice.params);
    return result;
  } catch (err) {
    logger.error({ err, tool: tool.name }, "[aiConsole] tool handler failed");
    const result: ConsoleCommandResult = { ok: false, toolUsed: tool.name, message: err instanceof Error ? err.message : "Erro desconhecido a aplicar a ação." };
    await logConsoleCommand(adminUsername, message, result, choice.params);
    return result;
  }
}

async function logConsoleCommand(
  adminUsername: string,
  message: string,
  result: ConsoleCommandResult,
  params?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(aiConsoleCommandsTable).values({
      adminUsername,
      message,
      toolUsed: result.toolUsed,
      params: params ?? {},
      resultSummary: result.message,
      ok: result.ok,
      error: result.ok ? null : result.message,
    });
  } catch (err) {
    logger.warn({ err }, "[aiConsole] failed to persist command audit log");
  }
}
