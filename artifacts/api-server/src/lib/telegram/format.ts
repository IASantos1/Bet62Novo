import { escapeTelegramHtml } from "./client.js";

export type TelegramPostType = "custom" | "promotion" | "bet_ticket";

const TYPE_PREFIX: Record<TelegramPostType, string> = {
  custom: "",
  promotion: "🎁 ",
  bet_ticket: "🎟️ ",
};

export function isTelegramPostType(value: unknown): value is TelegramPostType {
  return value === "custom" || value === "promotion" || value === "bet_ticket";
}

// Builds the HTML sent to Telegram (parse_mode: "HTML") from the admin's
// plain-text title/body — the only formatting applied is a bold title, a
// type-specific emoji prefix, and preserving the admin's own line breaks.
export function formatTelegramPost(args: { type: TelegramPostType; title: string; body: string }): string {
  const title = escapeTelegramHtml(args.title.trim());
  const body = escapeTelegramHtml(args.body.trim());
  const prefix = TYPE_PREFIX[args.type];
  return `<b>${prefix}${title}</b>\n\n${body}`;
}
