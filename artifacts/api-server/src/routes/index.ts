import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import betsRouter from "./bets.js";
import matchesRouter from "./matches.js";
import adminRouter from "./admin.js";
import adminProRouter from "./adminPro.js";
import statsRouter from "./stats.js";
import paymentsRouter from "./payments.js";
import profileRouter from "./profile.js";
import withdrawalsRouter from "./withdrawals.js";
import trackingRouter from "./tracking.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/bets", betsRouter);
router.use("/matches", matchesRouter);
router.use("/admin", adminRouter);
router.use("/admin", adminProRouter);
router.use("/stats", statsRouter);
router.use("/payments", paymentsRouter);
router.use("/profile", profileRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/tracking", trackingRouter);

export default router;
