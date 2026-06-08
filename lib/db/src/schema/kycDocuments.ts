import { pgTable, text, serial, timestamp, integer, customType } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

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
