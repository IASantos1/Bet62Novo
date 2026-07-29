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
import crypto from "crypto";
import { CONFIG } from "./lib/config.js";
import { timingSafeEqualString } from "./lib/security.js";
import { userIdFromMemberAccount } from "./routes/casino.js";

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

// ── SilentAPI casino wallet callback MUST be registered before express.json() ──
// The signature is an HMAC-SHA256 over the *raw* request body bytes — if
// Express parsed and re-serialized the JSON first, key ordering/whitespace
// could differ from what SilentAPI signed, breaking verification.
app.post(
  "/api/casino/callback",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const secret = CONFIG.SILENTAPI_CALLBACK_SECRET;
    const signature = req.headers["x-signature"];
    if (!secret || typeof signature !== "string") {
      res.status(400).json({ code: 1, msg: "Missing webhook config" });
      return;
    }

    const rawBody = req.body as Buffer;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    if (!timingSafeEqualString(expected, signature)) {
      logger.warn("[casino-callback] signature verification failed");
      res.status(401).json({ code: 1, msg: "Invalid signature" });
      return;
    }

    let payload: {
      serial_number?: string;
      member_account?: string;
      win_amount?: string;
      bet_amount?: string;
      game_uid?: string;
      game_round?: string;
    };
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ code: 1, msg: "Invalid JSON" });
      return;
    }

    const serialNumber = String(payload.serial_number ?? "").trim();
    const memberAccount = String(payload.member_account ?? "").trim();
    if (!serialNumber || !memberAccount) {
      res.status(400).json({ code: 1, msg: "Missing serial_number or member_account" });
      return;
    }
    const userId = userIdFromMemberAccount(memberAccount);
    if (userId === null) {
      logger.warn({ memberAccount }, "[casino-callback] unknown member_account format");
      res.status(400).json({ code: 1, msg: "Unknown member_account" });
      return;
    }

    // Net delta for this round — the provider bundles bet and win into one
    // callback rather than sending them as separate events. Rounded to cents
    // to satisfy insertLedgerEntry's amount format (matches how every other
    // money-moving path in this codebase records amounts).
    const winAmount = Number(payload.win_amount ?? 0);
    const betAmount = Number(payload.bet_amount ?? 0);
    if (!Number.isFinite(winAmount) || !Number.isFinite(betAmount)) {
      res.status(400).json({ code: 1, msg: "Invalid amounts" });
      return;
    }
    const netAmount = (Math.round((winAmount - betAmount) * 100) / 100).toFixed(2);

    try {
      const newBalance = await db.transaction(async (tx) => {
        // Idempotency: onConflictDoNothing on serial_number means a retried
        // callback for the same round applies the balance change at most
        // once, but we still need to answer with the (already-updated)
        // balance either way — SilentAPI's retry logic expects the same
        // success response, not an error, on a duplicate delivery.
        await applyBalanceDelta(tx, {
          userId,
          amount: netAmount,
          kind: "casino_round_settlement",
          idempotencyKey: `casino:${serialNumber}`,
          refType: "casino_round",
          refId: payload.game_round ?? serialNumber,
          metadata: payload,
        });
        const [user] = await tx
          .select({ balance: usersTable.balance })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        return user?.balance;
      });

      if (newBalance === undefined) {
        logger.error({ userId, serialNumber }, "[casino-callback] user not found after balance update");
        res.status(400).json({ code: 1, msg: "Unknown member_account" });
        return;
      }

      res.json({ code: 0, msg: "Success", balance: Number(newBalance) });
    } catch (err) {
      logger.error({ err, userId, serialNumber }, "[casino-callback] processing error");
      res.status(500).json({ code: 1, msg: "Processing failed" });
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
