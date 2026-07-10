import { acquireBetSettlementLock } from "./dist/settlement.js";

async function runTest() {
  const betId = 12345;
  const ownerA = "worker-A";
  const ownerB = "worker-B";

  console.log("Teste 1: worker A tentando lock...");
  const a = await acquireBetSettlementLock(betId, ownerA);
  console.log("Worker A result:", a);

  console.log("Teste 2: worker B tentando lock no mesmo bet...");
  const b = await acquireBetSettlementLock(betId, ownerB);
  console.log("Worker B result:", b);

  console.log("Resultado esperado:");
  console.log("- A = true");
  console.log("- B = false (bloqueado)");
}

runTest().catch(console.error);
