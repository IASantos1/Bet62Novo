import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

export function settleCards(input: {
  match: MatchResult & { extras?: { cardsTotal?: number } };
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.status !== "finished") {
    return "pending";
  }

  const extras = (match as any).extras;
  const cardsTotal: number | undefined = extras?.cardsTotal;

  if (cardsTotal == null) {
    return "void";
  }

  const raw = selection.selection.toLowerCase().trim();
  // Expected format: "over_3.5", "under_3.5"
  const m = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (!m) {
    return "void";
  }

  const side = m[1] as "over" | "under";
  const line = parseFloat(m[2]);

  if (side === "over") {
    return cardsTotal > line ? "won" : "lost";
  } else {
    return cardsTotal < line ? "won" : "lost";
  }
}
