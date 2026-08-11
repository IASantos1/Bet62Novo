import { boolean, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Audit trail for the "BET62 Brain" natural-language admin console
// (lib/aiAgents/console.ts, user request 2026-08-11) — every command an
// admin types, which tool the model mapped it to (or null if it couldn't),
// and the outcome. Kept separate from ai_agent_runs/ai_agent_proposals
// since a console command isn't a scheduled agent analysis — it's a
// human-issued instruction the model only ever translates into one call
// of an already-existing, already-safe function (see console.ts's
// TOOL_REGISTRY). Exists mainly so "quem mandou suspender este evento, e
// quando" has a real answer beyond server logs.
export const aiConsoleCommandsTable = pgTable("ai_console_commands", {
  id: serial("id").primaryKey(),
  adminUsername: text("admin_username").notNull(),
  message: text("message").notNull(),
  toolUsed: text("tool_used"),
  params: jsonb("params"),
  resultSummary: text("result_summary"),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiConsoleCommand = typeof aiConsoleCommandsTable.$inferSelect;
