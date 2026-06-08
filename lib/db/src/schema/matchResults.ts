import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const matchResultsTable = pgTable("match_results", {
  matchId: text("match_id").primaryKey(),
  sport: text("sport").notNull(),
  home: integer("home"),
  away: integer("away"),
  htHome: integer("ht_home"),
  htAway: integer("ht_away"),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  status: text("status"),
  cornersTotal: integer("corners_total"),
  cardsTotal: integer("cards_total"),
  firstGoal: text("first_goal"),
  extras: jsonb("extras"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMatchResultSchema = createInsertSchema(matchResultsTable).omit({ createdAt: true, updatedAt: true });
export type InsertMatchResult = z.infer<typeof insertMatchResultSchema>;
export type MatchResult = typeof matchResultsTable.$inferSelect;
