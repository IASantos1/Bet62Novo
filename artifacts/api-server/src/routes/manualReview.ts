import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  adminMiddleware,
  type AdminRequest,
} from "../middlewares/adminAuth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// GET /api/admin/review — list pending review queue (paginated)
router.get(
  "/",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
      const offset = (page - 1) * limit;
      const status = Array.isArray(req.query.status) ? req.query.status[0] : (req.query.status ?? "pending");

      const { rows } = await pool.query(
        `SELECT * FROM manual_review_queue
         WHERE ($1::text = 'all' OR status = $1)
         ORDER BY
           CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           created_at ASC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset],
      );

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS total FROM manual_review_queue
         WHERE ($1::text = 'all' OR status = $1)`,
        [status],
      );

      const total = parseInt(countRows[0]?.total ?? "0", 10);

      res.json({
        items: rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      logger.error({ err }, "GET /api/admin/review error");
      res.status(500).json({ error: "Erro ao carregar fila de revisão manual" });
    }
  },
);

// GET /api/admin/review/:id — get specific review item
router.get(
  "/:id",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const id = parseInt(String(req.params.id!), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }

      const { rows } = await pool.query(
        `SELECT * FROM manual_review_queue WHERE id = $1`,
        [id],
      );

      if (rows.length === 0) {
        res.status(404).json({ error: "Item não encontrado" });
        return;
      }

      res.json(rows[0]);
    } catch (err) {
      logger.error({ err }, "GET /api/admin/review/:id error");
      res.status(500).json({ error: "Erro ao carregar item de revisão" });
    }
  },
);

// POST /api/admin/review/:id/approve — approve with optional notes
router.post(
  "/:id/approve",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const id = parseInt(String(req.params.id!), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }

      const notes: string | undefined = req.body?.notes;
      const reviewedBy = req.admin!.username;

      const { rowCount } = await pool.query(
        `UPDATE manual_review_queue
         SET status = 'approved',
             reviewed_by = $1,
             reviewed_at = NOW(),
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE id = $3 AND status = 'pending'`,
        [reviewedBy, notes ?? null, id],
      );

      if (rowCount === 0) {
        res.status(404).json({ error: "Item não encontrado ou já processado" });
        return;
      }

      logger.info({ id, reviewedBy }, "Manual review item approved");
      res.json({ success: true, id, status: "approved" });
    } catch (err) {
      logger.error({ err }, "POST /api/admin/review/:id/approve error");
      res.status(500).json({ error: "Erro ao aprovar item de revisão" });
    }
  },
);

// POST /api/admin/review/:id/reject — reject with reason
router.post(
  "/:id/reject",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const id = parseInt(String(req.params.id!), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }

      const notes: string | undefined = req.body?.reason ?? req.body?.notes;
      const reviewedBy = req.admin!.username;

      const { rowCount } = await pool.query(
        `UPDATE manual_review_queue
         SET status = 'rejected',
             reviewed_by = $1,
             reviewed_at = NOW(),
             notes = $2,
             updated_at = NOW()
         WHERE id = $3 AND status IN ('pending', 'escalated')`,
        [reviewedBy, notes ?? null, id],
      );

      if (rowCount === 0) {
        res.status(404).json({ error: "Item não encontrado ou já processado" });
        return;
      }

      logger.info({ id, reviewedBy }, "Manual review item rejected");
      res.json({ success: true, id, status: "rejected" });
    } catch (err) {
      logger.error({ err }, "POST /api/admin/review/:id/reject error");
      res.status(500).json({ error: "Erro ao rejeitar item de revisão" });
    }
  },
);

// POST /api/admin/review/:id/escalate — escalate priority
router.post(
  "/:id/escalate",
  adminMiddleware,
  async (req: AdminRequest, res) => {
    try {
      const id = parseInt(String(req.params.id!), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }

      const notes: string | undefined = req.body?.notes;
      const reviewedBy = req.admin!.username;

      const { rowCount } = await pool.query(
        `UPDATE manual_review_queue
         SET status = 'escalated',
             priority = 'high',
             reviewed_by = $1,
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE id = $3 AND status = 'pending'`,
        [reviewedBy, notes ?? null, id],
      );

      if (rowCount === 0) {
        res.status(404).json({ error: "Item não encontrado ou já processado" });
        return;
      }

      logger.info({ id, reviewedBy }, "Manual review item escalated");
      res.json({ success: true, id, status: "escalated", priority: "high" });
    } catch (err) {
      logger.error({ err }, "POST /api/admin/review/:id/escalate error");
      res.status(500).json({ error: "Erro ao escalar item de revisão" });
    }
  },
);

export default router;
