import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const manualReviewQueueTable = pgTable("manual_review_queue", {
  id: serial("id").primaryKey(),
  betId: integer("bet_id").notNull(),
  matchId: text("match_id").notNull(),
  reason: text("reason").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("pending"),
  settlementResult: jsonb("settlement_result"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ManualReviewQueueItem = typeof manualReviewQueueTable.$inferSelect;
export type InsertManualReviewQueueItem = typeof manualReviewQueueTable.$inferInsert;
