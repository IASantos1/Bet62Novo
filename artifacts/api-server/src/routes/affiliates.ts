import { Router, type IRouter, type Response } from "express";
import { db, usersTable, paymentsTable } from "@workspace/db";
import { and, eq, isNull, sql, count, sum, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth.js";
import { logger } from "../lib/logger.js";
import { CONFIG } from "../lib/config.js";
// Relative imports — see auth.ts's comment (tsc alias-resolution quirk for
// newly-added schema exports; @workspace/db/schema doesn't pick these up
// within a single typecheck run).
import { affiliatesTable } from "../../../../lib/db/src/schema/affiliates.js";
import { affiliateCommissionsTable } from "../../../../lib/db/src/schema/affiliateCommissions.js";
import { affiliatePayoutsTable } from "../../../../lib/db/src/schema/affiliatePayouts.js";
import { adminAuditLogTable } from "../../../../lib/db/src/schema/adminAuditLog.js";

const router: IRouter = Router();

function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

async function auditLog(
  req: AdminRequest,
  action: string,
  targetType: string,
  targetId: string,
  details?: object,
): Promise<void> {
  try {
    await db.insert(adminAuditLogTable).values({
      action,
      adminUser: req.admin?.username ?? "admin",
      targetType,
      targetId,
      details: details ?? null,
      ip: req.ip ?? null,
    });
  } catch (err) {
    logger.error({ err, action }, "Failed to write admin audit log");
  }
}

// Stats are computed live from the source tables (users/payments/
// affiliate_commissions) rather than kept as denormalized counters on the
// affiliates row itself — see affiliates.ts schema file's comment for why.
async function getAffiliateStats(affiliateId: number) {
  const [[userCount], [depositSum], [commissionTotals]] = await Promise.all([
    db.select({ value: count() }).from(usersTable).where(eq(usersTable.affiliateId, affiliateId)),
    db
      .select({ value: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.affiliateId, affiliateId), eq(paymentsTable.status, "completed"))),
    db
      .select({
        total: sql<string | null>`sum(${affiliateCommissionsTable.commissionAmount}) filter (where ${affiliateCommissionsTable.status} in ('confirmed', 'paid'))`,
        available: sql<string | null>`sum(${affiliateCommissionsTable.commissionAmount}) filter (where ${affiliateCommissionsTable.status} = 'confirmed' and ${affiliateCommissionsTable.payoutId} is null)`,
        paid: sql<string | null>`sum(${affiliateCommissionsTable.commissionAmount}) filter (where ${affiliateCommissionsTable.status} = 'paid')`,
      })
      .from(affiliateCommissionsTable)
      .where(eq(affiliateCommissionsTable.affiliateId, affiliateId)),
  ]);

  return {
    users: Number(userCount?.value ?? 0),
    deposits: Number(depositSum?.value ?? 0),
    commission: Number(commissionTotals?.total ?? 0),
    available: Number(commissionTotals?.available ?? 0),
    paid: Number(commissionTotals?.paid ?? 0),
  };
}

// ── GET /api/affiliate/dashboard — the promoter's own view ─────────────────
// Resolves the affiliate record linked to the authenticated user's account
// (affiliates.userId) — an account with no linked affiliate row simply
// isn't a promoter and gets 404, same message either way so this can't be
// used to probe which accounts are promoters.
router.get("/dashboard", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const [affiliate] = await db
      .select()
      .from(affiliatesTable)
      .where(eq(affiliatesTable.userId, req.user!.id))
      .limit(1);
    if (!affiliate) {
      res.status(404).json({ error: "Nenhum programa de afiliado associado a esta conta." });
      return;
    }

    const stats = await getAffiliateStats(affiliate.id);
    const history = await db
      .select({
        userId: usersTable.id,
        userName: usersTable.name,
        depositAmount: affiliateCommissionsTable.depositAmount,
        commissionAmount: affiliateCommissionsTable.commissionAmount,
        status: affiliateCommissionsTable.status,
        createdAt: affiliateCommissionsTable.createdAt,
      })
      .from(affiliateCommissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, affiliateCommissionsTable.userId))
      .where(eq(affiliateCommissionsTable.affiliateId, affiliate.id))
      .orderBy(desc(affiliateCommissionsTable.createdAt))
      .limit(100);

    res.json({
      affiliate: {
        id: affiliate.id,
        name: affiliate.name,
        code: affiliate.code,
        commissionRate: Number(affiliate.commissionRate),
      },
      stats,
      history,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/affiliate/dashboard error");
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
});

// ── Admin CRUD ───────────────────────────────────────────────────────────
export const adminAffiliatesRouter: IRouter = Router();

adminAffiliatesRouter.post("/affiliates", adminMiddleware, async (req: AdminRequest, res: Response) => {
  const { name, email, code, commissionRate, userId } = req.body as {
    name?: string;
    email?: string;
    code?: string;
    commissionRate?: number;
    userId?: number;
  };
  const normalizedCode = normalizeCode(code);
  if (!name || !normalizedCode) {
    res.status(400).json({ error: "Nome e código são obrigatórios" });
    return;
  }
  try {
    const [existing] = await db
      .select({ id: affiliatesTable.id })
      .from(affiliatesTable)
      .where(eq(affiliatesTable.code, normalizedCode))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Já existe um afiliado com este código" });
      return;
    }
    const [affiliate] = await db
      .insert(affiliatesTable)
      .values({
        name,
        email: email?.trim().toLowerCase() || null,
        code: normalizedCode,
        commissionRate: String(commissionRate ?? CONFIG.AFFILIATE_DEFAULT_COMMISSION_RATE),
        userId: userId ?? null,
      })
      .returning();
    await auditLog(req, "affiliate_create", "affiliate", String(affiliate!.id), { name, code: normalizedCode });
    res.status(201).json(affiliate);
  } catch (err) {
    logger.error({ err }, "POST /api/admin/affiliates error");
    res.status(500).json({ error: "Erro ao criar afiliado" });
  }
});

adminAffiliatesRouter.get("/affiliates", adminMiddleware, async (_req: AdminRequest, res: Response) => {
  try {
    const rows = await db.select().from(affiliatesTable).orderBy(desc(affiliatesTable.createdAt));
    const withStats = await Promise.all(
      rows.map(async (affiliate) => ({ ...affiliate, stats: await getAffiliateStats(affiliate.id) })),
    );
    res.json({ affiliates: withStats });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/affiliates error");
    res.status(500).json({ error: "Erro ao listar afiliados" });
  }
});

adminAffiliatesRouter.get("/affiliates/:id", adminMiddleware, async (req: AdminRequest, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  try {
    const [affiliate] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.id, id)).limit(1);
    if (!affiliate) {
      res.status(404).json({ error: "Afiliado não encontrado" });
      return;
    }
    const stats = await getAffiliateStats(id);
    res.json({ ...affiliate, stats });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/affiliates/:id error");
    res.status(500).json({ error: "Erro ao carregar afiliado" });
  }
});

adminAffiliatesRouter.patch("/affiliates/:id", adminMiddleware, async (req: AdminRequest, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const { name, email, commissionRate, status, userId } = req.body as {
    name?: string;
    email?: string;
    commissionRate?: number;
    status?: string;
    userId?: number | null;
  };
  if (status !== undefined && !["active", "inactive"].includes(status)) {
    res.status(400).json({ error: "Status inválido — use 'active' ou 'inactive'" });
    return;
  }
  try {
    const [before] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.id, id)).limit(1);
    if (!before) {
      res.status(404).json({ error: "Afiliado não encontrado" });
      return;
    }
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) update["name"] = name;
    if (email !== undefined) update["email"] = email?.trim().toLowerCase() || null;
    if (commissionRate !== undefined) update["commissionRate"] = String(commissionRate);
    if (status !== undefined) update["status"] = status;
    if (userId !== undefined) update["userId"] = userId;

    const [updated] = await db.update(affiliatesTable).set(update).where(eq(affiliatesTable.id, id)).returning();
    await auditLog(req, "affiliate_update", "affiliate", String(id), { before, update });
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "PATCH /api/admin/affiliates/:id error");
    res.status(500).json({ error: "Erro ao atualizar afiliado" });
  }
});

adminAffiliatesRouter.get("/affiliates/:id/users", adminMiddleware, async (req: AdminRequest, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.affiliateId, id))
    .orderBy(desc(usersTable.createdAt));
  res.json({ users: rows });
});

adminAffiliatesRouter.get(
  "/affiliates/:id/commissions",
  adminMiddleware,
  async (req: AdminRequest, res: Response) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Id inválido" });
      return;
    }
    const rows = await db
      .select()
      .from(affiliateCommissionsTable)
      .where(eq(affiliateCommissionsTable.affiliateId, id))
      .orderBy(desc(affiliateCommissionsTable.createdAt));
    res.json({ commissions: rows });
  },
);

adminAffiliatesRouter.get("/affiliates/:id/payouts", adminMiddleware, async (req: AdminRequest, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const rows = await db
    .select()
    .from(affiliatePayoutsTable)
    .where(eq(affiliatePayoutsTable.affiliateId, id))
    .orderBy(desc(affiliatePayoutsTable.createdAt));
  res.json({ payouts: rows });
});

// POST /api/admin/affiliates/:id/payout — claims every currently-available
// confirmed commission (status='confirmed', payout_id IS NULL) into a new
// pending payout. Below AFFILIATE_MINIMUM_PAYOUT, refuses rather than
// creating a payout nobody asked for and no commission would be reachable
// again until enough accumulates. All-or-nothing inside one transaction so
// a crash mid-way can never leave commissions claimed by a payout row that
// doesn't exist.
adminAffiliatesRouter.post(
  "/affiliates/:id/payout",
  adminMiddleware,
  async (req: AdminRequest, res: Response) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Id inválido" });
      return;
    }
    try {
      const result = await db.transaction(async (tx) => {
        const available = await tx
          .select({ id: affiliateCommissionsTable.id, amount: affiliateCommissionsTable.commissionAmount })
          .from(affiliateCommissionsTable)
          .where(
            and(
              eq(affiliateCommissionsTable.affiliateId, id),
              eq(affiliateCommissionsTable.status, "confirmed"),
              isNull(affiliateCommissionsTable.payoutId),
            ),
          );
        const total = available.reduce((acc, row) => acc + Number(row.amount), 0);
        if (total < CONFIG.AFFILIATE_MINIMUM_PAYOUT) {
          return { error: "BELOW_MINIMUM" as const, total };
        }
        const [payout] = await tx
          .insert(affiliatePayoutsTable)
          .values({ affiliateId: id, amount: total.toFixed(2), status: "pending" })
          .returning();
        await tx
          .update(affiliateCommissionsTable)
          .set({ payoutId: payout!.id })
          .where(
            and(
              eq(affiliateCommissionsTable.affiliateId, id),
              eq(affiliateCommissionsTable.status, "confirmed"),
              isNull(affiliateCommissionsTable.payoutId),
            ),
          );
        return { payout };
      });
      if ("error" in result) {
        res.status(400).json({
          error: "BELOW_MINIMUM",
          message: `Comissão disponível (€${result.total.toFixed(2)}) abaixo do mínimo de €${CONFIG.AFFILIATE_MINIMUM_PAYOUT.toFixed(2)}.`,
        });
        return;
      }
      await auditLog(req, "affiliate_payout_request", "affiliate_payout", String(result.payout!.id), {
        affiliateId: id,
        amount: result.payout!.amount,
      });
      res.status(201).json(result.payout);
    } catch (err) {
      logger.error({ err }, "POST /api/admin/affiliates/:id/payout error");
      res.status(500).json({ error: "Erro ao solicitar pagamento" });
    }
  },
);

adminAffiliatesRouter.get("/commissions", adminMiddleware, async (_req: AdminRequest, res: Response) => {
  const rows = await db
    .select({
      id: affiliateCommissionsTable.id,
      affiliateId: affiliateCommissionsTable.affiliateId,
      affiliateName: affiliatesTable.name,
      userId: affiliateCommissionsTable.userId,
      depositAmount: affiliateCommissionsTable.depositAmount,
      commissionAmount: affiliateCommissionsTable.commissionAmount,
      status: affiliateCommissionsTable.status,
      createdAt: affiliateCommissionsTable.createdAt,
    })
    .from(affiliateCommissionsTable)
    .innerJoin(affiliatesTable, eq(affiliatesTable.id, affiliateCommissionsTable.affiliateId))
    .orderBy(desc(affiliateCommissionsTable.createdAt))
    .limit(500);
  res.json({ commissions: rows });
});

adminAffiliatesRouter.get("/payouts", adminMiddleware, async (_req: AdminRequest, res: Response) => {
  const rows = await db
    .select({
      id: affiliatePayoutsTable.id,
      affiliateId: affiliatePayoutsTable.affiliateId,
      affiliateName: affiliatesTable.name,
      amount: affiliatePayoutsTable.amount,
      status: affiliatePayoutsTable.status,
      paymentMethod: affiliatePayoutsTable.paymentMethod,
      transactionId: affiliatePayoutsTable.transactionId,
      createdAt: affiliatePayoutsTable.createdAt,
      paidAt: affiliatePayoutsTable.paidAt,
    })
    .from(affiliatePayoutsTable)
    .innerJoin(affiliatesTable, eq(affiliatesTable.id, affiliatePayoutsTable.affiliateId))
    .orderBy(desc(affiliatePayoutsTable.createdAt))
    .limit(500);
  res.json({ payouts: rows });
});

// PATCH /api/admin/payouts/:id — marks a payout paid (records the external
// transaction id) and flips every commission it claimed to status='paid' in
// the same transaction, so a commission's own status always agrees with
// whether the payout that claimed it was actually settled.
adminAffiliatesRouter.patch("/payouts/:id", adminMiddleware, async (req: AdminRequest, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const { status, transactionId, paymentMethod } = req.body as {
    status?: string;
    transactionId?: string;
    paymentMethod?: string;
  };
  if (status !== "paid") {
    res.status(400).json({ error: "Apenas a transição para 'paid' é suportada" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [payout] = await tx.select().from(affiliatePayoutsTable).where(eq(affiliatePayoutsTable.id, id)).limit(1);
      if (!payout) return null;
      if (payout.status === "paid") return payout;
      const [updated] = await tx
        .update(affiliatePayoutsTable)
        .set({ status: "paid", paidAt: new Date(), transactionId: transactionId ?? null, paymentMethod: paymentMethod ?? null })
        .where(eq(affiliatePayoutsTable.id, id))
        .returning();
      await tx
        .update(affiliateCommissionsTable)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(affiliateCommissionsTable.payoutId, id));
      return updated;
    });
    if (!result) {
      res.status(404).json({ error: "Pagamento não encontrado" });
      return;
    }
    await auditLog(req, "affiliate_payout_paid", "affiliate_payout", String(id), { transactionId });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "PATCH /api/admin/payouts/:id error");
    res.status(500).json({ error: "Erro ao marcar pagamento" });
  }
});

export default router;
