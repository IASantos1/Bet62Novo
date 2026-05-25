import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error(
    "[SECURITY] SESSION_SECRET environment variable is not set. " +
    "The server refuses to start without a JWT secret. " +
    "Set SESSION_SECRET in your deployment configuration."
  );
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token!, SESSION_SECRET) as { id: number; email: string };
    req.user = decoded;
    next();
  } catch (err) {
    logger.error({ err }, "JWT verification failed");
    res.status(401).json({ error: "Invalid token" });
  }
};
