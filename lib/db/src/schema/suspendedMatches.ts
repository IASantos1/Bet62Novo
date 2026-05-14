import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const suspendedMatchesTable = pgTable("suspended_matches", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull().unique(),
  matchTitle: text("match_title").notNull(),
  sport: text("sport").notNull().default("football"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SuspendedMatch = typeof suspendedMatchesTable.$inferSelect;
