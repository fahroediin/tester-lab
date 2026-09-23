import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  findUserByUsernameAsync,
  addUser,
  findUserByEmailAsync,
  setResetToken,
  findUserByResetHash,
  consumeResetToken
} from '../auth-store.js';
import { addLog } from '../activity-log-store.js';
import { authenticateJWT, JWT_SECRET } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { loadSmtpCreds, loadEmailConfigPublic } from '../email-config-store.js';
import { sendEmail, renderTemplate, hashResetToken, isResetTokenUsable } from '../services/email-service.js';

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

    const existingUser = await findUserByUsernameAsync(username);
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: 'Username is already taken. Please choose another username.'
      });
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser = await addUser({
      username,
      email,
      passwordHash,
      role: 'user',
      status: 'pending'
    });

    await addLog({
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
    await addLog({
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

    const user = await findUserByUsernameAsync(username);
    if (!user) {
      await addLog({
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
      await addLog({
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
      await addLog({
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
      await addLog({
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

    await addLog({
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
 * POST /api/v1/auth/forgot-password
 * Request a password-reset link. Always returns the same generic message so the
 * response does not reveal whether the email is registered (US-C / AC-C.01/02).
 */
authRoutes.post('/forgot-password', async (req: Request, res: Response) => {
  const generic = 'If the email is registered, a reset link has been sent.';
  try {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required.' });
      return;
    }
    const user = await findUserByEmailAsync(email);
    if (user && user.status === 'approved') {
      const creds = await loadSmtpCreds();
      if (creds) {
        const raw = crypto.randomBytes(32).toString('hex');
        const hash = hashResetToken(raw);
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await setResetToken(user.id, hash, expires);
        const cfg = await loadEmailConfigPublic();
        const url = `${req.protocol}://${req.get('host')}/reset-password?token=${raw}`;
        const body = renderTemplate(cfg.resetBody, { name: user.username, email: user.email, url });
        await sendEmail(creds, cfg.smtpFromName, { to: user.email, subject: cfg.resetSubject, body });
      }
    }
    res.json({ success: true, message: generic });
  } catch {
    // Keep the response generic even on internal error (no enumeration).
    res.json({ success: true, message: generic });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Set a new password using a reset token. Token is matched by hash, single-use,
 * and expires after 60 minutes (US-C / AC-C.03/04/05/06).
 */
authRoutes.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      res.status(400).json({ success: false, error: 'Token and password are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
      return;
    }
    const rec = await findUserByResetHash(hashResetToken(token));
    if (!rec) {
      res.status(400).json({ success: false, error: 'This reset link is invalid. Please request a new one.' });
      return;
    }
    if (rec.used) {
      res.status(400).json({ success: false, error: 'This reset link has already been used. Please request a new one.' });
      return;
    }
    if (!isResetTokenUsable({ expires: rec.expires, used: rec.used })) {
      res.status(400).json({ success: false, error: 'This reset link has expired. Please request a new one.' });
      return;
    }
    await consumeResetToken(rec.id, bcrypt.hashSync(password, 10));
    res.json({ success: true, message: 'Your password has been reset. Please log in with your new password.' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message || 'Internal Server Error' });
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
