import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

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
  // "sent" (posted, still pré-jogo) | "failed" | "live" | "finished" | "deleted"
  // — the PREMATCH -> LIVE -> FINISHED -> DELETE lifecycle (2026-10-05)
  // edits/deletes this SAME row's message as the game progresses, it never
  // inserts a second row for the same game_id (see the partial unique index
  // in init.ts, now guarding every status except "failed").
  status: text("status").notNull(),
  telegramMessageId: text("telegram_message_id"),
  error: text("error"),
  // Last score/minute seen from /ajax/livegames — null until the game is
  // first observed live. Kept as plain columns (not re-derived) so the
  // FINISHED message can show the last known score even on the tick where
  // the fixture has already dropped out of livegames.
  scoreHome: integer("score_home"),
  scoreAway: integer("score_away"),
  currentMinute: text("current_minute"),
  // "<resultRaw>|<currentMinute>" as last sent to Telegram — lets the live
  // monitor skip editMessageText when nothing actually changed since the
  // previous tick, instead of editing on every poll.
  lastSignature: text("last_signature"),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
  // Consecutive live-monitor ticks where this game was expected in
  // /ajax/livegames (status="live") but wasn't found there. Reaching
  // WINHOUSE_FINISH_CONFIRM_MISSES confirms FINISHED rather than a
  // momentary feed hiccup.
  liveMisses: integer("live_misses").notNull().default(0),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  // When the delete worker should call Telegram's deleteMessage — set once,
  // on the FINISHED transition, to finishedAt + TELEGRAM_EVENT_DELETE_DELAY_MS.
  deleteAt: timestamp("delete_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WinHousePromotionPostRow = typeof winhousePromotionPostsTable.$inferSelect;
export type InsertWinHousePromotionPost = typeof winhousePromotionPostsTable.$inferInsert;
