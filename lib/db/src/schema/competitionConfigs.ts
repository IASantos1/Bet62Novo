import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { competitionsTable } from "./competitions";

export const competitionConfigsTable = pgTable("competition_configs", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").notNull().references(() => competitionsTable.id, { onDelete: "cascade" }),
  prematchEnabled: boolean("prematch_enabled").notNull().default(true),
  liveEnabled: boolean("live_enabled").notNull().default(true),
  homeEnabled: boolean("home_enabled").notNull().default(false),
  mobileEnabled: boolean("mobile_enabled").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  priority: integer("priority").notNull().default(100),
  displayOrder: integer("display_order").notNull().default(100),
  maxMarkets: integer("max_markets").notNull().default(50),
  cashoutEnabled: boolean("cashout_enabled").notNull().default(true),
  autoSettlementEnabled: boolean("auto_settlement_enabled").notNull().default(true),
  trackingEnabled: boolean("tracking_enabled").notNull().default(true),
  minFeedQualityScore: integer("min_feed_quality_score").notNull().default(40),
  allowUnstableFeedVisibility: boolean("allow_unstable_feed_visibility").notNull().default(true),
  tradingMode: text("trading_mode").notNull().default("automatic"),
  stakeLimitMultiplier: integer("stake_limit_multiplier").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  configCompetitionIdx: uniqueIndex("competition_configs_competition_idx").on(table.competitionId),
}));

export type CompetitionConfig = typeof competitionConfigsTable.$inferSelect;
