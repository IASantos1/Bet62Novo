import { SettlementContext } from "../context/settlementContext.js";
import { settleSelection } from "./settleSelection.js";

export class SettlementEngine {
  execute(context: SettlementContext) {
    return settleSelection({
      match: context.match,
      selection: context.selection,
    });
  }
}

export const settlementEngine = new SettlementEngine();
