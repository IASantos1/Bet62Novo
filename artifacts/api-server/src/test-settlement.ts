import "dotenv/config";
import { autoSettlePendingBets } from "./settlement.js";

async function run() {
  console.log("Starting settlement test...");

  const result = await autoSettlePendingBets({
    matchIds: ["fb-v1-4727705"],
  });

  console.log("Settlement result:", result);
}

run().catch(console.error);
