import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendDepositConfirmed } from "../lib/mailer";
import { applyBalanceDelta } from "../lib/ledger";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-05-28.basil" });
}

function getBaseUrl(req: Request): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  const host = req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
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
    });
  } catch (err) {
    logger.error({ err }, "Multibanco payment error");
    res.status(500).json({ error: "Erro ao gerar referência Multibanco. Tente novamente." });
  }
});

// ─── POST /api/payments/mbway ────────────────────────────────────────────────
// MB WAY não é suportado nativamente pelo Stripe.
// Implementamos via Stripe PaymentIntent com confirmação manual (link de pagamento).
// O utilizador recebe um link para completar o pagamento via MB WAY num portal Stripe.
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
  const base = getBaseUrl(req);

  try {
    const stripe = getStripe();
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

    // Stripe Payment Link para MB WAY: usar checkout session com método de pagamento card
    // (MB WAY nativo não disponível via Stripe — usamos checkout session como alternativa)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `Depósito Bet62 — €${amount.toFixed(2)}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${base}/api/payments/card-return?status=success&orderId=${orderId}`,
      cancel_url:  `${base}/api/payments/card-return?status=cancel&orderId=${orderId}`,
      customer_email: user?.email ?? undefined,
      metadata: { orderId, userId: String(req.user!.id), method: "mbway" },
    });

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amount.toFixed(2),
      method: "mbway",
      status: "pending",
      requestId: session.id,
      paymentUrl: session.url ?? undefined,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    res.json({ orderId, paymentUrl: session.url, message: "Pedido MB WAY criado. Clique no link para concluir." });
  } catch (err) {
    logger.error({ err }, "MB WAY payment error");
    res.status(500).json({ error: "Erro ao processar pagamento MB WAY. Tente novamente." });
  }
});

// ─── POST /api/payments/card ─────────────────────────────────────────────────
// Stripe Checkout Session para cartão de crédito/débito
router.post("/card", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }

  const orderId = randomUUID();
  const amountCents = Math.round(amount * 100);
  const base = getBaseUrl(req);

  try {
    const stripe = getStripe();
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `Depósito Bet62 — €${amount.toFixed(2)}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${base}/api/payments/card-return?status=success&orderId=${orderId}`,
      cancel_url:  `${base}/api/payments/card-return?status=cancel&orderId=${orderId}`,
      customer_email: user?.email ?? undefined,
      metadata: { orderId, userId: String(req.user!.id), method: "card" },
    });

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amount.toFixed(2),
      method: "card",
      status: "pending",
      requestId: session.id,
      paymentUrl: session.url ?? undefined,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    res.json({ orderId, paymentUrl: session.url });
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
// Stripe redireciona aqui após checkout (sucesso ou cancelamento)
router.get("/card-return", async (req: Request, res: Response): Promise<void> => {
  const { status, orderId } = req.query as Record<string, string>;

  const domains = process.env.REPLIT_DOMAINS;
  const base = domains ? `https://${domains.split(",")[0]}` : "/";

  if (status === "success" && orderId) {
    try {
      await creditPayment(orderId);
    } catch (err) {
      logger.error({ err, orderId }, "Card return processing error");
    }
  }

  res.redirect(`${base}/?payment=${status ?? "unknown"}`);
});

// ─── POST /api/payments/stripe-webhook ───────────────────────────────────────
// IMPORTANT: This route must be registered BEFORE express.json() in app.ts
// so that req.body is a raw Buffer (needed by stripe.webhooks.constructEvent)
router.post("/stripe-webhook", async (req: Request, res: Response): Promise<void> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];

  if (!webhookSecret || !sig) {
    res.status(400).json({ error: "Missing webhook secret or signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ msg }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook error: ${msg}` });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId && session.payment_status === "paid") {
          await creditPayment(orderId);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.orderId;
        if (orderId) {
          await creditPayment(orderId);
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Stripe webhook processing error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
