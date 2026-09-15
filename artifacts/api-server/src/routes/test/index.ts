import { Router, type Request, type Response } from "express";
import type { IRouter } from "express";
import { CONFIG } from "../../lib/config.js";
import { liveMatchState, buildUpcomingMatches } from "../matches.js";
import { adminMiddleware } from "../../middlewares/adminAuth.js";

const router: IRouter = Router();

// These are debug/diagnostic routes only — several of them (notably
// /run-prematch-sync-now and /match-fuzzy-by-name) trigger real, rate-limited
// upstream calls to GOAL API/PulseScore on demand. Left unauthenticated,
// anyone on the internet could hammer this to exhaust the shared PulseScore
// 1-req/sec quota that the real live/prematch sync pipelines depend on —
// gate the whole router behind the same admin auth every other diagnostic
// endpoint in this codebase uses.
router.use(adminMiddleware);

function ok(data: unknown): { ok: true; generatedAt: string; data: unknown } {
  return { ok: true, generatedAt: new Date().toISOString(), data };
}
function fail(status: number, reason: string, detail?: unknown) {
  return { ok: false, status, reason, detail, generatedAt: new Date().toISOString() };
}

router.get("/providers-health", async (_req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

router.get("/live-match-state-stats", (_req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

router.get("/run-prematch-sync-now", async (_req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  const m = aa.length;
  const n = bb.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

router.get("/match-fuzzy-by-name", async (req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

router.get("/fixture-odds-compare", async (req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

router.get("/shadow-status-snapshot", (_req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

router.get("/goalapi-country-coverage", async (req: Request, res: Response) => {
  res.status(410).json({code:410, msg:"DESCONTINUADO: provedor removido; BZZOIRO é a fonte única agora"});
});

export default router;
