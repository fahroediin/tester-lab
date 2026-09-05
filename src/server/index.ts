import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { authRoutes } from './routes/auth-routes.js';
import { adminRoutes } from './routes/admin-routes.js';
import { feedbackRoutes } from './routes/feedback-routes.js';
import { testRoutes } from './routes/test-routes.js';
import { historyRoutes } from './routes/history-routes.js';
import { folderRoutes } from './routes/folder-routes.js';
import { configRoutes } from './routes/config-routes.js';
import { apiKeyRoutes } from './routes/api-key-routes.js';
import { recorderRoutes, proxyAssetMiddleware } from './routes/recorder-routes.js';
import { authenticateJWT, requireAdmin } from './auth-middleware.js';
import { ensureAdminUser } from './auth-store.js';
import { supabase } from './supabase-client.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Serve static assets from public directory. Disable auto-index so a request
// to "/" is NOT served index.html by this middleware; the explicit "/" route
// below serves the landing page instead.
app.use(express.static(path.join(process.cwd(), 'public'), { index: false }));
app.use(express.static(path.join(process.cwd(), 'dist', 'public'), { index: false }));

/**
 * Root Route: Serve the marketing landing page.
 * The landing page itself redirects logged-in visitors to /app (client-side,
 * based on the stored auth token), so returning users skip it.
 */
app.get('/', (req: Request, res: Response) => {
  const landingPath = path.join(process.cwd(), 'public', 'landing.html');
  res.sendFile(landingPath);
});

/**
 * App Route: Serve the interactive workspace (the actual application UI).
 */
app.get('/app', (req: Request, res: Response) => {
  const indexPath = path.join(process.cwd(), 'public', 'index.html');
  res.sendFile(indexPath);
});

/**
 * Admin Route: Serve Dedicated Admin Console Page
 */
app.get('/admin', (req: Request, res: Response) => {
  const adminPath = path.join(process.cwd(), 'public', 'admin.html');
  res.sendFile(adminPath);
});

/**
 * Direct Attachment Access Handler: Redirect to Supabase Storage Signed/Public URL
 */
app.get('/feedbacks/attachments/:filename', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    if (!filename) {
      res.status(404).send('Attachment not found');
      return;
    }

    const { data: signedData, error } = await supabase.storage
      .from('feedback-attachments')
      .createSignedUrl(filename, 3600);
      
    if (!error && signedData?.signedUrl) {
      res.redirect(signedData.signedUrl);
      return;
    }
    
    const { data: urlData } = supabase.storage
      .from('feedback-attachments')
      .getPublicUrl(filename);
      
    if (urlData?.publicUrl) {
      res.redirect(urlData.publicUrl);
      return;
    }

    res.status(404).send('Attachment not found');
  } catch {
    res.status(404).send('Attachment not found');
  }
});

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/history', historyRoutes);
app.use('/api/v1/folders', folderRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/recorder', recorderRoutes);
app.use('/api/v1', testRoutes); // testRoutes has endpoints like /generate-script, /inspect-dom, /run-test directly under /api/v1

// Fallback proxy middleware for target application assets (Next.js chunks, OutSystems assets, styles)
app.use(proxyAssetMiddleware);

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

// Global Error Handler to ensure JSON responses for API errors (e.g. malformed JSON in body-parser)
app.use((err: HttpError, req: Request, res: Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]', err.message || err);
  if (req.path.startsWith('/api/')) {
    res.status(err.status || err.statusCode || 500).json({ 
      success: false, 
      error: err.message || 'Internal Server Error' 
    });
  } else {
    next(err);
  }
});

// API 404 Fallback
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Bootstrap: ensure admin user exists in Supabase, then listen
async function startServer(): Promise<void> {
  try {
    await ensureAdminUser();
    console.log('[Bootstrap] Admin user sync complete.');
  } catch (err: unknown) {
    console.error('[Bootstrap] Failed to sync admin user:', (err as Error).message || err);
  }

  app.listen(port, () => {
    console.log(`Tester Lab backend listening on http://localhost:${port}`);
  });
}

startServer();
