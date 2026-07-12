import { SettlementContext } from "../context/settlementContext.js";
import { settleSelection } from "./settleSelection.js";

export class SettlementEngine {
  execute(context: SettlementContext) {
    return settleSelection({
      betId: Number(context.bet?.id ?? 0),
      betMatchId: context.bet?.matchId,
      match: context.match ?? null,
      selection: context.selection,
      ruleVersion: "2025.06-v4",
    });
  }
}

export const settlementEngine = new SettlementEngine();
