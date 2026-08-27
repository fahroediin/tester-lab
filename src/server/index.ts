import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { TestScriptGenerator } from '../index.js';
import { DOMExtractor } from '../crawler/domExtractor.js';
import {
  addUser,
  deleteUser,
  findUserByUsername,
  loadUsers,
  updateUserStatus
} from './authStore.js';
import { addLog, getLogs } from './activityLogStore.js';
import {
  authenticateJWT,
  AuthenticatedRequest,
  JWT_SECRET,
  requireAdmin,
  requireApprovedUser
} from './authMiddleware.js';
import { globalTestRunnerQueue } from './queueManager.js';
import { sanitizeCode } from './codeSanitizer.js';

const execAsync = promisify(exec);

/**
 * Build a sanitized environment object for child processes.
 * Only includes variables required for Playwright to function.
 * ALL secrets (JWT_SECRET, ADMIN_PASSWORD, etc.) are stripped.
 */
function getSanitizedEnv(): Record<string, string> {
  const ALLOWED_ENV_KEYS = [
    'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'SHELL',
    'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
    'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'TMPDIR', 'TMP', 'TEMP',
    'PLAYWRIGHT_BROWSERS_PATH',
    'CHROMIUM_FLAGS', 'CHROME_FLAGS',
    'PUPPETEER_CHROMIUM_REVISION',
    'NODE_PATH',
    'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles',
    'ProgramFiles(x86)', 'CommonProgramFiles', 'USERPROFILE',
    'HOMEDRIVE', 'HOMEPATH', 'PATHEXT', 'COMSPEC', 'windir',
  ];

  const sanitized: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key]) {
      sanitized[key] = process.env[key]!;
    }
  }
  return sanitized;
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(process.cwd(), 'dist', 'public')));
app.use('/feedbacks/attachments', express.static(path.join(process.cwd(), 'data', 'feedbacks', 'attachments')));

const generator = new TestScriptGenerator();
const extractor = new DOMExtractor();

/**
 * Root Route: Serve Interactive HTML Web UI
 */
app.get('/', (req: Request, res: Response) => {
  let indexPath = path.join(process.cwd(), 'public', 'index.html');
  res.sendFile(indexPath);
});

/**
 * Admin Route: Serve Dedicated Admin Console Page
 */
app.get('/admin', (req: Request, res: Response) => {
  let adminPath = path.join(process.cwd(), 'public', 'admin.html');
  res.sendFile(adminPath);
});

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * POST /api/v1/auth/register
 * Register new user account (defaults to status 'pending' for admin approval)
 */
app.post('/api/v1/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.'
      });
    }

    const existingUser = findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username is already taken. Please choose another username.'
      });
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

    return res.status(201).json({
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
  } catch (err: any) {
    addLog({
      username: req.body.username || 'System',
      action: 'Register Failed',
      details: err.message || 'Internal Server Error'
    });
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Log in with username and password, returns JWT token
 */
app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required.'
      });
    }

    const user = findUserByUsername(username);
    if (!user) {
      addLog({
        username: username,
        action: 'Login Failed',
        details: 'Invalid username'
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      addLog({
        userId: user.id,
        username: user.username,
        action: 'Login Failed',
        details: 'Invalid password'
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
    }

    if (user.status === 'pending') {
      addLog({
        userId: user.id,
        username: user.username,
        action: 'Login Failed',
        details: 'Account is pending approval'
      });
      return res.status(403).json({
        success: false,
        error: 'Your account registration is pending admin approval. Please wait for admin confirmation.'
      });
    }

    if (user.status === 'rejected') {
      addLog({
        userId: user.id,
        username: user.username,
        action: 'Login Failed',
        details: 'Account was rejected'
      });
      return res.status(403).json({
        success: false,
        error: 'Your account registration request was rejected by the admin.'
      });
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

    return res.json({
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
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user profile
 */
app.get('/api/v1/auth/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  return res.json({
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

// ==========================================
// ADMIN DASHBOARD ENDPOINTS
// ==========================================

/**
 * GET /api/v1/admin/users
 * List all registration requests (Admin only)
 */
app.get('/api/v1/admin/users', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const users = loadUsers().map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt
  }));

  return res.json({
    success: true,
    users
  });
});

/**
 * GET /api/v1/admin/logs
 * List all activity logs (Admin only)
 */
app.get('/api/v1/admin/logs', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 200;
  const logs = getLogs(limit);
  return res.json({
    success: true,
    logs
  });
});

/**
 * GET /api/v1/admin/feedbacks
 * List all user feedbacks (Admin only)
 */
app.get('/api/v1/admin/feedbacks', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const feedbackDir = path.join(process.cwd(), 'data', 'feedbacks');
    const logFile = path.join(feedbackDir, 'feedbacks.json');
    
    let feedbacks: any[] = [];
    if (fs.existsSync(logFile)) {
      feedbacks = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    }
    
    // Sort newest first
    feedbacks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    const total = feedbacks.length;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const paginatedFeedbacks = feedbacks.slice(startIndex, endIndex);
    
    return res.json({
      success: true,
      feedbacks: paginatedFeedbacks,
      total,
      page,
      limit
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
});

/**
 * POST /api/v1/admin/users/:id/approve
 * Approve user registration request (Admin only)
 */
app.post('/api/v1/admin/users/:id/approve', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const updated = updateUserStatus(id, 'approved');

  if (!updated) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Approve',
    details: `Approved user '${updated.username}'`
  });

  return res.json({
    success: true,
    message: `Account '${updated.username}' approved successfully.`,
    user: updated
  });
});

/**
 * POST /api/v1/admin/users/:id/reject
 * Reject user registration request (Admin only)
 */
app.post('/api/v1/admin/users/:id/reject', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const updated = updateUserStatus(id, 'rejected');

  if (!updated) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Reject',
    details: `Rejected user '${updated.username}'`
  });

  return res.json({
    success: true,
    message: `Account '${updated.username}' rejected.`,
    user: updated
  });
});

/**
 * DELETE /api/v1/admin/users/:id
 * Delete user account (Admin only)
 */
app.delete('/api/v1/admin/users/:id', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const deleted = deleteUser(id);

  if (!deleted) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Delete',
    details: `Deleted user ID '${id}'`
  });

  return res.json({
    success: true,
    message: 'User deleted successfully.'
  });
});

// ==========================================
// FEEDBACK ENDPOINTS
// ==========================================

/**
 * POST /api/v1/feedback
 * Submit user feedback with optional file attachment
 */
app.post('/api/v1/feedback', (req: Request, res: Response) => {
  try {
    const { type, details, fileBase64, filename } = req.body;
    
    if (!type || !details) {
      return res.status(400).json({ success: false, error: 'Type and details are required' });
    }
    
    const feedbackDir = path.join(process.cwd(), 'data', 'feedbacks');
    const attachmentsDir = path.join(feedbackDir, 'attachments');
    
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }
    
    const feedbackId = crypto.randomUUID();
    let savedFilename = null;
    
    if (fileBase64 && filename) {
      // Validate file extension
      const ext = path.extname(filename).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
        return res.status(400).json({ success: false, error: 'Invalid file extension. Only png, jpg, jpeg, bmp are allowed.' });
      }
      
      // Decode base64
      const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const maxSize = parseInt(process.env.MAX_FEEDBACK_FILE_SIZE || '5242880', 10);
      if (buffer.length > maxSize) {
        return res.status(400).json({ success: false, error: `File size exceeds the limit of ${Math.round(maxSize / 1024 / 1024)}MB` });
      }
      
      savedFilename = `${feedbackId}${ext}`;
      const filePath = path.join(attachmentsDir, savedFilename);
      fs.writeFileSync(filePath, buffer);
    }
    
    const feedbackData = {
      id: feedbackId,
      timestamp: new Date().toISOString(),
      type,
      details,
      attachment: savedFilename
    };
    
    const logFile = path.join(feedbackDir, 'feedbacks.json');
    let feedbacks = [];
    if (fs.existsSync(logFile)) {
      feedbacks = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    }
    feedbacks.push(feedbackData);
    fs.writeFileSync(logFile, JSON.stringify(feedbacks, null, 2));
    
    return res.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (err: any) {
    console.error('Feedback API Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
});

// ==========================================
// TEST GENERATOR & EXECUTION ENDPOINTS
// ==========================================

/**
 * POST /api/v1/generate-script
 * Generate test script from JSON DSL payload (Requires approved account)
 */
app.post('/api/v1/generate-script', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dsl, dryRun, outPath } = req.body;

    if (!dsl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: dsl'
      });
    }

    const result = await generator.generate(dsl, {
      dryRun: !!dryRun,
      outPath
    });

    if (!result.success) {
      addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Generate Script Failed',
        details: 'Failed due to validation or generation errors'
      });
      return res.status(422).json({
        success: false,
        errors: result.warnings
      });
    }

    addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'Generate Script',
      details: `Generated script for target URL: ${dsl.targetUrl}`
    });

    return res.json({
      success: true,
      code: result.code,
      resolvedSteps: result.resolvedSteps,
      warnings: result.warnings,
      logs: result.logs,
      dryRunPassed: result.dryRunPassed,
      dryRunError: result.dryRunError
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * POST /api/v1/inspect-dom
 * Extract interactive candidate DOM elements from target URL (Requires approved account)
 */
app.post('/api/v1/inspect-dom', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, viewport } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: url'
      });
    }

    const candidates = await extractor.extractCandidates(url, { viewport });

    return res.json({
      success: true,
      url,
      candidateCount: candidates.length,
      candidates
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * Helper to recursively search for generated .webm video files
 */
function findVideoFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const res = findVideoFile(fullPath);
      if (res) return res;
    } else if (file.endsWith('.webm')) {
      return fullPath;
    }
  }
  return null;
}

/**
 * POST /api/v1/run-test
 * Directly execute generated Playwright test code with Concurrency Queue (Max 3 concurrent executions)
 */
app.post('/api/v1/run-test', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, mode = 'headless', language = 'typescript' } = req.body;
    const userId = req.user!.id;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: code'
      });
    }

    // Layer 2: Code Content Validation — block dangerous patterns
    const sanitizeResult = sanitizeCode(code);
    if (!sanitizeResult.safe) {
      addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Run Test Blocked',
        details: `Code rejected: ${sanitizeResult.violations.join('; ')}`
      });
      return res.status(403).json({
        success: false,
        error: 'Submitted code contains blocked patterns that are not allowed for security reasons.',
        violations: sanitizeResult.violations
      });
    }

    // Enqueue task into Concurrency Manager (Max 3 concurrent runs)
    const runResult = await globalTestRunnerQueue.enqueue(async () => {
      const startTime = Date.now();
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-ui-run-'));
      const fileExt = language === 'javascript' ? '.spec.js' : '.spec.ts';
      const testFilePath = path.join(tempDir, `manual_run${fileExt}`);
      const configFilePath = path.join(tempDir, 'playwright.config.ts');

      const isHeaded = mode === 'headed';

      const playwrightConfig = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${tempDir.replace(/\\/g, '/')}',
  outputDir: '${tempDir.replace(/\\/g, '/')}/results',
  use: {
    headless: ${!isHeaded},
    video: 'on',
    launchOptions: {
      slowMo: ${isHeaded ? 1000 : 0}
    },
    viewport: { width: 1280, height: 720 },
  },
});
`;

      fs.writeFileSync(testFilePath, code, 'utf-8');
      fs.writeFileSync(configFilePath, playwrightConfig, 'utf-8');

      let command = `npx playwright test "${testFilePath.replace(/\\/g, '/')}" --config="${configFilePath.replace(/\\/g, '/')}"`;
      if (isHeaded) {
        command += ' --headed';
        if (process.platform === 'linux' && !process.env.DISPLAY) {
          command = `xvfb-run -a ${command}`;
        }
      }

      let logs = '';
      let success = false;
      let videoUrl: string | undefined;

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: process.cwd(),
          env: {
            ...getSanitizedEnv(),
            NODE_PATH: path.join(process.cwd(), 'node_modules')
          }
        });
        logs = stdout || stderr || '[PASS] Test execution completed successfully.';
        success = true;
      } catch (err: any) {
        logs = (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + (err.message || '');
        success = false;
      }

      // Check for video recording artifact if headed or recorded
      try {
        const foundVideo = findVideoFile(tempDir);
        if (foundVideo) {
          const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
          const videosDir = path.join(process.cwd(), 'public', 'videos', sanitizedUserId);
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
          }
          const videoName = `run_${Date.now()}.webm`;
          const destPath = path.join(videosDir, videoName);
          fs.copyFileSync(foundVideo, destPath);
          videoUrl = `/videos/${sanitizedUserId}/${videoName}`;
        }
      } catch (videoErr) {
        console.warn('Video artifact extraction warning:', videoErr);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }

      const durationMs = Date.now() - startTime;
      
      addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Run Test',
        details: `Ran script in ${mode} mode (Status: ${success ? 'Success' : 'Failed'}, Duration: ${durationMs}ms)`
      });

      return {
        success,
        logs: logs.trim(),
        videoUrl,
        durationMs
      };
    });

    return res.json(runResult);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

app.get('/health', (req: Request, res: Response) => {
  const queueStats = globalTestRunnerQueue.getStats();
  res.json({
    status: 'OK',
    message: 'Test Generator API Service active',
    queue: queueStats
  });
});

const host = process.env.HOST || '0.0.0.0';

app.listen(Number(port), host, () => {
  console.log(`Test Generator REST API & Web UI running at http://${host}:${port}`);
});
