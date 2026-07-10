import { pgTable, text, serial, timestamp, integer, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const betsTable = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  matchId: text("match_id").notNull(),
  matchTitle: text("match_title").notNull(),
  selections: jsonb("selections").notNull(),
  stake: decimal("stake", { precision: 10, scale: 2 }).notNull(),
  potentialWin: decimal("potential_win", { precision: 10, scale: 2 }).notNull(),
  totalOdds: decimal("total_odds", { precision: 10, scale: 2 }).notNull(),
  isFreebet: text("is_freebet").notNull().default("false"),
  status: text("status").notNull().default("pending"), // pending, won, lost, cashed_out, voided
  kickoffTime: timestamp("kickoff_time", { withTimezone: true }),
  cashoutValue: decimal("cashout_value", { precision: 10, scale: 2 }),

  // Controle de concorrência otimista
  version: integer("version").notNull().default(1),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // Atualizado sempre que a aposta é alterada
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBetSchema = createInsertSchema(betsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof betsTable.$inferSelect;
