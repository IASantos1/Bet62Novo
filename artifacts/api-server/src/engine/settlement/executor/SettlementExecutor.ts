import { SettlementResult } from "../results/SettlementResult.js";

export class SettlementExecutor {

  async execute(result: SettlementResult): Promise<void> {

    switch (result.status) {

      case "won":
        await this.onWon(result);
        break;

      case "lost":
        await this.onLost(result);
        break;

      case "void":
        await this.onVoid(result);
        break;

      case "halfwon":
        await this.onHalfWon(result);
        break;

      case "halflost":
        await this.onHalfLost(result);
        break;

      case "pending":
        break;

    }

  }

  private async onWon(result: SettlementResult) {
    console.log("WIN", result.betId);
  }

  private async onLost(result: SettlementResult) {
    console.log("LOST", result.betId);
  }

  private async onVoid(result: SettlementResult) {
    console.log("VOID", result.betId);
  }

  private async onHalfWon(result: SettlementResult) {
    console.log("HALF WON", result.betId);
  }

  private async onHalfLost(result: SettlementResult) {
    console.log("HALF LOST", result.betId);
  }

}
