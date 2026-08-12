// Cross-platform dev entrypoint for @workspace/api-server.
// Replaces the original Bash-only:
//   `export NODE_ENV=development && pnpm run build && pnpm run start`
//
// Why this wrapper exists:
//   - `export VAR=val &&` is POSIX shell syntax and fails on Windows
//     PowerShell / CMD (which the user runs locally).
//   - Railway / Replit deployments use Linux and ignore this file — they
//     invoke `pnpm run start` directly with NODE_ENV=production, so setting
//     NODE_ENV here only affects local development (correct behavior).
//   - The build (`node ./build.mjs`) and the start command
//     (`node --enable-source-maps ./dist/index.mjs`) are intentionally
//     replicated as programmatic calls instead of shelling out to
//     `pnpm run build && pnpm run start`: it avoids shell differences
//     between platforms and shaves off the pnpm CLI process-spawn cost.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

// ── 1. Force development environment for local runs ────────────────────────
// Railway/Replit never call this script; they call `pnpm run start` directly
// with NODE_ENV=production (see railway.json / .replit workflows).
process.env.NODE_ENV = "development";

const artifactDir = __dirname;
const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pnpmOpts = {
  cwd: artifactDir,
  stdio: "inherit",
  shell: false,
  env: process.env,
};

// ── 2. Build the API server bundle (esbuild via build.mjs) ─────────────────
// Equivalent to `pnpm run build` but respects the user's shell.
const buildProc = spawnSync(pnpmCmd, ["run", "build"], pnpmOpts);
if (buildProc.status !== 0) {
  const code = buildProc.status ?? 1;
  console.error(`[api-server dev] build failed with exit code ${code}`);
  process.exit(code);
}

// ── 3. Run the built bundle with source maps enabled ───────────────────────
// Equivalent to `pnpm run start` (node --enable-source-maps ./dist/index.mjs).
const startProc = spawnSync(
  "node",
  ["--enable-source-maps", path.join(artifactDir, "dist", "index.mjs")],
  pnpmOpts,
);
const code = startProc.status ?? 0;
process.exit(code);
