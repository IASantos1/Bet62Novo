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
};

// WinHouse's standard three-way "1x2" market (market_id "1001", confirmed
// from a real response — market_option comes back as "1 "/"x "/"2 " with a
// trailing space WinHouse always sends). This is the only market the
// Telegram promotion post uses for now — everything else in the raw
// response (handicaps, over/under, BTTS, ...) is ignored, per the
// step-by-step build: prove the 1x2 case works before adding more markets.
const ONE_X_TWO_MARKET_ID = "1001";

export function parseWinHouseGame(raw: unknown, gameId: string): WinHousePromotionGame | null {
  if (!Array.isArray(raw)) return null;
  const flat = (raw as unknown[][]).flat() as WinHouseRawOdd[];
  if (flat.length === 0) return null;

  const markets: WinHousePromotionGame["markets"] = {};
  for (const o of flat) {
    if (!o || o.market_id !== ONE_X_TWO_MARKET_ID) continue;
    const odd = Number(o.odd);
    if (!Number.isFinite(odd)) continue;
    const option = o.market_option.trim().toUpperCase();
    if (option === "1") markets["1"] = odd;
    else if (option === "X") markets.X = odd;
    else if (option === "2") markets["2"] = odd;
  }
  if (Object.keys(markets).length === 0) return null;

  const first = flat[0]!;
  return {
    game_id: gameId,
    home_team: first.home_team,
    away_team: first.away_team,
    date: first.game_date,
    markets,
  };
}
