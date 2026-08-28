import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { findUserByIdAsync } from './auth-store.js';
import type { User } from './auth-store.js';

export const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[SECURITY WARNING] JWT_SECRET not set in environment. Using auto-generated secret (sessions will NOT persist across restarts).');
  return crypto.randomBytes(32).toString('hex');
})();

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Access denied. No authentication token provided.' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    findUserByIdAsync(decoded.userId).then(user => {
      if (!user) {
        res.status(401).json({ success: false, error: 'Invalid authentication token.' });
        return;
      }

      req.user = user;
      next();
    }).catch(() => {
      res.status(401).json({ success: false, error: 'Authentication error.' });
    });
  } catch (err: unknown) {
    res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
  }
}

export function requireApprovedUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return;
  }

  if (req.user.status !== 'approved') {
    res.status(403).json({
      success: false,
      error: `Account status is '${req.user.status}'. Access is restricted until admin approval.`
    });
    return;
  }

  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Access denied. Admin privilege required.' });
    return;
  }

  next();
}
