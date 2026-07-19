import type { MatchResult, Selection, Outcome } from "../../types/settlement.types.js";

interface GoalEvent {
  player: string;
  minute?: number;
  team?: string;
}

export function settlePlayerProps(input: {
  match: MatchResult & { extras?: { football?: { goals?: GoalEvent[] } } };
  selection: Selection;
}): Outcome {
  const { match, selection } = input;

  if (match.status !== "finished") {
    return "pending";
  }

  const extras = (match as any).extras;
  const goals: GoalEvent[] | undefined = extras?.football?.goals;

  if (!goals) {
    return "void";
  }

  const raw = selection.selection.trim();
  // Expected format: "player_name:yes", "player_name:no", "player_name:first"
  const colonIdx = raw.lastIndexOf(":");
  if (colonIdx === -1) {
    return "void";
  }

  const playerName = raw.slice(0, colonIdx).toLowerCase().trim();
  const qualifier = raw.slice(colonIdx + 1).toLowerCase().trim();

  if (!playerName || !qualifier) {
    return "void";
  }

  const market = selection.market.toLowerCase();

  if (market === "anytime_scorer" || (market === "player_goals" && qualifier !== "first")) {
    // Did this player score at any point?
    const scored = goals.some((g) => g.player.toLowerCase() === playerName);

    if (qualifier === "yes") {
      return scored ? "won" : "lost";
    } else if (qualifier === "no") {
      return scored ? "lost" : "won";
    }

    return "void";
  }

  if (market === "first_scorer" || qualifier === "first") {
    if (goals.length === 0) {
      // No goals scored — first scorer bet is lost (no scorer at all)
      return qualifier === "first" ? "lost" : "void";
    }

    const firstGoal = goals[0];
    const isFirst = firstGoal.player.toLowerCase() === playerName;

    return isFirst ? "won" : "lost";
  }

  return "void";
}
