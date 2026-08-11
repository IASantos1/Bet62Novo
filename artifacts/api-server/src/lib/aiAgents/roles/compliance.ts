// Compliance Agent — reviews pending KYC document submissions.
//
// Real limitation, stated plainly in the prompt rather than papered over:
// this agent only ever sees document METADATA (file name, declared kind,
// mime type, file size, submission timing) — there is no vision/document
// analysis wired into this call, so it cannot actually look at the ID photo
// or proof-of-address content. Its job is metadata-level anomaly spotting
// (wrong file type for the declared document, implausible size, repeated
// resubmission), and it is explicitly told to default to
// flag_for_human_review rather than approve_kyc, since a genuine identity
// check requires a human (or a real document-verification vendor) to look
// at the actual file.
import { db, kycDocumentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runAgentAnalysis } from "../client.js";
import type { AgentAnalysisResult } from "../types.js";

const SYSTEM_PROMPT = `És o Agente de Compliance (Compliance Agent) da operação interna de uma casa de apostas desportivas real-money (Bet62), em Portugal.
Recebes documentos KYC pendentes de revisão, mas ATENÇÃO: só vês METADADOS (nome do ficheiro, tipo declarado, mime type, tamanho, quando foi submetido) — NÃO vês o conteúdo real do documento (a foto do documento de identidade ou comprovativo de morada). Não podes verificar autenticidade visual.
A tua função é: assinalar anomalias de metadados (ex.: tipo de ficheiro incoerente com o tipo de documento declarado, tamanho de ficheiro implausível para um documento real, várias resubmissões seguidas da mesma conta) via "flag_for_human_review" (targetType "kyc_document", targetId = id do documento).
Só usa "approve_kyc" ou "reject_kyc" (targetType "user", targetId = id do utilizador, payload.documentId = id do documento) quando os metadados por si só já são conclusivos (ex.: reject óbvio porque o ficheiro submetido nem é uma imagem/pdf). Na dúvida, "flag_for_human_review" é sempre a opção certa — nunca finjas ter verificado visualmente algo que não viste.`;

export async function runComplianceAgent(): Promise<AgentAnalysisResult | null> {
  const pending = await db
    .select({
      id: kycDocumentsTable.id,
      userId: kycDocumentsTable.userId,
      kind: kycDocumentsTable.kind,
      fileName: kycDocumentsTable.fileName,
      mimeType: kycDocumentsTable.mimeType,
      fileSize: kycDocumentsTable.fileSize,
      createdAt: kycDocumentsTable.createdAt,
      userKycStatus: usersTable.kycStatus,
      userCreatedAt: usersTable.createdAt,
    })
    .from(kycDocumentsTable)
    .innerJoin(usersTable, eq(kycDocumentsTable.userId, usersTable.id))
    .where(eq(kycDocumentsTable.status, "pending"))
    .orderBy(kycDocumentsTable.createdAt)
    .limit(15);

  if (pending.length === 0) {
    return { summary: "Sem documentos KYC pendentes de revisão.", findings: [], proposals: [] };
  }

  return runAgentAnalysis({
    role: "compliance",
    roleSystemPrompt: SYSTEM_PROMPT,
    contextData: { pendingKycDocuments: pending },
  });
}
