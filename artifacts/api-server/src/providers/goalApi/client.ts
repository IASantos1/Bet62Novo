import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type {
  GoalApiEnvelope,
  GoalApiFixture,
  GoalApiFixtureList,
} from "./schema.js";

type GoalApiRequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

export class GoalApiClient {
  constructor(
    private readonly apiKey = CONFIG.GOAL_API_KEY,
    private readonly baseUrl = CONFIG.GOAL_API_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async listFixtures(
    options: GoalApiRequestOptions = {},
  ): Promise<GoalApiFixtureList> {
    const data = await this.request<GoalApiEnvelope<GoalApiFixtureList>>(
      "/fixtures",
      options,
    );
    return Array.isArray(data.data) ? data.data : [];
  }

  async listLiveFixtures(
    options: GoalApiRequestOptions = {},
  ): Promise<GoalApiFixtureList> {
    const data = await this.request<GoalApiEnvelope<GoalApiFixtureList>>(
      "/fixtures/live",
      options,
    );
    return Array.isArray(data.data) ? data.data : [];
  }

  async listFixturesByDate(
    date: string,
    options: GoalApiRequestOptions = {},
  ): Promise<GoalApiFixtureList> {
    const data = await this.request<GoalApiEnvelope<GoalApiFixtureList>>(
      `/fixtures/date/${encodeURIComponent(date)}`,
      options,
    );
    return Array.isArray(data.data) ? data.data : [];
  }

  async getFixtureById(
    fixtureId: string | number,
    options: GoalApiRequestOptions = {},
  ): Promise<GoalApiFixture | null> {
    const data = await this.request<GoalApiEnvelope<GoalApiFixture>>(
      `/fixtures/${encodeURIComponent(String(fixtureId))}`,
      options,
    );
    return data?.data ?? null;
  }

  async getFixtureStatistics(
    fixtureId: string | number,
    options: GoalApiRequestOptions = {},
  ): Promise<Record<string, unknown> | null> {
    const data = await this.request<GoalApiEnvelope<Record<string, unknown>>>(
      `/fixtures/${encodeURIComponent(String(fixtureId))}/statistics`,
      options,
    );
    return data?.data ?? null;
  }

  private async request<T>(
    path: string,
    options: GoalApiRequestOptions = {},
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("Goal API key is not configured");
    }
    const url = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: options.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        {
          path,
          status: response.status,
          body: body.slice(0, 500),
        },
        "[goal-api] request failed",
      );
      throw new Error(`Goal API request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

let _client: GoalApiClient | null = null;

export function getGoalApiClient(): GoalApiClient {
  if (!_client) _client = new GoalApiClient();
  return _client;
}
