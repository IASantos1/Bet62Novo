import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import betsRouter from "./bets";
import matchesRouter from "./matches";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/bets", betsRouter);
router.use("/matches", matchesRouter);
router.use("/admin", adminRouter);

export default router;
