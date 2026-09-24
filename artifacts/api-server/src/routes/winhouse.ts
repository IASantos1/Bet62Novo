import { Router, type IRouter, type Response } from "express";
import { createHash, createHmac } from "node:crypto";
import { CONFIG } from "../lib/config.js";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

function buildWinHouseLaunchToken(params: {
  playerId: string;
  session: string;
  walletApiKey: string;
}): string {
  const expiry = Date.now() + 5 * 60_000;
  const payload = `${params.playerId}|${expiry}|${params.session}`;
  const signature = createHmac("sha256", params.walletApiKey)
    .update(payload)
    .digest("hex");
  return `${params.playerId}.${expiry}.${params.session}.${signature}`;
}

router.get(
  "/launch",
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!CONFIG.WINHOUSE_WALLET_API_KEY) {
      res.status(503).json({ error: "WinHouse SSO não configurado" });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Utilizador não autenticado" });
      return;
    }

    const authHeader = req.headers.authorization ?? "";
    const rawToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    const sessionSeed = rawToken || `${user.id}:${user.email}`;
    const session = createHash("sha256")
      .update(sessionSeed)
      .digest("hex")
      .slice(0, 32);

    const launch = buildWinHouseLaunchToken({
      playerId: String(user.id),
      session,
      walletApiKey: CONFIG.WINHOUSE_WALLET_API_KEY,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({ launch });
  },
);

export default router;
