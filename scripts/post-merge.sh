#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Schema changes are applied by initDb() (lib/db/src/init.ts) at API server
# boot — idempotent, IF-NOT-EXISTS SQL that is the single source of truth
# for the live schema. Do NOT call `drizzle-kit push` here: it applies
# schema changes independently and can prompt interactively for ambiguous
# changes (rename vs drop+create); without a TTY that hangs until this
# hook's timeout kills it, potentially leaving the dev database mid-change.
# If you need to inspect what Drizzle's schema definitions would generate,
# run `pnpm --filter db push` manually and review its plan before confirming.
