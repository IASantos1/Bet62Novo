import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
// customType is imported from its own subpath, not the "drizzle-orm/pg-core"
// barrel — under this project's moduleResolution:"bundler" setting, TS fails
// to resolve `customType` through that barrel's long export* chain even
// though it resolves fine under node10/nodenext (a bundler-resolution quirk).
import { customType } from "drizzle-orm/pg-core/columns/custom";
import { usersTable } from "./users.js";

const bytea = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType() {
    return "bytea";
  },
});

export const kycDocumentsTable = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storagePath: text("storage_path").notNull(),
  fileData: bytea("file_data"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type KycDocument = typeof kycDocumentsTable.$inferSelect;
