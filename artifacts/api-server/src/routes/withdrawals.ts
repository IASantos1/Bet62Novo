import { Router, type IRouter, type Response } from "express";
import { db, usersTable, withdrawalsTable, betsTable } from "@workspace/db";
import { eq, desc, and, ne, inArray, sql, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import { sendWithdrawalApproved, sendWithdrawalRejected } from "../lib/mailer";
import { applyBalanceDelta } from "../lib/ledger";

const router: IRouter = Router();

const OPEN_WITHDRAWAL_STATUSES = ["pending_review", "approved", "processing"] as const;
const ADMIN_WITHDRAWAL_STATUSES = ["approved", "rejected", "processing", "paid", "failed", "cancelled"] as const;

function isAdminWithdrawalStatus(value: string): value is (typeof ADMIN_WITHDRAWAL_STATUSES)[number] {
  return (ADMIN_WITHDRAWAL_STATUSES as readonly string[]).includes(value);
}

function canTransitionWithdrawalStatus(from: string, to: (typeof ADMIN_WITHDRAWAL_STATUSES)[number]): boolean {
  const transitions: Record<string, Array<(typeof ADMIN_WITHDRAWAL_STATUSES)[number]>> = {
    pending_review: ["approved", "rejected", "cancelled"],
    approved: ["processing", "paid", "failed", "rejected"],
    processing: ["paid", "failed", "rejected"],
    failed: ["approved", "rejected"],
  };
  return transitions[from]?.includes(to) ?? false;
}

async function adjustWithdrawalHoldBalance(
  tx: unknown,
  args: { userId: number; amount: string; allowNegative?: boolean }
): Promise<void> {
  const txDb = tx as {
    update: typeof import("@workspace/db")["db"]["update"];
  };
  const amountNum = Number(args.amount);
  if (!Number.isFinite(amountNum)) {
    throw new Error("Invalid hold amount");
  }
  const amountStr = amountNum.toFixed(2);
  const where = args.allowNegative
    ? eq(usersTable.id, args.userId)
    : and(
        eq(usersTable.id, args.userId),
        sql`${usersTable.withdrawalHoldBalance}::numeric + ${amountStr}::numeric >= 0`,
      );
  const updated = await txDb
    .update(usersTable)
    .set({
      withdrawalHoldBalance: sql`${usersTable.withdrawalHoldBalance} + ${amountStr}::numeric`,
    })
    .where(where)
    .returning({ id: usersTable.id });

  if (updated.length === 0) {
    throw Object.assign(new Error("Invalid withdrawal hold balance"), { status: 400 });
  }
}

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

    const openRequests = await db
      .select({ id: withdrawalsTable.id, status: withdrawalsTable.status })
      .from(withdrawalsTable)
      .where(and(
        eq(withdrawalsTable.userId, req.user!.id),
        inArray(withdrawalsTable.status, [...OPEN_WITHDRAWAL_STATUSES]),
      ))
      .limit(1);
    if (openRequests.length > 0) {
      res.status(409).json({
        error: "Já existe um levantamento em curso para esta conta.",
        code: "WITHDRAWAL_ALREADY_OPEN",
        currentStatus: openRequests[0]!.status,
      });
      return;
    }

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
        status: "pending_review",
        riskFlags: [],
      }).returning();

      await applyBalanceDelta(tx, {
        userId: req.user!.id,
        amount: (-amount).toFixed(2),
        kind: "withdrawal_hold",
        idempotencyKey: `withdrawal:${w.id}:debit`,
        refType: "withdrawal",
        refId: String(w.id),
        enforceNonNegative: true,
      });
      await adjustWithdrawalHoldBalance(tx, {
        userId: req.user!.id,
        amount: amount.toFixed(2),
      });
      await tx
        .update(usersTable)
        .set({
          withdrawalIban: cleanIban,
          withdrawalName: holderName.trim(),
          nif,
        })
        .where(eq(usersTable.id, req.user!.id));

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
        reviewedBy: withdrawalsTable.reviewedBy,
        reviewedAt: withdrawalsTable.reviewedAt,
        decisionReason: withdrawalsTable.decisionReason,
        riskFlags: withdrawalsTable.riskFlags,
        providerReference: withdrawalsTable.providerReference,
        processedAt: withdrawalsTable.processedAt,
        reversedAt: withdrawalsTable.reversedAt,
        createdAt: withdrawalsTable.createdAt,
        updatedAt: withdrawalsTable.updatedAt,
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

router.put("/admin/:id", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const {
    status,
    notes,
    decisionReason,
    providerReference,
  } = req.body as { status?: string; notes?: string; decisionReason?: string; providerReference?: string };

  if (!status || !isAdminWithdrawalStatus(status)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }

  try {
    const [existing] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Levantamento não encontrado" }); return; }
    if (!canTransitionWithdrawalStatus(existing.status, status)) {
      res.status(400).json({ error: `Transição inválida: ${existing.status} -> ${status}` });
      return;
    }

    const [user] = await db
      .select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, existing.userId))
      .limit(1);

    const now = new Date();
    const [updated] = await db.transaction(async (tx) => {
      if (status === "rejected" || status === "cancelled") {
        await adjustWithdrawalHoldBalance(tx, {
          userId: existing.userId,
          amount: (-Number(existing.amount)).toFixed(2),
        });
        await applyBalanceDelta(tx, {
          userId: existing.userId,
          amount: existing.amount,
          kind: status === "cancelled" ? "withdrawal_cancel_refund" : "withdrawal_reject_refund",
          idempotencyKey: `withdrawal:${id}:${status === "cancelled" ? "cancel" : "refund"}`,
          refType: "withdrawal",
          refId: String(id),
        });
      }
      if (status === "paid") {
        await adjustWithdrawalHoldBalance(tx, {
          userId: existing.userId,
          amount: (-Number(existing.amount)).toFixed(2),
        });
        await applyBalanceDelta(tx, {
          userId: existing.userId,
          amount: "0.00",
          kind: "withdrawal_paid",
          idempotencyKey: `withdrawal:${id}:paid`,
          refType: "withdrawal",
          refId: String(id),
        });
      }

      return await tx
        .update(withdrawalsTable)
        .set({
          status,
          notes: notes ?? existing.notes ?? null,
          reviewedBy: req.admin?.username ?? existing.reviewedBy ?? null,
          reviewedAt: now,
          decisionReason: decisionReason ?? existing.decisionReason ?? null,
          providerReference: providerReference ?? existing.providerReference ?? null,
          processedAt: status === "processing" || status === "paid" ? now : existing.processedAt,
          reversedAt: status === "rejected" || status === "cancelled" ? now : existing.reversedAt,
          updatedAt: now,
        })
        .where(eq(withdrawalsTable.id, id))
        .returning();
    });

    if (user) {
      if (status === "approved") {
        sendWithdrawalApproved(user.email, user.name, existing.amount).catch((err: unknown) => {
          logger.error({ err, withdrawalId: id }, "Failed to send withdrawal approved email");
        });
      } else if (status === "rejected" || status === "cancelled") {
        sendWithdrawalRejected(user.email, user.name, existing.amount, notes ?? decisionReason).catch((err: unknown) => {
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
