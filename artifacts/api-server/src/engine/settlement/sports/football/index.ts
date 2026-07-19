import { settleFootballResult } from "../../rules/football/result.js";
import { settleOverUnder } from "../../rules/football/overUnder.js";
import { settleHandicap } from "../../rules/football/handicap.js";
import { settleAsianHandicap } from "../../rules/football/asianHandicap.js";
import { settleBtts } from "../../rules/football/btts.js";
import { settleCorners } from "../../rules/football/corners.js";
import { settleCards } from "../../rules/football/cards.js";
import { settlePlayerProps } from "../../rules/football/playerProps.js";
import type { MarketHandler } from "../../registry/marketRegistry.js";

export interface MarketDefinition {
  code: string;
  aliases?: string[];
  handler: MarketHandler;
}

export const footballMarkets: MarketDefinition[] = [
  {
    code: "match_winner",
    aliases: ["1x2", "result", "match_result"],
    handler: settleFootballResult,
  },
  {
    code: "over_under",
    aliases: ["total_goals", "o/u", "total", "ou"],
    handler: settleOverUnder,
  },
  {
    code: "handicap",
    aliases: ["european_handicap", "hcp", "euro_handicap"],
    handler: settleHandicap,
  },
  {
    code: "asian_handicap",
    aliases: ["ah", "asian_hcp"],
    handler: settleAsianHandicap,
  },
  {
    code: "btts",
    aliases: ["both_teams_to_score", "gg/ng", "gg", "ng", "bts"],
    handler: settleBtts,
  },
  {
    code: "corners",
    aliases: ["total_corners", "corner_handicap", "corners_ou"],
    handler: settleCorners,
  },
  {
    code: "cards",
    aliases: ["total_cards", "player_card", "yellow_cards", "bookings"],
    handler: settleCards,
  },
  {
    code: "player_goals",
    aliases: ["anytime_scorer", "first_scorer"],
    handler: settlePlayerProps,
  },
];
