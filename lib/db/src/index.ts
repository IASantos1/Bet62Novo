import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL_NO_SSL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const ssl =
  process.env.PGSSLMODE === "require" ||
  /\bsupabase\.co\b/i.test(connectionString) ||
  /\bsupabase\.com\b/i.test(connectionString) ||
  /\bneon\.tech\b/i.test(connectionString) ||
  /\bsslmode=require\b/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;

export const pool = new Pool({ connectionString, ssl });
export const db = drizzle(pool, { schema });

export * from "./schema";
