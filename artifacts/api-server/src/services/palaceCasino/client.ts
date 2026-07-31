// Palace Casino (Gold Slot Palace) API client — third-party casino game
// aggregator, intended to replace SilentAPI (see routes/casino.ts) as the
// catalog source. Only wallet (deposit/withdraw-all) and game listing
// (providers/games) are implemented so far, matching what's been
// documented — the game-launch endpoint and the wallet-callback signing
// scheme aren't documented yet, so there's no /launch equivalent here and
// nothing wired into routes/casino.ts. This module is inert (every call
// throws) until PALACE_CASINO_API_TOKEN is set.
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

export type PalaceCasinoWalletResult = { balance: number; amount: number };

/** Pays money into the user's Palace Casino wallet, deducted from our
 * agent points. userCode is whatever Palace Casino returned when the
 * player account was first created there — not documented yet how that
 * account gets created, so this can't be called end-to-end until that's
 * clarified. */
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
