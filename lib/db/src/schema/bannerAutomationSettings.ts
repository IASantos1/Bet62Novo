import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-row (id fixed at 1) config for the admin's "Automação de Banners"
// panel — drives services/apiFootball/bannerSync.ts. Defaults to
// mode='manual' so nothing changes in behavior until an admin explicitly
// opts into automatic sync from api-football.com. A dedicated typed table
// instead of platformSettings' key/value pairs, since this needs several
// real types (two JSONB arrays, several ints/booleans) rather than strings.
export const bannerAutomationSettingsTable = pgTable("banner_automation_settings", {
  id: integer("id").primaryKey().default(1),
  mode: text("mode").notNull().default("manual"), // 'manual' | 'auto'
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
