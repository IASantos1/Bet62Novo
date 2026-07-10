import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { betsTable } from "./bets";

export const settlementIdempotencyTable = pgTable(
  "settlement_idempotency",
  {
    id: serial("id").primaryKey(),

    jobId: text("job_id").notNull(),

    betId: integer("bet_id")
      .notNull()
      .references(() => betsTable.id),

    trigger: text("trigger").notNull(), // auto, manual, retry, cron

    oldStatus: text("old_status"),
    newStatus: text("new_status"),

    matchId: text("match_id"),

    engineVersion: text("engine_version"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    jobIdIdx: uniqueIndex("settlement_idempotency_jobid_idx").on(table.jobId),
  }),
);

export type SettlementIdempotency =
  typeof settlementIdempotencyTable.$inferSelect;
