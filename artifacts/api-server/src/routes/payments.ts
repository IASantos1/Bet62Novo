import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const MBWAY_KEY = process.env.IFTHENPAY_MBWAY_KEY || "";
const MULTIBANCO_KEY = process.env.IFTHENPAY_MULTIBANCO_KEY || "";
const CARD_KEY = process.env.IFTHENPAY_CARD_KEY || "";

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
  if (!amount || typeof amount !== "number" || amount < 5 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €5, máximo €5000." });
    return;
  }

  const orderId = randomUUID();
  const amountStr = amount.toFixed(2);

  try {
    const callbackUrl = `${getBaseUrl(req)}/api/payments/callback`;

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
  if (!amount || typeof amount !== "number" || amount < 5 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €5, máximo €5000." });
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
      expiresAt: new Date(Date.now() + 4 * 60 * 1000), // 4 minutes
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
  if (!amount || typeof amount !== "number" || amount < 5 || amount > 5000) {
    res.status(400).json({ error: "Valor inválido. Mínimo €5, máximo €5000." });
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
        successUrl: `${base}/api/payments/card-return?status=success&orderId=${orderId}`,
        errorUrl: `${base}/api/payments/card-return?status=error&orderId=${orderId}`,
        cancelUrl: `${base}/api/payments/card-return?status=cancel&orderId=${orderId}`,
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

// ─── GET /api/payments/callback ──────────────────────────────────────────────
// Called by ifthenpay when a payment is confirmed (Multibanco & MB WAY)
router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const { orderId, amount, requestId } = req.query as Record<string, string>;

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

    // Validate amount matches (± 0.01 tolerance)
    const paidAmount = parseFloat(amount || "0");
    const expectedAmount = parseFloat(payment.amount);
    if (Math.abs(paidAmount - expectedAmount) > 0.01) {
      logger.warn({ orderId, paidAmount, expectedAmount }, "Amount mismatch in callback");
      res.status(400).send("Amount mismatch");
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(paymentsTable).set({ status: "completed", requestId: requestId || payment.requestId }).where(eq(paymentsTable.orderId, orderId));
      await tx.update(usersTable).set({
        balance: sql`${usersTable.balance} + ${payment.amount}`,
      }).where(eq(usersTable.id, payment.userId));
    });

    logger.info({ orderId, userId: payment.userId, amount: payment.amount }, "Payment confirmed and balance credited");
    res.send("OK");
  } catch (err) {
    logger.error({ err, orderId }, "Callback processing error");
    res.status(500).send("Internal error");
  }
});

// ─── GET /api/payments/card-return ───────────────────────────────────────────
// Redirect target after card payment (success / error / cancel)
router.get("/card-return", async (req: Request, res: Response): Promise<void> => {
  const { status, orderId } = req.query as Record<string, string>;

  if (status === "success" && orderId) {
    try {
      const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).limit(1);
      if (payment && payment.status === "pending") {
        await db.transaction(async (tx) => {
          await tx.update(paymentsTable).set({ status: "completed" }).where(eq(paymentsTable.orderId, orderId));
          await tx.update(usersTable).set({
            balance: sql`${usersTable.balance} + ${payment.amount}`,
          }).where(eq(usersTable.id, payment.userId));
        });
      }
    } catch (err) {
      logger.error({ err, orderId }, "Card return processing error");
    }
  }

  // Redirect back to the app
  const base = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "/";
  res.redirect(`${base}/?payment=${status}`);
});

// ─── GET /api/payments/status/:orderId ───────────────────────────────────────
router.get("/status/:orderId", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = String(req.params["orderId"]);
  try {
    const [payment] = await db.select({
      status: paymentsTable.status,
      amount: paymentsTable.amount,
      method: paymentsTable.method,
    }).from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).limit(1);

    if (!payment) {
      res.status(404).json({ error: "Pagamento não encontrado" });
      return;
    }
    res.json(payment);
  } catch (err) {
    logger.error({ err }, "Payment status check error");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
