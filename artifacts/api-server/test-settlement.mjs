import { autoSettlePendingBets } from "./dist/settlement.js";

await autoSettlePendingBets({ matchIds: ["fb-v1-xxxx"] });

console.log("done");
