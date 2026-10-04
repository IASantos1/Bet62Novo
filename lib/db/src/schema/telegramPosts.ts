import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// History of posts published from the admin panel to the BET62 Telegram
// channel (lib/telegram/client.ts, routes/adminTelegram.ts). One row per
// publish attempt, success or failure, so the admin panel can show a send
// history and the error for anything that failed.
export const telegramPostsTable = pgTable("telegram_posts", {
  id: serial("id").primaryKey(),
  // "custom" | "promotion" | "bet_ticket" — which formatter built the body.
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  ctaText: text("cta_text"),
  ctaUrl: text("cta_url"),
  // "sent" | "failed"
  status: text("status").notNull(),
  telegramMessageId: text("telegram_message_id"),
  error: text("error"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export type TelegramPostRow = typeof telegramPostsTable.$inferSelect;
export type InsertTelegramPost = typeof telegramPostsTable.$inferInsert;
