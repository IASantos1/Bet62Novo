import { Router, type IRouter, type Response } from "express";
import { db, usersTable, withdrawalsTable, betsTable, paymentsTable, adminAuditLogTable } from "@workspace/db";
import { eq, desc, and, ne, inArray, sql, count, sum } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import { sendWithdrawalApproved, sendWithdrawalRejected } from "../lib/mailer";
import { applyBalanceDelta } from "../lib/ledger";

const router: IRouter = Router();

const OPEN_WITHDRAWAL_STATUSES = ["pending_review", "approved", "processing"] as const;
const ADMIN_WITHDRAWAL_STATUSES = ["approved", "rejected", "processing", "paid", "failed", "cancelled"] as const;
const USER_CANCELLABLE_WITHDRAWAL_STATUSES = ["pending_review", "approved"] as const;

type WithdrawalRiskFlag = {
  code: string;
  severity: "low" | "medium" | "high";
  label: string;
  reason: string;
  value?: string | number;
};

type WithdrawalEligibilityResult =
  | {
      eligible: true;
      user: typeof usersTable.$inferSelect;
      kycStatus: string;
      settledBetCount: number;
      openWithdrawalStatus: null;
      code: null;
      message: null;
    }
  | {
      eligible: false;
      user: typeof usersTable.$inferSelect;
      kycStatus: string;
      settledBetCount: number;
      openWithdrawalStatus: string | null;
      code: "WITHDRAWAL_ALREADY_OPEN" | "KYC_REQUIRED" | "BET_REQUIRED";
      message: string;
    };

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

function canUserCancelWithdrawalStatus(from: string): boolean {
  return (USER_CANCELLABLE_WITHDRAWAL_STATUSES as readonly string[]).includes(from);
}

function buildWithdrawalRiskFlags(args: {
  amount: number;
  userBalanceBefore: number;
  userCreatedAt: Date | string;
  previousWithdrawalCount: number;
  completedDepositCount: number;
  totalCompletedDeposits: number;
  latestCompletedDepositAt?: Date | string | null;
  settledBetCount: number;
}): WithdrawalRiskFlag[] {
  const flags: WithdrawalRiskFlag[] = [];
  const nowMs = Date.now();
  const createdAt = new Date(args.userCreatedAt);
  const accountAgeHours = Number.isNaN(createdAt.getTime()) ? null : (nowMs - createdAt.getTime()) / (1000 * 60 * 60);
  const latestDepositAt = args.latestCompletedDepositAt ? new Date(args.latestCompletedDepositAt) : null;
  const latestDepositHours =
    latestDepositAt && !Number.isNaN(latestDepositAt.getTime())
      ? (nowMs - latestDepositAt.getTime()) / (1000 * 60 * 60)
      : null;
  const withdrawalRatio =
    args.userBalanceBefore > 0 ? args.amount / args.userBalanceBefore : 0;

  if (args.previousWithdrawalCount === 0) {
    flags.push({
      code: "first_withdrawal",
      severity: "low",
      label: "Primeiro levantamento",
      reason: "Primeiro pedido de levantamento desta conta.",
    });
  }

  if (accountAgeHours !== null && accountAgeHours < 72) {
    flags.push({
      code: "new_account",
      severity: accountAgeHours < 24 ? "high" : "medium",
      label: "Conta recente",
      reason: "Conta criada há menos de 72 horas.",
      value: Number(accountAgeHours.toFixed(1)),
    });
  }

  if (latestDepositHours !== null && latestDepositHours < 24) {
    flags.push({
      code: "recent_deposit",
      severity: latestDepositHours < 6 ? "high" : "medium",
      label: "Depósito recente",
      reason: "Existe depósito concluído nas últimas 24 horas.",
      value: Number(latestDepositHours.toFixed(1)),
    });
  }

  if (args.completedDepositCount === 0) {
    flags.push({
      code: "no_completed_deposits",
      severity: "medium",
      label: "Sem depósitos concluídos",
      reason: "A conta não tem histórico de depósitos concluídos.",
    });
  }

  if (args.totalCompletedDeposits > 0 && args.amount > args.totalCompletedDeposits) {
    flags.push({
      code: "withdrawal_gt_total_deposits",
      severity: "medium",
      label: "Levantamento acima dos depósitos",
      reason: "O valor solicitado excede o total histórico de depósitos concluídos.",
      value: Number(args.totalCompletedDeposits.toFixed(2)),
    });
  }

  if (args.amount >= 1000) {
    flags.push({
      code: "large_amount",
      severity: args.amount >= 2500 ? "high" : "medium",
      label: "Montante elevado",
      reason: "O valor do levantamento é elevado para revisão manual.",
      value: Number(args.amount.toFixed(2)),
    });
  }

  if (withdrawalRatio >= 0.8) {
    flags.push({
      code: "high_balance_ratio",
      severity: withdrawalRatio >= 0.95 ? "high" : "medium",
      label: "Consome quase todo o saldo",
      reason: "O levantamento representa grande parte do saldo disponível antes do hold.",
      value: Number((withdrawalRatio * 100).toFixed(1)),
    });
  }

  if (args.settledBetCount <= 3) {
    flags.push({
      code: "low_settled_bet_history",
      severity: "low",
      label: "Pouco histórico de apostas",
      reason: "A conta tem poucas apostas liquidadas antes do levantamento.",
      value: args.settledBetCount,
    });
  }

  return flags;
}

async function auditWithdrawalEvent(args: {
  actor: string;
  action: string;
  targetId: string;
  ip?: string | null;
  details?: object;
}): Promise<void> {
  try {
    await db.insert(adminAuditLogTable).values({
      action: args.action,
      adminUser: args.actor,
      targetType: "withdrawal",
      targetId: args.targetId,
      details: args.details ?? null,
      ip: args.ip ?? null,
    });
  } catch (err) {
    logger.error({ err, action: args.action, withdrawalId: args.targetId }, "Withdrawal audit log error");
  }
}

async function getWithdrawalEligibility(userId: number): Promise<WithdrawalEligibilityResult | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;

  const [openRequest] = await db
    .select({ id: withdrawalsTable.id, status: withdrawalsTable.status })
    .from(withdrawalsTable)
    .where(and(
      eq(withdrawalsTable.userId, userId),
      inArray(withdrawalsTable.status, [...OPEN_WITHDRAWAL_STATUSES]),
    ))
    .limit(1);

  const kycStatus = String(user.kycStatus ?? "not_submitted");
  const [{ settledCount }] = await db
    .select({ settledCount: count() })
    .from(betsTable)
    .where(and(eq(betsTable.userId, userId), ne(betsTable.status, "pending")));
  const settledBetCount = Number(settledCount);

  if (openRequest) {
    return {
      eligible: false,
      user,
      kycStatus,
      settledBetCount,
      openWithdrawalStatus: openRequest.status,
      code: "WITHDRAWAL_ALREADY_OPEN",
      message: "Já existe um levantamento em curso para esta conta.",
    };
  }

  if (kycStatus !== "approved") {
    const msg =
      kycStatus === "pending"
        ? "Os seus documentos estão em análise. Aguarde a aprovação para efetuar levantamentos."
        : kycStatus === "rejected"
          ? "A verificação de identidade foi rejeitada. Submeta novamente os documentos para desbloquear levantamentos."
          : "É necessário verificar a sua identidade antes de levantar fundos.";
    return {
      eligible: false,
      user,
      kycStatus,
      settledBetCount,
      openWithdrawalStatus: null,
      code: "KYC_REQUIRED",
      message: msg,
    };
  }

  if (settledBetCount === 0) {
    return {
      eligible: false,
      user,
      kycStatus,
      settledBetCount,
      openWithdrawalStatus: null,
      code: "BET_REQUIRED",
      message: "Para efectuar um levantamento, é necessário ter pelo menos uma aposta liquidada.",
    };
  }

  return {
    eligible: true,
    user,
    kycStatus,
    settledBetCount,
    openWithdrawalStatus: null,
    code: null,
    message: null,
  };
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
    const eligibility = await getWithdrawalEligibility(req.user!.id);
    if (!eligibility) {
      res.status(404).json({ error: "Utilizador não encontrado" });
      return;
    }
    if (!eligibility.eligible) {
      res.status(eligibility.code === "WITHDRAWAL_ALREADY_OPEN" ? 409 : 403).json({
        error: eligibility.message,
        code: eligibility.code,
        kycStatus: eligibility.kycStatus,
        currentStatus: eligibility.openWithdrawalStatus,
        settledBetCount: eligibility.settledBetCount,
      });
      return;
    }

    const user = eligibility.user;

    if (parseFloat(user.balance) < amount) {
      res.status(400).json({ error: "Saldo insuficiente." });
      return;
    }

    const [{ completedDepositCount, totalCompletedDeposits }] = await db
      .select({
        completedDepositCount: count(),
        totalCompletedDeposits: sum(paymentsTable.amount),
      })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.userId, req.user!.id), eq(paymentsTable.status, "completed")));

    const [latestCompletedDeposit] = await db
      .select({
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.userId, req.user!.id), eq(paymentsTable.status, "completed")))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(1);

    const [{ previousWithdrawalCount }] = await db
      .select({ previousWithdrawalCount: count() })
      .from(withdrawalsTable)
      .where(eq(withdrawalsTable.userId, req.user!.id));

    const riskFlags = buildWithdrawalRiskFlags({
      amount,
      userBalanceBefore: parseFloat(user.balance),
      userCreatedAt: user.createdAt,
      previousWithdrawalCount: Number(previousWithdrawalCount),
      completedDepositCount: Number(completedDepositCount),
      totalCompletedDeposits: parseFloat(totalCompletedDeposits || "0"),
      latestCompletedDepositAt: latestCompletedDeposit?.createdAt ?? null,
      settledBetCount: eligibility.settledBetCount,
    });

    const withdrawal = await db.transaction(async (tx) => {
      const [w] = await tx.insert(withdrawalsTable).values({
        userId: req.user!.id,
        amount: amount.toFixed(2),
        iban: cleanIban,
        holderName: holderName.trim(),
        nif,
        status: "pending_review",
        riskFlags,
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

    await auditWithdrawalEvent({
      actor: `user:${req.user!.id}`,
      action: "withdrawal_created",
      targetId: String(withdrawal.id),
      ip: req.ip ?? null,
      details: {
        userId: req.user!.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        riskFlags,
      },
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

router.get("/eligibility", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await getWithdrawalEligibility(req.user!.id);
    if (!result) {
      res.status(404).json({ error: "Utilizador não encontrado" });
      return;
    }
    res.json({
      eligible: result.eligible,
      code: result.code,
      message: result.message,
      kycStatus: result.kycStatus,
      settledBetCount: result.settledBetCount,
      openWithdrawalStatus: result.openWithdrawalStatus,
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, "Withdrawal eligibility error");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/:id/cancel", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Levantamento inválido." });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(withdrawalsTable)
      .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.userId, req.user!.id)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Levantamento não encontrado." });
      return;
    }

    if (!canUserCancelWithdrawalStatus(existing.status)) {
      res.status(400).json({
        error: "Este levantamento já não pode ser cancelado pelo utilizador.",
        code: "WITHDRAWAL_NOT_CANCELLABLE",
        currentStatus: existing.status,
      });
      return;
    }

    const now = new Date();
    const [updated] = await db.transaction(async (tx) => {
      await adjustWithdrawalHoldBalance(tx, {
        userId: existing.userId,
        amount: (-Number(existing.amount)).toFixed(2),
      });
      await applyBalanceDelta(tx, {
        userId: existing.userId,
        amount: existing.amount,
        kind: "withdrawal_cancel_refund",
        idempotencyKey: `withdrawal:${id}:user_cancel`,
        refType: "withdrawal",
        refId: String(id),
      });

      return await tx
        .update(withdrawalsTable)
        .set({
          status: "cancelled",
          reviewedBy: "user",
          reviewedAt: now,
          decisionReason: existing.decisionReason ?? "Cancelado pelo utilizador",
          reversedAt: now,
          updatedAt: now,
        })
        .where(eq(withdrawalsTable.id, id))
        .returning();
    });

    await auditWithdrawalEvent({
      actor: `user:${req.user!.id}`,
      action: "withdrawal_cancelled_by_user",
      targetId: String(id),
      ip: req.ip ?? null,
      details: {
        userId: req.user!.id,
        amount: existing.amount,
        previousStatus: existing.status,
        newStatus: "cancelled",
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error({ err, withdrawalId: id, userId: req.user?.id }, "User withdrawal cancel error");
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

    await auditWithdrawalEvent({
      actor: `admin:${req.admin?.username ?? "admin"}`,
      action: "withdrawal_status_updated",
      targetId: String(id),
      ip: req.ip ?? null,
      details: {
        userId: existing.userId,
        previousStatus: existing.status,
        newStatus: status,
        amount: existing.amount,
        decisionReason: decisionReason ?? existing.decisionReason ?? null,
        providerReference: providerReference ?? existing.providerReference ?? null,
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Withdrawal update error");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
