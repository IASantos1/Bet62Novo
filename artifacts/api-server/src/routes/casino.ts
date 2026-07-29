import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// SilentAPI needs an alphanumeric player id it can hand back to us on every
// wallet callback. Our own numeric user id already satisfies their
// alphanumeric + length constraints once prefixed with a letter (a bare
// numeric string risks being misread/truncated by some providers), and the
// prefix makes it trivially reversible — no separate mapping table needed.
export function memberAccountForUser(userId: number): string {
  return `u${userId}`;
}

export function userIdFromMemberAccount(memberAccount: string): number | null {
  const m = /^u(\d+)$/.exec(memberAccount);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post(
  "/launch",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    if (!CONFIG.SILENTAPI_AUTH_TOKEN) {
      res.status(503).json({ error: "Cassino indisponível no momento." });
      return;
    }
    const userId = req.user!.id;
    const gameUid = String((req.body as { gameUid?: unknown })?.gameUid ?? "").trim();
    if (!gameUid) {
      res.status(400).json({ error: "Jogo inválido." });
      return;
    }

    try {
      const [user] = await db
        .select({ balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "Utilizador não encontrado." });
        return;
      }

      const homeUrl =
        process.env["PUBLIC_SITE_URL"]?.trim() ||
        `${req.protocol}://${req.get("host")}`;

      const resp = await fetch(`${CONFIG.SILENTAPI_BASE_URL}/GetGameUrl.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.SILENTAPI_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          member_account: memberAccountForUser(userId),
          game_uid: gameUid,
          balance: Number(user.balance),
          home_url: homeUrl,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = (await resp.json().catch(() => null)) as {
        code?: number;
        msg?: string;
        payload?: { game_launch_url?: string };
      } | null;

      if (!resp.ok || !data || data.code !== 0 || !data.payload?.game_launch_url) {
        logger.warn(
          { status: resp.status, data, userId, gameUid },
          "[casino] GetGameUrl failed",
        );
        res.status(502).json({ error: "Não foi possível iniciar o jogo." });
        return;
      }

      res.json({ url: data.payload.game_launch_url });
    } catch (err) {
      logger.error({ err, userId, gameUid }, "[casino] launch error");
      res.status(502).json({ error: "Não foi possível iniciar o jogo." });
    }
  },
);

export default router;
