import { Router, type IRouter } from "express";
import { z } from "zod";
import { CONFIG } from "../lib/config.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const HealthCheckSchema = z.object({ status: z.string() });
  const data = HealthCheckSchema.parse({ status: "ok" });
  res.json(data);
});

// Plain, unvalidated debug route (not part of the generated api-zod
// contract) — lets a deploy be verified by visiting this URL directly,
// instead of relying on Railway's UI, which was the ambiguous step behind
// several rounds of "is the fix even deployed?" debugging (2026-08-29).
// RAILWAY_GIT_COMMIT_SHA is auto-injected by Railway on every deploy.
router.get("/version", (_req, res) => {
  res.json({ commit: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? null });
});

// Unvalidated operational route: reports the provider setup currently wired
// into the Goal API + PropLine migration without forcing callers to know the
// internal config module shape.
router.get("/health-data-providers", (_req, res) => {
  const g = globalThis as any;
  res.json({
    flags: {
      goalApiEnabled: Boolean(CONFIG.GOAL_API_KEY),
      propLineEnabled: Boolean(CONFIG.PROPLINE_API_KEY),
      mrDogeLegacyEnabled: Boolean(CONFIG.MRDOGE_API_KEY),
    },
    keys: {
      goalApi: Boolean(CONFIG.GOAL_API_KEY),
      propLine: Boolean(CONFIG.PROPLINE_API_KEY),
      mrDoge: Boolean(CONFIG.MRDOGE_API_KEY),
    },
    urls: {
      goalApiBaseUrl: CONFIG.GOAL_API_BASE_URL,
      goalApiWsUrl: CONFIG.GOAL_API_WS_URL,
      propLineBaseUrl: CONFIG.PROPLINE_BASE_URL,
      propLineWsUrl: CONFIG.PROPLINE_WS_URL || null,
    },
    lastSuccessfulFetch: {},
    providerQualityDebug: g.__providerQualityDebug ?? null,
    livePayloadDebug: g.__livePayloadDebug ?? null,
  });
});

router.get("/debug-provider-quality", (_req, res) => {
  const g = globalThis as any;
  res.json({
    updatedAt: g.__providerQualityDebug?.updatedAt ?? null,
    upcoming: g.__providerQualityDebug?.upcoming ?? {},
    live: g.__providerQualityDebug?.live ?? {},
    livePayload: g.__livePayloadDebug ?? null,
  });
});

export default router;
