import { Router, type IRouter, type Response, type Request } from "express";
import { db, usersTable, withdrawalsTable, betsTable } from "@workspace/db";
import { eq, desc, and, ne } from "drizzle-orm";
import { sql, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import { sendWithdrawalApproved, sendWithdrawalRejected } from "../lib/mailer";
import { applyBalanceDelta } from "../lib/ledger";

const router: IRouter = Router();

router.post("/", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount, iban, holderName, nif } = req.body as {
    amount?: number;
    iban?: string;
    holderName?: string;
    nif?: string;
  };

  if (!amount || typeof amount !== "number" || amount < 20 || amount > 50000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €20, máximo €50.000." });
    return;
  }

  if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban.replace(/\s/g, "").toUpperCase())) {
    res.status(400).json({ error: "IBAN inválido." });
    return;
  }

  if (!holderName || holderName.trim().length < 3) {
    res.status(400).json({ error: "Nome do titular inválido." });
    return;
  }

  if (!nif || !/^\d{9}$/.test(nif)) {
    res.status(400).json({ error: "NIF inválido. Deve ter 9 dígitos." });
    return;
  }

  const cleanIban = iban.replace(/\s/g, "").toUpperCase();

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilizador não encontrado" }); return; }

    const kycStatus = String(user.kycStatus ?? "not_submitted");
    if (kycStatus !== "approved") {
      const msg =
        kycStatus === "pending"
          ? "Os seus documentos estão em análise. Aguarde a aprovação para efetuar levantamentos."
          : kycStatus === "rejected"
            ? "A verificação de identidade foi rejeitada. Submeta novamente os documentos para desbloquear levantamentos."
            : "É necessário verificar a sua identidade antes de levantar fundos.";
      res.status(403).json({
        error: msg,
        code: "KYC_REQUIRED",
        kycStatus,
      });
      return;
    }

    // Bet requirement: user must have placed at least one settled bet
    const [{ settledCount }] = await db
      .select({ settledCount: count() })
      .from(betsTable)
      .where(and(eq(betsTable.userId, req.user!.id), ne(betsTable.status, "pending")));

    if (Number(settledCount) === 0) {
      res.status(403).json({
        error: "Para efectuar um levantamento, é necessário ter pelo menos uma aposta liquidada.",
        code: "BET_REQUIRED",
      });
      return;
    }

    if (parseFloat(user.balance) < amount) {
      res.status(400).json({ error: "Saldo insuficiente." });
      return;
    }

    const withdrawal = await db.transaction(async (tx) => {
      const [w] = await tx.insert(withdrawalsTable).values({
        userId: req.user!.id,
        amount: amount.toFixed(2),
        iban: cleanIban,
        holderName: holderName.trim(),
        nif,
        status: "pending",
      }).returning();

      await applyBalanceDelta(tx, {
        userId: req.user!.id,
        amount: (-amount).toFixed(2),
        kind: "withdrawal_request_debit",
        idempotencyKey: `withdrawal:${w.id}:debit`,
        refType: "withdrawal",
        refId: String(w.id),
        enforceNonNegative: true,
      });

      return w;
    });

    res.json({ withdrawal });
  } catch (err) {
    logger.error({ err }, "Withdrawal error");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/mine", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const withdrawals = await db
      .select()
      .from(withdrawalsTable)
      .where(eq(withdrawalsTable.userId, req.user!.id))
      .orderBy(desc(withdrawalsTable.createdAt));

    res.json(withdrawals);
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/admin/all", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const withdrawals = await db
      .select({
        id: withdrawalsTable.id,
        userId: withdrawalsTable.userId,
        amount: withdrawalsTable.amount,
        iban: withdrawalsTable.iban,
        holderName: withdrawalsTable.holderName,
        nif: withdrawalsTable.nif,
        status: withdrawalsTable.status,
        notes: withdrawalsTable.notes,
        createdAt: withdrawalsTable.createdAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(withdrawalsTable)
      .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
      .orderBy(desc(withdrawalsTable.createdAt));

    res.json(withdrawals);
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/admin/:id", adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const { status, notes } = req.body as { status?: string; notes?: string };

  if (!status || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Status inválido. Use approved ou rejected." });
    return;
  }

  try {
    const [existing] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Levantamento não encontrado" }); return; }
    if (existing.status !== "pending") { res.status(400).json({ error: "Este levantamento já foi processado." }); return; }

    const [user] = await db
      .select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, existing.userId))
      .limit(1);

    const [updated] = await db.transaction(async (tx) => {
      if (status === "rejected") {
        await applyBalanceDelta(tx, {
          userId: existing.userId,
          amount: existing.amount,
          kind: "withdrawal_reject_refund",
          idempotencyKey: `withdrawal:${id}:refund`,
          refType: "withdrawal",
          refId: String(id),
        });
      }

      return await tx
        .update(withdrawalsTable)
        .set({ status, notes: notes ?? null })
        .where(eq(withdrawalsTable.id, id))
        .returning();
    });

    if (user) {
      if (status === "approved") {
        sendWithdrawalApproved(user.email, user.name, existing.amount).catch((err: unknown) => {
          logger.error({ err, withdrawalId: id }, "Failed to send withdrawal approved email");
        });
      } else {
        sendWithdrawalRejected(user.email, user.name, existing.amount, notes).catch((err: unknown) => {
          logger.error({ err, withdrawalId: id }, "Failed to send withdrawal rejected email");
        });
      }
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Withdrawal update error");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
