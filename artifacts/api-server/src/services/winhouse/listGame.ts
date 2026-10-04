// Normalizes one entry of /ajax/prematchgames24hour — see list.ts for why
// this is needed: WinHouse sends some entries with English field names and
// others with the Portuguese-translated variant, inconsistently and not
// tied to any particular sport/league (confirmed from a real response,
// 2026-10-04).
export type NormalizedListGame = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  league: string;
  country: string;
  sportId: number;
  oddString: string;
};

function firstString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export function normalizeListGame(raw: unknown): NormalizedListGame | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = r["id"];
  if (typeof id !== "number" && typeof id !== "string") return null;

  const sportIdRaw = firstString(r, ["sport_id", "id_esporte"]) || String(r["sport_id"] ?? r["id_esporte"] ?? "");
  const sportId = Number(sportIdRaw);
  if (!Number.isFinite(sportId)) return null;

  const gameDate = firstString(r, ["game_date", "data_jogo", "data_do_jogo"]);
  const gameTime = firstString(r, ["game_time", "horário_jogo", "horário_do_jogo"]);

  return {
    gameId: String(id),
    homeTeam: firstString(r, ["home_team", "time_casa", "time_da_casa"]),
    awayTeam: firstString(r, ["away_team", "time_visitante", "time_fora"]),
    gameDate: gameTime ? `${gameDate} ${gameTime}` : gameDate,
    league: firstString(r, ["league", "liga"]),
    country: firstString(r, ["country", "país"]),
    sportId,
    oddString: firstString(r, ["odd", "ímpar"]),
  };
}
