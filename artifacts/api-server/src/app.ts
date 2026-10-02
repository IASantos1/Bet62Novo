import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initDb } from "@workspace/db";
import Stripe from "stripe";
// Aliases tipo para objetos Stripe (evita usar Stripe.* namespace tipo que conflita com
// import Stripe value-class no mesmo modulo: IDE TS Server frequentemente resolve
// apenas o value e diz que Stripe "only refers to a type" quando usado como namespace).
// Todos sao type ANY, coerencia garantida pela library Stripe em runtime — modules.d.ts stub.
type StripeEvent = any;
type StripeCheckoutSession = any;
type StripePaymentIntent = any;
type StripeCharge = any;
import { db, paymentsTable, usersTable, withdrawalsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { applyBalanceDelta } from "./lib/ledger.js";
import { sendDepositConfirmed } from "./lib/mailer.js";
import { createAffiliateCommission } from "./routes/payments.js";
import { maybeGrantCasinoWelcomeBonus } from "./lib/casinoBonus.js";
import {
  applyWithdrawalAdminDecision,
  canTransitionWithdrawalStatus,
  mapRevolutTransactionState,
} from "./routes/withdrawals.js";
import { verifyRevolutWebhookSignature } from "./services/revolut/client.js";

const app: Express = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Initialise database schema on startup (idempotent — uses IF NOT EXISTS).
initDb()
  .then(() => logger.info("Database schema ready"))
  .catch((err) => logger.error({ err }, "Database schema initialisation failed"));

// ── Stripe webhook MUST be registered before express.json() ─────────────────
// Stripe requires a raw Buffer body for signature verification.
// ── Shared creditPayment helper (used by webhook + polling cron below) ─────
// Duplicates the logic in payments.ts's creditPayment because the route
// module is not imported here (and importing would pull auth middleware etc).
// Ledger's applyBalanceDelta idempotency key prevents double credits even if
// both paths (webhook + cron) fire for the same orderId.
async function creditPaymentHelper(orderId: string): Promise<void> {
  try {
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).limit(1);
    if (!payment || payment.status === "completed") return;
    await db.transaction(async (tx) => {
      await tx
        .update(paymentsTable)
        .set({ status: "completed", confirmedAt: new Date() })
        .where(eq(paymentsTable.orderId, orderId));
      await applyBalanceDelta(tx, {
        userId: payment.userId,
        amount: payment.amount,
        kind: "payment_deposit_credit",
        idempotencyKey: `payment:${orderId}:credit`,
        refType: "payment",
        refId: orderId,
      });
      await createAffiliateCommission(tx, payment);
    });
    logger.info({ orderId, userId: payment.userId, amount: payment.amount }, "Payment balance credited (webhook or cron)");
    void maybeGrantCasinoWelcomeBonus(payment.userId, parseFloat(payment.amount));
    // Confirmation email (best-effort, swallow errors)
    db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1)
      .then(([u]) => { if (u) sendDepositConfirmed(u.email, u.name, payment.amount, payment.method).catch(() => {}); })
      .catch(() => {});
  } catch (err) {
    logger.error({ err, orderId }, "creditPaymentHelper failed");
  }
}

// ── CRON POLLING: self-heal pending payments even if webhook missed ─────────
// Root cause of "depósito 10€ não creditado, foi para admin aprovar":
//   - Stripe webhook fails to arrive (Railway restart, network drop, HTTP 5xx)
//   - User never re-opens /payments/status/:orderId (which had inline self-heal)
//   - Payment sits PENDING forever in DB
// Solution: every 60 seconds, scan PENDING payments younger than 48h,
// verify live status with Stripe API, credit if actually paid. Startup run
// catches anything pending while the server was down.
async function pollPendingPayments() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return;
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pending = await db
      .select({ orderId: paymentsTable.orderId, requestId: paymentsTable.requestId, status: paymentsTable.status, method: paymentsTable.method, userId: paymentsTable.userId })
      .from(paymentsTable)
      .where(sql`${paymentsTable.status} = 'pending' AND ${paymentsTable.createdAt} >= ${cutoff.toISOString()}`)
      .limit(200);
    if (!pending.length) return;
    const stripe = new Stripe(stripeSecret, { apiVersion: "2026-06-24.dahlia" });
    for (const p of pending) {
      if (!p.requestId) continue;
      try {
        let paid = false;
        if (p.requestId.startsWith("pi_")) {
          const pi = await stripe.paymentIntents.retrieve(p.requestId);
          paid = pi.status === "succeeded";
        } else if (p.requestId.startsWith("cs_")) {
          const session = await stripe.checkout.sessions.retrieve(p.requestId);
          paid = session.payment_status === "paid";
        }
        if (paid) {
          logger.info({ orderId: p.orderId, method: p.method, requestId: p.requestId, userId: p.userId }, "Cron: pending payment verified paid on Stripe — crediting now");
          await creditPaymentHelper(p.orderId);
        }
      } catch (perr) {
        logger.warn({ err: perr, orderId: p.orderId, requestId: p.requestId }, "Cron: single pending payment verify failed (will retry next tick)");
      }
    }
  } catch (err) {
    logger.error({ err }, "Cron: pollPendingPayments top-level failed");
  }
}

// Startup: run once immediately to catch pendings from before restart, then every 60s.
void pollPendingPayments();
setInterval(() => void pollPendingPayments(), 60 * 1000).unref?.();

app.post(
  "/api/payments/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers["stripe-signature"];
    if (!webhookSecret || !sig) {
      res.status(400).json({ error: "Missing webhook config" });
      return;
    }
    let event: StripeEvent;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
    } catch (err: unknown) {
      logger.warn({ msg: err instanceof Error ? err.message : String(err) }, "Stripe webhook verification failed");
      res.status(400).json({ error: "Webhook verification failed" });
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const s = event.data.object as StripeCheckoutSession;
        if (s.metadata?.orderId && s.payment_status === "paid") await creditPaymentHelper(s.metadata.orderId);
      } else if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as StripePaymentIntent;
        if (pi.metadata?.orderId) await creditPaymentHelper(pi.metadata.orderId);
      } else if (event.type === "charge.succeeded") {
        const ch = event.data.object as StripeCharge;
        const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : null;
        if (piId) {
          try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });
            const pi = await stripe.paymentIntents.retrieve(piId);
            if (pi.metadata?.orderId) await creditPaymentHelper(pi.metadata.orderId);
          } catch (inner) {
            logger.warn({ err: inner, chargeId: ch.id, piId }, "Webhook: charge.succeeded PI fetch failed (cron will retry)");
          }
        }
      }

      res.json({ received: true });
    } catch (err) {
      logger.error({ err, type: event.type }, "Stripe webhook processing error");
      res.status(500).json({ error: "Processing failed" });
    }
  },
);

// Sportsbook provider webhooks are not wired here right now. The current
// backend uses the normalized Bet62 routes, so there is no extra raw-body
// sportsbook webhook endpoint to mount here today.
//
// The casino callbacks remain separate in routes/casino.ts and use normal
// JSON parsing there, so no additional raw-body route is needed in app.ts.

// ── Revolut webhook MUST be registered before express.json() ────────────────
// Signature verification is computed over the exact raw request bytes.
app.post(
  "/api/withdrawals/webhook/revolut",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer).toString("utf8");
    const valid = verifyRevolutWebhookSignature({
      rawBody,
      signatureHeader: req.headers["revolut-signature"] as string | undefined,
      timestampHeader: req.headers["revolut-request-timestamp"] as string | undefined,
    });
    if (!valid) {
      logger.warn({ ip: req.ip }, "Revolut webhook rejected: invalid signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let payload: { event?: string; data?: { id?: string; new_state?: string; state?: string } };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    if (payload.event !== "TransactionStateChanged" || !payload.data?.id) {
      res.json({ received: true });
      return;
    }

    try {
      const transactionId = payload.data.id;
      const newState = payload.data.new_state ?? payload.data.state ?? "";
      const targetStatus = mapRevolutTransactionState(newState);
      if (!targetStatus) {
        res.json({ received: true });
        return;
      }

      const [existing] = await db
        .select({ id: withdrawalsTable.id, status: withdrawalsTable.status })
        .from(withdrawalsTable)
        .where(eq(withdrawalsTable.providerReference, transactionId))
        .limit(1);

      if (!existing) {
        logger.warn({ transactionId }, "Revolut webhook: no withdrawal matches provider reference");
        res.json({ received: true });
        return;
      }

      if (existing.status === targetStatus || !canTransitionWithdrawalStatus(existing.status, targetStatus)) {
        res.json({ received: true });
        return;
      }

      await applyWithdrawalAdminDecision({
        id: existing.id,
        status: targetStatus,
        reviewedBy: "system:revolut_webhook",
        providerReference: transactionId,
      });

      res.json({ received: true });
    } catch (err) {
      logger.error({ err }, "Revolut webhook processing error");
      res.status(500).json({ error: "Processing failed" });
    }
  },
);

app.use(
  (pinoHttp as any)({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
if (process.env.NODE_ENV !== "production") {
  app.use(cors());
}
app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

// In production (Railway), serve the built React SPA and handle client-side routing.
// __dirname is set by the esbuild banner to the directory of the running bundle
// (e.g. artifacts/api-server/dist/), so ../../bet62/dist/public resolves correctly.
if (process.env.NODE_ENV === "production") {
  const webDistPath = path.resolve(
    (globalThis as Record<string, unknown>).__dirname as string ?? __dirname,
    "../../bet62/dist/public",
  );
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(webDistPath, "index.html"));
    });
    logger.info({ webDistPath }, "Serving web SPA from dist");
  } else {
    logger.warn({ webDistPath }, "Web dist not found — API-only mode");
  }
}

export default app;
