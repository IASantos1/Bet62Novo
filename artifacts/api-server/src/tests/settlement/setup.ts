import { after } from "node:test";

declare global {
  var __bet62SettlementTestCleanupRegistered: boolean | undefined;
}

if (!globalThis.__bet62SettlementTestCleanupRegistered) {
  globalThis.__bet62SettlementTestCleanupRegistered = true;

  after(() => {
    // Importing the settlement module initializes background timers in this repo.
    process.exit(0);
  });
}

export {};
