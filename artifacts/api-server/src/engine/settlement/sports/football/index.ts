import { settleFootballResult } from "../../rules/football/result";
import { MarketHandler } from "../../registry/marketRegistry";

export interface MarketDefinition {
  code: string;
  aliases?: string[];
  handler: MarketHandler;
}

export const footballMarkets: MarketDefinition[] = [
  {
    code: "match_winner",
    aliases: [
      "1x2",
      "result",
      "match_result"
    ],
    handler: settleFootballResult,
  },
];
