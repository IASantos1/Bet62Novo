import crypto from "node:crypto";
import { CONFIG } from "../../lib/config.js";

const BIGBANG_BASE_URL = "https://api.bigbangcasino.bet/api/v1";

type BigBangOkEnvelope<T> = {
  success: true;
  data?: T;
  game_url?: string;
  session_id?: string;
  provider?: string;
  demo?: boolean;
  pagination?: { total?: number; limit?: number; offset?: number };
};

type BigBangErrorEnvelope = { success: false; error?: { code?: number; message?: string } };

type BigBangEnvelope<T> = BigBangOkEnvelope<T> | BigBangErrorEnvelope;

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
  const apiKey = CONFIG.BIGBANG_API_KEY.trim();
  if (!apiKey) {
    throw Object.assign(new Error("BIGBANG_API_KEY não configurada"), { status: 503 });
  }
  return apiKey;
}

function buildBigBangUrl(path: string, apiKeyAsQuery = false): string {
  if (!apiKeyAsQuery) return `${BIGBANG_BASE_URL}${path}`;
  const apiKey = requireApiKey();
  const url = new URL(`${BIGBANG_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  return url.toString();
}

async function parseBigBangResponse<T>(resp: Response): Promise<BigBangEnvelope<T>> {
  return (await resp.json().catch(() => ({
    success: false,
    error: {
      code: resp.status,
      message: `Resposta inválida da BigBang (${resp.status})`,
    },
  }))) as BigBangEnvelope<T>;
}

function assertBigBangOk<T>(
  resp: Response,
  payload: BigBangEnvelope<T>,
): asserts payload is BigBangOkEnvelope<T> {
  if (!resp.ok || payload.success === false) {
    const errorCode = payload && "error" in payload ? payload.error?.code : undefined;
    const message =
      payload && "error" in payload
        ? (payload.error?.message ?? `BigBang respondeu ${resp.status}`)
        : `BigBang respondeu ${resp.status}`;
    throw Object.assign(new Error(message), { status: resp.status || errorCode || 502 });
  }
}

async function bigBangFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<BigBangOkEnvelope<T>> {
  const apiKey = requireApiKey();
  let authMode = "header";
  let resp = await fetch(buildBigBangUrl(path, false), {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });
  let payload = await parseBigBangResponse<T>(resp);

  // Official docs allow `?api_key=` as a fallback auth mechanism. Retry once
  // there on 401 in case an upstream proxy strips the custom header.
  if (resp.status === 401) {
    authMode = "query";
    resp = await fetch(buildBigBangUrl(path, true), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
    payload = await parseBigBangResponse<T>(resp);
    if (resp.status === 401) {
      throw Object.assign(
        new Error(
          `BigBang rejeitou a autenticação nas duas formas suportadas (X-API-Key e ?api_key=) para ${path}. ` +
            "Verifique BIGBANG_API_KEY no ambiente/deploy e confirme no dashboard da BigBang se a key está ativa e autorizada.",
        ),
        { status: 401, authMode: "header+query" },
      );
    }
  }

  try {
    assertBigBangOk(resp, payload);
  } catch (err) {
    if (resp.status === 401) {
      throw Object.assign(
        new Error(
          `BigBang rejeitou a autenticação via ${authMode} para ${path}. ` +
            "Verifique BIGBANG_API_KEY no ambiente/deploy e confirme no dashboard da BigBang se a key está ativa.",
        ),
        { status: 401, authMode },
      );
    }
    throw err;
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
