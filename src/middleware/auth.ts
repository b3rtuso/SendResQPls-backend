import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ── Crash on startup if JWT_SECRET is missing ─────────────────────────────────
// Never fall back to a predictable string — a missing secret means tokens
// could be forged with a known value.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
}

export interface AuthRequest extends Request {
  user?: { userId: string; role: 'CITIZEN' | 'ADMIN' };
}

/**
 * requireAuth - validates the Bearer JWT.
 * Attaches req.user = { userId, role } on success.
 * Returns 401 if token is missing or invalid.
 */
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.user = { userId: payload.userId, role: payload.role as 'CITIZEN' | 'ADMIN' };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * requireAdmin - extends requireAuth, also checks role === 'ADMIN'.
 * Returns 403 if user is authenticated but not an admin.
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  requireAuth(req, res, () => {
    if ((req as AuthRequest).user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};
