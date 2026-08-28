import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { authRoutes } from './routes/auth-routes.js';
import { adminRoutes } from './routes/admin-routes.js';
import { feedbackRoutes } from './routes/feedback-routes.js';
import { testRoutes } from './routes/test-routes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(process.cwd(), 'dist', 'public')));
app.use('/feedbacks/attachments', express.static(path.join(process.cwd(), 'data', 'feedbacks', 'attachments')));

/**
 * Root Route: Serve Interactive HTML Web UI
 */
app.get('/', (req: Request, res: Response) => {
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

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1', testRoutes); // testRoutes has endpoints like /generate-script, /inspect-dom, /run-test directly under /api/v1

app.listen(port, () => {
  console.log(`Tester Lab backend listening on http://localhost:${port}`);
});
