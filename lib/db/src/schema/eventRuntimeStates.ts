import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { competitionsTable } from "./competitions";

export const eventRuntimeStatesTable = pgTable("event_runtime_states", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  sport: text("sport").notNull(),
  competitionId: integer("competition_id").references(() => competitionsTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("internal"),
  providerEventId: text("provider_event_id"),
  state: text("state").notNull().default("ACTIVE"),
  visibilityStatus: text("visibility_status").notNull().default("VISIBLE"),
  feedHealth: text("feed_health").notNull().default("healthy"),
  tradingStatus: text("trading_status").notNull().default("automatic"),
  suspensionReason: text("suspension_reason"),
  lastProviderUpdateAt: timestamp("last_provider_update_at", { withTimezone: true }),
  lastInternalUpdateAt: timestamp("last_internal_update_at", { withTimezone: true }).notNull().defaultNow(),
  lastMarketRecalcAt: timestamp("last_market_recalc_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventRuntimeIdx: uniqueIndex("event_runtime_states_event_idx").on(table.eventId),
}));

export type EventRuntimeState = typeof eventRuntimeStatesTable.$inferSelect;
