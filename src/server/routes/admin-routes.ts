import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { authenticateJWT, requireAdmin } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { loadUsers, updateUserStatus, deleteUser } from '../auth-store.js';
import { getLogs, addLog } from '../activity-log-store.js';

export const adminRoutes = Router();

/**
 * GET /api/v1/admin/users
 * List all registration requests (Admin only)
 */
adminRoutes.get('/users', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const users = loadUsers().map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt
  }));

  res.json({
    success: true,
    users
  });
});

/**
 * GET /api/v1/admin/logs
 * List all activity logs (Admin only)
 */
adminRoutes.get('/logs', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 200;
  const logs = getLogs(limit);
  res.json({
    success: true,
    logs
  });
});

/**
 * GET /api/v1/admin/feedbacks
 * List all user feedbacks (Admin only)
 */
adminRoutes.get('/feedbacks', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const feedbackDir = path.join(process.cwd(), 'data', 'feedbacks');
    const logFile = path.join(feedbackDir, 'feedbacks.json');
    
    let feedbacks: unknown[] = [];
    if (fs.existsSync(logFile)) {
      feedbacks = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    }
    
    // Sort newest first
    feedbacks.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    const total = feedbacks.length;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const paginatedFeedbacks = feedbacks.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      feedbacks: paginatedFeedbacks,
      total,
      page,
      limit
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

/**
 * DELETE /api/v1/admin/feedbacks/:id
 * Delete user feedback (Admin only)
 */
adminRoutes.delete('/feedbacks/:id', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const feedbackDir = path.join(process.cwd(), 'data', 'feedbacks');
    const logFile = path.join(feedbackDir, 'feedbacks.json');
    
    if (!fs.existsSync(logFile)) {
      res.status(404).json({ success: false, error: 'Feedbacks not found' });
      return;
    }
    
    const feedbacks: any[] = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    const index = feedbacks.findIndex(f => f.id === id);
    
    if (index === -1) {
      res.status(404).json({ success: false, error: 'Feedback not found' });
      return;
    }
    
    const feedback = feedbacks[index];
    
    // Delete attachment if it exists
    if (feedback.attachment) {
      const attachmentPath = path.join(feedbackDir, 'attachments', feedback.attachment);
      if (fs.existsSync(attachmentPath)) {
        fs.unlinkSync(attachmentPath);
      }
    }
    
    // Remove from array and save
    feedbacks.splice(index, 1);
    fs.writeFileSync(logFile, JSON.stringify(feedbacks, null, 2));
    
    addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'Admin Delete Feedback',
      details: `Deleted feedback ID '${id}'`
    });

    res.json({ success: true, message: 'Feedback deleted successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});


/**
 * POST /api/v1/admin/users/:id/approve
 * Approve user registration request (Admin only)
 */
adminRoutes.post('/users/:id/approve', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const updated = updateUserStatus(id, 'approved');

  if (!updated) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Approve',
    details: `Approved user '${updated.username}'`
  });

  res.json({
    success: true,
    message: `Account '${updated.username}' approved successfully.`,
    user: updated
  });
});

/**
 * POST /api/v1/admin/users/:id/reject
 * Reject user registration request (Admin only)
 */
adminRoutes.post('/users/:id/reject', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const updated = updateUserStatus(id, 'rejected');

  if (!updated) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Reject',
    details: `Rejected user '${updated.username}'`
  });

  res.json({
    success: true,
    message: `Account '${updated.username}' rejected.`,
    user: updated
  });
});

/**
 * DELETE /api/v1/admin/users/:id
 * Delete user account (Admin only)
 */
adminRoutes.delete('/users/:id', authenticateJWT, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const deleted = deleteUser(id);

  if (!deleted) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Delete',
    details: `Deleted user ID '${id}'`
  });

  res.json({
    success: true,
    message: 'User deleted successfully.'
  });
});
