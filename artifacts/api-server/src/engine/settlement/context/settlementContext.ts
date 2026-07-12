import {
  MatchResult,
  Selection,
} from "../types/settlement.types.js";

export interface SettlementContext {
  cycleId: string;
  trigger: string;

  bet: any;
  selection: Selection;
  match: MatchResult;

  sport: string;
  market: string;

  replay: boolean;

  createdAt: Date;

  metadata?: Record<string, unknown>;
}

export function createSettlementContext(args: {
  bet: any;
  selection: Selection;
  match: MatchResult;
  trigger: string;
  cycleId: string;
}): SettlementContext {
  return {
    cycleId: args.cycleId,
    trigger: args.trigger,

    bet: args.bet,
    selection: args.selection,
    match: args.match,

    sport: args.match.sport,
    market: args.selection.market,

    replay: false,

    createdAt: new Date(),

    metadata: {},
  };
}
