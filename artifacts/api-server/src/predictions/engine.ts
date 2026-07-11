/**
 * Motor principal de previsões/combinações.
 * Junta templates, contexto da partida e motor de precificação
 * para gerar a lista de combos publicáveis para um dado jogo.
 */

import type { LegId, ComboTemplate, MatchConditions } from "./templates.js";
import { COMBO_TEMPLATES } from "./templates.js";
import {
  oddToProbFair,
  combineProbs,
  applyMarginAndConvert,
  isPublishable,
} from "./pricing.js";

// ── Tipos de mercado re-exportados (para uso na rota) ─────────────────────

export type MatchContext = {
  homeWinProb: number;      // probabilidade implícita de vitória da casa (0-1)
  awayWinProb: number;      // probabilidade implícita de vitória do visitante (0-1)
  drawProb: number;         // probabilidade implícita de empate (0-1)
  expectedGoals: number;    // gols esperados totais (λ_home + λ_away estimado)
  bttsProb: number;         // probabilidade de ambas marcarem (0-1)
  cornersAvailable: boolean; // se mercado de escanteios está disponível
};

export type PublishedCombo = {
  id: string;
  title: string;
  category: string;
  legs: Array<{ code: LegId; label: string; selectionKey: string }>;
  odd: number;
};

// ── Chaves de seleção reconhecidas pelo motor de liquidação (settlement.ts) ─
// Cada leg precisa mapear para um código compacto que o motor de liquidação
// real já entende (normalizeCompactFootballSelectionKey), senão a aposta
// nunca liquida — fica pendente para sempre. Legs sem mercado de liquidação
// disponível (HT_OVER_0_5/1_5, CORNERS_OVER_11_5) não devem ser publicados
// hoje (ver getLegOdd, que já retorna null para eles).
export const LEG_SELECTION_KEY: Record<LegId, string> = {
  HOME_WIN:               "r:home",
  AWAY_WIN:               "r:away",
  DRAW:                   "r:draw",
  OVER_1_5:               "tg:o1.5",
  OVER_2_5:               "tg:o2.5",
  OVER_3_5:               "tg:o3.5",
  UNDER_2_5:              "tg:u2.5",
  UNDER_3_5:              "tg:u3.5",
  BTTS_YES:               "bts:y",
  BTTS_NO:                "bts:n",
  HOME_HANDICAP_MINUS_1:  "hcp:-1",
  HOME_OVER_1_5_GOALS:    "htg:o1.5",
  AWAY_OVER_0_5_GOALS:    "atg:o0.5",
  FIRST_GOAL_HOME:        "fg:h",
  HT_HOME_WIN:            "ht:home",
  HT_DRAW:                "ht:draw",
  HT_AWAY_WIN:            "ht:away",
  HT_OVER_0_5:            "bts1h:y",
  HT_OVER_1_5:            "bts1h:y",
  SECOND_HALF_MORE_GOALS: "hsh:2",
  CORNERS_OVER_8_5:       "cn:o8.5",
  CORNERS_OVER_9_5:       "cn:o9.5",
  CORNERS_OVER_10_5:      "cn:o10.5",
  CORNERS_OVER_11_5:      "cn:o11.5",
  HT_FT_HOME_HOME:        "htft:hh",
  HT_FT_DRAW_HOME:        "htft:dh",
  HT_FT_AWAY_HOME:        "htft:ah",
};

// ── Rótulos em português para cada leg ───────────────────────────────────

const LEG_LABELS: Record<LegId, string> = {
  HOME_WIN:               "Casa Vence",
  AWAY_WIN:               "Visitante Vence",
  DRAW:                   "Empate",
  OVER_1_5:               "Mais de 1.5 Gols",
  OVER_2_5:               "Mais de 2.5 Gols",
  OVER_3_5:               "Mais de 3.5 Gols",
  UNDER_2_5:              "Menos de 2.5 Gols",
  UNDER_3_5:              "Menos de 3.5 Gols",
  BTTS_YES:               "Ambas Marcam — Sim",
  BTTS_NO:                "Ambas Marcam — Não",
  HOME_HANDICAP_MINUS_1:  "Casa Handicap −1",
  HOME_OVER_1_5_GOALS:    "Casa Marca 2+ Gols",
  AWAY_OVER_0_5_GOALS:    "Visitante Marca",
  FIRST_GOAL_HOME:        "Casa Marca Primeiro",
  HT_HOME_WIN:            "Casa Vence 1º Tempo",
  HT_DRAW:                "Empate 1º Tempo",
  HT_AWAY_WIN:            "Visitante Vence 1º Tempo",
  HT_OVER_0_5:            "Mais de 0.5 Gols 1º Tempo",
  HT_OVER_1_5:            "Mais de 1.5 Gols 1º Tempo",
  SECOND_HALF_MORE_GOALS: "Mais Gols no 2º Tempo",
  CORNERS_OVER_8_5:       "Escanteios +8.5",
  CORNERS_OVER_9_5:       "Escanteios +9.5",
  CORNERS_OVER_10_5:      "Escanteios +10.5",
  CORNERS_OVER_11_5:      "Escanteios +11.5",
  HT_FT_HOME_HOME:        "Intervalo/Final: Casa/Casa",
  HT_FT_DRAW_HOME:        "Intervalo/Final: Empate/Casa",
  HT_FT_AWAY_HOME:        "Intervalo/Final: Visitante/Casa",
};

// ── Interface de mercados mínima para o motor ─────────────────────────────

type Markets = {
  odds: { home: number; draw: number; away: number };
  markets: {
    totalGoals?: { over15: number; under15: number; over25: number; under25: number; over35: number; under35: number };
    bothTeamsScore?: { yes: number; no: number };
    halfTime?: { home: number; draw: number; away: number };
    firstGoal?: { home: number; noGoal: number; away: number };
    handicap?: { homeMinusOne: number; awayPlusOne: number };
    teamGoals?: { homeOver15: number; homeUnder15: number; awayOver05: number; awayUnder05: number };
    highestScoringHalf?: { first: number; second: number; equal: number };
    btts1H?: { yes: number; no: number };
    corners?: { o85: number; u85: number; o95: number; u95: number; o105: number; u105: number };
    htft?: { hh: number; dh: number; ah: number; dd: number };
  };
};

// ── computeMatchContext ───────────────────────────────────────────────────

/**
 * Deriva o contexto analítico da partida a partir das odds já calculadas.
 * Usa normalização do overround 1x2 para obter probabilidades limpas.
 */
export function computeMatchContext(match: Markets): MatchContext {
  const { home: oHome, draw: oDraw, away: oAway } = match.odds;
  const mk = match.markets;

  // Probabilidades 1x2 limpas (remove overround)
  const invH = oHome > 1.01 ? 1 / oHome : 0;
  const invD = oDraw > 1.01 ? 1 / oDraw : 0;
  const invA = oAway > 1.01 ? 1 / oAway : 0;
  const inv1x2 = invH + invD + invA || 1;
  const homeWinProb = invH / inv1x2;
  const drawProb    = invD / inv1x2;
  const awayWinProb = invA / inv1x2;

  // Expected goals — derivado de over/under 2.5 quando disponível
  // p(over_2.5) ≈ 1 - CDF_Poisson(λ_total, 2) → λ ≈ inverso numérico simples
  // Aproximação: se p(O25) é a prob justa de over 2.5:
  //   λ ≈ 2.5 + (p - 0.5) * 2.4 (heurística calibrada para λ ∈ [1.5, 4.5])
  let expectedGoals = 2.5;
  if (mk.totalGoals?.over25 && mk.totalGoals.over25 > 1.01 && mk.totalGoals.under25 > 1.01) {
    const pO25 = oddToProbFair(mk.totalGoals.over25, mk.totalGoals.under25);
    expectedGoals = Math.max(1.2, Math.min(5.0, 2.5 + (pO25 - 0.5) * 2.4));
  }

  // BTTS
  let bttsProb = 0.45;
  if (mk.bothTeamsScore?.yes && mk.bothTeamsScore.yes > 1.01) {
    bttsProb = oddToProbFair(mk.bothTeamsScore.yes, mk.bothTeamsScore.no);
  }

  // Corners available
  const cornersAvailable = !!(
    mk.corners?.o95 &&
    mk.corners.o95 > 1.01 &&
    mk.corners.u95 > 1.01
  );

  return { homeWinProb, awayWinProb, drawProb, expectedGoals, bttsProb, cornersAvailable };
}

// ── Avaliação de condições ────────────────────────────────────────────────

function conditionsMet(conditions: MatchConditions, ctx: MatchContext): boolean {
  const check = (
    val: number,
    rule?: { gte?: number; lte?: number },
  ): boolean => {
    if (!rule) return true;
    if (rule.gte !== undefined && val < rule.gte) return false;
    if (rule.lte !== undefined && val > rule.lte) return false;
    return true;
  };

  if (!check(ctx.homeWinProb, conditions.home_win_probability)) return false;
  if (!check(ctx.awayWinProb, conditions.away_win_probability)) return false;
  if (!check(ctx.expectedGoals, conditions.expected_goals)) return false;
  if (!check(ctx.bttsProb, conditions.btts_probability)) return false;
  if (conditions.corners_available && !ctx.cornersAvailable) return false;

  return true;
}

// ── Extração de odd para cada leg ─────────────────────────────────────────

type LegOddResult = { prob: number; odd: number } | null;

function getLegOdd(legId: LegId, match: Markets): LegOddResult {
  const mk = match.markets;
  const o = match.odds;

  const safe = (odd: number, paired?: number): LegOddResult => {
    if (!odd || odd <= 1.01) return null;
    return { odd, prob: oddToProbFair(odd, paired) };
  };

  switch (legId) {
    case "HOME_WIN":
      return safe(o.home, o.draw + o.away > 0.5 ? (1 / (1 / o.draw + 1 / o.away)) : undefined);
    case "AWAY_WIN":
      return safe(o.away);
    case "DRAW":
      return safe(o.draw);
    case "OVER_1_5":
      return mk.totalGoals ? safe(mk.totalGoals.over15, mk.totalGoals.under15) : null;
    case "OVER_2_5":
      return mk.totalGoals ? safe(mk.totalGoals.over25, mk.totalGoals.under25) : null;
    case "OVER_3_5":
      return mk.totalGoals ? safe(mk.totalGoals.over35, mk.totalGoals.under35) : null;
    case "UNDER_2_5":
      return mk.totalGoals ? safe(mk.totalGoals.under25, mk.totalGoals.over25) : null;
    case "UNDER_3_5":
      return mk.totalGoals ? safe(mk.totalGoals.under35, mk.totalGoals.over35) : null;
    case "BTTS_YES":
      return mk.bothTeamsScore ? safe(mk.bothTeamsScore.yes, mk.bothTeamsScore.no) : null;
    case "BTTS_NO":
      return mk.bothTeamsScore ? safe(mk.bothTeamsScore.no, mk.bothTeamsScore.yes) : null;
    case "HOME_HANDICAP_MINUS_1":
      return mk.handicap ? safe(mk.handicap.homeMinusOne, mk.handicap.awayPlusOne) : null;
    case "HOME_OVER_1_5_GOALS":
      return mk.teamGoals ? safe(mk.teamGoals.homeOver15, mk.teamGoals.homeUnder15) : null;
    case "AWAY_OVER_0_5_GOALS":
      return mk.teamGoals ? safe(mk.teamGoals.awayOver05, mk.teamGoals.awayUnder05) : null;
    case "FIRST_GOAL_HOME":
      return mk.firstGoal ? safe(mk.firstGoal.home) : null;
    case "HT_HOME_WIN":
      return mk.halfTime ? safe(mk.halfTime.home) : null;
    case "HT_DRAW":
      return mk.halfTime ? safe(mk.halfTime.draw) : null;
    case "HT_AWAY_WIN":
      return mk.halfTime ? safe(mk.halfTime.away) : null;
    case "HT_OVER_0_5":
      // usa btts1H.yes como proxy de "gol no 1T por qualquer equipa"
      return mk.btts1H ? safe(mk.btts1H.yes, mk.btts1H.no) : null;
    case "HT_OVER_1_5":
      // sem mercado direto — retorna null para não inventar valor
      return null;
    case "SECOND_HALF_MORE_GOALS":
      return mk.highestScoringHalf ? safe(mk.highestScoringHalf.second) : null;
    case "CORNERS_OVER_8_5":
      return mk.corners ? safe(mk.corners.o85, mk.corners.u85) : null;
    case "CORNERS_OVER_9_5":
      return mk.corners ? safe(mk.corners.o95, mk.corners.u95) : null;
    case "CORNERS_OVER_10_5":
      return mk.corners ? safe(mk.corners.o105, mk.corners.u105) : null;
    case "CORNERS_OVER_11_5":
      // sem linha 11.5 no backend atual — retorna null
      return null;
    case "HT_FT_HOME_HOME":
      return mk.htft ? safe(mk.htft.hh) : null;
    case "HT_FT_DRAW_HOME":
      return mk.htft ? safe(mk.htft.dh) : null;
    case "HT_FT_AWAY_HOME":
      return mk.htft ? safe(mk.htft.ah) : null;
    default:
      return null;
  }
}

// ── publishCombosForMatch ─────────────────────────────────────────────────

/**
 * Função principal: dado o match (odds + markets já calculados),
 * seleciona templates compatíveis, calcula odd conjunta com correlação
 * e retorna apenas os combos dentro da faixa publicável.
 */
export function publishCombosForMatch(match: Markets): PublishedCombo[] {
  const ctx = computeMatchContext(match);
  const published: PublishedCombo[] = [];

  for (const template of COMBO_TEMPLATES) {
    // 1. Verificar condições do contexto
    if (!conditionsMet(template.conditions, ctx)) continue;

    // 2. Obter odds de cada leg
    const legResults: Array<{ legId: LegId; prob: number; odd: number }> = [];
    let allAvailable = true;

    for (const legId of template.legs) {
      const result = getLegOdd(legId, match);
      if (!result) {
        allAvailable = false;
        break;
      }
      legResults.push({ legId, prob: result.prob, odd: result.odd });
    }

    if (!allAvailable) continue;

    // 3. Calcular probabilidade conjunta com ajuste de correlação
    const jointProb = combineProbs(
      legResults.map((r) => ({ legId: r.legId, prob: r.prob })),
    );

    // 4. Aplicar margem e converter em odd
    const finalOdd = applyMarginAndConvert(jointProb);

    // 5. Filtrar por faixa publicável
    if (!isPublishable(finalOdd)) continue;

    published.push({
      id: template.id,
      title: template.title,
      category: template.category,
      legs: template.legs.map((l) => ({ code: l, label: LEG_LABELS[l], selectionKey: LEG_SELECTION_KEY[l] })),
      odd: finalOdd,
    });
  }

  return published;
}
