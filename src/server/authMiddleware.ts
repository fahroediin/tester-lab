import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById, User } from './authStore.js';

export const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[SECURITY WARNING] JWT_SECRET not set in environment. Using auto-generated secret (sessions will NOT persist across restarts).');
  return require('crypto').randomBytes(32).toString('hex');
})();

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Access denied. No authentication token provided.' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
  }
}

export function requireApprovedUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  if (req.user.status !== 'approved') {
    return res.status(403).json({
      success: false,
      error: `Account status is '${req.user.status}'. Access is restricted until admin approval.`
    });
  }

  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access denied. Admin privilege required.' });
  }

  next();
}
