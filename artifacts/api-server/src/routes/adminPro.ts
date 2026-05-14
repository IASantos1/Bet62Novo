import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, betsTable, paymentsTable, adminAuditLogTable, platformSettingsTable, suspendedMatchesTable } from "@workspace/db";
import { eq, desc, count, sum, sql, ne } from "drizzle-orm";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── AUDIT LOGGER ─────────────────────────────────────────────────────────────
async function auditLog(req: AdminRequest, action: string, targetType?: string, targetId?: string, details?: object) {
  try {
    await db.insert(adminAuditLogTable).values({
      action,
      adminUser: (req as { user?: { username?: string } }).user?.username || "admin",
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      details: details ?? null,
      ip: req.ip ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Audit log error");
  }
}

// ── DEFAULT SETTINGS ──────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: Record<string, string> = {
  max_bet: "5000",
  min_bet: "1",
  max_odds: "50",
  live_delay: "5",
  default_margin: "0.06",
  bet_limits_enabled: "true",
  sports_enabled: "football,basketball,tennis,hockey,volleyball",
};

async function ensureSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(platformSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoNothing();
  }
}

// ── RISK MANAGEMENT ──────────────────────────────────────────────────────────
// GET /api/admin/risk
router.get("/risk", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    // Total liability (pending bets)
    const [liability] = await db
      .select({ count: count(), totalStake: sum(betsTable.stake), totalLiability: sum(betsTable.potentialWin) })
      .from(betsTable).where(eq(betsTable.status, "pending"));

    // Exposure per match (pending bets grouped by matchTitle)
    const exposureByMatch = await db.execute(sql`
      SELECT match_title, match_id,
        COUNT(*) as bet_count,
        SUM(stake::numeric) as total_staked,
        SUM(potential_win::numeric) as total_liability
      FROM bets WHERE status = 'pending'
      GROUP BY match_title, match_id
      ORDER BY total_liability DESC
      LIMIT 20
    `);

    // Big bets (top 20 by stake, all time)
    const bigBets = await db
      .select({
        id: betsTable.id,
        matchTitle: betsTable.matchTitle,
        stake: betsTable.stake,
        potentialWin: betsTable.potentialWin,
        totalOdds: betsTable.totalOdds,
        status: betsTable.status,
        createdAt: betsTable.createdAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(betsTable)
      .leftJoin(usersTable, eq(betsTable.userId, usersTable.id))
      .orderBy(desc(betsTable.stake))
      .limit(20);

    // Sharp bettors (users with > 55% win rate and ≥ 3 settled bets)
    const sharpBettors = await db.execute(sql`
      SELECT u.id, u.name, u.email,
        COUNT(*) FILTER (WHERE b.status IN ('won','lost','cashed_out')) as settled,
        COUNT(*) FILTER (WHERE b.status = 'won') as won,
        SUM(b.stake::numeric) as total_staked,
        SUM(CASE WHEN b.status = 'won' THEN b.potential_win::numeric ELSE 0 END) as total_won
      FROM bets b
      JOIN users u ON u.id = b.user_id
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(*) FILTER (WHERE b.status IN ('won','lost','cashed_out')) >= 3
        AND COUNT(*) FILTER (WHERE b.status = 'won')::float /
            NULLIF(COUNT(*) FILTER (WHERE b.status IN ('won','lost','cashed_out')), 0) > 0.55
      ORDER BY total_won DESC
      LIMIT 10
    `);

    // High exposure alerts (matches with liability > 500)
    const highExposure = (exposureByMatch.rows as Array<{ total_liability: string; match_title: string }>)
      .filter(r => parseFloat(r.total_liability || "0") > 500);

    res.json({
      summary: {
        pendingBets: Number(liability.count),
        totalPendingStake: parseFloat(liability.totalStake || "0"),
        totalLiability: parseFloat(liability.totalLiability || "0"),
        highExposureCount: highExposure.length,
      },
      exposureByMatch: exposureByMatch.rows,
      bigBets,
      sharpBettors: sharpBettors.rows,
    });
  } catch (err) {
    logger.error({ err }, "Admin risk error");
    res.status(500).json({ error: "Erro ao carregar dados de risco" });
  }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
// GET /api/admin/analytics
router.get("/analytics", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    // Overall GGR / NGR
    const [staked] = await db.select({ total: sum(betsTable.stake) }).from(betsTable);
    const [paidOut] = await db.select({ total: sum(betsTable.potentialWin) }).from(betsTable).where(eq(betsTable.status, "won"));
    const [deposited] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.status, "completed"));
    const [freebetTotal] = await db.select({ total: sum(usersTable.freebetBalance) }).from(usersTable);

    const totalStaked = parseFloat(staked.total || "0");
    const totalPaidOut = parseFloat(paidOut.total || "0");
    const totalDeposited = parseFloat(deposited.total || "0");
    const bonusCost = parseFloat(freebetTotal.total || "0");
    const ggr = totalStaked - totalPaidOut;
    const ngr = ggr - bonusCost;
    const hold = totalStaked > 0 ? (ggr / totalStaked) * 100 : 0;

    // Daily GGR last 30 days
    const daily = await db.execute(sql`
      SELECT DATE(created_at AT TIME ZONE 'UTC') as day,
        COUNT(*) as bets,
        SUM(stake::numeric) as turnover,
        SUM(CASE WHEN status = 'won' THEN potential_win::numeric ELSE 0 END) as paid_out,
        SUM(stake::numeric) - SUM(CASE WHEN status = 'won' THEN potential_win::numeric ELSE 0 END) as ggr
      FROM bets
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day ORDER BY day ASC
    `);

    // Bets by status
    const byStatus = await db.execute(sql`
      SELECT status, COUNT(*) as count, SUM(stake::numeric) as volume
      FROM bets GROUP BY status
    `);

    // Top depositors
    const topDepositors = await db.execute(sql`
      SELECT u.name, u.email, COUNT(p.id) as deposits, SUM(p.amount::numeric) as total
      FROM payments p JOIN users u ON u.id = p.user_id
      WHERE p.status = 'completed'
      GROUP BY u.name, u.email ORDER BY total DESC LIMIT 10
    `);

    // Active users (last 7 days)
    const activeUsersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as count FROM bets WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const activeUsers = activeUsersResult.rows[0] as { count: string } | undefined;

    res.json({
      kpis: {
        turnover: totalStaked,
        ggr,
        ngr,
        hold: hold.toFixed(2),
        totalDeposited,
        bonusCost,
        activeUsers7d: Number(activeUsers?.count || 0),
      },
      daily: daily.rows,
      byStatus: byStatus.rows,
      topDepositors: topDepositors.rows,
    });
  } catch (err) {
    logger.error({ err }, "Admin analytics error");
    res.status(500).json({ error: "Erro ao carregar analytics" });
  }
});

// ── PLATFORM SETTINGS ─────────────────────────────────────────────────────────
// GET /api/admin/settings
router.get("/settings", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    await ensureSettings();
    const settings = await db.select().from(platformSettingsTable);
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    // Fill defaults for any missing
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(k in map)) map[k] = v;
    }
    res.json(map);
  } catch (err) {
    logger.error({ err }, "Admin settings GET error");
    res.status(500).json({ error: "Erro ao carregar configurações" });
  }
});

// PUT /api/admin/settings/:key
router.put("/settings/:key", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const key = String(req.params["key"]);
  const { value } = req.body as { value?: string };

  if (!key || value === undefined || value === null) {
    res.status(400).json({ error: "key e value são obrigatórios" }); return;
  }

  if (!(key in DEFAULT_SETTINGS)) {
    res.status(400).json({ error: "Configuração desconhecida" }); return;
  }

  try {
    await db.insert(platformSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });

    await auditLog(req, "settings_update", "setting", key, { key, value });
    res.json({ key, value });
  } catch (err) {
    logger.error({ err }, "Admin settings PUT error");
    res.status(500).json({ error: "Erro ao guardar configuração" });
  }
});

// ── SUSPENDED MATCHES ─────────────────────────────────────────────────────────
// GET /api/admin/events/suspended
router.get("/events/suspended", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const suspended = await db.select().from(suspendedMatchesTable).orderBy(desc(suspendedMatchesTable.createdAt));
    res.json(suspended);
  } catch (err) {
    logger.error({ err }, "Admin suspended matches error");
    res.status(500).json({ error: "Erro ao carregar eventos suspensos" });
  }
});

// POST /api/admin/events/suspend
router.post("/events/suspend", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const { matchId, matchTitle, sport, reason } = req.body as {
    matchId?: string; matchTitle?: string; sport?: string; reason?: string;
  };

  if (!matchId || !matchTitle) {
    res.status(400).json({ error: "matchId e matchTitle são obrigatórios" }); return;
  }

  try {
    const [existing] = await db.select().from(suspendedMatchesTable).where(eq(suspendedMatchesTable.matchId, matchId)).limit(1);
    if (existing) { res.status(400).json({ error: "Evento já está suspenso" }); return; }

    const [created] = await db.insert(suspendedMatchesTable).values({
      matchId,
      matchTitle,
      sport: sport || "football",
      reason: reason || null,
    }).returning();

    await auditLog(req, "suspend_match", "match", matchId, { matchTitle, sport, reason });
    res.json(created);
  } catch (err) {
    logger.error({ err }, "Admin suspend match error");
    res.status(500).json({ error: "Erro ao suspender evento" });
  }
});

// DELETE /api/admin/events/suspend/:matchId
router.delete("/events/suspend/:matchId", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  const matchId = String(req.params["matchId"]);
  try {
    await db.delete(suspendedMatchesTable).where(eq(suspendedMatchesTable.matchId, matchId));
    await auditLog(req, "unsuspend_match", "match", matchId, {});
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin unsuspend match error");
    res.status(500).json({ error: "Erro ao reativar evento" });
  }
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
// GET /api/admin/audit
router.get("/audit", adminMiddleware, async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(String(req.query["page"] || "1"), 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const logs = await db.select().from(adminAuditLogTable).orderBy(desc(adminAuditLogTable.createdAt)).limit(limit).offset(offset);
    res.json(logs);
  } catch (err) {
    logger.error({ err }, "Admin audit error");
    res.status(500).json({ error: "Erro ao carregar logs" });
  }
});

// ── FEED HEALTH ───────────────────────────────────────────────────────────────
// GET /api/admin/feed
// Tests our own internal API routes — these reflect what users actually see,
// regardless of which Statpal plan/key is active (fallback/simulation included).
router.get("/feed", adminMiddleware, async (_req: AdminRequest, res: Response): Promise<void> => {
  const req = _req as unknown as Request;
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const proto = forwardedProto || "https";
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0]?.trim();
  const base = host ? `${proto}://${host}` : "";
  const endpoints = [
    { name: "Football — Próximos Jogos", url: `${base}/api/matches/upcoming` },
    { name: "Football — Ao Vivo",        url: `${base}/api/matches/live` },
    { name: "NBA — Calendário",          url: `${base}/api/matches/basketball-schedule` },
    { name: "NBA — Odds",                url: `${base}/api/matches/basketball-odds` },
    { name: "NHL — Calendário",          url: `${base}/api/matches/hockey-schedule` },
    { name: "NHL — Odds",                url: `${base}/api/matches/hockey-odds` },
    { name: "Ténis — Odds",              url: `${base}/api/matches/tennis-odds` },
    { name: "Voleibol — Odds",           url: `${base}/api/matches/volleyball-odds` },
  ];

  const results = await Promise.all(
    endpoints.map(async (ep) => {
      const start = Date.now();
      try {
        const r = await fetch(ep.url, { signal: AbortSignal.timeout(8000) });
        const latency = Date.now() - start;
        return { name: ep.name, status: r.ok ? "ok" : "error", statusCode: r.status, latency };
      } catch {
        return { name: ep.name, status: "error", statusCode: 0, latency: Date.now() - start };
      }
    })
  );

  const allOk = results.every(r => r.status === "ok");
  res.json({ overall: allOk ? "ok" : "degraded", endpoints: results, checkedAt: new Date().toISOString() });
});

export default router;
