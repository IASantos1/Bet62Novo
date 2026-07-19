import { MarketRegistry } from "./marketRegistry.js";
import {
  settleVolleyballMatchWinner,
  settleVolleyballTotalSets,
  settleVolleyballSetWinner,
} from "../rules/volleyball/index.js";

export const volleyballRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  {
    codes: ["match_winner", "winner", "moneyline"],
    handler: settleVolleyballMatchWinner,
  },
  {
    codes: ["total_sets", "over_under_sets"],
    handler: settleVolleyballTotalSets,
  },
  {
    codes: ["set_winner", "set_result"],
    handler: settleVolleyballSetWinner,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    volleyballRegistry.register(code, market.handler);
  }
}
