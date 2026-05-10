import { Router, type IRouter, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

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

export default router;
