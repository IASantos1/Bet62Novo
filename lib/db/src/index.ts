import { drizzle } from "drizzle-orm/node-postgres";
import * as pg from "pg";
import * as schema from "./schema/index.js";

// =============== IMPORTS EXPLÍCITOS DAS 3 TABELAS NOVAS ===============
// Resolve de uma vez por todas o erro "Module has no exported member".
// Usamos exports NOMEADOS e DIRETOS (não dependemos mais de export * chain)
// para que a IDE consiga resolver os símbolos instantaneamente.
import {
  apiFootballNameMismatchesTable,
  type ApiFootballNameMismatch,
} from "./schema/apiFootballNameMismatches.js";
import {
  apiFootballTeamMappingsTable,
  type ApiFootballTeamMapping,
} from "./schema/apiFootballTeamMappings.js";
import {
  apiFootballFixtureMappingsTable,
  type ApiFootballFixtureMapping,
} from "./schema/apiFootballFixtureMappings.js";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const DB_SSL_NO_VERIFY = process.env.DB_SSL_NO_VERIFY === "true";
const _sslCfg = DB_SSL_NO_VERIFY ? { rejectUnauthorized: false } : undefined;

let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;

if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL, ssl: _sslCfg });
  db = drizzle(pool, { schema });
} else {
  // For development only, we'll create a mock that throws helpful errors
  const mockPool = {
    connect: () => { throw new Error("DATABASE_URL environment variable is not set"); },
    query: () => { throw new Error("DATABASE_URL environment variable is not set"); },
    end: () => {},
  } as unknown as pg.Pool;
  
  const mockDb = {
    select: () => { throw new Error("DATABASE_URL environment variable is not set"); },
    insert: () => { throw new Error("DATABASE_URL environment variable is not set"); },
    update: () => { throw new Error("DATABASE_URL environment variable is not set"); },
    delete: () => { throw new Error("DATABASE_URL environment variable is not set"); },
  } as unknown as ReturnType<typeof drizzle>;
  
  pool = mockPool;
  db = mockDb;
}

export { pool, db };
export * from "./schema/index.js";

// ============ EXPORTS EXPLÍCITOS (GARANTIDOS) DAS 3 TABELAS ============
export {
  apiFootballNameMismatchesTable,
  apiFootballTeamMappingsTable,
  apiFootballFixtureMappingsTable,
};
export type {
  ApiFootballNameMismatch,
  ApiFootballTeamMapping,
  ApiFootballFixtureMapping,
};

export { initDb } from "./init.js";
