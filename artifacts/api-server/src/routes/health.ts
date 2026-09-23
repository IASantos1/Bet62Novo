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

// Unvalidated operational route: reports the currently active sportsbook
// provider setup without forcing callers to know the internal config shape.
router.get("/health-data-providers", (_req, res) => {
  const g = globalThis as any;
  res.json({
    flags: {
      bsdFootballEnabled: Boolean(CONFIG.BZZOIRO_API_TOKEN),
    },
    keys: {
      bsd: Boolean(CONFIG.BZZOIRO_API_TOKEN),
    },
    activeProvider: CONFIG.BZZOIRO_API_TOKEN ? "bsd" : null,
    lastSuccessfulFetch: {},
    livePayloadDebug: g.__livePayloadDebug ?? null,
  });
});

export default router;
