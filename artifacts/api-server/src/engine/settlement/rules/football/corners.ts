import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

export function settleCorners(input: {
  match: MatchResult & { extras?: { cornersTotal?: number; homeCorners?: number; awayCorners?: number } };
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.status !== "finished") {
    return "pending";
  }

  const extras = (match as any).extras;
  const raw = selection.selection.toLowerCase().trim();

  // Handicap format: "home_handicap_-1.5" or "away_handicap_+1.5"
  const handicapMatch = raw.match(/^(home|away)_handicap_([+-]?\d+(?:\.\d+)?)$/);
  if (handicapMatch) {
    const homeCorners: number | undefined = extras?.homeCorners;
    const awayCorners: number | undefined = extras?.awayCorners;

    if (homeCorners == null || awayCorners == null) {
      return "void";
    }

    const side = handicapMatch[1] as "home" | "away";
    const line = parseFloat(handicapMatch[2]);

    const adjustedHome = homeCorners + line;

    if (side === "home") {
      if (adjustedHome > awayCorners) return "won";
      if (adjustedHome === awayCorners) return "void";
      return "lost";
    } else {
      if (awayCorners > adjustedHome) return "won";
      if (awayCorners === adjustedHome) return "void";
      return "lost";
    }
  }

  // Over/under format: "over_9.5", "under_9.5"
  const ouMatch = raw.match(/^(over|under)[_\s](\d+(?:\.\d+)?)$/);
  if (ouMatch) {
    const cornersTotal: number | undefined = extras?.cornersTotal;
    if (cornersTotal == null) {
      return "void";
    }

    const side = ouMatch[1] as "over" | "under";
    const line = parseFloat(ouMatch[2]);

    if (side === "over") {
      return cornersTotal > line ? "won" : "lost";
    } else {
      return cornersTotal < line ? "won" : "lost";
    }
  }

  return "void";
}
