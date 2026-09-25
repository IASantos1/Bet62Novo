import { CONFIG } from "../../lib/config.js";

// Real REST client for api-football.com (API-SPORTS). Used ONLY to fill in
// display metadata for the "Jogos em Destaque" banners (team names/logos,
// league logo, kickoff time, live/finished status) — see
// services/apiFootball/bannerSync.ts. Deliberately never touches odds,
// markets, or settlement: this repo has fully built-and-deleted several
// sports-data-provider integrations in the past when they crept into
// betting logic (see lib/db/src/schema/featuredMatchBanners.ts), and
// WinHouse's iframe is the sole source of truth for actual bets.
const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

type ApiFootballEnvelope<T> = {
  response: T;
  errors?: unknown;
  results?: number;
};

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string; // ISO 8601
    status: { short: string; long: string; elapsed: number | null };
  };
  league: {
    id: number;
    name: string;
    logo: string;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
};

// Fixture statuses api-football.com considers "in play" — see their
// documentation's status-codes table (1H, HT, 2H, ET, BT, P, SUSP, INT are
// all live states; LIVE is a synthetic catch-all some endpoints use too).
const LIVE_STATUS_CODES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);

export function isFixtureLive(fixture: ApiFootballFixture): boolean {
  return LIVE_STATUS_CODES.has(fixture.fixture.status.short);
}

function requireApiKey(): string {
  const apiKey = CONFIG.API_FOOTBALL_KEY.trim();
  if (!apiKey) {
    throw Object.assign(new Error("API_FOOTBALL_KEY não configurada"), { status: 503 });
  }
  return apiKey;
}

async function apiFootballFetch<T>(path: string): Promise<T> {
  const apiKey = requireApiKey();
  const resp = await fetch(`${API_FOOTBALL_BASE_URL}${path}`, {
    headers: { "x-apisports-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await resp.json().catch(() => null)) as ApiFootballEnvelope<T> | null;
  if (!resp.ok || !payload) {
    throw Object.assign(
      new Error(`api-football.com respondeu ${resp.status} para ${path}`),
      { status: resp.status || 502 },
    );
  }
  if (payload.errors && Array.isArray(payload.errors) ? payload.errors.length > 0 : !!payload.errors) {
    throw Object.assign(
      new Error(`api-football.com devolveu erro para ${path}: ${JSON.stringify(payload.errors)}`),
      { status: 502 },
    );
  }
  return payload.response;
}

// One request, every league's fixtures for that calendar date (UTC) — the
// candidate list gets filtered down to allowed competitions on our side,
// never per-league requests, to stay well within the free-tier daily quota.
export async function getFixturesByDate(dateYYYYMMDD: string): Promise<ApiFootballFixture[]> {
  return apiFootballFetch<ApiFootballFixture[]>(`/fixtures?date=${dateYYYYMMDD}`);
}

// One request, every live fixture worldwide — same filter-locally approach.
export async function getLiveFixtures(): Promise<ApiFootballFixture[]> {
  return apiFootballFetch<ApiFootballFixture[]>("/fixtures?live=all");
}
