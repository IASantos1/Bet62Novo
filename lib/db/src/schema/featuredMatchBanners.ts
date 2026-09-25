import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bannerTemplatesTable } from "./bannerTemplates.js";

// Admin-scheduled "jogo em destaque" banners for the Destaques/home page —
// BET62 has no live match data of its own anymore (the native bsd sports
// engine was retired in favor of WinHouse's sportsbook), so featuring a
// specific game is now a manual, admin-entered schedule instead of
// something derived from a live feed. A banner is public (shown on
// Destaques) exactly between kickoffAt and endsAt, and the "Apostar"
// button just opens the Sportsbook tab — there's no way to deep-link the
// WinHouse iframe to one specific match.
export const featuredMatchBannersTable = pgTable(
  "featured_match_banners",
  {
    id: serial("id").primaryKey(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    competition: text("competition"),
    // The template the admin picked when scheduling this match — the source
    // of truth for how the banner is drawn (logo/colors). `competition`
    // above stays a plain denormalized label (kept for anything still
    // reading it as text) filled from bannerTemplate.competitionName at
    // save time. Nullable + ON DELETE SET NULL: deleting a template must
    // never take an already-scheduled banner down with it.
    bannerTemplateId: integer("banner_template_id").references(() => bannerTemplatesTable.id, {
      onDelete: "set null",
    }),
    // Real team crest URLs — either from api-football.com (auto rows) or
    // pasted by the admin (manual rows, same "paste a URL" convention used
    // everywhere else in this repo). Nullable: CompetitionBanner falls back
    // to plain text when either is missing.
    homeTeamLogoUrl: text("home_team_logo_url"),
    awayTeamLogoUrl: text("away_team_logo_url"),
    // The api-football.com fixture id this row was synced from — lets the
    // automation cron (services/apiFootball/bannerSync.ts) upsert instead
    // of duplicating the same match every cycle. NULL for manual rows.
    externalFixtureId: text("external_fixture_id"),
    // 'manual' (admin-entered, never touched by the cron) | 'auto'
    // (cron-managed — created, updated, and retired by the sync job).
    source: text("source").notNull().default("manual"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    // Defaults to kickoffAt + 3h (set by the admin route) — when this passes,
    // the banner stops being returned by the public endpoint on its own,
    // no manual cleanup needed.
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    externalFixtureIdIdx: uniqueIndex("featured_match_banners_external_fixture_id_idx")
      .on(table.externalFixtureId)
      .where(sql`${table.externalFixtureId} IS NOT NULL`),
  }),
);

export type FeaturedMatchBannerRow = typeof featuredMatchBannersTable.$inferSelect;
