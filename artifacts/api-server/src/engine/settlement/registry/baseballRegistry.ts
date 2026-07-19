import { MarketRegistry } from "./marketRegistry.js";
import {
  settleBaseballMoneyline,
  settleBaseballRunLine,
  settleBaseballTotalRuns,
  settleBaseballInningResult,
} from "../rules/baseball/index.js";

export const baseballRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  {
    codes: ["moneyline", "winner", "match_winner"],
    handler: settleBaseballMoneyline,
  },
  {
    codes: ["run_line", "runline", "spread", "handicap"],
    handler: settleBaseballRunLine,
  },
  {
    codes: ["total_runs", "over_under", "totals"],
    handler: settleBaseballTotalRuns,
  },
  {
    codes: ["inning_result", "inning_winner"],
    handler: settleBaseballInningResult,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    baseballRegistry.register(code, market.handler);
  }
}
