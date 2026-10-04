import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { desc } from "drizzle-orm";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth.js";
import { logger } from "../lib/logger.js";
// Relative import — see affiliates.ts's comment (tsc alias-resolution quirk
// for newly-added schema exports within a single typecheck run).
import { telegramPostsTable } from "../../../../lib/db/src/schema/telegramPosts.js";
import { isTelegramConfigured, sendTelegramMessage } from "../lib/telegram/client.js";
import { formatTelegramPost, isTelegramPostType } from "../lib/telegram/format.js";

const router: IRouter = Router();

// History of posts published to the Telegram channel, newest first — powers
// the admin panel's publish log.
router.get("/telegram/posts", adminMiddleware, async (_req: AdminRequest, res) => {
  try {
    const posts = await db
      .select()
      .from(telegramPostsTable)
      .orderBy(desc(telegramPostsTable.id))
      .limit(100);
    res.json({ posts, configured: isTelegramConfigured() });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/telegram/posts error");
    res.status(500).json({ error: "Erro ao listar publicações" });
  }
});

// Publishes a formatted post to the Telegram channel and records the
// outcome (success or failure) as a telegram_posts row either way, so a
// failed send still shows up in the admin's history with its error.
router.post("/telegram/posts", adminMiddleware, async (req: AdminRequest, res) => {
  if (!isTelegramConfigured()) {
    res.status(503).json({ error: "Telegram não está configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID)." });
    return;
  }

  try {
    const body = req.body as Record<string, unknown>;
    const type = body["type"];
    const title = String(body["title"] ?? "").trim();
    const text = String(body["body"] ?? "").trim();
    const ctaText = body["ctaText"] ? String(body["ctaText"]).trim() : undefined;
    const ctaUrl = body["ctaUrl"] ? String(body["ctaUrl"]).trim() : undefined;

    if (!isTelegramPostType(type)) {
      res.status(400).json({ error: "type deve ser 'custom', 'promotion' ou 'bet_ticket'." });
      return;
    }
    if (!title || !text) {
      res.status(400).json({ error: "title e body são obrigatórios." });
      return;
    }
    if (ctaText && !ctaUrl) {
      res.status(400).json({ error: "ctaUrl é obrigatório quando ctaText é definido." });
      return;
    }

    const html = formatTelegramPost({ type, title, body: text });
    const result = await sendTelegramMessage({ html, ctaText, ctaUrl });
    const sent = result.status === "sent";
    const sendError = result.status === "failed" ? result.error : null;
    const messageId = result.status === "sent" ? result.messageId : null;

    const [row] = await db
      .insert(telegramPostsTable)
      .values({
        type,
        title,
        body: text,
        ctaText: ctaText ?? null,
        ctaUrl: ctaUrl ?? null,
        status: result.status,
        telegramMessageId: messageId,
        error: sendError,
        createdBy: req.admin?.username ?? null,
        sentAt: sent ? new Date() : null,
      })
      .returning();

    if (!sent) {
      res.status(502).json({ error: sendError, post: row });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, "POST /api/admin/telegram/posts error");
    res.status(500).json({ error: "Erro ao publicar no Telegram" });
  }
});

export default router;
