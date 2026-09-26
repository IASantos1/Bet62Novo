import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-row (id fixed at 1) config for the admin's "Automação de Banners"
// panel — drives services/apiFootball/bannerSync.ts. Defaults to
// mode='auto': the admin shouldn't have to hand-create "Jogos em Destaque"
// banners day to day — the cron fills them in from api-football.com on its
// own, and manual creation (still fully available, see routes/admin.ts's
// featured-banners CRUD) is only a fallback for when the automation can't
// run (no API_FOOTBALL_KEY configured, no template has a league id, etc.).
// A dedicated typed table instead of platformSettings' key/value pairs,
// since this needs several real types (two JSONB arrays, several
// ints/booleans) rather than strings.
export const bannerAutomationSettingsTable = pgTable("banner_automation_settings", {
  id: integer("id").primaryKey().default(1),
  mode: text("mode").notNull().default("auto"), // 'manual' | 'auto'
  quantidade: integer("quantidade").notNull().default(3),
  criterio: text("criterio").notNull().default("upcoming"), // 'upcoming' | 'live' | 'custom'
  antecedenciaMinutes: integer("antecedencia_minutes").notNull().default(120),
  mostrarAoVivo: boolean("mostrar_ao_vivo").notNull().default(true),
  manterAposTermino: boolean("manter_apos_termino").notNull().default(false),
  // NULL = "Automático" — the row is retired once the real match state
  // says so, instead of a fixed timer.
  tempoParaSubstituirMinutes: integer("tempo_para_substituir_minutes"),
  // Arrays of banner_templates.id. Empty allowedCompetitionIds means "all
  // templates with an apiFootballLeagueId are allowed".
  allowedCompetitionIds: jsonb("allowed_competition_ids").notNull().default([]),
  excludedCompetitionIds: jsonb("excluded_competition_ids").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BannerAutomationSettings = typeof bannerAutomationSettingsTable.$inferSelect;
