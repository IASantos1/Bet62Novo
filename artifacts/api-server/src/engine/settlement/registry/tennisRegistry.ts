import { MarketRegistry } from "./marketRegistry.js";
import {
  settleTennisMatchWinner,
  settleTennisSetWinner,
  settleTennisTotalSets,
  settleTennisGameHandicap,
} from "../rules/tennis/index.js";

export const tennisRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  {
    codes: ["match_winner", "winner", "moneyline"],
    handler: settleTennisMatchWinner,
  },
  {
    codes: ["set_winner", "set_result"],
    handler: settleTennisSetWinner,
  },
  {
    codes: ["total_sets", "over_under_sets"],
    handler: settleTennisTotalSets,
  },
  {
    codes: ["game_handicap", "games_handicap", "handicap"],
    handler: settleTennisGameHandicap,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    tennisRegistry.register(code, market.handler);
  }
}
