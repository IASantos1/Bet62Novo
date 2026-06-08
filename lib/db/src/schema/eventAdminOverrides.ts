import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { competitionsTable } from "./competitions";

export const eventAdminOverridesTable = pgTable("event_admin_overrides", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  competitionId: integer("competition_id").references(() => competitionsTable.id, { onDelete: "set null" }),
  hiddenByAdmin: boolean("hidden_by_admin").notNull().default(false),
  forceSuspend: boolean("force_suspend").notNull().default(false),
  forceCashoutDisable: boolean("force_cashout_disable").notNull().default(false),
  overridePriority: integer("override_priority"),
  overrideState: text("override_state"),
  overrideVisibilityStatus: text("override_visibility_status"),
  overrideTradingStatus: text("override_trading_status"),
  overrideNote: text("override_note"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventOverrideIdx: uniqueIndex("event_admin_overrides_event_idx").on(table.eventId),
}));

export type EventAdminOverride = typeof eventAdminOverridesTable.$inferSelect;
