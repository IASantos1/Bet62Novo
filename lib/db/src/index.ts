import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "[WARNING] DATABASE_URL is not set. The database connection will be unavailable. " +
    "The app is starting in offline mode — all database operations will fail at runtime. " +
    "Set DATABASE_URL in your deployment configuration to restore full functionality.",
  );
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

export * from "./schema";
