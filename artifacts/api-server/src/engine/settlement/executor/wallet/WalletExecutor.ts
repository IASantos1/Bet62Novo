import { SettlementResult } from "../../results/SettlementResult.js";

export class WalletExecutor {

    async execute(result: SettlementResult): Promise<void> {

        if (result.status !== "won")
            return;

        // próxima etapa:
        // creditar saldo
        // atualizar balances
        // registrar transaction

    }

}
