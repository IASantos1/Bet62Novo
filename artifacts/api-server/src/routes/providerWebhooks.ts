import { Router, type Request, type Response } from "express";
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { GoalApiWebhookPayload } from "../providers/goalApi/schema.js";
import { SPORT_PROVIDER_MATRIX } from "../sportsbook/config/providerMatrix.js";
import { getGoalApiLiveSyncStatus } from "../services/goalApi/liveSync.js";
import {
  getRecentGoalApiWebhooks,
  listGoalApiFootballStates,
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

router.get("/provider-webhooks/goal/status", (_req: Request, res: Response) => {
  const states = listGoalApiFootballStates().sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  res.json({
    websocket: getGoalApiLiveSyncStatus(),
    store: {
      total: states.length,
      freshestUpdatedAt:
        states.length > 0 ? new Date(states[0]!.updatedAt).toISOString() : null,
      sources: states.reduce<Record<string, number>>((acc, state) => {
        acc[state.source] = (acc[state.source] ?? 0) + 1;
        return acc;
      }, {}),
      sample: states.slice(0, 20).map((state) => ({
        fixtureId: state.fixtureId,
        source: state.source,
        updatedAt: new Date(state.updatedAt).toISOString(),
        hasScore:
          !!state.payload &&
          typeof state.payload === "object" &&
          !!(state.payload as Record<string, unknown>)["score"],
      })),
    },
    webhooks: getRecentGoalApiWebhooks(),
  });
});

router.get("/provider-matrix/status", (_req: Request, res: Response) => {
  const sports = Object.values(SPORT_PROVIDER_MATRIX).map((config) => {
    const pulsescoreEnabled = CONFIG.USE_PULSESCORE;
    const goalApiEnabled = CONFIG.USE_GOAL_API;
    const matchStateReady =
      config.matchStateProvider === "goal-api"
        ? goalApiEnabled
        : config.matchStateProvider === "pulsescore"
          ? pulsescoreEnabled
          : !!CONFIG.MRDOGE_API_KEY;
    const oddsReady =
      config.oddsProvider === "pulsescore"
        ? pulsescoreEnabled
        : !!CONFIG.MRDOGE_API_KEY;
    return {
      sport: config.sport,
      bookmaker: config.bookmaker,
      transport: config.transport,
      pulseScoreSport: config.pulseScoreSport,
      matchStateProvider: config.matchStateProvider,
      oddsProvider: config.oddsProvider,
      enabled: matchStateReady && oddsReady,
      readiness: {
        pulsescore: pulsescoreEnabled,
        goalApi: goalApiEnabled,
        mrdoge: !!CONFIG.MRDOGE_API_KEY,
      },
    };
  });
  res.json({
    sports,
    env: {
      USE_PULSESCORE: CONFIG.USE_PULSESCORE,
      USE_GOAL_API: CONFIG.USE_GOAL_API,
      FOOTBALL_MATCH_STATE_PROVIDER: CONFIG.FOOTBALL_MATCH_STATE_PROVIDER,
      FOOTBALL_ODDS_PROVIDER: CONFIG.FOOTBALL_ODDS_PROVIDER,
      hasMrDogeKey: !!CONFIG.MRDOGE_API_KEY,
    },
  });
});

export default router;
