import { runSettlementWorker } from "./settlementWorker";

const INTERVAL = 5000; // 5s

export function startSettlementWorkerLoop() {
  setInterval(async () => {
    await runSettlementWorker();
  }, INTERVAL);
}
