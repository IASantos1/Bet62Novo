import { Router, type IRouter, type Request, type Response } from "express";
import { exchangeAuthorizationCode } from "../services/revolut/client.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// OAuth redirect URI registered in Revolut Business → Settings → APIs → API
// Business. This is a one-time setup route, not part of the regular payout
// flow: after the business owner clicks "Enable access" and authorizes in
// Revolut's own login/2FA, Revolut redirects the browser here with a
// short-lived (~2 min) `code`, which is exchanged for the first
// access_token/refresh_token. The refresh_token is shown once in the
// response for the admin to copy into REVOLUT_REFRESH_TOKEN — there is no
// secrets store in this app to persist it into automatically, same as
// every other provider credential here (STRIPE_SECRET_KEY, BIGBANG_API_KEY,
// etc. are all set as deploy-platform env vars, not stored in the DB).
router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  const oauthError = typeof req.query["error"] === "string" ? req.query["error"] : "";

  if (oauthError) {
    res.status(400).send(`<pre>Revolut devolveu um erro de autorização: ${escapeHtml(oauthError)}</pre>`);
    return;
  }
  if (!code) {
    res.status(400).send("<pre>Falta o parâmetro \"code\" na query string.</pre>");
    return;
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    logger.warn(
      { refreshTokenSuffix: tokens.refreshToken.slice(-6) },
      "Revolut OAuth: novo refresh_token obtido via /api/revolut/callback — configure REVOLUT_REFRESH_TOKEN e reinicie o serviço",
    );
    res.send(`<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><title>Revolut — autorização concluída</title></head>
<body style="font-family: monospace; white-space: pre-wrap; padding: 24px; max-width: 720px; margin: 0 auto;">
<h2>Revolut — autorização concluída</h2>
<p><strong>Copie o refresh_token abaixo agora — esta página não o volta a mostrar:</strong></p>
<pre style="background:#111;color:#0f0;padding:16px;border-radius:8px;overflow-wrap:anywhere;">${escapeHtml(tokens.refreshToken)}</pre>
<p>Próximos passos:</p>
<ol>
<li>Configure a variável de ambiente <code>REVOLUT_REFRESH_TOKEN</code> no Railway com este valor.</li>
<li>Reinicie o serviço api-server para que o pagamento automático de levantamentos fique ativo.</li>
<li>Pode fechar esta aba — o access_token gerado nesta troca é temporário e não precisa de ser guardado.</li>
</ol>
</body>
</html>`);
  } catch (err) {
    logger.error({ err }, "Revolut OAuth code exchange failed");
    res.status(502).send("<pre>Falha ao trocar o código pelos tokens. Verifique os logs do servidor.</pre>");
  }
});

export default router;
