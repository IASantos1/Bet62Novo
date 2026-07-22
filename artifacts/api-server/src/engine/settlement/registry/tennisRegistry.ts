import { MarketRegistry } from "./marketRegistry.js";
import {
  settleTennisMatchWinner,
  settleExactSets,
  settleSetHandicap,
  settleTennisSetWinner,
  settleCorrectSetScore,
  settleTennisTotalSets,
  settleSetTotalGames,
  settleTotalGames,
  settleTennisGameHandicap,
  settlePlayerGames,
  settleOddEvenGames,
  settleTiebreak,
  settleFirstBreak,
  settleNumberOfBreaks,
  settleRaceToGames,
} from "../rules/tennis/index.js";

export const tennisRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  // ── Match ────────────────────────────────────────────────────────────────
  {
    codes: ["match_winner", "winner", "moneyline", "vencedor_jogo"],
    handler: settleTennisMatchWinner,
  },
  {
    codes: ["exact_sets", "resultado_exato_sets", "correct_sets"],
    handler: settleExactSets,
  },
  {
    codes: ["set_handicap", "sets_handicap", "handicap_sets"],
    handler: settleSetHandicap,
  },

  // ── Sets ─────────────────────────────────────────────────────────────────
  {
    codes: ["set_winner", "set_result", "vencedor_set"],
    handler: settleTennisSetWinner,
  },
  {
    codes: ["correct_set_score", "placar_set", "set_score"],
    handler: settleCorrectSetScore,
  },
  {
    codes: ["total_sets", "over_under_sets", "sets_ou"],
    handler: settleTennisTotalSets,
  },
  {
    codes: ["set_total_games", "games_set_ou", "set_games_total"],
    handler: settleSetTotalGames,
  },

  // ── Games ────────────────────────────────────────────────────────────────
  {
    codes: ["total_games", "games_total", "games_ou", "total_de_games"],
    handler: settleTotalGames,
  },
  {
    codes: ["game_handicap", "games_handicap", "handicap_games", "handicap"],
    handler: settleTennisGameHandicap,
  },
  {
    codes: ["player_games", "games_player", "player_games_ou"],
    handler: settlePlayerGames,
  },
  {
    codes: ["odd_even_games", "odd_even", "impar_par_games"],
    handler: settleOddEvenGames,
  },

  // ── Specials ─────────────────────────────────────────────────────────────
  {
    codes: ["tiebreak", "tie_break", "tiebreak_yn", "tiebreak_yes_no"],
    handler: settleTiebreak,
  },
  {
    codes: ["first_break", "primeiro_break", "first_service_break"],
    handler: settleFirstBreak,
  },
  {
    codes: ["number_of_breaks", "total_breaks", "breaks_ou"],
    handler: settleNumberOfBreaks,
  },
  {
    codes: ["race_to_games", "race_games", "corrida_de_games"],
    handler: settleRaceToGames,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    tennisRegistry.register(code, market.handler);
  }
}
