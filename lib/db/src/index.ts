import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

if (!process.env.DATABASE_URL) {
  console.warn(
    "[WARNING] DATABASE_URL is not set. The database connection will be unavailable. " +
    "The app is starting in offline mode — all database operations will fail at runtime. " +
    "Set DATABASE_URL in your deployment configuration to restore full functionality."
  );
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

export { pool, db };
export * from "./schema";

