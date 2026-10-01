import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

const REVOLUT_BASE_URL =
  CONFIG.REVOLUT_ENVIRONMENT === "production"
    ? "https://b2b.revolut.com/api/1.0"
    : "https://sandbox-b2b.revolut.com/api/1.0";

export function isRevolutConfigured(): boolean {
  return Boolean(
    CONFIG.REVOLUT_CLIENT_ID &&
      CONFIG.REVOLUT_JWT_ISSUER &&
      CONFIG.REVOLUT_PRIVATE_KEY &&
      CONFIG.REVOLUT_REFRESH_TOKEN &&
      CONFIG.REVOLUT_PAYOUT_ACCOUNT_ID,
  );
}

function requireConfigured(): void {
  if (!isRevolutConfigured()) {
    throw Object.assign(new Error("Revolut não está configurado"), { status: 503 });
  }
}

// Cached in-process; a 40-minute access token comfortably outlives a single
// request, so there's no need to persist it anywhere durable.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function buildClientAssertion(): string {
  return jwt.sign(
    { iss: CONFIG.REVOLUT_JWT_ISSUER, sub: CONFIG.REVOLUT_CLIENT_ID, aud: "https://revolut.com" },
    CONFIG.REVOLUT_PRIVATE_KEY,
    { algorithm: "RS256", expiresIn: "5m" },
  );
}

async function fetchAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: CONFIG.REVOLUT_REFRESH_TOKEN,
    client_id: CONFIG.REVOLUT_CLIENT_ID,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: buildClientAssertion(),
  });

  const resp = await fetch(`${REVOLUT_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!resp.ok || !data.access_token) {
    throw Object.assign(
      new Error(`Revolut auth falhou: ${data.error_description || data.error || resp.status}`),
      { status: 502 },
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 2400 };
}

async function getAccessToken(): Promise<string> {
  requireConfigured();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) {
    return cachedToken.accessToken;
  }
  const { accessToken, expiresIn } = await fetchAccessToken();
  cachedToken = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

async function revolutFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const resp = await fetch(`${REVOLUT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!resp.ok) {
    const errMsg =
      data && typeof data === "object" && "message" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>)["message"])
        : `Revolut HTTP ${resp.status}`;
    throw Object.assign(new Error(errMsg), { status: resp.status, body: data });
  }
  return data as T;
}

type RevolutCounterparty = {
  id: string;
  name: string;
  state: string;
};

// IBAN country prefix (first 2 letters) doubles as the ISO country code
// Revolut's counterparty endpoint expects in `bank_country`.
function ibanCountry(iban: string): string {
  return iban.slice(0, 2).toUpperCase();
}

function splitHolderName(holderName: string): { first_name: string; last_name: string } {
  const parts = holderName.trim().split(/\s+/);
  const first_name = parts[0] || holderName.trim();
  const last_name = parts.length > 1 ? parts.slice(1).join(" ") : first_name;
  return { first_name, last_name };
}

// Finds an existing counterparty by IBAN (a player who withdrew before with
// the same IBAN) or creates a new one. Revolut forbids duplicate Revtags but
// not duplicate bank details, so re-creating on a cosmetic name change is
// harmless — we still prefer reuse to avoid growing the counterparty list
// unboundedly.
export async function findOrCreateCounterparty(args: {
  iban: string;
  holderName: string;
}): Promise<string> {
  const existing = await revolutFetch<RevolutCounterparty[]>(
    `/counterparties?iban=${encodeURIComponent(args.iban)}`,
  );
  const match = existing.find((c) => c.state !== "deleted");
  if (match) return match.id;

  const created = await revolutFetch<RevolutCounterparty>("/counterparty", {
    method: "POST",
    body: JSON.stringify({
      profile_type: "personal",
      individual_name: splitHolderName(args.holderName),
      bank_country: ibanCountry(args.iban),
      currency: "EUR",
      iban: args.iban,
    }),
  });
  return created.id;
}

export type RevolutPayoutResult = {
  id: string;
  state: string;
};

export async function payOut(args: {
  counterpartyId: string;
  amount: number;
  reference: string;
  requestId: string;
}): Promise<RevolutPayoutResult> {
  return revolutFetch<RevolutPayoutResult>("/pay", {
    method: "POST",
    body: JSON.stringify({
      request_id: args.requestId,
      account_id: CONFIG.REVOLUT_PAYOUT_ACCOUNT_ID,
      receiver: { counterparty_id: args.counterpartyId },
      amount: args.amount,
      currency: "EUR",
      reference: args.reference,
    }),
  });
}

export async function getTransaction(id: string): Promise<{ id: string; state: string }> {
  return revolutFetch<{ id: string; state: string }>(`/transaction/${encodeURIComponent(id)}`);
}

// Revolut webhooks v2: payload is signed as `v1.{timestamp}.{rawBody}` with
// HMAC-SHA256 using the webhook's signing secret, sent as
// `Revolut-Signature: v1=<hex>` alongside `Revolut-Request-Timestamp`. A
// 5-minute tolerance guards against replay of an intercepted payload.
export function verifyRevolutWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
}): boolean {
  if (!CONFIG.REVOLUT_WEBHOOK_SIGNING_SECRET) return false;
  const { rawBody, signatureHeader, timestampHeader } = args;
  if (!signatureHeader || !timestampHeader) return false;

  const timestampMs = Number(timestampHeader);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    logger.warn({ timestampHeader }, "Revolut webhook timestamp outside tolerance");
    return false;
  }

  const expected = crypto
    .createHmac("sha256", CONFIG.REVOLUT_WEBHOOK_SIGNING_SECRET)
    .update(`v1.${timestampHeader}.${rawBody}`)
    .digest("hex");

  const provided = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("v1="))
    ?.slice(3);
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
