import { MarketRegistry } from "./marketRegistry.js";
import {
  settleBasketballMoneyline,
  settleBasketballSpread,
  settleBasketballTotalPoints,
  settleBasketballQuarterWinner,
} from "../rules/basketball/index.js";

export const basketballRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  {
    codes: ["moneyline", "winner", "match_winner"],
    handler: settleBasketballMoneyline,
  },
  {
    codes: ["spread", "handicap", "point_spread"],
    handler: settleBasketballSpread,
  },
  {
    codes: ["total_points", "over_under", "totals"],
    handler: settleBasketballTotalPoints,
  },
  {
    codes: ["quarter_winner", "quarter_result"],
    handler: settleBasketballQuarterWinner,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    basketballRegistry.register(code, market.handler);
  }
}
