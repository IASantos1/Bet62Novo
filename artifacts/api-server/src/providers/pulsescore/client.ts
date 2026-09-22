import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type {
  PulseScoreBookmaker,
  PulseScoreEvent,
  PulseScoreListResponse,
  PulseScoreSport,
} from "./schema.js";

const BOOKMAKER_PREFIX: Record<PulseScoreBookmaker, string> = {
  "1xbet": "/api/onexbet",
  "bet365": "/api/v3/bet365",
  "betano-de": "/api/betano-de",
  "betano-br": "/api/betano-br",
  "pulsescore": "/api",
};

type PulseScoreRequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

export class PulseScoreClient {
  constructor(
    private readonly apiKey = CONFIG.PULSESCORE_API_KEY,
    private readonly baseUrl = CONFIG.PULSESCORE_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  websocketUrl(bookmaker: PulseScoreBookmaker): string {
    const base = new URL(this.baseUrl);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = `${BOOKMAKER_PREFIX[bookmaker]}/ws/live`;
    base.searchParams.set("key", this.apiKey);
    return base.toString();
  }

  async listPrematchEvents(
    bookmaker: PulseScoreBookmaker,
    sport: PulseScoreSport,
    options: PulseScoreRequestOptions = {},
  ): Promise<PulseScoreEvent[]> {
    const data = await this.request<PulseScoreListResponse>(
      bookmaker,
      `/${sport}/events`,
      {
        ...options,
        query: {
          ...(options.query ?? {}),
        },
      },
    );
    return Array.isArray(data?.events) ? data.events : [];
  }

  async listLiveEvents(
    bookmaker: PulseScoreBookmaker,
    sport: PulseScoreSport,
    options: PulseScoreRequestOptions = {},
  ): Promise<PulseScoreEvent[]> {
    const data = await this.request<PulseScoreListResponse>(
      bookmaker,
      "/live-events",
      {
        ...options,
        query: {
          sport,
          ...(options.query ?? {}),
        },
      },
    );
    return Array.isArray(data?.events) ? data.events : [];
  }

  async getEventById(
    bookmaker: PulseScoreBookmaker,
    sport: PulseScoreSport,
    eventId: string,
    options: PulseScoreRequestOptions = {},
  ): Promise<PulseScoreEvent | null> {
    const data = await this.request<PulseScoreEvent>(
      bookmaker,
      `/${sport}/events/${encodeURIComponent(eventId)}`,
      options,
    );
    return data ?? null;
  }

  private async request<T>(
    bookmaker: PulseScoreBookmaker,
    path: string,
    options: PulseScoreRequestOptions = {},
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("PulseScore API key is not configured");
    }
    const url = new URL(`${BOOKMAKER_PREFIX[bookmaker]}${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Secret": this.apiKey,
        "Accept-Encoding": "gzip",
      },
      signal: options.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        {
          bookmaker,
          path,
          status: response.status,
          body: body.slice(0, 500),
        },
        "[pulsescore] request failed",
      );
      throw new Error(`PulseScore request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

let _client: PulseScoreClient | null = null;

export function getPulseScoreClient(): PulseScoreClient {
  if (!_client) _client = new PulseScoreClient();
  return _client;
}
