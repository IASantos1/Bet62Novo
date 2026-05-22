const isProduction = process.env.NODE_ENV === "production";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required but was not provided.`);
  }
  return value;
}

export const SESSION_SECRET = isProduction
  ? requireEnv("SESSION_SECRET")
  : (process.env.SESSION_SECRET ?? "dev_secret");

export const ADMIN_USERNAME = isProduction
  ? requireEnv("ADMIN_USERNAME")
  : (process.env.ADMIN_USERNAME ?? "admin");

export const ADMIN_PASSWORD = isProduction
  ? requireEnv("ADMIN_PASSWORD")
  : (process.env.ADMIN_PASSWORD ?? "admin");

export const ADMIN_EMAIL = isProduction
  ? requireEnv("ADMIN_EMAIL")
  : (process.env.ADMIN_EMAIL ?? "admin@example.com");

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}
