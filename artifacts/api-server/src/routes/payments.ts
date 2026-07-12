import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { sendDepositConfirmed } from "../lib/mailer.js";
import { applyBalanceDelta } from "../lib/ledger.js";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

function formatPtPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("351")) return `+${digits}`;
  return `+351${digits}`;
}

// ─── Freebet grant helper ────────────────────────────────────────────────────
async function grantFirstDepositFreebet(userId: number, depositAmount: number): Promise<void> {
  try {
    const [user] = await db
      .select({ firstDepositGranted: usersTable.firstDepositGranted })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.firstDepositGranted !== "none") return;

    const [{ completedCount }] = await db
      .select({ completedCount: count() })
      .from(paymentsTable)
      .where(eq(paymentsTable.userId, userId));

    if (Number(completedCount) !== 1) return;

    let freebetAmount: string | null = null;
    let grantedLevel: string | null = null;

    if (depositAmount >= 20) {
      freebetAmount = "10.00";
      grantedLevel = "20";
    } else if (depositAmount >= 10) {
      freebetAmount = "5.00";
      grantedLevel = "10";
    }

    if (!freebetAmount || !grantedLevel) return;

    await db.update(usersTable).set({
      freebetBalance: sql`${usersTable.freebetBalance} + ${freebetAmount}`,
      firstDepositGranted: grantedLevel,
    }).where(eq(usersTable.id, userId));

    logger.info({ userId, freebetAmount, grantedLevel }, "First deposit freebet granted");
  } catch (err) {
    logger.error({ err, userId }, "Error granting first deposit freebet");
  }
}

async function creditPayment(orderId: string): Promise<void> {
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).limit(1);
  if (!payment || payment.status === "completed") return;

  await db.transaction(async (tx) => {
    await tx.update(paymentsTable).set({ status: "completed" }).where(eq(paymentsTable.orderId, orderId));
    await applyBalanceDelta(tx, {
      userId: payment.userId,
      amount: payment.amount,
      kind: "payment_deposit_credit",
      idempotencyKey: `payment:${orderId}:credit`,
      refType: "payment",
      refId: orderId,
    });
  });

  logger.info({ orderId, userId: payment.userId, amount: payment.amount }, "Payment confirmed and balance credited");

  void grantFirstDepositFreebet(payment.userId, parseFloat(payment.amount));

  db.select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, payment.userId))
    .limit(1)
    .then(([user]) => {
      if (user) sendDepositConfirmed(user.email, user.name, payment.amount, payment.method).catch(() => {});
    })
    .catch(() => {});
}

// ─── POST /api/payments/multibanco ──────────────────────────────────────────
// Stripe Multibanco: creates a PaymentIntent with multibanco payment method
router.post("/multibanco", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }

  const orderId = randomUUID();
  const amountCents = Math.round(amount * 100);

  try {
    const stripe = getStripe();
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      payment_method_types: ["multibanco"],
      payment_method_data: {
        type: "multibanco",
        billing_details: {
          email: user?.email ?? undefined,
        },
      },
      confirm: true,
      metadata: { orderId, userId: String(req.user!.id) },
      receipt_email: user?.email ?? undefined,
    });

    const multibanco = intent.next_action?.multibanco_display_details;
    const entity = multibanco?.entity ?? "";
    const reference = multibanco?.reference ?? "";
    const expiresAt = multibanco?.expires_at
      ? new Date(multibanco.expires_at * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amount.toFixed(2),
      method: "multibanco",
      status: "pending",
      entity,
      reference,
      requestId: intent.id,
      expiresAt,
    });

    res.json({
      orderId,
      entity,
      reference,
      amount: amount.toFixed(2),
      expiresAt: expiresAt.toISOString(),
      clientSecret: intent.client_secret,
      hostedVoucherUrl: multibanco?.hosted_voucher_url ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Multibanco payment error");
    res.status(500).json({ error: "Erro ao gerar referência Multibanco. Tente novamente." });
  }
});

// ─── POST /api/payments/mbway ────────────────────────────────────────────────
// MB WAY nativo via Stripe PaymentIntent, confirmado com o telemóvel do cliente.
router.post("/mbway", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount, phone } = req.body as { amount?: number; phone?: string };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }
  if (!phone || phone.replace(/\s/g, "").length < 9) {
    res.status(400).json({ error: "Número de telemóvel inválido." });
    return;
  }

  const orderId = randomUUID();
  const amountCents = Math.round(amount * 100);

  try {
    const stripe = getStripe();
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      payment_method_types: ["mb_way"],
      payment_method_data: {
        type: "mb_way",
        billing_details: {
          phone: formatPtPhone(phone),
          email: user?.email ?? undefined,
        },
      },
      confirm: true,
      metadata: { orderId, userId: String(req.user!.id), method: "mbway" },
      receipt_email: user?.email ?? undefined,
    });

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amount.toFixed(2),
      method: "mbway",
      status: "pending",
      requestId: intent.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    if (intent.status === "succeeded") {
      await creditPayment(orderId);
      res.json({
        orderId,
        amount: amount.toFixed(2),
        status: "completed",
        message: "Pagamento MB WAY confirmado.",
      });
      return;
    }

    res.json({
      orderId,
      amount: amount.toFixed(2),
      status: intent.status,
      message: "Pedido MB WAY enviado. Confirme na app MB WAY.",
    });
  } catch (err) {
    logger.error({ err }, "MB WAY payment error");
    res.status(500).json({ error: "Erro ao processar pagamento MB WAY. Tente novamente." });
  }
});

// ─── POST /api/payments/card ─────────────────────────────────────────────────
// Stripe PaymentIntent para cartão; os dados são recolhidos no frontend via Elements.
router.post("/card", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }

  const orderId = randomUUID();
  const amountCents = Math.round(amount * 100);
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!publishableKey) {
    res.status(500).json({ error: "Stripe não configurada: falta STRIPE_PUBLISHABLE_KEY." });
    return;
  }

  try {
    const stripe = getStripe();
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      payment_method_types: ["card"],
      metadata: { orderId, userId: String(req.user!.id), method: "card" },
      receipt_email: user?.email ?? undefined,
      description: `Depósito Bet62 — €${amount.toFixed(2)}`,
    });

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amount.toFixed(2),
      method: "card",
      status: "pending",
      requestId: intent.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    res.json({
      orderId,
      clientSecret: intent.client_secret,
      publishableKey,
    });
  } catch (err) {
    logger.error({ err }, "Card payment error");
    res.status(500).json({ error: "Erro ao iniciar pagamento por cartão. Tente novamente." });
  }
});

// ─── GET /api/payments/status/:orderId ───────────────────────────────────────
router.get("/status/:orderId", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = String(req.params["orderId"]);
  try {
    const [payment] = await db
      .select({ status: paymentsTable.status, amount: paymentsTable.amount, method: paymentsTable.method, userId: paymentsTable.userId })
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, orderId))
      .limit(1);

    if (!payment) { res.status(404).json({ error: "Ordem não encontrada" }); return; }
    if (payment.userId !== req.user!.id) { res.status(403).json({ error: "Proibido" }); return; }

    res.json({ status: payment.status, amount: payment.amount, method: payment.method });
  } catch (err) {
    logger.error({ err, orderId }, "Payment status check error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── GET /api/payments/card-return ───────────────────────────────────────────
// Stripe redireciona aqui após checkout.
// SECURITY: never trust the URL status= param — always verify with Stripe API.
router.get("/card-return", async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.query as Record<string, string>;

  const domains = process.env.REPLIT_DOMAINS;
  const base = domains ? `https://${domains.split(",")[0]}` : "/";

  if (orderId) {
    try {
      const stripe = getStripe();
      const [payment] = await db
        .select({ requestId: paymentsTable.requestId, status: paymentsTable.status })
        .from(paymentsTable)
        .where(eq(paymentsTable.orderId, orderId))
        .limit(1);

      if (payment && payment.status !== "completed" && payment.requestId) {
        if (payment.requestId.startsWith("cs_")) {
          const session = await stripe.checkout.sessions.retrieve(payment.requestId);
          if (session.payment_status === "paid") {
            await creditPayment(orderId);
            logger.info({ orderId }, "Card return: Stripe session verified, balance credited");
            res.redirect(`${base}/?payment=success`);
            return;
          }
          logger.warn({ orderId, stripeStatus: session.payment_status }, "Card return: Stripe session not paid");
        } else if (payment.requestId.startsWith("pi_")) {
          const intent = await stripe.paymentIntents.retrieve(payment.requestId);
          if (intent.status === "succeeded") {
            await creditPayment(orderId);
            logger.info({ orderId }, "Card return: Stripe payment intent verified, balance credited");
            res.redirect(`${base}/?payment=success`);
            return;
          }
          logger.warn({ orderId, stripeStatus: intent.status }, "Card return: Stripe payment intent not paid");
        }
      }
    } catch (err) {
      logger.error({ err, orderId }, "Card return processing error");
    }
  }

  res.redirect(`${base}/?payment=pending`);
});

// ─── Stripe webhook ───────────────────────────────────────────────────────────
// Handled at the Express app level in app.ts (before express.json()) so that
// req.body is a raw Buffer for signature verification. Do NOT duplicate here.
// app.ts calls creditPayment() from this module via the exported helper below.

export default router;
