import { routeMarket } from "../utils/marketRouter";
import { SettlementInput, Outcome } from "../types/settlement.types";

export function settleSelection(input: SettlementInput): Outcome {
  return routeMarket(input);
}
