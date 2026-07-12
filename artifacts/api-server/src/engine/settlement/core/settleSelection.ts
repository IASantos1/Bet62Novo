import { routeMarket } from "../utils/marketRouter.js";
import type { SettlementInput, Outcome } from "../types/settlement.types.js";
import { resolveSelectionOutcome } from "../../../lib/settlementHelpers.js";
import type { SelectionRecord } from "../../../settlement.js";

export function settleSelection(input: SettlementInput): Outcome {
  const providerSport = input.match?.sport;
  const betMatchId = input.betMatchId ?? input.match?.matchId ?? "";
  const helperSelection: SelectionRecord = {
    matchId: betMatchId || undefined,
    sport: providerSport,
    providerSport,
    market: input.selection.market,
    selection: input.selection.selection,
    odd: input.selection.odds,
    label: input.selection.meta?.label,
    marketLine:
      typeof input.selection.meta?.marketLine === "number"
        ? input.selection.meta.marketLine
        : undefined,
  };

  const helperOutcome = resolveSelectionOutcome(
    helperSelection,
    betMatchId,
    input.match?.status === "live",
  ).outcome;

  if (helperOutcome !== null) {
    return helperOutcome;
  }

  return routeMarket(input);
}
