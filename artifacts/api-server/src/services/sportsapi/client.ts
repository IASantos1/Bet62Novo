const BASE_URL = process.env.SPORTSAPI_BASE_URL!;
const API_KEY = process.env.SPORTSAPI_KEY!;

async function request(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[SportsAPI] ${res.status}: ${text}`);
  }

  return res.json();
}

export async function getMatches(): Promise<any[]> {
  return request("/matches");
}

export async function getLiveMatches(): Promise<any[]> {
  return request("/matches/live");
}

export async function getOdds(matchId: string): Promise<unknown> {
  return request(`/matches/${matchId}/odds`);
}
