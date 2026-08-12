import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from monorepo ROOT (two levels above this file). Works both for
// `pnpm --filter @workspace/db push` from the root, and for direct drizzle-kit
// invocations from inside lib/db/. We deliberately load BOTH root + local .env
// and let dotenv leave existing process.env values untouched (never overwrite).
const rootEnvPath = path.resolve(__dirname, "../../.env");
const localEnvPath = path.resolve(__dirname, ".env");
try { dotenv.config({ path: rootEnvPath, override: false }); } catch {}
try { dotenv.config({ path: localEnvPath, override: false }); } catch {}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned (expected in root .env). See .env.example.");
}

export default defineConfig({
  schema: [path.posix.join(__dirname.replace(/\\/g, "/"), "./src/schema/**/*.ts")],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl:
      process.env.DB_SSL_NO_VERIFY === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  },
});
