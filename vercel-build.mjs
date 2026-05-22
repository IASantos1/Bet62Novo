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
execSync("pnpm --filter @workspace/bet62 build", { stdio: "inherit", cwd: root });

const src = path.join(root, "artifacts", "bet62", "dist");
const dst = path.join(root, "dist");

if (!fs.existsSync(src)) {
  throw new Error(`Expected build output not found at: ${src}`);
}

fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
