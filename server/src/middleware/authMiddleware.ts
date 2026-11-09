import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const authService = AuthService.getInstance();
  const payload = authService.verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Optional auth middleware: sets req.user if token is present, continues either way
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const authService = AuthService.getInstance();
    const payload = authService.verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

