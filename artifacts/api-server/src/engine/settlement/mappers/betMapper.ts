import { PendingSelection } from "../repository/selectionRepository.js";

export function mapBet(
    pending: PendingSelection,
) {

    return {

        id: pending.betId,

        userId: pending.userId,

        stake: pending.stake,

        potentialWin: pending.potentialWin,

        version: pending.version,

    };

}
