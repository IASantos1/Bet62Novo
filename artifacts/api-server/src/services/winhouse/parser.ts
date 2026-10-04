// Shape confirmed from a real /ajax/prematchgame/:gameId response (2026-10-04):
// `data` is an array of arrays — one sub-array per market — and every odd
// object repeats the game's own home_team/away_team/game_date/game_id.
type WinHouseRawOdd = {
  home_team: string;
  away_team: string;
  game_date: string;
  market_id: string;
  market_option: string;
  odd: string;
};

export type WinHousePromotionGame = {
  game_id: string;
  home_team: string;
  away_team: string;
  date: string;
  markets: {
    "1"?: number;
    X?: number;
    "2"?: number;
  };
  bothTeamsScore: {
    yes?: number;
    no?: number;
  };
};

// WinHouse's standard three-way "1x2" market (market_id "1001", confirmed
// from a real response — market_option comes back as "1 "/"x "/"2 " with a
// trailing space WinHouse always sends).
const ONE_X_TWO_MARKET_ID = "1001";

// "Both Teams To Score" (market_id "1007", confirmed from a real response —
// market_option comes back as "yes "/"no "). Football-only, per the
// user-specified ticket format (2026-10-04): 1x2 + BTS for football.
const BOTH_TEAMS_SCORE_MARKET_ID = "1007";

export function parseWinHouseGame(raw: unknown, gameId: string): WinHousePromotionGame | null {
  if (!Array.isArray(raw)) return null;
  const flat = (raw as unknown[][]).flat() as WinHouseRawOdd[];
  if (flat.length === 0) return null;

  const markets: WinHousePromotionGame["markets"] = {};
  const bothTeamsScore: WinHousePromotionGame["bothTeamsScore"] = {};
  for (const o of flat) {
    if (!o) continue;
    const odd = Number(o.odd);
    if (!Number.isFinite(odd)) continue;
    const option = o.market_option.trim().toLowerCase();
    if (o.market_id === ONE_X_TWO_MARKET_ID) {
      if (option === "1") markets["1"] = odd;
      else if (option === "x") markets.X = odd;
      else if (option === "2") markets["2"] = odd;
    } else if (o.market_id === BOTH_TEAMS_SCORE_MARKET_ID) {
      if (option === "yes") bothTeamsScore.yes = odd;
      else if (option === "no") bothTeamsScore.no = odd;
    }
  }
  if (Object.keys(markets).length === 0) return null;

  const first = flat[0]!;
  return {
    game_id: gameId,
    home_team: first.home_team,
    away_team: first.away_team,
    date: first.game_date,
    markets,
    bothTeamsScore,
  };
}
