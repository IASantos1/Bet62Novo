import * as client from "./client.js";

export async function fetchPreMatch() {
  const matches = await client.getMatches();

  return matches.map((m: any) => ({
    id: m.id,
    home: m.home_team,
    away: m.away_team,
    startTime: m.start_time,
  }));
}

export async function fetchLive() {
  const live = await client.getLiveMatches();

  return live.map((m: any) => ({
    id: m.id,
    score: m.score,
    status: m.status,
  }));
}

export async function fetchOdds(matchId: string) {
  return client.getOdds(matchId);
}
