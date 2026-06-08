import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import { kycDocumentsTable, usersTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

function detectMimeType(buf: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) return "image/png";
  return null;
}

type SupportedKycKind = "id" | "id_front" | "id_back" | "passport" | "address";

const supportedKycKinds: SupportedKycKind[] = ["id", "id_front", "id_back", "passport", "address"];

function maskDocumentNumber(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length <= 4) return raw;
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

function latestDoc<T extends { kind: string; createdAt: Date }>(docs: T[], kind: string): T | null {
  return docs.find((doc) => doc.kind === kind) ?? null;
}

function docSlotState(
  label: string,
  required: boolean,
  doc: { id: number; fileName: string; status: string; createdAt: Date; reviewedAt: Date | null } | null
) {
  return {
    label,
    required,
    uploaded: !!doc,
    documentId: doc?.id ?? null,
    fileName: doc?.fileName ?? null,
    status: doc?.status ?? "missing",
    createdAt: doc?.createdAt ?? null,
    reviewedAt: doc?.reviewedAt ?? null,
  };
}

function buildKycOverview(
  user: {
    kycStatus: string | null;
    kycDocumentType: string | null;
    kycDocumentNumber: string | null;
    kycSubmittedAt: Date | null;
    nif: string | null;
  },
  docs: Array<{ id: number; kind: string; fileName: string; status: string; createdAt: Date; reviewedAt: Date | null }>
) {
  const selectedDocumentType = user.kycDocumentType === "passport" ? "passport" : "cc";
  const legacyIdDocs = docs.filter((doc) => doc.kind === "id");
  const frontDoc = latestDoc(docs, "id_front") ?? (selectedDocumentType === "cc" ? legacyIdDocs[0] ?? null : null);
  const backDoc = latestDoc(docs, "id_back") ?? (selectedDocumentType === "cc" ? legacyIdDocs[1] ?? null : null);
  const passportDoc = latestDoc(docs, "passport") ?? (selectedDocumentType === "passport" ? legacyIdDocs[0] ?? null : null);
  const addressDoc = latestDoc(docs, "address");

  const missingItems: string[] = [];
  if (!user.nif || !/^\d{9}$/.test(user.nif)) missingItems.push("NIF válido");
  if (!user.kycDocumentNumber || user.kycDocumentNumber.trim().length < 5) missingItems.push("número do documento");
  if (!user.kycDocumentType || !["cc", "passport"].includes(user.kycDocumentType)) missingItems.push("tipo de documento");
  if (selectedDocumentType === "cc") {
    if (!frontDoc) missingItems.push("frente do documento");
    if (!backDoc) missingItems.push("verso do documento");
  } else if (!passportDoc) {
    missingItems.push("página principal do passaporte");
  }
  if (!addressDoc) missingItems.push("comprovativo de morada");

  const readyForManualReview = missingItems.length === 0;
  const hasAnyProgress =
    docs.length > 0 ||
    !!String(user.kycDocumentNumber ?? "").trim() ||
    !!String(user.nif ?? "").trim() ||
    !!String(user.kycDocumentType ?? "").trim();

  const slots =
    selectedDocumentType === "cc"
      ? [
          docSlotState("Frente do documento", true, frontDoc),
          docSlotState("Verso do documento", true, backDoc),
          docSlotState("Comprovativo de morada", true, addressDoc),
        ]
      : [
          docSlotState("Passaporte", true, passportDoc),
          docSlotState("Comprovativo de morada", true, addressDoc),
        ];

  return {
    currentDocumentType: selectedDocumentType,
    documentNumberMasked: maskDocumentNumber(user.kycDocumentNumber),
    slots,
    automaticCheck: {
      stage: readyForManualReview ? "ready_for_manual_review" : hasAnyProgress ? "missing_information" : "not_started",
      readyForManualReview,
      requiresManualReview: readyForManualReview,
      missingItems,
      summary: readyForManualReview
        ? "Pré-verificação automática concluída. Os ficheiros obrigatórios e os dados básicos foram validados e o pedido segue para revisão manual."
        : "Faltam dados ou documentos obrigatórios para concluir a pré-verificação automática.",
    },
  };
}

async function getUserWithKyc(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  const docs = await db
    .select()
    .from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.userId, userId))
    .orderBy(desc(kycDocumentsTable.createdAt));
  const kycOverview = buildKycOverview(user, docs);
  return { user, docs, kycOverview };
}

async function syncUserKycProgress(userId: number) {
  const current = await getUserWithKyc(userId);
  if (!current) return null;
  const nextStatus = current.kycOverview.automaticCheck.readyForManualReview ? "pending" : "not_submitted";
  const [updated] = await db
    .update(usersTable)
    .set({
      kycStatus: nextStatus,
      kycSubmittedAt: current.kycOverview.automaticCheck.readyForManualReview ? new Date() : null,
    })
    .where(eq(usersTable.id, userId))
    .returning();
  return {
    user: updated,
    docs: current.docs,
    kycOverview: buildKycOverview(updated, current.docs),
  };
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

router.get("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const current = await getUserWithKyc(req.user!.id);
    if (!current) { res.status(404).json({ error: "Utilizador não encontrado" }); return; }
    const { user, kycOverview } = current;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      balance: user.balance,
      freebetBalance: user.freebetBalance,
      nif: user.nif,
      withdrawalIban: user.withdrawalIban,
      withdrawalName: user.withdrawalName,
      selfExcludedUntil: user.selfExcludedUntil,
      kycStatus: user.kycStatus,
      kycDocumentType: user.kycDocumentType,
      kycSubmittedAt: user.kycSubmittedAt,
      firstDepositGranted: user.firstDepositGranted,
      kycOverview,
    });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { nif, withdrawalIban, withdrawalName } = req.body as {
    nif?: string;
    withdrawalIban?: string;
    withdrawalName?: string;
  };

  if (nif !== undefined && !/^\d{9}$/.test(nif)) {
    res.status(400).json({ error: "NIF inválido. Deve ter 9 dígitos." });
    return;
  }

  if (withdrawalIban !== undefined) {
    const clean = withdrawalIban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(clean)) {
      res.status(400).json({ error: "IBAN inválido." });
      return;
    }
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({
        ...(nif !== undefined && { nif }),
        ...(withdrawalIban !== undefined && { withdrawalIban: withdrawalIban.replace(/\s/g, "").toUpperCase() }),
        ...(withdrawalName !== undefined && { withdrawalName }),
      })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    res.json({
      nif: updated.nif,
      withdrawalIban: updated.withdrawalIban,
      withdrawalName: updated.withdrawalName,
    });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── POST /api/profile/kyc/submit ────────────────────────────────────────────
router.post("/kyc/submit", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { documentType, documentNumber, nif } = req.body as {
    documentType?: string;
    documentNumber?: string;
    nif?: string;
  };

  if (!documentType || !["cc", "passport"].includes(documentType)) {
    res.status(400).json({ error: "Tipo de documento inválido. Use 'cc' ou 'passport'." });
    return;
  }

  if (!documentNumber || documentNumber.trim().length < 5) {
    res.status(400).json({ error: "Número de documento inválido." });
    return;
  }

  if (nif !== undefined && nif !== "" && !/^\d{9}$/.test(nif)) {
    res.status(400).json({ error: "NIF inválido. Deve ter 9 dígitos." });
    return;
  }

  try {
    const [existing] = await db
      .select({ kycStatus: usersTable.kycStatus })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id))
      .limit(1);

    if (existing?.kycStatus === "approved") {
      res.status(400).json({ error: "A sua identidade já foi verificada e aprovada." });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        kycDocumentType: documentType,
        kycDocumentNumber: documentNumber.trim(),
        ...(nif && nif !== "" && { nif }),
      })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    const synced = await syncUserKycProgress(req.user!.id);
    const resultUser = synced?.user ?? updated;

    res.json({
      kycStatus: resultUser.kycStatus,
      kycDocumentType: resultUser.kycDocumentType,
      kycSubmittedAt: resultUser.kycSubmittedAt,
      kycOverview: synced?.kycOverview ?? null,
    });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/self-exclude", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { period } = req.body as { period?: string };
  const validPeriods: Record<string, number> = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "180d": 180,
    "permanent": 36500,
  };

  if (!period || !(period in validPeriods)) {
    res.status(400).json({ error: "Período inválido. Use: 1d, 7d, 30d, 180d, permanent." });
    return;
  }

  const days = validPeriods[period];
  const until = new Date();
  until.setDate(until.getDate() + days);

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ selfExcludedUntil: until })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    res.json({ selfExcludedUntil: updated.selfExcludedUntil });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/kyc/upload", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { kind, files } = req.body as {
    kind?: string;
    files?: Array<{ fileName?: string; mimeType?: string; base64?: string }>;
  };

  if (!kind || !supportedKycKinds.includes(kind as SupportedKycKind)) {
    res.status(400).json({ error: "Tipo inválido. Use frente, verso, passaporte ou comprovativo de morada." });
    return;
  }

  const uploadKind = kind as SupportedKycKind;
  const maxFiles = uploadKind === "id" ? 4 : 1;
  if (!Array.isArray(files) || files.length === 0 || files.length > maxFiles) {
    res.status(400).json({ error: maxFiles === 1 ? "Envie exatamente 1 arquivo." : "Envie entre 1 e 4 arquivos." });
    return;
  }

  const userId = req.user!.id;
  const uploadRoot = path.resolve(
    (globalThis as Record<string, unknown>).__dirname as string ?? __dirname,
    "../uploads/kyc",
  );
  fs.mkdirSync(uploadRoot, { recursive: true });

  try {
    const [existingUser] = await db
      .select({ kycStatus: usersTable.kycStatus })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (existingUser?.kycStatus === "approved") {
      res.status(400).json({ error: "A sua identidade já foi verificada e aprovada." });
      return;
    }

    const savedDocs: Array<{ id: number; storagePath: string }> = [];

    if (uploadKind !== "id") {
      const previousDocs = await db
        .select({ id: kycDocumentsTable.id, storagePath: kycDocumentsTable.storagePath, kind: kycDocumentsTable.kind })
        .from(kycDocumentsTable)
        .where(eq(kycDocumentsTable.userId, userId));
      const toReplace = previousDocs.filter((doc) => doc.kind === uploadKind);
      if (toReplace.length > 0) {
        for (const doc of toReplace) {
          safeUnlink(doc.storagePath);
          await db.delete(kycDocumentsTable).where(eq(kycDocumentsTable.id, doc.id));
        }
      }
    }

    for (const f of files) {
      const fileName = String(f.fileName ?? "documento").replace(/[\/\\]/g, "_").slice(0, 80);
      const base64 = String(f.base64 ?? "");
      if (!base64 || base64.length < 16) {
        res.status(400).json({ error: "Arquivo inválido (base64 ausente)." });
        return;
      }

      const buf = Buffer.from(base64, "base64");
      if (!buf || buf.length === 0) {
        res.status(400).json({ error: "Arquivo inválido." });
        return;
      }
      if (buf.length > 5 * 1024 * 1024) {
        res.status(400).json({ error: "Arquivo muito grande. Máximo 5MB por arquivo." });
        return;
      }

      const mimeType = detectMimeType(buf);
      if (!mimeType) {
        res.status(400).json({ error: "Tipo de arquivo inválido. Use PDF, JPG ou PNG." });
        return;
      }

      const storagePath = path.join(uploadRoot, `${userId}_${Date.now()}_${Math.random().toString(16).slice(2)}_${fileName}`);
      fs.writeFileSync(storagePath, buf);

      const [doc] = await db
        .insert(kycDocumentsTable)
        .values({
          userId,
          kind: uploadKind,
          fileName,
          mimeType,
          fileSize: buf.length,
          storagePath,
          status: "pending",
        })
        .returning({ id: kycDocumentsTable.id, storagePath: kycDocumentsTable.storagePath });
      savedDocs.push(doc);
    }

    const synced = await syncUserKycProgress(userId);
    res.json({
      ok: true,
      documents: savedDocs,
      kycStatus: synced?.user.kycStatus ?? existingUser?.kycStatus ?? "not_submitted",
      kycOverview: synced?.kycOverview ?? null,
    });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
