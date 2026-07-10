/**
 * Biblioteca de templates de combinações sugeridas.
 * Cada template define: id, título, categoria, legs (mercados),
 * e conditions (condições sobre o contexto da partida para ativação).
 *
 * Mercados de jogador (goleador) foram omitidos pois não existem no backend.
 * Templates de escanteios usam o mercado corners já presente em AdvancedMarkets.
 */

export type LegId =
  | "HOME_WIN"
  | "AWAY_WIN"
  | "DRAW"
  | "OVER_1_5"
  | "OVER_2_5"
  | "OVER_3_5"
  | "UNDER_2_5"
  | "UNDER_3_5"
  | "BTTS_YES"
  | "BTTS_NO"
  | "HOME_HANDICAP_MINUS_1"
  | "HOME_OVER_1_5_GOALS"   // teamGoals homeOver15
  | "AWAY_OVER_0_5_GOALS"   // teamGoals awayOver05
  | "FIRST_GOAL_HOME"       // firstGoal.home
  | "HT_HOME_WIN"           // halfTime.home
  | "HT_DRAW"               // halfTime.draw
  | "HT_AWAY_WIN"           // halfTime.away
  | "HT_OVER_0_5"           // over 0.5 goals at HT → btts1H proxy (if both > 0)
  | "HT_OVER_1_5"           // over 1.5 goals at HT
  | "SECOND_HALF_MORE_GOALS" // highestScoringHalf.second
  | "CORNERS_OVER_8_5"
  | "CORNERS_OVER_9_5"
  | "CORNERS_OVER_10_5"
  | "CORNERS_OVER_11_5"
  | "HT_FT_HOME_HOME"       // htft.hh
  | "HT_FT_DRAW_HOME"       // htft.dh
  | "HT_FT_AWAY_HOME";      // htft.ah

export type TemplateCategory =
  | "Favorito"
  | "Equilibrado"
  | "Goleada"
  | "Primeiro Tempo"
  | "Escanteios"
  | "Segundo Tempo";

export type MatchConditions = {
  /** Probabilidade implícita de vitória da casa (0-1) */
  home_win_probability?: { gte?: number; lte?: number };
  /** Probabilidade implícita de vitória do visitante (0-1) */
  away_win_probability?: { gte?: number; lte?: number };
  /** Gols esperados totais (λ home + λ away) */
  expected_goals?: { gte?: number; lte?: number };
  /** Probabilidade de BTTS (0-1) */
  btts_probability?: { gte?: number; lte?: number };
  /** Indica que escanteios devem estar disponíveis */
  corners_available?: boolean;
};

export type ComboTemplate = {
  id: string;
  title: string;
  category: TemplateCategory;
  legs: LegId[];
  conditions: MatchConditions;
};

// ─── Biblioteca completa de templates ────────────────────────────────────────

export const COMBO_TEMPLATES: ComboTemplate[] = [
  // ── FAVORITO (casa claramente favorita) ──────────────────────────────────

  {
    id: "fav_dom_1",
    title: "Favorito Domina + Placar Aberto",
    category: "Favorito",
    legs: ["HOME_WIN", "OVER_2_5", "BTTS_NO"],
    conditions: {
      home_win_probability: { gte: 0.58 },
      expected_goals: { gte: 2.2 },
      btts_probability: { lte: 0.48 },
    },
  },
  {
    id: "fav_dom_2",
    title: "Casa Vence com Gols",
    category: "Favorito",
    legs: ["HOME_WIN", "OVER_1_5", "FIRST_GOAL_HOME"],
    conditions: {
      home_win_probability: { gte: 0.55 },
      expected_goals: { gte: 1.8 },
    },
  },
  {
    id: "fav_dom_3",
    title: "Casa Domina os Escanteios",
    category: "Favorito",
    legs: ["HOME_WIN", "CORNERS_OVER_9_5"],
    conditions: {
      home_win_probability: { gte: 0.58 },
      corners_available: true,
    },
  },
  {
    id: "fav_dom_4",
    title: "Favorito Controlado",
    category: "Favorito",
    legs: ["HOME_WIN", "UNDER_3_5", "BTTS_NO"],
    conditions: {
      home_win_probability: { gte: 0.60 },
      btts_probability: { lte: 0.45 },
      expected_goals: { lte: 3.2 },
    },
  },
  {
    id: "fav_win_suffering_1",
    title: "Favorito Vence Sofrendo",
    category: "Favorito",
    legs: ["HOME_WIN", "BTTS_YES", "OVER_2_5"],
    conditions: {
      home_win_probability: { gte: 0.52, lte: 0.72 },
      btts_probability: { gte: 0.48 },
      expected_goals: { gte: 2.5 },
    },
  },
  {
    id: "fav_win_suffering_2",
    title: "Casa Vence + 2º Tempo Decide",
    category: "Favorito",
    legs: ["HOME_WIN", "SECOND_HALF_MORE_GOALS", "BTTS_YES"],
    conditions: {
      home_win_probability: { gte: 0.52, lte: 0.72 },
      btts_probability: { gte: 0.45 },
    },
  },
  {
    id: "fav_handicap_1",
    title: "Casa Handicap −1 + Gols",
    category: "Goleada",
    legs: ["HOME_HANDICAP_MINUS_1", "OVER_2_5"],
    conditions: {
      home_win_probability: { gte: 0.60 },
      expected_goals: { gte: 2.5 },
    },
  },
  {
    id: "fav_goalfest_1",
    title: "Goleada + Ambas Marcam",
    category: "Goleada",
    legs: ["HOME_WIN", "OVER_3_5", "BTTS_YES"],
    conditions: {
      home_win_probability: { gte: 0.52 },
      expected_goals: { gte: 3.0 },
      btts_probability: { gte: 0.48 },
    },
  },

  // ── EQUILIBRADO ──────────────────────────────────────────────────────────

  {
    id: "eq_open_1",
    title: "Jogo Aberto + Ambas Marcam",
    category: "Equilibrado",
    legs: ["BTTS_YES", "OVER_2_5"],
    conditions: {
      home_win_probability: { lte: 0.55 },
      btts_probability: { gte: 0.50 },
      expected_goals: { gte: 2.4 },
    },
  },
  {
    id: "eq_open_2",
    title: "Jogo Aberto + Escanteios",
    category: "Equilibrado",
    legs: ["BTTS_YES", "OVER_2_5", "CORNERS_OVER_9_5"],
    conditions: {
      home_win_probability: { lte: 0.55 },
      btts_probability: { gte: 0.50 },
      expected_goals: { gte: 2.5 },
      corners_available: true,
    },
  },
  {
    id: "eq_open_3",
    title: "Ambas Marcam + Mais Gols 2º Tempo",
    category: "Equilibrado",
    legs: ["BTTS_YES", "SECOND_HALF_MORE_GOALS", "OVER_2_5"],
    conditions: {
      home_win_probability: { lte: 0.55 },
      btts_probability: { gte: 0.48 },
      expected_goals: { gte: 2.4 },
    },
  },
  {
    id: "eq_closed_1",
    title: "Jogo Fechado + Poucos Gols",
    category: "Equilibrado",
    legs: ["HOME_WIN", "UNDER_2_5", "BTTS_NO"],
    conditions: {
      home_win_probability: { gte: 0.50, lte: 0.65 },
      expected_goals: { lte: 2.3 },
      btts_probability: { lte: 0.40 },
    },
  },
  {
    id: "eq_closed_2",
    title: "Empate + Under 2.5",
    category: "Equilibrado",
    legs: ["DRAW", "UNDER_2_5"],
    conditions: {
      home_win_probability: { lte: 0.48 },
      expected_goals: { lte: 2.3 },
    },
  },

  // ── PRIMEIRO TEMPO ────────────────────────────────────────────────────────

  {
    id: "ht_active_1",
    title: "1º Tempo Movimentado",
    category: "Primeiro Tempo",
    legs: ["HT_HOME_WIN", "OVER_1_5", "FIRST_GOAL_HOME"],
    conditions: {
      home_win_probability: { gte: 0.52 },
      expected_goals: { gte: 2.2 },
    },
  },
  {
    id: "ht_active_2",
    title: "Casa Vence na 1ª Metade",
    category: "Primeiro Tempo",
    legs: ["HT_HOME_WIN", "HOME_WIN"],
    conditions: {
      home_win_probability: { gte: 0.55 },
    },
  },
  {
    id: "ht_balanced_1",
    title: "Empate HT + Casa Vence FT",
    category: "Primeiro Tempo",
    legs: ["HT_DRAW", "HOME_WIN", "OVER_1_5"],
    conditions: {
      home_win_probability: { gte: 0.50 },
      expected_goals: { gte: 1.8 },
    },
  },
  {
    id: "ht_balanced_2",
    title: "Empate HT + 2º Tempo Decide",
    category: "Primeiro Tempo",
    legs: ["HT_DRAW", "HOME_WIN", "SECOND_HALF_MORE_GOALS"],
    conditions: {
      home_win_probability: { gte: 0.50 },
    },
  },
  {
    id: "ht_over_1",
    title: "1º Tempo com Golos",
    category: "Primeiro Tempo",
    legs: ["HT_OVER_0_5", "BTTS_YES", "OVER_2_5"],
    conditions: {
      expected_goals: { gte: 2.4 },
      btts_probability: { gte: 0.48 },
    },
  },
  {
    id: "htft_home_home",
    title: "Casa Lidera o Jogo Inteiro",
    category: "Primeiro Tempo",
    legs: ["HT_FT_HOME_HOME", "OVER_2_5"],
    conditions: {
      home_win_probability: { gte: 0.55 },
      expected_goals: { gte: 2.2 },
    },
  },
  {
    id: "htft_draw_home",
    title: "Empate ao Intervalo → Casa Vence",
    category: "Segundo Tempo",
    legs: ["HT_FT_DRAW_HOME", "BTTS_YES"],
    conditions: {
      home_win_probability: { gte: 0.50 },
      btts_probability: { gte: 0.44 },
    },
  },

  // ── SEGUNDO TEMPO ─────────────────────────────────────────────────────────

  {
    id: "sh_decisive_1",
    title: "2º Tempo Decisivo + Casa",
    category: "Segundo Tempo",
    legs: ["HT_DRAW", "HOME_WIN", "OVER_2_5"],
    conditions: {
      home_win_probability: { gte: 0.50 },
      expected_goals: { gte: 2.3 },
    },
  },
  {
    id: "sh_decisive_2",
    title: "Mais Gols na 2ª Metade + Ambas",
    category: "Segundo Tempo",
    legs: ["SECOND_HALF_MORE_GOALS", "BTTS_YES"],
    conditions: {
      expected_goals: { gte: 2.2 },
      btts_probability: { gte: 0.45 },
    },
  },

  // ── ESCANTEIOS ────────────────────────────────────────────────────────────

  {
    id: "corners_1",
    title: "Muitos Escanteios + Jogo Aberto",
    category: "Escanteios",
    legs: ["CORNERS_OVER_10_5", "OVER_2_5", "BTTS_YES"],
    conditions: {
      expected_goals: { gte: 2.5 },
      btts_probability: { gte: 0.48 },
      corners_available: true,
    },
  },
  {
    id: "corners_2",
    title: "Casa Domina Escanteios",
    category: "Escanteios",
    legs: ["HOME_WIN", "CORNERS_OVER_9_5"],
    conditions: {
      home_win_probability: { gte: 0.55 },
      corners_available: true,
    },
  },
  {
    id: "corners_3",
    title: "Placar + Muitos Cantos",
    category: "Escanteios",
    legs: ["HOME_WIN", "CORNERS_OVER_8_5", "BTTS_YES"],
    conditions: {
      home_win_probability: { gte: 0.52 },
      btts_probability: { gte: 0.44 },
      corners_available: true,
    },
  },
  {
    id: "corners_4",
    title: "Jogo Intenso + Cantos Altos",
    category: "Escanteios",
    legs: ["CORNERS_OVER_11_5", "BTTS_YES", "OVER_2_5"],
    conditions: {
      expected_goals: { gte: 2.7 },
      btts_probability: { gte: 0.52 },
      corners_available: true,
    },
  },
];
