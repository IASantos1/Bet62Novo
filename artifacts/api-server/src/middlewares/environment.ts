import { type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthRequest } from "./auth.js";

export type BettingEnvironment = "production" | "demo";

export interface EnvironmentRequest extends AuthRequest {
  bettingEnvironment?: BettingEnvironment;
}

// Resolves the authenticated user's environment ("production" | "demo")
// server-side and stashes it on req.bettingEnvironment — the single place
// every provider-routing decision (BigBang LIVE vs Sandbox, WinHouse LIVE
// vs DEMO, once those land) and every commission/wallet rule reads from.
// Must run after authMiddleware. The frontend is never trusted to declare
// its own environment (Santos, 2026-09-30) — see the users.environment
// column comment in lib/db/src/schema/users.ts.
export async function environmentMiddleware(
  req: EnvironmentRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Utilizador não autenticado" });
    return;
  }
  const [row] = await db
    .select({ environment: usersTable.environment })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .limit(1);
  req.bettingEnvironment = (row?.environment as BettingEnvironment) ?? "production";
  next();
}
