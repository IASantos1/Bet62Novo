// BetbyJwtService — lifecycle for the short-lived (24h) BetBY ES256 JWT that
// the bet62 frontend generates on session init (handshake).
//
// Backend responsibility:
//   1. Cache the latest JWT pushed into the service (from admin/frontend
//      session capture, or from a future automated fetch).
//   2. Expose synchronous getters for the current token + decoded metadata.
//   3. Warn when the JWT is < 1 hour from expiry (auto-invalidate, surface in
//      health checks) so ops / frontend has time to refresh.
//   4. Allow an optional refresh callback that can fetch a new JWT if the
//      ops team later gives us an automated endpoint (not today).
//
// Usage:
//   import { betbyJwt } from "./services/betby/jwtService.js";
//   betbyJwt.setToken(rawJwtFromFrontend);
//   const { token, exp, needsRefresh } = betbyJwt.snapshot();

import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export interface BetbyJwtPayload {
  iss: string;       // brand_id
  sub: string;       // client id
  name?: string;
  iat: number;       // issued, seconds
  exp: number;       // expires, seconds
  jti: string;
  lang: string;
  currency: string;
  odds_format: string;
  ff?: {
    is_cashout_available?: boolean;
    is_match_tracker_available?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface BetbyJwtSnapshot {
  token: string | null;
  payload: BetbyJwtPayload | null;
  issuedAt: number | null;
  expiresAt: number | null;
  ageHours: number | null;
  hoursLeft: number | null;
  needsRefresh: boolean;      // true if missing or < 1h left
  hasMatchTrackerFlag: boolean;
  hasCashoutFlag: boolean;
}

type RefreshFn = () => Promise<string | null>;

function b64UrlDecode(s: string): string {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = std.length % 4 === 0 ? "" : "=".repeat(4 - (std.length % 4));
  return Buffer.from(std + pad, "base64").toString("utf8");
}

function decodeJwt(token: string): BetbyJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const p = JSON.parse(b64UrlDecode(parts[1]!));
    return p as BetbyJwtPayload;
  } catch {
    return null;
  }
}

export const BETBY_JWT_REFRESH_WINDOW_HOURS = Number(
  process.env["BETBY_JWT_REFRESH_WINDOW_HOURS"] ?? "1"
);

class BetbyJwtService {
  private _token: string | null = null;
  private _payload: BetbyJwtPayload | null = null;
  private _acquiredAtMs: number = 0;
  private _refreshFn: RefreshFn | null = null;
  private _warnedExpire = false;

  constructor() {
    if (CONFIG.BETBY_JWT) this.setToken(CONFIG.BETBY_JWT, "config");
  }

  /** Install an optional auto-refresh callback (future). */
  setRefreshFn(fn: RefreshFn | null): void {
    this._refreshFn = fn;
  }

  /** Set the current JWT token. `source` is used for logs only. */
  setToken(token: string, source: string = "external"): BetbyJwtSnapshot {
    const trimmed = (token ?? "").trim();
    if (!trimmed) {
      this._token = null;
      this._payload = null;
      this._acquiredAtMs = 0;
      return this.snapshot();
    }
    const payload = decodeJwt(trimmed);
    if (!payload) {
      logger.warn({ source }, "[betby.jwt] rejected token that did not decode as JWT");
      return this.snapshot();
    }
    this._token = trimmed;
    this._payload = payload;
    this._acquiredAtMs = Date.now();
    this._warnedExpire = false;
    const snap = this.snapshot();
    logger.info(
      {
        source,
        brand: payload.iss,
        sub: payload.sub,
        iat: new Date((payload.iat ?? 0) * 1000).toISOString(),
        exp: new Date((payload.exp ?? 0) * 1000).toISOString(),
        flags: payload.ff,
        hoursLeft: snap.hoursLeft,
      },
      "[betby.jwt] token installed"
    );
    return snap;
  }

  /** Get current token, triggering refresh callback if installed and needed. */
  async getTokenOrRefresh(): Promise<string | null> {
    const snap = this.snapshot();
    if (!snap.needsRefresh) return this._token;
    if (this._refreshFn) {
      const fresh = await this._refreshFn().catch(() => null);
      if (fresh) {
        this.setToken(fresh, "auto-refresh");
        return this._token;
      }
    }
    return this._token;
  }

  snapshot(): BetbyJwtSnapshot {
    const p = this._payload;
    const nowMs = Date.now();
    const issuedAt = p?.iat ? p.iat * 1000 : null;
    const expiresAt = p?.exp ? p.exp * 1000 : null;
    const ageHours = issuedAt ? (nowMs - issuedAt) / 3.6e6 : null;
    const hoursLeft = expiresAt ? (expiresAt - nowMs) / 3.6e6 : null;
    const needsRefresh = !this._token || !p || (hoursLeft !== null && hoursLeft < BETBY_JWT_REFRESH_WINDOW_HOURS);
    if (needsRefresh && this._token && !this._warnedExpire) {
      this._warnedExpire = true;
      logger.warn(
        { hoursLeft: hoursLeft?.toFixed(2), flagWindowHours: BETBY_JWT_REFRESH_WINDOW_HOURS },
        "[betby.jwt] token will expire soon (or is expired) — needs refresh via betbyJwt.setToken()"
      );
    }
    return {
      token: this._token,
      payload: p,
      issuedAt,
      expiresAt,
      ageHours,
      hoursLeft,
      needsRefresh,
      hasMatchTrackerFlag: Boolean(p?.ff?.is_match_tracker_available),
      hasCashoutFlag: Boolean(p?.ff?.is_cashout_available),
    };
  }
}

export const betbyJwt = new BetbyJwtService();
