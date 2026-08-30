import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { findUserByIdAsync } from './auth-store.js';
import { validateApiKey } from './api-key-store.js';
import type { User } from './auth-store.js';
import type { ApiKeyRecord } from './api-key-store.js';

export const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[SECURITY WARNING] JWT_SECRET not set in environment. Using auto-generated secret (sessions will NOT persist across restarts).');
  return crypto.randomBytes(32).toString('hex');
})();

export interface AuthenticatedRequest extends Request {
  user?: User;
  apiKey?: ApiKeyRecord;
  authMethod?: 'jwt' | 'api_key';
}

/**
 * Unified Authentication Middleware:
 * Supports both JWT Bearer tokens and API Keys (via `X-API-Key` or `Authorization: Bearer tl_live_...`)
 */
export async function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers.authorization;

  // 1. Check for API Key in X-API-Key header
  if (apiKeyHeader && apiKeyHeader.startsWith('tl_live_')) {
    try {
      const authResult = await validateApiKey(apiKeyHeader);
      if (!authResult) {
        res.status(401).json({ success: false, error: 'Invalid or revoked API Key.' });
        return;
      }
      req.user = authResult.user;
      req.apiKey = authResult.apiKey;
      req.authMethod = 'api_key';
      next();
      return;
    } catch (err: unknown) {
      res.status(401).json({ success: false, error: 'API Key validation failed.' });
      return;
    }
  }

  // 2. Check for Authorization header
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tokenOrKey = authHeader.substring(7).trim();

    // 2a. API Key passed in Bearer header
    if (tokenOrKey.startsWith('tl_live_')) {
      try {
        const authResult = await validateApiKey(tokenOrKey);
        if (!authResult) {
          res.status(401).json({ success: false, error: 'Invalid or revoked API Key.' });
          return;
        }
        req.user = authResult.user;
        req.apiKey = authResult.apiKey;
        req.authMethod = 'api_key';
        next();
        return;
      } catch (err: unknown) {
        res.status(401).json({ success: false, error: 'API Key validation failed.' });
        return;
      }
    }

    // 2b. Standard JWT Token
    try {
      const decoded = jwt.verify(tokenOrKey, JWT_SECRET) as { userId: string };
      const user = await findUserByIdAsync(decoded.userId);
      if (!user) {
        res.status(401).json({ success: false, error: 'Invalid authentication token.' });
        return;
      }

      req.user = user;
      req.authMethod = 'jwt';
      next();
      return;
    } catch (err: unknown) {
      res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
      return;
    }
  }

  // 3. Check for Token in Query Parameter (for iframe embedding / media streaming)
  const queryToken = req.query?.token as string | undefined;
  if (queryToken) {
    try {
      const decoded = jwt.verify(queryToken, JWT_SECRET) as { userId: string };
      const user = await findUserByIdAsync(decoded.userId);
      if (user) {
        req.user = user;
        req.authMethod = 'jwt';
        next();
        return;
      }
    } catch {
      // Fall through to 401
    }
  }

  res.status(401).json({ 
    success: false, 
    error: 'Access denied. Please provide a valid Bearer JWT token or X-API-Key header.' 
  });
}

/**
 * Enforce that the request is authenticated via a JWT session (used for API Key management and Web UI operations)
 */
export function requireJwtOnly(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.authMethod !== 'jwt') {
    res.status(403).json({
      success: false,
      error: 'This operation requires a standard Web UI session token.'
    });
    return;
  }
  next();
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
