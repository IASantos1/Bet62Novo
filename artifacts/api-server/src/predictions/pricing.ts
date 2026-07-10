/**
 * Motor de precificação para combinações sugeridas.
 *
 * Fluxo:
 *  1. odd individual → probabilidade implícita (remove margem via par de odds)
 *  2. ajuste de correlação entre pares de legs (tabela documentada abaixo)
 *  3. probabilidade conjunta final
 *  4. aplicar margem da casa sobre a probabilidade conjunta
 *  5. converter em odd final; filtrar pela faixa min/max configurada
 */

import type { LegId } from "./templates.js";

// ── Configuração global (ajuste aqui) ─────────────────────────────────────

export const PRICING_CONFIG = {
  /** Margem aplicada sobre a prob conjunta final (ex: 0.07 = 7%) */
  houseMargin: 0.07,
  /** Odd mínima publicável */
  minOdd: 1.40,
  /** Odd máxima publicável */
  maxOdd: 8.00,
} as const;

// ── Tabela de correlação entre pares de legs ───────────────────────────────
//
// Valor 0 = independentes (produto direto).
// Valor 1 = correlação total (P(A∩B) = min(P(A), P(B))).
// A probabilidade conjunta ajustada é calculada por interpolação linear:
//   P_adj = (1 - ρ) * P(A)*P(B) + ρ * min(P(A), P(B))
//
// Pares não listados → ρ = 0 (independência).

type LegPair = readonly [LegId, LegId];

const CORRELATION_TABLE: Array<{ pair: LegPair; rho: number; comment: string }> =
  [
    // Fortemente correlacionados (positivo)
    { pair: ["HOME_WIN", "OVER_2_5"],             rho: 0.25, comment: "Favorito a vencer tende a ter jogo mais aberto" },
    { pair: ["HOME_WIN", "OVER_1_5"],             rho: 0.30, comment: "Casa vencendo quase sempre marca pelo menos 1" },
    { pair: ["HOME_WIN", "FIRST_GOAL_HOME"],      rho: 0.55, comment: "Quem abre o placar tem vantagem grande" },
    { pair: ["HOME_WIN", "HT_HOME_WIN"],          rho: 0.55, comment: "Vitória HT implica vantagem forte para FT" },
    { pair: ["HOME_WIN", "HOME_HANDICAP_MINUS_1"],rho: 0.60, comment: "Handicap −1 requer vitória por 2+" },
    { pair: ["HOME_WIN", "HT_FT_HOME_HOME"],      rho: 0.70, comment: "HH é subconjunto de HOME_WIN" },
    { pair: ["HOME_WIN", "HOME_OVER_1_5_GOALS"], rho: 0.45, comment: "Casa vence → provavelmente marcou 2+" },
    { pair: ["BTTS_YES", "OVER_2_5"],             rho: 0.55, comment: "Ambas marcam implica ≥2 gols, forte sinal para over" },
    { pair: ["BTTS_YES", "OVER_1_5"],             rho: 0.45, comment: "Ambas marcam → ≥2 gols mínimo" },
    { pair: ["BTTS_YES", "OVER_3_5"],             rho: 0.30, comment: "Ambas marcam + over 3.5 — correlação moderada" },
    { pair: ["BTTS_YES", "HT_OVER_0_5"],          rho: 0.35, comment: "Ambas marcam tende a ter gol no 1T" },
    { pair: ["OVER_2_5", "OVER_1_5"],             rho: 0.75, comment: "Over 2.5 é subconjunto de over 1.5" },
    { pair: ["OVER_3_5", "OVER_2_5"],             rho: 0.75, comment: "Over 3.5 é subconjunto de over 2.5" },
    { pair: ["BTTS_NO", "UNDER_2_5"],             rho: 0.50, comment: "Sem ambas marcam ↔ tende a ser jogo fechado" },
    { pair: ["BTTS_NO", "HOME_WIN"],              rho: 0.20, comment: "Favorito dominante às vezes não sofre gol" },
    { pair: ["HT_DRAW", "HT_FT_DRAW_HOME"],       rho: 0.70, comment: "HT_FT_DRAW_HOME implica HT_DRAW" },
    { pair: ["HT_DRAW", "HOME_WIN"],              rho: 0.15, comment: "Empate no HT não impede vitória no FT" },
    { pair: ["HT_DRAW", "SECOND_HALF_MORE_GOALS"],rho: 0.30, comment: "Jogo equilibrado no HT → decisão no 2T" },
    { pair: ["CORNERS_OVER_8_5", "CORNERS_OVER_9_5"], rho: 0.75, comment: "Subconjunto" },
    { pair: ["CORNERS_OVER_9_5", "CORNERS_OVER_10_5"],rho: 0.70, comment: "Subconjunto" },
    { pair: ["CORNERS_OVER_10_5","CORNERS_OVER_11_5"],rho: 0.65, comment: "Subconjunto" },
    { pair: ["CORNERS_OVER_9_5", "OVER_2_5"],     rho: 0.15, comment: "Jogos abertos tendem a ter mais cantos" },
    { pair: ["CORNERS_OVER_9_5", "BTTS_YES"],     rho: 0.15, comment: "Jogos abertos tendem a ter mais cantos" },
    // Correlação negativa (tratar como independência — ρ=0 já captura isso; deixar explícito)
    { pair: ["BTTS_YES", "BTTS_NO"],              rho: 0.00, comment: "Opostos — nunca devem estar no mesmo combo" },
    { pair: ["HOME_WIN", "AWAY_WIN"],             rho: 0.00, comment: "Opostos — nunca devem estar no mesmo combo" },
  ];

/** Devolve o ρ de correlação para um par de legs (ordem não importa). */
function getCorrelation(a: LegId, b: LegId): number {
  for (const entry of CORRELATION_TABLE) {
    const [x, y] = entry.pair;
    if ((x === a && y === b) || (x === b && y === a)) return entry.rho;
  }
  return 0; // independentes por padrão
}

// ── Utilitários de probabilidade ──────────────────────────────────────────

/**
 * Remove a margem da odd individual via par (odd over + odd under do mesmo mercado).
 * A probabilidade "justa" é: p_fair = (1/odd) / ((1/odd_a) + (1/odd_b))
 *
 * Se o par não estiver disponível, usa a odd bruta: p ≈ 1/odd.
 */
export function oddToProbFair(odd: number, pairedOdd?: number): number {
  if (!pairedOdd || pairedOdd <= 1.01) {
    // Sem par: estimativa com desconto de margem de ~6%
    return Math.min(0.97, Math.max(0.02, 1 / odd));
  }
  const invA = 1 / Math.max(1.01, odd);
  const invB = 1 / Math.max(1.01, pairedOdd);
  const overround = invA + invB;
  return Math.min(0.97, Math.max(0.02, invA / overround));
}

/**
 * Combina N probabilidades com ajuste de correlação por pares.
 * Método: para cada par de legs, ajusta a probabilidade do produto pela ρ.
 * Para N > 2, aplica correção pairwise iterativamente (heurística documentada).
 */
export function combineProbs(probs: Array<{ legId: LegId; prob: number }>): number {
  if (probs.length === 0) return 0;
  if (probs.length === 1) return probs[0]!.prob;

  // Começa com produto independente
  let joint = probs.reduce((acc, p) => acc * p.prob, 1);

  // Aplica ajuste pairwise: para cada par (i, j), mistura o produto com min(p_i, p_j)
  // O peso da correção é ρ_ij normalizado pelo número de pares para evitar overcorrection.
  const n = probs.length;
  const numPairs = (n * (n - 1)) / 2;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pi = probs[i]!.prob;
      const pj = probs[j]!.prob;
      const rho = getCorrelation(probs[i]!.legId, probs[j]!.legId);
      if (rho <= 0) continue;

      // Corrigir o joint: substituir p_i * p_j pelo valor ajustado
      const independentPij = pi * pj;
      const adjustedPij = (1 - rho) * independentPij + rho * Math.min(pi, pj);
      // Escalar o joint: joint_new = joint * (adjustedPij / independentPij)
      if (independentPij > 1e-9) {
        const correction = adjustedPij / independentPij;
        // Normalizar pelo número de pares para suavizar sobre-correção
        joint *= Math.pow(correction, 1 / Math.max(1, numPairs));
      }
    }
  }

  return Math.min(0.97, Math.max(0.001, joint));
}

/**
 * Aplica margem da casa sobre a probabilidade conjunta e converte em odd.
 *   odd_final = 1 / (p_joint * (1 + margin))
 * Isso reflete o overround do mercado composto.
 */
export function applyMarginAndConvert(
  jointProb: number,
  margin = PRICING_CONFIG.houseMargin,
): number {
  const raw = 1 / (jointProb * (1 + margin));
  return Math.round(raw * 100) / 100;
}

/**
 * Verifica se a odd final está dentro da faixa publicável.
 */
export function isPublishable(odd: number): boolean {
  return odd >= PRICING_CONFIG.minOdd && odd <= PRICING_CONFIG.maxOdd;
}
