import { Router, type Request, type Response } from "express";
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { GoalApiWebhookPayload } from "../providers/goalApi/schema.js";
import {
  getRecentGoalApiWebhooks,
  recordGoalApiWebhook,
} from "../sportsbook/live/liveStateStore.js";

const router = Router();

function goalApiWebhookAuthorized(req: Request): boolean {
  const expectedSecret = CONFIG.GOAL_API_WEBHOOK_SECRET.trim();
  if (!expectedSecret) return true;
  const providedSecret = String(req.headers["x-goal-api-secret"] ?? "").trim();
  return providedSecret.length > 0 && providedSecret === expectedSecret;
}

router.post("/provider-webhooks/goal", (req: Request, res: Response) => {
  if (!goalApiWebhookAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized Goal API webhook" });
    return;
  }
  const payload =
    req.body && typeof req.body === "object"
      ? (req.body as GoalApiWebhookPayload)
      : null;
  if (!payload) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }
  recordGoalApiWebhook(payload);
  logger.info(
    {
      type: payload.type ?? payload.event ?? "unknown",
      fixtureId: payload.fixtureId ?? payload.fixture?.id ?? null,
    },
    "[goal-api] webhook ingested",
  );
  res.json({ ok: true });
});

router.get("/provider-webhooks/goal/recent", (_req: Request, res: Response) => {
  res.json({ items: getRecentGoalApiWebhooks() });
});

export default router;
