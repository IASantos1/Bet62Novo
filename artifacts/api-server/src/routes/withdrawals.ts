import { Router, type IRouter, type Response, type Request } from "express";
import { db, usersTable, withdrawalsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import { sendWithdrawalApproved, sendWithdrawalRejected } from "../lib/mailer";

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

    if (parseFloat(user.balance) < amount) {
      res.status(400).json({ error: "Saldo insuficiente." });
      return;
    }

    const [withdrawal] = await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} - ${amount.toFixed(2)}` })
        .where(eq(usersTable.id, req.user!.id));

      return await tx.insert(withdrawalsTable).values({
        userId: req.user!.id,
        amount: amount.toFixed(2),
        iban: cleanIban,
        holderName: holderName.trim(),
        nif,
        status: "pending",
      }).returning();
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
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${existing.amount}` })
          .where(eq(usersTable.id, existing.userId));
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
