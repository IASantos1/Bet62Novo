import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initDb } from "@workspace/db";
import Stripe from "stripe";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { applyBalanceDelta } from "./lib/ledger.js";
import { sendDepositConfirmed } from "./lib/mailer.js";

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
    let event: Stripe.Event;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
    } catch (err: unknown) {
      logger.warn({ msg: err instanceof Error ? err.message : String(err) }, "Stripe webhook verification failed");
      res.status(400).json({ error: "Webhook verification failed" });
      return;
    }

    try {
      const creditPayment = async (orderId: string) => {
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
        logger.info({ orderId, userId: payment.userId }, "Stripe webhook: balance credited");
        // Freebet
        try {
          const [u] = await db.select({ firstDepositGranted: usersTable.firstDepositGranted }).from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
          if (u?.firstDepositGranted === "none") {
            const [{ c }] = await db.select({ c: count() }).from(paymentsTable).where(eq(paymentsTable.userId, payment.userId)) as [{ c: number }];
            if (Number(c) === 1) {
              const dep = parseFloat(payment.amount);
              const fb = dep >= 20 ? "10.00" : dep >= 10 ? "5.00" : null;
              const lvl = dep >= 20 ? "20" : dep >= 10 ? "10" : null;
              if (fb && lvl) {
                await db.update(usersTable).set({ freebetBalance: sql`${usersTable.freebetBalance} + ${fb}`, firstDepositGranted: lvl }).where(eq(usersTable.id, payment.userId));
              }
            }
          }
        } catch { /* non-critical */ }
        // Email
        db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1)
          .then(([u]) => { if (u) sendDepositConfirmed(u.email, u.name, payment.amount, payment.method).catch(() => {}); })
          .catch(() => {});
      };

      if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.orderId && s.payment_status === "paid") await creditPayment(s.metadata.orderId);
      } else if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.orderId) await creditPayment(pi.metadata.orderId);
      }

      res.json({ received: true });
    } catch (err) {
      logger.error({ err, type: event.type }, "Stripe webhook processing error");
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
