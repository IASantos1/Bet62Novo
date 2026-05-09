import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger";

const SESSION_SECRET = process.env.SESSION_SECRET || "default_secret";

export interface AdminRequest extends Request {
  admin?: { username: string; isAdmin: true };
}

export const adminMiddleware = (req: AdminRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Acesso não autorizado" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SESSION_SECRET) as { username: string; isAdmin: boolean };
    if (!decoded.isAdmin) {
      res.status(403).json({ error: "Permissão insuficiente" });
      return;
    }
    req.admin = { username: decoded.username, isAdmin: true };
    next();
  } catch (err) {
    logger.error({ err }, "Admin JWT verification failed");
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
};
