import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findUserByUsername, addUser } from '../auth-store.js';
import { addLog } from '../activity-log-store.js';
import { authenticateJWT, JWT_SECRET } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';

export const authRoutes = Router();

/**
 * POST /api/v1/auth/register
 * Register new user account (defaults to status 'pending' for admin approval)
 */
authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({
        success: false,
        error: 'Username, email, and password are required.'
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.'
      });
      return;
    }

    const existingUser = findUserByUsername(username);
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: 'Username is already taken. Please choose another username.'
      });
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser = addUser({
      username,
      email,
      passwordHash,
      role: 'user',
      status: 'pending'
    });

    addLog({
      userId: newUser.id,
      username: newUser.username,
      action: 'Register',
      details: 'Requested new account access (pending approval)'
    });

    res.status(201).json({
      success: true,
      message: 'Registration request submitted successfully. Account is pending admin approval.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status
      }
    });
  } catch (err: unknown) {
    const error = err as Error;
    addLog({
      username: req.body.username || 'System',
      action: 'Register Failed',
      details: error.message || 'Internal Server Error'
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Log in with username and password, returns JWT token
 */
authRoutes.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required.'
      });
      return;
    }

    const user = findUserByUsername(username);
    if (!user) {
      addLog({
        username: username,
        action: 'Login Failed',
        details: 'Invalid username'
      });
      res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
      return;
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      addLog({
        userId: user.id,
        username: user.username,
        action: 'Login Failed',
        details: 'Invalid password'
      });
      res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
      return;
    }

    if (user.status === 'pending') {
      addLog({
        userId: user.id,
        username: user.username,
        action: 'Login Failed',
        details: 'Account is pending approval'
      });
      res.status(403).json({
        success: false,
        error: 'Your account registration is pending admin approval. Please wait for admin confirmation.'
      });
      return;
    }

    if (user.status === 'rejected') {
      addLog({
        userId: user.id,
        username: user.username,
        action: 'Login Failed',
        details: 'Account was rejected'
      });
      res.status(403).json({
        success: false,
        error: 'Your account registration request was rejected by the admin.'
      });
      return;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    addLog({
      userId: user.id,
      username: user.username,
      action: 'Login Success',
      details: 'User authenticated successfully'
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user profile
 */
authRoutes.get('/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    }
  });
});
