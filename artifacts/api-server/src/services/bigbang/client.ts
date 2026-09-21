import crypto from "node:crypto";
import { CONFIG } from "../../lib/config.js";

const BIGBANG_BASE_URL = "https://api.bigbangcasino.bet/api/v1";

type BigBangEnvelope<T> =
  | {
      success: true;
      data?: T;
      game_url?: string;
      session_id?: string;
      provider?: string;
      demo?: boolean;
      pagination?: { total?: number; limit?: number; offset?: number };
    }
  | { success: false; error?: { code?: number; message?: string } };

export type BigBangGame = {
  id: number;
  name: string;
  title: string;
  provider: string;
  category?: string | null;
  category_title?: string | null;
  thumbnail?: string | null;
  mode?: string | null;
  is_premium?: boolean;
  game_type?: "slot" | "live" | "crash" | string;
  is_demo?: boolean;
};

export type BigBangGamesPage = {
  data: BigBangGame[];
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
};

function requireApiKey(): string {
  if (!CONFIG.BIGBANG_API_KEY) {
    throw Object.assign(new Error("BIGBANG_API_KEY não configurada"), { status: 503 });
  }
  return CONFIG.BIGBANG_API_KEY;
}

async function bigBangFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<BigBangEnvelope<T>> {
  const apiKey = requireApiKey();
  const resp = await fetch(`${BIGBANG_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });

  const payload = (await resp.json().catch(() => ({
    success: false,
    error: {
      code: resp.status,
      message: `Resposta inválida da BigBang (${resp.status})`,
    },
  }))) as BigBangEnvelope<T>;

  if (!resp.ok || payload.success === false) {
    const message =
      payload && "error" in payload
        ? (payload.error?.message ?? `BigBang respondeu ${resp.status}`)
        : `BigBang respondeu ${resp.status}`;
    throw Object.assign(new Error(message), { status: resp.status || payload?.error?.code || 502 });
  }

  return payload;
}

export async function bigBangListGamesPage(args: {
  limit: number;
  offset: number;
  mode?: "standard" | "premium";
}): Promise<BigBangGamesPage> {
  const params = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
  });
  if (args.mode) params.set("type", args.mode);
  const payload = await bigBangFetch<BigBangGame[]>(`/games?${params.toString()}`);
  return {
    data: payload.data ?? [],
    pagination: payload.pagination,
  };
}

export async function bigBangLaunchGame(args: {
  gameId: number;
  userToken: string;
  language?: string;
  returnUrl?: string;
  homeUrl?: string;
}): Promise<{ gameUrl: string; sessionId?: string; provider?: string }> {
  const body: Record<string, unknown> = {
    game_id: args.gameId,
    user_token: args.userToken,
  };
  if (args.language) body["language"] = args.language;
  if (args.returnUrl) body["return_url"] = args.returnUrl;
  if (args.homeUrl) body["home_url"] = args.homeUrl;

  const payload = await bigBangFetch<never>("/games/launch", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!payload.game_url) {
    throw Object.assign(new Error("BigBang não devolveu game_url"), { status: 502 });
  }

  return {
    gameUrl: payload.game_url,
    sessionId: payload.session_id,
    provider: payload.provider,
  };
}

export function bigBangBalanceChangeSignature(input: {
  username: string;
  amount: unknown;
  game: string;
  game_category: string;
  transaction_id: string;
}): string {
  const base =
    String(input.username) +
    String(input.amount) +
    String(input.game) +
    String(input.game_category) +
    String(input.transaction_id);
  return crypto
    .createHmac("sha256", requireApiKey())
    .update(base)
    .digest("hex");
}
