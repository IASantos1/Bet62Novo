// Palace Casino (Gold Slot Palace) API client — third-party casino game
// aggregator, intended to replace SilentAPI (see routes/casino.ts) as the
// catalog source. This account uses Seamless wallet mode: the balance
// never leaves our platform, Palace Casino just asks us (via the
// Callback-Token webhook — see routes/palaceCasino.ts) on every
// bet/win/cancel and we answer with the current balance. The
// palaceCasinoDeposit/palaceCasinoWithdrawAll functions below are for the
// *other* wallet mode ("Transfer" — pre-funding a separate casino-side
// balance) documented alongside this API; they're kept here as a faithful
// client for that endpoint but are NOT part of the integration path we're
// using, and are not called from anywhere.
import { CONFIG } from "../../lib/config.js";

class PalaceCasinoNotConfiguredError extends Error {
  constructor() {
    super("PALACE_CASINO_API_TOKEN não configurada");
    this.name = "PalaceCasinoNotConfiguredError";
  }
}

async function palaceCasinoPost<T>(path: string, body: unknown): Promise<T> {
  if (!CONFIG.PALACE_CASINO_API_TOKEN) throw new PalaceCasinoNotConfiguredError();
  const resp = await fetch(`${CONFIG.PALACE_CASINO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.PALACE_CASINO_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await resp.json()) as {
    code?: number;
    message?: string;
    data?: T;
  };
  if (!resp.ok || data.code !== 0) {
    throw new Error(
      `[palace-casino] ${path} failed: ${data.message ?? `HTTP ${resp.status}`}`,
    );
  }
  return data.data as T;
}

export type PalaceCasinoAgentInfo = {
  name: string;
  currency: number;
  balance: number;
  win_ratio?: number;
  rtp?: number;
  whitelist?: string[];
  client_ip?: string;
};

// No documented currency-code table (only ever seen 1 = USD in practice,
// via an agent named "internal_usd") — this exists purely so a human can
// glance at the raw name/currency fields and confirm the account is
// actually configured for EUR before relying on centsToLedgerAmount/
// ledgerAmountToCents in routes/casino.ts, which assume EUR. Do not infer
// or hardcode a currency-code mapping here; check the debug route by eye.
export function getPalaceCasinoAgentInfo(): Promise<PalaceCasinoAgentInfo> {
  return palaceCasinoPost<PalaceCasinoAgentInfo>("/agent/info", {});
}

export type PalaceCasinoProvider = {
  provider_id: number;
  provider_name: string;
  locale_name: string;
  status: number; // 1 = normal, 2 = manutenção
};

export type PalaceCasinoGame = {
  provider_id: number;
  game_code: string;
  game_name: string;
  locale_name: string;
  game_image: string;
  launch_enable: boolean;
  category: string; // "Slots" | "Ao Vivo"
  reg_date: string;
};

/** All providers assigned to our agent account. */
export function getPalaceCasinoProviders(
  lang = 1,
): Promise<PalaceCasinoProvider[]> {
  return palaceCasinoPost<PalaceCasinoProvider[]>("/game/providers", { lang });
}

/** Games for one provider, or all games if providerId is 0. */
export function getPalaceCasinoGames(
  providerId: number,
  lang = 1,
): Promise<PalaceCasinoGame[]> {
  return palaceCasinoPost<PalaceCasinoGame[]>("/game/games", {
    provider_id: providerId,
    lang,
  });
}

export type PalaceCasinoUser = { user_code: number; is_new_user: boolean };

/** Creates (or, if the name already exists, just returns) the Palace
 * Casino user for one of our players. Idempotent by name — safe, and
 * documented as the intended pattern, to call on every launch rather than
 * caching user_code ourselves. `name` should be memberAccountForUser(userId)
 * (routes/casino.ts) for consistency with the SilentAPI integration and so
 * routes/palaceCasino.ts's callback handler can reverse the mapping the
 * same way (userIdFromMemberAccount). */
export function ensurePalaceCasinoUser(name: string): Promise<PalaceCasinoUser> {
  return palaceCasinoPost<PalaceCasinoUser>("/user/create", { name });
}

export type PalaceCasinoGameUrl = { game_url: string };

/** Gets a one-time game launch URL, valid for 10 minutes. `gameSymbol` is
 * the game_code from getPalaceCasinoGames(). rtp: 0 applies the agent's
 * configured RTP (no per-user override). */
export function getPalaceCasinoGameUrl(args: {
  userCode: number;
  providerId: number;
  gameSymbol: string;
  returnUrl: string;
  lang?: number;
}): Promise<PalaceCasinoGameUrl> {
  return palaceCasinoPost<PalaceCasinoGameUrl>("/game/game-url", {
    user_code: args.userCode,
    provider_id: args.providerId,
    game_symbol: args.gameSymbol,
    lang: args.lang ?? 1,
    return_url: args.returnUrl,
    rtp: 0,
    is_finish_jackpot: true,
  });
}

export type PalaceCasinoWalletResult = { balance: number; amount: number };

/** Pays money into the user's Palace Casino wallet, deducted from our
 * agent points. Transfer-mode only — not part of the Seamless integration
 * path we're using, see module header. */
export function palaceCasinoDeposit(
  userCode: number,
  amount: number,
): Promise<PalaceCasinoWalletResult> {
  return palaceCasinoPost<PalaceCasinoWalletResult>("/wallet/deposit", {
    user_code: userCode,
    amount,
  });
}

/** Pulls all of the user's money back out of their Palace Casino wallet,
 * credited back to our agent points. */
export function palaceCasinoWithdrawAll(
  userCode: number,
): Promise<PalaceCasinoWalletResult> {
  return palaceCasinoPost<PalaceCasinoWalletResult>("/wallet/withdraw-all", {
    user_code: userCode,
  });
}
