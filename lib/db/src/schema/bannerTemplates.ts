import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Admin-curated visual templates for "Jogos em Destaque" banners, one per
// competition (Champions League, La Liga, Brasileirão Série A, ...). Picking
// a template when scheduling a featured match (see featuredMatchBanners.ts)
// fills in the competition's logo + colors automatically instead of the
// admin typing a free-text competition name — see FeaturedMatchBanner.
export const bannerTemplatesTable = pgTable(
  "banner_templates",
  {
    id: serial("id").primaryKey(),
    sport: text("sport").notNull().default("football"),
    competitionName: text("competition_name").notNull(),
    // Same "admin pastes a URL" convention as casino_banners.image_url —
    // there's no file-upload-to-storage pipeline anywhere in this repo.
    // Nullable: a template without a logo falls back to a generic geometric
    // placeholder in the CompetitionBanner render.
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").notNull().default("#1e3a8a"),
    secondaryColor: text("secondary_color").notNull().default("#0f172a"),
    accentColor: text("accent_color").notNull().default("#dc2626"),
    // Real api-football.com league id (e.g. 2 = Champions League) — the
    // same number already embedded in logoUrl for every starter template.
    // Nullable: a template with no league id is never offered as a target
    // for the automation sync (services/apiFootball/bannerSync.ts), only
    // usable for manually-scheduled banners.
    apiFootballLeagueId: integer("api_football_league_id"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Lets init.ts's starter-template seed use ON CONFLICT DO NOTHING —
    // idempotent across every boot, same as the CREATE TABLE IF NOT EXISTS
    // blocks around it — without stopping the admin from adding more
    // templates for the same competition name under a different sport.
    sportCompetitionIdx: uniqueIndex("banner_templates_sport_competition_idx").on(
      table.sport,
      table.competitionName,
    ),
  }),
);

export type BannerTemplate = typeof bannerTemplatesTable.$inferSelect;
