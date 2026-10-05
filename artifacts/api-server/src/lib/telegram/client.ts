import { CONFIG } from "../config.js";
import { logger } from "../logger.js";

export function isTelegramConfigured(): boolean {
  return Boolean(CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHANNEL_ID);
}

// Telegram's HTML parse_mode only needs these three escaped — escaping more
// (e.g. quotes) breaks nothing but isn't required.
// https://core.telegram.org/bots/api#html-style
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type TelegramSendResult =
  | { status: "sent"; messageId: string }
  | { status: "failed"; error: string };

// Minimal Bot API wrapper — sendMessage with either a single CTA button
// ("APOSTAR AGORA" linking back to the app) or a full multi-row inline
// keyboard (inlineKeyboard takes priority when both are passed). No
// retry/queue here: a failed send surfaces immediately to the admin who
// clicked publish, same as any other admin-panel action, rather than
// silently retrying later.
export async function sendTelegramMessage(args: {
  html: string;
  ctaText?: string;
  ctaUrl?: string;
  inlineKeyboard?: Array<Array<{ text: string; url: string }>>;
}): Promise<TelegramSendResult> {
  if (!isTelegramConfigured()) {
    return { status: "failed", error: "Telegram não está configurado" };
  }

  const body: Record<string, unknown> = {
    chat_id: CONFIG.TELEGRAM_CHANNEL_ID,
    text: args.html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (args.inlineKeyboard && args.inlineKeyboard.length > 0) {
    body["reply_markup"] = { inline_keyboard: args.inlineKeyboard };
  } else if (args.ctaText && args.ctaUrl) {
    body["reply_markup"] = {
      inline_keyboard: [[{ text: args.ctaText, url: args.ctaUrl }]],
    };
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (!resp.ok || !data.ok) {
      logger.error({ status: resp.status, description: data.description }, "Telegram sendMessage failed");
      return { status: "failed", error: data.description || `Telegram HTTP ${resp.status}` };
    }
    return { status: "sent", messageId: String(data.result?.message_id ?? "") };
  } catch (err) {
    logger.error({ err }, "Telegram sendMessage errored");
    return { status: "failed", error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
