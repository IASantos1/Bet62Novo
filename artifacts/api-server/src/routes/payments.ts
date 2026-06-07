import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendDepositConfirmed } from "../lib/mailer";
import { applyBalanceDelta } from "../lib/ledger";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const MBWAY_KEY       = process.env.IFTHENPAY_MBWAY_KEY       || "";
const MULTIBANCO_KEY  = process.env.IFTHENPAY_MULTIBANCO_KEY  || "";
const CARD_KEY        = process.env.IFTHENPAY_CARD_KEY        || "";
// Anti-tampering key: included in all callback/return URLs so only ifthenpay
// can trigger them. Verified on every incoming callback/card-return request.
const BACKOFFICE_KEY  = process.env.IFTHENPAY_BACKOFFICE_KEY  || "";
if (process.env.NODE_ENV === "production" && !BACKOFFICE_KEY) {
  throw new Error("[SECURITY] IFTHENPAY_BACKOFFICE_KEY environment variable is not set.");
}

function getBaseUrl(req: Request): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  const host = req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

// ─── POST /api/payments/multibanco ──────────────────────────────────────────
router.post("/multibanco", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }

  const orderId = randomUUID();
  const amountStr = amount.toFixed(2);

  try {
    // Include anti-tampering key in callback URL so the handler can verify
    // that the request comes from ifthenpay, not from an attacker
    const callbackUrl = BACKOFFICE_KEY
      ? `${getBaseUrl(req)}/api/payments/callback?key=${encodeURIComponent(BACKOFFICE_KEY)}`
      : `${getBaseUrl(req)}/api/payments/callback`;

    const ifthenpayRes = await fetch("https://ifthenpay.com/api/multibanco/reference/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mbKey: MULTIBANCO_KEY,
        orderId,
        amount: amountStr,
        callbackUrl,
      }),
    });

    const data = await ifthenpayRes.json() as {
      Status?: string;
      Message?: string;
      RequestId?: string;
      Entity?: string;
      Reference?: string;
      ExpiryDate?: string;
    };

    if (!ifthenpayRes.ok || (data.Status !== "0" && data.Status !== undefined && data.Status !== "")) {
      logger.error({ data }, "ifthenpay multibanco error");
      res.status(502).json({ error: "Erro ao gerar referência Multibanco. Tente novamente." });
      return;
    }

    const expiresAt = data.ExpiryDate ? new Date(data.ExpiryDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amountStr,
      method: "multibanco",
      status: "pending",
      entity: data.Entity,
      reference: data.Reference,
      requestId: data.RequestId,
      expiresAt,
    });

    res.json({
      orderId,
      entity: data.Entity,
      reference: data.Reference,
      amount: amountStr,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Multibanco payment error");
    res.status(500).json({ error: "Erro interno ao processar pagamento." });
  }
});

// ─── POST /api/payments/mbway ────────────────────────────────────────────────
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
  const amountStr = amount.toFixed(2);
  const phoneClean = phone.replace(/\s/g, "");
  const mobileNumber = `351#${phoneClean}`;

  try {
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

    const ifthenpayRes = await fetch("https://ifthenpay.com/api/spg/payment/mbway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mbWayKey: MBWAY_KEY,
        orderId,
        amount: amountStr,
        mobileNumber,
        email: user?.email ?? "",
        description: `Depósito Bet62 — €${amountStr}`,
      }),
    });

    const data = await ifthenpayRes.json() as {
      Message?: string;
      Status?: string;
      RequestId?: string;
    };

    if (!ifthenpayRes.ok || data.Status === "122") {
      logger.error({ data }, "ifthenpay mbway error");
      res.status(502).json({ error: "Erro ao enviar pedido MB WAY. Verifique o número e tente novamente." });
      return;
    }

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amountStr,
      method: "mbway",
      status: "pending",
      requestId: data.RequestId,
      expiresAt: new Date(Date.now() + 4 * 60 * 1000),
    });

    res.json({ orderId, requestId: data.RequestId, message: data.Message });
  } catch (err) {
    logger.error({ err }, "MB WAY payment error");
    res.status(500).json({ error: "Erro interno ao processar pagamento." });
  }
});

// ─── POST /api/payments/card ─────────────────────────────────────────────────
router.post("/card", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  if (!amount || typeof amount !== "number" || amount < 10 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €10, máximo €5000." });
    return;
  }

  const orderId = randomUUID();
  const amountStr = amount.toFixed(2);
  const base = getBaseUrl(req);

  try {
    const ifthenpayRes = await fetch("https://ifthenpay.com/api/gateway/paymentUrl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardKey: CARD_KEY,
        orderId,
        amount: amountStr,
        // Anti-tampering key appended so card-return can verify the redirect
        // comes from ifthenpay and not from the user crafting the URL manually
        successUrl: `${base}/api/payments/card-return?status=success&orderId=${orderId}${BACKOFFICE_KEY ? `&key=${encodeURIComponent(BACKOFFICE_KEY)}` : ""}`,
        errorUrl:   `${base}/api/payments/card-return?status=error&orderId=${orderId}`,
        cancelUrl:  `${base}/api/payments/card-return?status=cancel&orderId=${orderId}`,
      }),
    });

    const data = await ifthenpayRes.json() as {
      Message?: string;
      Status?: string;
      PaymentUrl?: string;
      RequestId?: string;
    };

    if (!ifthenpayRes.ok || !data.PaymentUrl) {
      logger.error({ data }, "ifthenpay card error");
      res.status(502).json({ error: "Erro ao iniciar pagamento por cartão. Tente novamente." });
      return;
    }

    await db.insert(paymentsTable).values({
      orderId,
      userId: req.user!.id,
      amount: amountStr,
      method: "card",
      status: "pending",
      requestId: data.RequestId,
      paymentUrl: data.PaymentUrl,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    res.json({ orderId, paymentUrl: data.PaymentUrl });
  } catch (err) {
    logger.error({ err }, "Card payment error");
    res.status(500).json({ error: "Erro interno ao processar pagamento." });
  }
});

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

// ─── GET /api/payments/status/:orderId ───────────────────────────────────────
// Frontend polls this to detect when payment is confirmed and balance was credited
router.get("/status/:orderId", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = String(req.params["orderId"]);
  try {
    const [payment] = await db
      .select({
        status: paymentsTable.status,
        amount: paymentsTable.amount,
        method: paymentsTable.method,
        userId: paymentsTable.userId,
      })
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

// ─── GET /api/payments/callback ──────────────────────────────────────────────
// Called by ifthenpay when a payment is confirmed (Multibanco & MB WAY).
// The URL includes ?key=BACKOFFICE_KEY as anti-tampering protection —
// any request without the correct key is rejected immediately.
router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const { orderId, amount, requestId, key } = req.query as Record<string, string>;

  // Anti-tampering: verify the key matches what we embedded in the callback URL.
  // BACKOFFICE_KEY is empty only in local dev without the env var — skip check then.
  if (BACKOFFICE_KEY && key !== BACKOFFICE_KEY) {
    logger.warn({ orderId, ip: req.ip }, "Callback rejected: invalid anti-tampering key");
    res.status(403).send("Forbidden");
    return;
  }

  if (!orderId) {
    res.status(400).send("Missing orderId");
    return;
  }

  try {
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).limit(1);
    if (!payment) {
      logger.warn({ orderId }, "Callback for unknown orderId");
      res.status(404).send("Order not found");
      return;
    }

    if (payment.status === "completed") {
      res.send("OK");
      return;
    }

    const paidAmount = parseFloat(amount || "0");
    const expectedAmount = parseFloat(payment.amount);
    if (Math.abs(paidAmount - expectedAmount) > 0.01) {
      logger.warn({ orderId, paidAmount, expectedAmount }, "Amount mismatch in callback");
      res.status(400).send("Amount mismatch");
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(paymentsTable).set({ status: "completed", requestId: requestId || payment.requestId }).where(eq(paymentsTable.orderId, orderId));
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

    // Grant freebet if this is the first deposit
    void grantFirstDepositFreebet(payment.userId, parseFloat(payment.amount));

    // Fire-and-forget deposit confirmation email
    db.select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, payment.userId))
      .limit(1)
      .then(([user]) => {
        if (user) {
          sendDepositConfirmed(user.email, user.name, payment.amount, payment.method).catch(() => {});
        }
      })
      .catch((err) => { logger.error({ err, userId: payment.userId }, "Failed to look up user for deposit email"); });

    res.send("OK");
  } catch (err) {
    logger.error({ err, orderId }, "Callback processing error");
    res.status(500).send("Internal error");
  }
});

// ─── GET /api/payments/card-return ───────────────────────────────────────────
router.get("/card-return", async (req: Request, res: Response): Promise<void> => {
  const { status, orderId, key } = req.query as Record<string, string>;

  const domains = process.env.REPLIT_DOMAINS;
  const base = domains ? `https://${domains.split(",")[0]}` : "/";

  // Anti-tampering: only credit balance when the key matches the one we embedded
  // in the successUrl. Without this, a user who knows their orderId could hit this
  // endpoint before actually paying and get free credit.
  if (status === "success" && BACKOFFICE_KEY && key !== BACKOFFICE_KEY) {
    logger.warn({ orderId, ip: req.ip }, "Card-return rejected: invalid anti-tampering key");
    res.redirect(`${base}/?payment=error`);
    return;
  }

  if (status === "success" && orderId) {
    try {
      const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).limit(1);
      if (payment && payment.status === "pending") {
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

        // Grant freebet if this is the first deposit
        void grantFirstDepositFreebet(payment.userId, parseFloat(payment.amount));

        // Fire-and-forget deposit confirmation email
        db.select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, payment.userId))
          .limit(1)
          .then(([user]) => {
            if (user) {
              sendDepositConfirmed(user.email, user.name, payment.amount, payment.method).catch(() => {});
            }
          })
          .catch((err) => { logger.error({ err, userId: payment.userId }, "Failed to look up user for deposit email"); });
      }
    } catch (err) {
      logger.error({ err, orderId }, "Card return processing error");
    }
  }

  res.redirect(`${base}/?payment=${status ?? "unknown"}`);
});

export default router;
