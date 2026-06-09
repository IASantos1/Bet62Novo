import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import betsRouter from "./bets";
import matchesRouter from "./matches";
import adminRouter from "./admin";
import adminProRouter from "./adminPro";
import statsRouter from "./stats";
import paymentsRouter from "./payments";
import profileRouter from "./profile";
import withdrawalsRouter from "./withdrawals";
import trackingRouter from "./tracking";

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
