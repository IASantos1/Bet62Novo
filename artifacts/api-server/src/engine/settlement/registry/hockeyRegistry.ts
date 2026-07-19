import { MarketRegistry } from "./marketRegistry.js";
import {
  settleHockeyMoneyline,
  settleHockeyPuckLine,
  settleHockeyTotalGoals,
  settleHockeyPeriodWinner,
} from "../rules/hockey/index.js";

export const hockeyRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  {
    codes: ["moneyline", "winner", "match_winner", "1x2"],
    handler: settleHockeyMoneyline,
  },
  {
    codes: ["puck_line", "puckline", "spread", "handicap"],
    handler: settleHockeyPuckLine,
  },
  {
    codes: ["total_goals", "over_under", "totals"],
    handler: settleHockeyTotalGoals,
  },
  {
    codes: ["period_winner", "period_result"],
    handler: settleHockeyPeriodWinner,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    hockeyRegistry.register(code, market.handler);
  }
}
