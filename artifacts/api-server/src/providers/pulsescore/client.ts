// PulseScore (api.pulsescore.net) REST client — odds/markets/bookmakers
// provider, confirmed real 2026-09-10 (see types.ts header). Client only:
// nothing here is wired into routes/matches.ts or any live odds path yet
// (see providers/pulsescore/README.md) — this is transport + typed
// parsing, verified against the real payloads the user sent, same PR1
// scope every other provider in this codebase started from (GOAL API,
// api-tennis).
//
// Auth is `x-secret: <key>` — a THIRD distinct auth style in this
// codebase (GOAL API: Authorization Bearer, api-tennis: APIkey query
// param). List endpoints (soccer/leagues, soccer/events, live-events)
// return the page object directly; the two singular detail endpoints
// wrap the event in `{ data: ... }`. Neither shape carries a
// success/error envelope like GOAL API's `{success,data}` — a non-2xx
// HTTP status is the only failure signal observed so far.
import { CONFIG } from "../../lib/config.js";
import { recordPulseScoreRestFailure, recordPulseScoreRestSuccess } from "./health.js";
import type {
  PulseScoreEvent,
  PulseScoreEventDetailResponse,
  PulseScoreEventsResponse,
  PulseScoreLeaguesResponse,
  PulseScoreLiveEventsResponse,
} from "./types.js";

export class PulseScoreClient {
  readonly baseUrl: string;
  /** Serializes every request through this client instance and enforces
   * CONFIG.PULSESCORE_MIN_REQUEST_INTERVAL_MS between them — confirmed real
   * in production (2026-09-10): the account's PRO plan allows only 1
   * request/second per bookmaker, and two requests fired back-to-back
   * (the live-events pagination loop, no delay between pages) tripped an
   * HTTP 429. A promise chain rather than a last-timestamp check: the
   * latter races under concurrent callers (two calls can both read the same
   * "last request" time before either updates it), this doesn't. */
  private requestChain: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly apiKey: string, baseUrl?: string) {
    this.baseUrl = (baseUrl ?? CONFIG.PULSESCORE_BASE_URL).replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return { accept: "*/*", "x-secret": this.apiKey };
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async throttle(): Promise<void> {
    const previous = this.requestChain;
    let release!: () => void;
    this.requestChain = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const waitMs = this.lastRequestAt + CONFIG.PULSESCORE_MIN_REQUEST_INTERVAL_MS - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
    release();
  }

  private async rawGet<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    timeoutMs = 8_000,
  ): Promise<T> {
    await this.throttle();
    try {
      const url = this.buildUrl(path, params);
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: this.headers(),
      });
      if (!resp.ok) {
        let body = "";
        try {
          body = await resp.text();
        } catch {
          /* ignore */
        }
        throw new Error(`[pulsescore] HTTP ${resp.status} on ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
      }
      const data = (await resp.json()) as T;
      recordPulseScoreRestSuccess();
      return data;
    } catch (err) {
      recordPulseScoreRestFailure(err);
      throw err;
    }
  }

  // ── Soccer (pré-jogo) ────────────────────────────────────────────────────

  getSoccerLeagues(params?: { page?: number; limit?: number }): Promise<PulseScoreLeaguesResponse> {
    return this.rawGet<PulseScoreLeaguesResponse>("/api/onexbet/soccer/leagues", params);
  }

  getSoccerEvents(params?: { page?: number; limit?: number }): Promise<PulseScoreEventsResponse> {
    return this.rawGet<PulseScoreEventsResponse>("/api/onexbet/soccer/events", params);
  }

  async getSoccerEventById(id: string): Promise<PulseScoreEvent> {
    const resp = await this.rawGet<PulseScoreEventDetailResponse>(
      `/api/onexbet/soccer/events/${encodeURIComponent(id)}`,
    );
    return resp.data;
  }

  // ── Live events (qualquer esporte, filtrável por sport=) ────────────────

  getLiveEvents(params?: {
    page?: number;
    limit?: number;
    sport?: string;
  }): Promise<PulseScoreLiveEventsResponse> {
    return this.rawGet<PulseScoreLiveEventsResponse>("/api/onexbet/live-events", params);
  }

  async getLiveEventById(id: string): Promise<PulseScoreEvent> {
    const resp = await this.rawGet<PulseScoreEventDetailResponse>(
      `/api/onexbet/live-events/events/${encodeURIComponent(id)}`,
    );
    return resp.data;
  }
}

let _client: PulseScoreClient | null = null;

export function getPulseScoreClient(): PulseScoreClient {
  if (!_client) {
    _client = new PulseScoreClient(CONFIG.PULSESCORE_API_KEY);
  }
  return _client;
}

export const pulseScore = {
  getSoccerLeagues: (params?: Parameters<PulseScoreClient["getSoccerLeagues"]>[0]) =>
    getPulseScoreClient().getSoccerLeagues(params),
  getSoccerEvents: (params?: Parameters<PulseScoreClient["getSoccerEvents"]>[0]) =>
    getPulseScoreClient().getSoccerEvents(params),
  getSoccerEventById: (id: string) => getPulseScoreClient().getSoccerEventById(id),
  getLiveEvents: (params?: Parameters<PulseScoreClient["getLiveEvents"]>[0]) =>
    getPulseScoreClient().getLiveEvents(params),
  getLiveEventById: (id: string) => getPulseScoreClient().getLiveEventById(id),
};
