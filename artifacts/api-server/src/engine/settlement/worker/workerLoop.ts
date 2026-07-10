import { runSettlementWorker } from "./settlementWorker";

const INTERVAL = 5000; // 5s

export function startSettlementWorkerLoop() {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runSettlementWorker();
    } finally {
      running = false;
    }
  }, INTERVAL);
}
