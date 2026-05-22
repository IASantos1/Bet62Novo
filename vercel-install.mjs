import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function findWorkspaceRoot(startDir) {
  let dir = startDir;
  for (;;) {
    const marker = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(marker)) return dir;
    const next = path.dirname(dir);
    if (next === dir) throw new Error("pnpm-workspace.yaml not found");
    dir = next;
  }
}

const root = findWorkspaceRoot(process.cwd());
execSync("npx -y pnpm@10.28.1 install --no-frozen-lockfile", {
  stdio: "inherit",
  cwd: root,
});
