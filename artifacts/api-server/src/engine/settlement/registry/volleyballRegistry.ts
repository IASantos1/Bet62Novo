import { MarketRegistry } from "./marketRegistry.js";
import {
  settleVolleyballMatchWinner,
  settleVolleyballTotalSets,
  settleVolleyballSetWinner,
  settleVolleyballSetHandicap,
  settleVolleyballSetPoints,
  settleVolleyballTotalPoints,
} from "../rules/volleyball/index.js";

export const volleyballRegistry = new MarketRegistry();

const markets: { codes: string[]; handler: (input: any) => any }[] = [
  // ── Match Winner ──────────────────────────────────────────────────────────
  {
    codes: ["match_winner", "winner", "moneyline", "vencedor"],
    handler: settleVolleyballMatchWinner,
  },
  // ── Total Sets ────────────────────────────────────────────────────────────
  {
    codes: ["total_sets", "over_under_sets", "total_de_sets"],
    handler: settleVolleyballTotalSets,
  },
  // ── Set Winner ────────────────────────────────────────────────────────────
  {
    codes: ["set_winner", "set_result", "vencedor_set"],
    handler: settleVolleyballSetWinner,
  },
  // ── Set Handicap ──────────────────────────────────────────────────────────
  {
    codes: ["set_handicap", "handicap_sets", "handicap"],
    handler: settleVolleyballSetHandicap,
  },
  // ── Points in a Single Set ────────────────────────────────────────────────
  {
    codes: ["set_points", "over_under_set_points", "pontos_set"],
    handler: settleVolleyballSetPoints,
  },
  // ── Total Points (all sets combined) ─────────────────────────────────────
  {
    codes: ["total_points", "over_under_points", "pontos_totais"],
    handler: settleVolleyballTotalPoints,
  },
];

for (const market of markets) {
  for (const code of market.codes) {
    volleyballRegistry.register(code, market.handler);
  }
}
