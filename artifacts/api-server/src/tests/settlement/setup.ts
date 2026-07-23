import { after } from "node:test";

declare global {
  var __bet62SettlementTestCleanupRegistered: boolean | undefined;
}

if (!globalThis.__bet62SettlementTestCleanupRegistered) {
  globalThis.__bet62SettlementTestCleanupRegistered = true;

  after(() => {
    // Importing the settlement module initializes background timers in this repo.
    // Defer the forced exit so the test runner finishes tallying results (and
    // setting process.exitCode) before we kill the process, otherwise failing
    // assertions get silently reported as a pass.
    setImmediate(() => process.exit(process.exitCode ?? 0));
  });
}

export {};
