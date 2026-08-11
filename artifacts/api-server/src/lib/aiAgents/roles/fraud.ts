// Fraud Agent — looks for multi-accounting signals in real available data:
// the same NIF used across more than one user account, or the same IBAN
// used across withdrawal requests from more than one user account. There is
// no device/IP/session-fingerprint table in this schema, so those are the
// only genuine signals available today — the agent is told not to overreach
// beyond them.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Fraude (Fraud Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
A tua função é identificar sinais de multi-contas (uma pessoa a operar várias contas de utilizador, o que viola termos de serviço e pode indicar bonus abuse ou lavagem).
Os únicos sinais disponíveis nesta plataforma são: o mesmo NIF associado a mais do que uma conta, e o mesmo IBAN usado em pedidos de levantamento de mais do que uma conta — não existe fingerprinting de dispositivo/IP nesta plataforma, não inventes esse tipo de sinal.
Ações possíveis: "flag_for_human_review" (para casos a investigar) ou, apenas quando a sobreposição é inequívoca (mesmo NIF E mesmo IBAN em contas diferentes), "block_account" — mas mesmo "block_account" nunca é aplicado automaticamente, fica sempre pendente de aprovação humana. Sê conservador: NIF/IBAN podem coincidir por erro de preenchimento, não presumas culpa.`;

export async function runFraudAgent(): Promise<AgentAnalysisResult | null> {
  const [sharedNif, sharedIban] = await Promise.all([
    db.execute(sql`
      SELECT nif, array_agg(id) AS user_ids, array_agg(email) AS emails, count(*) AS account_count
      FROM users
      WHERE nif IS NOT NULL AND nif <> ''
      GROUP BY nif
      HAVING count(*) > 1
      LIMIT 20
    `),
    db.execute(sql`
      SELECT w.iban, array_agg(DISTINCT w.user_id) AS user_ids, count(DISTINCT w.user_id) AS account_count
      FROM withdrawals w
      GROUP BY w.iban
      HAVING count(DISTINCT w.user_id) > 1
      LIMIT 20
    `),
  ]);

  const sharedNifRows = sharedNif.rows ?? [];
  const sharedIbanRows = sharedIban.rows ?? [];

  if (sharedNifRows.length === 0 && sharedIbanRows.length === 0) {
    return { summary: "Sem sobreposição de NIF ou IBAN entre contas distintas.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "fraud",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: {
      accountsSharingNif: sharedNifRows,
      withdrawalsSharingIbanAcrossAccounts: sharedIbanRows,
    },
  });
}
