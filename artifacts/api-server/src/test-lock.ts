import { acquireBetSettlementLock } from "./settlement.js";

async function runTest() {
  const betId = 9999;

  console.log("Worker A...");
  const a = await acquireBetSettlementLock(betId, "A");
  console.log("A:", a);

  console.log("Worker B...");
  const b = await acquireBetSettlementLock(betId, "B");
  console.log("B:", b);
}

runTest().catch(console.error);
