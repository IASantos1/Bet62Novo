import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import { kycDocumentsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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

router.get("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilizador não encontrado" }); return; }
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
        kycStatus: "pending",
        kycSubmittedAt: new Date(),
        ...(nif && nif !== "" && { nif }),
      })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    res.json({
      kycStatus: updated.kycStatus,
      kycDocumentType: updated.kycDocumentType,
      kycSubmittedAt: updated.kycSubmittedAt,
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

  const validKinds = ["id", "address"];
  if (!kind || !validKinds.includes(kind)) {
    res.status(400).json({ error: "Tipo inválido. Use: id, address." });
    return;
  }

  if (!Array.isArray(files) || files.length === 0 || files.length > 4) {
    res.status(400).json({ error: "Envie entre 1 e 4 arquivos." });
    return;
  }

  const userId = req.user!.id;
  const uploadRoot = path.resolve(
    (globalThis as Record<string, unknown>).__dirname as string ?? __dirname,
    "../uploads/kyc",
  );
  fs.mkdirSync(uploadRoot, { recursive: true });

  try {
    const savedDocs: Array<{ id: number; storagePath: string }> = [];

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
          kind,
          fileName,
          mimeType,
          fileSize: buf.length,
          storagePath,
          status: "pending",
        })
        .returning({ id: kycDocumentsTable.id, storagePath: kycDocumentsTable.storagePath });
      savedDocs.push(doc);
    }

    await db
      .update(usersTable)
      .set({ kycStatus: "pending", kycSubmittedAt: new Date() })
      .where(eq(usersTable.id, userId));

    res.json({ ok: true, documents: savedDocs });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
