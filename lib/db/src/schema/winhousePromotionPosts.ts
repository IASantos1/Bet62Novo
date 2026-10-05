import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// History of the automated WinHouse odds -> Telegram promotion pipeline
// (services/winhouse/promotionScheduler.ts). One row per fixture the
// scheduler ever attempted to publish, success or failure — this is both
// the dedupe log (never post the same fixture twice) and the 10-minute
// publish-pacing clock (the scheduler reads the latest "sent" row's
// created_at to decide if enough time has passed to post another).
export const winhousePromotionPostsTable = pgTable("winhouse_promotion_posts", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull(),
  sport: text("sport").notNull(),
  league: text("league").notNull(),
  // "grande" | "média"
  tier: text("tier").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  // Raw WinHouse "YYYY-MM-DD HH:mm:ss" string, kept as-is (same value shown
  // in the Telegram ticket) — no timezone is confirmed for this feed, so
  // this is never parsed as a Date, only string-sorted and displayed.
  kickoffAt: text("kickoff_at").notNull(),
  // "sent" | "failed"
  status: text("status").notNull(),
  telegramMessageId: text("telegram_message_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WinHousePromotionPostRow = typeof winhousePromotionPostsTable.$inferSelect;
export type InsertWinHousePromotionPost = typeof winhousePromotionPostsTable.$inferInsert;
