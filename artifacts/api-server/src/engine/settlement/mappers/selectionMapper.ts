import { PendingSelection } from "../repository/selectionRepository.js";
import { Selection } from "../types/settlement.types.js";

export function mapSelection(
    pending: PendingSelection,
): Selection {

    return {

        market: pending.marketId ?? "",

        selection: pending.selectionId ?? "",

        odds: pending.odds ?? 1,

    };

}
