// Revolut Business API client — executes approved withdrawals as real bank
// transfers (SEPA/IBAN payouts) instead of a manual off-platform transfer.
//
// Auth model (OAuth2 + JWT client assertion, per Revolut's Business API):
//   1. One-time, human-only setup: a Revolut Business admin completes the
//      authorization-code consent flow in a browser and the resulting
//      refresh_token is stored as REVOLUT_REFRESH_TOKEN. This step cannot be
//      automated from the server — it requires a logged-in human clicking
//      "Authorize" on Revolut's own consent screen.
//   2. From then on, this client exchanges that refresh_token for short-lived
//      (~40min) access tokens by signing a JWT ("client_assertion") with the
//      private key of the X.509 certificate registered against
//      REVOLUT_CLIENT_ID in the Revolut Business API app settings.
//
// See .env.example (section "REVOLUT") for the full list of required vars.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { CONFIG } from "../../lib/config.js";
import { timingSafeEqualString } from "../../lib/security.js";
import { logger } from "../../lib/logger.js";

export class RevolutNotConfiguredError extends Error {
  constructor() {
    super("Revolut Business API não configurada (ver .env.example)");
    this.name = "RevolutNotConfiguredError";
  }
}

export function isRevolutConfigured(): boolean {
  return Boolean(
    CONFIG.REVOLUT_CLIENT_ID &&
      CONFIG.REVOLUT_PRIVATE_KEY &&
      CONFIG.REVOLUT_ISSUER &&
      CONFIG.REVOLUT_REFRESH_TOKEN &&
      CONFIG.REVOLUT_ACCOUNT_ID,
  );
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function buildClientAssertion(): string {
  // Most env-var UIs store multi-line PEM keys with literal "\n" sequences
  // instead of real newlines — normalize before handing to jsonwebtoken.
  const privateKey = CONFIG.REVOLUT_PRIVATE_KEY.replace(/\\n/g, "\n");
  return jwt.sign(
    { iss: CONFIG.REVOLUT_ISSUER, sub: CONFIG.REVOLUT_CLIENT_ID, aud: "https://revolut.com" },
    privateKey,
    { algorithm: "RS256", expiresIn: "60s" },
  );
}

async function fetchAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: CONFIG.REVOLUT_REFRESH_TOKEN,
    client_id: CONFIG.REVOLUT_CLIENT_ID,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: buildClientAssertion(),
  });
  const res = await fetch(`${CONFIG.REVOLUT_API_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Revolut token refresh failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  // Refresh 60s early so an in-flight request never races token expiry.
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(json.expires_in - 60, 30) * 1000,
  };
  return cachedToken.accessToken;
}

async function getAccessToken(): Promise<string> {
  if (!isRevolutConfigured()) throw new RevolutNotConfiguredError();
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;
  return fetchAccessToken();
}

async function revolutRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${CONFIG.REVOLUT_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Revolut API ${path} failed (${res.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

type RevolutAccount = { iban?: string };
export type RevolutCounterparty = {
  id: string;
  accounts?: RevolutAccount[];
  [key: string]: unknown;
};

function splitHolderName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first_name = parts[0] || name.trim() || "Titular";
  const last_name = parts.slice(1).join(" ") || first_name;
  return { first_name, last_name };
}

function ibanCountry(iban: string): string {
  return iban.slice(0, 2).toUpperCase();
}

// Reuses an existing counterparty for the same IBAN when one exists, to
// avoid piling up duplicate counterparty records for repeat withdrawals
// from the same beneficiary. Falls back to creating a new one.
export async function findOrCreateCounterparty(args: {
  iban: string;
  holderName: string;
}): Promise<RevolutCounterparty> {
  const cleanIban = args.iban.replace(/\s/g, "").toUpperCase();
  try {
    const existing = await revolutRequest<RevolutCounterparty[]>("/counterparties");
    const match = (existing || []).find((c) =>
      (c.accounts || []).some((a) => (a.iban || "").replace(/\s/g, "").toUpperCase() === cleanIban),
    );
    if (match) return match;
  } catch (err) {
    logger.warn({ err }, "[revolut] counterparty lookup failed, creating a new one");
  }

  return revolutRequest<RevolutCounterparty>("/counterparty", {
    method: "POST",
    body: JSON.stringify({
      profile_type: "personal",
      individual_name: splitHolderName(args.holderName),
      bank_country: ibanCountry(cleanIban),
      currency: "EUR",
      iban: cleanIban,
    }),
  });
}

export type RevolutPayment = { id: string; state: string; [key: string]: unknown };

export async function payCounterparty(args: {
  counterpartyId: string;
  amount: number;
  reference: string;
  requestId: string;
}): Promise<RevolutPayment> {
  return revolutRequest<RevolutPayment>("/pay", {
    method: "POST",
    body: JSON.stringify({
      request_id: args.requestId,
      account_id: CONFIG.REVOLUT_ACCOUNT_ID,
      receiver: { counterparty_id: args.counterpartyId },
      amount: args.amount,
      currency: "EUR",
      reference: args.reference,
    }),
  });
}

export async function getTransaction(id: string): Promise<RevolutPayment> {
  return revolutRequest<RevolutPayment>(`/transaction/${encodeURIComponent(id)}`);
}

// Revolut signs webhook bodies as HMAC-SHA256 over "v1.{timestamp}.{rawBody}"
// using the webhook's signing secret, sent as "v1=<hex>" (possibly multiple,
// comma-separated, across a secret rotation window) in Revolut-Signature.
export function verifyRevolutWebhookSignature(args: {
  rawBody: Buffer;
  signatureHeader: string | string[] | undefined;
  timestampHeader: string | string[] | undefined;
  secret: string;
}): boolean {
  const { rawBody, secret } = args;
  const signatureHeader = Array.isArray(args.signatureHeader) ? args.signatureHeader[0] : args.signatureHeader;
  const timestampHeader = Array.isArray(args.timestampHeader) ? args.timestampHeader[0] : args.timestampHeader;
  if (!signatureHeader || !timestampHeader || !secret) return false;

  const payloadToSign = `v1.${timestampHeader}.${rawBody.toString("utf8")}`;
  const expected = "v1=" + crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");

  return signatureHeader
    .split(",")
    .map((s) => s.trim())
    .some((sig) => timingSafeEqualString(sig, expected));
}
