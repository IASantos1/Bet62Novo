import { settleFootballResult } from "../../rules/football/result.js";
import { settleOverUnder } from "../../rules/football/overUnder.js";
import { settleHandicap } from "../../rules/football/handicap.js";
import { settleAsianHandicap } from "../../rules/football/asianHandicap.js";
import { settleBtts } from "../../rules/football/btts.js";
import { settleCorners } from "../../rules/football/corners.js";
import { settleCards } from "../../rules/football/cards.js";
import { settlePlayerProps } from "../../rules/football/playerProps.js";
import { settleDoubleChance, settleDrawNoBet } from "../../rules/football/doubleChance.js";
import {
  settleBttsFirstHalf,
  settleHalfTimeResult,
  settleSecondHalfResult,
  settleWinBothHalves,
  settleHighestScoringHalf,
} from "../../rules/football/halfTimeMarkets.js";
import { settleHtFt } from "../../rules/football/htFt.js";
import {
  settleHomeGoals,
  settleAwayGoals,
  settleWinToNil,
  settleCleanSheet,
} from "../../rules/football/teamGoals.js";
import {
  settleExactGoals,
  settleOddEvenGoals,
  settleAsianTotals,
} from "../../rules/football/specialGoals.js";
import {
  settleFirstGoal,
  settleLastGoal,
  settleCorrectScore,
} from "../../rules/football/goalEvents.js";
import type { MarketHandler } from "../../registry/marketRegistry.js";

export interface MarketDefinition {
  code: string;
  aliases?: string[];
  handler: MarketHandler;
}

export const footballMarkets: MarketDefinition[] = [
  // ── Resultado ─────────────────────────────────────────────────────────────
  {
    code: "match_winner",
    aliases: ["1x2", "result", "match_result"],
    handler: settleFootballResult,
  },
  {
    code: "double_chance",
    aliases: ["dupla_chance", "dc"],
    handler: settleDoubleChance,
  },
  {
    code: "draw_no_bet",
    aliases: ["dnb"],
    handler: settleDrawNoBet,
  },
  {
    code: "ht_ft",
    aliases: ["half_time_full_time", "htft", "intervalo_final"],
    handler: settleHtFt,
  },
  {
    code: "correct_score",
    aliases: ["placar_exato", "cs"],
    handler: settleCorrectScore,
  },

  // ── Gols ──────────────────────────────────────────────────────────────────
  {
    code: "over_under",
    aliases: ["total_goals", "o/u", "total", "ou"],
    handler: settleOverUnder,
  },
  {
    code: "asian_totals",
    aliases: ["asian_ou", "asian_total", "total_asiatico"],
    handler: settleAsianTotals,
  },
  {
    code: "btts",
    aliases: ["both_teams_to_score", "gg/ng", "gg", "ng", "bts", "ambas_marcam"],
    handler: settleBtts,
  },
  {
    code: "btts_first_half",
    aliases: ["btts_ht", "gg_1t", "ambas_marcam_1t"],
    handler: settleBttsFirstHalf,
  },
  {
    code: "exact_goals",
    aliases: ["gols_exatos"],
    handler: settleExactGoals,
  },
  {
    code: "odd_even_goals",
    aliases: ["odd_even", "impar_par", "odd/even"],
    handler: settleOddEvenGoals,
  },
  {
    code: "home_goals",
    aliases: ["team_goals_home", "gols_casa"],
    handler: settleHomeGoals,
  },
  {
    code: "away_goals",
    aliases: ["team_goals_away", "gols_visitante"],
    handler: settleAwayGoals,
  },
  {
    code: "win_to_nil",
    aliases: ["vitoria_a_zero", "clean_win"],
    handler: settleWinToNil,
  },
  {
    code: "clean_sheet",
    aliases: ["folha_limpa"],
    handler: settleCleanSheet,
  },
  {
    code: "first_goal",
    aliases: ["primeiro_gol", "first_scorer_team"],
    handler: settleFirstGoal,
  },
  {
    code: "last_goal",
    aliases: ["ultimo_gol"],
    handler: settleLastGoal,
  },
  {
    code: "highest_scoring_half",
    aliases: ["tempo_mais_gols", "most_goals_half"],
    handler: settleHighestScoringHalf,
  },

  // ── Handicap ──────────────────────────────────────────────────────────────
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

  // ── Tempos ────────────────────────────────────────────────────────────────
  {
    code: "half_time_result",
    aliases: ["ht_result", "resultado_1t", "1h_result"],
    handler: settleHalfTimeResult,
  },
  {
    code: "second_half_result",
    aliases: ["2h_result", "resultado_2t"],
    handler: settleSecondHalfResult,
  },
  {
    code: "win_both_halves",
    aliases: ["vencer_ambos_tempos", "both_halves"],
    handler: settleWinBothHalves,
  },

  // ── Escanteios ────────────────────────────────────────────────────────────
  {
    code: "corners",
    aliases: ["total_corners", "corner_handicap", "corners_ou", "escanteios"],
    handler: settleCorners,
  },

  // ── Cartões ───────────────────────────────────────────────────────────────
  {
    code: "cards",
    aliases: ["total_cards", "player_card", "yellow_cards", "bookings", "cartoes"],
    handler: settleCards,
  },

  // ── Props de Jogadores ────────────────────────────────────────────────────
  {
    code: "player_goals",
    aliases: ["anytime_scorer", "first_scorer"],
    handler: settlePlayerProps,
  },
];
