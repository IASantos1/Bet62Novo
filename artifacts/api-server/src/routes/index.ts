import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import adminProRouter from "./adminPro.js";
import adminAiAgentsRouter from "./adminAiAgents.js";
import statsRouter from "./stats.js";
import paymentsRouter from "./payments.js";
import profileRouter from "./profile.js";
import withdrawalsRouter from "./withdrawals.js";
import trackingRouter from "./tracking.js";
import casinoRouter from "./casino.js";
import winhouseRouter from "./winhouse.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/admin", adminProRouter);
router.use("/admin", adminAiAgentsRouter);
router.use("/stats", statsRouter);
router.use("/payments", paymentsRouter);
router.use("/profile", profileRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/tracking", trackingRouter);
router.use("/casino", casinoRouter);
router.use("/winhouse", winhouseRouter);

export default router;
